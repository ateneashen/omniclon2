# Guía de usuario para novatos — OmniClon 2 v1.0.1

> Esta guía está escrita con lenguaje sencillo. Si ya eres desarrollador, consulta el `README.md` principal.

---

## ¿Qué es esta app?

**OmniClon 2** clona una voz a partir de un vídeo. Tú le das un vídeo donde alguien habla, eliges un trozo de audio limpio, escribes un texto y la app genera un archivo de audio `.wav` con esa voz diciendo el texto.

El flujo es:

```
Vídeo → eliges región A/B → la app aprende la voz → escribes texto → genera audio → guardas WAV
```

---

## Cómo comprobar que el proyecto está bien subido a GitHub

Abre esta URL en tu navegador:

```
https://github.com/ateneashen/omniclon2
```

Deberías ver:

1. **Arriba a la izquierda** el nombre del repositorio: `ateneashen / omniclon2`.
2. **En medio** una lista de carpetas y archivos (`backend`, `frontend`, `README.md`, `LICENSE`, etc.).
3. **Abajo** el contenido del `README.md` con los badges y las instrucciones.
4. **A la derecha** una sección llamada **Releases** con la etiqueta `v1.0.0`.

Si falta alguna de esas cosas, avísame.

---

## Cómo ejecutar la app

### Antes de nada: ¿qué necesitas tener?

En tu PC ya deberías tener instalado:

- **Node.js** (para el frontend).
- **Rust** (para la ventana de escritorio).
- **Python + uv** (para la inteligencia artificial del backend).
- **ffmpeg y ffprobe** (para cortar audio y vídeo).
- El modelo **k2-fsa/OmniVoice** dentro de `C:\AI\OmniClon2\data\models\k2-fsa_OmniVoice\`.

Si alguno falta, la app no arrancará. Puedes comprobarlo abriendo una terminal y escribiendo:

```bash
node --version
npm --version
cargo --version
uv --version
ffmpeg -version
```

Si alguno dice "no se reconoce como comando", hay que instalarlo.

---

### Opción A: Doble clic en el lanzador (la más fácil)

1. Abre el Explorador de archivos.
2. Ve a la carpeta `C:\AI\OmniClon2`.
3. Haz **doble clic** en **`OmniClon2-Launcher.bat`**.
4. Aparecerá una ventana negra (consola) con un menú.
5. Escribe `1` y pulsa `Intro`.
6. Espera. La primera vez puede tardar varios minutos porque compila código Rust.
7. Se abrirá la ventana de **OmniClon 2**. Arriba verás el nombre y la versión `v1.0.1`.

Para cerrar, cierra la ventana de la app o la consola negra.

---

### Opción B: Desde la terminal (más control)

1. Abre **Git Bash** o **PowerShell**.
2. Escribe estos comandos uno por uno, pulsando `Intro` después de cada uno:

```bash
cd /c/AI/OmniClon2/frontend
npm run tauri dev
```

3. Espera a que compile y se abra la ventana.

---

## Mini guía de uso paso a paso

Cuando la app esté abierta, sigue estos pasos:

### 1. Carga un vídeo

- Ve a la pestaña **Media** (izquierda).
- Arrastra un vídeo a la zona de drop, o usa el botón para seleccionarlo.
- Espera unos segundos a que se cargue el waveform (la onda de audio).

### 2. Elige la región A/B (la voz de referencia)

- Reproduce el vídeo con el botón de **Play** (o la barra espaciadora).
- Cuando escuches una frase clara y limpia:
  - Pulsa la tecla **`I`** para marcar el punto **A** (inicio).
  - Pulsa la tecla **`O`** para marcar el punto **B** (fin).
- También puedes arrastrar los corchetes `[ ]` que aparecen en el timeline.

> Consejo: elige un trozo de **4 a 10 segundos** donde solo hable una persona y no haya ruido de fondo.

### 3. Exporta la referencia de voz

- En el panel derecho, en **Voice & Cloning**, pulsa el botón:
  **“Export A-B as Voice Reference”**.
- La app guardará ese trozo como referencia.

### 4. Escribe el texto

- En el mismo panel derecho, escribe en el cuadro de texto lo que quieres que diga la voz.

### 5. Ajusta opciones (opcional)

- Puedes cambiar:
  - **Speed**: velocidad de habla.
  - **Language**: idioma.
  - **Num steps**, **Guidance scale**, **Denoise**: opciones avanzadas de calidad.
- Si no sabes qué poner, déjalo en los valores por defecto.

### 6. Genera el audio

- Pulsa el botón **Generate**.
- Espera. El tiempo depende de tu GPU/CPU y de la longitud del texto.
- Cuando termine, aparecerá el audio generado.

### 7. Escucha y guarda

- Pulsa **Play** para escuchar el resultado.
- Si te gusta, pulsa **Save as…** y elige dónde guardar el archivo `.wav`.

---

## Atajos de teclado útiles

| Tecla | Acción |
|-------|--------|
| `Espacio` | Reproducir / Pausar |
| `I` | Marcar punto A |
| `O` | Marcar punto B |
| `L` | Activar/desactivar bucle A/B |
| `←` / `→` | Retroceder / avanzar 1 segundo |
| `Home` | Ir al inicio |
| `End` | Ir al final |
| `R` | Ir al punto A |

---

## Si algo no funciona

### La app no se abre

- Revisa la ventana negra del launcher. Si hay texto rojo o un error, haz una captura de pantalla y envíamela.
- Comprueba que tienes instalado todo lo de la sección de requisitos.

### No detecta el modelo de voz

- Comprueba que existe este archivo:
  ```
  C:\AI\OmniClon2\data\models\k2-fsa_OmniVoice\model.safetensors
  ```
- Si no está, descarga los pesos de `k2-fsa/OmniVoice` en Hugging Face y colócalos ahí.
- **Si copiaste el `.exe` a otra carpeta**, la app busca los modelos en una carpeta `data` junto al exe. Es decir, si tu exe está en:
  ```
  D:\MisApps\OmniClon2\omniclon2.exe
  ```
  los modelos deben estar en:
  ```
  D:\MisApps\OmniClon2\data\models\k2-fsa_OmniVoice\
  ```
- Para más detalles técnicos, lee [`docs/MODELOS_Y_DISTRIBUCION.md`](MODELOS_Y_DISTRIBUCION.md).

### El audio generado suena raro o robótico

- Usa un trozo A/B más limpio y más largo (mínimo 4 segundos).
- Asegúrate de que solo hable una persona.
- Prueba a subir **Num steps** o ajustar **Guidance scale**.

### Quiero ver los logs (registros de errores)

Los logs están en:

```
%LOCALAPPDATA%\com.omniclon.studio2\Logs\
```

O también en:

```
C:\AI\OmniClon2\logs\
```

Puedes abrirlos con el Bloc de notas.

---

## Cómo actualizar el proyecto en GitHub cuando hagas cambios

Si más adelante modificas algo y quieres subirlo a GitHub, abre Git Bash en `C:\AI\OmniClon2` y escribe:

```bash
git add -A
git commit -m "feat: descripción breve del cambio"
git push
```

Si es una nueva versión (por ejemplo v1.1.0), también:

```bash
git tag -a v1.1.0 -m "OmniClon 2 v1.1.0"
git push origin v1.1.0
```

---

## ¿Y ahora qué?

Si ya has llegado aquí, el siguiente paso natural es **compilar el instalador** para poder instalar la app con un `.exe` o `.msi`, sin necesidad de abrir la terminal. Dime si quieres que continuemos con eso.
