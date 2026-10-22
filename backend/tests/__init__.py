# backend/tests package
import sys
from pathlib import Path

# Garantizar que el directorio backend esté en sys.path para todos los tests
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
