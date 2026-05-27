#!/usr/bin/env python3
"""
db_init.py — SymbioEnergia IA
Crea la BD en MySQL si no existe, aplica el schema y siembra el usuario demo.
Ejecutar: python scripts/db_init.py
"""
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT, 'config', '.env'), override=True)

HOST   = os.getenv('MYSQL_HOST', 'localhost')
PORT   = int(os.getenv('MYSQL_PORT', 3306))
USER   = os.getenv('MYSQL_USER', 'root')
PASS   = os.getenv('MYSQL_PASS', '')
DB     = os.getenv('MYSQL_DB', 'symbioenergia')
SCHEMA = os.path.join(ROOT, 'database', 'schema.sql')

DEMO_EMAIL   = 'noreply@symbioenergy.es'
DEMO_PASS    = 'noreplyluciayoscar'
DEMO_COMPANY = 'SymbioEnergia Demo'


def _connect(database=None):
    import pymysql
    kwargs = dict(host=HOST, port=PORT, user=USER, password=PASS,
                  charset='utf8mb4', autocommit=True)
    if database:
        kwargs['database'] = database
    return pymysql.connect(**kwargs)


def wait_for_mysql(retries=15):
    print("  Esperando a MySQL...", end='', flush=True)
    for i in range(retries):
        try:
            _connect().close()
            print(" OK")
            return True
        except Exception:
            print('.', end='', flush=True)
            time.sleep(2)
    print(" TIMEOUT")
    return False


def ensure_database():
    conn = _connect()
    with conn.cursor() as cur:
        cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{DB}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    conn.close()
    print(f"  Base de datos `{DB}` lista.")


def apply_schema():
    with open(SCHEMA, 'r', encoding='utf-8') as f:
        sql = f.read()

    conn = _connect(DB)
    with conn.cursor() as cur:
        for stmt in sql.split(';'):
            # Strip comment lines, then check if actual SQL remains
            lines = [l for l in stmt.splitlines() if not l.strip().startswith('--')]
            stmt = '\n'.join(lines).strip()
            if stmt:
                try:
                    cur.execute(stmt)
                except Exception as e:
                    if 'already exists' not in str(e).lower():
                        print(f"  Aviso schema: {e}")
    conn.close()
    print("  Schema aplicado.")


def seed_demo_user():
    from werkzeug.security import generate_password_hash

    conn = _connect(DB)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM `user` WHERE email = %s", (DEMO_EMAIL,))
        if cur.fetchone():
            print("  Usuario demo ya existe — sin cambios.")
            conn.close()
            return

        pw_hash = generate_password_hash(DEMO_PASS)
        cur.execute("""
            INSERT INTO `user`
              (email, password_hash, company_name, lat, lon,
               solar_capacity_kwp, annual_savings_eur, payback_years,
               subsidy_eur, surface_m2, email_verified)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
        """, (DEMO_EMAIL, pw_hash, DEMO_COMPANY,
              40.364, -1.102, 120.0, 14800.0, 5.4, 54000.0, 650.0))
    conn.close()
    print(f"  Usuario demo creado: {DEMO_EMAIL}")


def run_migrations():
    """Añade columnas/índices que no estaban en el schema inicial (idempotente)."""
    conn = _connect(DB)
    with conn.cursor() as cur:
        migrations = [
            "ALTER TABLE `company` ADD COLUMN `user_id` INT",
            "ALTER TABLE `company` ADD KEY `idx_company_user` (`user_id`)",
            "ALTER TABLE `company` ADD CONSTRAINT `fk_company_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL",
            # confidence_level columns ampliados a 200 (PVGIS strings superan VARCHAR(30))
            "ALTER TABLE `climate_result` MODIFY COLUMN `confidence_level` VARCHAR(200)",
            "ALTER TABLE `symbiosis_result` MODIFY COLUMN `confidence_level` VARCHAR(200)",
            "ALTER TABLE `geo_result` MODIFY COLUMN `confidence_level` VARCHAR(200)",
        ]
        for sql in migrations:
            try:
                cur.execute(sql)
            except Exception:
                pass  # columna/FK ya existe
    conn.close()
    print("  Migraciones aplicadas.")


if __name__ == '__main__':
    print("=== SymbioEnergia IA — Inicializando MySQL ===")
    if not wait_for_mysql():
        print("ERROR: MySQL no responde. Inicia XAMPP primero.")
        sys.exit(1)
    ensure_database()
    apply_schema()
    run_migrations()
    seed_demo_user()
    print("=== BD lista. ===")
