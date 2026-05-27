"""
climate_service.py — SymbioEnergia IA
Fuente primaria de radiación: PVGIS (JRC · Comisión Europea).
Fuente meteo (temp/viento/precipitación): Open-Meteo Archive (ERA5).
Ninguna de las dos requiere clave de API.
"""
import logging
from typing import Dict, List, Tuple
from collections import defaultdict

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

# 3 años completos de datos históricos para promediar
_HISTORY_START = "2022-01-01"
_HISTORY_END   = "2024-12-31"

# Factor de pérdidas del sistema fotovoltaico (14 %)
_SYSTEM_LOSS_FACTOR = 0.86

# Conversión irradiancia de día soleado → hora de sol pico equivalente
_IRRADIANCE_PEAK_FACTOR = 0.8  # kW/m²

# Conversión viento máximo → viento medio (aprox.)
_WIND_MAX_TO_MEAN = 0.6

# ---------------------------------------------------------------------------
# Caché en memoria por sesión  { (lat_2dec, lon_2dec): dict }
# ---------------------------------------------------------------------------
_CACHE: Dict[Tuple[float, float], dict] = {}


# ---------------------------------------------------------------------------
# Fallback con datos climáticos reales de Aragón/España
# (Se usa cuando la API no está disponible)
# ---------------------------------------------------------------------------

def _fallback_aragon(lat: float, lon: float) -> dict:
    """
    Genera valores climáticos de respaldo basados en datos reales de Aragón/España.
    Usa interpolación geográfica a partir de estaciones de referencia:
      - Teruel:    40.34 N, -1.10 E  → alta insolación, inviernos fríos
      - Zaragoza:  41.65 N, -0.89 E  → insolación media-alta, viento Cierzo
      - Huesca:    42.14 N, -0.41 E  → insolación media, más lluvioso
    """
    # Promedios estación (kWh/kWp/mes) — valores reales estaciones AEMET/PVGIS Aragón
    _MONTHLY_REF = {
        "teruel":    [81, 101, 138, 159, 185, 206, 210, 192, 152, 111, 83, 72],
        "zaragoza":  [78,  98, 130, 150, 172, 190, 196, 178, 141, 105, 79, 69],
        "huesca":    [72,  92, 122, 142, 165, 182, 188, 170, 134,  98, 73, 63],
    }
    _TEMP_REF = {"teruel": 12.5, "zaragoza": 14.8, "huesca": 13.9}
    _HOURS_REF = {"teruel": 2770.0, "zaragoza": 2660.0, "huesca": 2560.0}
    _RAIN_REF  = {"teruel": 62, "zaragoza": 55, "huesca": 78}
    _WIND_REF  = {"teruel": 3.8, "zaragoza": 5.2, "huesca": 3.5}

    _STATIONS = {
        "teruel":   (40.34, -1.10),
        "zaragoza": (41.65, -0.89),
        "huesca":   (42.14, -0.41),
    }

    # Peso inverso de la distancia a cada estación
    dists = {k: max(((lat - v[0])**2 + (lon - v[1])**2) ** 0.5, 0.01)
             for k, v in _STATIONS.items()}
    weights = {k: 1.0 / d for k, d in dists.items()}
    total_w = sum(weights.values())

    def blend(ref: dict) -> float:
        return sum(ref[k] * weights[k] for k in ref) / total_w

    solar_monthly = [
        round(sum(_MONTHLY_REF[k][m] * weights[k] for k in _STATIONS) / total_w, 2)
        for m in range(12)
    ]
    solar_annual = round(sum(solar_monthly), 2)
    avg_temp    = round(blend(_TEMP_REF), 1)
    hours_sun   = round(blend(_HOURS_REF), 0)
    rain_days   = int(round(blend(_RAIN_REF)))
    wind_speed  = round(blend(_WIND_REF), 1)

    return {
        "solar_annual_kwh_per_kwp": solar_annual,
        "solar_monthly_kwh_per_kwp": solar_monthly,
        "avg_temp_c": avg_temp,
        "annual_hours_sun": hours_sun,
        "precipitation_days": rain_days,
        "wind_speed_m_s": wind_speed,
        "confidence_level": "media (fallback Aragón, datos reales de referencia)",
        "data_source": "Interpolación estaciones AEMET Aragón (Teruel/Zaragoza/Huesca)",
    }


# ---------------------------------------------------------------------------
# Cálculo de promedios mensuales a partir de series diarias
# ---------------------------------------------------------------------------

def _monthly_means(dates: List[str], values: List[float]) -> List[float]:
    """
    Dados vectores paralelos de fechas (YYYY-MM-DD) y valores diarios,
    devuelve una lista de 12 floats con el promedio de cada mes (1-12).
    Múltiples años se promedian entre sí.
    """
    sums: Dict[int, float] = defaultdict(float)
    counts: Dict[int, int] = defaultdict(int)
    for date_str, val in zip(dates, values):
        if val is None:
            continue
        month = int(date_str[5:7])
        sums[month] += val
        counts[month] += 1
    return [
        round(sums[m] / counts[m], 4) if counts[m] > 0 else 0.0
        for m in range(1, 13)
    ]


