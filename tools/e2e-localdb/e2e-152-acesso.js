// e2e-152-acesso.js — as regras de acesso contra o SQL Server de verdade (ramo v10-acesso-ajustes-3, 25/11/2026). Monta o próprio cenário sobre a base
// cenario-175 (`BASE=cenario-175 bash rodar.sh roteiro e2e-152-acesso.js`). Cobre:
//   1. a matrícula da ficha só como número inteiro (o banco nunca recebe outra forma);
//   2. salvar a ficha de quem já saiu mantém a data de saída; a data da saída pelo dia de Brasília;
//   2b. a situação no rol só do catálogo (gravada com a sigla dele), a licença por candidatura só pela aba dela e as outras datas da ficha conferidas;
//   2c. a saída da licença: o não retorno põe INATIVO; o falecimento pela ficha e o desligamento fecham a licença aberta; a migração 300 (AFASTADO) duas vezes;
//   3. tirar do rol ativo quem tem cargo de liderança: a secretaria do nível do cargo ou de cima, com a confirmação recente, e nunca a última pessoa que
//      administra os acessos;
//   4. a delegação não passa adiante a permissão que a recertificação vencida tirou do titular;
//   4b. os avisos da congregação vão só para quem entra com a permissão (ATIVO, recertificação em dia, cargo vigente pelo dia de Brasília);
//   5. a medida cautelar: só o cargo vigente recebe o fim, o fim anterior vai para a trilha, e uma falha no meio não deixa nada pela metade;
//   5b. a saída do rol (desligar ou a ficha com DESLIGADO): uma falha no meio não deixa nada pela metade e a nova tentativa conclui; o falecido não vira desligado;
//   6. lixo nos campos das rotas mexidas: nunca 500, nunca texto interno.
process.env.AUTH_SECRET = "segredo-do-roteiro-do-acesso-3-" + "x".repeat(24);
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, API } = L;
const { chamarRota } = require("./lib-afm");
const { hojeBrasilia } = require(path.join(API, "shared/dataBrasilia.js"));
const travaPermissoes = require(path.join(API, "shared/travaPermissoes.js"));

