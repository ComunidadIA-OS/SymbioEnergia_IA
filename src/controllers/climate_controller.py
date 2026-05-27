from src.services import climate_service

def get_climate_analysis(lat: float, lon: float) -> dict:
    """
    Retorna el informe del Agente Clima delegando en climate_service.
    """
    try:
        return climate_service.get_climate(lat, lon)
    except Exception as e:
        return {"status": "error", "message": str(e), "lat": lat, "lon": lon}
