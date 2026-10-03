// shared/delegacoes.js (vB.9 — Acesso: delegação temporária)
// "Vou viajar, o 2º Secretário responde por mim" — hoje a única saída é
// emprestar a própria senha, o que destrói a auditoria (a ação fica
// registrada na pessoa errada, ver shared/auditoria.js). A delegação
// resolve isso ao contrário: o delegado continua logando com A PRÓPRIA
// matrícula/senha — a sessão dele só passa a incluir, além do que já é
// seu, a permissão+escopo do papel delegado, por um prazo definido. Toda
// ação continua auditada com o `usuarioId` real de quem clicou — nunca
// precisa emprestar identidade nenhuma.
const { resolverEscopoCongregacoes, resolverNomeExtensao } = require("./escopo");

function validarPrazo(dataInicio, dataFim, hoje) {
  if (!dataInicio || !dataFim) return "Informe dataInicio e dataFim.";
  if (dataFim < dataInicio) return "dataFim não pode ser antes de dataInicio.";
  if (dataFim < hoje) return "dataFim já passou — a delegação precisa valer pra frente, não pro passado.";
  return null;
}

async function criarDelegacao(pool, sql, { liderancaId, deleganteMembroId, delegadoMembroId, dataInicio, dataFim, motivo }) {
  if (Number(delegadoMembroId) === Number(deleganteMembroId)) {
    return { sucesso: false, mensagem: "Não dá pra delegar pra si mesmo." };
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const erroPrazo = validarPrazo(dataInicio, dataFim, hoje);
  if (erroPrazo) return { sucesso: false, mensagem: erroPrazo };

  // A Lideranca sendo delegada precisa ser mesmo do delegante — sem isso,
  // qualquer um poderia "delegar" um papel de outra pessoa.
  const dono = (await pool.request().input("id", sql.Int, liderancaId).query(
    `SELECT MembroId FROM Lideranca WHERE LiderancaId = @id`
  )).recordset[0];
  if (!dono || dono.MembroId !== Number(deleganteMembroId)) {
    return { sucesso: false, mensagem: "Esse papel não é seu — só dá pra delegar o próprio." };
  }

  const inserida = await pool.request()
    .input("liderancaId", sql.Int, liderancaId)
    .input("deleganteMembroId", sql.Int, deleganteMembroId)
    .input("delegadoMembroId", sql.Int, delegadoMembroId)
    .input("dataInicio", sql.Date, dataInicio)
    .input("dataFim", sql.Date, dataFim)
    .input("motivo", sql.NVarChar(300), motivo || null)
    .query(`
      INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo)
      OUTPUT INSERTED.DelegacaoId
      VALUES (@liderancaId, @deleganteMembroId, @delegadoMembroId, @dataInicio, @dataFim, @motivo)
    `);
  return { sucesso: true, delegacaoId: inserida.recordset[0].DelegacaoId };
}

// Todo papel (Lideranca) hoje ativamente delegado a este membro — usado
// tanto no login (pra somar permissão/escopo) quanto na tela "delegado a
// mim". Ativa = Status='ATIVA' E dentro da janela de datas.
async function delegacoesAtivasRecebidas(pool, sql, membroId, hoje) {
  const result = await pool.request().input("membroId", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
    SELECT d.DelegacaoId, d.LiderancaId, d.DataFim, CONVERT(varchar(10), d.DataFim, 120) AS DataFimTexto, d.Motivo, deleg.Nome AS deleganteNome,
           l.EscopoTipo, l.EscopoId, l.DepartamentoId, CONVERT(varchar(10), l.AtivoAte, 120) AS LiderancaAtivoAteTexto, p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr
    FROM DelegacoesAcesso d
    JOIN Lideranca l ON l.LiderancaId = d.LiderancaId
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia deleg ON deleg.MembroId = d.DeleganteMembroId
    WHERE d.DelegadoMembroId = @membroId AND d.Status = 'ATIVA' AND d.DataInicio <= @hoje AND d.DataFim >= @hoje
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)
  `);
  return result.recordset;
}

// Resolve o que a sessão do delegado ganha A MAIS (permissões + escopo) —
// nunca substitui o que ele já tinha, só une. Escopo "TODAS" de qualquer
// lado vence (é o modo mais amplo); senão, une as listas de congregação.
// v7.6 — o LOGIN não usa mais esta soma (ela fazia a delegação ampliar o escopo de todas as permissões): usa concessoesDelegadas, abaixo. Fica para quem só
// precisa do resumo (a soma das delegações, sem decidir acesso).
async function permissoesEscopoDelegados(pool, sql, membroId, hoje) {
  const delegacoes = await delegacoesAtivasRecebidas(pool, sql, membroId, hoje);
  let permissoesExtras = [];
  let escopoExtra = [];
  let escopoVirouTodas = false;

  for (const d of delegacoes) {
    permissoesExtras = permissoesExtras.concat((d.permissoesStr || "").split(",").map((p) => p.trim()).filter(Boolean));
    const escopo = await resolverEscopoCongregacoes(pool, d.EscopoTipo, d.EscopoId);
    if (escopo === "TODAS") escopoVirouTodas = true;
    else escopoExtra = escopoExtra.concat(escopo);
  }

  return {
    permissoesExtras: [...new Set(permissoesExtras)],
    escopoExtra: escopoVirouTodas ? "TODAS" : [...new Set(escopoExtra)],
    delegacoesAtivas: delegacoes.map((d) => ({ delegacaoId: d.DelegacaoId, deleganteNome: d.deleganteNome, papelNome: d.papelNome, dataFim: d.DataFim }))
  };
}

// v7.6 — uma CONCESSÃO por delegação ativa (ver shared/auth.js, "Concessões"): a permissão delegada vale só com o escopo, o nível e o departamento do papel
// delegado, e só até o último dia da delegação (`ate`) — a delegação não amplia mais o escopo das permissões do cargo próprio, nem o contrário.
// `expiradas`: permissões com recertificação vencida (shared/compliance.js) saem de todas as concessões.
async function concessoesDelegadas(pool, sql, membroId, hoje, expiradas = []) {
  const delegacoes = await delegacoesAtivasRecebidas(pool, sql, membroId, hoje);
  const concessoes = [];
  for (const d of delegacoes) {
    const [escopo, extensao] = await Promise.all([
      resolverEscopoCongregacoes(pool, d.EscopoTipo, d.EscopoId),
      resolverNomeExtensao(pool, d.EscopoTipo, d.EscopoId)
    ]);
    // vale até o fim da delegação OU do mandato do cargo delegado, o que vier primeiro
    const fins = [d.DataFimTexto, d.LiderancaAtivoAteTexto].filter((x) => typeof x === "string" && x);
    concessoes.push({
      origem: "DELEGACAO", delegacaoId: d.DelegacaoId, ate: fins.length ? fins.sort()[0] : null,
      permissoes: [...new Set((d.permissoesStr || "").split(",").map((p) => p.trim()).filter(Boolean))].filter((p) => !expiradas.includes(p)),
      nivel: d.papelNivel || null, escopoCongregacoes: escopo, escopoExtensaoNome: extensao || null,
      departamentoId: d.EscopoTipo === "DEPARTAMENTO" ? d.EscopoId : (d.DepartamentoId || null)
    });
  }
  return {
    concessoes,
    delegacoesAtivas: delegacoes.map((d) => ({ delegacaoId: d.DelegacaoId, deleganteNome: d.deleganteNome, papelNome: d.papelNome, dataFim: d.DataFim }))
  };
}

module.exports = { criarDelegacao, delegacoesAtivasRecebidas, permissoesEscopoDelegados, concessoesDelegadas };
