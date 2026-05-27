from flask import Blueprint, request, jsonify
from src.controllers import (
    geo_controller, climate_controller,
    symbiosis_controller, regulatory_controller, financial_controller,
    dashboard_controller
)
from src.controllers import weather_controller, building_summary_controller, llm_controller
from src.controllers import company_controller, renewables_controller
from src.services import geocoding_service

api_bp = Blueprint('api', __name__)

@api_bp.route('/dashboard')
def dashboard_kpis():
    return jsonify(dashboard_controller.get_dashboard_data())

@api_bp.route('/geo')
def geo():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    return jsonify(geo_controller.get_geo_analysis(lat, lon))

@api_bp.route('/climate')
def climate():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    return jsonify(climate_controller.get_climate_analysis(lat, lon))

@api_bp.route('/symbiosis')
def symbiosis():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    kwp = request.args.get('kwp', type=float)
    return jsonify(symbiosis_controller.find_symbiosis(lat, lon, kwp=kwp))

@api_bp.route('/regulatory')
def regulatory():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    return jsonify(regulatory_controller.get_regulatory_info(lat, lon))

@api_bp.route('/financial')
def financial():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    kwh = request.args.get('kwh', type=float, default=185000)
    return jsonify(financial_controller.calculate_financial(lat, lon, kwh))


@api_bp.route('/renewables')
def renewables():
    return renewables_controller.get_renewables()


@api_bp.route('/geocode')
def geocode_address():
    """
    Geocodifica una dirección.
    Parámetros: q (dirección a buscar)
    """
    q = request.args.get('q', '').strip()
    if not q or len(q) < 3:
        return jsonify({"error": "Parámetro q requerido (mínimo 3 caracteres)"}), 400
    if len(q) > 200:
        return jsonify({"error": "Consulta demasiado larga"}), 400
    return jsonify(geocoding_service.geocode(q))


@api_bp.route('/reverse-geocode')
def reverse_geocode():
    """
    Geocodificación inversa: coordenadas → dirección.
    Parámetros: lat, lon
    """
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({"error": "Parámetros lat y lon requeridos"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "Coordenadas fuera de rango"}), 400
    return jsonify(geocoding_service.reverse_geocode(lat, lon))

@api_bp.route('/weather')
def weather():
    return weather_controller.get_realtime_weather()

@api_bp.route('/building-summary')
def building_summary():
    return building_summary_controller.get_building_summary()

@api_bp.route('/province')
def province():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({"error": "lat y lon requeridos"}), 400
    return jsonify(geo_controller.get_province(lat, lon))

@api_bp.route('/llm', methods=['POST'])
def llm():
    return llm_controller.ask_llm()

@api_bp.route('/llm/analysis', methods=['POST'])
def llm_analysis():
    return llm_controller.ask_analysis()

@api_bp.route('/llm/health', methods=['GET'])
def llm_health():
    """
    GET /api/llm/health
    Comprueba disponibilidad de proveedores LLM.
    → { "ollama": bool, "groq": bool, "active": str }
    """
    import requests as req
    from flask import current_app

    # Comprobar Ollama
    ollama_ok = False
    try:
        ollama_model = current_app.config.get("OLLAMA_MODEL", "llama3.2")
        resp = req.post(
            "http://localhost:11434/api/chat",
            json={
                "model": ollama_model,
                "messages": [{"role": "user", "content": "ping"}],
                "options": {"num_predict": 1},
                "stream": False,
            },
            timeout=5,
        )
        ollama_ok = resp.status_code == 200
    except Exception:
        ollama_ok = False

    # Comprobar GROQ (solo verifica que la API key esté configurada y el import funciona)
    groq_ok = False
    try:
        groq_key = current_app.config.get("GROQ_API_KEY", "")
        if groq_key:
            from groq import Groq  # noqa: F401
            groq_ok = True
    except Exception:
        groq_ok = False

    from src.services import llm_service
    active = llm_service.get_active_provider()

    return jsonify({"ollama": ollama_ok, "groq": groq_ok, "active": active})


@api_bp.route('/provinces-geojson')
def provinces_geojson():
    from flask import send_from_directory
    import os
    geo_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'geo')
    return send_from_directory(geo_path, 'spain-provinces.geojson', mimetype='application/geo+json')


# ---------------------------------------------------------------------------
# Feature 3: Company registration endpoints
# ---------------------------------------------------------------------------

@api_bp.route('/companies', methods=['POST'])
def create_company():
    """
    POST /api/companies
    Registra una empresa en la red SymbioEnergia.
    """
    return company_controller.register_company()


@api_bp.route('/companies', methods=['GET'])
def list_companies():
    """
    GET /api/companies
    Lista empresas registradas, con filtrado opcional por radio geográfico.
    Query params: lat, lon, radius_km (default 5)
    """
    return company_controller.get_companies()


@api_bp.route('/analyze-invoice', methods=['POST'])
def analyze_invoice():
    """POST /api/analyze-invoice — extrae datos de consumo de una factura PDF."""
    from src.controllers import invoice_controller
    return invoice_controller.analyze_invoice()


@api_bp.route('/user/company', methods=['POST'])
def update_user_company():
    """POST /api/user/company — Guarda datos del análisis en el perfil del usuario."""
    from src.controllers import auth_controller as _auth
    return _auth.update_company_data()


@api_bp.route('/analysis/save', methods=['POST'])
def save_analysis():
    """POST /api/analysis/save — Persiste los resultados de los 5 agentes en la BD."""
    from src.controllers import analysis_save_controller
    return analysis_save_controller.save_analysis()


@api_bp.route('/user/analyses', methods=['GET'])
def user_analyses():
    """GET /api/user/analyses — Historial de análisis del usuario autenticado."""
    from src.controllers import analysis_save_controller
    return analysis_save_controller.get_user_analyses()


@api_bp.route('/user/companies', methods=['GET'])
def user_companies():
    """GET /api/user/companies — Edificios/empresas guardados del usuario."""
    return company_controller.get_user_companies()


@api_bp.route('/user/select-building', methods=['POST'])
def select_building():
    """POST /api/user/select-building — Establece el edificio activo en sesión."""
    return company_controller.select_building()
