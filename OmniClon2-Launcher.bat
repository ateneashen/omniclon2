@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

title OmniClon 2 - Launcher (User Friendly)

:: Quick prerequisite check (non-blocking)
where node >nul 2>&1 || echo [AVISO] node/npm no encontrado en PATH. Instala Node.js para el frontend.
where uv >nul 2>&1 || echo [AVISO] uv no encontrado. Se recomienda uv para el backend Python.

:: ============================================
:: OmniClon 2 - Friendly Launcher
:: Lanza versiones DEV o BUILD de forma sencilla
:: ============================================

:menu
cls
echo.
echo  =====================================================
echo   OmniClon 2  -  Launcher Amigable
echo  =====================================================
echo.
echo   Directorio actual: %CD%
echo.
echo   [1]  Iniciar en MODO DESARROLLO (recomendado)
echo        - Recarga en vivo (hot reload)
echo        - Ideal para probar A/B + generacion
echo        - Abre la ventana de la aplicacion automaticamente
echo.
echo   [2]  Compilar version RELEASE (produccion)
echo        - Crea el instalador .exe optimizado
echo        - Listo para distribuir
echo.
echo   [3]  Compilar version DEBUG
echo        - Con simbolos para depuracion
echo.
echo   [4]  Solo BACKEND Python (pruebas de API)
echo        - Levanta FastAPI en http://127.0.0.1:17493
echo        - Util para testear /generate sin la UI
echo.
echo   [5]  Actualizar / Instalar dependencias
echo        - npm install + uv sync (frontend + backend)
echo.
echo   [6]  Ejecutar SMOKE TESTS rapidos
echo        - Verifica que k2-fsa carga, placeholder funciona, etc.
echo.
echo   [7]  Abrir carpeta del proyecto en el Explorador
echo.
echo   [8]  Mostrar informacion del sistema (modelos, etc.)
echo.
echo   [0]  Salir
echo.
echo  =====================================================
echo.

set /p choice="Elige una opcion [1-8, 0]: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto build_release
if "%choice%"=="3" goto build_debug
if "%choice%"=="4" goto backend_only
if "%choice%"=="5" goto deps
if "%choice%"=="6" goto smoke
if "%choice%"=="7" goto explorer
if "%choice%"=="8" goto info
if "%choice%"=="0" goto end

echo Opcion invalida.
timeout /t 2 >nul
goto menu

:dev
echo.
echo [MODO DESARROLLO]
echo.
echo Configurando entorno autonomo de OmniClon 2...

echo Cambiando a frontend...
cd frontend

echo.
echo Lanzando Tauri en modo DEV...
echo (Se abrira la ventana de la aplicacion. Cierra esta consola o la ventana para detener.)
echo.
npm run tauri dev

echo.
echo El proceso de desarrollo ha terminado.
pause
goto menu

:build_release
echo.
echo [COMPILACION RELEASE - PRODUCCION]
echo.
cd frontend
echo Compilando version optimizada... (esto puede tardar varios minutos)
npm run tauri build
echo.
echo Compilacion terminada.
echo Los archivos estan en: frontend\src-tauri\target\release\
echo (Busca el .exe o el instalador .msi / .exe)
pause
goto menu

:build_debug
echo.
echo [COMPILACION DEBUG]
echo.
cd frontend
npm run tauri build -- --debug
echo.
echo Compilacion DEBUG terminada.
pause
goto menu

:backend_only
echo.
echo [SOLO BACKEND - para pruebas de API]
echo.
set OMNICLON2_DATA_DIR=%CD%\data
cd backend
echo Iniciando FastAPI (uvicorn) en http://127.0.0.1:17493 ...
echo Puedes probar /generate, /voice/status, etc. con curl o Postman.
echo Pulsa Ctrl+C para detener.
echo.
uv run uvicorn main:app --host 127.0.0.1 --port 17493 --reload
pause
goto menu

:deps
echo.
echo [ACTUALIZAR DEPENDENCIAS]
echo.
echo Frontend (npm)...
cd frontend
call npm install
cd ..

echo.
echo Backend (uv)...
cd backend
uv sync
cd ..

echo.
echo Dependencias actualizadas.
pause
goto menu

:smoke
echo.
echo [SMOKE TESTS]
echo.
set OMNICLON2_DATA_DIR=%CD%\data
cd backend
echo Ejecutando validacion rapida del servicio de voz + k2-fsa...
uv run python -c "
import sys, os, tempfile
sys.path.insert(0, '.')
from services.voice_cloning import VoiceCloningService, GenerationRequest
import soundfile as sf
import numpy as np
import base64

print('=== Smoke Test OmniClon2 ===')
svc = VoiceCloningService()
svc.initialize()
print('Primary model:', svc.primary_cloning_model)
print('Real OmniVoice class loaded?:', bool(getattr(svc, 'real_omnivoice', None)))
print('k2 prepared?:', getattr(svc, '_k2fsa_loaded', False))

with tempfile.TemporaryDirectory() as tmp:
    ref = os.path.join(tmp, 'test_ref.wav')
    sr = 24000
    data = np.random.randn(sr * 5).astype('float32') * 0.03
    sf.write(ref, data, sr)

    req = GenerationRequest(reference_audio_path=ref, text='Prueba de smoke desde el launcher.')
    res = svc.generate(req)
    print('Generation success:', res.success)
    print('Model used:', res.model_used)
    print('Duration:', round(res.duration_seconds or 0, 1), 's')
    print('Has base64 audio?:', bool(res.audio_base64))
print('=== Smoke completado ===')
"
cd ..
echo.
pause
goto menu

:explorer
start "" "%CD%"
goto menu

:info
echo.
echo === Informacion del sistema ===
echo.
echo Directorio raiz: %CD%
echo.
echo Buscando modelos k2-fsa...
if exist "%CD%\data\models\k2-fsa_OmniVoice\model.safetensors" (
    echo   k2-fsa_OmniVoice encontrado en %CD%\data\models (autonomo)
) else (
    echo   k2-fsa_OmniVoice NO encontrado en %CD%\data\models.
)
echo.
echo Herramientas:
where node >nul 2>&1 && echo   node: OK || echo   node: NO ENCONTRADO
where npm >nul 2>&1 && echo   npm: OK || echo   npm: NO ENCONTRADO
where uv >nul 2>&1 && echo   uv: OK || echo   uv: NO ENCONTRADO
echo.
pause
goto menu

:end
echo.
echo Gracias por usar OmniClon 2.
echo.
exit /b 0
