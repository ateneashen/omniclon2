# Diseño del Sistema de Gestión de Modelos — OmniClon 2

**Estado:** Aprobado  
**Fecha de aprobación:** 2026-06 (sesión actual)  
**Autor:** Grok + Usuario  
**Prioridad:** Alta (Requisito original + autonomía profesional)

---

## 1. Objetivos y Requisitos

### Objetivo Principal
Permitir que OmniClon 2 utilice los mismos modelos de alto rendimiento que OmniVoice-Studio2 (k2-fsa/OmniVoice, KittenTTS, etc.), manteniendo la máxima autonomía posible sin duplicar gigabytes innecesariamente.

### Requisitos Obligatorios
- **Compartición inteligente**: Por defecto, usar la carpeta de modelos de OmniVoice (`C:\AI\OmniVoice-Studio2\models` o equivalente) para ahorrar espacio.
- **Autonomía total opcional**: El usuario debe poder copiar/migrar los modelos necesarios a una carpeta propia de OmniClon2 (`%LOCALAPPDATA%\OmniClon2\models` o modo portable `./data/models`).
- **Detección automática**: La aplicación debe detectar automáticamente qué modelos están disponibles (tanto en modo compartido como dedicado).
- **Descarga y gestión**: Soporte para descargar nuevos modelos desde Hugging Face (siguiendo el catálogo de OmniVoice).
- **Portabilidad**: La aplicación debe funcionar correctamente aunque se mueva de carpeta o de máquina (modo portable).
- **Uso de PyTorch**: Todo el manejo pesado de modelos debe ir a través del backend Python (con PyTorch), siguiendo la misma arquitectura que OmniVoice.
- **Experiencia profesional**: UI clara que explique el estado actual ("Usando modelos compartidos de OmniVoice" / "Usando carpeta dedicada"), con acciones explícitas ("Copiar modelos necesarios a carpeta propia").

### Requisitos No Funcionales
- No duplicar modelos grandes innecesariamente.
- Buen rendimiento en primera ejecución.
- Excelente logging diagnóstico (usar el sistema ya existente).
- Fácil de mantener y extender cuando aparezcan nuevos modelos.

---

## 2. Arquitectura Propuesta

### 2.1 Modelo de Datos

```ts
interface ModelInfo {
  repo_id: string;           // "k2-fsa/OmniVoice"
  label: string;
  role: "TTS" | "ASR" | "Diarization" | "VoiceClone";
  size_gb: number;
  installed: boolean;        // ¿existe en la carpeta activa?
  location: "shared" | "dedicated" | "hf_cache";
  path?: string;             // ruta absoluta si está instalado
  last_used?: number;
}

interface ModelConfig {
  mode: "shared" | "dedicated";
  shared_path?: string;      // ruta a la carpeta de OmniVoice
  dedicated_path: string;    // siempre la carpeta propia de OmniClon2
  preferred_models: string[]; // repos que el usuario quiere tener locales
}
```

### 2.2 Flujo de Detección (Startup)

1. Cargar `ModelConfig` (desde `config/models.json` o similar en la carpeta de datos).
2. Determinar carpeta activa:
   - Si `mode === "shared"` → usar `shared_path`
   - Si `mode === "dedicated"` → usar `dedicated_path`
3. Escanear la carpeta activa + HF cache + carpeta local de OmniClon.
4. Comparar contra el catálogo (`models/catalog.yaml` o copia del de OmniVoice).
5. Devolver lista de `ModelInfo` al frontend.

### 2.3 Ubicaciones de Modelos

| Modo          | Carpeta por defecto                              | Ventajas                          | Desventajas                     |
|---------------|--------------------------------------------------|-----------------------------------|---------------------------------|
| **Shared**    | `C:\AI\OmniVoice-Studio2\models` (configurable) | Sin duplicación                   | Depende de que exista OmniVoice |
| **Dedicated** | `%LOCALAPPDATA%\OmniClon2\models` o `./data/models` (portable) | Total autonomía | Duplica espacio si se copia todo |

---

## 3. Flujo de Usuario (UX)

### Primera Ejecución / Bootstrap

- El splash detecta si hay modelos disponibles.
- Muestra claramente:
  ```
  Modelos: 12/18 disponibles (usando carpeta compartida de OmniVoice)
  ```
- Botones recomendados:
  - "Continuar con modelos compartidos" (rápido)
  - "Copiar modelos esenciales a carpeta propia" (recomendado para autonomía)
  - "Configurar rutas manualmente"

### Configuración (Settings → Models)

- Toggle principal: **Modo de Modelos**
  - [ ] Usar carpeta compartida de OmniVoice
  - [ ] Usar carpeta dedicada de OmniClon 2

- Tabla de modelos con columnas:
  - Nombre / Repo
  - Rol
  - Tamaño
  - Estado (Disponible / Falta / Descargando)
  - Ubicación actual
  - Acciones (Descargar / Eliminar / Copiar a dedicada)

