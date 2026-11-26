// e2e-151-acesso.js — as regras de acesso contra o SQL Server de verdade (ramo v10-acesso-ajustes-2, 24/11/2026). Monta o próprio cenário sobre a base
// cenario-175 (`BASE=cenario-175 bash rodar.sh roteiro e2e-151-acesso.js`). Cobre:
//   1. quem perde o cargo leva junto as delegações: medida cautelar com suspensão, desligamento, mudança de situação (INATIVO e LICENÇA) e diretoria
//      dissolvida pelo decreto do PSC — a delegação fica CANCELADA e a sessão aberta de quem a recebeu (aberta pelo login real) cai na hora;
//   2. o login do delegado só recebe a delegação de quem continua ATIVO no rol;
//   3. a gestão do PSC grava só no escopo da própria psc_gestao (a homologação recebida por delegação serve à leitura);
//   4. a confirmação recente (428) para suspender o acesso e para decretar a reclassificação;
//   5. as datas da medida cautelar (aplicação, conclusão do relatório e prazo) pelo dia de Brasília;
//   6. lixo nos campos das rotas mexidas: nunca 500, nunca texto interno.
process.env.AUTH_SECRET = "segredo-do-roteiro-do-acesso-2-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, API } = L;
const { chamarRota } = require("./lib-afm");
const { hojeBrasilia } = require(path.join(API, "shared/dataBrasilia.js"));

