from typing import Optional
from src.services import symbiosis_service

def find_symbiosis(lat: float, lon: float, kwp: Optional[float] = None) -> dict:
    """
    Retorna el informe del Agente Simbiosis (Comunidades Energéticas, HRIA y balance mensual).
    """
    try:
        return symbiosis_service.find_compatible_companies(lat, lon, kwp=kwp)
    except Exception as e:
        return {"status": "error", "message": str(e), "lat": lat, "lon": lon}
