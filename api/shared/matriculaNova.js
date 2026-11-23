// shared/matriculaNova.js (FASE 10, v10.1b) — a matrícula da pessoa nova, uma regra só para o cadastro (GestaoPessoas) e para o aceite da fila (passo 4).
// Decisão do responsável (13/11/2026): o menor número liberado ao juntar fichas que ninguém usa (MatriculasLivres), senão a maior + 1. Sem trava: a corrida entre
// dois cadastros ao mesmo tempo é resolvida na gravação (a chave primária recusa o segundo, que pede outro número — ver ehMatriculaRepetida).

// rq = uma função que devolve um pedido novo (pool.request ou new sql.Request(tx))
async function proximaMatricula(rq) {
  const r = await rq().query(`
    SELECT COALESCE(
      (SELECT MIN(l.MembroId) FROM MatriculasLivres l WHERE NOT EXISTS (SELECT 1 FROM MembroReferencia x WHERE x.MembroId = l.MembroId)),
      (SELECT ISNULL(MAX(MembroId), 0) + 1 FROM MembroReferencia)) AS id`);
  return Number(r.recordset[0].id);
}
// A TRAVA DAS MATRÍCULAS (decisão do responsável, 23/11/2026: "Ninguém vai ser cadastrado antes da importação. Eu só vou liberar depois de importar."):
// enquanto não existir uma importação do sistema pago CONCLUÍDA (ImportacoesMembros, migração 185), nenhum caminho cria ficha NOVA — o "Cadastrar" (gerada ou
// digitada), o importador antigo, o aceite e o lançar na fila e o "Quero me cadastrar" do site. Fica FORA de proximaMatricula de propósito: a própria
// importação (importacaoMembrosDb) chama proximaMatricula para as linhas sem número. CONCLUIDA só nasce no último lote e nunca volta atrás, então conferir
// e depois gravar é seguro (o "liberado" não volta a "travado"). A tabela tem uma linha por prévia (poucas, para sempre): sem índice próprio.
const MSG_TRAVADA = "As matrículas novas só começam depois da importação do sistema pago.";
async function matriculasLiberadas(rq) {
  const r = await rq().query(`SELECT CASE WHEN EXISTS (SELECT 1 FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA') THEN 1 ELSE 0 END AS liberadas`);
  const l = r && r.recordset && r.recordset[0];
  return !!l && Number(l.liberadas) === 1;   // sem resposta = travada (falha fechada)
}
// O erro do banco é a chave primária repetida (outra matrícula igual), e não o CPF repetido (índice único UX_MembroReferencia_Cpf)?
const ehMatriculaRepetida = (e) => !!e && (e.number === 2627 || e.number === 2601) && !/UX_MembroReferencia_Cpf/i.test(String(e.message || "")) && /PRIMARY KEY|PK_/i.test(String(e.message || ""));
const ehCpfRepetido = (e) => !!e && (e.number === 2627 || e.number === 2601) && /UX_MembroReferencia_Cpf/i.test(String(e.message || ""));

module.exports = { proximaMatricula, matriculasLiberadas, MSG_TRAVADA, ehMatriculaRepetida, ehCpfRepetido };
