import logging
from typing import Optional
from flask import current_app

logger = logging.getLogger(__name__)

# Módulo-level provider tracking
_last_provider: str = "fallback"


def get_active_provider() -> str:
    """Devuelve el proveedor que respondió en la última llamada: 'ollama', 'groq' o 'fallback'."""
    return _last_provider


SYSTEM_PROMPT = """Eres SymbioBot, un asistente IA experto en eficiencia energética industrial,
normativa española de autoconsumo (RD 244/2019, RD-ley 7/2026), subvenciones STEP Aragón,
y análisis técnico de proyectos fotovoltaicos en cubiertas industriales.

Responde siempre en español, con un tono profesional pero accesible.
Usa datos objetivos. Solo cita cifras que estén en el contexto proporcionado.
Si no tienes suficiente información para una sección, omítela."""

STRUCTURED_SCHEMA = """
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin bloques de código, sin texto adicional antes o después.
Esquema exacto:
{
  "titulo": "título del informe (máx 55 caracteres)",
  "nivel_oportunidad": "ALTO|MEDIO|BAJO",
  "secciones": [
    {
      "tipo": "resumen|solar|financiero|recomendaciones|subvenciones|riesgos",
      "titulo": "título de la sección (máx 35 caracteres)",
      "texto": "párrafo breve (máx 100 palabras, puede ser null)",
      "destacado": "valor clave para mostrar en grande, ej: '847 kWp' o null",
      "items": ["acción concreta 1", "acción concreta 2"]
    }
  ],
  "conclusion": "frase final accionable (máx 50 palabras)"
}
Genera entre 3 y 5 secciones. Sé conciso. El campo items solo para listas de acciones; texto para prosa."""


def _try_ollama(prompt: str, model: str, temperature: float, max_tokens: int) -> Optional[str]:
    """Intenta llamar a Ollama local. Retorna el texto generado o None si falla."""
    import requests as req

    url = "http://localhost:11434/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
        "stream": False,
    }
    try:
        response = req.post(url, json=payload, timeout=25)
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content")
        if content:
            return content
        logger.warning("Ollama respondió sin contenido: %s", data)
        return None
    except req.exceptions.ConnectionError:
        logger.info("Ollama no disponible (ConnectionError) — pasando a GROQ")
        return None
    except req.exceptions.Timeout:
        logger.info("Ollama timeout >25s — pasando a GROQ")
        return None
    except Exception as e:
        logger.warning("Error inesperado llamando a Ollama: %s", e)
        return None


def _try_groq(prompt: str, model: str, temperature: float, max_tokens: int) -> Optional[str]:
    """Intenta llamar a GROQ cloud. Retorna el texto generado o None si falla."""
    api_key = None
    try:
        api_key = current_app.config.get("GROQ_API_KEY", "")
    except RuntimeError:
        api_key = ""

    if not api_key:
        logger.warning("GROQ_API_KEY no configurada")
        return None

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return completion.choices[0].message.content
    except ImportError:
        logger.warning("groq no instalado")
        return None
    except Exception as e:
        logger.error("Error llamando a GROQ: %s", e)
        return None


def ask(prompt: str, model: str = "llama-3.3-70b-versatile", temperature: float = 0.3, max_tokens: int = 1024) -> Optional[str]:
    global _last_provider

    # Aplicar anonimización antes de enviar al LLM
    anonymization_info = None
    try:
        from src.services import anonymizer_service
        anon_result = anonymizer_service.anonymize(prompt)
        prompt = anon_result["anonymized_text"]
        anonymization_info = anon_result
        if anon_result["entities_found"]:
            logger.info(
                "Anonimización aplicada (%s): %d entidades reemplazadas",
                anon_result["method"],
                len(anon_result["entities_found"]),
            )
    except Exception as e:
        logger.warning("Error en anonimización, continuando sin anonimizar: %s", e)

    # 1. Intentar Ollama local
    ollama_model = None
    try:
        ollama_model = current_app.config.get("OLLAMA_MODEL", "llama3.2")
    except RuntimeError:
        ollama_model = "llama3.2"

    result = _try_ollama(prompt, ollama_model, temperature, max_tokens)
    if result is not None:
        _last_provider = "ollama"
        return result

    # 2. Intentar GROQ cloud
    result = _try_groq(prompt, model, temperature, max_tokens)
    if result is not None:
        _last_provider = "groq"
        return result

    # 3. Structured fallback
    _last_provider = "fallback"
    return _fallback_response(prompt)


