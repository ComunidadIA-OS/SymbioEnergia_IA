#!/bin/bash
# setup_vps.sh — Ejecutar UNA SOLA VEZ en el VPS como usuario ubuntu
# Instala Python, nginx, gunicorn y configura el servicio systemd
set -e

APP_DIR="/home/ubuntu/symbioenergia"
APP_USER="ubuntu"

echo "==> Actualizando sistema..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    nginx \
    2>/dev/null

echo "==> Creando directorio de la app..."
mkdir -p "$APP_DIR"

echo "==> Creando entorno virtual..."
python3.11 -m venv "$APP_DIR/venv"
source "$APP_DIR/venv/bin/activate"

echo "==> Instalando dependencias Python..."
pip install --quiet --no-cache-dir \
    flask flask-sqlalchemy python-dotenv requests groq gunicorn

echo "==> Creando servicio systemd..."
sudo tee /etc/systemd/system/symbioenergia.service > /dev/null <<EOF
[Unit]
Description=SymbioEnergia IA — Flask app
After=network.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/venv/bin"
ExecStart=${APP_DIR}/venv/bin/gunicorn \
    --workers 2 \
    --bind unix:${APP_DIR}/symbioenergia.sock \
    --access-logfile ${APP_DIR}/access.log \
    --error-logfile ${APP_DIR}/error.log \
    run:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "==> Configurando nginx..."
sudo tee /etc/nginx/sites-available/symbioenergia > /dev/null <<EOF
server {
    listen 80;
    server_name _;

    location /static/ {
        alias ${APP_DIR}/public/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://unix:${APP_DIR}/symbioenergia.sock;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/symbioenergia /etc/nginx/sites-enabled/symbioenergia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "==> Setup completado."
echo "    Ahora sube el codigo con: scripts/upload.ps1 (desde tu Windows)"
echo "    Y crea el .env en: ${APP_DIR}/config/.env"
