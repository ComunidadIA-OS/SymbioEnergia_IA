"""Tests unitarios — symbiosis_service: fórmula Haversine y radio RD-ley 7/2026."""
import math
import pytest
from src.services.symbiosis_service import _haversine_km, RADIO_KM


def test_same_point_distance_is_zero():
    assert _haversine_km(40.0, -1.0, 40.0, -1.0) == 0.0


def test_symmetry():
    d1 = _haversine_km(40.364, -1.102, 41.648, -0.891)
    d2 = _haversine_km(41.648, -0.891, 40.364, -1.102)
    assert abs(d1 - d2) < 1e-6


def test_known_madrid_barcelona():
    """Madrid→Barcelona ≈ 504 km (referencia geográfica conocida)."""
    dist = _haversine_km(40.4168, -3.7038, 41.3879, 2.1699)
    assert 490.0 < dist < 520.0


def test_2km_apart_within_radio():
    """0.018° lat ≈ 2 km — debe ser < 5 km (RADIO_KM)."""
    dist = _haversine_km(40.364, -1.102, 40.382, -1.102)
    assert dist < RADIO_KM


def test_10km_apart_outside_radio():
    """~0.09° lat ≈ 10 km — debe superar el radio de 5 km."""
    dist = _haversine_km(40.364, -1.102, 40.454, -1.102)
    assert dist > RADIO_KM


def test_radio_is_5km_per_rd_ley_7_2026():
    """El radio legal fijado por el RD-ley 7/2026 es 5 km."""
    assert RADIO_KM == 5.0


def test_returns_float():
    result = _haversine_km(40.0, -1.0, 41.0, -2.0)
    assert isinstance(result, float)


def test_result_non_negative():
    for lat1, lon1, lat2, lon2 in [
        (40.0, -1.0, 41.0, -2.0),
        (0.0, 0.0, 0.0, 0.0),
        (90.0, 180.0, -90.0, -180.0),
    ]:
        assert _haversine_km(lat1, lon1, lat2, lon2) >= 0.0


def test_antipodal_points_roughly_20000km():
    """Puntos antipodales están a ≈ 20.000 km."""
    dist = _haversine_km(0.0, 0.0, 0.0, 180.0)
    assert 19000.0 < dist < 21000.0
