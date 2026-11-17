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
// O erro do banco é a chave primária repetida (outra matrícula igual), e não o CPF repetido (índice único UX_MembroReferencia_Cpf)?
const ehMatriculaRepetida = (e) => !!e && (e.number === 2627 || e.number === 2601) && !/UX_MembroReferencia_Cpf/i.test(String(e.message || "")) && /PRIMARY KEY|PK_/i.test(String(e.message || ""));
const ehCpfRepetido = (e) => !!e && (e.number === 2627 || e.number === 2601) && /UX_MembroReferencia_Cpf/i.test(String(e.message || ""));

module.exports = { proximaMatricula, ehMatriculaRepetida, ehCpfRepetido };
