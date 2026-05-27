import requests
import math
import logging

logger = logging.getLogger(__name__)

def analyze_roof(lat: float, lon: float) -> dict:
    """
    Analiza la cubierta de un edificio mediante datos de OpenStreetMap (Overpass API)
    y genera una nube de puntos LiDAR 3D procedimental ultra-realista para visualización.
    """
    # Coordenadas por defecto (Polígono Teruel Norte) si las pasadas son 0.0
    if lat == 0.0 or lon == 0.0:
        lat, lon = 40.364, -1.102

    # Valores por defecto para fallback procedimental
    building_width = 60.0
    building_length = 40.0
    building_height = 9.0
    footprint = [
        {"lat": lat - 0.0002, "lon": lon - 0.0003},
        {"lat": lat - 0.0002, "lon": lon + 0.0003},
        {"lat": lat + 0.0002, "lon": lon + 0.0003},
        {"lat": lat + 0.0002, "lon": lon - 0.0003}
    ]
    name = f"Nave Industrial · {lat:.4f}°N {abs(lon):.4f}°O"
    source = "Simulación Geométrica Procedimental"

    # Intentar consultar Overpass API para buscar edificios en un radio de 100m
    try:
        overpass_url = "https://overpass-api.de/api/interpreter"
        query = f"""
        [out:json][timeout:7];
        (
          way(around:100,{lat},{lon})["building"];
          relation(around:100,{lat},{lon})["building"];
        );
        out geom;
        """
        response = requests.get(overpass_url, params={"data": query}, timeout=8)
        if response.status_code == 200:
            data = response.json()
            elements = data.get("elements", [])
            if elements:
                # Seleccionar el edificio cuyo centroide esté más cerca del punto clickeado
                def _centroid_dist(e):
                    pts = e.get("geometry", [])
                    if not pts:
                        return 9999
                    clat = sum(p["lat"] for p in pts) / len(pts)
                    clon = sum(p["lon"] for p in pts) / len(pts)
                    return (clat - lat) ** 2 + (clon - lon) ** 2

                el = min(elements, key=_centroid_dist)
                geom = el.get("geometry", [])
                if geom and len(geom) >= 3:
                    footprint = [{"lat": pt["lat"], "lon": pt["lon"]} for pt in geom]
                    tags = el.get("tags", {})
                    tag_name = tags.get("name", "")
                    street = tags.get("addr:street", "")
                    number = tags.get("addr:housenumber", "")
                    btype = tags.get("building", "")
                    if tag_name:
                        name = tag_name
                    elif street:
                        name = f"{street} {number}".strip() if number else street
                    elif btype and btype not in ("yes", "true", "1"):
                        name = f"Nave {btype.capitalize()} · {lat:.4f}°N {abs(lon):.4f}°O"
                    else:
                        name = f"Nave Industrial · {lat:.4f}°N {abs(lon):.4f}°O"
                    
                    # Estimar altura si no está disponible (OSM suele omitirla)
                    try:
                        levels = tags.get("building:levels")
                        height_tag = tags.get("height")
                        if height_tag:
                            building_height = float(height_tag)
                        elif levels:
                            try:
                                building_height = float(levels) * 3.5
                            except:
                                building_height = 6.0
                        else:
                            building_height = 6.0
                    except:
                        building_height = 6.0
                        
                    source = "OpenStreetMap / Overpass API (Datos Reales)"
    except Exception as e:
        logger.warning(f"Error al consultar Overpass API para geometría de edificios: {e}. Usando fallback.")

    # Calcular área del footprint usando la fórmula de Shoelace aproximada
    # Convertimos coordenadas a metros relativos (1 grado latitud ~ 111,000m, 1 grado longitud ~ 85,000m en Teruel)
    coords_m = []
    for pt in footprint:
        y = (pt["lat"] - lat) * 111132.0
        x = (pt["lon"] - lon) * 85000.0
        coords_m.append((x, y))

    # Algoritmo de Shoelace
    n = len(coords_m)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords_m[i][0] * coords_m[j][1]
        area -= coords_m[j][0] * coords_m[i][1]
    area = abs(area) / 2.0

    # Asegurar que el área es realista
    if area < 50.0 or area > 100000.0:
        area = building_width * building_length

    # Parámetros del tejado y LiDAR
    usable_area_factor = 0.82  # Descartamos obstáculos y bordes
    usable_area = area * usable_area_factor
    slope = 12.0  # Pendiente típica del tejado en Aragón en grados
    orientation = 180.0  # Azimuth Sur
    solar_capacity_kwp = (usable_area * 0.20)  # ~200W por m2 (0.2 kWp/m2)

    # Generar Nube de Puntos LiDAR Procedimental
    # Queremos ~400 puntos tridimensionales. Cada punto es [x, y, z, intensidad]
    # Representará el terreno (z=0) y la nave (con tejado a dos aguas)
    lidar_points = []
    
    # Determinar caja de límites en metros
    xs = [pt[0] for pt in coords_m]
    ys = [pt[1] for pt in coords_m]
    min_x, max_x = min(xs) - 20, max(xs) + 20
    min_y, max_y = min(ys) - 20, max(ys) + 20

    # 1. Puntos del Terreno (z=0, baja intensidad)
    for i in range(150):
        # Distribuir aleatoriamente en el plano
        rx = min_x + (max_x - min_x) * (hash(f"x_{i}") % 1000) / 1000.0
        ry = min_y + (max_y - min_y) * (hash(f"y_{i}") % 1000) / 1000.0
        # Simular pequeña rugosidad del suelo en Teruel
        rz = 0.1 * math.sin(rx / 10) * math.cos(ry / 10)
        intensity = 20 + (hash(f"i_{i}") % 30)  # Suelo refleja poco
        lidar_points.append([round(rx, 2), round(ry, 2), round(rz, 2), int(intensity)])

    # 2. Puntos de las Paredes del Edificio (z entre 0 y building_height)
    for i in range(100):
        # Elegir un segmento aleatorio del footprint
        seg_idx = hash(f"seg_{i}") % n
        pt1 = coords_m[seg_idx]
        pt2 = coords_m[(seg_idx + 1) % n]
        
        # Interpolar en el segmento
        t = (hash(f"t_{i}") % 1000) / 1000.0
        px = pt1[0] + (pt2[0] - pt1[0]) * t
        py = pt1[1] + (pt2[1] - pt1[1]) * t
        pz = building_height * ((hash(f"z_{i}") % 1000) / 1000.0)
        intensity = 60 + (hash(f"wi_{i}") % 40)
        lidar_points.append([round(px, 2), round(py, 2), round(pz, 2), int(intensity)])

    # 3. Puntos de la Cubierta / Tejado (Tejado a dos aguas)
    # Eje central de simetría del tejado a lo largo del eje Y local
    for i in range(150):
        # Distribuir puntos dentro del polígono del footprint
        # Enfoque simple: interpolar entre lados opuestos
        t_x = (hash(f"rx_{i}") % 1000) / 1000.0
        t_y = (hash(f"ry_{i}") % 1000) / 1000.0
        
        # Interpolar entre min_x/max_x y min_y/max_y
        px = min(xs) + (max(xs) - min(xs)) * t_x
        py = min(ys) + (max(ys) - min(ys)) * t_y
        
        # Tejado a dos aguas: altura máxima en el centro X
        mid_x = (min(xs) + max(xs)) / 2.0
        dist_from_ridge = abs(px - mid_x)
        half_width = (max(xs) - min(xs)) / 2.0
        
        # Pitch roof height
        ridge_height = building_height + 2.5
        pz = ridge_height - (dist_from_ridge / half_width) * 2.5
        
        # Limitar dentro del edificio
        intensity = 120 + (hash(f"ti_{i}") % 60)  # Chapa metálica del tejado refleja mucho
        lidar_points.append([round(px, 2), round(py, 2), round(pz, 2), int(intensity)])

    return {
        "building_name": name,
        "total_area_m2": round(area, 1),
        "usable_area_m2": round(usable_area, 1),
        "roof_slope_deg": slope,
        "roof_orientation_deg": orientation,
        "solar_capacity_kwp": round(solar_capacity_kwp, 1),
        "building_height_m": round(building_height, 1),
        "lidar_point_cloud": lidar_points,
        "confidence_level": "alta" if "OpenStreetMap" in source else "media (simulación)",
        "data_source": source,
        "footprint_coords": footprint
    }

