// shared/delegacoes.js (vB.9 — Acesso: delegação temporária)
// "Vou viajar, o 2º Secretário responde por mim" — hoje a única saída é
// emprestar a própria senha, o que destrói a auditoria (a ação fica
// registrada na pessoa errada, ver shared/auditoria.js). A delegação
// resolve isso ao contrário: o delegado continua logando com A PRÓPRIA
// matrícula/senha — a sessão dele só passa a incluir, além do que já é
// seu, a permissão+escopo do papel delegado, por um prazo definido. Toda
// ação continua auditada com o `usuarioId` real de quem clicou — nunca
// precisa emprestar identidade nenhuma.
const { resolverEscopoCongregacoes } = require("./escopo");

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
    SELECT d.DelegacaoId, d.LiderancaId, d.DataFim, d.Motivo, deleg.Nome AS deleganteNome,
           l.EscopoTipo, l.EscopoId, p.Nome AS papelNome, p.Nivel AS papelNivel, p.Permissoes AS permissoesStr
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

module.exports = { criarDelegacao, delegacoesAtivasRecebidas, permissoesEscopoDelegados };
