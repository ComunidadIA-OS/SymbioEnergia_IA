from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from src import db


class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    company_name = db.Column(db.String(200))
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    solar_capacity_kwp = db.Column(db.Float)
    annual_savings_eur = db.Column(db.Float)
    payback_years = db.Column(db.Float)
    subsidy_eur = db.Column(db.Float)
    surface_m2 = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    email_verified = db.Column(db.Boolean, default=False, nullable=False, server_default='0')
    verification_token = db.Column(db.String(64), nullable=True, index=True)
    verification_token_expires = db.Column(db.DateTime, nullable=True)
    reset_token = db.Column(db.String(64), nullable=True, index=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)
