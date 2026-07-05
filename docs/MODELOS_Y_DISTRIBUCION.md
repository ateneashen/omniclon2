# Modelos de IA y distribución de OmniClon 2

> Guía técnica para entender qué modelos necesita la app, dónde van, y cómo preparar una distribución que incluya o descargue esos modelos.

---

## ¿Por qué los modelos no están en el repositorio?

Los pesos de los modelos de voz (por ejemplo `k2-fsa/OmniVoice`) ocupan **varios gigabytes**. GitHub no está diseñado para almacenarlos de forma eficiente y, en muchos casos, no permite subir archivos tan grandes.

Por eso el repositorio solo contiene **código y documentación**. Los modelos deben obtenerse por separado.

---

## Modelos necesarios y opcionales

### Obligatorio para clonación de voz

| Modelo | Repositorio oficial | Carpeta local esperada | Archivo clave que detecta la app |
|--------|---------------------|------------------------|----------------------------------|
| **k2-fsa/OmniVoice** | [Hugging Face](https://huggingface.co/k2-fsa/OmniVoice) | `data/models/k2-fsa_OmniVoice/` | `model.safetensors` |

Sin este modelo, la app arranca, pero el panel de clonación mostrará que el motor principal no está disponible.

### Opcional (TTS alternativo)

| Modelo | Repositorio oficial | Carpeta local esperada |
|--------|---------------------|------------------------|
| **KittenML/kitten-tts-mini-0.8** | [Hugging Face](https://huggingface.co/KittenML/kitten-tts-mini-0.8) | `data/models/KittenML_kitten-tts-mini-0.8/` |

Actualmente la app prioriza `k2-fsa/OmniVoice`. KittenTTS es un respaldo opcional.

---

## Cómo detecta la app los modelos

Al arrancar, el backend (`backend/services/model_manager.py`) escanea `data/models/` y compara lo que encuentra con el catálogo interno (`backend/models/catalog.json`).

La detección no se basa solo en el nombre de la carpeta: también verifica archivos característicos como `config.json`, `.safetensors`, `pytorch_model.bin`, etc.

### Rutas que se consultan

1. **`data/models/`** dentro de la carpeta del proyecto (modo portable/dedicado).
2. Opcionalmente, la carpeta compartida configurada en la pestaña **Models** (por ejemplo, la carpeta de modelos de OmniVoice-Studio2).
3. El caché de Hugging Face (`~/.cache/huggingface/` en Linux/Mac, `%USERPROFILE%\.cache\huggingface\` en Windows).

---

## Preparar la app para distribuir a otra persona

### Opción A: Copiar el ejecutable portable + modelos manualmente

1. Compila la app:
   ```bash
   cd frontend
   npm run tauri build
   ```
2. Copia el ejecutable portable:
   ```
   frontend/src-tauri/target/release/omniclon2.exe
   ```
3. Copia la carpeta de modelos:
   ```
   data/models/k2-fsa_OmniVoice/
   ```
4. En la máquina destino, crea una estructura como esta:
   ```
   OmniClon2/
   ├── omniclon2.exe
   └── data/
       └── models/
           └── k2-fsa_OmniVoice/
   ```
5. Ejecuta `omniclon2.exe`.

> ⚠️ El destino también necesita `ffmpeg` y `ffprobe` en el PATH, además de las dependencias del sistema de Tauri (Visual C++ Redistributable en algunos casos).

### ¿Dónde busca exactamente la app los modelos?

El backend recibe una variable de entorno `OMNICLON2_DATA_DIR` que le dice dónde están los datos. Rust la resuelve en este orden:

1. **Variable de entorno** `OMNICLON2_DATA_DIR` (si existe y apunta a una carpeta válida).
2. **Carpeta de desarrollo** `C:\AI\OmniClon2\data` (solo para desarrollo en esta máquina).
3. **Modo portable** relativo al `.exe`:
   - `<carpeta_del_exe>\..\data` (por si el exe está en `OmniClon2/bin/omniclon2.exe`)
   - `<carpeta_del_exe>\data` (por si el exe está en `OmniClon2/omniclon2.exe`)
4. **Fallback** de Tauri: `%LOCALAPPDATA%\com.omniclon.studio2\data\`

**Ejemplo práctico:**

Si copias el exe a:
```
D:\MisApps\OmniClon2\omniclon2.exe
```

Los modelos deben estar en:
```
D:\MisApps\OmniClon2\data\models\k2-fsa_OmniVoice\
```

O, si prefieres separar el exe de los datos, pon:
```
D:\MisApps\OmniClon2\
├── bin\
│   └── omniclon2.exe
└── data\
    └── models\
        └── k2-fsa_OmniVoice\
```

> ⚠️ **Trampa común:** Si en la máquina existe `C:\AI\OmniClon2\data`, la app usará SIEMPRE esa carpeta en lugar de la `data` que hayas puesto junto al exe. Esto solo pasa en máquinas de desarrollo; en otras PCs no es problema.

### Opción B: Usar el instalador `.exe` o `.msi`

Los instaladores generan el acceso directo y desempaquetan la app en `AppData/Local` o `Program Files`. Sin embargo, **tampoco incluyen los modelos**.

Después de instalar, debes copiar manualmente:
```
data/models/k2-fsa_OmniVoice/
```
A la carpeta de datos de la app instalada (normalmente `%LOCALAPPDATA%\com.omniclon.studio2\data\models\`).

---

## Automatización de copia/distribución de modelos (plan para futuras versiones)

Para evitar que el usuario final tenga que copiar modelos a mano, se pueden implementar varias mejoras progresivas:

### 1. Downloader integrado (recomendado para v1.1.0)

Añadir una pantalla en el primer arranque que permita descargar `k2-fsa/OmniVoice` directamente desde Hugging Face.

**Ventajas:**
- El usuario no necesita saber dónde descargar ni dónde copiar.
- Reduce el tamaño del instalador.
- Mantiene los modelos actualizados.

**Desventajas:**
- Requiere conexión a internet en el primer uso.
- Descargar varios GB puede tardar.

**Implementación sugerida:**
- Extender `backend/services/model_manager.py` con un método `download_model(repo_id)`.
- Usar `huggingface_hub` o descargas directas con progreso.
- Mostrar una barra de progreso en el BootstrapSplash o en un wizard de primera ejecución.
- Persistir el progreso para poder reanudar.

### 2. Empaquetar modelos dentro del instalador

Incluir `data/models/` como recurso del bundle de Tauri para que el instalador los copie automáticamente.

**Ventajas:**
- Experiencia 100% offline tras la instalación.
- El usuario no hace nada manual.

**Desventajas:**
- El instalador pesa varios GB (poco práctico para subir a GitHub Releases).
- Cada nueva versión del modelo requiere recompilar el instalador.

**Implementación sugerida:**
- Configurar `tauri.conf.json > bundle > resources` para incluir `data/models`.
- En runtime, copiar/recolocar los modelos desde los recursos del bundle a la carpeta de datos del usuario.

### 3. Carpeta compartida detectada automáticamente

Si el usuario ya tiene OmniVoice-Studio2 instalado, detectar y usar sus modelos sin copiar nada.

**Ventajas:**
- Ahorra espacio.
- Experiencia inmediata.

**Desventajas:**
- La app depende de que OmniVoice siga instalado.
- No funciona en máquinas sin OmniVoice.

**Estado actual:** ya está implementado en la pestaña **Models** como modo Shared.

### 4. Selector de carpeta de modelos en primer arranque

Durante el primer arranque, preguntar al usuario dónde tiene los modelos (carpeta propia, carpeta de OmniVoice, o descargar).

**Ventajas:**
- Flexible para todos los casos.
- No requiere internet si el usuario ya los tiene.

**Desventajas:**
- Más pantallas de configuración inicial.

---

## Recomendación para la próxima versión

Combinar las opciones **1 + 3 + 4**:

- Si la app detecta modelos locales o de OmniVoice, los usa sin preguntar.
- Si no detecta nada, muestra un wizard con tres opciones:
  1. **Descargar automáticamente** desde Hugging Face (recomendado).
  2. **Seleccionar carpeta** donde ya tengas los modelos.
  3. **Usar carpeta compartida** de OmniVoice-Studio2.

Esto ofrece la mejor experiencia tanto para novatos como para usuarios avanzados.

---

## Notas de seguridad y licencia

- Los modelos de `k2-fsa/OmniVoice` tienen sus propias licencias. Revisa siempre los términos del repositorio oficial antes de redistribuirlos.
- No subas nunca pesos de modelo a GitHub.
- Si incluyes modelos en un instalador, asegúrate de cumplir las licencias correspondientes.
