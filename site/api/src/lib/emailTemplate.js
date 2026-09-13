const LOGO_URL = "https://www.ieadespa.org.br/logo.png";
const SITE_URL = "https://www.ieadespa.org.br";
const ACCENT = "#8f6f1f";

/** Nome/título vêm de quem preenche o formulário — nunca inserir sem escapar,
 * senão um "nome" tipo `<script>` vira HTML de verdade no e-mail. */
function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * E-mails simples, com tabelas e estilo em linha (não `<style>` no `<head>`
 * nem CSS externo) — é o único jeito que renderiza de forma confiável nos
 * principais clientes de e-mail (Gmail, Outlook), que ignoram ou cortam
 * boa parte do CSS moderno.
 */
function renderEmailShell({ titulo, corpoHtml }) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px 12px;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5decf;">
            <tr>
              <td style="background:${ACCENT};padding:20px 24px;text-align:center;">
                <img src="${LOGO_URL}" alt="IEADESPA" height="40" style="height:40px;width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="margin:0 0 16px;font-size:20px;color:#2a2116;">${escaparHtml(titulo)}</h1>
                ${corpoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9f7f2;border-top:1px solid #e5decf;font-size:12px;color:#8a8172;line-height:1.5;">
                IEADESPA — Igreja Evangélica Assembleia de Deus Ministério do Seta em Parauapebas/PA<br />
                <a href="${SITE_URL}" style="color:${ACCENT};">${SITE_URL.replace("https://", "")}</a> ·
                E-mail automático, não responda.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Um "código" em destaque, com nome e situação — usado tanto na confirmação
 * (várias pessoas de um grupo) quanto no lembrete (uma pessoa só). */
function renderCodigoBox({ nome, codigo, situacao }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid #e5decf;border-radius:8px;">
    <tr>
      <td style="padding:12px 16px;">
        <div style="font-size:14px;color:#2a2116;">${escaparHtml(nome)}</div>
        <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:bold;letter-spacing:0.1em;color:${ACCENT};margin-top:2px;">${escaparHtml(codigo)}</div>
        ${situacao ? `<div style="font-size:12px;color:#8a8172;margin-top:2px;">${escaparHtml(situacao)}</div>` : ""}
      </td>
    </tr>
  </table>`;
}

module.exports = { renderEmailShell, renderCodigoBox, escaparHtml };
