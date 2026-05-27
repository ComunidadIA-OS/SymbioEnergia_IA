from flask import request, jsonify
from src.services import weather_service

def get_realtime_weather():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "lat/lon out of valid range"}), 400
    try:
        data = weather_service.get_realtime_weather(lat, lon)
        return jsonify(data)
    except RuntimeError as e:
        return jsonify({"error": str(e), "lat": lat, "lon": lon}), 503
