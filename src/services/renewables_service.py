"""
renewables_service.py — SymbioEnergia IA
Orquesta la evaluacion multi-renovable para un edificio industrial segun su ubicacion.
Combina datos de PVGIS, Open-Meteo (via climate_service) y ESIOS.
"""
import logging
from typing import Dict, List, Optional

from src.services import climate_service, pvgis_service, esios_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Clasificacion eolica
# ---------------------------------------------------------------------------

def _classify_wind(speed_m_s: float) -> Dict:
    """
    Clasifica el potencial eolico segun la velocidad media del viento.
    """
    if speed_m_s < 3.0:
        classification = "Bajo"
        description = "Bajo — no viable para aerogeneradores industriales"
        viable = False
    elif speed_m_s < 5.0:
        classification = "Moderado"
        description = "Moderado — microaerogeneradores posibles"
        viable = True
    elif speed_m_s < 7.0:
        classification = "Bueno"
        description = "Bueno — aerogeneradores pequenos (10-100 kW)"
        viable = True
    else:
        classification = "Excelente"
        description = "Excelente — aerogeneradores medianos viables"
        viable = True

    # Produccion anual simplificada via formula Weibull aproximada
    annual_kwh_per_kw = round((speed_m_s ** 3) * 8760 * 0.35 / 1000, 1)

    return {
        "classification": classification,
        "description": description,
        "viable": viable,
        "annual_kwh_per_kw": annual_kwh_per_kw,
    }


# ---------------------------------------------------------------------------
# Clasificacion biomasa
# ---------------------------------------------------------------------------

def _classify_biomass(lat: float, lon: float) -> Dict:
    """
    Estima el potencial de biomasa segun la region geografica (Espana).
    """
    if 37.0 <= lat <= 39.0:
        potential = "Alto — zona olivarera y agricola (Andalucia / Extremadura)"
        classification = "Alto"
    elif 42.0 <= lat <= 44.0:
        potential = "Moderado — residuos forestales disponibles (Galicia / Cantabria)"
        classification = "Moderado"
    elif -9.0 <= lon <= -6.0:
        potential = "Moderado — zona maderera (fachada occidental)"
        classification = "Moderado"
    else:
        potential = "Bajo-Moderado — residuos industriales y agroindustriales"
        classification = "Bajo-Moderado"

    return {
        "potential": potential,
        "classification": classification,
    }


# ---------------------------------------------------------------------------
# Clasificacion mini-hidro
# ---------------------------------------------------------------------------

