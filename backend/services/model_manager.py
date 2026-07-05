"""
Model Manager Service — OmniClon 2

Responsable de:
- Cargar y gestionar el catálogo de modelos
- Detectar modelos instalados (shared vs dedicated)
- Persistir la configuración del usuario (ModelConfig)
- Proporcionar operaciones de switch de modo y copia de modelos (Fase B2+)

Esta es la implementación inicial de Fase B1 (Fundación).
"""

from __future__ import annotations

import json
import os
import shutil
import threading
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

# Optional: huggingface_hub is declared as a project dependency.
# It may also be available transitively via transformers.
try:
    from huggingface_hub import snapshot_download, list_repo_files, get_hf_file_metadata
    HF_AVAILABLE = True
except Exception:  # pragma: no cover
    snapshot_download = None  # type: ignore
    list_repo_files = None  # type: ignore
    get_hf_file_metadata = None  # type: ignore
    HF_AVAILABLE = False


# ============================================================
# Modelos Pydantic (equivalentes a los tipos TypeScript)
# ============================================================

ModelRole = Literal["TTS", "ASR", "Diarization", "VoiceClone"]
ModelLocation = Literal["shared", "dedicated", "hf_cache", "missing"]
ModelMode = Literal["shared", "dedicated"]


class ModelInfo(BaseModel):
    repo_id: str
    label: str
    role: ModelRole
    size_gb: float
    installed: bool = False
    location: ModelLocation = "missing"
    path: str | None = None
    last_used: int | None = None


class ModelConfig(BaseModel):
    mode: ModelMode = "shared"
    shared_path: str | None = None
    dedicated_path: str
    preferred_models: list[str] = Field(default_factory=list)


class ModelStatus(BaseModel):
    config: ModelConfig
    models: list[ModelInfo]
    active_root: str
    total_models: int
    installed_models: int
    copy_in_progress: bool = False          # Indica si hay una copia en curso
    last_copy_result: CopyResult | None = None  # Resultado de la última operación de copia (útil para UI)


class CopyResult(BaseModel):
    """Resultado detallado de una operación de copia de modelos."""
    success: bool
    copied: list[str] = Field(default_factory=list)      # repo_ids copiados exitosamente
    failed: dict[str, str] = Field(default_factory=dict) # repo_id -> razón del fallo
    message: str
    total_models_requested: int = 0
    total_copied: int = 0


class DownloadJob(BaseModel):
    """Estado de una descarga de modelo en curso o finalizada."""
    repo_id: str
    status: Literal["pending", "downloading", "completed", "failed"] = "pending"
    progress_percent: float = 0.0
    downloaded_bytes: int = 0
    total_bytes: int | None = None
    message: str = ""
    error: str | None = None


# ============================================================
# ModelManager (clase principal)
# ============================================================

