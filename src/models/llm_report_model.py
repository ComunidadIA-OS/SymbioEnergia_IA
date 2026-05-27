from sqlalchemy import UnicodeText
from src import db
from datetime import datetime


class LlmReport(db.Model):
    __tablename__ = 'llm_report'

    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('building_analysis.id', ondelete='SET NULL'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    analysis_type = db.Column(db.String(100))
    question = db.Column(db.Text)
    response_json = db.Column(UnicodeText(length=4294967295))
    provider = db.Column(db.String(50))
    entities_anonymized = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    analysis = db.relationship('BuildingAnalysis', back_populates='llm_reports')
