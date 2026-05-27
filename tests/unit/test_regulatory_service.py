"""Tests unitarios — regulatory_service: lógica de subvenciones por geocerca."""
import pytest
from src.services.regulatory_service import get_subsidies

LAT_TERUEL = 40.364
LON_TERUEL = -1.102
LAT_MADRID = 40.416
LON_MADRID = -3.703


def test_aragon_coords_unlock_step_aragon():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    assert result['is_aragon'] is True
    names = [s['nombre'] for s in result['eligible_subsidies']]
    assert any('STEP Aragón' in n for n in names)


def test_outside_aragon_returns_generic_regional():
    result = get_subsidies(LAT_MADRID, LON_MADRID)
    assert result['is_aragon'] is False
    names = [s['nombre'] for s in result['eligible_subsidies']]
    assert not any('STEP Aragón' in n for n in names)


def test_zero_coords_default_to_aragon():
    result = get_subsidies(0.0, 0.0)
    assert result['is_aragon'] is True


def test_european_projects_always_present():
    for lat, lon in [(LAT_TERUEL, LON_TERUEL), (LAT_MADRID, LON_MADRID)]:
        result = get_subsidies(lat, lon)
        assert len(result['european_projects']) >= 5


def test_aragon_step_cap_is_500k():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    step = next(s for s in result['eligible_subsidies'] if 'STEP Aragón' in s['nombre'])
    assert step['importe_max'] <= 500_000.0


def test_aragon_step_percentage_is_40():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    step = next(s for s in result['eligible_subsidies'] if 'STEP Aragón' in s['nombre'])
    assert step['porcentaje_max'] == 40.0


def test_result_has_required_keys():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    required = ('is_aragon', 'regional_status', 'eligible_subsidies',
                'european_projects', 'data_source', 'confidence_level')
    for key in required:
        assert key in result, f"Clave ausente: {key}"


def test_aragon_regional_status_mentions_step():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    assert 'STEP' in result['regional_status']


def test_outside_aragon_eligible_subsidies_not_empty():
    result = get_subsidies(LAT_MADRID, LON_MADRID)
    assert len(result['eligible_subsidies']) > 0


def test_statales_always_included():
    """MOVES III e ICO son estatales y aparecen en Aragón y fuera."""
    for lat, lon in [(LAT_TERUEL, LON_TERUEL), (LAT_MADRID, LON_MADRID)]:
        result = get_subsidies(lat, lon)
        names = [s['nombre'] for s in result['eligible_subsidies']]
        assert any('MOVES' in n for n in names)
        assert any('ICO' in n for n in names)


def test_northern_aragon_is_aragon():
    """Huesca (norte de Aragón) — debe detectarse como Aragón."""
    result = get_subsidies(42.1, -0.4)
    assert result['is_aragon'] is True


def test_confidence_level_present_and_not_empty():
    result = get_subsidies(LAT_TERUEL, LON_TERUEL)
    assert result['confidence_level']
