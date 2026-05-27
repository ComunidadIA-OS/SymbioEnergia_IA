"""
anonymizer_service.py — Anonimización de PII antes de enviar datos al LLM.

Intenta usar Presidio si está instalado; en caso contrario cae back a regex.
El usuario puede ver qué se anonimizó (feature de transparencia para el jurado AESIA).
"""
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Patrones regex de fallback (cuando Presidio no está disponible)
# ---------------------------------------------------------------------------
_REGEX_PATTERNS = [
    # CIF empresarial español: letra + 7 dígitos + letra o dígito
    (re.compile(r'\b[A-Z]\d{7}[A-Z0-9]\b'), "CIF", "[CIF]"),
    # NIF persona física: 8 dígitos + letra
    (re.compile(r'\b\d{8}[A-Z]\b'), "NIF", "[NIF]"),
    # IBAN español
    (re.compile(r'\bES\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2}[\s]?\d{10}\b'), "IBAN", "[IBAN]"),
    # Email
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), "EMAIL", "[EMAIL]"),
    # Teléfono España: opcional +34/0034 + número 6/7/8/9 + 8 dígitos
    (re.compile(r'(\+34|0034)?[\s]?[6789]\d{8}\b'), "TELEFONO", "[TELEFONO]"),
]


def _anonymize_with_regex(text: str) -> dict:
    """Anonimiza PII usando expresiones regulares."""
    anonymized = text
    entities_found = []

    for pattern, entity_type, replacement in _REGEX_PATTERNS:
        for match in pattern.finditer(anonymized):
            original = match.group(0)
            entities_found.append({
                "type": entity_type,
                "original": original,
                "replacement": replacement,
            })
        anonymized = pattern.sub(replacement, anonymized)

    return {
        "anonymized_text": anonymized,
        "entities_found": entities_found,
        "method": "regex",
    }


def _anonymize_with_presidio(text: str) -> Optional[dict]:
    """
    Intenta anonimizar con Presidio.
    Retorna None si Presidio no está disponible o falla.
    """
    try:
        from presidio_analyzer import AnalyzerEngine
        from presidio_anonymizer import AnonymizerEngine
        from presidio_anonymizer.entities import OperatorConfig
    except ImportError:
        return None

    try:
        analyzer = AnalyzerEngine()
        anonymizer = AnonymizerEngine()

        results = analyzer.analyze(
            text=text,
            language="es",
            entities=["PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "IBAN_CODE", "NRP"],
        )

        if not results:
            return {
                "anonymized_text": text,
                "entities_found": [],
                "method": "presidio",
            }

        # Construir operators para cada tipo reconocido
        operators = {}
        entity_type_map = {
            "PERSON": "[PERSONA]",
            "EMAIL_ADDRESS": "[EMAIL]",
            "PHONE_NUMBER": "[TELEFONO]",
            "IBAN_CODE": "[IBAN]",
            "NRP": "[ID]",
        }
        for result in results:
            tag = entity_type_map.get(result.entity_type, f"[{result.entity_type}]")
            operators[result.entity_type] = OperatorConfig("replace", {"new_value": tag})

        anonymized_result = anonymizer.anonymize(
            text=text,
            analyzer_results=results,
            operators=operators,
        )

        entities_found = []
        for result in results:
            tag = entity_type_map.get(result.entity_type, f"[{result.entity_type}]")
            entities_found.append({
                "type": result.entity_type,
                "original": text[result.start:result.end],
                "replacement": tag,
            })

        return {
            "anonymized_text": anonymized_result.text,
            "entities_found": entities_found,
            "method": "presidio",
        }

    except Exception as e:
        logger.warning("Error usando Presidio, usando regex como fallback: %s", e)
        return None


def anonymize(text: str) -> dict:
    """
    Anonimiza PII en text antes de enviarlo al LLM.

    Returns:
        {
            "anonymized_text": str,
            "entities_found": [{"type": str, "original": str, "replacement": str}],
            "method": "presidio" | "regex"
        }
    """
    if not text or not text.strip():
        return {"anonymized_text": text, "entities_found": [], "method": "regex"}

    # Intentar Presidio primero
    presidio_result = _anonymize_with_presidio(text)
    if presidio_result is not None:
        return presidio_result

    # Fallback a regex
    return _anonymize_with_regex(text)
