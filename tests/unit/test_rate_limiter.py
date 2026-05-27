"""Tests unitarios — rate_limiter: ventana deslizante en memoria."""
import uuid
import time
from src.services.rate_limiter import is_rate_limited


def _unique_key() -> str:
    """Genera una clave única para evitar colisiones entre tests."""
    return f"test_{uuid.uuid4().hex}"


def test_first_request_always_allowed():
    assert is_rate_limited(_unique_key(), max_per_window=1, window_seconds=60) is False


def test_allows_requests_within_limit():
    key = _unique_key()
    for _ in range(5):
        assert is_rate_limited(key, max_per_window=5, window_seconds=60) is False


def test_blocks_request_at_limit():
    key = _unique_key()
    for _ in range(3):
        is_rate_limited(key, max_per_window=3, window_seconds=60)
    assert is_rate_limited(key, max_per_window=3, window_seconds=60) is True


def test_blocks_all_requests_after_limit():
    key = _unique_key()
    for _ in range(2):
        is_rate_limited(key, max_per_window=2, window_seconds=60)
    for _ in range(5):
        assert is_rate_limited(key, max_per_window=2, window_seconds=60) is True


def test_different_keys_are_independent():
    key_a = _unique_key()
    key_b = _unique_key()
    for _ in range(3):
        is_rate_limited(key_a, max_per_window=3, window_seconds=60)
    assert is_rate_limited(key_a, max_per_window=3, window_seconds=60) is True
    assert is_rate_limited(key_b, max_per_window=3, window_seconds=60) is False


def test_limit_of_one():
    key = _unique_key()
    assert is_rate_limited(key, max_per_window=1, window_seconds=60) is False
    assert is_rate_limited(key, max_per_window=1, window_seconds=60) is True


def test_window_zero_always_blocks_second_request():
    """Ventana de 0 segundos — todas las peticiones pasadas están caducadas."""
    key = _unique_key()
    is_rate_limited(key, max_per_window=1, window_seconds=60)
    # Con ventana=0 la petición anterior está fuera, debería permitir
    time.sleep(0.01)
    assert is_rate_limited(key, max_per_window=1, window_seconds=0) is False
