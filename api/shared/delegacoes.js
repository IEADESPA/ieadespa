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
// mim". Ativa = Status='ATIVA', dentro da janela de datas, com o cargo delegado vigente E quem delegou ATIVO no rol de membros (a mesma regra do login dele).
// ExpiradasDoTitular: as permissões que a recertificação vencida tirou de quem é dono do cargo (o mesmo critério de compliance.permissoesComRecertificacaoExpirada):
// o login do titular já não as recebe, e a delegação não as passa adiante.
async function delegacoesAtivasRecebidas(pool, sql, membroId, hoje) {
  const result = await pool.request().input("membroId", sql.Int, membroId).input("hoje", sql.Date, hoje).query(`
    SELECT d.DelegacaoId, d.LiderancaId, d.DataFim, CONVERT(varchar(10), d.DataFim, 120) AS DataFimTexto, d.Motivo, deleg.Nome AS deleganteNome,
           l.EscopoTipo, l.EscopoId, l.DepartamentoId, CONVERT(varchar(10), l.AtivoAte, 120) AS LiderancaAtivoAteTexto, p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr,
           (SELECT STRING_AGG(r.Permissao, ',') FROM RecertificacoesAcesso r
            WHERE r.MembroId = l.MembroId AND r.Status = 'EXPIRADA'
              AND r.RecertificacaoId = (SELECT MAX(r2.RecertificacaoId) FROM RecertificacoesAcesso r2 WHERE r2.MembroId = r.MembroId AND r2.Permissao = r.Permissao)) AS ExpiradasDoTitular
    FROM DelegacoesAcesso d
    JOIN Lideranca l ON l.LiderancaId = d.LiderancaId
    JOIN Papeis p ON p.PapelId = l.PapelId
    JOIN MembroReferencia deleg ON deleg.MembroId = d.DeleganteMembroId
    WHERE d.DelegadoMembroId = @membroId AND d.Status = 'ATIVA' AND d.DataInicio <= @hoje AND d.DataFim >= @hoje
      AND (l.AtivoAte IS NULL OR l.AtivoAte >= @hoje)
      AND deleg.Status = 'ATIVO'
  `);
  return result.recordset;
}

// "pessoas, financeiro" -> ["pessoas", "financeiro"]: a lista do papel sem as permissões vencidas do titular do cargo nem as de `expiradas` (as de quem recebe).
function permissoesDaDelegacao(d, expiradas = []) {
  const vencidas = new Set((d.ExpiradasDoTitular || "").split(",").map((p) => p.trim()).filter(Boolean).concat(expiradas || []));
  return [...new Set((d.permissoesStr || "").split(",").map((p) => p.trim()).filter(Boolean))].filter((p) => !vencidas.has(p));
}
// O fim da delegação como o dia (AAAA-MM-DD): o instante da meia-noite UTC aparecia na tela como o dia anterior.
const resumoDaDelegacao = (d) => ({ delegacaoId: d.DelegacaoId, deleganteNome: d.deleganteNome, papelNome: d.papelNome, dataFim: d.DataFimTexto || d.DataFim });

// Quem perde o cargo (medida cautelar, saída do rol, mudança de situação, diretoria dissolvida) leva junto as delegações: ficam CANCELADAS, com a trilha,
// e levantar a medida ou voltar a ATIVO não as revive (quem delegou faz uma nova, se quiser). A sessão de quem recebeu carrega o cargo delegado como uma
// concessão (ver concessoesDelegadas), então as sessões abertas dele caem na hora. `executor`: o pool ou a transação de quem chama.
// Por pessoa (`membroId`): as delegações que ela deu (do cargo dela) e as que recebeu. Por cargo (`liderancaIds`): só as daquelas linhas de Lideranca.
// Devolve as matrículas de quem recebeu (sem a própria pessoa).
async function cancelarDelegacoes(executor, sql, { membroId = null, liderancaIds = null } = {}) {
  const ids = [...new Set((liderancaIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const pessoa = Number(membroId);
  const porPessoa = Number.isInteger(pessoa) && pessoa > 0;
  if (!porPessoa && ids.length === 0) return [];
  const rq = executor.request();
  if (porPessoa) rq.input("membroId", sql.Int, pessoa);
  const r = await rq.query(`
    UPDATE DelegacoesAcesso SET Status = 'CANCELADA'
    OUTPUT INSERTED.DelegadoMembroId
    WHERE Status = 'ATIVA' AND (${porPessoa
      ? "DeleganteMembroId = @membroId OR DelegadoMembroId = @membroId OR LiderancaId IN (SELECT LiderancaId FROM Lideranca WHERE MembroId = @membroId)"
      : `LiderancaId IN (${ids.join(",")})`})`);
  return [...new Set((r.recordset || []).map((l) => Number(l.DelegadoMembroId)))].filter((d) => Number.isInteger(d) && d > 0 && d !== pessoa);
}

async function derrubarSessoesDosDelegados(executor, sql, delegados) {
  const { revogarSessoesDoMembro } = require("./auth");
  let sessoes = 0;
  for (const d of new Set(delegados || [])) sessoes += await revogarSessoesDoMembro(executor, sql, d);
  return sessoes;
}

async function encerrarDelegacoesDaPessoa(executor, sql, membroId) {
  const delegados = await cancelarDelegacoes(executor, sql, { membroId });
  await derrubarSessoesDosDelegados(executor, sql, delegados);
  return delegados;
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
    permissoesExtras = permissoesExtras.concat(permissoesDaDelegacao(d));
    const escopo = await resolverEscopoCongregacoes(pool, d.EscopoTipo, d.EscopoId);
    if (escopo === "TODAS") escopoVirouTodas = true;
    else escopoExtra = escopoExtra.concat(escopo);
  }

  return {
    permissoesExtras: [...new Set(permissoesExtras)],
    escopoExtra: escopoVirouTodas ? "TODAS" : [...new Set(escopoExtra)],
    delegacoesAtivas: delegacoes.map(resumoDaDelegacao)
  };
}

// v7.6 — uma CONCESSÃO por delegação ativa (ver shared/auth.js, "Concessões"): a permissão delegada vale só com o escopo, o nível e o departamento do papel
// delegado, e só até o último dia da delegação (`ate`) — a delegação não amplia mais o escopo das permissões do cargo próprio, nem o contrário.
// `expiradas`: permissões com recertificação vencida de quem recebe (shared/compliance.js) saem de todas as concessões; as vencidas do titular do cargo também.
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
      permissoes: permissoesDaDelegacao(d, expiradas),
      nivel: d.papelNivel || null, escopoCongregacoes: escopo, escopoExtensaoNome: extensao || null,
      departamentoId: d.EscopoTipo === "DEPARTAMENTO" ? d.EscopoId : (d.DepartamentoId || null)
    });
  }
  return {
    concessoes,
    delegacoesAtivas: delegacoes.map(resumoDaDelegacao)
  };
}

module.exports = { criarDelegacao, delegacoesAtivasRecebidas, permissoesEscopoDelegados, concessoesDelegadas, cancelarDelegacoes, derrubarSessoesDosDelegados, encerrarDelegacoesDaPessoa };
