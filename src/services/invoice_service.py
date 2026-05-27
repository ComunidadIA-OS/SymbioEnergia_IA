import io
import re
import json
import logging

logger = logging.getLogger(__name__)

_MAX_CHARS = 3500


def extract_from_invoice(pdf_bytes: bytes) -> dict:
    """Extrae datos de consumo de una factura eléctrica en PDF."""
    text = _extract_text(pdf_bytes)
    if not text.strip():
        return {"error": "No se pudo extraer texto del PDF", "kwh_annual": None}

    anon_text = _anonymize(text[:_MAX_CHARS])

    result = _parse_with_llm(anon_text)
    if result:
        return result

    return _parse_regex(text[:_MAX_CHARS])


def _extract_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages[:5])
    except ImportError:
        logger.warning("pdfplumber no disponible — usando extracción de texto básica")
        return _raw_text_fallback(pdf_bytes)
    except Exception as e:
        logger.error("Error al abrir PDF: %s", e)
        return _raw_text_fallback(pdf_bytes)


def _raw_text_fallback(pdf_bytes: bytes) -> str:
    try:
        raw = pdf_bytes.decode("latin-1", errors="ignore")
        tokens = re.findall(r'[\x20-\x7e\xc0-\xff]{4,}', raw)
        return " ".join(tokens[:800])
    except Exception:
        return ""


def _anonymize(text: str) -> str:
    try:
        from src.services.anonymizer_service import anonymize
        result = anonymize(text)
        return result.get("anonymized_text", text)
    except Exception:
        # Regex fallback mínimo: quitar NIFs, emails, teléfonos
        text = re.sub(r'\b[A-Z]?\d{7,8}[A-Z]?\b', '[ID]', text)
        text = re.sub(r'\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b', '[EMAIL]', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(?:\+34)?[\s.-]?[679]\d{8}\b', '[TEL]', text)
        return text


def _parse_with_llm(text: str) -> dict | None:
    try:
        from src.services import llm_service
        prompt = (
            "Analiza esta factura eléctrica española y extrae los datos de consumo.\n"
            "Responde SOLO con un objeto JSON válido (sin texto antes ni después):\n"
            '{"kwh_annual":número_o_null,"cost_annual_eur":número_o_null,"tariff":"texto_o_null","confidence":"alta|media|baja"}\n\n'
            f"Factura:\n{text}\n\nJSON:"
        )
        raw = llm_service.ask(prompt, temperature=0.05, max_tokens=200)
        match = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
        if not match:
            return None
        data = json.loads(match.group())
        return {
            "kwh_annual": _to_float(data.get("kwh_annual")),
            "cost_annual_eur": _to_float(data.get("cost_annual_eur")),
            "tariff": data.get("tariff") or None,
            "confidence": data.get("confidence", "media"),
            "source": "factura_pdf_llm",
        }
    except Exception as e:
        logger.warning("LLM parse failed: %s", e)
        return None


def _parse_regex(text: str) -> dict:
    """Extracción heurística cuando el LLM no está disponible."""
    kwh = None
    cost = None

    kwh_patterns = [
        r'(\d[\d.,]+)\s*kWh',
        r'Consumo[^0-9]*(\d[\d.,]+)',
        r'Energia\s+activa[^0-9]*(\d[\d.,]+)',
    ]
    for pat in kwh_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            kwh = _parse_es_number(m.group(1))
            break

    cost_patterns = [
        r'Total\s+a\s+pagar[^0-9]*(\d[\d.,]+)\s*€?',
        r'Importe\s+total[^0-9]*(\d[\d.,]+)',
        r'(\d[\d.,]+)\s*€',
    ]
    for pat in cost_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            cost = _parse_es_number(m.group(1))
            break

    # Si el kwh parece mensual (< 5000), estimar anual
    if kwh and kwh < 5000:
        kwh = kwh * 12

    return {
        "kwh_annual": kwh,
        "cost_annual_eur": cost * 12 if cost and cost < 5000 else cost,
        "tariff": None,
        "confidence": "baja",
        "source": "factura_pdf_regex",
    }


def _parse_es_number(s: str) -> float | None:
    try:
        s = s.replace(".", "").replace(",", ".")
        return float(s)
    except Exception:
        return None


def _to_float(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except Exception:
        return None
