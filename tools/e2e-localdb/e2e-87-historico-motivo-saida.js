// e2e-87-historico-motivo-saida.js — o histórico antigo (GET /api/pessoas/{id}/historico) mostrava o MOTIVO de uma saída por exclusão ou abandono a quem não
// tem a permissão "disciplina" (achado da construção da linha do tempo nova, 14/11/2026; correção aprovada pelo responsável em 17/11/2026). Agora a saída
// disciplinar aparece sem o motivo para quem não tem "disciplina" com a pessoa no escopo; as outras causas seguem à vista. Roda sobre a base cenario-173
// (`BASE=cenario-173 bash rodar.sh roteiro e2e-87-historico-motivo-saida.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-do-historico-motivo-saida-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, obterPool } = L;

const fator = () => ({ via: "CHAVE", em: Date.now() });
const token = (permissoes, escopo = "TODAS", extra = {}) => L.sessao(9101, { via: "SENHA", fator: fator(), nivel: escopo === "TODAS" ? "GLOBAL" : "CONGREGACAO", escopoCongregacoes: escopo, permissoes, ...extra });

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const historico = (tk, id) => chamarRota("HistoricoMembro/index.js", { metodo: "GET", token: tk, binding: { membroId: String(id) } });
  const saidaDe = (r) => {
    const corpo = r && r.body;
    const eventos = Array.isArray(corpo) ? corpo : (corpo && (corpo.eventos || corpo.itens)) || [];
    return eventos.find((e) => e.tipo === "SAIDA");
  };

  console.log("== o cenário: uma congregação e quatro pessoas que saíram (exclusão, abandono digital, carta de mudança, falecimento) ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Histórico E2E87'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Histórico A E2E87', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const outra = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Histórico B E2E87', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const pessoas = [[870001, "EXCLUSAO"], [870002, "ABANDONO_DIGITAL"], [870003, "CARTA_MUDANCA"], [870004, "FALECIMENTO"]];
  for (const [id, motivo] of pessoas) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, FormaAdmissao, DataSaida, MotivoSaida)
             VALUES (@id, @n, @c, @st, 'SEM_COMUNHAO', '1990-01-01', '2015-04-12', 'BATISMO', '2026-03-01', @m)`,
      { id, n: `Pessoa ${id - 870000} E2E87`, c: cong, st: motivo === "FALECIMENTO" ? "FALECIDO" : "DESLIGADO", m: motivo });
  }
  const sufixo = (await q("SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c", { c: cong }))[0].Nome;
  const nomeOutra = (await q("SELECT Nome FROM Congregacoes WHERE CongregacaoId = @c", { c: outra }))[0].Nome;

  console.log("== sem a permissão \"disciplina\": a saída disciplinar sem o motivo; as outras com o motivo ==");
  const so = token(["pessoas"]);
  for (const [id, motivo] of pessoas) {
    const r = await historico(so, id);
    const s = saidaDe(r);
    const disciplinar = motivo === "EXCLUSAO" || motivo === "ABANDONO_DIGITAL";
    ok(!!s, `${motivo}: a saída aparece no histórico`, JSON.stringify(r && r.body).slice(0, 200));
    if (disciplinar) {
      ok(s && s.descricao === null, `${motivo}: sem "disciplina", o motivo NÃO aparece`, s && s.descricao);
      ok(!JSON.stringify(r.body).includes(motivo), `${motivo}: o código do motivo não aparece em lugar nenhum da resposta`);
    } else {
      ok(s && s.descricao === motivo, `${motivo} (não disciplinar): o motivo continua à vista`, s && s.descricao);
    }
  }

  console.log("== com \"disciplina\" no escopo da pessoa: o motivo aparece ==");
  const comDisc = token(["pessoas", "disciplina"]);
  for (const [id, motivo] of pessoas.slice(0, 2)) {
    const s = saidaDe(await historico(comDisc, id));
    ok(s && s.descricao === motivo, `${motivo}: com "disciplina", o motivo aparece`, s && s.descricao);
  }

  console.log("== \"disciplina\" só em OUTRA congregação não basta ==");
  const discFora = token(["pessoas", "disciplina"], "TODAS", {
    concessoes: [{ tipo: "PROPRIA", permissoes: ["pessoas"], nivel: "GLOBAL", escopoCongregacoes: "TODAS" }, { tipo: "DELEGACAO", permissoes: ["disciplina"], nivel: "CONGREGACAO", escopoCongregacoes: [nomeOutra] }]
  });
  const sFora = saidaDe(await historico(discFora, 870001));
  ok(sFora && sFora.descricao === null, "\"disciplina\" delegada só em outra congregação: o motivo da exclusão NÃO aparece", sFora && sFora.descricao);
  ok(!!sufixo, "a congregação do cenário existe");

  await q("DELETE FROM MembroReferencia WHERE MembroId BETWEEN 870001 AND 870004");
  fim("e2e-87 (histórico: o motivo da saída disciplinar)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