const BASE_ID = 1520000;
const ID = {
  geral: BASE_ID + 1, secLocal: BASE_ID + 2, comum: BASE_ID + 3, saiu: BASE_ID + 4,
  lider: BASE_ID + 10, liderInativar: BASE_ID + 11, liderDesligar: BASE_ID + 12,
  adminA: BASE_ID + 20, adminB: BASE_ID + 21,
  titular: BASE_ID + 30, delegado: BASE_ID + 31,
  exTesoureiro: BASE_ID + 40, suspenso: BASE_ID + 41,
  falhaDesligar: BASE_ID + 50, falhaFicha: BASE_ID + 51, falecido: BASE_ID + 52,
  avisoAtivo: BASE_ID + 60, avisoInativo: BASE_ID + 61, avisoRecert: BASE_ID + 62, avisoFim: BASE_ID + 63, avisoNova: BASE_ID + 64, avisoTutelada: BASE_ID + 65,
  liderLocal: BASE_ID + 70, liderArea: BASE_ID + 71, liderGeral: BASE_ID + 72, secArea: BASE_ID + 73, discJulgar: BASE_ID + 80, discHomologar: BASE_ID + 81,
  licArea: BASE_ID + 90, licLocal: BASE_ID + 91, licFalha: BASE_ID + 92,
  fichaSituacao: BASE_ID + 100, fichaLicenca: BASE_ID + 101, fichaDatas: BASE_ID + 102,
  licNaoVolta: BASE_ID + 103, licVolta: BASE_ID + 104, licFalece: BASE_ID + 105, licDesliga: BASE_ID + 106, licEncerrada: BASE_ID + 107
};
const SENHA = "Senha-Do-Roteiro-3#2026";
let ipSeq = 1;
const cab = () => ({ "x-forwarded-for": `177.152.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}:5000, 40.70.146.136:6000`, "user-agent": "roteiro-e2e" });
const textoInterno = (b) => /SELECT |INSERT |UPDATE |ConnectionError|mssql|tedious|at Object|node_modules/i.test(JSON.stringify(b || {}));
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

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área Acesso E2E152'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const sede = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Sede Acesso E2E152', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: area }))[0].id;
  const NOME_SEDE = "Sede Acesso E2E152";
  for (const [chave, id] of Object.entries(ID)) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Sexo)
      VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', '1984-03-12', '2010-05-02', 'M')`, { id, n: `Pessoa ${chave} E2E152`, c: sede });
  }
  // a migração 300 (AFASTADO no catálogo das situações no rol, resposta do responsável de 25/11/2026), duas vezes como em dois deploys: a base cenario-175 vem sem ela
  const fs = require("fs");
  const PASTA_MIG = path.join(API, "..", "sql", "migrations");
  const m300 = fs.readFileSync(path.join(PASTA_MIG, fs.readdirSync(PASTA_MIG).find((n) => n.startsWith("300_"))), "utf8").split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);
  for (let vez = 0; vez < 2; vez++) for (const lote of m300) await q(lote);
  ok((await escalar("SELECT COUNT(*) FROM StatusMembro WHERE Sigla = N'AFASTADO' AND Ativa = 1")) === 1
    && (await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = N'IX_LicencasCandidatura_MembroId_Status'")) === 1, "a migração 300 duas vezes: AFASTADO uma vez só no catálogo, e o índice");
  const papel = async (nome, nivel, perms) => (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (@n, @v, @p); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, v: nivel, p: perms }))[0].id;
  const pGeral = await papel("Geral E2E152", "GLOBAL", "pessoas,permissoes");
  const pTes = await papel("Tesoureiro E2E152", "CONGREGACAO", "financeiro,pessoas");
  const pSec = await papel("Secretário E2E152", "CONGREGACAO", "pessoas");
  const hash = L.auth.hashSenha(SENHA);
  const lideranca = async (m, p, t, e, ativoAte = null) => (await q(`INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash, AtivoAte)
    OUTPUT INSERTED.LiderancaId AS id VALUES (@m, @p, @t, @e, @h, @ate)`, { m, p, t, e, h: hash, ate: ativoAte }))[0].id;
  const LID = {};
  LID.geral = await lideranca(ID.geral, pGeral, "GLOBAL", null);
  LID.secLocal = await lideranca(ID.secLocal, pSec, "CONGREGACAO", sede);
  for (const k of ["lider", "liderInativar", "liderDesligar", "titular", "suspenso"]) LID[k] = await lideranca(ID[k], pTes, "CONGREGACAO", sede);
  for (const k of ["falhaDesligar", "falhaFicha"]) LID[k] = await lideranca(ID[k], pSec, "CONGREGACAO", sede);
  // o nível do cargo (regra de 25/11/2026): um cargo local, um de área e um geral (este sem a permissão "permissoes", para não mexer na conta de quem administra)
  const pArea = await papel("Pastor de Área E2E152", "AREA", "pessoas");
  const pGeralFin = await papel("Tesoureiro Geral E2E152", "GLOBAL", "financeiro");
  LID.liderLocal = await lideranca(ID.liderLocal, pTes, "CONGREGACAO", sede);
  LID.liderArea = await lideranca(ID.liderArea, pArea, "AREA", area);
  LID.liderGeral = await lideranca(ID.liderGeral, pGeralFin, "GLOBAL", null);
  LID.delegado = await lideranca(ID.delegado, pSec, "CONGREGACAO", sede);
  LID.exTesoureiro = await lideranca(ID.exTesoureiro, pTes, "CONGREGACAO", sede, "2024-12-31");
  LID.adminA = await lideranca(ID.adminA, pGeral, "GLOBAL", null);
  LID.adminB = await lideranca(ID.adminB, pGeral, "GLOBAL", null);
  const { TERMOS } = require(path.join(API, "shared/termos.js"));
  for (const m of Object.values(ID)) {
    for (const [tipo, t] of Object.entries(TERMOS)) await q("INSERT INTO TermosAssinados (MembroId, TipoTermo, VersaoTermo) VALUES (@m, @t, @v)", { m, t: tipo, v: t.versao });
  }
  const local = () => L.LIDER(ID.secLocal, ["pessoas"], [NOME_SEDE]);
  const geral = () => L.GERAL(ID.geral, ["pessoas"]);
  const daArea = () => L.LIDER(ID.secArea, ["pessoas"], [NOME_SEDE], "AREA");
  const localSemFator = () => L.sessao(ID.secLocal, { via: "SENHA", fator: { via: "NENHUM", em: Date.now() }, nivel: "CONGREGACAO", escopoCongregacoes: [NOME_SEDE], permissoes: ["pessoas"] });
  const pessoas = (metodo, opcoes) => chamarRota("GestaoPessoas/index.js", { metodo, ...opcoes });
  const statusDe = (id) => escalar("SELECT Status FROM MembroReferencia WHERE MembroId = @id", { id });
  const fimDoCargo = (id) => escalar("SELECT ISNULL(CONVERT(varchar(10), AtivoAte, 120), 'vigente') FROM Lideranca WHERE MembroId = @id", { id });
  const ficha = (id, extra = {}) => ({ membroId: id, nome: `Pessoa ${Object.keys(ID).find((k) => ID[k] === id)} E2E152`, congregacaoId: sede, status: "ATIVO",
    dataNascimento: "1984-03-12", dataAdmissao: "2010-05-02", sexo: "M", ...extra });

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 1. a matrícula da ficha só como número inteiro ==");
  for (const membroId of [ID.comum + 0.9, `${ID.comum}.9`, `0${ID.comum}`, `${ID.comum}e0`]) {
    const r = await pessoas("POST", { token: L.GERAL(ID.comum, ["pessoas"]), corpo: ficha(ID.comum, { membroId, dizimistaFiel: true, cargoMinisterial: "PASTOR" }) });
    ok(r.status === 400, `matrícula ${JSON.stringify(membroId)}: 400`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  ok((await escalar("SELECT CONCAT(ISNULL(CargoMinisterial, '-'), '/', ISNULL(CAST(DizimistaFiel AS INT), -1)) FROM MembroReferencia WHERE MembroId = @id", { id: ID.comum })) === "-/-1",
    "a ficha da própria pessoa continua sem cargo e sem dízimo");
  const certo = await pessoas("POST", { token: geral(), corpo: ficha(ID.comum, { membroId: ` ${ID.comum} `, telefone: "91900001520" }) });
  ok(certo.status === 200 && certo.body && certo.body.sucesso === true, "a matrícula em texto com espaço em volta vale", `${certo.status} ${JSON.stringify(certo.body).slice(0, 120)}`);
  const lixoRota = await pessoas("DELETE", { token: geral(), binding: { membroId: `${ID.comum}.0` } });
  ok(lixoRota.status === 400 && (await statusDe(ID.comum)) === "ATIVO", "DELETE com matrícula não canônica na rota: 400 e nada muda");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2. a data de saída ==");
  await q("UPDATE MembroReferencia SET Status = 'DESLIGADO', SituacaoMembro = 'SEM_COMUNHAO', MotivoSaida = 'DESLIGAMENTO', DataSaida = '2026-11-20' WHERE MembroId = @id", { id: ID.saiu });
  const salvou = await pessoas("POST", { token: geral(), corpo: ficha(ID.saiu, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", telefone: "91900001521" }) });
  ok(salvou.status === 200 && salvou.body && salvou.body.sucesso === true, "a ficha de quem saiu é salva", `${salvou.status} ${JSON.stringify(salvou.body).slice(0, 120)}`);
  ok((await escalar("SELECT CONVERT(varchar(10), DataSaida, 120) FROM MembroReferencia WHERE MembroId = @id", { id: ID.saiu })) === "2026-11-20", "e a data de saída continua a gravada");
  const vazia = await pessoas("POST", { token: geral(), corpo: ficha(ID.saiu, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", dataSaida: "" }) });
  ok(vazia.body && vazia.body.sucesso === true && (await escalar("SELECT CONVERT(varchar(10), DataSaida, 120) FROM MembroReferencia WHERE MembroId = @id", { id: ID.saiu })) === "2026-11-20",
    "a data vazia pela API também não apaga a gravada", JSON.stringify(vazia.body).slice(0, 120));
  const antesDe2006 = await pessoas("POST", { token: geral(), corpo: ficha(ID.saiu, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", dataSaida: "2005-12-31" }) });
  ok(antesDe2006.status === 400 && /2006/.test(antesDe2006.body && antesDe2006.body.mensagem), "a data de saída antes de 2006: 400 com a faixa na mensagem");
  const diaUtc = await escalar("SELECT CONVERT(varchar(10), CAST(SYSUTCDATETIME() AS DATE), 120)");
  porRelogio(`${diaUtc}T00:40:00Z`);
  try {
    const hoje = hojeBrasilia();
    const r = await pessoas("DELETE", { token: local(), binding: { membroId: String(ID.comum) } });
    ok(r.status === 200 && r.body && r.body.sucesso === true, "à noite, a congregação desliga quem não tem cargo", `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    ok((await escalar("SELECT CONVERT(varchar(10), DataSaida, 120) FROM MembroReferencia WHERE MembroId = @id", { id: ID.comum })) === hoje, `a data de saída é o dia de Brasília (${hoje}), não o UTC (${diaUtc})`);
  } finally { soltarRelogio(); }

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2b. a situação no rol pelo catálogo, a licença só pela aba dela e as outras datas da ficha ==");
  const tentar = async (chamada) => { try { return await chamada(); } catch (e) { return { status: "exceção", body: { mensagem: String(e && e.message).slice(0, 80) } }; } };
  const resumo = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`;
  const foraDoCatalogo = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaSituacao, { status: "XPTO" }) }));
  ok(foraDoCatalogo.status === 400 && (await statusDe(ID.fichaSituacao)) === "ATIVO", "situação fora do catálogo: 400 e nada muda", resumo(foraDoCatalogo));
  const minusculas = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaSituacao, { status: "desligado", motivoSaida: "DESLIGAMENTO" }) }));
  ok(minusculas.status === 200 && (await statusDe(ID.fichaSituacao)) === "DESLIGADO"
    && (await escalar("SELECT CONVERT(varchar(10), DataSaida, 120) FROM MembroReferencia WHERE MembroId = @id", { id: ID.fichaSituacao })) === hojeBrasilia(),
  "a situação escrita em minúsculas grava a sigla do catálogo e passa pela saída do rol (a data de saída de hoje)", resumo(minusculas));
  const porNaLicenca = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaLicenca, { status: "LICENCA_CANDIDATURA" }) }));
  ok(porNaLicenca.status === 400 && /Licença Candidatura/.test(porNaLicenca.body && porNaLicenca.body.mensagem) && (await statusDe(ID.fichaLicenca)) === "ATIVO",
    "a ficha não põe em licença por candidatura: 400, aponta a aba da licença, nada muda", resumo(porNaLicenca));
  // em licença com a licença ABERTA (a recusa da ficha só vale enquanto ela está aberta: decisão de 25/11/2026)
  await q("UPDATE MembroReferencia SET Status = 'LICENCA_CANDIDATURA' WHERE MembroId = @id", { id: ID.fichaLicenca });
  await q("INSERT INTO LicencasCandidatura (MembroId, DataPleito, DataInicioLicenca, Status) VALUES (@id, '2026-10-04', '2026-07-06', 'EM_LICENCA')", { id: ID.fichaLicenca });
  const tirarDaLicenca = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaLicenca, { status: "ATIVO" }) }));
  ok(tirarDaLicenca.status === 409 && /Licença Candidatura/.test(tirarDaLicenca.body && tirarDaLicenca.body.mensagem) && (await statusDe(ID.fichaLicenca)) === "LICENCA_CANDIDATURA",
    "a ficha não tira da licença por candidatura: 409, aponta a aba da licença, nada muda", resumo(tirarDaLicenca));
  const naLicenca = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaLicenca, { status: "LICENCA_CANDIDATURA", telefone: "91900001522" }) }));
  ok(naLicenca.status === 200 && (await escalar("SELECT CONCAT(Status, '/', Telefone) FROM MembroReferencia WHERE MembroId = @id", { id: ID.fichaLicenca })) === "LICENCA_CANDIDATURA/91900001522",
    "quem está em licença tem a ficha salva com a mesma situação", resumo(naLicenca));
  const datasGravadas = () => escalar(`SELECT CONCAT(CONVERT(varchar(10), DataNascimento, 120), '|', CONVERT(varchar(10), DataAdmissao, 120), '|', ISNULL(CONVERT(varchar(10), DataBatismo, 120), '-'), '|',
    ISNULL(CONVERT(varchar(10), DataRitoRecebimento, 120), '-'), '|', ISNULL(CONVERT(varchar(10), DataAfastamento, 120), '-')) FROM MembroReferencia WHERE MembroId = @id`, { id: ID.fichaDatas });
  const datasAntes = await datasGravadas();
  const amanha = (() => { const d = new Date(`${hojeBrasilia()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  for (const [campo, valor, esperado] of [["dataNascimento", "abc", /nascimento/], ["dataNascimento", "0000-01-01", /nascimento/], ["dataAdmissao", "20/11/2026", /admissão/],
    ["dataBatismo", "2026-02-30", /batismo/], ["dataRitoRecebimento", "abc", /rito/], ["dataAfastamento", 19900101, /afastamento/],
    ["dataNascimento", amanha, /futuro/], ["dataAdmissao", amanha, /futuro/], ["dataBatismo", amanha, /futuro/]]) {
    const r = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaDatas, { [campo]: valor }) }));
    ok(r.status === 400 && esperado.test(r.body && r.body.mensagem) && (await datasGravadas()) === datasAntes, `${campo} = ${JSON.stringify(valor)}: 400 com a mensagem do campo, nada muda`, resumo(r));
  }
  const datasCertas = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaDatas, { dataBatismo: "2001-06-10", dataRitoRecebimento: "2016-03-20", dataAfastamento: "2020-02-01" }) }));
  ok(datasCertas.status === 200 && (await datasGravadas()) === "1984-03-12|2010-05-02|2001-06-10|2016-03-20|2020-02-01", "as datas certas são gravadas", resumo(datasCertas));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 2c. a saída da licença por candidatura ==");
  const lic = (membroId) => chamarRota("GestaoLicencasCandidatura/index.js", { metodo: "POST", token: geral(), corpo: { membroId, dataPleito: "2026-10-04" } });
  const decidir = (licencaId, retornou) => chamarRota("GestaoLicencasCandidatura/index.js", { metodo: "POST", token: geral(), binding: { id: String(licencaId) }, corpo: { retornou } });
  const licencaDe = (m) => escalar("SELECT TOP 1 CONCAT(Status, '|', ISNULL(ObservacaoRetorno, '-')) FROM LicencasCandidatura WHERE MembroId = @m ORDER BY LicencaId DESC", { m });
  const idLic = {};
  for (const k of ["licNaoVolta", "licVolta", "licFalece", "licDesliga", "licEncerrada"]) {
    const r = await lic(ID[k]);
    idLic[k] = r.body && r.body.licencaId;
    ok(r.status === 201 && (await statusDe(ID[k])) === "LICENCA_CANDIDATURA", `a licença de ${k} pela rota da licença`, resumo(r));
  }
  const naoVolta = await decidir(idLic.licNaoVolta, false);
  ok(naoVolta.body && naoVolta.body.sucesso === true && (await statusDe(ID.licNaoVolta)) === "INATIVO" && /^NAO_RETORNOU/.test(await licencaDe(ID.licNaoVolta))
    && (await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'LicencasCandidatura' AND RegistroId = @id AND Acao LIKE N'%não retorno%'", { id: idLic.licNaoVolta })) === 1,
  "não retornou: a licença fecha, a pessoa fica INATIVO no rol e a trilha registra", resumo(naoVolta));
  const volta = await decidir(idLic.licVolta, true);
  ok(volta.body && volta.body.sucesso === true && (await statusDe(ID.licVolta)) === "ATIVO" && /^RETORNOU/.test(await licencaDe(ID.licVolta)), "retornou: a pessoa volta a ATIVO", resumo(volta));
  const deNovoLic = await decidir(idLic.licNaoVolta, true);
  ok(deNovoLic.body && deNovoLic.body.sucesso === false && (await statusDe(ID.licNaoVolta)) === "INATIVO", "a decisão já registrada não se repete (nem traz de volta a ATIVO)", resumo(deNovoLic));
  const faleceuLic = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.licFalece, { status: "FALECIDO" }) }));
  ok(faleceuLic.status === 200 && (await statusDe(ID.licFalece)) === "FALECIDO" && /^NAO_RETORNOU\|.*falecimento/.test(await licencaDe(ID.licFalece)),
    "a ficha grava o falecimento de quem está em licença, e a licença fecha junto", resumo(faleceuLic));
  const fichaDesliga = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.licDesliga, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" }) }));
  ok(fichaDesliga.status === 409 && /Desligar/.test(fichaDesliga.body && fichaDesliga.body.mensagem) && (await statusDe(ID.licDesliga)) === "LICENCA_CANDIDATURA" && /^EM_LICENCA/.test(await licencaDe(ID.licDesliga)),
    "a ficha não desliga quem está em licença: 409, aponta o botão Desligar", resumo(fichaDesliga));
  // a licença encerrada sem trocar a situação no rol (a exclusão disciplinar, ou o "não retornou" de antes de 25/11/2026): a ficha volta a aceitar a situação
  const listaLic = await tentar(() => pessoas("GET", { token: geral() }));
  const marca = (m) => { const l = Array.isArray(listaLic.body) ? listaLic.body.find((x) => x.membroId === m) : null; return l ? l.licencaAberta : "ausente"; };
  ok(listaLic.status === 200 && marca(ID.licEncerrada) === true && marca(ID.licNaoVolta) === false && marca(ID.licVolta) === false,
    "a lista marca licencaAberta só para quem está com a licença aberta", `${marca(ID.licEncerrada)} ${marca(ID.licNaoVolta)} ${marca(ID.licVolta)}`);
  await q("UPDATE LicencasCandidatura SET Status = 'NAO_RETORNOU', DataRetornoDecidida = '2026-10-10', ObservacaoRetorno = N'Encerrada pela saída do rol.' WHERE MembroId = @m", { m: ID.licEncerrada });
  const listaLic2 = await tentar(() => pessoas("GET", { token: geral() }));
  const linhaEnc = Array.isArray(listaLic2.body) ? listaLic2.body.find((x) => x.membroId === ID.licEncerrada) : null;
  ok(linhaEnc && linhaEnc.status === "LICENCA_CANDIDATURA" && linhaEnc.licencaAberta === false, "licença encerrada sem trocar a situação: licencaAberta false", JSON.stringify(linhaEnc || {}).slice(0, 120));
  const fichaEnc = await tentar(() => pessoas("POST", { token: geral(), corpo: ficha(ID.licEncerrada, { status: "INATIVO" }) }));
  ok(fichaEnc.status === 200 && fichaEnc.body && fichaEnc.body.sucesso === true && (await statusDe(ID.licEncerrada)) === "INATIVO",
    "sem licença aberta, a ficha aceita a situação normalmente (INATIVO)", resumo(fichaEnc));
  const desligouLic = await tentar(() => pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.licDesliga) } }));
  ok(desligouLic.status === 200 && (await statusDe(ID.licDesliga)) === "DESLIGADO" && /^NAO_RETORNOU\|.*desligamento/.test(await licencaDe(ID.licDesliga)),
    "o Desligar de quem está em licença fecha a licença junto", resumo(desligouLic));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 3. tirar do rol ativo quem tem cargo de liderança ==");
  // o cargo de área e o geral: a secretaria local não muda a situação no rol
  for (const alvo of ["liderArea", "liderGeral"]) {
    const r = await pessoas("DELETE", { token: local(), binding: { membroId: String(ID[alvo]) } });
    ok(r.status === 403 && (await statusDe(ID[alvo])) === "ATIVO" && (await fimDoCargo(ID[alvo])) === "vigente", `a secretaria local não desliga quem tem cargo acima dela (${alvo}): 403`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  for (const status of ["INATIVO", "AFASTADO", "FALECIDO"]) {
    const r = await pessoas("POST", { token: local(), corpo: ficha(ID.liderArea, { status }) });
    ok(r.status === 403 && (await statusDe(ID.liderArea)) === "ATIVO", `a secretaria local não muda para ${status} quem tem cargo de área: 403`, `${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  const areaNoGeral = await pessoas("DELETE", { token: daArea(), binding: { membroId: String(ID.liderGeral) } });
  ok(areaNoGeral.status === 403 && (await statusDe(ID.liderGeral)) === "ATIVO", "a secretaria da área não desliga quem tem cargo geral: 403");
  const areaInativa = await pessoas("POST", { token: daArea(), corpo: ficha(ID.liderArea, { status: "AFASTADO" }) });
  ok(areaInativa.body && areaInativa.body.sucesso === true && (await statusDe(ID.liderArea)) === "AFASTADO", "a secretaria da área afasta quem tem cargo de área", JSON.stringify(areaInativa.body).slice(0, 120));
  // o cargo local: a secretaria local, com a confirmação recente
  const localSem = await pessoas("DELETE", { token: localSemFator(), binding: { membroId: String(ID.liderLocal) } });
  ok(localSem.status === 428 && (await statusDe(ID.liderLocal)) === "ATIVO", "a secretaria local sem a confirmação recente: 428, nada muda");
  const localDesliga = await pessoas("DELETE", { token: local(), binding: { membroId: String(ID.liderLocal) } });
  ok(localDesliga.body && localDesliga.body.sucesso === true && (await statusDe(ID.liderLocal)) === "DESLIGADO" && (await fimDoCargo(ID.liderLocal)) !== "vigente",
    "a secretaria local desliga quem tem cargo local, e o cargo acaba", JSON.stringify(localDesliga.body).slice(0, 120));
  const localInativa = await pessoas("POST", { token: local(), corpo: ficha(ID.liderInativar, { status: "INATIVO" }) });
  ok(localInativa.body && localInativa.body.sucesso === true && (await statusDe(ID.liderInativar)) === "INATIVO", "a secretaria local muda para INATIVO quem tem cargo local", JSON.stringify(localInativa.body).slice(0, 120));
  const loginInativo = await chamarRota("LoginSecretaria/index.js", { metodo: "POST", corpo: { matricula: ID.liderInativar, senha: SENHA }, headers: cab() });
  ok(!(loginInativo.body && loginInativo.body.token), "e quem ficou INATIVO perde o acesso do cargo na hora (o login recusa)");
  const semFator = await pessoas("DELETE", { token: geralSemFator(ID.geral, ["pessoas"]), binding: { membroId: String(ID.lider) } });
  ok(semFator.status === 428 && semFator.body && semFator.body.precisaFator === true && (await statusDe(ID.lider)) === "ATIVO", "o nível geral sem a confirmação recente: 428, nada muda");
  const fichaSemFator = await pessoas("POST", { token: geralSemFator(ID.geral, ["pessoas"]), corpo: ficha(ID.liderGeral, { status: "INATIVO" }) });
  ok(fichaSemFator.status === 428 && (await statusDe(ID.liderGeral)) === "ATIVO", "a ficha com INATIVO pelo geral sem a confirmação recente: 428");
  const inexistente = await pessoas("DELETE", { token: local(), binding: { membroId: "2147480001" } });
  const foraDoEscopo = await pessoas("DELETE", { token: L.LIDER(ID.secLocal, ["pessoas"], ["Outra Congregação E2E152"]), binding: { membroId: String(ID.lider) } });
  ok(inexistente.status === 403 && JSON.stringify(inexistente.body) === JSON.stringify(foraDoEscopo.body), "matrícula que não existe e de fora do escopo: a mesma recusa");
  const desligou = await pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.liderDesligar) } });
  ok(desligou.status === 200 && desligou.body && desligou.body.sucesso === true, "o nível geral com a confirmação recente desliga", `${desligou.status} ${JSON.stringify(desligou.body).slice(0, 120)}`);
  ok((await statusDe(ID.liderDesligar)) === "DESLIGADO" && (await fimDoCargo(ID.liderDesligar)) !== "vigente", "e o cargo dele foi encerrado");
  const inativou = await pessoas("POST", { token: geral(), corpo: ficha(ID.liderGeral, { status: "INATIVO" }) });
  ok(inativou.status === 200 && (await statusDe(ID.liderGeral)) === "INATIVO", "o nível geral com a confirmação recente muda para INATIVO quem tem cargo geral", `${inativou.status} ${JSON.stringify(inativou.body).slice(0, 120)}`);

  // Quem administra os acessos: conta só quem entra (ATIVO, cargo vigente, com senha, nível geral, recertificação em dia).
  const outros = async () => (await travaPermissoes.situacaoDoCargo(await obterPool(), L.sql, ID.adminA, hojeBrasilia())).outros;
  const comB = await outros();
  await q("UPDATE MembroReferencia SET Status = 'INATIVO' WHERE MembroId = @id", { id: ID.adminB });
  ok((await outros()) === comB - 1, "quem não está ATIVO no rol não conta como administrador", `${comB} -> ${await outros()}`);
  await q("UPDATE MembroReferencia SET Status = 'ATIVO' WHERE MembroId = @id", { id: ID.adminB });
  await q(`INSERT INTO RecertificacoesAcesso (MembroId, PapelId, Permissao, Status, Prazo) VALUES (@m, @p, N'permissoes', 'EXPIRADA', '2026-01-01')`, { m: ID.adminB, p: pGeral });
  ok((await outros()) === comB - 1, "quem tem a recertificação de \"permissoes\" vencida não conta", `${comB} -> ${await outros()}`);
  await q(`INSERT INTO RecertificacoesAcesso (MembroId, PapelId, Permissao, Status, Prazo) VALUES (@m, @p, N'permissoes', 'CONFIRMADA', '2027-01-01')`, { m: ID.adminB, p: pGeral });
  ok((await outros()) === comB, "a recertificação confirmada depois volta a contar");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4. a delegação e a recertificação vencida do titular ==");
  await q(`INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo) VALUES (@l, @de, @para, '2026-01-01', '2099-12-31', N'Viagem (roteiro)')`,
    { l: LID.titular, de: ID.titular, para: ID.delegado });
  const login = (matricula) => chamarRota("LoginSecretaria/index.js", { metodo: "POST", corpo: { matricula, senha: SENHA }, headers: cab() });
  const delegadas = (token) => { const s = L.auth.getSessao(token); return s && Array.isArray(s.concessoes) ? s.concessoes.filter((c) => c.origem === "DELEGACAO") : []; };
  const antes = await login(ID.delegado);
  ok(delegadas(antes.body && antes.body.token).some((c) => c.permissoes.includes("financeiro")), "com a recertificação do titular em dia, o delegado recebe o financeiro", JSON.stringify(delegadas(antes.body && antes.body.token)));
  await q(`INSERT INTO RecertificacoesAcesso (MembroId, PapelId, Permissao, Status, Prazo) VALUES (@m, @p, N'financeiro', 'EXPIRADA', '2026-01-01')`, { m: ID.titular, p: pTes });
  const titular = await login(ID.titular);
  ok(titular.body && titular.body.sucesso === true && !(titular.body.permissoes || []).includes("financeiro"), "o titular entra sem o financeiro vencido");
  const depois = await login(ID.delegado);
  const conc = delegadas(depois.body && depois.body.token);
  ok(conc.length === 1 && !conc[0].permissoes.includes("financeiro") && conc[0].permissoes.includes("pessoas"), "e o delegado também não recebe o financeiro (o resto do papel continua)", JSON.stringify(conc));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4b. os avisos da congregação só para quem entra com a permissão ==");
  const pAviso = await papel("Gestão PSC E2E152", "CONGREGACAO", "psc_gestao");
  for (const k of ["avisoAtivo", "avisoInativo", "avisoRecert", "avisoFim"]) LID[k] = await lideranca(ID[k], pAviso, "CONGREGACAO", sede);
  await q("UPDATE MembroReferencia SET Status = 'INATIVO' WHERE MembroId = @m", { m: ID.avisoInativo });
  await q(`INSERT INTO RecertificacoesAcesso (MembroId, PapelId, Permissao, Status, Prazo) VALUES (@m, @p, N'psc_gestao', 'EXPIRADA', '2026-01-01')`, { m: ID.avisoRecert, p: pAviso });
  const psc = require(path.join(API, "shared/psc.js"));
  const recebem = async () => (await psc.resolverDestinatariosDaCongregacao(await obterPool(), { permissao: "psc_gestao", congregacaoId: sede }))
    .map((d) => d.membroId).filter((m) => [ID.avisoAtivo, ID.avisoInativo, ID.avisoRecert, ID.avisoFim].includes(m)).sort();
  ok(JSON.stringify(await recebem()) === JSON.stringify([ID.avisoAtivo, ID.avisoFim].sort()), "recebem só quem está ATIVO e com a recertificação em dia", JSON.stringify(await recebem()));
  const notificacoes = require(path.join(API, "shared/notificacoes.js"));
  const recebemGenerico = (await notificacoes.resolverDestinatariosPorPermissao(await obterPool(), { permissao: "psc_gestao" }))
    .map((d) => d.membroId).filter((m) => [ID.avisoAtivo, ID.avisoInativo, ID.avisoRecert, ID.avisoFim].includes(m)).sort();
  ok(JSON.stringify(recebemGenerico) === JSON.stringify([ID.avisoAtivo, ID.avisoFim].sort()), "o resolvedor genérico segue a mesma régua", JSON.stringify(recebemGenerico));
  // o cargo que acaba hoje no dia de Brasília: à noite (já amanhã em Greenwich) ainda vale
  const diaUtcAviso = await escalar("SELECT CONVERT(varchar(10), CAST(SYSUTCDATETIME() AS DATE), 120)");
  porRelogio(`${diaUtcAviso}T01:30:00Z`);
  try {
    await q("UPDATE Lideranca SET AtivoAte = @h WHERE MembroId = @m", { m: ID.avisoFim, h: hojeBrasilia() });
    ok((await recebem()).includes(ID.avisoFim), `o cargo que acaba hoje (${hojeBrasilia()}, Brasília) ainda recebe à noite`);
  } finally { soltarRelogio(); }
  await q("UPDATE Lideranca SET AtivoAte = DATEADD(day, -1, @h) WHERE MembroId = @m", { m: ID.avisoFim, h: hojeBrasilia() });
  ok(!(await recebem()).includes(ID.avisoFim), "o cargo que acabou ontem não recebe");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 4c. a cobrança do PSC: nem o ano da fundação, nem os anos sob tutela ==");
  // Visto de 01/06/2031 (exercícios 2026 a 2030 com o prazo vencido). "Nova": fundada em 2027, cobrada a partir de 2028. "Tutelada": decretada em 05/2027
  // e restabelecida em 01/01/2029 às 01h (UTC), que em Brasília ainda é 31/12/2028: a tutela vai de 2027 a 2028, e 2026, 2029 e 2030 são cobrados.
  // numa área própria: a área do cenário continua só com a sede (a secretaria da área do roteiro alcança todas as congregações dela)
  const areaPsc = (await q("INSERT INTO Areas (Nome) VALUES (N'Área PSC E2E152'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const nova = (await q("INSERT INTO Congregacoes (Nome, AreaId, FundacaoAno) VALUES (N'Nova Cobrança E2E152', @a, 2027); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: areaPsc }))[0].id;
  const tutelada = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Tutelada Cobrança E2E152', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: areaPsc }))[0].id;
  const gatilhoTutela = (await q(`INSERT INTO PscAvaliacoes (CongregacaoId, Ano, Status, Ciclo, Versao) OUTPUT INSERTED.AvaliacaoId AS id VALUES (@c, 2025, 'HOMOLOGADA', 1, 1)`, { c: tutelada }))[0].id;
  await q(`INSERT INTO PscReclassificacoes (CongregacaoId, ExerciciosConsecutivos, AnoInicial, AnoFinal, AvaliacaoGatilhoId, Status, DecididaEm, RestabelecidaEm)
    VALUES (@c, 2, 2024, 2025, @g, 'REVERTIDA', '2027-05-10T12:00:00', '2029-01-01T01:00:00')`, { c: tutelada, g: gatilhoTutela });
  LID.avisoNova = await lideranca(ID.avisoNova, pAviso, "CONGREGACAO", nova);   // quem recebe o aviso de cada uma (sem destinatário, não há aviso)
  LID.avisoTutelada = await lideranca(ID.avisoTutelada, pAviso, "CONGREGACAO", tutelada);
  const pendentes = (await psc.detectarAvaliacoesPendentes(await obterPool(), { hoje: "2031-06-01" })).map((f) => f.referenciaId);
  const anosCobrados = (c) => pendentes.filter((r) => Math.floor(r / 10000) === c).map((r) => r % 10000).sort();
  ok(JSON.stringify(anosCobrados(nova)) === "[2028,2029,2030]", "a congregação fundada em 2027 não é cobrada de 2026 nem de 2027", JSON.stringify(anosCobrados(nova)));
  ok(JSON.stringify(anosCobrados(tutelada)) === "[2026,2029,2030]", "a restabelecida não é cobrada dos anos sob tutela (o ano pelo relógio de Brasília)", JSON.stringify(anosCobrados(tutelada)));
  const painelDe = async (ano) => (await psc.montarPainel(await obterPool(), { ano, hoje: "2031-06-01", nomesCongregacoesPermitidas: ["Nova Cobrança E2E152", "Tutelada Cobrança E2E152"] }))
    .congregacoes.map((l) => `${l.congregacaoId === nova ? "nova" : "tutelada"}:${l.prazo.situacao}`).sort().join(" ");
  ok((await painelDe(2027)) === "nova:NAO_SE_APLICA tutelada:NAO_SE_APLICA", "no painel de 2027 as duas aparecem como 'não se aplica'", await painelDe(2027));
  ok((await painelDe(2029)) === "nova:ATRASADO tutelada:ATRASADO", "no painel de 2029 as duas estão atrasadas", await painelDe(2029));
  // o texto do aviso: o rascunho aberto como a tela abre (sem Ciclo: nunca enviado) continua "não foi enviada"; o que foi enviado e voltou diz que voltou
  await q("INSERT INTO PscAvaliacoes (CongregacaoId, Ano, AbertaPorMembroId) VALUES (@c, 2028, @por)", { c: nova, por: ID.geral });
  await q("INSERT INTO PscAvaliacoes (CongregacaoId, Ano, AbertaPorMembroId, Ciclo) VALUES (@c, 2029, @por, 1)", { c: tutelada, por: ID.geral });
  const textos = new Map((await psc.detectarAvaliacoesPendentes(await obterPool(), { hoje: "2031-06-01" })).map((f) => [f.referenciaId, f.fatoGerador]));
  const nunca = textos.get(nova * 10000 + 2028) || "";
  const voltou = textos.get(tutelada * 10000 + 2029) || "";
  ok(/não foi enviada até 31\/03\/2029/.test(nunca), "o rascunho nunca enviado: o aviso diz que não foi enviada", nunca);
  ok(/voltou para correção e ainda não foi reenviada/.test(voltou) && !/não foi enviada/.test(voltou), "o enviado que voltou para correção: o aviso diz isso", voltou);
  // a proposta arquivada (para reabrir a avaliação que a sustentava) não impede a nova, depois da avaliação homologada de novo, ainda reprovada
  const betel = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (N'Betel Proposta E2E152', @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { a: areaPsc }))[0].id;
  const reprovada = async (ano) => (await q(`INSERT INTO PscAvaliacoes (CongregacaoId, Ano, Status, ReprovadaNivel1, Ciclo, Versao) OUTPUT INSERTED.AvaliacaoId AS id
    VALUES (@c, @ano, 'HOMOLOGADA', 1, 1, 1)`, { c: betel, ano }))[0].id;
  await reprovada(2026);
  const gatilhoBetel = await reprovada(2027);
  await q(`INSERT INTO PscReclassificacoes (CongregacaoId, ExerciciosConsecutivos, AnoInicial, AnoFinal, AvaliacaoGatilhoId, Status, MotivoArquivamento)
    VALUES (@c, 2, 2026, 2027, @g, 'ARQUIVADA', N'Reabrir a avaliação de 2027 (roteiro)')`, { c: betel, g: gatilhoBetel });
  const novaProposta = await psc.proporReclassificacaoSeCabivel(await obterPool(), { avaliacao: { congregacaoId: betel, ano: 2027 }, reprovadaNivel1: true, membroId: ID.geral });
  ok(novaProposta && novaProposta.reclassificacaoId && (await escalar("SELECT COUNT(*) FROM PscReclassificacoes WHERE CongregacaoId = @c AND Status = 'PROPOSTA'", { c: betel })) === 1,
    "a proposta arquivada não impede a nova (a CLI volta a ter o que decidir)", JSON.stringify(novaProposta));
  ok((await psc.proporReclassificacaoSeCabivel(await obterPool(), { avaliacao: { congregacaoId: betel, ano: 2027 }, reprovadaNivel1: true, membroId: ID.geral })) === null,
    "e com a nova proposta aberta, não nasce uma segunda");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5. a medida cautelar ==");
  const medida = (corpo, token = L.GERAL(ID.geral, ["pessoas", "permissoes"])) => chamarRota("GestaoMedidasCautelares/index.js", { metodo: "POST", token, corpo });
  const m1 = await medida({ membroId: ID.exTesoureiro, motivo: "Apuração patrimonial (roteiro)", suspenderAcessoSistema: true });
  ok(m1.status === 201, "a medida com suspensão é aplicada a quem tem um mandato já encerrado", `${m1.status} ${JSON.stringify(m1.body).slice(0, 120)}`);
  ok((await fimDoCargo(ID.exTesoureiro)) === "2024-12-31", "o fim do mandato já encerrado fica como estava (31/12/2024)", await fimDoCargo(ID.exTesoureiro));
  const m2 = await medida({ membroId: ID.suspenso, motivo: "Conferência do caixa (roteiro)", suspenderAcessoSistema: true });
  ok(m2.status === 201 && (await fimDoCargo(ID.suspenso)) !== "vigente", "o cargo vigente recebe o fim", `${m2.status} ${await fimDoCargo(ID.suspenso)}`);
  const trilha = await escalar(`SELECT TOP 1 DadosAntes FROM AuditLog WHERE Tabela = 'MedidasCautelares' AND RegistroId = @id ORDER BY AuditId DESC`, { id: m2.body && m2.body.medida && m2.body.medida.medidaId });
  ok(typeof trilha === "string" && trilha.includes(`"liderancaId":${LID.suspenso}`) && trilha.includes(`"ativoAteAnterior":null`), "a trilha guarda o fim anterior do cargo encerrado", String(trilha).slice(0, 160));
  // uma falha no meio (a trilha recusada pelo banco) desfaz a medida inteira
  const contarMedidas = () => escalar("SELECT COUNT(*) FROM MedidasCautelares WHERE MembroId = @m", { m: ID.lider });
  const antesFalha = await contarMedidas();
  await q(`EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_E2E152_FalhaTrilha ON dbo.AuditLog AFTER INSERT AS
          IF EXISTS (SELECT 1 FROM inserted WHERE Tabela = N''MedidasCautelares'') THROW 50152, N''falha simulada do roteiro'', 1;')`);
  try {
    let erro = null;
    try { await medida({ membroId: ID.lider, motivo: "Falha no meio (roteiro)", suspenderAcessoSistema: true }); } catch (e) { erro = e; }
    ok(erro !== null, "a falha simulada chega a quem chamou (o servidor responde erro, não sucesso)");
    ok((await contarMedidas()) === antesFalha, "e nenhuma medida ficou gravada");
    ok((await fimDoCargo(ID.lider)) === "vigente", "e o cargo continua vigente (nada pela metade)");
  } finally {
    await q("DROP TRIGGER IF EXISTS dbo.TR_E2E152_FalhaTrilha");
  }
  const deNovo = await medida({ membroId: ID.lider, motivo: "Falha no meio (roteiro), de novo", suspenderAcessoSistema: true });
  ok(deNovo.status === 201 && (await contarMedidas()) === antesFalha + 1 && (await fimDoCargo(ID.lider)) !== "vigente", "a nova tentativa conclui com uma medida só");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5b. a saída do rol numa transação só ==");
  const orgao = await escalar("SELECT TOP 1 OrgaoId FROM Orgaos ORDER BY OrgaoId");
  for (const m of [ID.falhaDesligar, ID.falhaFicha, ID.falecido]) {
    await q("INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', N'Conselheiro (roteiro)', '2025-01-01')", { o: orgao, m });
  }
  const assentoAberto = async (m) => (await escalar("SELECT COUNT(*) FROM Assentos WHERE MembroId = @m AND DataFim IS NULL", { m })) === 1;
  await q(`EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_E2E152_FalhaSaida ON dbo.AuditLog AFTER INSERT AS
          IF EXISTS (SELECT 1 FROM inserted WHERE Tabela = N''MembroReferencia'' AND RegistroId IN (${ID.falhaDesligar}, ${ID.falhaFicha})) THROW 50153, N''falha simulada do roteiro'', 1;')`);
  try {
    let erro = null;
    try { const r = await pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.falhaDesligar) } }); if (r.status >= 500) erro = r; } catch (e) { erro = e; }
    ok(erro !== null, "desligar com falha no fim: o erro chega a quem chamou");
    ok((await statusDe(ID.falhaDesligar)) === "ATIVO" && (await fimDoCargo(ID.falhaDesligar)) === "vigente" && (await assentoAberto(ID.falhaDesligar)),
      "e nada ficou pela metade (continua ATIVO, com o cargo e o assento)");
    erro = null;
    try { const r = await pessoas("POST", { token: geral(), corpo: ficha(ID.falhaFicha, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" }) }); if (r.status >= 500) erro = r; } catch (e) { erro = e; }
    ok(erro !== null, "a ficha com DESLIGADO e falha no fim: o erro chega a quem chamou");
    ok((await statusDe(ID.falhaFicha)) === "ATIVO" && (await fimDoCargo(ID.falhaFicha)) === "vigente" && (await assentoAberto(ID.falhaFicha)),
      "e nada ficou pela metade na ficha");
  } finally {
    await q("DROP TRIGGER IF EXISTS dbo.TR_E2E152_FalhaSaida");
  }
  const desligouDeNovo = await pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.falhaDesligar) } });
  ok(desligouDeNovo.body && desligouDeNovo.body.sucesso === true && (await statusDe(ID.falhaDesligar)) === "DESLIGADO" && (await fimDoCargo(ID.falhaDesligar)) !== "vigente"
    && !(await assentoAberto(ID.falhaDesligar)), "a nova tentativa de desligar conclui tudo", JSON.stringify(desligouDeNovo.body).slice(0, 120));
  const fichaDeNovo = await pessoas("POST", { token: geral(), corpo: ficha(ID.falhaFicha, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO" }) });
  ok(fichaDeNovo.body && fichaDeNovo.body.sucesso === true && (await statusDe(ID.falhaFicha)) === "DESLIGADO" && !(await assentoAberto(ID.falhaFicha)),
    "a nova tentativa da ficha conclui tudo", JSON.stringify(fichaDeNovo.body).slice(0, 120));
  const faleceu = await pessoas("POST", { token: geral(), corpo: ficha(ID.falecido, { status: "FALECIDO" }) });
  ok(faleceu.body && faleceu.body.sucesso === true, "a ficha com FALECIDO, sem a causa da saída", JSON.stringify(faleceu.body).slice(0, 120));
  ok((await escalar("SELECT MotivoEncerramento FROM Assentos WHERE MembroId = @m", { m: ID.falecido })) === "FALECIMENTO", "o assento fecha com o motivo FALECIMENTO");
  const desligarFalecido = await pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.falecido) } });
  ok(desligarFalecido.body && desligarFalecido.body.sucesso === false && (await statusDe(ID.falecido)) === "FALECIDO", "desligar um falecido: nada muda, continua FALECIDO");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5c. a decisão disciplinar e a vacância numa transação só ==");
  const disc = (processoId, corpo) => chamarRota("EvoluirProcessoDisciplinar/index.js", { metodo: "POST", binding: { processoId: String(processoId) }, token: L.GERAL(ID.geral, ["disciplina", "cei"]), corpo });
  for (const k of ["discJulgar", "discHomologar"]) {
    LID[k] = await lideranca(ID[k], pSec, "CONGREGACAO", sede);
    await q("INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', N'Conselheiro (roteiro)', '2025-01-01')", { o: orgao, m: ID[k] });
    // a licença por candidatura aberta: a exclusão a fecha na mesma transação (decisão de 25/11/2026)
    await q("INSERT INTO LicencasCandidatura (MembroId, DataPleito, DataInicioLicenca, Status) VALUES (@m, '2026-10-04', '2026-07-06', 'EM_LICENCA')", { m: ID[k] });
  }
  const licencaDisc = (m) => escalar("SELECT TOP 1 CONCAT(Status, '|', ISNULL(ObservacaoRetorno, '-')) FROM LicencasCandidatura WHERE MembroId = @m ORDER BY LicencaId DESC", { m });
  const procJulgar = await escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, OrgaoResponsavelId) OUTPUT INSERTED.ProcessoId
    VALUES (@m, '2026-09-01', 'EM_ANDAMENTO', @o)`, { m: ID.discJulgar, o: orgao });
  const procHomologar = await escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status, Resultado, DataConclusao, HomologadoPeloCEI, OrgaoResponsavelId)
    OUTPUT INSERTED.ProcessoId VALUES (@m, '2026-09-01', 'JULGADO', 'EXCLUSAO', '2026-09-20', 0, @o)`, { m: ID.discHomologar, o: orgao });
  const situacaoProc = (p) => escalar("SELECT CONCAT(Status, '/', ISNULL(CAST(HomologadoPeloCEI AS varchar(1)), '-')) FROM ProcessosDisciplinares WHERE ProcessoId = @p", { p });
  await q(`EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_E2E152_FalhaDecisao ON dbo.AuditLog AFTER INSERT AS
          IF EXISTS (SELECT 1 FROM inserted WHERE Tabela = N''ProcessosDisciplinares'' AND RegistroId IN (${procJulgar}, ${procHomologar})) THROW 50154, N''falha simulada do roteiro'', 1;')`);
  try {
    for (const [rotulo, p, m, corpo, antes] of [
      ["julgar com exclusão", procJulgar, ID.discJulgar, { acao: "JULGAR", resultado: "EXCLUSAO" }, "EM_ANDAMENTO/-"],
      ["homologar a exclusão", procHomologar, ID.discHomologar, { acao: "HOMOLOGAR_EXCLUSAO", homologado: true }, "JULGADO/0"]
    ]) {
      let erro = null;
      try { const r = await disc(p, corpo); if (r.status >= 500) erro = r; } catch (e) { erro = e; }
      ok(erro !== null, `${rotulo} com falha no fim: o erro chega a quem chamou`);
      ok((await situacaoProc(p)) === antes && (await fimDoCargo(m)) === "vigente" && (await assentoAberto(m)) && (await licencaDisc(m)) === "EM_LICENCA|-",
        `e nada ficou pela metade (${rotulo}: o processo como antes, o cargo, o assento e a licença abertos)`, `${await situacaoProc(p)} ${await fimDoCargo(m)} ${await licencaDisc(m)}`);
    }
  } finally {
    await q("DROP TRIGGER IF EXISTS dbo.TR_E2E152_FalhaDecisao");
  }
  const julgou = await disc(procJulgar, { acao: "JULGAR", resultado: "EXCLUSAO" });
  ok(julgou.body && julgou.body.sucesso === true && (await situacaoProc(procJulgar)) === "JULGADO/-" && (await fimDoCargo(ID.discJulgar)) !== "vigente" && !(await assentoAberto(ID.discJulgar)),
    "a nova tentativa de julgar conclui tudo", JSON.stringify(julgou.body).slice(0, 120));
  ok((await licencaDisc(ID.discJulgar)) === "NAO_RETORNOU|Encerrada pela saída do rol.", "o julgamento com exclusão fecha a licença aberta, com o motivo neutro", await licencaDisc(ID.discJulgar));
  const julgouDeNovo = await disc(procJulgar, { acao: "JULGAR", resultado: "SANCAO", penalidadeId: 1 });
  ok(julgouDeNovo.body && julgouDeNovo.body.sucesso === false && /já foi julgado/.test(julgouDeNovo.body.mensagem), "julgar de novo é recusado", JSON.stringify(julgouDeNovo.body).slice(0, 120));
  const homologou = await disc(procHomologar, { acao: "HOMOLOGAR_EXCLUSAO", homologado: true });
  ok(homologou.body && homologou.body.sucesso === true && (await situacaoProc(procHomologar)) === "JULGADO/1" && (await fimDoCargo(ID.discHomologar)) !== "vigente"
    && !(await assentoAberto(ID.discHomologar)), "a nova tentativa de homologar conclui tudo", JSON.stringify(homologou.body).slice(0, 120));
  ok((await licencaDisc(ID.discHomologar)) === "NAO_RETORNOU|Encerrada pela saída do rol.", "a homologação da exclusão fecha a licença aberta, com o motivo neutro", await licencaDisc(ID.discHomologar));

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 5d. a licença por candidatura de quem tem cargo: o nível do cargo, o 428 e uma transação só ==");
  const licenca = (token, membroId) => chamarRota("GestaoLicencasCandidatura/index.js", { metodo: "POST", token, corpo: { membroId, dataPleito: "2026-10-04" } });
  LID.licArea = await lideranca(ID.licArea, pArea, "AREA", area);
  LID.licLocal = await lideranca(ID.licLocal, pTes, "CONGREGACAO", sede);
  LID.licFalha = await lideranca(ID.licFalha, pTes, "CONGREGACAO", sede);
  await q("INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) VALUES (@o, @m, 'FUNCAO', N'Conselheiro (roteiro)', '2025-01-01')", { o: orgao, m: ID.licFalha });
  const licencas = (m) => escalar("SELECT COUNT(*) FROM LicencasCandidatura WHERE MembroId = @m", { m });
  const licAreaLocal = await licenca(local(), ID.licArea);
  ok(licAreaLocal.status === 403 && (await statusDe(ID.licArea)) === "ATIVO" && (await fimDoCargo(ID.licArea)) === "vigente" && (await licencas(ID.licArea)) === 0,
    "cargo de área: a secretaria local não registra a licença (403, nada muda)", `${licAreaLocal.status} ${JSON.stringify(licAreaLocal.body).slice(0, 100)}`);
  const licAreaArea = await licenca(daArea(), ID.licArea);
  ok(licAreaArea.status === 201 && (await statusDe(ID.licArea)) === "LICENCA_CANDIDATURA" && (await fimDoCargo(ID.licArea)) !== "vigente",
    "a secretaria da área registra (a pessoa em licença, o cargo encerrado)", `${licAreaArea.status} ${JSON.stringify(licAreaArea.body).slice(0, 100)}`);
  const licSemFator = await licenca(localSemFator(), ID.licLocal);
  ok(licSemFator.status === 428 && (await statusDe(ID.licLocal)) === "ATIVO", "cargo local sem a confirmação recente: 428", `${licSemFator.status}`);
  ok((await licenca(local(), ID.licLocal)).status === 201 && (await statusDe(ID.licLocal)) === "LICENCA_CANDIDATURA", "com a confirmação recente, a secretaria local registra");
  await q(`EXEC(N'CREATE OR ALTER TRIGGER dbo.TR_E2E152_FalhaLicenca ON dbo.AuditLog AFTER INSERT AS
          IF EXISTS (SELECT 1 FROM inserted WHERE Tabela = N''LicencasCandidatura'') THROW 50155, N''falha simulada do roteiro'', 1;')`);
  try {
    let erro = null;
    try { const r = await licenca(geral(), ID.licFalha); if (r.status >= 500) erro = r; } catch (e) { erro = e; }
    ok(erro !== null, "a licença com falha no fim: o erro chega a quem chamou");
    ok((await statusDe(ID.licFalha)) === "ATIVO" && (await licencas(ID.licFalha)) === 0 && (await fimDoCargo(ID.licFalha)) === "vigente" && (await assentoAberto(ID.licFalha)),
      "e nada ficou pela metade (sem licença, ATIVO, com o cargo e o assento)");
  } finally {
    await q("DROP TRIGGER IF EXISTS dbo.TR_E2E152_FalhaLicenca");
  }
  const licDeNovo = await licenca(geral(), ID.licFalha);
  ok(licDeNovo.status === 201 && (await licencas(ID.licFalha)) === 1 && (await statusDe(ID.licFalha)) === "LICENCA_CANDIDATURA" && !(await assentoAberto(ID.licFalha)),
    "a nova tentativa conclui com uma licença só", `${licDeNovo.status} ${JSON.stringify(licDeNovo.body).slice(0, 100)}`);

  // A última pessoa que administra os acessos: nem desligada, nem suspensa (no fim do roteiro: encerra os outros administradores da base).
  await q(`UPDATE l SET AtivoAte = '2000-01-01' FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId
           WHERE l.MembroId <> @a AND (',' + REPLACE(p.Permissoes, ' ', '') + ',') LIKE '%,permissoes,%'`, { a: ID.adminA });
  const sit = await travaPermissoes.situacaoDoCargo(await obterPool(), L.sql, ID.adminA, hojeBrasilia());
  ok(sit.alvoAdministra && sit.outros === 0, "o cenário: a pessoa A é a única que administra os acessos", JSON.stringify(sit));
  const ultimoDeslig = await pessoas("DELETE", { token: geral(), binding: { membroId: String(ID.adminA) } });
  ok(ultimoDeslig.body && ultimoDeslig.body.sucesso === false && (await statusDe(ID.adminA)) === "ATIVO", "a última que administra os acessos não é desligada", JSON.stringify(ultimoDeslig.body).slice(0, 140));
  const ultimaMedida = await medida({ membroId: ID.adminA, motivo: "x (roteiro)", suspenderAcessoSistema: true });
  ok(ultimaMedida.body && ultimaMedida.body.sucesso === false && (await fimDoCargo(ID.adminA)) === "vigente", "nem suspensa pela medida cautelar");

  // ------------------------------------------------------------------------------------------------------------------
  console.log("== 6. lixo nos campos ==");
  const quebras = [];
  const conferir = async (rotulo, chamada) => {
    try {
      const r = await chamada();
      if (r.status >= 500 || textoInterno(r.body)) quebras.push(`${rotulo} -> ${r.status}`);
    } catch (e) { quebras.push(`${rotulo} -> exceção ${String(e && e.message).slice(0, 60)}`); }
  };
  for (const lixo of L.LIXO) {
    const rotulo = JSON.stringify(lixo === undefined ? "undefined" : lixo).slice(0, 40);
    await conferir(`ficha ${rotulo}`, () => pessoas("POST", { token: geral(), corpo: { membroId: lixo, nome: lixo, congregacaoId: sede, status: lixo, dataSaida: lixo } }));
    await conferir(`desligar ${rotulo}`, () => pessoas("DELETE", { token: geral(), binding: { membroId: typeof lixo === "string" ? lixo : JSON.stringify(lixo) } }));
    // a matrícula certa de quem já saiu, com lixo só na data de saída: recusada, e a data gravada não muda
    if (lixo === undefined || lixo === null || lixo === "") continue;   // vazio = sem a data (mantém a gravada); 0001-01-01 e 9999-12-31 ficam fora de 2006 até hoje
    await conferir(`data de saída ${rotulo}`, () => pessoas("POST", { token: geral(), corpo: ficha(ID.saiu, { status: "DESLIGADO", motivoSaida: "DESLIGAMENTO", dataSaida: lixo }) }));
  }
  // a matrícula certa, com lixo num campo por vez (a situação e as outras datas da ficha)
  for (const campo of ["status", "dataNascimento", "dataAdmissao", "dataBatismo", "dataRitoRecebimento", "dataAfastamento"]) {
    for (const lixo of L.LIXO) {
      if (lixo === undefined || lixo === null || lixo === "") continue;
      await conferir(`${campo} ${JSON.stringify(lixo).slice(0, 30)}`, () => pessoas("POST", { token: geral(), corpo: ficha(ID.fichaDatas, { [campo]: lixo }) }));
    }
  }
  ok(quebras.length === 0, `lixo em cada campo (${L.LIXO.length} valores; a ficha campo a campo): nunca 500, nunca texto interno`, quebras.slice(0, 5).join(" | "));
  ok((await escalar("SELECT CONVERT(varchar(10), DataSaida, 120) FROM MembroReferencia WHERE MembroId = @id", { id: ID.saiu })) === "2026-11-20",
    "o lixo na data de saída não troca a data gravada");
}

principal().then(() => fim("e2e-152 (acesso, parte 3)")).catch((e) => { console.error(e); ok(false, "o roteiro quebrou: " + (e && e.message)); fim("e2e-152 (acesso, parte 3)"); });
