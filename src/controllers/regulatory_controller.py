from src.services import regulatory_service

def get_regulatory_info(lat: float, lon: float) -> dict:
    """
    Retorna el informe del Agente Normativa (Subvenciones estatales y regionales) delegando en regulatory_service.
    """
    try:
        return regulatory_service.get_subsidies(lat, lon)
    except Exception as e:
        return {"status": "error", "message": str(e), "lat": lat, "lon": lon}
