from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from config.app_config import Config

db = SQLAlchemy()

def create_app() -> Flask:
    app = Flask(__name__, template_folder='views', static_folder='../public')
    app.config.from_object(Config)
    db.init_app(app)

    from src.routes.web_routes import web_bp
    from src.routes.api_routes import api_bp
    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp, url_prefix='/api')

    from sqlalchemy.exc import OperationalError

    @app.errorhandler(OperationalError)
    def _db_unavailable(e):
        from flask import request as _req, jsonify, render_template
        import logging
        logging.getLogger(__name__).error("MySQL no disponible: %s", e)
        if _req.path.startswith('/api/'):
            return jsonify({'status': 'error', 'message': 'Base de datos no disponible. Inicia XAMPP/MySQL.'}), 503
        return render_template('pages/login.html',
                               error='Base de datos no disponible. Inicia XAMPP/MySQL primero.',
                               mode='login'), 503

    @app.after_request
    def _security_headers(response):
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(self), microphone=()'
        return response

    @app.context_processor
    def inject_active_building():
        """Inyecta coords del edificio activo en todos los templates."""
        from flask import session as _sess
        user_id = _sess.get('user_id')
        empty = {'active_lat': None, 'active_lon': None, 'active_kwp': None, 'active_building_name': None}
        if not user_id:
            return empty
        active_id = _sess.get('active_company_id')
        if not active_id:
            return empty
        try:
            from src.models.company_model import Company
            company = db.session.get(Company, active_id)
            if company and company.user_id == user_id and company.lat and company.lon:
                return {
                    'active_lat': company.lat,
                    'active_lon': company.lon,
                    'active_kwp': company.solar_capacity_kwp,
                    'active_building_name': company.building_name or company.name,
                }
        except Exception:
            pass
        return empty

    with app.app_context():
        from src.models import (  # noqa: F401 — registra todas las tablas
            company_model, user_model, analysis_model,
            agent_results_model, invoice_model, llm_report_model,
        )
        try:
            db.create_all()
            _seed_demo_user()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "BD no disponible al arrancar (¿MySQL apagado?): %s — "
                "La app arranca en modo degradado: agentes IA y mapa funcionan, "
                "BD no disponible.", exc
            )

    return app


def _seed_demo_user():
    from src.models.user_model import User
    from sqlalchemy import select
    demo_email = 'noreply@symbioenergy.es'
    if not db.session.execute(select(User).filter_by(email=demo_email)).scalar_one_or_none():
        demo = User(
            email=demo_email,
            company_name='SymbioEnergia Demo',
            lat=40.364,
            lon=-1.102,
            solar_capacity_kwp=120.0,
            annual_savings_eur=14800.0,
            payback_years=5.4,
            subsidy_eur=54000.0,
            surface_m2=650.0,
            email_verified=True,
        )
        demo.set_password('noreplyluciayoscar')
        db.session.add(demo)
        db.session.commit()
