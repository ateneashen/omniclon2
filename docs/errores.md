# OmniClon 2 — Log de Errores y Soluciones

Registro de fallos encontrados durante la auditoría y mejora del 2026-06-18.

## 2026-06-18 — Auditoría de autonomía y flujo core

### 1. ModelManager no detectaba el modelo dedicado

**Síntoma:** El ModelsPanel mostraba `k2-fsa/OmniVoice` como no instalado aunque los pesos existían en `data/models/k2-fsa_OmniVoice`.

**Causa:** `scan_installed_models()` buscaba carpetas derivadas del `repo_id` (`OmniVoice`, `k2-fsa--OmniVoice`, `models--k2-fsa--OmniVoice`) pero la carpeta real usa el patrón `k2-fsa_OmniVoice`.

**Solución:**
- Añadir candidato `repo_id.replace("/", "_")`.
- Añadir soporte para campo opcional `local_folder` en `catalog.json`.

**Archivos:** `backend/services/model_manager.py`, `backend/models/catalog.json`

---

### 2. Dependencia runtime de `C:\AI\OmniVoice-Studio2`

**Síntoma:** El backend y el model manager seguían usando rutas de OmniVoice-Studio2 como fallback/shared path por defecto.

**Causa:** `_load_or_create_config()` llamaba `_detect_shared_path()` y `voice_cloning.py` tenía un `legacy_path` hardcodeado.

**Solución:**
- Default `shared_path=None`.
- Migración automática: si `mode=='dedicated'` y `shared_path` apunta a una ruta con "omnivoice", se limpia.
- Eliminar `legacy_path` de `voice_cloning.py`.

**Archivos:** `backend/services/model_manager.py`, `backend/services/voice_cloning.py`

---

### 3. `copy_to_dedicated` copiaba de dedicada a dedicada

**Síntoma:** En modo dedicado, la operación de copia usaba la misma carpeta como origen y destino, sin efecto útil.

**Causa:** `source_root = self.get_active_models_root()` devolvía `models_dir` en modo dedicado.

**Solución:** Usar `self.config.shared_path` como origen cuando se copia a dedicada; si no existe, devolver error claro.

**Archivo:** `backend/services/model_manager.py`

---

### 4. Catálogo desactualizado

**Síntoma:** `k2-fsa/KittenTTS` no correspondía al modelo real disponible (`KittenML/kitten-tts-mini-0.8`).

**Solución:** Actualizar `catalog.json` con repo_ids y carpetas locales reales.

**Archivo:** `backend/models/catalog.json`

---

### 5. Sin controles de afinación de OmniVoice en la UI

**Síntoma:** El usuario no podía ajustar speed, num_step, guidance_scale, denoise, etc.

**Solución:**
- Extender `GenerationRequest` y `VoiceCloningService.generate()` con todos los parámetros de `OmniVoice.generate()`.
- Añadir endpoint `/voice/generate_options` y comando Tauri `get_generate_options`.
- Rehacer `VoicePanel.tsx` con controles deslizantes, checkboxes y opciones avanzadas.

**Archivos:** `backend/services/voice_cloning.py`, `backend/main.py`, `frontend/src-tauri/src/lib.rs`, `frontend/src/components/panels/VoicePanel.tsx`, `frontend/src/types/index.ts`

---

### 6. Export/guardado limitado

**Síntoma:** Solo existía "Download" de base64; no se podía elegir ruta para guardar en ComfyUI.

**Solución:** Añadir botón "Save as…" usando `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`. Añadir permiso `fs:write-all`.

**Archivos:** `frontend/src/components/panels/VoicePanel.tsx`, `frontend/src-tauri/capabilities/default.json`

---

### 7. Ruta de salida dependía del CWD del backend

**Síntoma:** El WAV generado se guardaba en `backend/generated/`.

**Solución:** Guardar siempre en `PROJECT_ROOT/data/generations/` con nombre descriptivo.

**Archivo:** `backend/services/voice_cloning.py`

---

### 8. Proxy HTTP del sistema rompía conexión localhost

**Síntoma:** En este PC, `HTTP_PROXY`/`HTTPS_PROXY` apuntan a `127.0.0.1:56666`. `ureq` intentaba proxyar el tráfico a `127.0.0.1:17493` y devolvía 502.

**Solución:**
- Configurar `NO_PROXY=127.0.0.1,localhost` y `no_proxy=127.0.0.1,localhost` al inicio de `run()` en Rust.
- El launcher `.bat` ya lo hacía; ahora la app empaquetada también es resistente.

**Archivo:** `frontend/src-tauri/src/lib.rs`

---

### 9. Re-lanzamiento fallaba si un backend anterior ocupaba el puerto

**Síntoma:** Si un proceso backend anterior seguía corriendo, el nuevo lanzamiento fallaba al intentar re-bind en el puerto.

**Solución:** `spawn_backend()` ahora verifica `is_backend_healthy()` antes de lanzar; si ya hay un backend sano, lo adopta.

**Archivo:** `frontend/src-tauri/src/backend.rs`

---

### 10. Corte A/B no usaba seek-before-input

**Síntoma:** `extract_segment` podía producir cortes menos limpios en ciertos archivos.

**Solución:** Reordenar argumentos ffmpeg para poner `-ss` y `-t` antes de `-i`.

**Archivo:** `frontend/src-tauri/src/commands/media.rs`
