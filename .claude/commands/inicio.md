Ejecuta estos pasos en orden antes de mostrar nada al usuario:

**PASO 0 — Arrancar MySQL y preparar la BD (silencioso)**
Ejecuta en PowerShell:
```powershell
# Arrancar el servicio MySQL de XAMPP si no está corriendo
$mysql = Get-Service -Name "mysql" -ErrorAction SilentlyContinue
if ($mysql -and $mysql.Status -ne 'Running') {
    Start-Service mysql -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}
# Inicializar / actualizar la BD (idempotente)
python scripts/db_init.py
```
Si `db_init.py` falla con error de conexión, informa al usuario que debe iniciar XAMPP manualmente.
Si arranca bien, continúa en silencio.

**PASO 1 — Backup del estado actual (silencioso)**
Crea la carpeta `backup/` en la raíz del proyecto si no existe.
Dentro, crea una subcarpeta con timestamp `backup/YYYY-MM-DD_HH-MM/`.
Copia a esa carpeta los siguientes ficheros del estado actual (antes de hacer pull):
- `.readmeAI`
- `src/services/llm_service.py`
- `src/views/pages/estudio.html`
- `public/js/pages/estudio.js`
- `public/css/pages/estudio.css`

Si algún fichero no existe, omítelo sin error.
La carpeta `backup/` está en `.gitignore` — no se sube al repo.

Usa comandos bash/powershell para hacer la copia. Ejemplo PowerShell:
```
$ts = Get-Date -Format "yyyy-MM-dd_HH-mm"
New-Item -ItemType Directory -Force -Path "backup\$ts" | Out-Null
Copy-Item ".readmeAI" "backup\$ts\" -ErrorAction SilentlyContinue
```

**PASO 2 — Git pull (silencioso)**
Ejecuta `git pull origin main` para traer los últimos cambios.
Si hay conflictos, infórmame antes de continuar.

**PASO 3 — Leer `.readmeAI` completo**
Lee el fichero `.readmeAI` desde la raíz del proyecto. Es el contexto maestro de SymbioEnergia IA.

**PASO 4 — Mostrar el resumen de sesión**
Muestra exactamente esto, sin nada más:

---
**SESIÓN INICIADA — SymbioEnergia IA**

**Estado actual:** [copia literal del campo "Objetivo activo" de CURRENT SESSION STATE]

**Último paso:** [copia literal de "Último paso tomado"]

**Bloqueantes:** [copia literal de "Bloqueantes"]

**Tareas prioritarias** (del backlog, ordenadas por urgencia para el deadline 29 mayo):
1. [tarea más urgente]
2. [segunda más urgente]
3. [tercera más urgente]

**Para empezar:** dime en qué módulo vas a trabajar y te preparo el contexto exacto.
---

No hagas nada más hasta que el usuario indique una tarea concreta.
