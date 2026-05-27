from flask import Blueprint, render_template, request, redirect, url_for, current_app, session
from src.controllers import auth_controller

web_bp = Blueprint('web', __name__)


def _active_building_ctx():
    """Returns template context indicating whether a building is selected."""
    user_id = session.get('user_id')
    if not user_id:
        return {'needs_selection': True, 'active_company': None}
    active_id = session.get('active_company_id')
    if not active_id:
        return {'needs_selection': True, 'active_company': None}
    from src.models.company_model import Company
    from src import db
    company = db.session.get(Company, active_id)
    if not company or company.user_id != user_id:
        session.pop('active_company_id', None)
        return {'needs_selection': True, 'active_company': None}
    return {'needs_selection': False, 'active_company': company}


def _redirect_to_active_building(endpoint):
    """
    If the request has no lat/lon params and there is an active building in session,
    redirect to the same endpoint with the building's coordinates.
    Returns a redirect response or None.
    """
    if request.args.get('lat') and request.args.get('lon'):
        return None  # already has coords, no redirect needed
    user_id = session.get('user_id')
    if not user_id:
        return None
    active_id = session.get('active_company_id')
    if not active_id:
        return None
    from src.models.company_model import Company
    from src import db
    try:
        company = db.session.get(Company, active_id)
        if company and company.user_id == user_id and company.lat and company.lon:
            kwargs = {'lat': company.lat, 'lon': company.lon}
            if company.solar_capacity_kwp:
                kwargs['kwp'] = company.solar_capacity_kwp
            return redirect(url_for(endpoint, **kwargs))
    except Exception:
        pass
    return None


@web_bp.route('/')
def landing():
    return render_template('pages/landing.html')


@web_bp.route('/mapa')
def dashboard():
    return render_template('pages/dashboard.html',
                           mapbox_token=current_app.config.get('MAPBOX_TOKEN', ''))


@web_bp.route('/estudio')
def estudio():
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    kwp = request.args.get('kwp')
    logged_in = bool(session.get('user_id'))

    if not lat or not lon:
        if logged_in:
            user_id = session['user_id']
            active_id = session.get('active_company_id')
            if active_id:
                from src.models.company_model import Company
                from src import db
                try:
                    company = db.session.get(Company, active_id)
                    if company and company.user_id == user_id and company.lat and company.lon:
                        kwargs = {'lat': company.lat, 'lon': company.lon}
                        if company.solar_capacity_kwp:
                            kwargs['kwp'] = company.solar_capacity_kwp
                        return redirect(url_for('web.estudio', **kwargs))
                except Exception:
                    pass
            # Logged in but no active building
            return render_template('pages/estudio.html', no_building=True, logged_in=True)
        # Not logged in → demo mode
        return redirect(url_for('web.estudio', lat=40.364, lon=-1.102))

    return render_template('pages/estudio.html', lat=lat, lon=lon, kwp=kwp,
                           logged_in=logged_in)


@web_bp.route('/geo')
def geo():
    r = _redirect_to_active_building('web.geo')
    if r: return r
    return render_template('pages/geo_analysis.html', **_active_building_ctx())


@web_bp.route('/clima')
def clima():
    r = _redirect_to_active_building('web.clima')
    if r: return r
    return render_template('pages/climate_analysis.html', **_active_building_ctx())


@web_bp.route('/simbiosis')
def simbiosis():
    r = _redirect_to_active_building('web.simbiosis')
    if r: return r
    return render_template('pages/symbiosis.html', **_active_building_ctx())


@web_bp.route('/normativa')
def normativa():
    r = _redirect_to_active_building('web.normativa')
    if r: return r
    return render_template('pages/regulatory.html', **_active_building_ctx())


@web_bp.route('/financiero')
def financiero():
    r = _redirect_to_active_building('web.financiero')
    if r: return r
    return render_template('pages/financial.html', **_active_building_ctx())


# ── Autenticación ──────────────────────────────────────────────────────────────