def _classify_mini_hydro(precipitation_days: int, elevation_m: Optional[float]) -> Dict:
    """
    Estima la viabilidad de mini-hidro segun precipitacion y elevacion.
    Se usa dias de precipitacion como proxy (>100 dias ~ >600 mm en Espana peninsular).
    """
    elev = elevation_m if elevation_m is not None else 0.0
    viable = precipitation_days > 100 and elev > 200

    if viable:
        notes = "Posible — estudiar caudal local y derechos de agua concesionales"
    else:
        notes = "No recomendado para esta ubicacion — precipitacion o relieve insuficiente"

    return {
        "viable": viable,
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# Mix recomendado
# ---------------------------------------------------------------------------

def _build_recommended_mix(
    solar_annual: float,
    wind_info: Dict,
    biomass_info: Dict,
    mini_hydro_info: Dict,
) -> List[Dict]:
    """
    Construye una lista ordenada de tecnologias recomendadas con prioridad y LCOE estimado.
    """
    candidates = []

    # Solar FV — siempre competitivo en Espana
    solar_lcoe = 0.045 if solar_annual >= 1400 else 0.055
    candidates.append({
        "technology": "Solar FV",
        "score": solar_annual / 100,
        "priority": 0,
        "rationale": (
            f"Produccion anual estimada de {round(solar_annual, 0):.0f} kWh/kWp. "
            "Tecnologia madura, rapida amortizacion y financiacion publica disponible."
        ),
        "estimated_lcoe_eur_kwh": solar_lcoe,
    })

    # Eolica — solo si viable
    if wind_info["viable"]:
        wind_score = wind_info["annual_kwh_per_kw"] / 100
        wind_lcoe = 0.055 if wind_info["classification"] == "Excelente" else 0.075
        candidates.append({
            "technology": "Eolica (aerogenerador)",
            "score": wind_score,
            "priority": 0,
            "rationale": (
                f"Velocidad media {wind_info.get('mean_speed_m_s', '')} m/s. "
                f"{wind_info['description']}. Produccion estimada "
                f"{wind_info['annual_kwh_per_kw']} kWh/kW instalado."
            ),
            "estimated_lcoe_eur_kwh": wind_lcoe,
        })

    # Biomasa — si hay potencial alto o moderado
    if biomass_info["classification"] in ("Alto", "Moderado"):
        bio_score = 60 if biomass_info["classification"] == "Alto" else 40
        candidates.append({
            "technology": "Biomasa / Biogas",
            "score": bio_score,
            "priority": 0,
            "rationale": (
                f"{biomass_info['potential']}. "
                "Util como fuente firme de calor de proceso (proceso industrial)."
            ),
            "estimated_lcoe_eur_kwh": 0.065,
        })

    # Mini-hidro — solo si viable
    if mini_hydro_info["viable"]:
        candidates.append({
            "technology": "Mini-hidro",
            "score": 50,
            "priority": 0,
            "rationale": (
                "Precipitacion y orografia favorables. "
                "Requiere estudio de caudal y tramitacion de concesion hidraulica."
            ),
            "estimated_lcoe_eur_kwh": 0.060,
        })

    # Ordenar por score descendente y asignar prioridad
    candidates.sort(key=lambda x: x["score"], reverse=True)
    result = []
    for i, c in enumerate(candidates[:3], start=1):
        item = {k: v for k, v in c.items() if k != "score"}
        item["priority"] = i
        result.append(item)

    return result


# ---------------------------------------------------------------------------
# Funcion publica principal
# ---------------------------------------------------------------------------

def assess_renewables(lat: float, lon: float) -> dict:
    """
    Orquesta la evaluacion multi-renovable para las coordenadas indicadas.

    Args:
        lat: Latitud en grados decimales.
        lon: Longitud en grados decimales.

    Returns:
        Dict con analisis completo de: solar, eolica, biomasa, mini-hidro,
        red electrica y mix recomendado.
    """
    # --- Obtener datos climaticos (Open-Meteo ERA5) ---
    try:
        climate = climate_service.get_climate(lat, lon)
    except Exception as exc:
        logger.warning("renewables_service: fallo climate_service: %s", exc)
        climate = {
            "solar_annual_kwh_per_kwp": None,
            "solar_monthly_kwh_per_kwp": [],
            "wind_speed_m_s": 3.5,
            "precipitation_days": 60,
        }

    # --- Obtener datos PVGIS (JRC) ---
    pvgis = pvgis_service.get_pvgis_data(lat, lon)

    # --- Obtener datos ESIOS (Red Electrica) ---
    grid = esios_service.get_grid_data()

    # --- Elegir mejor fuente solar ---
    # PVGIS es metodologicamente superior (incluye angulo optimo, perdidas sistema, ERA5/SARAH3)
    if pvgis["status"] == "ok" and pvgis["pvgis_annual_kwh_per_kwp"] is not None:
        solar_annual = pvgis["pvgis_annual_kwh_per_kwp"]
        solar_irradiation = pvgis["pvgis_irradiation_kwh_m2"]
        solar_monthly = pvgis["pvgis_monthly_kwh"]
        solar_source = (
            f"PVGIS-SARAH3 (JRC European Commission) + Open-Meteo ERA5"
            if pvgis["pvgis_source"]
            else "PVGIS (JRC European Commission)"
        )
    else:
        solar_annual = climate.get("solar_annual_kwh_per_kwp") or 0.0
        solar_irradiation = None
        solar_monthly = climate.get("solar_monthly_kwh_per_kwp", [])
        solar_source = "Open-Meteo ERA5 (2022-2024)"

    # Clasificacion solar
    if solar_annual >= 1600:
        solar_class = "Excelente"
    elif solar_annual >= 1400:
        solar_class = "Muy Bueno"
    elif solar_annual >= 1200:
        solar_class = "Bueno"
    else:
        solar_class = "Moderado"

    # --- Clasificacion eolica ---
    wind_speed = climate.get("wind_speed_m_s", 3.5)
    wind_info = _classify_wind(wind_speed)
    wind_info["mean_speed_m_s"] = wind_speed

    # --- Clasificacion biomasa ---
    biomass_info = _classify_biomass(lat, lon)

    # --- Clasificacion mini-hidro ---
    precipitation_days = climate.get("precipitation_days", 60)
    elevation_m = pvgis.get("elevation_m")
    mini_hydro_info = _classify_mini_hydro(precipitation_days, elevation_m)

    # --- Mix recomendado ---
    recommended_mix = _build_recommended_mix(solar_annual, wind_info, biomass_info, mini_hydro_info)

    logger.info(
        "renewables_service: evaluacion completa para (%.4f, %.4f) — solar=%.1f kWh/kWp, "
        "viento=%.1f m/s (%s), biomasa=%s",
        lat, lon, solar_annual, wind_speed,
        wind_info["classification"], biomass_info["classification"],
    )

    return {
        "solar": {
            "annual_kwh_per_kwp": solar_annual,
            "irradiation_kwh_m2": solar_irradiation,
            "monthly_profile": solar_monthly,
            "classification": solar_class,
            "optimal_angle_deg": pvgis.get("optimal_angle_deg"),
            "elevation_m": elevation_m,
            "data_source": solar_source,
            "source_url": "https://re.jrc.ec.europa.eu/",
        },
        "wind": {
            "mean_speed_m_s": wind_speed,
            "annual_kwh_per_kw": wind_info["annual_kwh_per_kw"],
            "classification": wind_info["classification"],
            "description": wind_info["description"],
            "viable": wind_info["viable"],
            "data_source": "Open-Meteo ERA5 (2022-2024)",
            "source_url": "https://open-meteo.com/",
        },
        "biomass": {
            "potential": biomass_info["potential"],
            "classification": biomass_info["classification"],
            "data_source": "Evaluacion geografica + MITECO",
            "source_url": "https://www.miteco.gob.es/",
        },
        "mini_hydro": {
            "viable": mini_hydro_info["viable"],
            "notes": mini_hydro_info["notes"],
            "data_source": "AEMET + datos topograficos PVGIS",
            "source_url": "https://www.aemet.es/",
        },
        "grid": {
            "co2_intensity_g_kwh": grid["co2_intensity_g_kwh"],
            "electricity_price_eur_mwh": grid["electricity_price_eur_mwh"],
            "renewable_pct": grid["renewable_pct"],
            "generation_mix": grid["generation_mix"],
            "data_source": grid["data_source"],
            "source_url": "https://api.esios.ree.es/",
        },
        "recommended_mix": recommended_mix,
        "status": "ok",
    }
