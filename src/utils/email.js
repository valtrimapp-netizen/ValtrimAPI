/**
 * Minimal email transport abstraction.
 *
 * In development / when no SMTP is configured, emails are logged to the console
 * (so the OTP code is visible during local testing).
 *
 * Wire up a real transport (nodemailer, SendGrid, SES, etc.) by replacing the
 * body of `sendEmail` and reading credentials from `env`.
 */

import { env } from '../config/env.js';

export async function sendEmail({ to, subject, text, html }) {
    // TODO: integrate real SMTP / provider when credentials are added to env.
    // For now we log so developers can pick up the OTP code from the API logs.
    // eslint-disable-next-line no-console
    console.log('[email]', {
        env: env.nodeEnv,
        to,
        subject,
        text,
    });

    return { delivered: false, transport: 'console' };
}

export async function sendPasswordResetCodeEmail({ to, code, ttlMinutes }) {
    const subject = 'Tu código para restablecer la contraseña';
    const text =
        `Hola,\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña en Valtrim.\n\n` +
        `Tu código de verificación es: ${code}\n\n` +
        `Este código expira en ${ttlMinutes} minutos. ` +
        `Si no solicitaste este cambio, ignora este mensaje.\n`;
    const html =
        `<p>Hola,</p>` +
        `<p>Recibimos una solicitud para restablecer tu contraseña en Valtrim.</p>` +
        `<p>Tu código de verificación es: <strong style="font-size:1.4em;letter-spacing:0.2em">${code}</strong></p>` +
        `<p>Este código expira en ${ttlMinutes} minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`;

    return sendEmail({ to, subject, text, html });
}
