# Política de seguridad — SymbioEnergia IA

## Versiones soportadas

| Versión | Soportada |
|---------|-----------|
| main    | ✅         |
| ramas feature/* | solo durante desarrollo activo |

## Reportar una vulnerabilidad

**No abras un issue público** para reportar vulnerabilidades de seguridad — eso expone el problema antes de que podamos mitigarlo.

Envía un correo a **blascooscar36@gmail.com** con:

1. Descripción del problema y su impacto potencial
2. Pasos para reproducirlo (cuanto más detallado, mejor)
3. Versión o commit afectado
4. Cualquier mitigación temporal que hayas identificado

Responderemos en un plazo máximo de **48 horas** con la confirmación de recepción. Si la vulnerabilidad se confirma, publicaremos un parche y te acreditaremos en el changelog (salvo que prefieras permanecer anónimo).

## Principios de seguridad por diseño

Este proyecto aplica los siguientes principios desde el primer commit:

### Gestión de secretos
- Las claves de API (AEMET, etc.) y `FLASK_SECRET_KEY` **nunca** se comitean al repositorio.
- Se cargan exclusivamente desde variables de entorno via `python-dotenv`.
- El fichero `config/.env` está en `.gitignore`; solo se incluye `config/.env.example` con valores vacíos.

### Validación de entrada
- Todos los parámetros de las rutas API (`lat`, `lon`, `kwh`) se validan como `float` antes de pasarse a los servicios.
- Los datos procedentes de APIs externas (AEMET, PNOA, OMIE) se tratan como no confiables y se validan antes de persistirlos.

### Dependencias
- Las dependencias se fijan con versiones exactas en `requirements.txt`.
- Solo se incluyen librerías con licencia compatible con Apache 2.0.

### Superficie de ataque mínima
- El modo `DEBUG` de Flask solo se activa si `FLASK_DEBUG=1` en el entorno. En producción nunca debe estar activo.
- No se exponen rutas de administración ni endpoints de introspección en producción.

### Anonimización PII (AI Act compliant)
- Antes de enviar cualquier texto a un LLM externo, `anonymizer_service.py` detecta y sustituye entidades PII (CIF, NIF, IBAN, email, teléfono) usando Microsoft Presidio con fallback regex.
- El informe de anonimización se incluye en la respuesta API (`entities_found`, `method`) para trazabilidad completa.

### IA local con Ollama
- Si Ollama está disponible en `localhost:11434`, el sistema lo usa por defecto — los datos **nunca salen del servidor**.
- La cadena de proveedores es: Ollama → GROQ → fallback estructurado.
- El endpoint `GET /api/llm/health` expone el proveedor activo en cada momento.

### Autenticación
- Las contraseñas se almacenan como hash PBKDF2-SHA256 via `werkzeug.security.generate_password_hash`.
- Las sesiones usan la `FLASK_SECRET_KEY` configurada en `.env`.
- No se almacenan contraseñas en texto plano ni en logs.

### Trazabilidad
- Cada recomendación generada por los agentes de IA registra la fuente de datos usada, la fecha de consulta y el margen de confianza, cumpliendo con el requisito de explicabilidad del hackathon.

## Dependencias externas y sus políticas de seguridad

| Dependencia | Política de seguridad |
|-------------|----------------------|
| Flask | https://flask.palletsprojects.com/en/latest/security/ |
| SQLAlchemy | https://docs.sqlalchemy.org/en/latest/core/security.html |
| requests | https://requests.readthedocs.io/en/latest/community/vulnerabilities/ |

## Adaptación a otras comunidades autónomas

Si adaptas este proyecto para otra región, asegúrate de revisar:
- Las claves de API específicas de tu región (boletín oficial, datos climáticos)
- Los límites de rate-limiting de las APIs públicas que uses
- Que `FLASK_SECRET_KEY` sea única por despliegue
