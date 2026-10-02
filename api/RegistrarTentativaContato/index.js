// RegistrarTentativaContato
// Registra uma tentativa de contato com o membro por um Canal Oficial de Comunicação
// (Estatuto Art. 12 §2º) — pré-requisito para poder abrir um procedimento de Abandono
// Digital (precisa de ao menos 2 tentativas em canais distintos). Exige a permissão
// "disciplina" (mesma CLI que cuida do Abandono Material).
// POST /api/tentativas-contato -> body: { membroId, canalId, dataTentativa?, observacao? }
//
// Auditoria de escopo (02/10/2026):
//  - só registra para membro DENTRO do escopo de quem chama; fora do escopo responde igual a "matrícula não encontrada";
//  - a data da tentativa é a de hoje ou, no máximo, dos últimos 7 dias; futura ou mais antiga é recusada. Antes era livre, e duas tentativas "de 100 dias atrás" em
//    canais diferentes fabricavam o prazo de 90 dias do Art. 12 §2º (e o procedimento nascia com a defesa de 15 dias já vencida).
const auth = require("../shared/auth");
const { registrarAuditoria } = require("../shared/auditoria");
const { getPool, sql } = require("../shared/db");
const canais = require("../shared/canais");
const abandonoDigital = require("../shared/abandonoDigital");
const { pessoaAlcancavel } = require("../shared/escopoRotas");

module.exports = async function (context, req) {
  const usuario = auth.exigirPermissao(req, context, "disciplina");
  if (!usuario) return;

  const { membroId: membroInformado, canalId: canalInformado, dataTentativa: dataInformada, observacao } = req.body || {};
  if (!membroInformado || !canalInformado) {
    context.res = { status: 400, body: { sucesso: false, mensagem: "Informe membroId e canalId." } };
    return;
  }
  const data = abandonoDigital.resolverDataTentativa(dataInformada);
  if (data.erro) {
    context.res = { status: 400, body: { sucesso: false, mensagem: data.erro } };
    return;
  }

  const pool = await getPool();
  const pessoa = await pessoaAlcancavel(pool, usuario, membroInformado);
  if (!pessoa) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Matrícula não encontrada." } };
    return;
  }
  const membroId = pessoa.membroId;
  // v7.3 — só vale contato individual por canal institucional ativo (e-mail, telefone/WhatsApp institucional,
  // o próprio sistema). Grupo e rede social não notificam um membro: não contam (Estatuto Art. 12 §2º).
  const canalId = auth.idDeRota(canalInformado);
  const canal = canalId
    ? await pool.request().input("id", sql.Int, canalId).query(`SELECT CanalId, Ativo, Plataforma, Categoria FROM CanaisOficiaisComunicacao WHERE CanalId = @id`)
    : { recordset: [] };
  const linhaCanal = canal.recordset[0];
  if (!linhaCanal || !canais.contaParaAbandono({ ativo: !!linhaCanal.Ativo, plataforma: linhaCanal.Plataforma, categoria: linhaCanal.Categoria })) {
    context.res = { status: 200, body: { sucesso: false, mensagem: "Canal Oficial de Comunicação inválido, inativo ou que não serve para contato individual (grupos e redes sociais não contam como tentativa de contato)." } };
    return;
  }

  const result = await pool.request()
    .input("membroId", sql.Int, membroId)
    .input("canalId", sql.Int, canalId)
    .input("dataTentativa", sql.Date, data.data)
    .input("observacao", sql.NVarChar(300), observacao ? String(observacao).slice(0, 300) : null)
    .input("registradoPor", sql.Int, usuario.membroId)
    .query(`
      INSERT INTO TentativasContatoAbandono (MembroId, CanalId, DataTentativa, Observacao, RegistradoPor)
      OUTPUT INSERTED.TentativaId
      VALUES (@membroId, @canalId, COALESCE(@dataTentativa, CAST(SYSUTCDATETIME() AS DATE)), @observacao, @registradoPor)
    `);
  const tentativaId = result.recordset[0].TentativaId;

  await registrarAuditoria({
    tabela: "TentativasContatoAbandono",
    registroId: tentativaId,
    acao: "Registrou tentativa de contato (Abandono Digital)",
    usuarioId: usuario.membroId,
    dadosDepois: { membroId, canalId, dataTentativa: data.data, observacao }
  });

  context.res = { status: 201, headers: { "Content-Type": "application/json" }, body: { sucesso: true, mensagem: "✅ Tentativa de contato registrada.", tentativaId } };
};
