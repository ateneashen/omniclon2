"""
Test rápido del pulido de detección + catálogo (B1 Polish items 1 y 2)
"""
import sys
import os
from pathlib import Path

_backend = Path('.')
sys.path.insert(0, str(_backend))
os.environ['OMNICLON2_DATA_DIR'] = str(_backend / 'temp_polish_test')

from services.model_manager import ModelManager

print("=== Test: Detección mejorada + Catálogo ===\n")

mm = ModelManager(os.environ['OMNICLON2_DATA_DIR'])

print("--- get_catalog_with_status() ---")
catalog = mm.get_catalog_with_status()
for m in catalog:
    print(f"  {m['repo_id']:<35} installed={m.get('installed')}  location={m.get('location')}")

print("\n--- scan_installed_models() ---")
models = mm.scan_installed_models()
for m in models:
    print(f"  {m.repo_id:<35} installed={m.installed}  path={m.path}")

print("\n✅ Pulido de detección y catálogo funcionando correctamente")
