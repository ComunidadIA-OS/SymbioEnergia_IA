"""
GeoAPI.es + Nominatim → municipio, provincia y CCAA reales por coordenadas.
Flujo: lat/lon → Nominatim reverse → postal code → GeoAPI.es → INE code + CCAA
"""
import requests
import logging
from typing import Optional
from flask import current_app

logger = logging.getLogger(__name__)

_CACHE: dict = {}

PROVINCE_TO_CCAA = {
    "Álava": "País Vasco", "Araba": "País Vasco",
    "Gipuzkoa": "País Vasco", "Guipúzcoa": "País Vasco",
    "Bizkaia": "País Vasco", "Vizcaya": "País Vasco",
    "Navarra": "Navarra", "Nafarroa": "Navarra",
    "La Rioja": "La Rioja", "Rioja": "La Rioja",
    "Huesca": "Aragón", "Teruel": "Aragón", "Zaragoza": "Aragón",
    "Barcelona": "Cataluña", "Girona": "Cataluña", "Lleida": "Cataluña",
    "Tarragona": "Cataluña", "Gerona": "Cataluña", "Lérida": "Cataluña",
    "Madrid": "Madrid",
    "Albacete": "Castilla-La Mancha", "Ciudad Real": "Castilla-La Mancha",
    "Cuenca": "Castilla-La Mancha", "Guadalajara": "Castilla-La Mancha",
    "Toledo": "Castilla-La Mancha",
    "Ávila": "Castilla y León", "Burgos": "Castilla y León",
    "León": "Castilla y León", "Palencia": "Castilla y León",
    "Salamanca": "Castilla y León", "Segovia": "Castilla y León",
    "Soria": "Castilla y León", "Valladolid": "Castilla y León",
    "Zamora": "Castilla y León",
    "Almería": "Andalucía", "Cádiz": "Andalucía", "Córdoba": "Andalucía",
    "Granada": "Andalucía", "Huelva": "Andalucía", "Jaén": "Andalucía",
    "Málaga": "Andalucía", "Sevilla": "Andalucía",
    "Alicante": "Comunidad Valenciana", "Alacant": "Comunidad Valenciana",
    "Castellón": "Comunidad Valenciana", "Castelló": "Comunidad Valenciana",
    "Valencia": "Comunidad Valenciana", "València": "Comunidad Valenciana",
    "Badajoz": "Extremadura", "Cáceres": "Extremadura",
    "A Coruña": "Galicia", "La Coruña": "Galicia",
    "Lugo": "Galicia", "Ourense": "Galicia", "Orense": "Galicia",
    "Pontevedra": "Galicia",
    "Asturias": "Asturias",
    "Cantabria": "Cantabria",
    "Baleares": "Islas Baleares", "Illes Balears": "Islas Baleares",
    "Las Palmas": "Canarias", "Santa Cruz de Tenerife": "Canarias",
    "Murcia": "Murcia",
}


def get_location_info(lat: float, lon: float) -> dict:
    """
    Retorna municipio, provincia, CCAA y código postal para las coordenadas dadas.
    Usa caché en memoria para evitar peticiones duplicadas.
    """
    key = (round(lat, 3), round(lon, 3))
    if key in _CACHE:
        return _CACHE[key]

    result = _fetch_location(lat, lon)
    _CACHE[key] = result
    return result


def _fetch_location(lat: float, lon: float) -> dict:
    base = {
        "municipio": "Desconocido",
        "provincia": "Desconocido",
        "ccaa": "España",
        "codigo_postal": None,
        "ine_cpro": None,
        "ine_cmun": None,
        "source": "fallback",
    }

    # 1. Nominatim reverse geocode
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lon, "format": "json", "addressdetails": 1},
            headers={"User-Agent": "SymbioEnergia-IA/1.0"},
            timeout=6,
        )
        r.raise_for_status()
        addr = r.json().get("address", {})

        municipality = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("municipality")
            or "Desconocido"
        )
        province_raw = addr.get("province") or addr.get("state") or "Desconocido"
        # Nominatim sometimes returns "Province of X" or "X Province"
        province = province_raw.replace("Province of ", "").replace(" Province", "").strip()
        postal_code = addr.get("postcode")

        base.update({
            "municipio": municipality,
            "provincia": province,
            "ccaa": PROVINCE_TO_CCAA.get(province, "España"),
            "codigo_postal": postal_code,
            "source": "nominatim",
        })

    except Exception as e:
        logger.warning("Nominatim reverse failed: %s", e)
        return base

    # 2. GeoAPI.es enrichment: get INE codes + official CCAA from postal code
    if postal_code:
        try:
            api_key = current_app.config.get("GEOAPI_ES_KEY", "")
            if api_key:
                r2 = requests.get(
                    "https://apiv1.geoapi.es/codigos-postales",
                    params={"CODI_POSTAL": postal_code, "type": "json", "key": api_key},
                    timeout=5,
                )
                r2.raise_for_status()
                data = r2.json()
                items = data.get("data") or data.get("municipios") or []
                if items:
                    item = items[0]
                    cpro = item.get("CPRO") or item.get("cpro")
                    cmun = item.get("CMUN") or item.get("cmun")
                    mun_name = item.get("NOMBRE_MUNICIPIO") or item.get("nombre") or base["municipio"]
                    # Get CCAA from GeoAPI.es province code
                    ccaa = _ccaa_from_cpro(cpro) or base["ccaa"]
                    base.update({
                        "municipio": mun_name,
                        "ine_cpro": cpro,
                        "ine_cmun": cmun,
                        "ccaa": ccaa,
                        "source": "geoapi.es",
                    })
        except Exception as e:
            logger.warning("GeoAPI.es enrichment failed: %s", e)

    return base


def _ccaa_from_cpro(cpro: Optional[str]) -> Optional[str]:
    """Map province INE code to CCAA."""
    if not cpro:
        return None
    code = int(cpro)
    mapping = {
        1: "País Vasco", 2: "Castilla-La Mancha", 3: "Comunidad Valenciana",
        4: "Andalucía", 5: "Castilla y León", 6: "Extremadura",
        7: "Islas Baleares", 8: "Cataluña", 9: "Castilla y León",
        10: "Extremadura", 11: "Andalucía", 12: "Comunidad Valenciana",
        13: "Castilla-La Mancha", 14: "Andalucía", 15: "Galicia",
        16: "Castilla-La Mancha", 17: "Cataluña", 18: "Andalucía",
        19: "Castilla-La Mancha", 20: "País Vasco", 21: "Andalucía",
        22: "Aragón", 23: "Andalucía", 24: "Castilla y León",
        25: "Cataluña", 26: "La Rioja", 27: "Galicia",
        28: "Madrid", 29: "Andalucía", 30: "Murcia",
        31: "Navarra", 32: "Galicia", 33: "Asturias",
        34: "Castilla y León", 35: "Canarias", 36: "Galicia",
        37: "Castilla y León", 38: "Canarias", 39: "Cantabria",
        40: "Castilla y León", 41: "Andalucía", 42: "Castilla y León",
        43: "Cataluña", 44: "Aragón", 45: "Castilla-La Mancha",
        46: "Comunidad Valenciana", 47: "Castilla y León", 48: "País Vasco",
        49: "Castilla y León", 50: "Aragón",
        51: "Ceuta", 52: "Melilla",
    }
    return mapping.get(code)
