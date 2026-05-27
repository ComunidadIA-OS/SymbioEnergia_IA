"""
company_controller.py — Registro y consulta de empresas en la red SymbioEnergia.
"""
import math
import logging
from flask import request, jsonify, session
from sqlalchemy import select
from src import db
from src.models.company_model import Company
from src.services.rate_limiter import is_rate_limited, get_client_ip

logger = logging.getLogger(__name__)

_DEFAULT_RADIUS_KM = 5.0
_DUPLICATE_THRESHOLD_M = 50.0  # metros


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def register_company():
    """
    POST /api/companies — Registra una empresa en la red (requiere sesión).
    Body: { name, lat, lon, annual_kwh?, sector?, solar_capacity_kwp?, contact_email? }
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Debes iniciar sesión para registrar tu empresa'}), 401

    if is_rate_limited(f'company_reg_{user_id}', max_per_window=5, window_seconds=3600):
        return jsonify({'error': 'Demasiados intentos. Espera antes de volver a intentarlo.'}), 429

    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    lat = data.get('lat')
    lon = data.get('lon')

    if not name:
        return jsonify({'error': "Campo 'name' requerido"}), 400
    if lat is None or lon is None:
        return jsonify({'error': "Campos 'lat' y 'lon' requeridos"}), 400

    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return jsonify({'error': "'lat' y 'lon' deben ser números"}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({'error': 'Coordenadas fuera de rango'}), 400

    def _to_float(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    annual_kwh = _to_float(data.get('annual_kwh'))
    solar_capacity_kwp = _to_float(data.get('solar_capacity_kwp'))
    contact_email = (data.get('contact_email') or '').strip() or None
    sector = (data.get('sector') or '').strip() or None

    try:
        all_companies = db.session.execute(select(Company)).scalars().all()

        # Verificar duplicado geográfico para este usuario en la misma ubicación (<50m)
        for existing in all_companies:
            if existing.user_id == user_id and existing.lat and existing.lon:
                dist_m = _haversine_km(lat, lon, existing.lat, existing.lon) * 1000
                if dist_m < _DUPLICATE_THRESHOLD_M:
                    # Actualizar el registro existente en esa ubicación
                    existing.name = name
                    existing.lat = lat
                    existing.lon = lon
                    if annual_kwh is not None:
                        existing.annual_kwh = annual_kwh
                    if solar_capacity_kwp is not None:
                        existing.solar_capacity_kwp = solar_capacity_kwp
                    if contact_email:
                        existing.contact_email = contact_email
                    if sector:
                        existing.sector = sector
                    db.session.commit()
                    return jsonify({
                        'id': existing.id,
                        'name': existing.name,
                        'lat': existing.lat,
                        'lon': existing.lon,
                        'message': 'Tu empresa ha sido actualizada en la red SymbioEnergia',
                        'updated': True,
                    }), 200

        # Verificar duplicado geográfico de OTRO usuario (<50m)
        for existing in all_companies:
            if existing.user_id != user_id and existing.lat and existing.lon:
                dist_m = _haversine_km(lat, lon, existing.lat, existing.lon) * 1000
                if dist_m < _DUPLICATE_THRESHOLD_M:
                    return jsonify({
                        'error': 'Este edificio ya está registrado en la red SymbioEnergia',
                        'registered_by': existing.name,
                        'conflict': True,
                    }), 409

        company = Company(
            user_id=user_id,
            name=name,
            lat=lat,
            lon=lon,
            annual_kwh=annual_kwh,
            sector=sector,
            solar_capacity_kwp=solar_capacity_kwp,
            contact_email=contact_email,
        )
        db.session.add(company)
        db.session.commit()
        logger.info('Empresa registrada: %s (user=%d, id=%d)', name, user_id, company.id)
        return jsonify({
            'id': company.id,
            'name': company.name,
            'lat': company.lat,
            'lon': company.lon,
            'message': 'Empresa registrada en la red SymbioEnergia',
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error('Error al registrar empresa: %s', e)
        return jsonify({'error': 'Error interno al guardar la empresa'}), 500


def get_companies():
    """
    GET /api/companies — Lista empresas registradas.
    Query params opcionales: lat, lon, radius_km (default 5)
    """
    lat_q = request.args.get('lat', type=float)
    lon_q = request.args.get('lon', type=float)
    radius_km = request.args.get('radius_km', default=_DEFAULT_RADIUS_KM, type=float)

    try:
        all_companies = db.session.execute(select(Company)).scalars().all()
    except Exception as e:
        logger.error('Error al consultar empresas: %s', e)
        return jsonify({'error': 'Error al consultar la base de datos'}), 500

    results = []
    for c in all_companies:
        include = True
        distance_km = None

        if lat_q is not None and lon_q is not None and c.lat and c.lon:
            try:
                distance_km = _haversine_km(lat_q, lon_q, c.lat, c.lon)
                include = distance_km <= radius_km
            except Exception:
                include = True

        if include:
            entry = {
                'id': c.id,
                'user_id': c.user_id,
                'name': c.name,
                'lat': c.lat,
                'lon': c.lon,
                'annual_kwh': c.annual_kwh,
                'sector': c.sector,
                'solar_capacity_kwp': c.solar_capacity_kwp,
                'contact_email': c.contact_email,
                'registered_at': c.registered_at.isoformat() if c.registered_at else None,
                'source': 'registered',
            }
            if distance_km is not None:
                entry['distance_km'] = round(distance_km, 2)
            results.append(entry)

    return jsonify({'companies': results, 'total': len(results)})


def get_user_companies():
    """GET /api/user/companies — Edificios guardados del usuario autenticado."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'No autenticado'}), 401
    try:
        companies = db.session.execute(
            select(Company).where(Company.user_id == user_id).order_by(Company.registered_at.desc())
        ).scalars().all()
        active_id = session.get('active_company_id')
        result = []
        for c in companies:
            result.append({
                'id': c.id,
                'name': c.name,
                'building_name': c.building_name,
                'lat': c.lat,
                'lon': c.lon,
                'sector': c.sector,
                'solar_capacity_kwp': c.solar_capacity_kwp,
                'annual_savings_eur': c.annual_savings_eur,
                'payback_years': c.payback_years,
                'subsidy_eur': c.subsidy_eur,
                'surface_m2': c.surface_m2,
                'registered_at': c.registered_at.isoformat() if c.registered_at else None,
                'active': c.id == active_id,
            })
        return jsonify({'companies': result, 'active_company_id': active_id})
    except Exception as e:
        logger.error('Error al obtener empresas del usuario: %s', e)
        return jsonify({'error': 'Error interno'}), 500


def select_building():
    """POST /api/user/select-building — Establece el edificio activo en sesión."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'No autenticado'}), 401
    data = request.get_json(silent=True) or {}
    company_id = data.get('company_id')
    if not company_id:
        return jsonify({'error': 'company_id requerido'}), 400
    company = db.session.get(Company, company_id)
    if not company or company.user_id != user_id:
        return jsonify({'error': 'Edificio no encontrado'}), 404
    session['active_company_id'] = company.id
    session['active_company_lat'] = company.lat
    session['active_company_lon'] = company.lon
    return jsonify({'ok': True, 'company_id': company.id, 'name': company.name})