const BASE_ID = 1510000;
const ID = {
  geral: BASE_ID + 1, cli: BASE_ID + 2, gestorPsc: BASE_ID + 3, preparador: BASE_ID + 4, encarregado: BASE_ID + 5,
  tesSuspenso: BASE_ID + 10, delSuspenso: BASE_ID + 11,
  tesDesligado: BASE_ID + 12, delDesligado: BASE_ID + 13,
  tesInativado: BASE_ID + 14, delInativado: BASE_ID + 15,
  tesLicenca: BASE_ID + 16, delLicenca: BASE_ID + 17,
  tesJaInativo: BASE_ID + 18, delJaInativo: BASE_ID + 19,
  dirigenteVila: BASE_ID + 20, delVila: BASE_ID + 21,
  avulso: BASE_ID + 30
};
const SENHA = "Senha-Do-Roteiro-2#2026";
let ipSeq = 1;
const novoIp = () => `177.151.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
const cab = () => ({ "x-forwarded-for": `${novoIp()}:5000, 40.70.146.136:6000`, "user-agent": "roteiro-e2e" });
const login = (matricula) => chamarRota("LoginSecretaria/index.js", { metodo: "POST", corpo: { matricula, senha: SENHA }, headers: cab() });
const diaAntes = (iso, n = 1) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) - n)).toISOString().slice(0, 10);
const textoInterno = (b) => /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(b || {}));
// sessão do nível geral SEM confirmação recente (entrou só com a senha)
const geralSemFator = (membroId, permissoes) => L.sessao(membroId, { via: "SENHA", fator: { via: "NENHUM", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes });

const DataReal = Date;
function porRelogio(iso) {
  const alvo = DataReal.parse(iso), inicio = DataReal.now();
  class DataDoRoteiro extends DataReal {
    constructor(...a) { if (a.length === 0) super(alvo + (DataReal.now() - inicio)); else super(...a); }
    static now() { return alvo + (DataReal.now() - inicio); }
  }
  global.Date = DataDoRoteiro;
}
const soltarRelogio = () => { global.Date = DataReal; };

async function principal() {
  await obterPool();

  console.log("== o cenário: três congregações, papéis, lideranças e delegações do roteiro ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Acesso E2E151'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const congregacao = async (nome) => (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  const sede = await congregacao("Sede Acesso E2E151");
  const betel = await congregacao("Betel Acesso E2E151");
  const vila = await congregacao("Vila Acesso E2E151");
  const nomeDe = { [sede]: "Sede Acesso E2E151", [betel]: "Betel Acesso E2E151", [vila]: "Vila Acesso E2E151" };
  const pessoa = (id, nome, c = sede) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento)
    VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1984-03-12')`, { id, n: nome, c });
  for (const [chave, id] of Object.entries(ID)) await pessoa(id, `Pessoa ${chave} E2E151`, chave === "dirigenteVila" ? vila : sede);
  const papel = async (nome, nivel, perms) => (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (@n, @v, @p); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, v: nivel, p: perms }))[0].id;
  const pGeral = await papel("Geral E2E151", "GLOBAL", "pessoas,permissoes");
  const pCli = await papel("CLI E2E151", "GLOBAL", "psc_homologacao");
  const pPsc = await papel("Gestor PSC E2E151", "CONGREGACAO", "psc_gestao");
  const pTes = await papel("Tesoureiro E2E151", "CONGREGACAO", "financeiro");
  const pAux = await papel("Auxiliar E2E151", "CONGREGACAO", "pessoas");
  const hash = L.auth.hashSenha(SENHA);
  const lideranca = async (m, p, t, e) => (await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) OUTPUT INSERTED.LiderancaId AS id VALUES (@m, @p, @t, @e, @h)", { m, p, t, e, h: hash }))[0].id;
  const LID = {};
  LID.geral = await lideranca(ID.geral, pGeral, "GLOBAL", null);
  LID.cli = await lideranca(ID.cli, pCli, "GLOBAL", null);
  LID.gestorPsc = await lideranca(ID.gestorPsc, pPsc, "CONGREGACAO", sede);
  for (const k of ["tesSuspenso", "tesDesligado", "tesInativado", "tesLicenca", "tesJaInativo"]) LID[k] = await lideranca(ID[k], pTes, "CONGREGACAO", sede);
  LID.dirigenteVila = await lideranca(ID.dirigenteVila, pTes, "CONGREGACAO", vila);
  for (const k of ["delSuspenso", "delDesligado", "delInativado", "delLicenca", "delJaInativo", "delVila"]) LID[k] = await lideranca(ID[k], pAux, "CONGREGACAO", sede);
  const { TERMOS } = require(path.join(API, "shared/termos.js"));
  for (const m of Object.values(ID)) {
    for (const [tipo, t] of Object.entries(TERMOS)) await q("INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@m, @t, @v)", { m, t: tipo, v: t.versao });
  }
  const delegar = async (deLiderancaDe, para) => (await q(`INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo)
    OUTPUT INSERTED.DelegacaoId AS id VALUES (@l, @de, @para, '2026-01-01', '2099-12-31', N'Viagem (roteiro)')`, { l: LID[deLiderancaDe], de: ID[deLiderancaDe], para }))[0].id;
  const DEL = {
    suspenso: await delegar("tesSuspenso", ID.delSuspenso), desligado: await delegar("tesDesligado", ID.delDesligado),
    inativado: await delegar("tesInativado", ID.delInativado), licenca: await delegar("tesLicenca", ID.delLicenca),
    jaInativo: await delegar("tesJaInativo", ID.delJaInativo), vila: await delegar("dirigenteVila", ID.delVila),
    cli: await delegar("cli", ID.gestorPsc)
  };
  ok((await escalar("SELECT COUNT(*) FROM DelegacoesAcesso WHERE DelegacaoId IN (" + Object.values(DEL).join(",") + ") AND Status = 'ATIVA'")) === 7, "7 delegações ativas do roteiro");

  const statusDelegacao = (id) => escalar("SELECT Status FROM DelegacoesAcesso WHERE DelegacaoId = @id", { id });
  const delegadas = (token) => {
    const s = L.auth.getSessao(token);
    return s && Array.isArray(s.concessoes) ? s.concessoes.filter((c) => c.origem === "DELEGACAO") : [];
  };
  // O delegado entra pelo login real (a sessão fica em SessoesAtivas e pode ser encerrada) e a delegação vem como concessão.
  async function entrarComDelegacao(chave, rotulo) {
    const r = await login(ID[chave]);
    const token = r.body && r.body.token;
    ok(r.body && r.body.sucesso === true && typeof token === "string", `${rotulo}: o delegado entra pelo login real`, JSON.stringify(r.body).slice(0, 160));
    const concedidas = delegadas(token);
    ok(concedidas.length === 1 && concedidas[0].permissoes.includes("financeiro"), `${rotulo}: a sessão dele carrega o cargo delegado`, JSON.stringify(concedidas));
    return token;
  }
  async function conferirQueda(token, chaveDelegado, delegacaoId, rotulo) {
    ok(L.auth.getSessao(token) === null, `${rotulo}: a sessão aberta de quem recebeu a delegação caiu na hora`);
    ok((await escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE MembroId = @m AND Encerrada = 0", { m: ID[chaveDelegado] })) === 0, `${rotulo}: nenhuma sessão dele aberta no banco`);
    ok((await statusDelegacao(delegacaoId)) === "CANCELADA", `${rotulo}: a delegação ficou CANCELADA`);
    const deNovo = await login(ID[chaveDelegado]);
    ok(deNovo.body && deNovo.body.sucesso === true && delegadas(deNovo.body.token).length === 0, `${rotulo}: no login seguinte ele entra só com o cargo dele`, JSON.stringify(deNovo.body).slice(0, 120));
  }

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 1. medida cautelar com suspensão do acesso ==");
  const tkSuspenso = await entrarComDelegacao("delSuspenso", "medida");
  const corpoMedida = { membroId: ID.tesSuspenso, motivo: "Conferência do caixa (roteiro)", suspenderAcessoSistema: true };
  const semFator = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: geralSemFator(ID.geral, ["pessoas", "permissoes"]), corpo: corpoMedida });
  ok(semFator.status === 428 && semFator.body && semFator.body.precisaFator === true, "sem confirmação recente: 428", `${semFator.status} ${JSON.stringify(semFator.body).slice(0, 120)}`);
  ok((await escalar("SELECT COUNT(*) FROM MedidasCautelares WHERE MembroId = @m", { m: ID.tesSuspenso })) === 0, "e nada foi gravado (nenhuma medida)");
  ok((await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId = @m AND AtivoAte IS NULL", { m: ID.tesSuspenso })) === 1, "e o cargo dele continua como estava");
  ok(L.auth.getSessao(tkSuspenso) !== null && (await statusDelegacao(DEL.suspenso)) === "ATIVA", "e a delegação e a sessão do delegado continuam");
  const medida = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: L.GERAL(ID.geral, ["pessoas", "permissoes"]), corpo: corpoMedida });
  ok(medida.status === 201, "com confirmação recente: a medida é aplicada", `${medida.status} ${JSON.stringify(medida.body).slice(0, 160)}`);
  await conferirQueda(tkSuspenso, "delSuspenso", DEL.suspenso, "medida");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2. desligamento (saída do rol) ==");
  const tkDesligado = await entrarComDelegacao("delDesligado", "desligamento");
  const deslig = await chamarRota("GestaoPessoas/index.js", { metodo: "DELETE", binding: { membroId: String(ID.tesDesligado) }, token: L.GERAL(ID.geral, ["pessoas"]) });
  ok(deslig.status === 200 && deslig.body && deslig.body.sucesso === true, "a Secretaria desliga o tesoureiro", `${deslig.status} ${JSON.stringify(deslig.body).slice(0, 160)}`);
  await conferirQueda(tkDesligado, "delDesligado", DEL.desligado, "desligamento");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 3. mudança de situação na ficha (INATIVO e LICENÇA) ==");
  for (const [tes, del, delegacao, status] of [["tesInativado", "delInativado", DEL.inativado, "INATIVO"], ["tesLicenca", "delLicenca", DEL.licenca, "LICENÇA"]]) {
    const tk = await entrarComDelegacao(del, status);
    const r = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: L.GERAL(ID.geral, ["pessoas"]), corpo: { membroId: ID[tes], nome: `Pessoa ${tes} E2E151`, congregacaoId: sede, status } });
    ok(r.status === 200 && r.body && r.body.sucesso === true, `${status}: a ficha é salva com a situação nova`, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    ok((await escalar("SELECT Status FROM MembroReferencia WHERE MembroId = @m", { m: ID[tes] })) === status, `${status}: a situação gravada`);
    await conferirQueda(tk, del, delegacao, status);
  }

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4. a delegação de quem já está fora de ATIVO não entra no login do delegado ==");
  await q("UPDATE MembroReferencia SET Status = 'INATIVO' WHERE MembroId = @m", { m: ID.tesJaInativo });
  ok((await statusDelegacao(DEL.jaInativo)) === "ATIVA", "a delegação continua ATIVA na tabela (a situação mudou por fora)");
  const jaInativo = await login(ID.delJaInativo);
  ok(jaInativo.body && jaInativo.body.sucesso === true, "o delegado entra com o cargo dele");
  ok(delegadas(jaInativo.body && jaInativo.body.token).length === 0, "sem a concessão delegada por quem não está ATIVO", JSON.stringify(delegadas(jaInativo.body && jaInativo.body.token)));
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @m", { m: ID.tesJaInativo });
  const deVolta = await login(ID.delJaInativo);
  ok(delegadas(deVolta.body && deVolta.body.token).length === 1, "quem delegou de volta a ATIVO: a delegação volta a valer");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5. o decreto do PSC: a diretoria dissolvida e quem recebeu delegação dela ==");
  const gatilho = (await q(`INSERT INTO PscAvaliacoes (CongregacaoId, Ano, Status, Ciclo, Versao) OUTPUT INSERTED.AvaliacaoId AS id VALUES (@c, 2025, 'HOMOLOGADA', 1, 1)`, { c: vila }))[0].id;
  const reclass = (await q(`INSERT INTO PscReclassificacoes (CongregacaoId, ExerciciosConsecutivos, AnoInicial, AnoFinal, AvaliacaoGatilhoId)
    OUTPUT INSERTED.ReclassificacaoId AS id VALUES (@c, 2, 2024, 2025, @g)`, { c: vila, g: gatilho }))[0].id;
  const tkVila = await entrarComDelegacao("delVila", "decreto");
  const corpoDecreto = { reclassificacaoId: reclass, resolucao: "Res. CLI 1/2026 (roteiro)", encarregadoMembroId: ID.encarregado };
  const decSemFator = await chamarRota("GestaoPsc/index.js", { metodo: "POST", binding: { acao: "reclassificacoes/decretar" }, token: geralSemFator(ID.cli, ["psc_homologacao"]), corpo: corpoDecreto });
  ok(decSemFator.status === 428 && decSemFator.body && decSemFator.body.precisaFator === true, "decretar sem confirmação recente: 428", `${decSemFator.status} ${JSON.stringify(decSemFator.body).slice(0, 120)}`);
  ok((await escalar("SELECT Status FROM PscReclassificacoes WHERE ReclassificacaoId = @id", { id: reclass })) === "PROPOSTA", "e a proposta continua PROPOSTA");
  ok((await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId = @m AND AtivoAte IS NULL", { m: ID.dirigenteVila })) === 1, "e o mandato do dirigente continua");
  const decreto = await chamarRota("GestaoPsc/index.js", { metodo: "POST", binding: { acao: "reclassificacoes/decretar" }, token: L.GERAL(ID.cli, ["psc_homologacao"]), corpo: corpoDecreto });
  ok(decreto.status === 200 && decreto.body && decreto.body.sucesso === true, "com confirmação recente: o decreto vale", `${decreto.status} ${JSON.stringify(decreto.body).slice(0, 200)}`);
  ok((await escalar("SELECT Status FROM PscReclassificacoes WHERE ReclassificacaoId = @id", { id: reclass })) === "DECRETADA", "a reclassificação ficou DECRETADA");
  await conferirQueda(tkVila, "delVila", DEL.vila, "decreto");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 6. a gestão do PSC grava só no escopo da própria psc_gestao ==");
  const avaliacao = async (c) => (await q(`INSERT INTO PscAvaliacoes (CongregacaoId, Ano, Status, EnviadaPorMembroId, EnviadaEm, Ciclo, Versao)
    OUTPUT INSERTED.AvaliacaoId AS id VALUES (@c, 2026, 'ENVIADA', @p, SYSUTCDATETIME(), 1, 1)`, { c, p: ID.preparador }))[0].id;
  const avSede = await avaliacao(sede), avBetel = await avaliacao(betel);
  const lGestor = await login(ID.gestorPsc);
  const tkGestor = lGestor.body && lGestor.body.token;
  const conc = (L.auth.getSessao(tkGestor) || {}).concessoes || [];
  ok(conc.length === 2 && conc.some((c) => c.origem === "PROPRIA" && c.permissoes.includes("psc_gestao")) && conc.some((c) => c.origem === "DELEGACAO" && c.permissoes.includes("psc_homologacao") && c.escopoCongregacoes === "TODAS"),
    "o gestor local entra com a gestão dele e a homologação recebida por delegação", JSON.stringify(conc).slice(0, 240));
  const psc = (acao, corpo, token = tkGestor) => chamarRota("GestaoPsc/index.js", { metodo: "POST", binding: { acao }, token, corpo });
  const statusAv = (id) => escalar("SELECT Status FROM PscAvaliacoes WHERE AvaliacaoId = @id", { id });
  const versaoAv = (id) => escalar("SELECT CONCAT(Status, '/', Versao, '/', ISNULL(ValidadaPorMembroId, 0), '/', ISNULL(DevolvidaPorMembroId, 0)) FROM PscAvaliacoes WHERE AvaliacaoId = @id", { id });
  const antesBetel = await versaoAv(avBetel);
  for (const acao of ["avaliacoes/sugestoes", "avaliacoes/responder", "avaliacoes/enviar", "avaliacoes/validar", "avaliacoes/devolver"]) {
    const r = await psc(acao, { avaliacaoId: avBetel, parecer: "Conferido (roteiro)", motivo: "Faltam evidências nas alíneas (roteiro)", respostas: [{ respostaId: 1, situacao: "ATENDIDO" }] });
    ok(r.status === 403, `${acao} na avaliação de outra congregação: 403`, `${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  }
  ok((await versaoAv(avBetel)) === antesBetel, "a avaliação de outra congregação não mudou", `${antesBetel} -> ${await versaoAv(avBetel)}`);
  const leitura = await chamarRota("GestaoPsc/index.js", { metodo: "GET", binding: { acao: "avaliacao" }, token: tkGestor, query: { avaliacaoId: avBetel } });
  ok(leitura.status === 200, "a leitura dela continua (a homologação recebida lê a igreja inteira)", `${leitura.status}`);
  const naSede = await psc("avaliacoes/validar", { avaliacaoId: avSede, parecer: "Conferido (roteiro)" });
  ok(naSede.status === 200 && naSede.body && naSede.body.sucesso === true && (await statusAv(avSede)) === "VALIDADA", "na congregação dele, a validação vale", `${naSede.status} ${JSON.stringify(naSede.body).slice(0, 140)}`);
  const alheio = await psc("avaliacoes/validar", { avaliacaoId: avBetel, parecer: "x" }, L.LIDER(ID.avulso, ["psc_gestao"], ["Sede Acesso E2E151"]));
  const inexistente = await psc("avaliacoes/validar", { avaliacaoId: 2147480000, parecer: "x" }, L.LIDER(ID.avulso, ["psc_gestao"], ["Sede Acesso E2E151"]));
  ok(alheio.status === 404 && JSON.stringify(alheio.body) === JSON.stringify(inexistente.body), "quem não enxerga a avaliação recebe a mesma 404 de id que não existe");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 7. as datas da medida pelo dia de Brasília ==");
  const diaUtcDoBanco = await escalar("SELECT CONVERT(varchar(10), CAST(SYSUTCDATETIME() AS DATE), 120)");
  porRelogio(`${diaUtcDoBanco}T00:30:00Z`);
  try {
    const hoje = hojeBrasilia();
    ok(hoje === diaAntes(diaUtcDoBanco), `o dia de Brasília (${hoje}) é a véspera do dia UTC do banco (${diaUtcDoBanco})`);
    const tk = L.GERAL(ID.geral, ["pessoas", "permissoes"]);
    const m = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: tk, corpo: { membroId: ID.avulso, motivo: "Chaves do templo (roteiro)", suspenderAcessoSistema: false, suspensaoChavesFisicas: true } });
    ok(m.status === 201, "a medida sem suspensão do acesso é aplicada", `${m.status} ${JSON.stringify(m.body).slice(0, 120)}`);
    const medidaId = m.body && m.body.medida && m.body.medida.medidaId;
    ok((await escalar("SELECT CONVERT(varchar(10), DataAplicacao, 120) FROM MedidasCautelares WHERE MedidaId = @id", { id: medidaId })) === hoje, `a data da medida é o dia de Brasília (${hoje})`);
    const concl = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: tk, binding: { id: String(medidaId), acao: "concluir-relatorio" } });
    ok(concl.status === 200 && concl.body && concl.body.sucesso === true, "o relatório é concluído");
    ok((await escalar("SELECT CONVERT(varchar(10), DataConclusaoRelatorio, 120) FROM MedidasCautelares WHERE MedidaId = @id", { id: medidaId })) === hoje, `a conclusão do relatório é o dia de Brasília (${hoje})`);
    const antiga = (await q(`INSERT INTO MedidasCautelares (MembroId, Motivo, SuspenderAcessoSistema, SuspensaoContasBancarias, SuspensaoChavesFisicas, AplicadoPor, DataAplicacao)
      OUTPUT INSERTED.MedidaId AS id VALUES (@m, N'Medida de 30 dias (roteiro)', 0, 1, 0, @por, @d)`, { m: ID.preparador, por: ID.geral, d: diaAntes(hoje, 30) }))[0].id;
    const lista = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "GET", token: tk });
    const linha = Array.isArray(lista.body) ? lista.body.find((x) => x.medidaId === antiga) : null;
    ok(linha && linha.diasDesdeAplicacao === 30 && linha.prazoRelatorioVencido === false, "no 30º dia, à noite, o prazo do relatório ainda não venceu", JSON.stringify(linha));
  } finally {
    soltarRelogio();
  }

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 8. lixo nos campos ==");
  const quebras = [];
  for (const lixo of L.LIXO) {
    for (const acao of ["avaliacoes/validar", "avaliacoes/devolver", "avaliacoes/responder"]) {
      const r = await psc(acao, { avaliacaoId: lixo, parecer: lixo, motivo: lixo, respostas: lixo }, L.GERAL(ID.geral, ["psc_gestao"]));
      if (r.status >= 500 || textoInterno(r.body)) quebras.push(`${acao} ${JSON.stringify(lixo).slice(0, 40)} -> ${r.status}`);
    }
    const d = await chamarRota("GestaoPsc/index.js", { metodo: "POST", binding: { acao: "reclassificacoes/decretar" }, token: L.GERAL(ID.cli, ["psc_homologacao"]), corpo: { reclassificacaoId: lixo, resolucao: lixo, encarregadoMembroId: lixo } });
    if (d.status >= 500 || textoInterno(d.body)) quebras.push(`decretar ${JSON.stringify(lixo).slice(0, 40)} -> ${d.status}`);
    const mc = await chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token: geralSemFator(ID.geral, ["pessoas", "permissoes"]), corpo: { membroId: lixo, motivo: lixo, suspenderAcessoSistema: lixo } });
    if (mc.status >= 500 || textoInterno(mc.body)) quebras.push(`medida ${JSON.stringify(lixo).slice(0, 40)} -> ${mc.status}`);
  }
  ok(quebras.length === 0, `lixo em cada campo (${L.LIXO.length} valores): nunca 500, nunca texto interno`, quebras.slice(0, 5).join(" | "));
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE RegistroId IS NULL AND DataHora >= DATEADD(MINUTE, -30, SYSUTCDATETIME())")) === 0, "a trilha nunca grava RegistroId nulo");
}

principal().then(() => fim("e2e-151 (acesso, parte 2)")).catch((e) => { console.error(e); ok(false, "o roteiro quebrou: " + (e && e.message)); fim("e2e-151 (acesso, parte 2)"); });