class ModelManager:
    """
    Gestiona todo lo relacionado con modelos para OmniClon 2.
    """

    def __init__(self, data_dir: Path | str):
        self.data_dir = Path(data_dir)
        self.models_dir = self.data_dir / "models"
        self.config_path = self.data_dir / "config" / "models.json"

        # Asegurar carpetas
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        # Cargar catálogo estático
        self._catalog: list[dict] = self._load_catalog()

        # Cargar o crear configuración
        self.config: ModelConfig = self._load_or_create_config()

        # Estado de operaciones largas (para UX elegante en B2+)
        self._copy_in_progress: bool = False
        self._last_copy_result: CopyResult | None = None

        # Estado de descargas en curso (repo_id -> DownloadJob)
        self._downloads: dict[str, DownloadJob] = {}
        self._downloads_lock = threading.Lock()

    # ------------------------------------------------------------
    # Catálogo
    # ------------------------------------------------------------

    def _load_catalog(self) -> list[dict]:
        """Carga el catálogo oficial desde backend/models/catalog.json"""
        # Ruta relativa al backend (cuando se ejecuta desde main.py)
        catalog_path = Path(__file__).parent.parent / "models" / "catalog.json"

        if not catalog_path.exists():
            # Fallback para desarrollo
            catalog_path = Path("backend/models/catalog.json")

        if not catalog_path.exists():
            print(f"[ModelManager] WARNING: Catálogo no encontrado en {catalog_path}")
            return []

        with open(catalog_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("models", [])

    def get_catalog(self) -> list[dict]:
        """Devuelve el catálogo crudo de modelos conocidos."""
        return self._catalog

    def get_catalog_with_status(self) -> list[dict]:
        """
        Devuelve el catálogo enriquecido con información de instalación.
        Útil para UIs que quieren mostrar qué modelos están disponibles vs instalados.
        """
        installed_map = {
            m.repo_id: m for m in self.scan_installed_models()
        }

        enriched = []
        for entry in self._catalog:
            repo_id = entry["repo_id"]
            model_info = installed_map.get(repo_id)

            enriched.append({
                **entry,
                "installed": model_info.installed if model_info else False,
                "location": model_info.location if model_info else "missing",
            })
        return enriched

    # ------------------------------------------------------------
    # Configuración
    # ------------------------------------------------------------

    def _load_or_create_config(self) -> ModelConfig:
        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                    cfg = ModelConfig(**raw)
                    # Autonomy migration: if we are in dedicated mode but still point to an
                    # external OmniVoice shared folder, clear it so the app is self-contained.
                    if cfg.mode == "dedicated" and cfg.shared_path:
                        lowered = cfg.shared_path.lower()
                        if "omnivoice" in lowered:
                            print(f"[ModelManager] Migrating to fully autonomous: clearing shared_path {cfg.shared_path}")
                            cfg.shared_path = None
                            self._save_config(cfg)
                    return cfg
            except Exception as e:
                print(f"[ModelManager] Error cargando config: {e}. Creando nueva.")

        # Fully autonomous default: dedicated mode using the project's own data folder.
        # Shared mode (legacy OmniVoice-Studio2) is available only if the user configures it manually.
        default = ModelConfig(
            mode="dedicated",
            shared_path=None,
            dedicated_path=str(self.models_dir),
            preferred_models=[],
        )
        self._save_config(default)
        return default

    def _save_config(self, config: ModelConfig) -> None:
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(config.model_dump(), f, indent=2, ensure_ascii=False)

    def _detect_shared_path(self) -> str | None:
        """
        Legacy shared path detection.
        OmniClon 2 now defaults to a fully autonomous dedicated folder, but we
        keep the ability to import from an existing OmniVoice-Studio2 install
        if the user explicitly switches to shared mode.
        """
        candidates = [
            r"C:\AI\OmniVoice-Studio2\models",
            r"C:\AI\OmniVoice\models",
            os.path.expandvars(r"%LOCALAPPDATA%\OmniVoice-Studio2\models"),
        ]

        for path in candidates:
            if Path(path).exists():
                return path

        return None

    # ------------------------------------------------------------
    # Detección de modelos (Pulido B1)
    # ------------------------------------------------------------

    def get_active_models_root(self) -> Path:
        if self.config.mode == "dedicated":
            return self.models_dir
        if self.config.shared_path:
            return Path(self.config.shared_path)
        # Fallback a dedicada si no hay shared
        return self.models_dir

    def _looks_like_model_directory(self, path: Path) -> bool:
        """
        Heurística razonable para B1 para determinar si una carpeta contiene un modelo real.
        Busca archivos típicos de modelos de Hugging Face / PyTorch.
        """
        if not path.exists() or not path.is_dir():
            return False

        # Archivos característicos de modelos HF/PyTorch
        model_indicators = [
            "config.json",
            "pytorch_model.bin",
            "model.safetensors",
            "pytorch_model.bin.index.json",
            "config.yaml",
            "model_index.json",   # para algunos pipelines
        ]

        try:
            files = {f.name for f in path.iterdir() if f.is_file()}
        except Exception:
            return False

        # Si tiene al menos uno de los indicadores, lo consideramos un modelo válido
        if any(indicator in files for indicator in model_indicators):
            return True

        # También aceptamos carpetas que tengan subcarpetas con modelos (estructura HF snapshots)
        subdirs = [d for d in path.iterdir() if d.is_dir()]
        for sub in subdirs:
            try:
                sub_files = {f.name for f in sub.iterdir() if f.is_file()}
                if any(indicator in sub_files for indicator in model_indicators):
                    return True
            except Exception:
                continue

        return False

    def scan_installed_models(self) -> list[ModelInfo]:
        """
        Escanea la carpeta activa buscando modelos del catálogo.
        Versión mejorada (B1 polish): verifica presencia real de archivos de modelo.
        """
        active_root = self.get_active_models_root()
        results: list[ModelInfo] = []

        for entry in self._catalog:
            repo_id = entry["repo_id"]
            folder_name = repo_id.split("/")[-1]
            local_folder = entry.get("local_folder")

            # Candidatos comunes. The actual local folder often follows the
            # repo_id with '/' replaced by '_' (e.g. k2-fsa/OmniVoice -> k2-fsa_OmniVoice).
            normalized_name = repo_id.replace("/", "_")
            candidate_paths = []
            if local_folder:
                candidate_paths.append(active_root / local_folder)
            candidate_paths.extend([
                active_root / normalized_name,
                active_root / folder_name,
                active_root / repo_id.replace("/", "--"),           # formato HF cache a veces
                active_root / f"models--{repo_id.replace('/', '--')}",  # nombre completo HF
            ])

            installed = False
            location: ModelLocation = "missing"
            model_path: str | None = None

            for p in candidate_paths:
                if self._looks_like_model_directory(p):
                    installed = True
                    location = "dedicated" if self.config.mode == "dedicated" else "shared"
                    model_path = str(p)
                    break

            # TODO Fase B2/B4: chequear también HF cache real (~/.cache/huggingface/hub)

            model = ModelInfo(
                repo_id=repo_id,
                label=entry["label"],
                role=entry["role"],
                size_gb=entry["size_gb"],
                installed=installed,
                location=location,
                path=model_path,
            )
            results.append(model)

        return results

    def get_model_status(self) -> ModelStatus:
        models = self.scan_installed_models()
        active_root = str(self.get_active_models_root())

        installed_count = sum(1 for m in models if m.installed)

        return ModelStatus(
            config=self.config,
            models=models,
            active_root=active_root,
            total_models=len(models),
            installed_models=installed_count,
            # Información de operaciones (B2+)
            copy_in_progress=self._copy_in_progress,
            last_copy_result=self._last_copy_result,
        )

    # ------------------------------------------------------------
    # Operaciones de configuración (Fase B1/B2)
    # ------------------------------------------------------------

    def update_config(self, updates: dict) -> ModelConfig:
        """Actualiza parcialmente la configuración y la persiste."""
        current = self.config.model_dump()
        current.update(updates)
        self.config = ModelConfig(**current)
        self._save_config(self.config)
        return self.config

    def switch_mode(self, mode: ModelMode) -> ModelConfig:
        """Cambia entre modo shared y dedicated."""
        self.config.mode = mode
        self._save_config(self.config)
        return self.config

    # ============================================================
    # Operación de Copia (Fase B2)
    # ============================================================

    def _get_free_space_gb(self, path: Path) -> float:
        """Devuelve el espacio libre en GB en la unidad del path dado."""
        try:
            usage = shutil.disk_usage(path)
            return usage.free / (1024 ** 3)
        except Exception:
            return -1.0

    def copy_to_dedicated(self, repo_ids: list[str]) -> CopyResult:
        """
        Copia de forma segura y elegante los modelos indicados a la carpeta dedicada.

        Filosofía de esta implementación (B2):
        - 100% no destructiva: nunca borramos nada del origen.
        - El usuario decide qué copiar.
        - Todos los modelos originales de OmniVoice siguen disponibles.
        - Mensajes claros y profesionales para el usuario.
        - Logging detallado por fase (ideal para debugging asistido por IA).
        """
        self._copy_in_progress = True
        self._last_copy_result = None

        try:
            if not repo_ids:
                result = CopyResult(
                    success=False,
                    message="No seleccionaste ningún modelo para copiar.",
                    total_models_requested=0,
                )
                self._last_copy_result = result
                return result

            # In dedicated mode we want to copy FROM the shared path (if any),
            # not from the dedicated folder into itself. In shared mode the active
            # root already points to the shared folder.
            if self.config.mode == "dedicated" and self.config.shared_path:
                source_root = Path(self.config.shared_path)
            else:
                source_root = self.get_active_models_root()
            target_root = self.models_dir

            # === Chequeo previo de espacio en disco (pulido elegante B2) ===
            free_gb = self._get_free_space_gb(target_root)
            if free_gb > 0:
                print(f"[ModelManager] Espacio libre en destino: {free_gb:.1f} GB")
                if free_gb < 5.0:
                    print("[ModelManager] ⚠️ ADVERTENCIA: Queda poco espacio libre. La copia podría fallar.")

            print("\n" + "="*70)
            print(f"[ModelManager] INICIO DE COPIA DE MODELOS")
            print(f"  Modelos solicitados: {len(repo_ids)}")
            print(f"  Origen: {source_root}")
            print(f"  Destino (dedicada): {target_root}")
            if free_gb > 0:
                print(f"  Espacio libre aproximado: {free_gb:.1f} GB")
            print("="*70)

            copied: list[str] = []
            failed: dict[str, str] = {}
            skipped_already_exists: list[str] = []

            target_root.mkdir(parents=True, exist_ok=True)

            for i, repo_id in enumerate(repo_ids, 1):
                print(f"\n[{i}/{len(repo_ids)}] Procesando: {repo_id}")

                # 1. Localizar el modelo en el origen
                folder_name = entry.get("local_folder") or repo_id.split("/")[-1]
                candidates = [
                    source_root / folder_name,
                    source_root / repo_id.replace("/", "_"),
                    source_root / repo_id.replace("/", "--"),
                    source_root / f"models--{repo_id.replace('/', '--')}",
                ]

                source_path = None
                for cand in candidates:
                    if self._looks_like_model_directory(cand):
                        source_path = cand
                        break

                if source_path is None:
                    failed[repo_id] = "No se encontró el modelo en la carpeta de origen."
                    print(f"    → [NO ENCONTRADO] No existe en el origen actual.")
                    continue

                dest_path = target_root / folder_name

                # 2. Verificar si ya existe (idempotente y seguro)
                if dest_path.exists():
                    copied.append(repo_id)  # Lo tratamos como éxito para la UI
                    skipped_already_exists.append(repo_id)
                    print(f"    → [YA EXISTE] El modelo ya está en la carpeta dedicada. Se omite.")
                    continue

                # 3. Copiar (operación no destructiva)
                try:
                    print(f"    → Copiando desde: {source_path}")
                    print(f"    → Destino: {dest_path}")
                    shutil.copytree(source_path, dest_path)
                    copied.append(repo_id)
                    print(f"    → [ÉXITO] Modelo copiado correctamente.")
                except OSError as e:
                    if e.errno == 28:  # No space left on device
                        failed[repo_id] = "No hay suficiente espacio en disco en la carpeta dedicada."
                    else:
                        failed[repo_id] = str(e)
                    print(f"    → [ERROR] Falló la copia: {failed[repo_id]}")
                except Exception as e:
                    failed[repo_id] = str(e)
                    print(f"    → [ERROR] Falló la copia: {failed[repo_id]}")

            # === RESUMEN FINAL (diseñado para ser muy claro y elegante) ===
            total_copied = len(copied)
            total_failed = len(failed)
            total_requested = len(repo_ids)
            already_present = len(skipped_already_exists)

            if total_failed == 0 and already_present == 0:
                message = f"¡Listo! Se copiaron exitosamente los {total_copied} modelos a tu carpeta dedicada."
            elif total_failed == 0 and already_present > 0 and total_copied == already_present:
                message = "Todos los modelos que seleccionaste ya estaban presentes en tu carpeta dedicada."
            elif total_failed == 0:
                message = f"Se copiaron {total_copied} modelos. {already_present} ya estaban en la carpeta dedicada."
            elif total_copied > 0:
                message = (f"Se copiaron {total_copied} de {total_requested} modelos. "
                           f"{total_failed} no se pudieron copiar (revisa los detalles).")
            else:
                message = "No se pudo copiar ningún modelo. Revisa los detalles de los errores más abajo."

            result = CopyResult(
                success=total_failed == 0,
                copied=copied,
                failed=failed,
                message=message,
                total_models_requested=total_requested,
                total_copied=total_copied,
            )

            print("\n" + "="*70)
            print("[ModelManager] RESUMEN DE COPIA")
            print(f"  Solicitados: {total_requested}")
            print(f"  Copiados con éxito: {total_copied}")
            print(f"  Fallidos: {total_failed}")
            print(f"  Mensaje: {message}")
            if failed:
                print("  Detalle de fallos:")
                for rid, reason in failed.items():
                    print(f"    - {rid}: {reason}")
            print("="*70 + "\n")

            self._last_copy_result = result
            return result

        finally:
            self._copy_in_progress = False


    # ============================================================
    # Descarga de modelos desde Hugging Face (v1.1.0)
    # ============================================================

    def start_download(self, repo_id: str) -> DownloadJob:
        """
        Inicia (o reanuda consultando) la descarga de un modelo del catálogo.
        La descarga corre en un hilo para no bloquear el loop de FastAPI.
        """
        if not HF_AVAILABLE:
            return DownloadJob(
                repo_id=repo_id,
                status="failed",
                message="huggingface_hub no está disponible.",
                error="huggingface_hub no está instalado.",
            )

        with self._downloads_lock:
            existing = self._downloads.get(repo_id)
            if existing and existing.status in ("pending", "downloading"):
                return existing
            if existing and existing.status == "completed":
                return existing

            job = DownloadJob(repo_id=repo_id, status="pending", message="Iniciando descarga...")
            self._downloads[repo_id] = job

        thread = threading.Thread(target=self._do_download, args=(repo_id,), daemon=True)
        thread.start()
        return job

    def get_download_progress(self, repo_id: str) -> DownloadJob | None:
        """Devuelve el estado actual de una descarga."""
        with self._downloads_lock:
            job = self._downloads.get(repo_id)
            return job.model_copy() if job else None

    def list_active_downloads(self) -> list[DownloadJob]:
        """Lista todas las descargas conocidas (activas o recientes)."""
        with self._downloads_lock:
            return [job.model_copy() for job in self._downloads.values()]

    def _update_download_job(self, repo_id: str, **kwargs) -> None:
        """Actualiza campos de un DownloadJob de forma thread-safe."""
        with self._downloads_lock:
            job = self._downloads.get(repo_id)
            if job is None:
                return
            data = job.model_dump()
            data.update(kwargs)
            self._downloads[repo_id] = DownloadJob(**data)

    def _estimate_repo_size(self, repo_id: str) -> int | None:
        """Try to estimate total download size from remote file metadata."""
        if not list_repo_files or not get_hf_file_metadata:
            return None
        try:
            files = list_repo_files(repo_id)
            total = 0
            for filename in files:
                try:
                    meta = get_hf_file_metadata(filename, repo_id=repo_id)
                    total += meta.size or 0
                except Exception:
                    continue
            return total if total > 0 else None
        except Exception:
            return None

    def _monitor_download_size(
        self,
        repo_id: str,
        target_dir: Path,
        expected_bytes: int | None,
        stop_event: threading.Event,
    ) -> None:
        """Periodically updates DownloadJob with current folder size."""
        while not stop_event.is_set():
            stop_event.wait(1.5)
            try:
                if not target_dir.exists():
                    continue
                size = sum(
                    f.stat().st_size for f in target_dir.rglob("*") if f.is_file()
                )
                pct = round((size / expected_bytes) * 100, 1) if expected_bytes and expected_bytes > 0 else 0.0
                self._update_download_job(
                    repo_id,
                    downloaded_bytes=size,
                    progress_percent=min(99.0, pct),
                    message=f"Descargando {repo_id} ({self._human_size(size)}"
                            f"{f' / {self._human_size(expected_bytes)}' if expected_bytes else ''})",
                )
            except Exception:
                continue

    @staticmethod
    def _human_size(num_bytes: int) -> str:
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if abs(num_bytes) < 1024.0:
                return f"{num_bytes:.1f} {unit}"
            num_bytes /= 1024.0
        return f"{num_bytes:.1f} PB"

    def _do_download(self, repo_id: str) -> None:
        """Ejecuta la descarga real usando huggingface_hub."""
        catalog_entry = next((m for m in self._catalog if m["repo_id"] == repo_id), None)
        if catalog_entry is None:
            self._update_download_job(
                repo_id,
                status="failed",
                message="Modelo no encontrado en el catálogo.",
                error=f"{repo_id} no está en catalog.json",
            )
            return

        local_folder = catalog_entry.get("local_folder") or repo_id.replace("/", "_")
        target_dir = self.models_dir / local_folder

        self._update_download_job(
            repo_id,
            status="downloading",
            message=f"Descargando {repo_id}...",
            total_bytes=None,
        )

        try:
            # We run the (potentially long) download in this thread and update
            # the job with folder-size progress periodically.
            self._update_download_job(
                repo_id,
                status="downloading",
                message=f"Descargando {repo_id}...",
            )

            # Pre-compute expected total size from remote file metadata when possible.
            expected_bytes = self._estimate_repo_size(repo_id)
            if expected_bytes:
                self._update_download_job(repo_id, total_bytes=expected_bytes)

            # Start a lightweight monitor that reports folder size growth.
            stop_monitor = threading.Event()
            monitor_thread = threading.Thread(
                target=self._monitor_download_size,
                args=(repo_id, target_dir, expected_bytes, stop_monitor),
                daemon=True,
            )
            monitor_thread.start()

            try:
                # snapshot_download descarga todo el repositorio al directorio indicado.
                snapshot_download(
                    repo_id=repo_id,
                    local_dir=str(target_dir),
                    local_dir_use_symlinks=False,
                    resume_download=True,
                )
            finally:
                stop_monitor.set()
                monitor_thread.join(timeout=2.0)

            self._update_download_job(
                repo_id,
                status="completed",
                progress_percent=100.0,
                message=f"{repo_id} descargado correctamente.",
            )
            print(f"[ModelManager] Descarga completada: {repo_id} -> {target_dir}")

        except Exception as e:
            error_msg = str(e)
            print(f"[ModelManager] ERROR descargando {repo_id}: {error_msg}")
            self._update_download_job(
                repo_id,
                status="failed",
                message=f"Error descargando {repo_id}.",
                error=error_msg,
            )
