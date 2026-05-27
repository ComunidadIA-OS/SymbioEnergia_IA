import json
from sqlalchemy import UnicodeText
from src import db


class GeoResult(db.Model):
    __tablename__ = 'geo_result'

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='CASCADE'), nullable=False)
    building_name = db.Column(db.String(300))
    total_area_m2 = db.Column(db.Float)
    usable_area_m2 = db.Column(db.Float)
    roof_slope_deg = db.Column(db.Float)
    roof_orientation_deg = db.Column(db.Float)
    solar_capacity_kwp = db.Column(db.Float)
    building_height_m = db.Column(db.Float)
    confidence_level = db.Column(db.String(30))
    data_source = db.Column(db.String(300))
    municipio = db.Column(db.String(200))
    provincia = db.Column(db.String(200))
    footprint_json = db.Column(UnicodeText(length=4294967295))

    analysis = db.relationship('BuildingAnalysis', back_populates='geo')

    @classmethod
    def from_api(cls, analysis_id: int, data: dict) -> 'GeoResult':
        loc = data.get('location') or {}
        prov = data.get('province') or {}
        return cls(
            analysis_id=analysis_id,
            building_name=data.get('building_name'),
            total_area_m2=data.get('total_area_m2'),
            usable_area_m2=data.get('usable_area_m2'),
            roof_slope_deg=data.get('roof_slope_deg'),
            roof_orientation_deg=data.get('roof_orientation_deg'),
            solar_capacity_kwp=data.get('solar_capacity_kwp'),
            building_height_m=data.get('building_height_m'),
            confidence_level=data.get('confidence_level'),
            data_source=data.get('data_source'),
            municipio=loc.get('municipio') or prov.get('nombre'),
            provincia=prov.get('nombre') or loc.get('provincia'),
            footprint_json=json.dumps(data.get('footprint_coords')) if data.get('footprint_coords') else None,
        )


class ClimateResult(db.Model):
    __tablename__ = 'climate_result'

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='CASCADE'), nullable=False)
    solar_annual_kwh_per_kwp = db.Column(db.Float)
    solar_monthly_json = db.Column(db.Text)
    avg_temp_c = db.Column(db.Float)
    annual_hours_sun = db.Column(db.Float)
    precipitation_days = db.Column(db.Integer)
    wind_speed_m_s = db.Column(db.Float)
    confidence_level = db.Column(db.String(200))
    data_source = db.Column(db.String(300))

    analysis = db.relationship('BuildingAnalysis', back_populates='climate')

    @classmethod
    def from_api(cls, analysis_id: int, data: dict) -> 'ClimateResult':
        monthly = data.get('solar_monthly_kwh_per_kwp')
        return cls(
            analysis_id=analysis_id,
            solar_annual_kwh_per_kwp=data.get('solar_annual_kwh_per_kwp'),
            solar_monthly_json=json.dumps(monthly) if monthly else None,
            avg_temp_c=data.get('avg_temp_c'),
            annual_hours_sun=data.get('annual_hours_sun'),
            precipitation_days=data.get('precipitation_days'),
            wind_speed_m_s=data.get('wind_speed_m_s'),
            confidence_level=data.get('confidence_level'),
            data_source=data.get('data_source'),
        )


