from src.services import financial_service

def calculate_financial(lat: float, lon: float, kwh_annual: float) -> dict:
    """
    Retorna el informe del Agente Financiero (TIR, VAN, Payback y Financiación) delegando en financial_service.
    """
    try:
        return financial_service.calculate_roi(lat, lon, kwh_annual)
    except Exception as e:
        return {"status": "error", "message": str(e), "lat": lat, "lon": lon, "kwh": kwh_annual}
