import csv
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_MUNICIPIOS_CSV = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'geo', 'municipios_catastro.csv')

_municipios_cache = None


def _load_municipios():
    global _municipios_cache
    if _municipios_cache is not None:
        return _municipios_cache
    _municipios_cache = {}
    try:
        path = os.path.abspath(_MUNICIPIOS_CSV)
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ine_id = row.get('ine_id', '').strip()
                name = row.get('nombre', '').strip().strip('"')
                loine_cp = row.get('loine_cp', '').strip()
                loine_cm = row.get('loine_cm', '').strip()
                _municipios_cache[ine_id] = {
                    "ine_id": ine_id,
                    "nombre": name,
                    "ine_cpro": loine_cp,
                    "ine_cmun": loine_cm,
                    "mhap_id": row.get('mhap_id', '').strip(),
                }
        logger.info("Catastro: %d municipios cargados", len(_municipios_cache))
    except Exception as e:
        logger.warning("Error cargando municipios del catastro: %s", e)
    return _municipios_cache


def find_municipio_by_ine(ine_cpro: str, ine_cmun: str = None) -> Optional[dict]:
    data = _load_municipios()
    if ine_cmun:
        target = f"{ine_cpro}{int(ine_cmun):03d}" if ine_cmun.isdigit() else f"{ine_cpro}{ine_cmun}"
        target_alt = f"{ine_cpro.zfill(2)}{int(ine_cmun):03d}" if ine_cmun.isdigit() else None
        for item in data.values():
            if item.get("ine_id") == target or (target_alt and item.get("ine_id") == target_alt):
                return item
    for item in data.values():
        if item.get("ine_cpro") == ine_cpro.zfill(2):
            return item
    for item in data.values():
        if item.get("ine_id", "").startswith(ine_cpro.zfill(2)):
            return item
    return None
