"""Tests unitarios — financial_service: ROI, payback, VAN/TIR con deps mockeadas."""
from unittest.mock import patch
import pytest
from src.services.financial_service import calculate_roi

_GEO = {'usable_area_m2': 1200.0, 'solar_capacity_kwp': 200.0}
_CLIMATE = {'solar_annual_kwh_per_kwp': 1500.0}
_REG_ARAGON = {'is_aragon': True}
_REG_OUTSIDE = {'is_aragon': False}

_PATCHES = {
    'lidar': 'src.services.lidar_service.analyze_roof',
    'climate': 'src.services.climate_service.get_climate',
    'regulatory': 'src.services.regulatory_service.get_subsidies',
}


def _roi_aragon(kwh: float = 185_000.0):
    with patch(_PATCHES['lidar'], return_value=_GEO), \
         patch(_PATCHES['climate'], return_value=_CLIMATE), \
         patch(_PATCHES['regulatory'], return_value=_REG_ARAGON):
        return calculate_roi(40.364, -1.102, kwh)


def _roi_outside(kwh: float = 185_000.0):
    with patch(_PATCHES['lidar'], return_value=_GEO), \
         patch(_PATCHES['climate'], return_value=_CLIMATE), \
         patch(_PATCHES['regulatory'], return_value=_REG_OUTSIDE):
        return calculate_roi(40.4, -3.7, kwh)


# ─────────────────────── estructura del resultado ───────────────────────────

def test_result_has_all_required_keys():
    result = _roi_aragon()
    required = (
        'recommended_capacity_kwp', 'total_investment_eur', 'subsidy_amount_eur',
        'net_investment_eur', 'payback_years_without_subsidy', 'payback_years_with_subsidy',
        'npv_15_years_eur', 'irr_15_years_percent', 'financing_scenario',
        'data_source', 'confidence_level',
    )
    for key in required:
        assert key in result, f"Clave ausente: {key}"


def test_financing_scenario_has_required_keys():
    result = _roi_aragon()
    required = (
        'loan_amount_eur', 'own_capital_eur', 'annual_loan_payment_eur',
        'loan_period_years', 'loan_interest_rate_percent',
    )
    for key in required:
        assert key in result['financing_scenario'], f"Clave ausente en financing_scenario: {key}"


# ─────────────────────── lógica financiera ──────────────────────────────────

def test_aragon_subsidy_is_40_percent_of_investment():
    result = _roi_aragon()
    ratio = result['subsidy_amount_eur'] / result['total_investment_eur']
    assert abs(ratio - 0.40) < 0.01, f"Ratio esperado 0.40, obtenido {ratio:.3f}"


def test_outside_aragon_subsidy_is_30_percent():
    result = _roi_outside()
    ratio = result['subsidy_amount_eur'] / result['total_investment_eur']
    assert abs(ratio - 0.30) < 0.01, f"Ratio esperado 0.30, obtenido {ratio:.3f}"


def test_net_investment_less_than_gross():
    result = _roi_aragon()
    assert result['net_investment_eur'] < result['total_investment_eur']


def test_payback_with_subsidy_less_than_without():
    result = _roi_aragon()
    assert result['payback_years_with_subsidy'] < result['payback_years_without_subsidy']


def test_payback_positive():
    result = _roi_aragon()
    assert result['payback_years_with_subsidy'] > 0
    assert result['payback_years_without_subsidy'] > 0


def test_capacity_non_negative():
    result = _roi_aragon()
    assert result['recommended_capacity_kwp'] >= 10.0


def test_investment_positive():
    result = _roi_aragon()
    assert result['total_investment_eur'] > 0


# ─────────────────────── validación de inputs ────────────────────────────────

def test_invalid_kwh_zero_uses_default():
    result = _roi_aragon(kwh=0)
    assert result['recommended_capacity_kwp'] > 0


def test_invalid_kwh_negative_uses_default():
    result = _roi_aragon(kwh=-5000)
    assert result['recommended_capacity_kwp'] > 0


def test_very_large_kwh_uses_default():
    result = _roi_aragon(kwh=999_999_999)
    assert result['recommended_capacity_kwp'] > 0


# ─────────────────────── financiación bancaria ───────────────────────────────

def test_loan_plus_capital_equals_net_investment():
    result = _roi_aragon()
    fs = result['financing_scenario']
    total_financed = fs['loan_amount_eur'] + fs['own_capital_eur']
    assert abs(total_financed - result['net_investment_eur']) < 1.0


def test_loan_period_is_7_years():
    result = _roi_aragon()
    assert result['financing_scenario']['loan_period_years'] == 7


# ─────────────────────── fallback cuando servicios externos fallan ────────────

def test_falls_back_gracefully_when_lidar_fails():
    with patch(_PATCHES['lidar'], side_effect=Exception("LiDAR no disponible")), \
         patch(_PATCHES['climate'], return_value=_CLIMATE), \
         patch(_PATCHES['regulatory'], return_value=_REG_ARAGON):
        result = calculate_roi(40.364, -1.102, 185_000)
    assert result['recommended_capacity_kwp'] > 0


def test_falls_back_gracefully_when_climate_fails():
    with patch(_PATCHES['lidar'], return_value=_GEO), \
         patch(_PATCHES['climate'], side_effect=Exception("Open-Meteo no disponible")), \
         patch(_PATCHES['regulatory'], return_value=_REG_ARAGON):
        result = calculate_roi(40.364, -1.102, 185_000)
    assert result['recommended_capacity_kwp'] > 0
