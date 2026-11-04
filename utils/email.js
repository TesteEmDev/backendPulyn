// utils/email.js - envio de e-mail transacional pelo Brevo (API HTTP).
//
// Configuração (no .env, nunca no código):
//   BREVO_API_KEY           chave de API da conta Brevo (o log nunca mostra o valor)
//   EMAIL_REMETENTE         endereço já validado no Brevo (domínio próprio ou remetente confirmado)
//   EMAIL_REMETENTE_NOME    nome que aparece para quem recebe (padrão: Pulyn)
const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';

function emailConfigurado() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE);
}

// `transporte` existe para os testes; em produção é o fetch do próprio Node.
async function enviarEmail({ para, assunto, texto, html, transporte = fetch }) {
  if (!emailConfigurado()) {
    throw new Error('Envio de e-mail não configurado (BREVO_API_KEY e EMAIL_REMETENTE no .env)');
  }
  const resposta = await transporte(URL_BREVO, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_REMETENTE, name: process.env.EMAIL_REMETENTE_NOME || 'Pulyn' },
      to: [{ email: para }],
      subject: assunto,
      textContent: texto,
      ...(html ? { htmlContent: html } : {}),
    }),
  });
  if (!resposta.ok) {
    // O Brevo explica o motivo no corpo (ex.: IP não autorizado, remetente não validado).
    const motivo = await resposta.text().catch(() => '');
    throw new Error(`Brevo recusou o envio (HTTP ${resposta.status}): ${motivo.slice(0, 300)}`);
  }
}

module.exports = { enviarEmail, emailConfigurado };