def _monthly_sums(dates: List[str], values: List[float]) -> List[float]:
    """
    Suma de valores diarios por mes, luego promedia entre años.
    Útil para precipitación (días/mes) y radiación solar (kWh/m²/mes).
    """
    # Acumula por (año, mes) para luego promediar los años
    year_month_sums: Dict[Tuple[int, int], float] = defaultdict(float)
    year_month_counts: Dict[Tuple[int, int], int] = defaultdict(int)
    for date_str, val in zip(dates, values):
        if val is None:
            continue
        year  = int(date_str[:4])
        month = int(date_str[5:7])
        year_month_sums[(year, month)] += val
        year_month_counts[(year, month)] += 1

    # Por cada mes (1-12), promedia la suma entre los distintos años
    month_totals: Dict[int, float] = defaultdict(float)
    month_year_count: Dict[int, int] = defaultdict(int)
    for (year, month), s in year_month_sums.items():
        month_totals[month] += s
        month_year_count[month] += 1

    return [
        round(month_totals[m] / month_year_count[m], 4) if month_year_count[m] > 0 else 0.0
        for m in range(1, 13)
    ]


# ---------------------------------------------------------------------------
# Llamada a la API de Open-Meteo Archive
# ---------------------------------------------------------------------------

def _fetch_open_meteo(lat: float, lon: float) -> dict:
    """
    Llama a la API Open-Meteo Archive y devuelve el dict de retorno
    en el formato estándar de get_climate().
    Lanza RuntimeError si la llamada falla o los datos son insuficientes.
    """
    params = {
        "latitude":  lat,
        "longitude": lon,
        "start_date": _HISTORY_START,
        "end_date":   _HISTORY_END,
        "daily": ",".join([
            "shortwave_radiation_sum",
            "precipitation_sum",
            "temperature_2m_max",
            "temperature_2m_min",
            "wind_speed_10m_max",
            "et0_fao_evapotranspiration",
        ]),
        "timezone": "Europe/Madrid",
    }

    response = requests.get(OPEN_METEO_ARCHIVE, params=params, timeout=8)
    response.raise_for_status()
    data = response.json()

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    if not dates:
        raise RuntimeError("Open-Meteo devolvió una respuesta vacía.")

    radiation_mj  = daily.get("shortwave_radiation_sum", [])   # MJ/m²/día
    precip        = daily.get("precipitation_sum", [])          # mm/día
    temp_max      = daily.get("temperature_2m_max", [])         # °C
    temp_min      = daily.get("temperature_2m_min", [])         # °C
    wind_max      = daily.get("wind_speed_10m_max", [])         # km/h

    n = len(dates)
    if n == 0:
        raise RuntimeError("Open-Meteo no devolvió datos diarios.")

    # --- Radiación solar ---
    # MJ/m²/día → kWh/m²/día (÷ 3.6)
    radiation_kwh = [r / 3.6 if r is not None else None for r in radiation_mj]

    # kWh/kWp/mes = suma_mensual(kWh/m²/día) × factor_pérdidas
    # Primero sumamos por mes (promediando los 3 años)
    monthly_kwh_m2 = _monthly_sums(dates, radiation_kwh)  # [kWh/m²/mes promedio]
    solar_monthly  = [round(v * _SYSTEM_LOSS_FACTOR, 2) for v in monthly_kwh_m2]
    solar_annual   = round(sum(solar_monthly), 2)

    # --- Horas de sol equivalentes ---
    # Suma anual de kWh/m²/día ÷ irradiancia de hora solar pico
    annual_kwh_m2 = sum(monthly_kwh_m2)
    annual_hours_sun = round(annual_kwh_m2 / _IRRADIANCE_PEAK_FACTOR, 0)

    # --- Temperatura media anual ---
    temp_avg_daily = [
        (mx + mn) / 2.0
        for mx, mn in zip(temp_max, temp_min)
        if mx is not None and mn is not None
    ]
    avg_temp = round(sum(temp_avg_daily) / len(temp_avg_daily), 1) if temp_avg_daily else 14.0

    # --- Días de precipitación (> 1 mm) ---
    # Número total de días con lluvia promediado por año
    total_years = len({d[:4] for d in dates})
    rainy_total = sum(1 for p in precip if p is not None and p > 1.0)
    precipitation_days = int(round(rainy_total / total_years)) if total_years > 0 else 60

    # --- Viento medio (km/h → m/s, luego max→mean) ---
    wind_valid = [w for w in wind_max if w is not None]
    if wind_valid:
        wind_mean_kmh = sum(wind_valid) / len(wind_valid) * _WIND_MAX_TO_MEAN
        wind_speed_ms = round(wind_mean_kmh / 3.6, 1)
    else:
        wind_speed_ms = 3.5

    return {
        "solar_annual_kwh_per_kwp": solar_annual,
        "solar_monthly_kwh_per_kwp": solar_monthly,
        "avg_temp_c": avg_temp,
        "annual_hours_sun": annual_hours_sun,
        "precipitation_days": precipitation_days,
        "wind_speed_m_s": wind_speed_ms,
        "confidence_level": "alta (Open-Meteo, datos reales)",
        "data_source": "Open-Meteo Archive API (ERA5)",
    }


