import time
import requests
from typing import Optional

_WEATHER_CACHE: dict = {}
_WEATHER_CACHE_TTL = 900  # 15 minutes

_WMO_CODES = {
    0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado",
    3: "Nublado", 45: "Niebla", 48: "Niebla con escarcha",
    51: "Llovizna ligera", 53: "Llovizna moderada", 55: "Llovizna densa",
    61: "Lluvia ligera", 63: "Lluvia moderada", 65: "Lluvia intensa",
    71: "Nieve ligera", 73: "Nieve moderada", 75: "Nieve intensa",
    77: "Granizo", 80: "Chubascos ligeros", 81: "Chubascos moderados",
    82: "Chubascos intensos", 85: "Chubascos de nieve", 86: "Chubascos de nieve intensos",
    95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta con granizo intenso",
}

def _wmo_desc(code: Optional[int]) -> str:
    if code is None:
        return "Desconocido"
    return _WMO_CODES.get(int(code), f"Código WMO {code}")

def _cache_get(key):
    entry = _WEATHER_CACHE.get(key)
    if entry and (time.monotonic() - entry["ts"]) < _WEATHER_CACHE_TTL:
        return entry["data"]
    return None

def _cache_set(key, data):
    _WEATHER_CACHE[key] = {"data": data, "ts": time.monotonic()}

def get_realtime_weather(lat: float, lon: float) -> dict:
    key = (round(lat, 2), round(lon, 2))
    cached = _cache_get(key)
    if cached:
        return cached

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover,direct_radiation",
        "hourly": "temperature_2m,direct_radiation,cloud_cover,precipitation_probability",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum,weather_code",
        "forecast_days": 7,
        "timezone": "auto",
        "wind_speed_unit": "ms",
        "timeformat": "iso8601",
    }

    try:
        resp = requests.get(url, params=params, timeout=8)
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        raise RuntimeError(f"Open-Meteo forecast unavailable: {e}")

    current_raw = raw.get("current", {})
    current_vars = raw.get("current_units", {})

    # Slice only today's hourly data (first 24 entries)
    hourly_raw = raw.get("hourly", {})
    hourly_today = {
        "time": (hourly_raw.get("time") or [])[:24],
        "temperature_2m": (hourly_raw.get("temperature_2m") or [])[:24],
        "direct_radiation": (hourly_raw.get("direct_radiation") or [])[:24],
        "cloud_cover": (hourly_raw.get("cloud_cover") or [])[:24],
        "precipitation_probability": (hourly_raw.get("precipitation_probability") or [])[:24],
    }

    daily_raw = raw.get("daily", {})
    daily_codes = daily_raw.get("weather_code") or []
    daily = {
        "time": daily_raw.get("time") or [],
        "temperature_2m_max": daily_raw.get("temperature_2m_max") or [],
        "temperature_2m_min": daily_raw.get("temperature_2m_min") or [],
        "precipitation_sum": daily_raw.get("precipitation_sum") or [],
        "shortwave_radiation_sum": daily_raw.get("shortwave_radiation_sum") or [],
        "weather_code": daily_codes,
        "weather_description": [_wmo_desc(c) for c in daily_codes],
    }

    result = {
        "current": {
            "temperature_2m": current_raw.get("temperature_2m"),
            "relative_humidity_2m": current_raw.get("relative_humidity_2m"),
            "weather_code": current_raw.get("weather_code"),
            "weather_description": _wmo_desc(current_raw.get("weather_code")),
            "wind_speed_10m": current_raw.get("wind_speed_10m"),
            "cloud_cover": current_raw.get("cloud_cover"),
            "direct_radiation": current_raw.get("direct_radiation"),
            "time": current_raw.get("time"),
        },
        "hourly_today": hourly_today,
        "daily": daily,
        "timezone": raw.get("timezone", "Europe/Madrid"),
        "utc_offset": raw.get("utc_offset_seconds", 0),
        "data_source": "Open-Meteo Forecast API",
        "cached_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    _cache_set(key, result)
    return result
