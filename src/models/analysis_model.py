from src import db
from datetime import datetime


class BuildingAnalysis(db.Model):
    __tablename__ = 'building_analysis'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id', ondelete='SET NULL'), nullable=True)
    lat = db.Column(db.Float, nullable=False)
    lon = db.Column(db.Float, nullable=False)
    kwh_annual_input = db.Column(db.Float, nullable=True)
    sector_input = db.Column(db.String(100), nullable=True)
    analyzed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    geo = db.relationship('GeoResult', uselist=False, back_populates='analysis', cascade='all, delete-orphan')
    climate = db.relationship('ClimateResult', uselist=False, back_populates='analysis', cascade='all, delete-orphan')
    financial = db.relationship('FinancialResult', uselist=False, back_populates='analysis', cascade='all, delete-orphan')
    symbiosis = db.relationship('SymbiosisResult', uselist=False, back_populates='analysis', cascade='all, delete-orphan')
    invoices = db.relationship('InvoiceUpload', back_populates='analysis', cascade='all, delete-orphan')
    llm_reports = db.relationship('LlmReport', back_populates='analysis', cascade='all, delete-orphan')

    def to_summary(self) -> dict:
        return {
            'id': self.id,
            'lat': self.lat,
            'lon': self.lon,
            'kwh_annual_input': self.kwh_annual_input,
            'sector_input': self.sector_input,
            'analyzed_at': self.analyzed_at.isoformat(),
            'municipio': self.geo.municipio if self.geo else None,
            'provincia': self.geo.provincia if self.geo else None,
            'building_name': self.geo.building_name if self.geo else None,
            'solar_capacity_kwp': self.geo.solar_capacity_kwp if self.geo else None,
            'surface_m2': self.geo.total_area_m2 if self.geo else None,
            'annual_savings_net_eur': self.financial.annual_savings_net_eur if self.financial else None,
            'payback_with_subsidy': self.financial.payback_with_subsidy if self.financial else None,
            'subsidy_amount_eur': self.financial.subsidy_amount_eur if self.financial else None,
            'total_investment_eur': self.financial.total_investment_eur if self.financial else None,
        }
