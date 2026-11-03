// utils/emailModelos.js - aparência dos e-mails do Pulyn (HTML com CSS embutido, compatível com clientes de e-mail).
// Cores da marca: azul #1E9BD7, fundo escuro #0D1B2A.

const escapar = (valor) => String(valor)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// E-mail com um código de 6 dígitos (redefinir senha, confirmar e-mail).
function modeloCodigo({ titulo, abertura, codigo, minutos }) {
  const tituloSeguro = escapar(titulo);
  const aberturaSegura = escapar(abertura);
  const codigoSeguro = escapar(codigo);
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${tituloSeguro}</title></head>
<body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(13,27,42,0.08);">
        <tr>
          <td style="background:#0D1B2A;padding:28px 24px;text-align:center;">
            <div style="font-size:26px;font-weight:bold;color:#ffffff;letter-spacing:1px;">Pulyn</div>
            <div style="font-size:13px;color:#29B6F6;margin-top:4px;">Pulyn Family</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 8px 28px;">
            <h1 style="margin:0 0 12px 0;font-size:20px;color:#0D1B2A;">${tituloSeguro}</h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#3a4a5c;">${aberturaSegura}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;" align="center">
            <div style="display:inline-block;background:#EAF6FD;border:2px dashed #1E9BD7;border-radius:12px;padding:16px 28px;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#1E9BD7;">${codigoSeguro}</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 28px 28px;">
            <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#3a4a5c;">
              Este código vale por <b>${escapar(minutos)} minutos</b>.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#7a8794;">
              Se você não pediu este código, pode ignorar este e-mail. Ninguém consegue usar o código sem ele.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f6f8fb;padding:16px 28px;text-align:center;font-size:12px;color:#7a8794;">
            Pulyn · Este é um e-mail automático, não responda.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = `${titulo}\n\n${abertura}\n\nSeu código é: ${codigo}\n\nEle vale por ${minutos} minutos. `
    + 'Se você não pediu este código, pode ignorar este e-mail.\n\nPulyn';
  return { html, texto };
}

module.exports = { modeloCodigo, escapar };
