// shared/notificacaoMotor.js
// Orquestra uma rodada do motor de notificações (vB.2): lê o catálogo
// declarativo (NotificacaoRegras), roda o detector de cada regra ativa
// (shared/notificacaoDetectores.js), cria as notificações que faltam
// (shared/notificacoes.js) e dispara o e-mail de quem não optou por sair
// daquela categoria. Separado de shared/notificacoes.js pra esse não
// precisar carregar o SDK do Azure Communication Email nos testes puros.
const { sql } = require("./db");
const { resolverDestinatariosPorPermissao, criarNotificacao, marcarEmailEnviado, podeReceberEmail } = require("./notificacoes");
const { enviarEmailNotificacao } = require("./notificacaoEmail");
const { DETECTORES } = require("./notificacaoDetectores");

async function avaliarRegras(pool) {
  const regras = (await pool.request().query(`SELECT * FROM NotificacaoRegras WHERE Ativa = 1`)).recordset;
  let criadas = 0;
  let emailsEnviados = 0;

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

        if (regra.CanalEmail && dest.email) {
          const pode = await podeReceberEmail(pool, dest.membroId, regra.Categoria, regra.Obrigatoria);
          if (pode) {
            const enviou = await enviarEmailNotificacao({ email: dest.email, titulo: regra.Titulo, mensagem: fato.fatoGerador });
            if (enviou) {
              await marcarEmailEnviado(pool, notificacaoId);
              emailsEnviados++;
            }
          }
        }
      }
    }
  }

  return { criadas, emailsEnviados };
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

module.exports = { avaliarRegras, montarDigest };
