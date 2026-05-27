"""
Servicio de geocodificación con rate limiting conservador.
Usa Google Geocoding API solo server-side, nunca expone la clave al cliente.
Fallback automático a Nominatim OSM si se supera el límite o la API falla.
"""
import time
import threading
import logging
import requests
from datetime import date
from flask import current_app

logger = logging.getLogger(__name__)

# Rate limit conservador: máximo 50 geocodificaciones por día
# (el free tier de Google da ~40.000/mes, pero usamos 50/día para no gastar créditos)
_DAILY_LIMIT = 50
_lock = threading.Lock()
_usage_state = {"date": None, "count": 0}

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
_NOMINATIM_UA = "SymbioEnergia-IA/1.0 contact@symbioenergia.es"

_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_GOOGLE_REVERSE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def _check_rate_limit() -> bool:
    """
    Devuelve True si se puede hacer una petición a Google, False si se ha alcanzado el límite diario.
    Thread-safe gracias al lock global.
    """
    today = date.today().isoformat()
    with _lock:
        if _usage_state["date"] != today:
            _usage_state["date"] = today
            _usage_state["count"] = 0
        if _usage_state["count"] >= _DAILY_LIMIT:
            return False
        _usage_state["count"] += 1
        return True


def _get_api_key() -> str:
    """Lee la clave API desde la configuración de Flask. Nunca la escribe en código."""
    try:
        return current_app.config.get("GOOGLE_GEOCODING_API_KEY", "")
    except RuntimeError:
        # Fuera de contexto de aplicación Flask (tests, etc.)
        return ""


def geocode(address: str) -> dict:
    """
    Geocodifica una dirección usando Google Geocoding API.

    Límite: 50 req/día para no gastar créditos.
    Si se supera el límite o la API falla, hace fallback a Nominatim.

    Returns:
        {
          "lat": float,
          "lon": float,
          "formatted_address": str,
          "source": "google" | "nominatim" | "error",
          "confidence": "high" | "medium" | "low"
        }
    """
    api_key = _get_api_key()

    if api_key and _check_rate_limit():
        with _lock:
            count = _usage_state["count"]
        logger.info("Google Geocoding: %s (uso hoy: %d/%d)", address, count, _DAILY_LIMIT)
        try:
            resp = requests.get(
                _GOOGLE_GEOCODE_URL,
                params={"address": address, "key": api_key, "region": "es", "language": "es"},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
                location = result["geometry"]["location"]
                loc_type = result["geometry"].get("location_type", "")
                confidence = (
                    "high" if loc_type in ("ROOFTOP", "RANGE_INTERPOLATED")
                    else "medium" if loc_type == "GEOMETRIC_CENTER"
                    else "low"
                )
                return {
                    "lat": location["lat"],
                    "lon": location["lng"],
                    "formatted_address": result.get("formatted_address", address),
                    "source": "google",
                    "confidence": confidence,
                }
            logger.warning("Google Geocoding sin resultados para: %s — estado: %s", address, data.get("status"))
        except Exception as exc:
            logger.error("Error en Google Geocoding para '%s': %s", address, exc)

    # Fallback a Nominatim (transparente para el cliente)
    logger.info("Geocoding fallback Nominatim para: %s", address)
    return _geocode_nominatim(address)


def _geocode_nominatim(address: str) -> dict:
    """Fallback con Nominatim OSM (gratis, sin límite práctico)."""
    try:
        resp = requests.get(
            _NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1, "countrycodes": "es"},
            headers={"User-Agent": _NOMINATIM_UA},
            timeout=8,
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            item = results[0]
            importance = float(item.get("importance", 0))
            confidence = "high" if importance > 0.6 else "medium" if importance > 0.3 else "low"
            return {
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "formatted_address": item.get("display_name", address),
                "source": "nominatim",
                "confidence": confidence,
            }
    except Exception as exc:
        logger.error("Error en Nominatim para '%s': %s", address, exc)

    return {
        "lat": None,
        "lon": None,
        "formatted_address": address,
        "source": "error",
        "confidence": "low",
    }


def reverse_geocode(lat: float, lon: float) -> dict:
    """
    Geocodificación inversa (coordenadas → dirección).
    Comparte el rate limit diario con geocode().

    Returns:
        {
          "lat": float,
          "lon": float,
          "formatted_address": str,
          "source": "google" | "nominatim" | "error",
          "confidence": "high" | "medium" | "low"
        }
    """
    api_key = _get_api_key()

    if api_key and _check_rate_limit():
        with _lock:
            count = _usage_state["count"]
        logger.info("Google Reverse Geocoding: %.6f,%.6f (uso hoy: %d/%d)", lat, lon, count, _DAILY_LIMIT)
        try:
            resp = requests.get(
                _GOOGLE_REVERSE_URL,
                params={"latlng": f"{lat},{lon}", "key": api_key, "language": "es"},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
                return {
                    "lat": lat,
                    "lon": lon,
                    "formatted_address": result.get("formatted_address", f"{lat},{lon}"),
                    "source": "google",
                    "confidence": "high",
                }
            logger.warning("Google Reverse Geocoding sin resultados para: %.6f,%.6f — estado: %s", lat, lon, data.get("status"))
        except Exception as exc:
            logger.error("Error en Google Reverse Geocoding para %.6f,%.6f: %s", lat, lon, exc)

    # Fallback a Nominatim
    logger.info("Reverse Geocoding fallback Nominatim para: %.6f,%.6f", lat, lon)
    try:
        resp = requests.get(
            _NOMINATIM_REVERSE_URL,
            params={"lat": lat, "lon": lon, "format": "json"},
            headers={"User-Agent": _NOMINATIM_UA},
            timeout=8,
        )
        resp.raise_for_status()
        item = resp.json()
        if item and "display_name" in item:
            return {
                "lat": lat,
                "lon": lon,
                "formatted_address": item["display_name"],
                "source": "nominatim",
                "confidence": "medium",
            }
    except Exception as exc:
        logger.error("Error en Nominatim reverse para %.6f,%.6f: %s", lat, lon, exc)

    return {
        "lat": lat,
        "lon": lon,
        "formatted_address": f"{lat},{lon}",
        "source": "error",
        "confidence": "low",
    }
