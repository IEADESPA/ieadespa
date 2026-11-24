// shared/arrolamentoDb.js (FASE 10, Membros, rodada 28 aprovada em 23/11/2026) — COMPLETAR O ARROLAMENTO: as consultas e a gravação. As regras puras moram em
// shared/arrolamento.js; a rota é api/Arrolamento.
// "Vieram" = quem está no rol com a pendência ARROLAMENTO (aberta ou resolvida: toda ficha que a importação do sistema pago trouxe); "faltam" = quem ainda
// está com a situação ARROLAMENTO (o mesmo número do 4º grupo do painel, shared/painelMembros.js); "completadas" = vieram − faltam. Tudo contado no banco,
// dentro do escopo de quem vê (a mesma condição da lista e do painel: escopoRotas.condicaoSqlEscopoPessoa), sem trazer ficha para o Node.
// A gravação é uma transação só, debaixo da trava da pessoa (a mesma da escada: escadaDb.comTravaDaPessoa): a situação, a forma e a data de entrada, o cargo
// (histórico LEGADO, sem data), a congregação (só a ficha que veio sem ela), a pendência resolvida e a trilha. O UPDATE só pega a ficha que ainda está em
// ARROLAMENTO: quem chega depois (a local e a área ao mesmo tempo) leva 409.
const { sql } = require("./db");
const auth = require("./auth");
const { ehGeral, condicaoSqlEscopoPessoa, carregarPessoa, noEscopoDaPessoa, MSG_GERAL } = require("./escopoRotas");
const { registrarAuditoriaNaTransacao } = require("./auditoria");
const escadaDb = require("./escadaDb");
const regras = require("./arrolamento");
const { hojeBrasilia } = require("./dataBrasilia");

const NAO_ENCONTRADA = { sucesso: false, mensagem: "Matrícula não encontrada." };
// a ficha sem Status está no rol (sem ISNULL na coluna: a regra 4 do Banco, api/CLAUDE.md)
const NO_ROL = "(m.Status IS NULL OR m.Status NOT IN (N'DESLIGADO', N'FALECIDO'))";
// as fichas que vieram do sistema pago (uma linha por pessoa): pelo índice IX_FichasPendencias_Situacao (Situacao, Tipo) INCLUDE (MembroId)
const VEIO = `JOIN (SELECT DISTINCT fp.MembroId FROM FichasPendencias fp WHERE fp.Situacao IN (N'ABERTA', N'RESOLVIDA') AND fp.Tipo = N'ARROLAMENTO') v ON v.MembroId = m.MembroId`;
const DE_PESSOA = "FROM MembroReferencia m LEFT JOIN ExtensoesTenda e ON e.ExtensaoId = m.ExtensaoId";
const num = (x) => Number(x) || 0;
const andamentoDe = (vieram, faltam) => ({ vieram, completadas: vieram - faltam, faltam });

