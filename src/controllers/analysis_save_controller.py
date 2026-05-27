"""
analysis_save_controller.py
POST /api/analysis/save  — guarda los resultados de los 5 agentes en la BD.
GET  /api/user/analyses  — historial de análisis del usuario autenticado.
"""
import json
import logging
from flask import request, jsonify, session
from sqlalchemy import select, desc
from src import db
from src.models.analysis_model import BuildingAnalysis
from src.models.agent_results_model import (
    GeoResult, ClimateResult, FinancialResult,
    SymbiosisResult, SymbiosisNeighbor,
)

logger = logging.getLogger(__name__)


def save_analysis():
    """
    POST /api/analysis/save
    Body JSON:
      { lat, lon, kwh_annual?, sector?,
        geo: {...}, climate: {...}, financial: {...}, symbiosis: {...} }
    Guarda toda la sesión de análisis en la BD.
    Retorna { ok: true, analysis_id: int }
    """
    data = request.get_json(silent=True) or {}

    lat = data.get('lat')
    lon = data.get('lon')
    if lat is None or lon is None:
        return jsonify({'error': 'lat y lon son requeridos'}), 400

    user_id = session.get('user_id')

    try:
        analysis = BuildingAnalysis(
            user_id=user_id,
            lat=float(lat),
            lon=float(lon),
            kwh_annual_input=data.get('kwh_annual'),
            sector_input=data.get('sector'),
        )
        db.session.add(analysis)
        db.session.flush()  # obtener analysis.id antes de los hijos

        geo_data = data.get('geo') or {}
        if geo_data and geo_data.get('status') != 'error':
            db.session.add(GeoResult.from_api(analysis.id, geo_data))

        climate_data = data.get('climate') or {}
        if climate_data and climate_data.get('status') != 'error':
            db.session.add(ClimateResult.from_api(analysis.id, climate_data))

        financial_data = data.get('financial') or {}
        if financial_data and financial_data.get('status') != 'error':
            db.session.add(FinancialResult.from_api(analysis.id, financial_data))

        symbiosis_data = data.get('symbiosis') or {}
        if symbiosis_data and symbiosis_data.get('status') != 'error':
            sym = SymbiosisResult.from_api(analysis.id, symbiosis_data)
            db.session.add(sym)
            db.session.flush()
            for neighbor in (symbiosis_data.get('matching_neighbors') or []):
                db.session.add(SymbiosisNeighbor.from_dict(sym.id, neighbor))

        db.session.commit()
        return jsonify({'ok': True, 'analysis_id': analysis.id})

    except Exception as e:
        db.session.rollback()
        logger.error('Error guardando análisis: %s', e)
        return jsonify({'error': 'Error interno al guardar el análisis'}), 500


def get_user_analyses():
    """
    GET /api/user/analyses
    Retorna el historial de análisis del usuario autenticado.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'No autenticado'}), 401

    try:
        analyses = db.session.execute(
            select(BuildingAnalysis)
            .where(BuildingAnalysis.user_id == user_id)
            .order_by(desc(BuildingAnalysis.analyzed_at))
            .limit(20)
        ).scalars().all()

        return jsonify({'analyses': [a.to_summary() for a in analyses]})

    except Exception as e:
        logger.error('Error obteniendo historial: %s', e)
        return jsonify({'error': 'Error interno'}), 500
