from datetime import datetime
from src import db


class Company(db.Model):
    __tablename__ = 'company'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    annual_kwh = db.Column(db.Float)
    sector = db.Column(db.String(100))
    solar_capacity_kwp = db.Column(db.Float)
    contact_email = db.Column(db.String(200))
    registered_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # Financial fields saved after estudio analysis
    building_name = db.Column(db.String(200))
    annual_savings_eur = db.Column(db.Float)
    payback_years = db.Column(db.Float)
    subsidy_eur = db.Column(db.Float)
    surface_m2 = db.Column(db.Float)
