#!/bin/bash
# redeploy.sh — Ejecutar en el VPS para actualizar la app tras un nuevo upload
# Uso: bash ~/symbioenergia/scripts/redeploy.sh
set -e

APP_DIR="/home/ubuntu/symbioenergia"

echo "==> Actualizando dependencias..."
source "$APP_DIR/venv/bin/activate"
pip install --quiet --no-cache-dir -r "$APP_DIR/requirements.txt"

echo "==> Reiniciando servicio..."
sudo systemctl restart symbioenergia
sudo systemctl status symbioenergia --no-pager

echo "==> Listo. App corriendo en http://149.56.44.123"