// o dia (AAAA-MM-DD, Brasília) em que a importação do sistema pago foi concluída; o banco guarda em UTC
function diaDaImportacao(linha) {
  const veio = linha && linha.veio;
  if (!veio) return null;
  const d = veio instanceof Date ? veio : new Date(String(veio).replace(" ", "T") + (/[Zz]|[+-]\d{2}:?\d{2}$/.test(String(veio)) ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? null : hojeBrasilia(d);
}

function idade(nascimento, hoje) {
  if (!nascimento || !hoje) return null;
  const [a, m, d] = nascimento.split("-").map(Number);
  const [ha, hm, hd] = hoje.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

// O ANDAMENTO para o painel: o total, o dia em que as fichas vieram (veioEm, a importação concluída), cada congregação do escopo (a área, com a área de cada uma),
// cada área e as que vieram sem congregação (a Geral) e as 4 próximas fichas.
// `congregacaoId`: o painel de uma congregação (a área e a Geral escolhem); o escopo continua valendo junto.
async function painel(pool, usuario, { congregacaoId = null } = {}) {
  const geral = ehGeral(usuario);
  const pedido = pool.request();
  const condEscopo = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "e.Nome");
  const vazioResp = { andamento: andamentoDe(0, 0), veioEm: null, porCongregacao: [], proximas: [], ...(geral ? { porArea: [], semCongregacao: 0 } : {}) };
  if (condEscopo === "") return vazioResp;
  let cond = condEscopo ? ` AND ${condEscopo}` : "";
  if (congregacaoId) { pedido.input("cong", sql.Int, congregacaoId); cond += " AND m.CongregacaoId = @cong"; }
  const r = await pedido.query(`
    SELECT m.CongregacaoId AS congId, c.Nome AS cong, c.AreaId AS areaId, ar.Nome AS area, COUNT(*) AS vieram, SUM(CASE WHEN m.SituacaoMembro = N'ARROLAMENTO' THEN 1 ELSE 0 END) AS faltam
    ${DE_PESSOA} ${VEIO} LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN Areas ar ON ar.AreaId = c.AreaId
    WHERE ${NO_ROL}${cond}
    GROUP BY m.CongregacaoId, c.Nome, c.AreaId, ar.Nome;
    SELECT TOP (4) m.MembroId, m.Nome, m.Sexo, d.Nome AS Departamento
    ${DE_PESSOA} LEFT JOIN Departamentos d ON d.DepartamentoId = m.DepartamentoId
    WHERE ${NO_ROL} AND m.SituacaoMembro = N'ARROLAMENTO'${cond}
    ORDER BY m.MembroId;
    SELECT MAX(ConcluidaEm) AS veio FROM ImportacoesMembros WHERE Situacao = N'CONCLUIDA';`);
  const linhas = r.recordsets[0] || [];
  let vieram = 0, faltam = 0, semCongregacao = 0;
  const porArea = new Map();
  const porCongregacao = [];
  for (const l of linhas) {
    vieram += num(l.vieram); faltam += num(l.faltam);
    if (l.congId == null) { semCongregacao += num(l.faltam); continue; }
    porCongregacao.push({ id: num(l.congId), nome: l.cong, area: l.area || null, ...andamentoDe(num(l.vieram), num(l.faltam)) });
    const chave = l.areaId == null ? "sem" : String(l.areaId);
    const a = porArea.get(chave) || { id: l.areaId == null ? null : num(l.areaId), nome: l.area || "Sem área", vieram: 0, faltam: 0 };
    a.vieram += num(l.vieram); a.faltam += num(l.faltam);
    porArea.set(chave, a);
  }
  const porNome = (x, y) => String(x.nome).localeCompare(String(y.nome), "pt-BR");
  porCongregacao.sort(porNome);
  const resp = {
    andamento: andamentoDe(vieram, faltam),
    veioEm: vieram ? diaDaImportacao((r.recordsets[2] || [])[0]) : null,   // "Vieram do sistema pago em 10/12" (o dia de Brasília)
    porCongregacao,
    proximas: (r.recordsets[1] || []).map((l) => ({ matricula: num(l.MembroId), nome: l.Nome, sexo: l.Sexo || null, departamento: l.Departamento || null }))
  };
  if (geral) {
    resp.porArea = [...porArea.values()].map((a) => ({ id: a.id, nome: a.nome, ...andamentoDe(a.vieram, a.faltam) })).sort(porNome);
    resp.semCongregacao = semCongregacao;
  }
  return resp;
}

// A ficha de uma pessoa, com o que veio do sistema pago (sem o CPF, o contato e a filiação: a tela de completar não usa).
async function lerFicha(rq, membroId) {
  const l = (await rq().input("id", sql.Int, membroId).query(`
    SELECT m.MembroId, m.Nome, m.Sexo, m.Status, m.SituacaoMembro, m.CongregacaoId, c.Nome AS Congregacao, d.Nome AS Departamento, m.FormaAdmissao,
           CONVERT(varchar(10), m.DataNascimento, 120) AS Nascimento, CONVERT(varchar(10), m.DataAdmissao, 120) AS DataAdmissao, CONVERT(varchar(10), m.DataBatismo, 120) AS DataBatismo,
           CASE WHEN EXISTS (SELECT 1 FROM FichasPendencias fp WHERE fp.MembroId = m.MembroId AND fp.Tipo = N'ARROLAMENTO') THEN 1 ELSE 0 END AS Veio
    FROM MembroReferencia m LEFT JOIN Congregacoes c ON c.CongregacaoId = m.CongregacaoId LEFT JOIN Departamentos d ON d.DepartamentoId = m.DepartamentoId
    WHERE m.MembroId = @id`)).recordset[0];
  return l || null;
}

const noRol = (l) => !["DESLIGADO", "FALECIDO"].includes(l.Status || "ATIVO");
// a ficha em ARROLAMENTO? (a que já saiu do grupo: 409 com o porquê; ela está no escopo de quem pergunta, então não há o que esconder)
function estadoDaFicha(l) {
  if (l.SituacaoMembro === "ARROLAMENTO") return null;
  return { sucesso: false, status: 409, mensagem: num(l.Veio) ? "Esta ficha já foi completada." : "Esta ficha não está no arrolamento a completar." };
}

// O andamento da congregação da ficha (ou das que vieram sem congregação) e a PRÓXIMA ficha depois desta, no escopo de quem vê (voltando ao começo no fim).
async function andamentoEProxima(pool, usuario, { congregacaoId, depois, excluir }) {
  const pedido = pool.request();
  const condEscopo = await condicaoSqlEscopoPessoa(pool, usuario, pedido, "m.CongregacaoId", "e.Nome");
  if (condEscopo === "") return { andamento: andamentoDe(0, 0), proxima: null };
  const lugar = congregacaoId ? "m.CongregacaoId = @cong" : "m.CongregacaoId IS NULL";
  if (congregacaoId) pedido.input("cong", sql.Int, congregacaoId);
  pedido.input("depois", sql.Int, depois || 0).input("excluir", sql.Int, excluir || 0);
  const cond = `${NO_ROL} AND ${lugar}${condEscopo ? ` AND ${condEscopo}` : ""}`;
  const r = await pedido.query(`
    SELECT COUNT(*) AS vieram, SUM(CASE WHEN m.SituacaoMembro = N'ARROLAMENTO' THEN 1 ELSE 0 END) AS faltam ${DE_PESSOA} ${VEIO} WHERE ${cond};
    SELECT TOP (1) m.MembroId, m.Nome ${DE_PESSOA} WHERE ${cond} AND m.SituacaoMembro = N'ARROLAMENTO' AND m.MembroId <> @excluir
    ORDER BY CASE WHEN m.MembroId > @depois THEN 0 ELSE 1 END, m.MembroId;`);
  const a = r.recordsets[0][0] || {};
  const p = r.recordsets[1][0];
  return { andamento: andamentoDe(num(a.vieram), num(a.faltam)), proxima: p ? { matricula: num(p.MembroId), nome: p.Nome } : null };
}

// A FICHA PARA COMPLETAR. query: { matricula } (a da lista) | { congregacaoId, depois } (a primeira, ou a seguinte ao pular) | { semCongregacao: 1, depois } (só a Geral).
async function fichaParaCompletar(pool, usuario, query, hoje) {
  const q = query || {};
  let membroId = null;
  if (q.matricula !== undefined && q.matricula !== "") {
    membroId = auth.idDeRota(q.matricula);
    if (!membroId) return { sucesso: false, status: 400, mensagem: "Informe a matrícula." };
  } else {
    const sem = q.semCongregacao === "1" || q.semCongregacao === 1;
    const congregacaoId = sem ? null : auth.idDeRota(q.congregacaoId);
    if (!sem && !congregacaoId) return { sucesso: false, status: 400, mensagem: "Informe a matrícula ou a congregação." };
    if (sem && !ehGeral(usuario)) return { sucesso: false, status: 403, mensagem: MSG_GERAL };
    let depois = 0;
    if (q.depois !== undefined && q.depois !== "") {
      depois = auth.idDeRota(q.depois);
      if (!depois) return { sucesso: false, status: 400, mensagem: "Matrícula inválida." };
    }
    const { proxima } = await andamentoEProxima(pool, usuario, { congregacaoId, depois });
    if (!proxima) return { sucesso: true, status: 200, ficha: null, proxima: null };
    membroId = proxima.matricula;
  }
  const alvo = await carregarPessoa(pool, membroId);
  if (!alvo || !noEscopoDaPessoa(usuario, alvo.congregacaoNome, alvo.extensaoNome)) return { ...NAO_ENCONTRADA, status: 200 };
  const l = await lerFicha(() => pool.request(), membroId);
  if (!l || !noRol(l)) return { ...NAO_ENCONTRADA, status: 200 };
  const estado = estadoDaFicha(l);
  if (estado) return estado;
  const congId = l.CongregacaoId == null ? null : num(l.CongregacaoId);
  const { andamento, proxima } = await andamentoEProxima(pool, usuario, { congregacaoId: congId, depois: membroId, excluir: membroId });
  return {
    sucesso: true, status: 200,
    ficha: { matricula: membroId, nome: l.Nome, nascimento: l.Nascimento || null, idade: idade(l.Nascimento, hoje), sexo: l.Sexo || null, congregacaoId: congId,
      congregacao: l.Congregacao || null, departamento: l.Departamento || null, formaAdmissao: l.FormaAdmissao || null, dataAdmissao: l.DataAdmissao || null, dataBatismo: l.DataBatismo || null },
    proxima, andamento
  };
}

// COMPLETAR. corpo: { matricula, situacao, formaAdmissao, dataAdmissao, cargoMinisterial, congregacaoId }. Devolve { sucesso, status, mensagem, proxima }.
async function completar(pool, usuario, corpo, hoje) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { sucesso: false, status: 400, mensagem: "Envie a situação, como e quando a pessoa entrou." };
  const membroId = auth.idDeRota(corpo.matricula);
  if (!membroId) return { sucesso: false, status: 400, mensagem: "Informe a matrícula." };
  const alvo = await carregarPessoa(pool, membroId);
  if (!alvo || !noEscopoDaPessoa(usuario, alvo.congregacaoNome, alvo.extensaoNome)) return { ...NAO_ENCONTRADA, status: 200 };
  const l = await lerFicha(() => pool.request(), membroId);
  if (!l || !noRol(l)) return { ...NAO_ENCONTRADA, status: 200 };
  const estado = estadoDaFicha(l);
  if (estado) return estado;
  const v = regras.validarCompletar(corpo, { hoje, nascimento: l.Nascimento || null });
  if (!v.ok) return { sucesso: false, status: 400, mensagem: v.mensagem };
  const d = v.dados;
  const congLida = l.CongregacaoId == null ? null : num(l.CongregacaoId);
  const pode = regras.podeCompletar({ geral: ehGeral(usuario), propria: membroId === Number(usuario.membroId), temCongregacao: congLida !== null, congregacaoPedida: d.congregacaoId });
  if (!pode.pode) return { sucesso: false, status: pode.status, mensagem: pode.mensagem };
  if (d.cargo) {
    const c = await pool.request().input("s", sql.NVarChar(30), d.cargo).query(`SELECT TOP 1 Nome FROM CargosMinisteriais WHERE Sigla = @s`);
    if (!c.recordset[0]) return { sucesso: false, status: 400, mensagem: "Este cargo não está cadastrado: escolha da lista." };
  }
  if (d.congregacaoId) {
    const c = await pool.request().input("c", sql.Int, d.congregacaoId).query(`SELECT TOP 1 Nome FROM Congregacoes WHERE CongregacaoId = @c AND Ativa = 1`);
    if (!c.recordset[0]) return { sucesso: false, status: 400, mensagem: "Esta congregação não foi encontrada: escolha da lista." };
  }
  const congregado = d.situacao === "CONGREGADO";
  const por = Number(usuario.membroId);
  const feito = await escadaDb.comTravaDaPessoa(pool, membroId, async (t) => {
    const rq = () => new sql.Request(t);
    await rq().query("SET XACT_ABORT ON");
    const u = await rq().input("id", sql.Int, membroId).input("s", sql.NVarChar(30), d.situacao).input("congregado", sql.Bit, congregado ? 1 : 0)
      .input("f", sql.NVarChar(30), d.formaAdmissao).input("dt", sql.Date, d.dataAdmissao).input("nova", sql.Int, d.congregacaoId).input("lida", sql.Int, congLida)
      .query(`UPDATE MembroReferencia SET SituacaoMembro = @s,
                FormaAdmissao = CASE WHEN @congregado = 1 THEN FormaAdmissao ELSE @f END,
                DataAdmissao = CASE WHEN @congregado = 1 THEN DataAdmissao ELSE @dt END,
                CongregacaoId = CASE WHEN @nova IS NULL THEN CongregacaoId ELSE @nova END
              WHERE MembroId = @id AND SituacaoMembro = N'ARROLAMENTO' AND (Status IS NULL OR Status NOT IN (N'DESLIGADO', N'FALECIDO'))
                AND ${congLida === null ? "CongregacaoId IS NULL" : "CongregacaoId = @lida"}`);
    if (!u.rowsAffected[0]) return { sucesso: false, status: 409, mensagem: "Esta ficha já foi completada (ou mudou agora há pouco): abra de novo." };
    if (d.cargo) {
      await escadaDb.trocarCargoNaTransacao(t, { membroId, cargoNovo: d.cargo, desde: null, origem: "LEGADO", por,
        observacao: "Cargo que a pessoa já tinha no sistema pago, informado ao completar o arrolamento." });
    }
    await rq().input("id", sql.Int, membroId).input("por", sql.Int, por).query(`
      UPDATE FichasPendencias SET Situacao = N'RESOLVIDA', Resolucao = N'COMPLETADA', ResolvidaEm = SYSUTCDATETIME(), ResolvidaPor = @por
      WHERE MembroId = @id AND Tipo = N'ARROLAMENTO' AND Situacao = N'ABERTA'`);
    await registrarAuditoriaNaTransacao(t, { tabela: "MembroReferencia", registroId: membroId, acao: "Completou o arrolamento", usuarioId: por,
      dadosAntes: { situacaoMembro: "ARROLAMENTO", formaAdmissao: l.FormaAdmissao || null, dataAdmissao: l.DataAdmissao || null, congregacaoId: congLida },
      dadosDepois: { situacaoMembro: d.situacao, formaAdmissao: congregado ? (l.FormaAdmissao || null) : d.formaAdmissao, dataAdmissao: congregado ? (l.DataAdmissao || null) : d.dataAdmissao,
        congregacaoId: d.congregacaoId || congLida, ...(d.cargo ? { cargoMinisterial: d.cargo } : {}) } });
    return { sucesso: true };
  });
  if (!feito || feito.sucesso === false) return { sucesso: false, status: (feito && feito.status) || 409, mensagem: (feito && feito.mensagem) || "Esta ficha mudou agora há pouco: abra de novo." };
  const { proxima } = await andamentoEProxima(pool, usuario, { congregacaoId: d.congregacaoId || congLida, depois: membroId, excluir: membroId });
  return { sucesso: true, status: 200, mensagem: regras.recadoFeito(d.situacao, l.Nome), proxima };
}

module.exports = { painel, fichaParaCompletar, completar, NAO_ENCONTRADA };
