"""Tests unitarios — anonymizer_service: detección y sustitución de PII (AI Act)."""
import pytest
from src.services.anonymizer_service import anonymize, _anonymize_with_regex


# ──────────────────────────── tests de _anonymize_with_regex ───────────────────────────

def test_empty_text_returns_unchanged():
    result = anonymize("")
    assert result['anonymized_text'] == ""
    assert result['entities_found'] == []


def test_no_pii_text_is_unchanged():
    text = "Consumo anual de 185000 kWh en el polígono industrial de Teruel."
    result = _anonymize_with_regex(text)
    assert result['anonymized_text'] == text
    assert result['entities_found'] == []


def test_detects_and_replaces_email():
    result = _anonymize_with_regex("Contacto: info@empresa.es para más información.")
    assert '[EMAIL]' in result['anonymized_text']
    assert 'info@empresa.es' not in result['anonymized_text']
    assert any(e['type'] == 'EMAIL' for e in result['entities_found'])


def test_detects_and_replaces_nif():
    result = _anonymize_with_regex("El titular es 12345678A del proyecto.")
    assert '[NIF]' in result['anonymized_text']
    assert '12345678A' not in result['anonymized_text']
    assert any(e['type'] == 'NIF' for e in result['entities_found'])


def test_detects_and_replaces_cif():
    result = _anonymize_with_regex("CIF empresarial: B12345678.")
    assert '[CIF]' in result['anonymized_text']
    assert 'B12345678' not in result['anonymized_text']
    assert any(e['type'] == 'CIF' for e in result['entities_found'])


def test_detects_spanish_phone():
    result = _anonymize_with_regex("Llama al 612345678 para consultas.")
    assert '[TELEFONO]' in result['anonymized_text']
    assert '612345678' not in result['anonymized_text']


def test_detects_spanish_iban():
    result = _anonymize_with_regex("IBAN: ES9121000418450200051332")
    assert '[IBAN]' in result['anonymized_text']


def test_multiple_entities_in_one_text():
    text = "El NIF 12345678A con email test@co.es y CIF B12345670."
    result = _anonymize_with_regex(text)
    assert '[NIF]' in result['anonymized_text']
    assert '[EMAIL]' in result['anonymized_text']
    assert len(result['entities_found']) >= 3


# ──────────────────────────── tests de anonymize (pública) ─────────────────────────────

def test_public_anonymize_returns_required_keys():
    result = anonymize("texto sin datos sensibles")
    assert 'anonymized_text' in result
    assert 'entities_found' in result
    assert 'method' in result


def test_method_is_valid():
    result = anonymize("texto cualquiera")
    assert result['method'] in ('presidio', 'regex')


def test_entities_found_is_list():
    result = anonymize("texto sin PII")
    assert isinstance(result['entities_found'], list)


def test_anonymize_entity_structure():
    result = _anonymize_with_regex("email: test@example.com")
    if result['entities_found']:
        entity = result['entities_found'][0]
        assert 'type' in entity
        assert 'original' in entity
        assert 'replacement' in entity
