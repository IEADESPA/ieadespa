// shared/notificacaoMotor.js
// Orquestra uma rodada do motor de notificações (vB.2): lê o catálogo
// declarativo (NotificacaoRegras), roda o detector de cada regra ativa
// (shared/notificacaoDetectores.js), cria as notificações que faltam
// (shared/notificacoes.js) e dispara e-mail/push (vB.5) de quem não optou
// por sair daquela categoria. Separado de shared/notificacoes.js pra esse
// não precisar carregar os SDKs de e-mail/push nos testes puros.
const { sql } = require("./db");
const { resolverDestinatariosPorPermissao, criarNotificacao, marcarEmailEnviado, podeReceberEmail } = require("./notificacoes");
const { enviarEmailNotificacao } = require("./notificacaoEmail");
const { enviarPushNotificacao } = require("./notificacaoPush");
const { DETECTORES } = require("./notificacaoDetectores");

// Único ponto que decide "por onde essa notificação sai" — usado tanto
// pelo avaliador automático quanto por quem cria notificação direto (ex:
// shared/workflow.js::escalonarSLAsVencidos, vB.3/FLUXO_ESCALONADO), pra
// nunca ter dois lugares reimplementando a mesma regra de canal/opt-out.
// `regra` pode vir pré-carregada (evita reconsultar dentro de um loop já
// carregado); sem ela, busca por regraChave.
async function enviarCanaisNotificacao(pool, { regraChave, regra, destinatarioMembroId, notificacaoId, titulo, mensagem, categoria, email }) {
  const regraFinal = regra || (await pool.request().input("chave", sql.NVarChar(60), regraChave)
    .query(`SELECT CanalEmail, CanalPush, Obrigatoria FROM NotificacaoRegras WHERE Chave = @chave`)).recordset[0];
  if (!regraFinal) return { emailEnviado: false, pushEnviados: 0 };

  let emailEnviado = false;
  if (regraFinal.CanalEmail && email) {
    const pode = await podeReceberEmail(pool, destinatarioMembroId, categoria, regraFinal.Obrigatoria);
    if (pode) {
      emailEnviado = await enviarEmailNotificacao({ email, titulo, mensagem });
      if (emailEnviado) await marcarEmailEnviado(pool, notificacaoId);
    }
  }

  let pushEnviados = 0;
  if (regraFinal.CanalPush) {
    pushEnviados = await enviarPushNotificacao(pool, sql, destinatarioMembroId, { titulo, mensagem });
  }

  return { emailEnviado, pushEnviados };
}

async function avaliarRegras(pool) {
  const regras = (await pool.request().query(`SELECT * FROM NotificacaoRegras WHERE Ativa = 1`)).recordset;
  let criadas = 0;
  let emailsEnviados = 0;
  let pushesEnviados = 0;

  for (const regra of regras) {
    const detector = DETECTORES[regra.Chave];
    if (!detector) continue; // regra cadastrada sem detector implementado ainda — fica inerte, não quebra a rodada
    const fatos = await detector.detectar(pool);
    if (fatos.length === 0) continue;
    const destinatarios = await resolverDestinatariosPorPermissao(pool, { permissao: regra.PermissaoAlvo, nivel: regra.NivelAlvo });
    if (destinatarios.length === 0) continue;

    for (const fato of fatos) {
      for (const dest of destinatarios) {
        const { criada, notificacaoId } = await criarNotificacao(pool, {
          regraChave: regra.Chave,
          destinatarioMembroId: dest.membroId,
          titulo: regra.Titulo,
          mensagem: fato.fatoGerador,
          categoria: regra.Categoria,
          referenciaTabela: detector.tabela,
          referenciaId: fato.referenciaId
        });
        if (!criada) continue;
        criadas++;

        const envio = await enviarCanaisNotificacao(pool, {
          regra, destinatarioMembroId: dest.membroId, notificacaoId, titulo: regra.Titulo,
          mensagem: fato.fatoGerador, categoria: regra.Categoria, email: dest.email
        });
        if (envio.emailEnviado) emailsEnviados++;
        pushesEnviados += envio.pushEnviados;
      }
    }
  }

  return { criadas, emailsEnviados, pushesEnviados };
}

// Digest por perfil (vB.2) — não é um segundo canal, é a mesma central de
// avisos agrupada por categoria, pro Tesoureiro Geral (por exemplo) não
// precisar rolar 40 linhas soltas pra entender "o que trava o fechamento".
async function montarDigest(pool, membroId) {
  const result = await pool.request().input("membroId", sql.Int, membroId).query(`
    SELECT Categoria, COUNT(*) AS total, MAX(CriadaEm) AS maisRecente
    FROM Notificacoes
    WHERE DestinatarioMembroId = @membroId AND Lida = 0 AND Arquivada = 0
    GROUP BY Categoria
    ORDER BY MAX(CriadaEm) DESC
  `);
  return result.recordset.map(r => ({ categoria: r.Categoria, total: r.total, maisRecente: r.maisRecente }));
}

module.exports = { avaliarRegras, montarDigest, enviarCanaisNotificacao };
