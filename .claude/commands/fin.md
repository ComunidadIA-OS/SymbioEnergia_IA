Es el final de la sesión de trabajo en SymbioEnergia IA. Debes actualizar el fichero `.readmeAI` con todo lo que ocurrió esta sesión. Sigue la secuencia de fin de sesión definida en el propio .readmeAI (sección AI PROTOCOL).

Pasos obligatorios — hazlos todos, en orden:

1. **CURRENT SESSION STATE** — Sobrescribe con el estado actual:
   - "Objetivo activo": qué quedó pendiente o qué está en marcha
   - "Último paso tomado": la última acción concreta realizada esta sesión
   - "Bloqueantes": qué impide avanzar ahora mismo
   - "Próximo paso inmediato": la siguiente acción concreta

2. **DECISIONS LOG** — Añade una fila por cada decisión arquitectónica tomada esta sesión (si hubo alguna). Si no hubo ninguna, no añadas nada.

3. **CHANGE LOG** — Añade una fila con fecha de hoy, actor "AI", y resumen de 1 línea de qué se hizo.

4. **STRUCTURE MAP** — Actualiza si se crearon, movieron o eliminaron ficheros.

5. **SYMBOL INDEX** — Añade nuevas funciones, clases o rutas que se crearon.

6. **PROGRESS** — Marca como `[x]` las tareas completadas. Añade al backlog cualquier nueva tarea identificada.

7. **KNOWN ISSUES** — Añade o cierra issues según corresponda.

8. **DEPENDENCIES** — Actualiza si se añadieron o eliminaron paquetes de requirements.txt.

**PASO PREVIO AL PUSH — Exportar la BD**
Antes del git push, ejecuta:
```
python scripts/db_export.py
```
Esto vuelca la BD MySQL actual a `database/current.sql`.
Si falla (MySQL no disponible), informa al usuario pero continúa con el push igualmente.
Incluye `database/current.sql` en el commit si se actualizó.

**PASO FINAL — Git push**
Después de actualizar `.readmeAI` y exportar la BD, ejecuta:
```
git add -A
git commit -m "chore(session): cierre de sesión — [resumen de 1 línea de lo trabajado hoy]"
git push origin main
```

Usa el resumen del CHANGE LOG como mensaje de commit.

Después del push, muestra un resumen de 3 líneas máximo de qué cambió y confirma que el push fue exitoso.