class FinancialResult(db.Model):
    __tablename__ = 'financial_result'

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='CASCADE'), nullable=False)
    recommended_capacity_kwp = db.Column(db.Float)
    total_investment_eur = db.Column(db.Float)
    subsidy_amount_eur = db.Column(db.Float)
    net_investment_eur = db.Column(db.Float)
    annual_generation_kwh = db.Column(db.Float)
    annual_savings_gross_eur = db.Column(db.Float)
    annual_savings_net_eur = db.Column(db.Float)
    payback_without_subsidy = db.Column(db.Float)
    payback_with_subsidy = db.Column(db.Float)
    npv_15y_eur = db.Column(db.Float)
    irr_15y_percent = db.Column(db.Float)
    loan_amount_eur = db.Column(db.Float)
    own_capital_eur = db.Column(db.Float)
    annual_loan_payment_eur = db.Column(db.Float)
    loan_period_years = db.Column(db.Integer)
    loan_interest_rate_percent = db.Column(db.Float)

    analysis = db.relationship('BuildingAnalysis', back_populates='financial')

    @classmethod
    def from_api(cls, analysis_id: int, data: dict) -> 'FinancialResult':
        fs = data.get('financing_scenario') or {}
        return cls(
            analysis_id=analysis_id,
            recommended_capacity_kwp=data.get('recommended_capacity_kwp'),
            total_investment_eur=data.get('total_investment_eur'),
            subsidy_amount_eur=data.get('subsidy_amount_eur'),
            net_investment_eur=data.get('net_investment_eur'),
            annual_generation_kwh=data.get('annual_generation_kwh'),
            annual_savings_gross_eur=data.get('annual_savings_gross_eur'),
            annual_savings_net_eur=data.get('annual_savings_net_eur'),
            payback_without_subsidy=data.get('payback_years_without_subsidy'),
            payback_with_subsidy=data.get('payback_years_with_subsidy'),
            npv_15y_eur=data.get('npv_15_years_eur'),
            irr_15y_percent=data.get('irr_15_years_percent'),
            loan_amount_eur=fs.get('loan_amount_eur'),
            own_capital_eur=fs.get('own_capital_eur'),
            annual_loan_payment_eur=fs.get('annual_loan_payment_eur'),
            loan_period_years=fs.get('loan_period_years'),
            loan_interest_rate_percent=fs.get('loan_interest_rate_percent'),
        )


class SymbiosisResult(db.Model):
    __tablename__ = 'symbiosis_result'

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='CASCADE'), nullable=False)
    hria_score = db.Column(db.Integer)
    hria_transparency = db.Column(db.Text)
    shared_potential_kwh = db.Column(db.Float)
    confidence_level = db.Column(db.String(200))
    data_source = db.Column(db.String(300))

    analysis = db.relationship('BuildingAnalysis', back_populates='symbiosis')
    neighbors = db.relationship('SymbiosisNeighbor', back_populates='symbiosis_result', cascade='all, delete-orphan')

    @classmethod
    def from_api(cls, analysis_id: int, data: dict) -> 'SymbiosisResult':
        hria = data.get('hria_assessment') or {}
        return cls(
            analysis_id=analysis_id,
            hria_score=hria.get('hria_score'),
            hria_transparency=hria.get('declaracion_de_transparencia'),
            shared_potential_kwh=data.get('shared_annual_potential_kwh'),
            confidence_level=data.get('confidence_level'),
            data_source=data.get('data_source'),
        )


class SymbiosisNeighbor(db.Model):
    __tablename__ = 'symbiosis_neighbor'

    id = db.Column(db.Integer, primary_key=True)
    symbiosis_result_id = db.Column(db.Integer, db.ForeignKey('symbiosis_result.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(300))
    sector = db.Column(db.String(100))
    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    complementarity_pct = db.Column(db.Integer)
    annual_kwh = db.Column(db.Float)
    distance_km = db.Column(db.Float)
    notes = db.Column(db.Text)
    source = db.Column(db.String(50))
    is_registered = db.Column(db.Boolean, nullable=False, default=False)

    symbiosis_result = db.relationship('SymbiosisResult', back_populates='neighbors')

    @classmethod
    def from_dict(cls, symbiosis_result_id: int, n: dict) -> 'SymbiosisNeighbor':
        return cls(
            symbiosis_result_id=symbiosis_result_id,
            name=n.get('name'),
            sector=n.get('sector'),
            lat=n.get('lat'),
            lon=n.get('lon'),
            complementarity_pct=n.get('complementarity'),
            annual_kwh=n.get('annual_kwh'),
            distance_km=n.get('distance_km'),
            notes=n.get('notes'),
            source=n.get('source'),
            is_registered=bool(n.get('registered', False)),
        )
