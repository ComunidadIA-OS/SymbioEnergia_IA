from src import db
from datetime import datetime


class InvoiceUpload(db.Model):
    __tablename__ = 'invoice_upload'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='SET NULL'), nullable=True)
    kwh_annual = db.Column(db.Float)
    cost_annual_eur = db.Column(db.Float)
    tariff = db.Column(db.String(50))
    confidence = db.Column(db.String(20))
    source = db.Column(db.String(100))
    uploaded_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    analysis = db.relationship('BuildingAnalysis', back_populates='invoices')
