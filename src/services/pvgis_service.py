"""
pvgis_service.py — SymbioEnergia IA
Obtiene datos de irradiacion y produccion solar de la API publica PVGIS (JRC European Commission).
No requiere clave de API.
"""
import logging
from typing import Optional, List

import requests

logger = logging.getLogger(__name__)

PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"

# Tabla de clasificacion solar por produccion anual (kWh/kWp)
def _classify_solar(annual_kwh_per_kwp: Optional[float]) -> str:
    if annual_kwh_per_kwp is None:
        return "Sin datos"
    if annual_kwh_per_kwp >= 1600:
        return "Excelente"
    if annual_kwh_per_kwp >= 1400:
        return "Muy Bueno"
    if annual_kwh_per_kwp >= 1200:
        return "Bueno"
    return "Moderado"


def get_pvgis_data(lat: float, lon: float) -> dict:
    """
    Llama a la API PVGIS PVcalc y devuelve datos de produccion solar.

    Args:
        lat: Latitud en grados decimales.
        lon: Longitud en grados decimales.

    Returns:
        Dict con claves:
            pvgis_annual_kwh_per_kwp  – produccion anual estimada (kWh/kWp)
            pvgis_irradiation_kwh_m2  – irradiacion anual (kWh/m2)
            pvgis_monthly_kwh         – lista de 12 valores mensuales (kWh/kWp)
            pvgis_source              – nombre de la base de datos de radiacion
            elevation_m               – elevacion del lugar (m)
            optimal_angle_deg         – angulo optimo de inclinacion (grados)
            classification            – clasificacion cualitativa
            status                    – "ok" o "fallback"
    """
    params = {
        "lat": lat,
        "lon": lon,
        "peakpower": 1,
        "loss": 14,
        "outputformat": "json",
        "pvtechchoice": "crystSi",
        "mountingplace": "building",
        "optimalinclination": 1,
        "optimalangles": 1,
    }

    try:
        response = requests.get(PVGIS_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        outputs = data.get("outputs", {})
        totals = outputs.get("totals", {}).get("fixed", {})
        monthly_raw: list = outputs.get("monthly", {}).get("fixed", [])
        inputs = data.get("inputs", {})

        annual_kwh = totals.get("E_y")
        irradiation = totals.get("H(i)_y")
        pvgis_source = inputs.get("meteo_data", {}).get("radiation_db", "PVGIS-SARAH3")
        elevation_m = inputs.get("location", {}).get("elevation")
        optimal_angle = inputs.get("mounting_system", {}).get("fixed", {}).get("slope", {}).get("value")

        # Extraer valores mensuales E_m (kWh/kWp/mes)
        monthly_kwh: List[float] = []
        for entry in monthly_raw:
            val = entry.get("E_m")
            monthly_kwh.append(round(float(val), 2) if val is not None else 0.0)

        # Garantizar exactamente 12 valores
        if len(monthly_kwh) != 12:
            monthly_kwh = (monthly_kwh + [0.0] * 12)[:12]

        classification = _classify_solar(annual_kwh)

        logger.info(
            "pvgis_service: datos obtenidos para (%.4f, %.4f) — anual=%.1f kWh/kWp, fuente=%s",
            lat, lon, annual_kwh or 0, pvgis_source,
        )

        return {
            "pvgis_annual_kwh_per_kwp": round(float(annual_kwh), 2) if annual_kwh is not None else None,
            "pvgis_irradiation_kwh_m2": round(float(irradiation), 2) if irradiation is not None else None,
            "pvgis_monthly_kwh": monthly_kwh,
            "pvgis_source": pvgis_source,
            "elevation_m": round(float(elevation_m), 1) if elevation_m is not None else None,
            "optimal_angle_deg": round(float(optimal_angle), 1) if optimal_angle is not None else None,
            "classification": classification,
            "status": "ok",
        }

    except Exception as exc:
        logger.warning(
            "pvgis_service: fallo al consultar PVGIS para (%.4f, %.4f): %s. Retornando fallback.",
            lat, lon, exc,
        )
        return {
            "pvgis_annual_kwh_per_kwp": None,
            "pvgis_irradiation_kwh_m2": None,
            "pvgis_monthly_kwh": [],
            "pvgis_source": None,
            "elevation_m": None,
            "optimal_angle_deg": None,
            "classification": "Sin datos",
            "status": "fallback",
        }
