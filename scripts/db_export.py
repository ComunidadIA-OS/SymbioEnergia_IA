#!/usr/bin/env python3
"""
db_export.py — SymbioEnergia IA
Exporta la BD MySQL a database/current.sql usando mysqldump de XAMPP.
Ejecutar: python scripts/db_export.py
"""
import os
import sys
import subprocess
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT, 'config', '.env'), override=True)

USER   = os.getenv('MYSQL_USER', 'root')
PASS   = os.getenv('MYSQL_PASS', '')
HOST   = os.getenv('MYSQL_HOST', 'localhost')
PORT   = os.getenv('MYSQL_PORT', '3306')
DB     = os.getenv('MYSQL_DB', 'symbioenergia')
OUTPUT = os.path.join(ROOT, 'database', 'current.sql')

MYSQLDUMP_PATHS = [
    r'C:\xampp\mysql\bin\mysqldump.exe',
    r'C:\xampp64\mysql\bin\mysqldump.exe',
    r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe',
    'mysqldump',  # en PATH
]


def find_mysqldump():
    for path in MYSQLDUMP_PATHS:
        if path == 'mysqldump' or os.path.isfile(path):
            return path
    return None


if __name__ == '__main__':
    mysqldump = find_mysqldump()
    if not mysqldump:
        print("ERROR: mysqldump no encontrado. Añade XAMPP/mysql/bin al PATH.")
        sys.exit(1)

    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cmd = [mysqldump,
           f'--host={HOST}',
           f'--port={PORT}',
           f'--user={USER}',
           '--single-transaction',
           '--skip-lock-tables',
           '--add-drop-table',
           DB]
    if PASS:
        cmd.append(f'--password={PASS}')

    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"ERROR mysqldump: {result.stderr}")
        sys.exit(1)

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write(f'-- SymbioEnergia IA — DB Export — {ts}\n')
        f.write(f'-- Base de datos: {DB}\n\n')
        f.write(result.stdout)

    size_kb = os.path.getsize(OUTPUT) // 1024
    print(f"BD exportada -> database/current.sql ({size_kb} KB)")
