<div align="center">

# OmniClon 2 — Voice Clone Studio

**Clonación profesional de voz con flujo A/B Roll sobre vídeo.**

[![Versión](https://img.shields.io/badge/version-v1.1.1-00b4d8)](https://github.com/ateneashen/omniclon2)
[![Licencia](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Plataformas](https://img.shields.io/badge/platform-Windows-blue.svg)](#)
[![Python](https://img.shields.io/badge/python-3.11%2B-yellow.svg)](https://www.python.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8?logo=tauri)](https://tauri.app/)

</div>

---

> 🇪🇸 **Español** (principal) | 🇬🇧 [English below](#english)

> 👶 **¿Eres novato?** Empieza por la [Guía de usuario paso a paso](docs/GUIA_USUARIO.md) en lugar de este README técnico.

---

## ¿Qué es OmniClon 2?

**OmniClon 2** es una aplicación de escritorio para clonar voces a partir de vídeo. Su flujo de trabajo estrella es el **A/B Roll**:

1. Arrastra un vídeo con el personaje/altavoz deseado.
2. Marca con precisión la región A/B que contiene la voz de referencia.
3. Escribe el texto que quieres que diga.
4. Genera audio clonado en alta calidad y expórtalo como WAV.

Esta versión **v1.0.0** es la primera release estable: incluye el flujo completo de importación → segmentación → clonación → exportación, gestión de modelos autónoma y un panel de diagnóstico para desarrollo.

## Características principales

- 🎬 **Editor de vídeo integrado** con waveform real, timeline estilo NLE y preview sincronizado.
- 🎯 **A/B Roll preciso**: handles arrastrables, atajos de teclado (`I`/`O`, espacio, flechas), loop A/B.
- 🗣️ **Clonación zero-shot** con `k2-fsa/OmniVoice` (pesos descargados por el usuario).
- 🎛️ **Controles de generación**: velocidad, pasos, guidance scale, denoise, post-proceso, idioma, duración, etc.
- 📚 **Biblioteca de guiones/scripts** con snapshots completos (texto, A/B, transcripción, pistas y opciones de voz).
- 📸 **Captura de frames** desde el vídeo.
- 🧠 **Gestión de modelos**: modo compartido o carpeta dedicada, con copia no destructiva.
- 🔧 **Panel de diagnóstico** y logs estructurados para desarrollo y soporte.
- 💾 **Exportación directa** a WAV con "Guardar como…".

## Capturas de pantalla

> Añade aquí tus capturas en `docs/screenshots/` y enlázalas:
>
> ```markdown
> ![Interfaz principal](docs/screenshots/main-ui.png)
> ![Panel de voz](docs/screenshots/voice-panel.png)
> ```

## Requisitos previos

Antes de compilar o ejecutar en modo desarrollo necesitas instalar **por tu cuenta**:

| Herramienta | Versión recomendada | Para qué sirve |
|-------------|---------------------|----------------|
| [Node.js](https://nodejs.org/) (LTS) | 20.x o superior | Frontend (Vite + React) |
| [npm](https://www.npmjs.com/) | Incluido con Node.js | Gestión de paquetes frontend |
| [Rust](https://www.rust-lang.org/tools/install) | Última estable | Tauri (shell nativa, proceso backend) |
| [Python](https://www.python.org/) | 3.11 o superior | Backend de ML con FastAPI |
| [uv](https://docs.astral.sh/uv/) | Última estable | Gestión del entorno Python (recomendado) |
| [ffmpeg](https://ffmpeg.org/download.html) + ffprobe | Última estable | Extracción de audio, waveform, capturas de frame |

> ⚠️ **Asegúrate de que `node`, `npm`, `cargo`, `uv`, `ffmpeg` y `ffprobe` estén en tu `PATH`.**

## Modelos que debes descargar tú mismo

**Este repositorio NO incluye pesos de modelos de IA** por su tamaño (varios GB). Debes descargarlos por tu cuenta y colocarlos en la carpeta correcta.

### Modelo principal de clonación (obligatorio)

- **k2-fsa/OmniVoice** — motor zero-shot de clonación de voz.
- Descarga los pesos desde el repositorio oficial de Hugging Face: [`k2-fsa/OmniVoice`](https://huggingface.co/k2-fsa/OmniVoice).
- Colócalos en:
  ```
  data/models/k2-fsa_OmniVoice/
  ```
- La app detectará automáticamente `data/models/k2-fsa_OmniVoice/model.safetensors` y otros archivos esenciales.

### Modelo alternativo de TTS (opcional)

- **KittenML/kitten-tts-mini-0.8** — TTS alternativo ligero.
- Repositorio: [`KittenML/kitten-tts-mini-0.8`](https://huggingface.co/KittenML/kitten-tts-mini-0.8).
- Colócalo en:
  ```
  data/models/KittenML_kitten-tts-mini-0.8/
  ```

### Modo compartido con OmniVoice-Studio2

Si ya tienes **OmniVoice-Studio2** instalado, puedes configurar OmniClon 2 para leer sus modelos sin duplicar espacio. Ve a la pestaña **Models** y activa el modo **Shared** apuntando a la carpeta de modelos de OmniVoice.

## Instalación rápida (desarrollo)

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/ateneashen/omniclon2.git
   cd omniclon2
   ```

2. **Descarga los pesos del modelo** (ver sección anterior) y colócalos en `data/models/`.

3. **Instala dependencias del frontend:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Sincroniza el entorno Python del backend:**
   ```bash
   cd backend
   uv sync
   cd ..
   ```

5. **Ejecuta en modo desarrollo** (Windows):
   - Haz doble clic en **`OmniClon2-Launcher.bat`** y elige la opción **1**.
   - O desde terminal:
     ```bash
     cd frontend
     npm run tauri dev
     ```

## Cómo usar el flujo básico

1. **Pestaña Media:** arrastra o selecciona un vídeo con la voz de referencia.
2. **Timeline:** marca el punto **A** (inicio) y el punto **B** (fin) de la región con voz clara.
3. **Panel derecho (Voice & Cloning):** pulsa **"Export A-B as Voice Reference"**.
4. Escribe el texto que quieres clonar.
5. Ajusta opciones de generación si lo deseas (velocidad, pasos, idioma…).
6. Pulsa **Generate** y espera el resultado.
7. Reproduce el audio generado o guárdalo con **"Save as…"**.

## Compilar una versión de distribución

Para generar el `.exe`/`.msi` instalable:

```bash
cd frontend
npm run tauri build
```

Los artefactos aparecerán en:
```
frontend/src-tauri/target/release/bundle/
```

> Requiere que los pesos del modelo estén en `data/models/` para que la app funcione tras la instalación.

## Estructura del proyecto

```
OmniClon2/
├── backend/              # FastAPI + PyTorch (uv)
│   ├── services/         # voice_cloning, model_manager, ffmpeg_utils...
│   ├── models/           # catalog.json (no incluye pesos)
│   └── main.py
├── frontend/             # Tauri 2 + React 19 + TypeScript + Tailwind
│   ├── src/              # UI, stores, hooks, lib
│   └── src-tauri/        # Rust (ciclos de vida, comandos nativos)
├── data/                 # Datos de usuario (NO se sube a git)
│   ├── models/           # pesos descargados por el usuario
│   ├── voices/           # perfiles de voz guardados
│   ├── generations/      # audios generados
│   └── temp/
├── docs/                 # Arquitectura, ADRs, progreso
├── scripts/              # Utilidades y tests
├── logs/                 # Logs de ejecución (NO se suben a git)
├── OmniClon2-Launcher.bat
└── README.md
```

## Distribución y modelos

Para entender cómo empaquetar la app con los modelos de IA, opciones de descarga automática, y cómo preparar una distribución para otros usuarios, consulta [`docs/MODELOS_Y_DISTRIBUCION.md`](docs/MODELOS_Y_DISTRIBUCION.md).

Resumen rápido:
- El repo **no incluye pesos de modelo**.
- Para distribuir la app, copia también `data/models/k2-fsa_OmniVoice/` junto al ejecutable.
- En futuras versiones se planea un downloader integrado desde el primer arranque.

## Licencia

[MIT](LICENSE) © OmniClon Team.

## Créditos

- Motor de clonación basado en [**k2-fsa/OmniVoice**](https://huggingface.co/k2-fsa/OmniVoice).
- Arquitectura híbrida inspirada en el ecosistema OmniVoice-Studio2.
- UI construida con [Tauri](https://tauri.app/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/) y [Lucide icons](https://lucide.dev/).

---

<a id="english"></a>
<div align="center">

## 🇬🇧 English

</div>

**OmniClon 2** is a desktop application for voice cloning from video. Its signature workflow is the **A/B Roll**:

1. Drag a video with the target speaker.
2. Mark the A/B region containing the reference voice.
3. Type the text you want the voice to say.
4. Generate high-quality cloned audio and export it as WAV.

This **v1.0.0** release is the first stable version: full import → segmentation → cloning → export flow, autonomous model management, and a diagnostics panel for development.

### Key features

- 🎬 Integrated video editor with real waveform, NLE-style timeline, and synced preview.
- 🎯 Precise A/B Roll: draggable handles, keyboard shortcuts (`I`/`O`, space, arrows), A/B loop.
- 🗣️ Zero-shot voice cloning with `k2-fsa/OmniVoice` (weights downloaded by the user).
- 🎛️ Generation controls: speed, steps, guidance scale, denoise, postprocess, language, duration, etc.
- 📚 Script library with full snapshots (text, A/B, transcription, tracks, voice options).
- 📸 Frame capture from video.
- 🧠 Model management: shared or dedicated folder with non-destructive copy.
- 🔧 Diagnostics panel and structured logs.
- 💾 Direct WAV export with "Save as…".

### What you need to install yourself

| Tool | Recommended version | Purpose |
|------|---------------------|---------|
| [Node.js](https://nodejs.org/) LTS | 20+ | Frontend (Vite + React) |
| [npm](https://www.npmjs.com/) | Bundled with Node.js | Frontend package manager |
| [Rust](https://www.rust-lang.org/tools/install) | Latest stable | Tauri native shell & backend process |
| [Python](https://www.python.org/) | 3.11+ | FastAPI ML backend |
| [uv](https://docs.astral.sh/uv/) | Latest stable | Python environment manager (recommended) |
| [ffmpeg](https://ffmpeg.org/download.html) + ffprobe | Latest stable | Audio extraction, waveform, frame capture |

> ⚠️ Make sure `node`, `npm`, `cargo`, `uv`, `ffmpeg`, and `ffprobe` are available in your `PATH`.

### Models you must download yourself

**This repository does NOT include AI model weights** due to size (several GB). Download them yourself and place them in the correct folder.

**Primary cloning model (required):**
- **k2-fsa/OmniVoice** — zero-shot voice cloning engine.
- Download from the official Hugging Face repo: [`k2-fsa/OmniVoice`](https://huggingface.co/k2-fsa/OmniVoice).
- Place in:
  ```
  data/models/k2-fsa_OmniVoice/
  ```

**Alternative TTS model (optional):**
- **KittenML/kitten-tts-mini-0.8** — lightweight alternative TTS.
- [`KittenML/kitten-tts-mini-0.8`](https://huggingface.co/KittenML/kitten-tts-mini-0.8).
- Place in:
  ```
  data/models/KittenML_kitten-tts-mini-0.8/
  ```

### Quick start (development)

```bash
git clone https://github.com/ateneashen/omniclon2.git
cd omniclon2

# Download model weights into data/models/

cd frontend
npm install
cd ../backend
uv sync
cd ../frontend
npm run tauri dev
```

Or simply double-click **`OmniClon2-Launcher.bat`** and choose option **1** on Windows.

### Build release

```bash
cd frontend
npm run tauri build
```

Artifacts will be in `frontend/src-tauri/target/release/bundle/`.

### License

[MIT](LICENSE) © OmniClon Team.
