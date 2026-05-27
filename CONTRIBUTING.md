# Cómo contribuir a SymbioEnergia IA

¡Gracias por tu interés! SymbioEnergia IA está diseñado desde el principio para ser reutilizado y mejorado por la comunidad.

---

## Formas de contribuir

### 1. Adaptar a tu comunidad autónoma

La contribución más valiosa es adaptar el módulo de normativa a otra región española:

1. Haz fork del repositorio
2. Edita `src/services/regulatory_service.py` — añade las subvenciones de tu CCAA al array `SUBSIDIES_DB`
3. Actualiza el `README.md` con las fuentes de datos de tu región
4. Abre una Pull Request con título `feat(normativa): añadir subvenciones [TU CCAA]`

### 2. Reportar un bug

- Abre un [Issue](https://github.com/Oscarr36/SymbioEnergia-IA/issues) con el prefijo `[BUG]`
- Incluye: pasos para reproducirlo, comportamiento esperado, comportamiento real, versión de Python y SO

### 3. Proponer una mejora

- Abre un [Issue](https://github.com/Oscarr36/SymbioEnergia-IA/issues) con el prefijo `[MEJORA]`
- Describe el problema que resuelve antes de describir la solución

### 4. Corregir documentación

Los errores en el README, CONTRIBUTING o comentarios del código se aceptan directamente como PR sin issue previo.

---

## Flujo de trabajo

```bash
# 1. Fork y clone
git clone https://github.com/TU-USUARIO/SymbioEnergia-IA.git
cd SymbioEnergia-IA

# 2. Crear rama de feature
git checkout -b feature/descripcion-corta

# 3. Instalar dependencias
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows
pip install -r requirements.txt

# 4. Hacer cambios y comitear
git add .
git commit -m "feat(scope): descripcion del cambio"

# 5. Push y Pull Request
git push origin feature/descripcion-corta
```

---

## Convenciones de commits

```
feat(scope):     nueva funcionalidad
fix(scope):      corrección de bug
chore(scope):    mantenimiento (deps, config)
style(scope):    solo CSS/formato
refactor(scope): refactorización sin cambio de comportamiento
docs(scope):     solo documentación
```

**Scopes disponibles:** `geo` · `climate` · `symbiosis` · `regulatory` · `financial` · `llm` · `auth` · `dashboard` · `estudio` · `ui` · `api` · `db`

---

## Estructura del proyecto

```
src/services/       # Aquí van las integraciones con APIs externas
src/controllers/    # Aquí va la lógica de negocio
src/routes/         # Solo definición de rutas, sin lógica
src/views/          # Templates Jinja2, sin lógica inline
public/css/         # Estilos BEM, variables en base/variables.css
public/js/          # ES modules, sin bundler
```

Ver el [README](README.md) para la arquitectura completa.

---

## Checklist antes de abrir una PR

- [ ] El código sigue las convenciones del proyecto (snake_case Python, BEM CSS, const/let JS)
- [ ] No hay secretos ni claves API en el código
- [ ] Las dependencias añadidas son compatibles con Apache 2.0
- [ ] El `requirements.txt` está actualizado si se añadieron paquetes
- [ ] El README refleja los cambios si afectan a la instalación o uso

---

## Compatibilidad de licencias

Este proyecto usa **Apache 2.0**. Las contribuciones deben usar dependencias compatibles:

| Compatible con Apache 2.0 | No compatible |
|--------------------------|---------------|
| MIT, BSD, ISC, Apache 2.0 | GPL, AGPL (copyleft fuerte) |
| LGPL (con cautela) | Licencias propietarias |

---

## Código preexistente (Art. 11 T&C del hackathon)

El equipo fundador declara que:
- Los prototipos visuales (viewer 3D, mapa) fueron desarrollados en las semanas previas como exploración técnica
- Los 5 agentes de IA y la integración con APIs de datos abiertos se desarrollaron durante el período del hackathon (22-27 mayo 2026)
- El código preexistente **no constituye el núcleo funcional de la solución**
- Todas las dependencias son compatibles con Apache 2.0

---

## Contacto

| Persona | Email |
|---------|-------|
| Óscar Blasco Armengod | blascooscar36@gmail.com |
| Lucía Claver Bolea | claverbolealucia@gmail.com |

Para vulnerabilidades de seguridad, usa el proceso descrito en [SECURITY.md](SECURITY.md) — no abras un issue público.
