import secrets
import logging
from datetime import datetime, timedelta
from flask import request, redirect, url_for, session, render_template, current_app, jsonify
from sqlalchemy import select
from src import db
from src.models.user_model import User
from src.services.rate_limiter import is_rate_limited, get_client_ip

logger = logging.getLogger(__name__)

_TOKEN_TTL_HOURS = 24


def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        user = db.session.execute(select(User).filter_by(email=email)).scalar_one_or_none()

        if not user or not user.check_password(password):
            return render_template('pages/login.html',
                                   error='Email o contraseña incorrectos',
                                   mode='login')

        if not user.email_verified:
            return render_template('pages/login.html',
                                   error='Debes verificar tu email antes de acceder.',
                                   unverified_email=email,
                                   mode='login')

        _set_session(user)
        return redirect(url_for('web.mi_empresa'))

    return render_template('pages/login.html', mode='login')


def registro():
    if request.method == 'POST':
        if is_rate_limited(f'registro_{get_client_ip()}', max_per_window=5, window_seconds=3600):
            return render_template('pages/login.html',
                                   error='Demasiados intentos. Espera antes de continuar.',
                                   mode='registro'), 429
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        company_name = request.form.get('company_name', '').strip()

        if not email or not password or len(password) < 6:
            return render_template('pages/login.html',
                                   error='Todos los campos son obligatorios (contraseña mín. 6 caracteres)',
                                   mode='registro')

        if db.session.execute(select(User).filter_by(email=email)).scalar_one_or_none():
            return render_template('pages/login.html',
                                   error='Ya existe una cuenta con ese email',
                                   mode='registro')

        token = _new_token()
        user = User(
            email=email,
            company_name=company_name,
            email_verified=False,
            verification_token=token,
            verification_token_expires=datetime.utcnow() + timedelta(hours=_TOKEN_TTL_HOURS),
        )
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        email_sent = _dispatch_verification(user)
        dev_url = _verification_url(token) if not email_sent else None

        return render_template('pages/verificar_email.html',
                               state='pending',
                               email=email,
                               email_sent=email_sent,
                               dev_url=dev_url)

    return render_template('pages/login.html', mode='registro')


def logout():
    session.clear()
    return redirect(url_for('web.landing'))


def mi_empresa():
    if 'user_id' not in session:
        return redirect(url_for('web.login'))
    user = db.session.get(User, session['user_id'])
    if not user:
        session.clear()
        return redirect(url_for('web.login'))
    from src.models.company_model import Company
    companies = db.session.execute(
        select(Company).where(Company.user_id == user.id).order_by(Company.registered_at.desc())
    ).scalars().all()
    active_company_id = session.get('active_company_id')
    bienvenida = request.args.get('bienvenida') == '1'
    return render_template('pages/mi_empresa.html', user=user, bienvenida=bienvenida,
                           companies=companies, active_company_id=active_company_id)


def verificar_email(token: str):
    user = db.session.execute(select(User).filter_by(verification_token=token)).scalar_one_or_none()

    if not user:
        return render_template('pages/verificar_email.html', state='invalido')

    if user.email_verified:
        _set_session(user)
        return redirect(url_for('web.mi_empresa', bienvenida=1))

    if user.verification_token_expires and datetime.utcnow() > user.verification_token_expires:
        return render_template('pages/verificar_email.html',
                               state='caducado',
                               email=user.email)

    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.session.commit()

    _set_session(user)
    return redirect(url_for('web.mi_empresa', bienvenida=1))


def reenviar_verificacion():
    if is_rate_limited(f'reenvio_{get_client_ip()}', max_per_window=3, window_seconds=3600):
        return render_template('pages/verificar_email.html', state='invalido'), 429
    email = request.form.get('email', '').strip().lower()
    if not email:
        return render_template('pages/verificar_email.html', state='invalido')

    user = db.session.execute(select(User).filter_by(email=email)).scalar_one_or_none()
    if not user or user.email_verified:
        return render_template('pages/verificar_email.html',
                               state='reenviado',
                               email=email,
                               email_sent=True)

    token = _new_token()
    user.verification_token = token
    user.verification_token_expires = datetime.utcnow() + timedelta(hours=_TOKEN_TTL_HOURS)
    db.session.commit()

    email_sent = _dispatch_verification(user)
    dev_url = _verification_url(token) if not email_sent else None

    return render_template('pages/verificar_email.html',
                           state='reenviado',
                           email=email,
                           email_sent=email_sent,
                           dev_url=dev_url)


