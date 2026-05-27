# upload.ps1 — Ejecutar desde Windows para subir el codigo al VPS
# Uso: .\scripts\upload.ps1
# Requiere: OpenSSH instalado (viene por defecto en Windows 10/11)

$VPS_IP   = "149.56.44.123"
$VPS_USER = "ubuntu"
$APP_DIR  = "/home/ubuntu/symbioenergia"
$LOCAL    = "C:\Users\blasc\Desktop\SymbioEnergia-IA"

# Archivos y carpetas a excluir del upload
$EXCLUDE = @(
    ".git", ".claude", "__pycache__", "*.pyc",
    "*.db", ".env", "venv", ".pytest_cache", "node_modules"
)

Write-Host "==> Subiendo codigo a $VPS_IP..." -ForegroundColor Cyan

# Crear lista de exclusiones para scp (usamos rsync via bash)
# En Windows usamos scp carpeta por carpeta para evitar .git y .env

$foldersToUpload = @("src", "public", "config", "tests", "docs", "scripts")
$filesToUpload   = @("run.py", "requirements.txt", "README.md")

# Crear directorio remoto
ssh "${VPS_USER}@${VPS_IP}" "mkdir -p ${APP_DIR}/config ${APP_DIR}/public"

# Subir carpetas
foreach ($folder in $foldersToUpload) {
    $localPath = Join-Path $LOCAL $folder
    if (Test-Path $localPath) {
        Write-Host "  Subiendo $folder/..." -ForegroundColor Gray
        scp -r "$localPath" "${VPS_USER}@${VPS_IP}:${APP_DIR}/"
    }
}

# Subir archivos sueltos
foreach ($file in $filesToUpload) {
    $localPath = Join-Path $LOCAL $file
    if (Test-Path $localPath) {
        Write-Host "  Subiendo $file..." -ForegroundColor Gray
        scp "$localPath" "${VPS_USER}@${VPS_IP}:${APP_DIR}/"
    }
}

Write-Host ""
Write-Host "==> Codigo subido." -ForegroundColor Green
Write-Host ""
Write-Host "Ahora conectate al VPS y ejecuta:" -ForegroundColor Yellow
Write-Host "  ssh ubuntu@$VPS_IP"
Write-Host "  cd $APP_DIR"
Write-Host "  nano config/.env          # pega tus keys"
Write-Host "  source venv/bin/activate"
Write-Host "  pip install -r requirements.txt --quiet"
Write-Host "  sudo systemctl enable symbioenergia"
Write-Host "  sudo systemctl start symbioenergia"
Write-Host "  sudo systemctl status symbioenergia"
