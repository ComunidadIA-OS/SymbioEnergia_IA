Implementa el módulo indicado en: $ARGUMENTS

Lee primero el `.readmeAI` para cargar el contexto completo: estructura, convenciones, contratos de API y estado actual del proyecto.

Luego implementa el módulo siguiendo estas reglas estrictas:

**Antes de escribir código:**
1. Identifica el fichero exacto en STRUCTURE MAP
2. Verifica la firma de función en SYMBOL INDEX
3. Comprueba en HACKATHON COMPLIANCE que la implementación no viola restricciones
4. Revisa el contrato de API en "API & DATA CONTRACTS"

**Al implementar:**
- Sigue las convenciones Python del .readmeAI: type hints, snake_case, SCREAMING_SNAKE para constantes, async/await para IO
- Sin print() — usa logging
- Sin valores hardcodeados — constantes nombradas
- Maneja errores explícitamente: si la API externa falla, devuelve un dict con `{"error": "...", "source": "...", "confidence": 0.0}` — nunca silencies el fallo
- Cada resultado debe incluir trazabilidad: `{"data": ..., "source": "AEMET", "timestamp": "...", "confidence": 0.85}`
- Sin features extra no pedidas

**Módulos disponibles para implementar:**
- `climate` → `src/services/climate_service.py` (AEMET + PVGIS)
- `geo` → `src/services/lidar_service.py` (PNOA LiDAR WCS)
- `symbiosis` → `src/services/symbiosis_service.py` (matching RD 7/2026)
- `regulatory` → `src/services/regulatory_service.py` (BOE/BOA/IDAE)
- `financial` → `src/services/financial_service.py` (OMIE + ROI)
- `ai` → `src/services/ai_service.py` (Groq + LLaMA 3.1)
- `scene3d` → `public/js/components/scene3d.js` (Three.js viewer)
- `dashboard` → `public/js/pages/dashboard.js` (Leaflet + Nominatim)

Al terminar, indica qué ficheros modificaste y si hay variables de entorno nuevas que añadir al `.env.example`.