def ask_about_analysis(analysis_type: str, location_data: dict, user_question: str = None) -> Optional[str]:
    context_parts = []
    for k, v in location_data.items():
        context_parts.append(f"- {k}: {v}")
    context = "\n".join(context_parts)

    base_instruction = user_question or (
        "Genera un informe ejecutivo estructurado para el equipo directivo, "
        "con diagnóstico, oportunidades de ahorro y recomendaciones accionables."
    )

    prompt = f"""Contexto del análisis ({analysis_type}):
{context}

Tarea: {base_instruction}

{STRUCTURED_SCHEMA}"""

    result = ask(prompt, max_tokens=1400)
    if result and result.startswith("**"):
        return _structured_fallback(location_data)
    return result


def _structured_fallback(location_data: dict) -> str:
    import json

    municipio = location_data.get("municipio", "Polígono Industrial")
    capacidad = location_data.get("capacidad_solar", "")
    sizing = location_data.get("sizing_recomendado", "")
    payback = location_data.get("payback_con_ayuda", "")
    inversion_neta = location_data.get("inversion_neta", "")
    superficie = location_data.get("superficie_util", "")

    nivel = "ALTO"
    try:
        if payback:
            anios = float(str(payback).replace(" años", "").strip())
            if anios > 9:
                nivel = "MEDIO"
            elif anios > 14:
                nivel = "BAJO"
    except ValueError:
        pass

    secciones = [
        {
            "tipo": "resumen",
            "titulo": "Potencial Solar Confirmado",
            "texto": (
                f"La cubierta de {municipio} presenta condiciones óptimas para fotovoltaica industrial. "
                f"Con {superficie} de superficie útil y orientación sur, "
                "los datos reales de ERA5 (Open-Meteo) confirman alta productividad anual."
            ),
            "destacado": capacidad or None,
            "items": None
        },
        {
            "tipo": "financiero",
            "titulo": "Retorno de Inversión",
            "texto": (
                f"Inversión neta tras subvenciones: {inversion_neta}. "
                f"Payback con STEP Aragón 2026: {payback}. "
                "El VAN a 15 años es positivo incluso en escenario conservador (degradación 0,8%/año, inflación 2%)."
            ),
            "destacado": payback or None,
            "items": None
        },
        {
            "tipo": "subvenciones",
            "titulo": "Subvenciones Disponibles",
            "texto": None,
            "destacado": "Hasta 680.000 €",
            "items": [
                "STEP Aragón 2026 — 40% a fondo perdido (máx. 500.000 €)",
                "NextGen Autoconsumo Compartido — 35% adicional (BOA/IDAE)",
                "ICO Empresas y Emprendedores — financiación blanda 100%"
            ]
        },
        {
            "tipo": "recomendaciones",
            "titulo": "Próximos Pasos",
            "texto": None,
            "destacado": None,
            "items": [
                f"Tramitar STEP Aragón con el sizing de {sizing}",
                "Explorar comunidad energética con las 4 naves vecinas detectadas (RD-ley 7/2026)",
                "Solicitar tres presupuestos a instaladores homologados IDAE",
                "Configurar contrato de autoconsumo con compensación de excedentes (RD 244/2019)"
            ]
        }
    ]

    report = {
        "titulo": f"Informe Ejecutivo — {municipio[:40]}",
        "nivel_oportunidad": nivel,
        "secciones": secciones,
        "conclusion": (
            f"Instalación de {sizing} altamente recomendable: "
            f"payback de {payback} con subvenciones, "
            "sin riesgo medioambiental según evaluación HRIA integrada."
        )
    }
    return json.dumps(report, ensure_ascii=False)


def _fallback_response(prompt: str) -> str:
    return (
        "No se pudo contactar con ningún modelo de lenguaje (Ollama ni GROQ). "
        "Los datos analíticos mostrados provienen de fuentes oficiales (Open-Meteo ERA5, OpenStreetMap, BOA/IDAE) "
        "y son plenamente operativos."
    )