@web_bp.route('/login', methods=['GET', 'POST'])
def login():
    return auth_controller.login()


@web_bp.route('/registro', methods=['GET', 'POST'])
def registro():
    return auth_controller.registro()


@web_bp.route('/logout')
def logout():
    return auth_controller.logout()


@web_bp.route('/mi-empresa')
def mi_empresa():
    return auth_controller.mi_empresa()


@web_bp.route('/verificar-email')
def verificar_email_pendiente():
    from flask import render_template
    return render_template('pages/verificar_email.html', state='pending',
                           email=None, email_sent=False, dev_url=None)


@web_bp.route('/verificar-email/<token>')
def verificar_email(token):
    return auth_controller.verificar_email(token)


@web_bp.route('/reenviar-verificacion', methods=['POST'])
def reenviar_verificacion():
    return auth_controller.reenviar_verificacion()


# ── Recuperación de contraseña ─────────────────────────────────────────────

@web_bp.route('/recuperar-contraseña', methods=['GET', 'POST'])
def recuperar_contraseña():
    return auth_controller.recuperar_contraseña()


@web_bp.route('/recuperar-contraseña/<token>')
def reset_contraseña(token):
    return auth_controller.reset_contraseña(token)


@web_bp.route('/restablecer-contraseña', methods=['POST'])
def procesar_reset():
    return auth_controller.procesar_reset()


# ── Factura Mensual de Liquidación ────────────────────────────────────────

@web_bp.route('/factura-mensual')
def factura_mensual():
    """
    Genera la liquidación mensual de saldos energéticos de la Comunidad Energética.
    Parámetros: lat, lon, kwp, company (nombre empresa)
    """
    lat = request.args.get('lat', type=float, default=40.364)
    lon = request.args.get('lon', type=float, default=-1.102)
    kwp = request.args.get('kwp', type=float)
    company_name = request.args.get('company', 'Tu Empresa')

    from src.controllers import symbiosis_controller
    from datetime import date

    symbiosis_data = symbiosis_controller.find_symbiosis(lat, lon, kwp=kwp)
    neighbors = symbiosis_data.get('matching_neighbors', [])
    monthly_balance = symbiosis_data.get('monthly_balance', {})

    return render_template(
        'pages/factura_mensual.html',
        lat=lat,
        lon=lon,
        kwp=kwp or 100,
        company_name=company_name,
        monthly_balance=monthly_balance,
        neighbors=neighbors,
        network_design=symbiosis_data.get('network_design', {}),
        today=date.today().strftime('%d de %B de %Y'),
        today_iso=date.today().isoformat(),
    )


# ── Contrato Comunidad Energética ──────────────────────────────────────────

@web_bp.route('/contrato-ce')
def contrato_ce():
    """
    Genera el borrador de estatutos de Comunidad Energética (RD-ley 7/2026).
    Parámetros: lat, lon, kwp (opcional), company (nombre empresa solicitante, opcional)
    """
    lat = request.args.get('lat', type=float, default=40.364)
    lon = request.args.get('lon', type=float, default=-1.102)
    kwp = request.args.get('kwp', type=float)
    company_name = request.args.get('company', 'Empresa Solicitante')

    from src.controllers import symbiosis_controller
    from datetime import date

    symbiosis_data = symbiosis_controller.find_symbiosis(lat, lon, kwp=kwp)
    neighbors = symbiosis_data.get('matching_neighbors', [])

    total_kwh = sum(n.get('annual_kwh', 0) for n in neighbors)
    for n in neighbors:
        n['coeficiente'] = (
            round(n.get('annual_kwh', 0) / total_kwh * 100, 1) if total_kwh > 0 else 0
        )

    return render_template(
        'pages/contrato_ce.html',
        lat=lat,
        lon=lon,
        kwp=kwp or 100,
        company_name=company_name,
        neighbors=neighbors,
        network_design=symbiosis_data.get('network_design', {}),
        today=date.today().strftime('%d de %B de %Y'),
        today_iso=date.today().isoformat(),
    )
