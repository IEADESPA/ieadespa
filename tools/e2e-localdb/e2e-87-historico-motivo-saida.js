// e2e-87-historico-motivo-saida.js — o histórico antigo (GET /api/pessoas/{id}/historico) mostrava o MOTIVO de uma saída por exclusão ou abandono a quem não
// tem a permissão "disciplina" (achado da construção da linha do tempo nova, 14/11/2026; correção aprovada pelo responsável em 17/11/2026). Agora a saída
// disciplinar aparece sem o motivo para quem não tem "disciplina" com a pessoa no escopo; as outras causas seguem à vista. Desde 18/11/2026 também a LISTA de pessoas
// (GET /api/pessoas, inteira e em páginas) e a resposta do salvar; e salvar a ficha sem "disciplina" não apaga nem troca o motivo disciplinar que não se vê. Roda sobre a base cenario-173
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

  // 18/11/2026 (autorizado pelo responsável): a LISTA de pessoas (GET /api/pessoas, inteira e em páginas) também levava o motivo no JSON a quem tinha só "pessoas"
  console.log("== a lista de pessoas: sem \"disciplina\", o motivo disciplinar não vai no JSON; com ela, vai ==");
  const lista = async (tk, query) => {
    const r = await chamarRota("GestaoPessoas/index.js", { metodo: "GET", token: tk, query: query || {} });
    const corpo = r && r.body;
    return Array.isArray(corpo) ? corpo : (corpo && corpo.itens) || [];
  };
  for (const [rotulo, query] of [["a lista inteira", {}], ["a lista em páginas", { pagina: "1", porPagina: "100", busca: "E2E87" }]]) {
    const semDisc = (await lista(so, query)).filter((p) => p.membroId >= 870001 && p.membroId <= 870004);
    ok(semDisc.length === 4, `${rotulo}: as quatro pessoas aparecem`, semDisc.length);
    for (const [id, motivo] of pessoas) {
      const p = semDisc.find((x) => x.membroId === id);
      const disciplinar = motivo === "EXCLUSAO" || motivo === "ABANDONO_DIGITAL";
      ok(p && (disciplinar ? p.motivoSaida === null : p.motivoSaida === motivo), `${rotulo}, ${motivo}: ${disciplinar ? "sem o motivo" : "com o motivo"} (sem "disciplina")`, p && p.motivoSaida);
      if (disciplinar) ok(p && !JSON.stringify(p).includes(motivo), `${rotulo}, ${motivo}: o código não aparece em lugar nenhum da pessoa`);
      if (disciplinar) ok(p && p.dataSaida === "2026-03-01", `${rotulo}, ${motivo}: a data da saída continua`, p && p.dataSaida);
    }
    const comD = (await lista(comDisc, query)).filter((p) => p.membroId >= 870001 && p.membroId <= 870004);
    ok(comD.find((x) => x.membroId === 870001).motivoSaida === "EXCLUSAO" && comD.find((x) => x.membroId === 870002).motivoSaida === "ABANDONO_DIGITAL",
      `${rotulo}: com "disciplina" no escopo, o motivo vai`);
    const fora = (await lista(discFora, query)).filter((p) => p.membroId === 870001)[0];
    ok(fora && fora.motivoSaida === null, `${rotulo}: "disciplina" só em outra congregação não basta`, fora && fora.motivoSaida);
  }

  console.log("== salvar a ficha sem \"disciplina\" (o cadastro completo) não apaga nem troca o motivo disciplinar que quem salva não vê ==");
  const salvar = (tk, corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: tk, corpo });
  const base = { membroId: 870001, nome: "Pessoa 1 E2E87", congregacaoId: cong, status: "DESLIGADO", situacaoMembro: "SEM_COMUNHAO", dataNascimento: "1990-01-01",
    dataAdmissao: "2015-04-12", formaAdmissao: "BATISMO", dataSaida: "2026-03-01" };
  const r1 = await salvar(so, { ...base, motivoSaida: null });
  ok(r1.body && r1.body.sucesso, "salvou a ficha (sem \"disciplina\", com o motivo vazio como a tela mostra)", r1.body && r1.body.mensagem);
  ok(r1.body && r1.body.membro && r1.body.membro.motivoSaida === null, "a resposta do salvar também não leva o motivo", r1.body && r1.body.membro && r1.body.membro.motivoSaida);
  ok((await q("SELECT MotivoSaida FROM MembroReferencia WHERE MembroId = 870001"))[0].MotivoSaida === "EXCLUSAO", "o motivo disciplinar continua gravado (não foi apagado)");
  await salvar(so, { ...base, motivoSaida: "DESLIGAMENTO" });
  ok((await q("SELECT MotivoSaida FROM MembroReferencia WHERE MembroId = 870001"))[0].MotivoSaida === "EXCLUSAO", "nem trocado por outra causa por quem não vê");
  const r2 = await salvar(comDisc, { ...base, motivoSaida: "EXCLUSAO" });
  ok(r2.body && r2.body.sucesso && r2.body.membro.motivoSaida === "EXCLUSAO", "com \"disciplina\": salva e a resposta leva o motivo", r2.body && r2.body.mensagem);
  await salvar(so, { membroId: 870003, nome: "Pessoa 3 E2E87", congregacaoId: cong, status: "DESLIGADO", situacaoMembro: "SEM_COMUNHAO", dataNascimento: "1990-01-01",
    dataAdmissao: "2015-04-12", formaAdmissao: "BATISMO", dataSaida: "2026-03-01", motivoSaida: "DESLIGAMENTO" });
  ok((await q("SELECT MotivoSaida FROM MembroReferencia WHERE MembroId = 870003"))[0].MotivoSaida === "DESLIGAMENTO", "a causa NÃO disciplinar continua mudando como antes");

  await q("DELETE FROM MembroReferencia WHERE MembroId BETWEEN 870001 AND 870004");
  fim("e2e-87 (histórico: o motivo da saída disciplinar)");
  L.shimEncerrar();
}

principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
