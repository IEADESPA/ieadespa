// shared/ministeriosPessoa.js (FASE 10, as sobras de Membros, 19/11/2026) — ONDE A PESSOA SERVE (migração 181): o "Serve em algum ministério?" do cadastro e o
// "Onde serve" da ficha 360. O catálogo é o dos departamentos (Departamentos) com o Tipo diferente de DEPARTAMENTO: o departamento da pessoa (pela idade) fica
// à parte, como o responsável decidiu. Não é escala nem voluntariado (não põe ninguém numa escala).
const { sql } = require("./db");
const { registrarAuditoria } = require("./auditoria");
const { violouUnicidade } = require("./violacaoUnica");

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeIso = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Os ministérios da pessoa (em aberto primeiro; os encerrados embaixo, para a história)
async function listar(pool, membroId) {
  const r = await pool.request().input("m", sql.Int, Number(membroId)).query(`
    SELECT mm.MembroMinisterioId, mm.DepartamentoId, d.Nome, d.Tipo, mm.Desde, mm.EncerradoEm
    FROM MembrosMinisterios mm JOIN Departamentos d ON d.DepartamentoId = mm.DepartamentoId
    WHERE mm.MembroId = @m
    ORDER BY CASE WHEN mm.EncerradoEm IS NULL THEN 0 ELSE 1 END, d.Nome`);
  return r.recordset.map((l) => ({
    id: Number(l.MembroMinisterioId), departamentoId: Number(l.DepartamentoId), nome: l.Nome, tipo: l.Tipo || null,
    desde: l.Desde ? new Date(l.Desde).toISOString().slice(0, 10) : null, encerradoEm: l.EncerradoEm || null, ativo: !l.EncerradoEm
  }));
}

// Registrar: o ministério precisa existir, estar ativo e não ser um departamento (a faixa de idade). `desde`: aaaa-mm-dd, não no futuro (vazio = não informado).
async function registrar(pool, { membroId, departamentoId, desde, por }) {
  const id = Number(departamentoId);
  if (!Number.isInteger(id) || id <= 0) return { sucesso: false, mensagem: "Escolha o ministério." };
  if (desde != null && desde !== "" && (typeof desde !== "string" || !DATA.test(desde) || desde > hojeIso())) return { sucesso: false, mensagem: "A data de quando começou a servir não confere." };
  const dep = (await pool.request().input("d", sql.Int, id).query(`SELECT Nome, Tipo, ISNULL(Ativo, 1) AS Ativo FROM Departamentos WHERE DepartamentoId = @d`)).recordset[0];
  if (!dep || !dep.Ativo) return { sucesso: false, mensagem: "Este ministério não existe ou não está ativo." };
  if (String(dep.Tipo || "DEPARTAMENTO") === "DEPARTAMENTO") return { sucesso: false, mensagem: "Os departamentos (pela idade) ficam no campo Departamento; aqui só os ministérios e as secretarias." };
  try {
    const r = await pool.request().input("m", sql.Int, Number(membroId)).input("d", sql.Int, id).input("desde", sql.Date, desde || null).input("por", sql.Int, por)
      .query(`INSERT INTO MembrosMinisterios (MembroId, DepartamentoId, Desde, RegistradoPor) OUTPUT INSERTED.MembroMinisterioId
              SELECT @m, @d, @desde, @por WHERE NOT EXISTS (SELECT 1 FROM MembrosMinisterios WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND DepartamentoId = @d AND EncerradoEm IS NULL)`);
    if (!r.recordset[0]) return { sucesso: true, jaEstava: true, mensagem: `Já estava registrado: serve em ${dep.Nome}.` };
    await registrarAuditoria({ tabela: "MembrosMinisterios", registroId: r.recordset[0].MembroMinisterioId, acao: "MINISTERIO_REGISTRADO", usuarioId: por, dadosDepois: { membroId: Number(membroId), departamentoId: id } });
    return { sucesso: true, mensagem: `Registrado: serve em ${dep.Nome}.` };
  } catch (e) {
    if (!violouUnicidade(e)) throw e;
    return { sucesso: true, jaEstava: true, mensagem: `Já estava registrado: serve em ${dep.Nome}.` };
  }
}

// Encerrar (deixou de servir): guarda a data; nada se apaga. Só o registro desta pessoa.
async function encerrar(pool, { membroId, id, por }) {
  const r = await pool.request().input("id", sql.Int, Number(id)).input("m", sql.Int, Number(membroId)).input("por", sql.Int, por)
    .query(`UPDATE MembrosMinisterios SET EncerradoEm = SYSUTCDATETIME(), EncerradoPor = @por OUTPUT INSERTED.DepartamentoId
            WHERE MembroMinisterioId = @id AND MembroId = @m AND EncerradoEm IS NULL`);
  if (!r.recordset[0]) return { sucesso: false, naoExiste: true };
  await registrarAuditoria({ tabela: "MembrosMinisterios", registroId: Number(id), acao: "MINISTERIO_ENCERRADO", usuarioId: por, dadosDepois: { membroId: Number(membroId) } });
  return { sucesso: true, mensagem: "Registrado: deixou de servir neste ministério." };
}

module.exports = { listar, registrar, encerrar };
