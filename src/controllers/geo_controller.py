from src.services import lidar_service, province_service, geoapi_service, catastro_service
import logging

logger = logging.getLogger(__name__)

def get_geo_analysis(lat: float, lon: float) -> dict:
    try:
        result = lidar_service.analyze_roof(lat, lon)
        province = province_service.find_province_by_coords(lat, lon)
        if province:
            result["province"] = province
        location = geoapi_service.get_location_info(lat, lon)
        if location.get("ine_cpro") and location.get("ine_cmun"):
            mun = catastro_service.find_municipio_by_ine(location["ine_cpro"], location["ine_cmun"])
            if mun:
                result["catastro_municipio"] = mun
        result["location"] = location
        return result
    except Exception as e:
        logger.error("Error en geo_analysis: %s", e)
        return {"status": "error", "message": str(e), "lat": lat, "lon": lon}


def get_province(lat: float, lon: float) -> dict:
    try:
        province = province_service.find_province_by_coords(lat, lon)
        if province:
            return province
        return {"error": "No se encontró provincia para estas coordenadas"}
    except Exception as e:
        return {"error": str(e)}