def recuperar_contraseña():
    if request.method == 'POST':
        ip = get_client_ip()
        if is_rate_limited(f'reset_ip_{ip}', max_per_window=2, window_seconds=3600):
            return render_template('pages/recuperar_contraseña.html',
                                   state='error',
                                   message='Demasiados intentos. Espera 1 hora.'), 429
        if is_rate_limited(f'reset_global', max_per_window=10, window_seconds=3600):
            return render_template('pages/recuperar_contraseña.html',
                                   state='error',
                                   message='Demasiados intentos globales. Espera 1 hora.'), 429

        email = request.form.get('email', '').strip().lower()
        if not email:
            return render_template('pages/recuperar_contraseña.html',
                                   state='error',
                                   message='Introduce tu email.')

        user = db.session.execute(select(User).filter_by(email=email)).scalar_one_or_none()
        if user:
            if not is_rate_limited(f'reset_email_{email}', max_per_window=1, window_seconds=900):
                token = _new_token()
                user.reset_token = token
                user.reset_token_expires = datetime.utcnow() + timedelta(hours=_TOKEN_TTL_HOURS)
                db.session.commit()
                email_sent = _dispatch_reset(user)

        return render_template('pages/recuperar_contraseña.html',
                               state='enviado',
                               email=email)

    return render_template('pages/recuperar_contraseña.html', state='form')


def reset_contraseña(token: str):
    if not token:
        return render_template('pages/recuperar_contraseña.html', state='invalido')

    user = db.session.execute(select(User).filter_by(reset_token=token)).scalar_one_or_none()
    if not user:
        return render_template('pages/recuperar_contraseña.html', state='invalido')

    if user.reset_token_expires and datetime.utcnow() > user.reset_token_expires:
        return render_template('pages/recuperar_contraseña.html', state='expirado')

    return render_template('pages/recuperar_contraseña.html', state='reset', token=token)


def procesar_reset():
    if is_rate_limited(f'procesar_reset_{get_client_ip()}', max_per_window=5, window_seconds=3600):
        return render_template('pages/recuperar_contraseña.html',
                               state='error',
                               message='Demasiados intentos. Espera 1 hora.'), 429

    token = request.form.get('token', '')
    password = request.form.get('password', '')

    if not token or not password or len(password) < 6:
        return render_template('pages/recuperar_contraseña.html',
                               state='error',
                               message='Contraseña mínima de 6 caracteres.')

    user = db.session.execute(select(User).filter_by(reset_token=token)).scalar_one_or_none()
    if not user:
        return render_template('pages/recuperar_contraseña.html', state='invalido')

    if user.reset_token_expires and datetime.utcnow() > user.reset_token_expires:
        return render_template('pages/recuperar_contraseña.html', state='expirado')

    user.set_password(password)
    user.reset_token = None
    user.reset_token_expires = None
    db.session.commit()

    return render_template('pages/recuperar_contraseña.html', state='exito')


def update_company_data():
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401
    data = request.get_json(silent=True) or {}
    user = db.session.get(User, session['user_id'])
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    fields = ['lat', 'lon', 'solar_capacity_kwp', 'annual_savings_eur',
              'payback_years', 'subsidy_eur', 'surface_m2']
    for f in fields:
        if data.get(f) is not None:
            setattr(user, f, data[f])

    db.session.commit()
    session['user_company'] = user.company_name or ''
    return jsonify({'ok': True})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_session(user: User):
    session['user_id'] = user.id
    session['user_email'] = user.email
    session['user_company'] = user.company_name or ''


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _verification_url(token: str) -> str:
    try:
        app_url = current_app.config.get('APP_URL', 'http://localhost:5000').rstrip('/')
        return f"{app_url}/verificar-email/{token}"
    except Exception:
        return f"http://localhost:5000/verificar-email/{token}"


def _reset_url(token: str) -> str:
    try:
        app_url = current_app.config.get('APP_URL', 'http://localhost:5000').rstrip('/')
        return f"{app_url}/recuperar-contraseña/{token}"
    except Exception:
        return f"http://localhost:5000/recuperar-contraseña/{token}"


def _dispatch_reset(user: User) -> bool:
    try:
        from src.services import email_service
        url = _reset_url(user.reset_token)
        return email_service.send_password_reset_email(user.email, url)
    except Exception as exc:
        logger.error("Error al enviar email de reset: %s", exc)
        return False


def _dispatch_verification(user: User) -> bool:
    try:
        from src.services import email_service
        url = _verification_url(user.verification_token)
        return email_service.send_verification_email(user.email, url)
    except Exception as exc:
        logger.error("Error al enviar email de verificación: %s", exc)
        return False
