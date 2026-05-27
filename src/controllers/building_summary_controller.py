from flask import request, jsonify
from src import db
from src.services import lidar_service, climate_service, regulatory_service
from src.controllers.company_controller import _haversine_km
from src.services.rate_limiter import is_rate_limited, get_client_ip


def get_building_summary():
    if is_rate_limited(f'bsummary_{get_client_ip()}', max_per_window=30, window_seconds=60):
        return jsonify({'error': 'Demasiadas consultas. Espera un momento.'}), 429

    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "lat/lon out of valid range"}), 400

    # Área y altura reales desde el vector tile de Mapbox (si las pasa el cliente)
    area_m2_param  = request.args.get('area_m2', type=float)
    height_m_param = request.args.get('height_m', type=float)
    name_param     = request.args.get('name', type=str, default=None)

    try:
        climate    = climate_service.get_climate(lat, lon)
        regulatory = regulatory_service.get_subsidies(lat, lon)
    except Exception as e:
        return jsonify({"error": str(e), "lat": lat, "lon": lon}), 503

    # Si tenemos el área real del vector tile Mapbox, la usamos directamente
    if area_m2_param and area_m2_param > 10:
        total_area   = round(area_m2_param, 1)
        usable_area  = round(total_area * 0.82, 1)
        building_height = round(height_m_param, 1) if height_m_param else 9.0
        building_name = name_param or f"Edificio · {lat:.4f}°N {abs(lon):.4f}°O"
        confidence    = "alta (OpenStreetMap vectorial)"
        data_src      = "Mapbox Streets · OpenStreetMap"
    else:
        # Fallback: consultar Overpass / simulación procedural
        try:
            geo = lidar_service.analyze_roof(lat, lon)
        except Exception as e:
            return jsonify({"error": str(e), "lat": lat, "lon": lon}), 503
        total_area    = geo.get("total_area_m2", 0) or 0
        usable_area   = geo.get("usable_area_m2", 0) or 0
        building_height = geo.get("building_height_m", 9.0) or 9.0
        building_name   = geo.get("building_name", "Edificio")
        confidence      = geo.get("confidence_level", "media")
        data_src        = "OpenStreetMap + Open-Meteo + BOA"

    solar_annual_kwh_per_kwp = climate.get("solar_annual_kwh_per_kwp", 0) or 0
    capacity_kwp     = round(usable_area * 0.20, 1)           # ~200 W/m²
    solar_kwh_year   = round(capacity_kwp * solar_annual_kwh_per_kwp)
    panel_count      = round(capacity_kwp / 0.45)              # paneles de 450 W
    co2_savings_t    = round(solar_kwh_year * 0.00023, 1)      # 0.23 kg CO₂/kWh red española

    is_aragon  = regulatory.get("is_aragon", False) if isinstance(regulatory, dict) else False
    rate       = 0.40 if is_aragon else 0.30
    cap        = 500_000 if is_aragon else 150_000
    subsidy_max = min(round(capacity_kwp * 900 * rate), cap)

    # ODS aplicables
    ods = [
        {"num": "ODS 7",  "label": "Energía limpia",   "color": "#f9c74f"},
        {"num": "ODS 13", "label": "Acción climática", "color": "#2d6a4f"},
    ]
    if is_aragon or capacity_kwp > 50:
        ods.append({"num": "ODS 9", "label": "Industria e innovación", "color": "#4cc9f0"})

    registered_by = None
    try:
        from src.models.company_model import Company
        from sqlalchemy import select
        for c in db.session.execute(select(Company)).scalars().all():
            if c.lat and c.lon and _haversine_km(lat, lon, c.lat, c.lon) < 0.05:
                registered_by = {"id": c.id, "name": c.name}
                break
    except Exception:
        pass

    return jsonify({
        "building_name":    building_name,
        "total_area_m2":    total_area,
        "usable_area_m2":   usable_area,
        "solar_kwh_year":   solar_kwh_year,
        "panel_count":      panel_count,
        "co2_savings_t":    co2_savings_t,
        "subsidy_max_eur":  subsidy_max,
        "is_aragon":        is_aragon,
        "confidence_level": confidence,
        "data_source":      data_src,
        "ods":              ods,
        "registered_by":    registered_by,
    })
