// shared/directusContas.js (vC.3)
// Ponte com o site institucional (Directus) — usado só pela Carta de
// Mudança, quando o próprio membro escolhe manter acesso ao site (Minha
// Conta) mesmo depois de desligado. DIRECTUS_URL não é segredo (mesma URL
// pública que o site usa); DIRECTUS_ADMIN_TOKEN é o mesmo token que
// site/api já usa pra escrever em `contas` — precisa estar configurado
// também nas app settings desta Function App (ver README, vC.3).
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

// Garante que existe uma conta no site pra este e-mail — só o e-mail (dado
// essencial da conta), nunca nome/telefone/matrícula: a conta do site é
// deliberadamente mínima e independente do sistema (mesmo modelo de
// "Minha Conta" que já existe pra visitantes). Não sobrescreve conta já
// existente, só cria se não houver.
async function garantirContaSite(email) {
  if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN || !email) return false;
  const emailLimpo = String(email).trim().toLowerCase();
  if (!emailLimpo.includes("@")) return false;

  const headers = { Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}`, "Content-Type": "application/json" };
  const existente = await fetch(
    `${DIRECTUS_URL}/items/contas?filter[email][_eq]=${encodeURIComponent(emailLimpo)}&limit=1`,
    { headers },
  );
  if (existente.ok) {
    const data = (await existente.json()).data;
    if (data && data.length > 0) return true;
  }
  const criado = await fetch(`${DIRECTUS_URL}/items/contas`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: emailLimpo }),
  });
  return criado.ok;
}

module.exports = { garantirContaSite };
