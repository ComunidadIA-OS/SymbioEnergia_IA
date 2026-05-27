"""
renewables_controller.py — SymbioEnergia IA
Controlador para el endpoint /api/renewables.
"""
import logging

from flask import request, jsonify

from src.services import renewables_service
from src.services.rate_limiter import is_rate_limited, get_client_ip

logger = logging.getLogger(__name__)


def get_renewables():
    """
    GET /api/renewables?lat=&lon=
    Devuelve la evaluacion multi-renovable para las coordenadas indicadas.
    """
    ip = get_client_ip()
    if is_rate_limited(f"renew_{ip}", max_per_window=20, window_seconds=60):
        logger.warning("renewables_controller: rate limit alcanzado para %s", ip)
        return jsonify({"error": "Too many requests"}), 429

    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)

    if lat is None or lon is None:
        return jsonify({"error": "lat and lon required"}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "Coordenadas fuera de rango"}), 400

    try:
        result = renewables_service.assess_renewables(lat, lon)
        return jsonify(result)
    except Exception as exc:
        logger.error(
            "renewables_controller: error inesperado para (%.4f, %.4f): %s", lat, lon, exc
        )
        return jsonify({"error": "Error interno del servidor", "status": "error"}), 500
