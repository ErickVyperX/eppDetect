import sys
from pathlib import Path

# Añadir ruta al sys.path para importaciones
current_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(current_dir))

from app.database import engine, SessionLocal, Base
from app.domain.models import User, Incident
from app.core.security import hash_password

def init_database():
    print("[DB Init] Creando tablas en la base de datos SQLite...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # 1. Crear Supervisor Pre-registrado si no existe
        supervisor_email = "supervisor@obra.com"
        existing_supervisor = db.query(User).filter(User.email == supervisor_email).first()

        if not existing_supervisor:
            supervisor_user = User(
                email=supervisor_email,
                hashed_password=hash_password("supervisor123"),
                full_name="Ing. Carlos Mendoza (Supervisor de Obra)",
                role="supervisor",
                is_active=True
            )
            db.add(supervisor_user)
            print(f"[DB Init] Usuario Supervisor creado exitosamente: {supervisor_email} / supervisor123")
        else:
            print(f"[DB Init] Usuario Supervisor ya existe: {supervisor_email}")

        # 2. Crear Administrador del Sistema si no existe
        admin_email = "admin@obra.com"
        existing_admin = db.query(User).filter(User.email == admin_email).first()

        if not existing_admin:
            admin_user = User(
                email=admin_email,
                hashed_password=hash_password("admin123"),
                full_name="Administrador de Seguridad Industrial",
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            print(f"[DB Init] Usuario Administrador creado exitosamente: {admin_email} / admin123")
        else:
            print(f"[DB Init] Usuario Administrador ya existe: {admin_email}")

        db.commit()
        print("[DB Init] Base de datos inicializada correctamente.")
    except Exception as e:
        db.rollback()
        print(f"[DB Init] Error durante la inicialización: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    init_database()
