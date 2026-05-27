import logging
from flask import request, jsonify, session
from src import db
from src.services import invoice_service

logger = logging.getLogger(__name__)

_MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB


def analyze_invoice():
    """
    POST /api/analyze-invoice
    Multipart: campo 'invoice' con el PDF de la factura eléctrica.
    Devuelve: { kwh_annual, cost_annual_eur, tariff, confidence, source }
    Guarda el resultado en invoice_upload.
    """
    if 'invoice' not in request.files:
        return jsonify({'error': "Falta el campo 'invoice' en el formulario"}), 400

    f = request.files['invoice']
    if not f.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Solo se aceptan ficheros PDF'}), 415

    pdf_bytes = f.read(_MAX_FILE_BYTES + 1)
    if len(pdf_bytes) > _MAX_FILE_BYTES:
        return jsonify({'error': 'El fichero supera el límite de 5 MB'}), 413

    try:
        result = invoice_service.extract_from_invoice(pdf_bytes)
    except Exception as e:
        logger.error('Error al analizar factura: %s', e)
        return jsonify({'error': 'Error interno al procesar la factura'}), 500

    # Guardar en BD si hay datos válidos
    if result.get('kwh_annual'):
        try:
            from src.models.invoice_model import InvoiceUpload
            upload = InvoiceUpload(
                user_id=session.get('user_id'),
                kwh_annual=result.get('kwh_annual'),
                cost_annual_eur=result.get('cost_annual_eur'),
                tariff=result.get('tariff'),
                confidence=result.get('confidence'),
                source=result.get('source'),
            )
            db.session.add(upload)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.warning('No se pudo guardar factura en BD: %s', e)

    return jsonify(result)
