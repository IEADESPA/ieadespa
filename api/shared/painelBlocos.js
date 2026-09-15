// shared/painelBlocos.js (vB.7 — Painel inicial por perfil)
// "Blocos reaproveitáveis, alimentados pelos cálculos que já existem — sem
// recalcular nada novo, só reunir" (README). Cada bloco baseado em detector
// reaproveita a MESMA leitura do motor de notificações (vB.2,
// shared/notificacaoDetectores.js) e a MESMA regra de "quem vê" que já
// existe em NotificacaoRegras (PermissaoAlvo/NivelAlvo) — o painel de
// alguém mostra exatamente os blocos das notificações que ela receberia,
// nunca uma segunda regra de visibilidade inventada aqui.
const { sql } = require("./db");
const { DETECTORES } = require("./notificacaoDetectores");
const { listarFluxosDoUsuario } = require("./workflow");

const CHAVES_DETECTOR = ["SEGUROS_VENCENDO", "PRESTACAO_CONTAS_ATRASADA", "REPASSE_MALOTE_PARADO"];

function usuarioVeRegra(usuario, regra) {
  if (!regra.Ativa) return false;
  if (regra.PermissaoAlvo && !usuario.permissoes.includes(regra.PermissaoAlvo)) return false;
  if (regra.NivelAlvo && usuario.nivel !== regra.NivelAlvo) return false;
  return true;
}

async function montarPainelInicial(pool, usuario) {
  const blocos = [];

  // Sempre visíveis — não dependem de permissão administrativa nenhuma,
  // são sempre "meus": minhas notificações, minhas tarefas de fluxo.
  const naoLidas = (await pool.request().input("membroId", sql.Int, usuario.membroId).query(`
    SELECT COUNT(*) AS total FROM Notificacoes WHERE DestinatarioMembroId = @membroId AND Lida = 0 AND Arquivada = 0
  `)).recordset[0].total;
  blocos.push({ chave: "notificacoes", titulo: "Notificações não lidas", valor: naoLidas, aba: null });

  const tarefasAtrasadas = await listarFluxosDoUsuario(pool, usuario, { apenasAtrasados: true });
  blocos.push({ chave: "tarefas_atrasadas", titulo: "Minhas tarefas atrasadas", valor: tarefasAtrasadas.length, aba: "meupainel:tarefas" });

  // Blocos baseados em detector — só entram se a MESMA regra que geraria a
  // notificação pra essa pessoa estiver ativa e valer pra ela.
  const NAVEGACAO_POR_CHAVE = { SEGUROS_VENCENDO: "financeiro:seguros", PRESTACAO_CONTAS_ATRASADA: "auditoria", REPASSE_MALOTE_PARADO: "financeiro:repasses" };
  if (CHAVES_DETECTOR.length > 0) {
    const request = pool.request();
    const parametros = CHAVES_DETECTOR.map((chave, i) => { request.input(`c${i}`, sql.NVarChar(60), chave); return `@c${i}`; });
    const regras = (await request.query(`
      SELECT Chave, Titulo, PermissaoAlvo, NivelAlvo, Ativa FROM NotificacaoRegras WHERE Chave IN (${parametros.join(",")})
    `)).recordset;
    for (const regra of regras) {
      if (!usuarioVeRegra(usuario, regra)) continue;
      const detector = DETECTORES[regra.Chave];
      if (!detector) continue;
      const fatos = await detector.detectar(pool);
      blocos.push({ chave: regra.Chave.toLowerCase(), titulo: regra.Titulo, valor: fatos.length, aba: NAVEGACAO_POR_CHAVE[regra.Chave] || null });
    }
  }

  return blocos;
}

module.exports = { montarPainelInicial };
