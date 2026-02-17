import { Resend } from 'resend';

export function createResendClient(apiKey) {
  return new Resend(apiKey);
}

export async function sendSummaryEmail(resend, {
  to,
  fromEmail,
  fromName,
  subject,
  plainText,
  html = '',
}) {
  await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text: plainText,
    html: html || undefined,
  });
}
