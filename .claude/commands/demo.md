Analiza el estado actual del proyecto SymbioEnergia IA y genera un plan de acción para tener la demo lista antes del 29 de mayo de 2026.

Lee el `.readmeAI` (secciones PROGRESS, KNOWN ISSUES, CURRENT SESSION STATE y HACKATHON COMPLIANCE) y revisa los ficheros de servicios y frontend para saber qué está realmente implementado vs qué es un stub.

Produce este informe:

---
## Estado demo — SymbioEnergia IA · 29 mayo 2026

**Días restantes:** [calcula desde hoy]

### Flujo mínimo de la demo (lo que el jurado verá)
El jurado espera ver:
1. Usuario busca empresa en mapa → Nominatim geocodifica → edificio aparece en Leaflet
2. Usuario hace clic → se abre estudio.html con viewer 3D del edificio
3. 5 agentes analizan en paralelo → resultados aparecen en sidebar
4. Sistema genera recomendación con trazabilidad (fuente + confianza)
5. Se muestran subvenciones disponibles y ROI estimado

### Por módulo — qué está listo para el flujo de demo
| Módulo | Fichero | Estado real | Bloquea demo |
|--------|---------|-------------|--------------|
| Mapa + búsqueda | `dashboard.js` | [stub/parcial/completo] | [sí/no] |
| Viewer 3D | `scene3d.js` | [stub/parcial/completo] | [sí/no] |
| Agente Clima | `climate_service.py` | [stub/parcial/completo] | [sí/no] |
| Agente Geo | `lidar_service.py` | [stub/parcial/completo] | [sí/no] |
| Agente Simbiosis | `symbiosis_service.py` | [stub/parcial/completo] | [sí/no] |
| Agente Normativa | `regulatory_service.py` | [stub/parcial/completo] | [sí/no] |
| Agente Financiero | `financial_service.py` | [stub/parcial/completo] | [sí/no] |
| Recomendación IA | `ai_service.py` | [stub/parcial/completo] | [sí/no] |

### Plan de acción — ordenado por prioridad de demo
[lista de tareas ordenadas: primero lo que bloquea el flujo, luego lo que enriquece]

Cada tarea con:
- Fichero exacto a tocar
- Estimación de complejidad: [baja / media / alta]
- Dependencias previas necesarias

### Riesgo demo
[1 párrafo: cuál es el mayor riesgo de que la demo falle y cómo mitigarlo]
---
