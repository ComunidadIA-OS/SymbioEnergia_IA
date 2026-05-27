import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'), override=True)

class Config:
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'dev-key')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///symbioenergia.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    AEMET_API_KEY = os.getenv('AEMET_API_KEY', '')
    GOOGLE_GEOCODING_API_KEY = os.getenv('GOOGLE_GEOCODING_API_KEY', '')
    GEOAPI_ES_KEY = os.getenv('GEOAPI_ES_KEY', '')
    GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
    OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2')
    MAPBOX_TOKEN = os.getenv('MAPBOX_TOKEN', '')
    SMTP_HOST = os.getenv('SMTP_HOST', '')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
    SMTP_USER = os.getenv('SMTP_USER', '')
    SMTP_PASS = os.getenv('SMTP_PASS', '')
    SMTP_FROM = os.getenv('SMTP_FROM', '')
    APP_URL = os.getenv('APP_URL', 'http://localhost:5000')
