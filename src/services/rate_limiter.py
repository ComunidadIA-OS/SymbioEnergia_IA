"""
rate_limiter.py — Limitador de tasa en memoria (single-process).
Para producción multi-proceso usar Redis + Flask-Limiter.
"""
import time
from collections import defaultdict
from threading import Lock

_lock = Lock()
_buckets: dict[str, list[float]] = defaultdict(list)


def is_rate_limited(key: str, max_per_window: int, window_seconds: int = 60) -> bool:
    """
    Devuelve True si `key` ha superado `max_per_window` solicitudes en los últimos `window_seconds`.
    Thread-safe.
    """
    now = time.time()
    cutoff = now - window_seconds
    with _lock:
        _buckets[key] = [t for t in _buckets[key] if t > cutoff]
        if len(_buckets[key]) >= max_per_window:
            return True
        _buckets[key].append(now)
        return False


def get_client_ip() -> str:
    from flask import request
    return (
        request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
        or request.remote_addr
        or 'unknown'
    )
