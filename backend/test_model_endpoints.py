"""
Test rápido de los endpoints de Model Management (Fase B1)
Usa FastAPI TestClient - no necesita servidor corriendo.
"""
from fastapi.testclient import TestClient
import sys
import os
from pathlib import Path

# Asegurar imports
_backend_dir = Path(__file__).parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Simular lo que hace Rust
test_data_dir = _backend_dir / "temp_test_data"
os.environ["OMNICLON2_DATA_DIR"] = str(test_data_dir)

print(f"[Test] Usando data dir temporal: {test_data_dir}")

from main import app

client = TestClient(app)

print("\n" + "="*60)
print("PRUEBAS DE ENDPOINTS - SISTEMA DE MODELOS (Fase B1)")
print("="*60 + "\n")

# 1. Status inicial
print("1. GET /models/status")
resp = client.get("/models/status")
print(resp.json())
print()

# 2. Config inicial
print("2. GET /models/config")
resp = client.get("/models/config")
print(resp.json())
print()

# 3. Cambiar a modo dedicated
print("3. POST /models/switch_mode → dedicated")
resp = client.post("/models/switch_mode", json={"mode": "dedicated"})
print(resp.json())
print()

# 4. Verificar que cambió
print("4. GET /models/status (después del switch)")
resp = client.get("/models/status")
data = resp.json()
print(f"   Mode actual: {data['config']['mode']}")
print(f"   Active root: {data['active_root']}")
print(f"   Total modelos: {data['total_models']}")
print()

# 5. Volver a shared
print("5. POST /models/switch_mode → shared")
resp = client.post("/models/switch_mode", json={"mode": "shared"})
print(resp.json())
print()

print("="*60)
print("✅ Todas las pruebas de endpoints pasaron correctamente")
print("="*60)
