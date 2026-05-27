import smtplib
import ssl
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask import current_app

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, verification_url: str) -> bool:
    """
    Envía el email de verificación de cuenta.
    Devuelve True si el envío fue exitoso, False si SMTP no está configurado o falla.
    """
    cfg = _smtp_config()
    if not cfg:
        logger.warning("SMTP no configurado — verificación por email desactivada")
        return False

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Verifica tu cuenta · SymbioEnergia IA'
    msg['From'] = f'SymbioEnergia IA <{cfg["from"]}>'
    msg['To'] = to_email

    html = _build_verification_html(to_email, verification_url)
    msg.attach(MIMEText(html, 'html', 'utf-8'))

    return _send(msg, to_email, cfg)


def _smtp_config() -> dict | None:
    host = current_app.config.get('SMTP_HOST', '')
    user = current_app.config.get('SMTP_USER', '')
    pw   = current_app.config.get('SMTP_PASS', '')
    if not host or not user or not pw:
        return None
    return {
        'host': host,
        'port': current_app.config.get('SMTP_PORT', 587),
        'user': user,
        'pass': pw,
        'from': current_app.config.get('SMTP_FROM', user),
    }


def _send(msg: MIMEMultipart, to_email: str, cfg: dict) -> bool:
    ctx = ssl.create_default_context()
    try:
        if cfg['port'] == 465:
            with smtplib.SMTP_SSL(cfg['host'], cfg['port'], context=ctx, timeout=10) as server:
                server.login(cfg['user'], cfg['pass'])
                server.sendmail(cfg['from'], to_email, msg.as_string())
        else:
            with smtplib.SMTP(cfg['host'], cfg['port'], timeout=10) as server:
                server.ehlo()
                server.starttls(context=ctx)
                server.ehlo()
                server.login(cfg['user'], cfg['pass'])
                server.sendmail(cfg['from'], to_email, msg.as_string())
        logger.info("Email de verificación enviado a %s", to_email)
        return True
    except Exception as exc:
        logger.error("Error enviando email a %s: %s", to_email, exc)
        return False


def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    cfg = _smtp_config()
    if not cfg:
        logger.warning("SMTP no configurado — reset de contraseña desactivado")
        return False

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Restablece tu contraseña · SymbioEnergia IA'
    msg['From'] = f'SymbioEnergia IA <{cfg["from"]}>'
    msg['To'] = to_email

    html = _build_reset_html(to_email, reset_url)
    msg.attach(MIMEText(html, 'html', 'utf-8'))

    return _send(msg, to_email, cfg)


def _build_reset_html(to_email: str, reset_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Restablece tu contraseña · SymbioEnergia IA</title>
</head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fffffe;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(35,35,35,0.09);">

        <tr>
          <td style="background:#078080;padding:28px 40px;">
            <p style="margin:0;color:#fffffe;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              Symbio<span style="color:rgba(255,255,255,0.75);">Energía</span> IA
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#232323;letter-spacing:-0.4px;">
              Restablece tu contraseña
            </h1>
            <p style="margin:0 0 24px;font-size:15px;color:#5c5c5c;line-height:1.6;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta en SymbioEnergia IA.
              Haz clic en el botón para crear una nueva contraseña.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#078080;border-radius:10px;padding:14px 32px;">
                  <a href="{reset_url}"
                     style="color:#fffffe;font-size:15px;font-weight:600;text-decoration:none;display:block;">
                    Restablecer contraseña →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#8c8c8c;line-height:1.5;">
              El enlace caduca en <strong>24 horas</strong>.
              Si no has solicitado este cambio, puedes ignorar este email.
            </p>
            <p style="margin:0;font-size:12px;color:#aaa;word-break:break-all;">
              {reset_url}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(35,35,35,0.07);">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.5;">
              SymbioTeam · Universidad de Zaragoza · Apache 2.0<br>
              Datos anonimizados antes de cada consulta IA (AI Act compliant)
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_verification_html(to_email: str, verification_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verifica tu cuenta · SymbioEnergia IA</title>
</head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fffffe;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(35,35,35,0.09);">

        <!-- Header -->
        <tr>
          <td style="background:#078080;padding:28px 40px;">
            <p style="margin:0;color:#fffffe;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
              Symbio<span style="color:rgba(255,255,255,0.75);">Energía</span> IA
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#232323;letter-spacing:-0.4px;">
              Verifica tu cuenta
            </h1>
            <p style="margin:0 0 24px;font-size:15px;color:#5c5c5c;line-height:1.6;">
              Haz clic en el botón para activar tu cuenta en SymbioEnergia IA y acceder
              a tu panel de ahorro energético.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#078080;border-radius:10px;padding:14px 32px;">
                  <a href="{verification_url}"
                     style="color:#fffffe;font-size:15px;font-weight:600;text-decoration:none;display:block;">
                    Verificar mi cuenta →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#8c8c8c;line-height:1.5;">
              El enlace caduca en <strong>24 horas</strong>.
              Si no has creado esta cuenta, puedes ignorar este email.
            </p>
            <p style="margin:0;font-size:12px;color:#aaa;word-break:break-all;">
              {verification_url}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(35,35,35,0.07);">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.5;">
              SymbioTeam · Universidad de Zaragoza · Apache 2.0<br>
              Datos anonimizados antes de cada consulta IA (AI Act compliant)
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""
