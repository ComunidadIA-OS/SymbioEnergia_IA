"""
esios_service.py — SymbioEnergia IA
Consulta la API de ESIOS (Red Electrica de Espana) para datos del mercado electrico:
CO2 de la red, precio del mercado diario y mix de generacion.
"""
import logging
from datetime import date

import requests
from flask import current_app

logger = logging.getLogger(__name__)

ESIOS_BASE = "https://api.esios.ree.es"

# Indicadores ESIOS
_INDICATOR_CO2 = 1739    # Factor de emision CO2 de la red (gCO2/kWh)
_INDICATOR_PRICE = 1001  # Precio spot del mercado diario (EUR/MWh)

# Valores de fallback basados en promedios recientes del sistema electrico espanol
_FALLBACK = {
    "co2_intensity_g_kwh": 180,
    "electricity_price_eur_mwh": 65,
    "renewable_pct": 60,
    "generation_mix": {
        "solar": 14,
        "wind": 24,
        "hydro": 12,
        "nuclear": 20,
        "gas": 18,
        "other": 12,
    },
    "status": "fallback",
    "data_source": "Valores de referencia historicos Red Electrica de Espana",
}


def _fetch_indicator(token: str, indicator_id: int) -> dict:
    """
    Llama a un indicador de la API ESIOS y devuelve el JSON de respuesta.
    """
    today = date.today().isoformat()
    url = f"{ESIOS_BASE}/indicators/{indicator_id}"
    headers = {
        "Accept": "application/json; application/vnd.esios-api-v1+json",
    }
    if token:
        headers["Authorization"] = f"Token token=\"{token}\""

    params = {
        "start_date": f"{today}T00:00:00",
        "end_date": f"{today}T23:59:59",
    }

    resp = requests.get(url, headers=headers, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _extract_latest_value(data: dict) -> float:
    """
    Extrae el valor mas reciente de la respuesta de un indicador ESIOS.
    """
    indicator = data.get("indicator", {})
    values = indicator.get("values", [])
    if not values:
        raise ValueError("Indicador ESIOS sin valores")
    # Tomar el ultimo valor disponible
    return float(values[-1].get("value", 0))


def get_grid_data() -> dict:
    """
    Obtiene datos del sistema electrico espanol de ESIOS.

    Returns:
        Dict con claves:
            co2_intensity_g_kwh       – intensidad de CO2 (gCO2/kWh)
            electricity_price_eur_mwh – precio spot (EUR/MWh)
            renewable_pct             – porcentaje renovable estimado (%)
            generation_mix            – dict con porcentajes por tecnologia
            status                    – "ok" o "fallback"
            data_source               – descripcion de la fuente
    """
    try:
        token = current_app.config.get("ESIOS_TOKEN", "")
    except RuntimeError:
        # Fuera de contexto Flask (tests, etc.)
        token = ""

    if not token:
        logger.info("esios_service: sin token ESIOS — usando fallback con valores de referencia")
        return dict(_FALLBACK)

    try:
        # Obtener precio spot
        price_data = _fetch_indicator(token, _INDICATOR_PRICE)
        price = _extract_latest_value(price_data)

        # Obtener intensidad CO2
        co2_data = _fetch_indicator(token, _INDICATOR_CO2)
        co2 = _extract_latest_value(co2_data)

        # Mix de generacion: estimacion basada en el CO2 (no disponible en indicadores gratuitos)
        # Se usa una distribucion tipica del sistema espanol ajustada al CO2 actual
        renewable_pct = max(0, min(100, round(100 - (co2 / 4.5), 1)))

        generation_mix = {
            "solar": 14,
            "wind": round(renewable_pct * 0.40, 1),
            "hydro": round(renewable_pct * 0.20, 1),
            "nuclear": 20,
            "gas": max(0, round(100 - renewable_pct - 20 - 14, 1)),
            "other": 6,
        }

        logger.info(
            "esios_service: datos obtenidos — precio=%.2f EUR/MWh, CO2=%.1f gCO2/kWh",
            price, co2,
        )

        return {
            "co2_intensity_g_kwh": round(co2, 1),
            "electricity_price_eur_mwh": round(price, 2),
            "renewable_pct": renewable_pct,
            "generation_mix": generation_mix,
            "status": "ok",
            "data_source": "Red Electrica de Espana — ESIOS API (tiempo real)",
        }

    except Exception as exc:
        logger.warning(
            "esios_service: fallo al consultar ESIOS: %s. Usando fallback.", exc
        )
        return dict(_FALLBACK)
