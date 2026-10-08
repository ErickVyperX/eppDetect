import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent / "epp_database.db"

def consultar():
    if not DB_PATH.exists():
        print(f"[!] No se encontro el archivo de base de datos en: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("=" * 70)
    print(f" BASE DE DATOS LOCAL: {DB_PATH.name}")
    print("=" * 70)

    # 1. USUARIOS REGISTRADOS
    print("\n--- [1] USUARIOS REGISTRADOS (users) ---")
    cursor.execute("SELECT id, email, full_name, role, is_active, created_at FROM users")
    users = cursor.fetchall()
    if users:
        print(f"{'ID':<4} | {'Email':<25} | {'Nombre':<30} | {'Rol':<10} | {'Activo'}")
        print("-" * 75)
        for u in users:
            print(f"{u[0]:<4} | {u[1]:<25} | {u[2]:<30} | {u[3]:<10} | {bool(u[4])}")
    else:
        print("No hay usuarios registrados.")

    # 2. TOTAL Y ESTADÍSTICAS DE INCIDENCIAS
    print("\n--- [2] RESUMEN DE INCIDENCIAS (incidents) ---")
    cursor.execute("SELECT COUNT(*) FROM incidents")
    total = cursor.fetchone()[0]
    print(f"Total de incidencias registradas: {total}")

    if total > 0:
        cursor.execute("SELECT violation_type, COUNT(*) FROM incidents GROUP BY violation_type")
        by_type = cursor.fetchall()
        for v_type, cnt in by_type:
            print(f" - {v_type}: {cnt}")

        # 3. ÚLTIMAS 10 INCIDENCIAS
        print("\n--- [3] ULTIMAS 10 INCIDENCIAS REGISTRADAS ---")
        cursor.execute("""
            SELECT id, timestamp, track_id, violation_type, confidence, frame_path, source_name 
            FROM incidents 
            ORDER BY timestamp DESC 
            LIMIT 10
        """)
        incidents = cursor.fetchall()
        print(f"{'Fecha y Hora':<20} | {'Track':<6} | {'Infraccion':<16} | {'Confianza':<10} | {'Archivo Frame'}")
        print("-" * 80)
        for inc in incidents:
            print(f"{str(inc[1])[:19]:<20} | #{inc[2]:<5} | {inc[3]:<16} | {inc[4]*100:.1f}%      | {inc[5]}")

    print("\n" + "=" * 70)
    conn.close()

if __name__ == "__main__":
    consultar()