- Acciones globales:
  - "Copiar todos los modelos que uso a carpeta dedicada"
  - "Limpiar modelos no utilizados"
  - "Añadir modelo personalizado (HF repo)"

---

## 4. Estructura de Código Propuesta

### Python Backend (recomendado)

```python
# backend/services/model_manager.py

class ModelManager:
    def get_active_models_root(self) -> Path
    def scan_installed_models(self) -> list[ModelInfo]
    def get_catalog(self) -> list[dict]
    def ensure_model(self, repo_id: str) -> Path   # descarga si hace falta
    def copy_to_dedicated(self, repo_ids: list[str]) -> None
    def switch_mode(self, mode: Literal["shared", "dedicated"])
```

### Rust / Tauri

- Comandos:
  - `get_model_status()`
  - `switch_model_mode(mode)`
  - `copy_models_to_dedicated(repo_ids)`
  - `download_model(repo_id)` (con progreso vía eventos)

### Frontend

- `src/stores/modelStore.ts`
- `src/components/models/ModelManagerPanel.tsx`
- Integración en el BootstrapSplash (mostrar estado de modelos críticos)

---

## 5. Decisiones de Diseño — Aprobadas para Fase B1

| Decisión | Decisión final | Justificación |
|----------|----------------|---------------|
| ¿Dónde vive el catálogo? | `backend/models/catalog.json` (dentro del repositorio) | Fácil de versionar, mantener y revisar. Formato JSON simple. Más adelante se puede añadir mecanismo de sincronización desde OmniVoice. |
| ¿Cómo detectar "modelos usados por el usuario"? | `preferred_models: string[]` en `ModelConfig` + modelos físicamente presentes | Suficiente para MVP. El usuario puede marcar qué modelos quiere priorizar (útil para "Copiar a dedicada"). |
| ¿Soporte para modelos fine-tuned / custom? | Solo modelos del catálogo oficial en Fases B1-B3 | Se pospone a **Fase B4**. |
| Progreso de descarga | Polling simple del estado en Fases B1-B3 | Suficiente para empezar. Eventos Tauri reales de progreso se implementarán en **Fase B4**. |

---

## 6. Próximos Pasos (Implementación)

Ahora que el diseño está **aprobado**, seguimos el plan por fases:

- **Fase B1 – Fundación** (actual): Tipos, catálogo, persistencia, detección básica y primeros comandos.
- **Fase B2 – Backend y Comandos**: Servicio Python completo + switch mode + copy.
- **Fase B3 – UI y Experiencia**: Panel de modelos + integración en splash/settings.
- **Fase B4 – Descarga y Pulido**: Descargas con progreso + modelos personalizados.

**Este documento es ahora la fuente de verdad oficial** para la implementación de la gestión de modelos en OmniClon 2.

---

**Inicio de implementación:** Sesión actual — arrancamos Fase B1.

---

## Estado de Implementación (actualizado)

### Fase B1 – Fundación (Completada)

| Componente | Estado | Notas |
|------------|--------|-------|
| Modelos de datos (`ModelInfo`, `ModelConfig`) | ✅ | TypeScript + Pydantic |
| Catálogo oficial | ✅ | `backend/models/catalog.json` + endpoint `/models/catalog` |
| Persistencia de configuración | ✅ | `config/models.json` en carpeta de datos |
| Detección de modelos | ✅ Mejorada | Heurística con verificación de archivos reales (`config.json`, `.safetensors`, etc.) |
| Servicio Python (`ModelManager`) | ✅ | Lógica base + switch de modo |
| Endpoints FastAPI | ✅ | `/models/status`, `/models/config`, `/models/switch_mode`, `/models/catalog` |
| Comandos Tauri | ✅ | 4 comandos implementados y registrados |
| Store Zustand (`modelStore.ts`) | ✅ | `fetchStatus`, `fetchCatalog`, `switchMode` |
| Pruebas y validación | ✅ | Compilación limpia + tests manuales |

### Fase B2 – Lógica de Copia (Completada)

| Componente | Estado | Notas |
|------------|--------|-------|
| Operación `copy_to_dedicated` | ✅ | 100% no destructiva, el usuario elige qué copiar |
| Chequeo de espacio en disco | ✅ | Advertencia previa + manejo elegante de "sin espacio" |
| `CopyResult` detallado | ✅ | Lista de copiados + fallidos + mensaje claro y elegante |
| Estado de operación (`isCopying` + `last_copy_result`) | ✅ | Expuesto en `ModelStatus` |
| Logging y mensajes | ✅ | Muy detallado y profesional |
| Comandos Tauri + Store | ✅ | `copy_models_to_dedicated` + `copyToDedicated` + `isCopying` |

**Próxima fase:** Fase B3 – UI real del panel de gestión de modelos.