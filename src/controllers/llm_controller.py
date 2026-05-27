import json
import logging
from flask import request, jsonify, session
from src import db
from src.services import llm_service
from src.services.rate_limiter import is_rate_limited, get_client_ip

logger = logging.getLogger(__name__)


def ask_llm():
    ip = get_client_ip()
    key = f'llm_{session.get("user_id") or ip}'
    if is_rate_limited(key, max_per_window=20, window_seconds=3600):
        return jsonify({'error': 'Límite de consultas IA alcanzado. Espera antes de continuar.'}), 429

    data = request.get_json(silent=True) or {}
    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': "Campo 'prompt' requerido"}), 400
    if len(prompt) > 4000:
        return jsonify({'error': 'Prompt demasiado largo (máx 4000 caracteres)'}), 400

    anonymization_summary = None
    try:
        from src.services import anonymizer_service
        anon = anonymizer_service.anonymize(prompt)
        anonymization_summary = {'method': anon['method'], 'entities_found': anon['entities_found']}
    except Exception as e:
        logger.warning('Error anonimización: %s', e)

    response = llm_service.ask(prompt)
    if response is None:
        return jsonify({'error': 'Error al contactar con el LLM'}), 503

    result = {'response': response, 'provider': llm_service.get_active_provider()}
    if anonymization_summary:
        result['anonymization'] = anonymization_summary
    return jsonify(result)


def ask_analysis():
    ip = get_client_ip()
    key = f'llm_{session.get("user_id") or ip}'
    if is_rate_limited(key, max_per_window=20, window_seconds=3600):
        return jsonify({'error': 'Límite de consultas IA alcanzado. Espera antes de continuar.'}), 429

    data = request.get_json(silent=True) or {}
    analysis_type = data.get('analysis_type', 'general')
    location_data = data.get('location_data', {})
    user_question = data.get('question')
    analysis_id = data.get('analysis_id')

    context_str = '\n'.join(f'- {k}: {v}' for k, v in location_data.items())
    full_prompt = f'Contexto: {analysis_type}\n{context_str}'
    if user_question:
        full_prompt += f'\nPregunta: {user_question}'

    anonymization_summary = None
    entities_count = 0
    try:
        from src.services import anonymizer_service
        anon = anonymizer_service.anonymize(full_prompt)
        anonymization_summary = {'method': anon['method'], 'entities_found': anon['entities_found']}
        entities_count = len(anon['entities_found']) if isinstance(anon['entities_found'], list) else 0
    except Exception as e:
        logger.warning('Error anonimización: %s', e)

    raw = llm_service.ask_about_analysis(analysis_type, location_data, user_question)
    if raw is None:
        return jsonify({'error': 'Error al contactar con el LLM'}), 503

    provider = llm_service.get_active_provider()
    structured = False
    report = None

    try:
        clean = raw.strip()
        if clean.startswith('```'):
            clean = clean.split('```')[1]
            if clean.startswith('json'):
                clean = clean[4:]
        report = json.loads(clean)
        structured = True
    except (json.JSONDecodeError, ValueError):
        logger.warning('LLM no devolvió JSON válido, retornando texto plano')

    # Guardar en BD
    try:
        from src.models.llm_report_model import LlmReport
        llm_row = LlmReport(
            analysis_id=int(analysis_id) if analysis_id else None,
            user_id=session.get('user_id'),
            analysis_type=analysis_type,
            question=user_question,
            response_json=json.dumps(report) if structured else raw,
            provider=provider,
            entities_anonymized=entities_count,
        )
        db.session.add(llm_row)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.warning('No se pudo guardar informe LLM en BD: %s', e)

    result = {
        'structured': structured,
        'provider': provider,
        **(({'report': report}) if structured else ({'response': raw})),
    }
    if anonymization_summary:
        result['anonymization'] = anonymization_summary
    return jsonify(result)
