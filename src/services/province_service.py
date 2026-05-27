import json
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_GEOJSON_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'geo', 'spain-provinces.geojson')
_PROVINCES_CSV = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'geo', 'provincias_catastro.csv')

_geojson_data = None
_province_names = {}


def _load_geojson():
    global _geojson_data
    if _geojson_data is not None:
        return _geojson_data
    try:
        path = os.path.abspath(_GEOJSON_PATH)
        with open(path, 'r', encoding='utf-8') as f:
            _geojson_data = json.load(f)
        logger.info("Provincias GeoJSON cargado: %d features", len(_geojson_data.get("features", [])))
    except Exception as e:
        logger.warning("Error cargando GeoJSON de provincias: %s", e)
        _geojson_data = {"features": []}
    return _geojson_data


def _load_province_names():
    global _province_names
    if _province_names:
        return _province_names
    try:
        path = os.path.abspath(_PROVINCES_CSV)
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
            parts = line.split(',', 1)
            if len(parts) == 2:
                code = parts[0].strip()
                name = parts[1].strip().strip('"')
                _province_names[code] = name
    except Exception as e:
        logger.warning("Error cargando nombres de provincias: %s", e)
    return _province_names


def point_in_polygon(lat: float, lon: float, polygon: list) -> bool:
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def find_province_by_coords(lat: float, lon: float) -> Optional[dict]:
    data = _load_geojson()
    names = _load_province_names()
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})
        if geom.get("type") == "MultiPolygon":
            for polygon_group in geom.get("coordinates", []):
                for ring in polygon_group:
                    coords = [(p[1], p[0]) for p in ring]
                    if point_in_polygon(lat, lon, coords):
                        ine_code = props.get("cartodb_id")
                        name = props.get("name") or names.get(str(ine_code).zfill(2)) if ine_code else None
                        return {
                            "ine_cpro": str(ine_code).zfill(2) if ine_code else None,
                            "nombre": name or props.get("name", "Desconocida"),
                            "source": "geojson",
                        }
        elif geom.get("type") == "Polygon":
            for ring in geom.get("coordinates", []):
                coords = [(p[1], p[0]) for p in ring]
                if point_in_polygon(lat, lon, coords):
                    ine_code = props.get("cartodb_id")
                    name = props.get("name") or names.get(str(ine_code).zfill(2)) if ine_code else None
                    return {
                        "ine_cpro": str(ine_code).zfill(2) if ine_code else None,
                        "nombre": name or props.get("name", "Desconocida"),
                        "source": "geojson",
                    }
    return None
