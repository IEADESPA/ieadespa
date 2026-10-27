// lib-afm.js — v8.1 (AFM e faltas da CLI): o cenário e os ajudantes dos roteiros e2e-47 a e2e-49, sobre a base "cenario-afm" (`bash rodar.sh preparar-afm`).
const L = require("./lib");
const { q, escalar, API, path, auth } = L;

// Pessoas do cenário (MembroReferencia.MembroId não é IDENTITY). O nome conta a história de cada uma nos roteiros.
const P = {
  presente: 9101,        // Pastor, sempre presente (controle)
  faltoso: 9102,         // Presbítero: 3 faltas seguidas na CLI → exclusão (só por Ordenação); a justificativa depois anula
  tesoureiro: 9103,      // Evangelista e 1º Tesoureiro: 2 faltas, a 2ª justificada pelo pedido dele → nunca chega a 3
  diacono: 9104,         // Diácono (só AFM): 3 Sessões Magnas sem justificativa → desmatrícula; oficiante recusado; rematrícula
  auxiliar: 9105,        // Auxiliar (só AFM): presente
  fiscal: 9106,          // não é oficial; Conselheiro Fiscal (entra na CLI por Função): 3 faltas → exclusão com AGE; comunicação e readmissão
  dupla: 9107,           // Presbítero: 3 Sessões Magnas sem justificativa → falta dupla (exclusão da CLI E desmatrícula); uma justificativa desfaz as duas
  reprovado: 9108,       // Pastor: reprovação técnica → inativo → sai da CLI por Ordenação; anulada, volta
  reitor: 9109,          // Pastor: nomeado Reitor
  mestre: 9110,          // Presbítero: mestre da CDER
  foraCLI: 9111,         // Diácono: não compõe a CLI (a CDER recusa)
  cei: 9112              // membro do CEI (Função): 3 faltas → exclusão sem AGE
};
const CARGOS = {
  [P.presente]: "PASTOR", [P.faltoso]: "PRESBITERO", [P.tesoureiro]: "EVANGELISTA", [P.diacono]: "DIACONO", [P.auxiliar]: "AUXILIAR", [P.fiscal]: null,
  [P.dupla]: "PRESBITERO", [P.reprovado]: "PASTOR", [P.reitor]: "PASTOR", [P.mestre]: "PRESBITERO", [P.foraCLI]: "DIACONO", [P.cei]: null
};
const NOMES = {
  [P.presente]: "Pastor Presente E2E", [P.faltoso]: "Presbitero Faltoso E2E", [P.tesoureiro]: "Evangelista Tesoureiro E2E", [P.diacono]: "Diacono Magna E2E",
  [P.auxiliar]: "Auxiliar Presente E2E", [P.fiscal]: "Conselheiro Fiscal E2E", [P.dupla]: "Presbitero Falta Dupla E2E", [P.reprovado]: "Pastor Reprovado E2E",
  [P.reitor]: "Pastor Reitor E2E", [P.mestre]: "Presbitero Mestre E2E", [P.foraCLI]: "Diacono Fora da CLI E2E", [P.cei]: "Conselheiro de Etica E2E"
};

async function montarCenario() {
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  for (const [id, nome] of Object.entries(NOMES)) {
    await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @id)
             INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Email, CargoMinisterial)
             VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1970-01-01', @e, @cg)`,
      { id: Number(id), n: nome, c: c1, e: `afm${id}@e2e.local`, cg: CARGOS[id] || "" });
    if (!CARGOS[id]) await q("UPDATE MembroReferencia SET CargoMinisterial = NULL WHERE MembroId = @id", { id: Number(id) });
  }
  const orgao = async (sigla) => escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = @s", { s: sigla });
  const assento = async (m, sigla, cargo) => q(`IF NOT EXISTS (SELECT 1 FROM Assentos WHERE MembroId = @m AND OrgaoId = @o AND DataFim IS NULL)
      INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', @c, '2026-01-01')`, { m, o: await orgao(sigla), c: cargo });
  await assento(P.tesoureiro, "DIRETORIA_EXECUTIVA", "1º Tesoureiro");
  await assento(P.fiscal, "CONSELHO_FISCAL", "Conselheiro Fiscal");
  await assento(P.cei, "CEI", "Conselheiro de Ética");
  // nenhuma reunião aberta herdada da base
  await q("UPDATE Sessoes SET Status = 'ENCERRADA' WHERE Status = 'ABERTA'");
  return { c1, orgaoCLI: await orgao("CLI") };
}

// Chama um handler com bindingData livre (rotas com {sessaoId}, {matricula}, {sigla}...). A query chega em texto, como no HTTP.
async function chamarRota(handlerRel, { binding = {}, metodo = "GET", token, corpo, query = {}, headers = {} } = {}) {
  const h = require(path.join(API, handlerRel));
  const ctx = { bindingData: binding, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) };
  const qs = {}; for (const [k, v] of Object.entries(query)) qs[k] = v == null ? v : String(v);
  const hd = { ...headers }; if (token) hd["x-auth-token"] = token;
  await h(ctx, { method: metodo, query: qs, body: corpo, headers: hd });
  return ctx.res || { status: 0, body: null };
}

module.exports = { P, CARGOS, NOMES, montarCenario, chamarRota };