# ---------------------------------------------------------------------------
# Función pública principal
# ---------------------------------------------------------------------------

def get_climate(lat: float, lon: float) -> dict:
    """
    Obtiene el análisis climático y solar para las coordenadas indicadas.

    Estrategia de fuentes:
    - Radiación solar: PVGIS (JRC · Comisión Europea) — precisión institucional.
    - Temperatura, viento, precipitación: Open-Meteo Archive (ERA5).
    - Fallback: datos de referencia de estaciones AEMET de Aragón.

    Args:
        lat: Latitud en grados decimales (−90 a 90).
        lon: Longitud en grados decimales (−180 a 180).

    Returns:
        Dict con claves:
            solar_annual_kwh_per_kwp  – producción anual estimada (kWh/kWp)
            solar_monthly_kwh_per_kwp – lista de 12 valores mensuales (kWh/kWp)
            avg_temp_c                – temperatura media anual (°C)
            annual_hours_sun          – horas de sol equivalentes anuales
            precipitation_days        – días con precipitación > 1 mm
            wind_speed_m_s            – velocidad media del viento (m/s)
            confidence_level          – descripción del nivel de confianza
            data_source               – fuente de los datos
            pvgis_irradiation_kwh_m2  – irradiación horizontal anual (kWh/m²)
            pvgis_source              – base de datos de radiación PVGIS
            optimal_angle_deg         – ángulo óptimo de inclinación (°)
            elevation_m               – elevación del lugar (m)
            solar_classification      – clasificación cualitativa del recurso solar

    Raises:
        ValueError: Si las coordenadas están fuera del rango válido.
    """
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise ValueError(f"Coordenadas fuera de rango: lat={lat}, lon={lon}")

    cache_key: Tuple[float, float] = (round(lat, 4), round(lon, 4))
    if cache_key in _CACHE:
        logger.debug("get_climate: caché hit para %s", cache_key)
        return _CACHE[cache_key]

    # ── 1. Radiación solar: PVGIS (fuente canónica institucional) ────────────
    from src.services.pvgis_service import get_pvgis_data
    pvgis = get_pvgis_data(lat, lon)

    # ── 2. Datos meteo: Open-Meteo / fallback Aragón ─────────────────────────
    try:
        meteo = _fetch_open_meteo(lat, lon)
        logger.info(
            "get_climate: meteo obtenidos de Open-Meteo para (%.4f, %.4f)", lat, lon
        )
    except Exception as exc:
        logger.warning(
            "get_climate: fallo Open-Meteo para (%.4f, %.4f): %s — usando fallback Aragón",
            lat, lon, exc,
        )
        meteo = _fallback_aragon(lat, lon)

    # ── 3. Combinar: PVGIS para solar, meteo para el resto ───────────────────
    if pvgis["status"] == "ok" and pvgis["pvgis_annual_kwh_per_kwp"]:
        solar_annual = pvgis["pvgis_annual_kwh_per_kwp"]
        solar_monthly = pvgis["pvgis_monthly_kwh"]
        data_source = "PVGIS · JRC Comisión Europea + Open-Meteo ERA5"
        confidence = "máxima (PVGIS · Joint Research Centre · Comisión Europea)"
        logger.info(
            "get_climate: radiación PVGIS para (%.4f, %.4f) — anual=%.1f kWh/kWp, fuente=%s",
            lat, lon, solar_annual, pvgis["pvgis_source"],
        )
    else:
        solar_annual = meteo["solar_annual_kwh_per_kwp"]
        solar_monthly = meteo["solar_monthly_kwh_per_kwp"]
        data_source = meteo["data_source"]
        confidence = meteo["confidence_level"]
        logger.warning("get_climate: PVGIS no disponible, usando solar de Open-Meteo/fallback")

    result = {
        "solar_annual_kwh_per_kwp": solar_annual,
        "solar_monthly_kwh_per_kwp": solar_monthly,
        "avg_temp_c": meteo["avg_temp_c"],
        "annual_hours_sun": meteo["annual_hours_sun"],
        "precipitation_days": meteo["precipitation_days"],
        "wind_speed_m_s": meteo["wind_speed_m_s"],
        "confidence_level": confidence,
        "data_source": data_source,
        "pvgis_irradiation_kwh_m2": pvgis.get("pvgis_irradiation_kwh_m2"),
        "pvgis_source": pvgis.get("pvgis_source"),
        "optimal_angle_deg": pvgis.get("optimal_angle_deg"),
        "elevation_m": pvgis.get("elevation_m"),
        "solar_classification": pvgis.get("classification"),
    }

    _CACHE[cache_key] = result
    return result
