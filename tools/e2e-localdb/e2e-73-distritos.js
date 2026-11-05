// e2e-73-distritos.js — v9.3 (Distrito): fluxos, garantias do banco, segurança e lixo, com os handlers e o banco REAIS, sobre a base "cenario-distritos"
// (`bash rodar.sh preparar-distritos`: a base da v9.2 com a 167 aplicada duas vezes). Monta o próprio cenário.
// O decreto da CLI que ativa (gatilho do Art. 126-K §2º) e desativa, o período legado, o Pastor Distrital só pelo Presidente em Liderança (Art. 126-L, I), as
// cadeiras da CLI (Art. 6-A), o repasse das congregações do território fora do Rateio Geral, o Dízimo Institucional calculado dos fechamentos e creditado no
// Tesouro Geral (Art. 126-N, I), o balanço anual ao NIF (Art. 126-M, II, e 53-D, I), a intervenção imediata (Art. 126-N, III, e 126-P, II), os avisos e Meus Dados.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const { chamarRota } = require("./lib-afm");
const fs = require("fs");
const crypto = require("crypto");

console.error = () => { };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const di = require(path.join(API, "shared/distritos.js"));
const diDb = require(path.join(API, "shared/distritosDb.js"));
const tesouraria = require(path.join(API, "shared/tesouraria.js"));
const { composicaoCLI } = require(path.join(API, "shared/universo.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoDistritos/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token: token === undefined ? SEC() : token });
const GET = (acao, query, token) => rota(acao, { query, token: token === undefined ? SEC() : token });
const LID = (corpo, token, metodo = "POST", membroId) => chamarRota("GestaoLideranca/index.js", { metodo, binding: membroId ? { membroId: String(membroId) } : {}, token, corpo });
const CAT = (corpo, token, metodo = "POST", id) => chamarRota("GestaoCatalogos/index.js", { metodo, binding: { catalogo: "distritos", ...(id ? { id: String(id) } : {}) }, token, corpo });
const mes = di.mesDe(hojeBr());
const mesAntes = di.mesAnterior(mes);

// do cenário de base (e2e-1): 1001 Presidente, 1002 Secretário Geral, 3001/3002 Dirigentes da Central e da Vila Nova (Área Alfa), 3003 Pastor da Área Alfa, 3004 Beta
const P = { pastor: 9501, presbitero: 9502, tesoureiro: 9503, nif: 9504, interventor: 9505, superint: 9506, vice: 9507, delegado: 9508, sobProcesso: 9509, outroPastor: 9510 };
const SID_SEC = crypto.randomUUID();
const SEC = () => L.sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["distritos", "permissoes", "pessoas", "financeiro"], sid: SID_SEC });
const SEC_SEM_FATOR = () => L.sessao(1002, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["distritos"] });
const PRES = () => L.GERAL(1001, ["distritos", "permissoes"]);
const PRES_SEM_FATOR = () => L.sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["distritos"] });
const DIST = (m) => L.LIDER(m, ["distritos", "financeiro"], ["Central E2E", "Vila Nova E2E"], "DISTRITO");
const NIF = () => L.LIDER(P.nif, ["distritos"], ["Beta E2E"]);
const DIR = () => L.LIDER(3001, ["expansao", "pessoas"], ["Central E2E"]);
const PINM = () => L.sessao(P.tesoureiro, { via: "PIN", permissoes: ["distritos"] });

const TABELAS = ["Distritos", "DistritoPeriodos", "DistritoIntervencoes", "DistritoBalancos", "RepassesInstitucionais", "Lideranca", "SessoesAtivas", "DelegacoesAcesso", "OrgaosLocais"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function fuzz(rotulo, acao, base, campos, token) {
  const quebras = [], mudancas = [];
  let n = 0;
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await POST(acao, corpo, token);
    n++;
    if (![200, 400, 403, 404, 422].includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}
async function sessaoCLI(descricao, data, { status = "ENCERRADA" } = {}) {
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, @d, @dt, N'EXTRAORDINARIA', @s FROM Orgaos WHERE Sigla = N'CLI'`, { d: descricao, dt: data, s: status });
}
async function falhaNoBanco(rotulo, texto, params) {
  let erro = null;
  try { await q(texto, params); } catch (e) { erro = e; }
  ok(!!erro, `banco: ${rotulo}`, erro ? undefined : ["passou sem erro"]);
}
const vigente = async (m) => escalar("SELECT CASE WHEN AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE) THEN 1 ELSE 0 END FROM Lideranca WHERE MembroId = @m", { m });
const papelId = (nome) => escalar("SELECT PapelId FROM Papeis WHERE Nome = @n", { n: nome });
// os valores vão como texto (o shim do LocalDB arredondaria o número para inteiro) e o banco converte para DECIMAL
// o Distrito do repasse é decidido no fechamento, com o mesmo trecho que o FecharMesTesouraria usa (shared/distritos.js, DISTRITO_DO_MES)
const fechar = (congregacaoId, mesRef, totalFinal, status = "REPASSADO") => q(`INSERT INTO FechamentosTesouraria (CongregacaoId, MesReferencia, TotalRecebido, TotalFinal, PercentualRetencaoLocal,
  ValorRetidoLocal, ValorRepasseGeral, Status, FechadoPor, RepasseDistritoId) SELECT @c, @m, CAST(@t AS DECIMAL(10,2)), CAST(@t AS DECIMAL(10,2)), 40, CAST(@l AS DECIMAL(10,2)), CAST(@g AS DECIMAL(10,2)), @s, 1002,
  ${di.DISTRITO_DO_MES("@c", "@m")}`, { c: congregacaoId, m: mesRef, t: totalFinal.toFixed(2), l: (totalFinal * 0.4).toFixed(2), g: (totalFinal * 0.6).toFixed(2), s: status });
const cliIds = async () => new Set((await composicaoCLI(await obterPool(), await escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = N'CLI'"))).map((m) => Number(m.membroId)));

(async () => {
  await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const beta = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  const area1 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Alfa E2E'");
  const pessoas = [[P.pastor, "Pastor Distrital E2E", "PASTOR"], [P.presbitero, "Presbitero Dist E2E", "PRESBITERO"], [P.tesoureiro, "Tesoureira Dist E2E", null],
    [P.nif, "Conselheiro NIF E2E", null], [P.interventor, "Interventor Dist E2E", null], [P.superint, "Superintendente Dist E2E", null], [P.vice, "Vice Quadrante E2E", null],
    [P.delegado, "Delegado Dist E2E", null], [P.sobProcesso, "Sob Processo Dist E2E", null], [P.outroPastor, "Outro Pastor Dist E2E", "PASTOR"]];
  for (const [id, nome, cargo] of pessoas) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, CargoMinisterial, Email) VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO', @cargo, @em)",
      { id, n: nome, c: central, cargo, em: `p${id}@exemplo.org` });
  }
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.sobProcesso, d: hojeBr() });
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, @m, 'FUNCAO', 'MEMBRO', '2025-01-01' FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'`, { m: P.nif });
  const distrito = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Belém E2E', 0)");
  const vazio = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Vazio E2E', 0)");
  const legado = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Legado E2E', 1)");
  const quad = await escalar("INSERT INTO Quadrantes (Nome, Ativo, DistritoId) OUTPUT INSERTED.QuadranteId VALUES (N'Quadrante Norte E2E', 1, @d)", { d: distrito });
  const regiao = await escalar("INSERT INTO Regioes (Nome, Ativa, QuadranteId) OUTPUT INSERTED.RegiaoId VALUES (N'Região Norte E2E', 1, @q)", { q: quad });
  await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = @a", { r: regiao, a: area1 });
  // o Distrito legado: a mesma instrução da migração 167 (o que o cadastro já marcava como ativo ganha um período sem decreto)
  const lotes = fs.readFileSync(path.join(API, "..", "sql", "migrations", "167_distritos.sql"), "utf8").split(/^GO\s*$/m);
  await q(lotes.find((l) => /INSERT INTO dbo\.DistritoPeriodos \(DistritoId, Legado/.test(l)));
  ok((await um("SELECT Legado, FinanceiroDesdeMes FROM DistritoPeriodos WHERE DistritoId = @d", { d: legado })).Legado === true, "migração: o Distrito já ativo no cadastro ganha o período legado");
  ok(!(await escalar("SELECT COUNT(*) FROM DistritoPeriodos WHERE DistritoId IN (@a, @b)", { a: distrito, b: vazio })), "migração: o inativo não ganha período");
  const lid = (m, papel, t, e) => q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, @t, @e)", { m, p: papel, t, e });
  await lid(P.tesoureiro, await papelId("Tesoureiro de Distrito"), "DISTRITO", distrito);
  await lid(P.superint, await papelId("Superintendente Regional"), "REGIAO", regiao);
  await lid(P.vice, await papelId("Vice-Presidente de Quadrante"), "QUADRANTE", quad);
  const reuniao = await sessaoCLI("CLI decreta o Distrito E2E", di.mesDe(hojeBr()) + "-01" > hojeBr() ? hojeBr() : `${mes}-01`);
  const reuniaoAberta = await sessaoCLI("CLI ainda aberta E2E", hojeBr(), { status: "AGENDADA" });

  console.log("== papéis e permissão (a 167) ==");
  const perm = async (nome) => `,${await escalar("SELECT Permissoes FROM Papeis WHERE Nome = @n", { n: nome })},`;
  ok((await perm("Pastor Distrital")).includes(",distritos,") && (await perm("Interventor Distrital")).includes(",distritos,") && (await perm("Tesoureiro de Distrito")).includes(",distritos,"),
    "a permissão 'distritos' vem para o Pastor Distrital, o Interventor e o Tesoureiro de Distrito");
  ok((await escalar("SELECT Nivel FROM Papeis WHERE Nome = N'Pastor Distrital'")) === "DISTRITO" && (await escalar("SELECT Nivel FROM Papeis WHERE Nome = N'Vice-Presidente de Quadrante'")) === "QUADRANTE",
    "os papéis nascem no nível certo");
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Pastor Distrital'")) === 1, "a 167 aplicada duas vezes não duplica o papel");

  console.log("== cadastro: o Catálogo não liga nem desliga o Distrito ==");
  const CATTOK = () => L.GERAL(1002, ["pessoas"]);
  let r = await CAT({ nome: "Distrito Novo E2E", ativo: true }, CATTOK());
  ok(r.body.sucesso === false && /decreto da CLI/.test(r.body.mensagem), "criar já ativo: recusado", r.body);
  r = await CAT({ id: vazio, nome: "Distrito Vazio E2E", ativo: true }, CATTOK());
  ok(r.body.sucesso === false && !(await escalar("SELECT Ativo FROM Distritos WHERE DistritoId = @d", { d: vazio })), "ligar pelo cadastro: recusado", r.body);
  r = await CAT({ id: vazio, nome: "Distrito Vazio Renomeado E2E", ativo: false }, CATTOK());
  ok(r.body.sucesso === true, "renomear (sem mudar o ativo) continua possível", r.body);
  r = await CAT(undefined, CATTOK(), "DELETE", distrito);
  ok(r.body.sucesso === false && (await escalar("SELECT COUNT(*) FROM Distritos WHERE DistritoId = @d", { d: distrito })) === 1, "excluir Distrito com território: recusado", r.body);

  console.log("== ativação por decreto da CLI ==");
  const ativ = { distritoId: distrito, sessaoId: reuniao, gatilho: "MILHAO", cidade: "Belém", uf: "PA", populacao: "1.303.389", fontePopulacao: "IBGE, Censo 2022",
    fundamentacao: "A CLI decretou a elevação da base de Belém a Distrito, pela população da capital." };
  r = await POST("ativar", ativ, DIST(P.tesoureiro));
  ok(r.status === 403, "quem não é do nível geral não registra o decreto", r.body);
  r = await POST("ativar", ativ, SEC_SEM_FATOR());
  ok(r.status === 428, "sem a confirmação recente: 428", r.status);
  r = await POST("ativar", { ...ativ, distritoId: vazio });
  ok(r.status === 422 && /nenhuma congregação/.test(r.body.mensagem), "Distrito sem território: recusado", r.body);
  r = await POST("ativar", { ...ativ, sessaoId: reuniaoAberta });
  ok(r.status === 422 && /reunião da CLI/.test(r.body.mensagem), "reunião não encerrada: recusada", r.body);
  r = await POST("ativar", { ...ativ, populacao: "900000" });
  ok(r.status === 422 && /MAIS de 1\.000\.000/.test(r.body.mensagem), "gatilho (b) com menos de um milhão: recusado", r.body);
  ok(!(await escalar("SELECT Ativo FROM Distritos WHERE DistritoId = @d", { d: distrito })), "nada disso ativou o Distrito");
  r = guardar("ativar", await POST("ativar", ativ));
  ok(r.status === 200 && r.body.sucesso, "o nível geral registra o decreto", r.body);
  const per = await um("SELECT * FROM DistritoPeriodos WHERE DistritoId = @d AND DesativadoEm IS NULL", { d: distrito });
  ok(per && per.FinanceiroDesdeMes === mes && per.Gatilho === "MILHAO" && Number(per.Populacao) === 1303389 && per.Legado === false, "o período nasce com o decreto e o mês financeiro de hoje", per);
  ok((await escalar("SELECT Ativo FROM Distritos WHERE DistritoId = @d", { d: distrito })) === true, "o Distrito fica ativo");
  ok((await escalar("SELECT COUNT(*) FROM OrgaosLocais WHERE Nivel = 5 AND ReferenciaId = @d AND Sigla = N'CDE'", { d: distrito })) === 1, "o CDE do Distrito existe");
  r = await POST("ativar", ativ);
  ok(r.status === 422 && /já está ativo/.test(r.body.mensagem), "ativar de novo: recusado", r.body);
  r = await POST("ativar", { ...ativ, distritoId: legado, gatilho: "METROPOLE", populacao: null, fontePopulacao: null, cidade: "Manaus", uf: "AM" });
  ok(r.status === 200 && (await escalar("SELECT Legado FROM DistritoPeriodos WHERE DistritoId = @d AND DesativadoEm IS NULL", { d: legado })) === false
    && (await escalar("SELECT COUNT(*) FROM DistritoPeriodos WHERE DistritoId = @d", { d: legado })) === 1, "o Distrito legado ganha o decreto no mesmo período", r.body);
  const perLeg = await um("SELECT CONVERT(varchar(10), AtivadoEm, 120) AS Em, FinanceiroDesdeMes FROM DistritoPeriodos WHERE DistritoId = @d", { d: legado });
  ok(perLeg.FinanceiroDesdeMes === mes && perLeg.Em <= hojeBr(), "o decreto do legado vale do mês do registro em diante, com a data da reunião", perLeg);

  console.log("== o cadastro dos papéis reservados ==");
  const PAP = (corpo, id) => chamarRota("GestaoCatalogos/index.js", { metodo: "POST", binding: { catalogo: "papeis" }, token: L.GERAL(1002, ["permissoes"]), corpo: id ? { ...corpo, id } : corpo });
  r = await PAP({ nome: "Pastor Distrital Renomeado" }, await papelId("Pastor Distrital"));
  ok(r.body.sucesso === false && (await papelId("Pastor Distrital")), "o papel 'Pastor Distrital' não se renomeia", r.body);
  r = await PAP({ nome: "  pastor distrital ", nivel: "DISTRITO", permissoes: ["distritos"] });
  ok(r.body.sucesso === false && (await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome LIKE N'%astor %istrital%'")) === 1, "nenhum outro papel ganha o nome reservado", r.body);
  r = await PAP({ permissoes: ["reunioes", "pessoas", "distritos"] }, await papelId("Interventor Distrital"));
  ok(r.body.sucesso === true, "as permissões do papel reservado podem mudar", r.body);

  console.log("== o Pastor Distrital só pelo Presidente, em Liderança ==");
  const papelPastor = await papelId("Pastor Distrital");
  const dar = (membroId, extra = {}) => ({ membroId, papelId: papelPastor, escopoTipo: "DISTRITO", escopoId: distrito, senha: "NovaSenha#2026", ...extra });
  r = await LID(dar(P.pastor), SEC());
  ok(r.body.sucesso === false && /Pastor Presidente/.test(r.body.mensagem) && !(await escalar("SELECT COUNT(*) FROM Lideranca WHERE MembroId = @m", { m: P.pastor })), "o Secretário Geral não dá o papel", r.body);
  r = await LID(dar(P.presbitero), PRES());
  ok(r.body.sucesso === false && /cargo ministerial de Pastor/.test(r.body.mensagem), "quem não é Pastor: recusado", r.body);
  r = await LID(dar(P.pastor, { escopoId: vazio }), PRES());
  ok(r.body.sucesso === false && /Distrito ativo/.test(r.body.mensagem), "Distrito inativo: recusado", r.body);
  r = await LID(dar(P.pastor), PRES());
  ok(r.body.sucesso === true && (await vigente(P.pastor)) === 1, "o Presidente dá o acesso de Pastor Distrital", r.body);
  r = await LID(dar(P.outroPastor), PRES());
  ok(r.body.sucesso === false && /já tem Pastor Distrital/.test(r.body.mensagem), "um Pastor Distrital por Distrito", r.body);
  r = await LID(dar(P.pastor, { senha: "OutraSenha#2026" }), SEC());
  ok(r.body.sucesso === true, "a Secretaria redefine a senha (mesmo papel e escopo)", r.body);
  r = await LID(undefined, SEC(), "DELETE", P.pastor);
  ok(r.body.sucesso === false && (await vigente(P.pastor)) === 1, "a Secretaria não tira o Pastor Distrital", r.body);
  r = await LID({ membroId: P.interventor, papelId: await papelId("Interventor Distrital"), escopoTipo: "DISTRITO", escopoId: distrito, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === false && /intervenção aberta/.test(r.body.mensagem), "Interventor Distrital sem intervenção: recusado", r.body);

  console.log("== CLI: as cadeiras do Art. 6-A ==");
  let cli = await cliIds();
  // o Pastor Distrital já entra pela ordenação (é Pastor com a credencial em dia); o Superintendente e o Vice, sem cargo ministerial, só entram pela função
  ok(cli.has(P.pastor) && cli.has(P.superint) && cli.has(P.vice), "o Pastor Distrital, o Superintendente Regional e o Vice-Presidente de Quadrante estão na CLI", [...cli].filter((m) => m > 9500));
  ok(!cli.has(P.tesoureiro), "o Tesoureiro de Distrito não");
  const linhaVice = (await composicaoCLI(await obterPool(), await escalar("SELECT OrgaoId FROM Orgaos WHERE Sigla = N'CLI'"))).find((m) => Number(m.membroId) === P.vice);
  ok(linhaVice && linhaVice.viaFuncao && linhaVice.cargoOuFuncao === "Vice-Presidente de Quadrante" && linhaVice.congregacao === "Central E2E", "entra por função, com a congregação da pessoa", linhaVice);

  console.log("== o repasse do território fora do Rateio Geral ==");
  await fechar(central, mes, 1000);
  await fechar(beta, mes, 500);
  await fechar(central, mesAntes, 800);
  await fechar(vila, mesAntes, 300);   // a Vila Nova já fechava a tesouraria antes: o mês do Distrito a exige
  // uma congregação nova no território, que ainda nunca fechou a tesouraria: não trava o Dízimo
  const nova = await escalar("INSERT INTO Congregacoes (Nome, AreaId) OUTPUT INSERTED.CongregacaoId VALUES (N'Nova do Distrito E2E', @a)", { a: area1 });
  ok((await escalar("SELECT RepasseDistritoId FROM FechamentosTesouraria WHERE CongregacaoId = @c AND MesReferencia = @m", { c: central, m: mes })) === distrito
    && (await escalar("SELECT RepasseDistritoId FROM FechamentosTesouraria WHERE CongregacaoId = @c AND MesReferencia = @m", { c: central, m: mesAntes })) === null,
    "o fechamento grava o Distrito do repasse: o mês do decreto é dele, o de antes é da Sede");
  const RATEIO = (token) => chamarRota("GestaoRateioGeral/index.js", { metodo: "GET", binding: { id: "pendentes" }, token });
  r = await RATEIO(L.GERAL(1002, ["financeiro"]));
  const pend = (r.body && (r.body.itens || r.body.pendentes || r.body)) || [];
  const lista = Array.isArray(pend) ? pend : [];
  const tem = (c, m) => lista.some((i) => Number(i.congregacaoId) === Number(c) && i.mesReferencia === m);
  ok(tem(beta, mes) && tem(central, mesAntes) && !tem(central, mes), "o malote da Sede tem a Beta e o mês de antes do decreto, não o mês do Distrito", lista.map((i) => `${i.congregacaoId}:${i.mesReferencia}`));
  r = await chamarRota("RelatorioSituacaoTesouro/index.js", { token: L.GERAL(1002, ["financeiro"]) });
  const maloteEsperado = Number(await escalar(`SELECT ISNULL(SUM(f.ValorRepasseGeral), 0) FROM FechamentosTesouraria f WHERE f.Status = 'REPASSADO'
    AND NOT EXISTS (SELECT 1 FROM RateioGeralItens ri WHERE ri.FechamentoId = f.FechamentoId) AND NOT (f.CongregacaoId = @c AND f.MesReferencia = @m)`, { c: central, m: mes }));
  ok(r.body && r.body.malotePendente && Math.round(Number(r.body.malotePendente.totalBase) * 100) === Math.round(maloteEsperado * 100), "a situação do Tesouro também não conta o do Distrito",
    { resposta: r.body && r.body.malotePendente, maloteEsperado });
  r = await chamarRota("ListarFechamentosTesouraria/index.js", { token: L.GERAL(1002, ["financeiro"]), query: { mesReferencia: mes } });
  const fCentral = (r.body.fechamentos || []).find((f) => Number(f.congregacaoId) === Number(central));
  ok(fCentral && fCentral.repasseDistrito === "Distrito Belém E2E" && (r.body.repasseDistritos || []).length === 1 && Number(r.body.centroCustoGeral.pendente + r.body.centroCustoGeral.liberado) === 300,
    "a Tesouraria Local mostra o repasse ao Distrito, fora do Centro de Custo Geral", r.body.centroCustoGeral);
  r = await chamarRota("RelatorioTesouraria/index.js", { token: L.GERAL(1002, ["financeiro"]), query: { congregacaoId: central, mesReferencia: mesAntes } });
  ok(r.body.fechamento && r.body.fechamento.repasseDistrito === null, "o mês de antes do decreto continua da Sede", r.body.fechamento);

  console.log("== o Dízimo Institucional calculado ==");
  const REP = (corpo) => chamarRota("GestaoRepassesInstitucionais/index.js", { metodo: "POST", binding: {}, token: L.GERAL(1002, ["financeiro"]), corpo });
  r = await REP({ origemTipo: "DISTRITO", origemId: distrito, mesReferencia: mes, valorArrecadadoLiquido: 999999 });
  ok(r.status === 400 && /Vila Nova E2E/.test(r.body.mensagem) && !/Nova do Distrito/.test(r.body.mensagem), "falta o fechamento da Vila Nova: recusado, dizendo quem falta (a congregação nova não é cobrada)", r.body);
  r = await REP({ origemTipo: "DISTRITO", origemId: distrito, mesReferencia: mesAntes });
  ok(r.status === 400 && /não estava ativo/.test(r.body.mensagem), "mês de antes do decreto: recusado", r.body);
  await fechar(vila, mes, 700.55);
  r = guardar("fichaApuravel", await GET("ficha", { distritoId: distrito }));
  const mAtual = r.body.distrito.financeiro.meses.find((m) => m.mes === mes);
  ok(mAtual && mAtual.situacao === "APURAVEL" && mAtual.soma === 1700.55 && mAtual.valor === 170.06, "a ficha mostra o mês apurável com a soma e os 10%", mAtual);
  r = await REP({ origemTipo: "DISTRITO", origemId: distrito, origemNome: "nome digitado", mesReferencia: mes, valorArrecadadoLiquido: 1 });
  const rep = await um("SELECT * FROM RepassesInstitucionais WHERE OrigemTipo = N'DISTRITO' AND OrigemId = @d AND MesReferencia = @m", { d: distrito, m: mes });
  ok(r.status === 201 && rep && Number(rep.ValorArrecadadoLiquido) === 1700.55 && Number(rep.ValorRepasse) === 170.06 && rep.OrigemNome === "Distrito Belém E2E",
    "o registro usa o valor calculado (o digitado não vale) e o nome do cadastro", rep);
  const saldoAntes = await tesouraria.saldoCentroCusto(await obterPool(), L.sql, "GERAL", null);
  r = await chamarRota("GestaoRepassesInstitucionais/index.js", { metodo: "PUT", binding: {}, token: L.GERAL(1002, ["financeiro"]), corpo: { repasseId: rep.RepasseId, acao: "REPASSAR" } });
  const saldoDepois = await tesouraria.saldoCentroCusto(await obterPool(), L.sql, "GERAL", null);
  ok(r.body.sucesso && Math.round((saldoDepois - saldoAntes) * 100) === 17006, "repassado, o Dízimo Institucional entra no saldo do Tesouro Geral", { saldoAntes, saldoDepois });
  r = await GET("ficha", { distritoId: distrito });
  ok(r.body.distrito.financeiro.meses.find((m) => m.mes === mes).situacao === "REPASSADO", "a ficha mostra o mês repassado");
  const cx = r.body.distrito.financeiro.caixa;
  ok(cx && Math.round(cx.recebido * 100) === Math.round((600 + 420.33) * 100) && Math.round(cx.dizimoRepassado * 100) === 17006 && Math.round(cx.saldo * 100) === Math.round((1020.33 - 170.06) * 100),
    "o caixa do Distrito: o repasse das congregações dele menos o Dízimo repassado", cx);
  r = await chamarRota("RelatorioSituacaoTesouro/index.js", { token: L.GERAL(1002, ["financeiro"]) });
  ok((r.body.porDistrito || []).some((x) => x.distritoId === distrito && Math.round(x.saldo * 100) === Math.round(cx.saldo * 100)), "e a situação do Tesouro mostra o caixa do Distrito à parte", r.body.porDistrito);
  // mudar o território depois não reescreve o passado: a Área sai do Distrito e o mês continua dele
  await q("UPDATE Areas SET RegiaoId = NULL WHERE AreaId = @a", { a: area1 });
  r = await GET("ficha", { distritoId: distrito });
  const depoisDaMudanca = r.body.distrito.financeiro.meses.find((m) => m.mes === mes);
  r = await RATEIO(L.GERAL(1002, ["financeiro"]));
  ok(depoisDaMudanca.soma === 1700.55 && !(r.body.itens || r.body.pendentes || r.body || []).some((i) => Number(i.congregacaoId) === Number(central) && i.mesReferencia === mes),
    "a Área tirada do Distrito: o mês já fechado continua do Distrito e fora do malote da Sede", depoisDaMudanca);
  await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = @a", { r: regiao, a: area1 });

  console.log("== balanço anual ao NIF ==");
  // o Distrito estava ativo desde novembro do ano passado (para haver um ano terminado)
  const anoPassado = Number(hojeBr().slice(0, 4)) - 1;
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND DesativadoEm IS NULL", { m: `${anoPassado}-11`, d: distrito });
  const bal = { distritoId: distrito, ano: anoPassado, receitas: "120.000,00", despesas: "95.500,50", saldoFinal: "24.499,50", observacoes: "Balanço consolidado da metrópole." };
  r = await POST("balanco", bal, SEC());
  ok(r.status === 403, "o nível geral não envia o balanço do Distrito", r.body);
  r = await POST("balanco", { ...bal, ano: anoPassado + 1 }, DIST(P.tesoureiro));
  ok(r.status === 422, "o ano corrente ainda não tem balanço", r.body);
  r = guardar("fichaDistritoEnvio", await GET("ficha", { distritoId: distrito }, DIST(P.tesoureiro)));
  ok(r.body.distrito.acoes.enviarBalanco && r.body.distrito.anosParaBalanco.includes(anoPassado) && !r.body.distrito.acoes.desativar, "a ficha da Tesoureira: enviar o balanço do ano passado, sem os decretos");
  r = guardar("balancoEnviado", await POST("balanco", bal, DIST(P.tesoureiro)));
  ok(r.status === 200 && r.body.sucesso, "a Tesoureira do Distrito envia o balanço", r.body);
  guardar("catalogosNIF", await GET("catalogos", {}, NIF()));
  r = guardar("fichaNIF", await GET("ficha", { distritoId: distrito }, NIF()));
  ok(r.body.distrito.acoes.analisarBalanco && r.body.distrito.balancos.some((b) => b.status === "ENVIADO") && !r.body.distrito.acoes.enviarBalanco, "a ficha do NIF: analisar o balanço enviado");
  r = await POST("balanco", bal, DIST(P.pastor));
  ok(r.status === 422 && /já está com o NIF/.test(r.body.mensagem), "dois balanços vivos do mesmo ano: recusado", r.body);
  const b1 = await escalar("SELECT BalancoId FROM DistritoBalancos WHERE DistritoId = @d AND Ano = @a AND Versao = 1", { d: distrito, a: anoPassado });
  r = await POST("analisar", { balancoId: b1, decisao: "APROVAR" }, DIST(P.tesoureiro));
  ok(r.status === 403, "quem é do Distrito não analisa (só o NIF)", r.body);
  r = await POST("analisar", { balancoId: b1, decisao: "DEVOLVER" }, NIF());
  ok(r.status === 422, "devolver sem o motivo: recusado", r.body);
  r = await POST("analisar", { balancoId: b1, decisao: "DEVOLVER", motivo: "Falta o extrato de dezembro." }, NIF());
  ok(r.body.sucesso && (await escalar("SELECT Status FROM DistritoBalancos WHERE BalancoId = @b", { b: b1 })) === "DEVOLVIDO", "o NIF devolve com o motivo", r.body);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = N'DISTRITO_BALANCO_ANALISADO' AND DestinatarioMembroId = @m", { m: P.tesoureiro })) >= 1, "quem enviou é avisado");
  r = await POST("balanco", { ...bal, observacoes: "Com o extrato de dezembro." }, DIST(P.tesoureiro));
  const b2 = await escalar("SELECT BalancoId FROM DistritoBalancos WHERE DistritoId = @d AND Ano = @a AND Versao = 2", { d: distrito, a: anoPassado });
  ok(r.body.sucesso && b2, "reenviado: versão 2 (a primeira fica)", r.body);
  r = await POST("analisar", { balancoId: b2, decisao: "APROVAR" }, NIF());
  ok(r.body.sucesso && (await escalar("SELECT Status FROM DistritoBalancos WHERE BalancoId = @b", { b: b2 })) === "APROVADO", "o NIF aprova", r.body);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = N'DISTRITO_BALANCO_ANALISADO' AND DestinatarioMembroId = @m", { m: P.tesoureiro })) === 2,
    "o aviso da aprovação também chega (não é descartado como repetido da devolução)");
  r = await POST("analisar", { balancoId: b2, decisao: "APROVAR" }, NIF());
  ok(r.status === 422, "analisar de novo: recusado", r.body);
  // o atraso: um ano anterior sem balanço depois de 31/03
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND DesativadoEm IS NULL", { m: `${anoPassado - 1}-06`, d: distrito });
  let fatos = await diDb.detectarBalancoAtrasado(await obterPool(), { hoje: hojeBr() });
  ok(fatos.some((f) => f.referenciaId === (anoPassado - 1) * 10000 + distrito && f.destinatarios.some((d) => Number(d.membroId) === P.tesoureiro)),
    "o balanço de um ano sem envio depois de 31/03 vira aviso para o Distrito", fatos.map((f) => f.referenciaId));
  // o Dízimo vencido: três meses atrás as duas fecharam para o Distrito e ninguém repassou (retenção); dois meses atrás a Vila não fechou (falta fechamento)
  const m3 = di.mesAnterior(di.mesAnterior(mesAntes)), m2 = di.mesAnterior(mesAntes);
  await fechar(central, m3, 400); await fechar(vila, m3, 100); await fechar(central, m2, 200);
  fatos = await diDb.detectarRepasseVencido(await obterPool(), { hoje: hojeBr() });
  // a referência: ((AAAAMM − 200000) × 10000 + Distrito) × 10 + o código do motivo (Trava 9-A)
  const fatoDe = (m) => fatos.find((f) => Math.floor(f.referenciaId / 10) === (Number(m.replace("-", "")) - 200000) * 10000 + distrito);
  ok(fatoDe(m3) && /Art\. 126-N, III/.test(fatoDe(m3).fatoGerador) && fatoDe(m2) && /falta fechar/.test(fatoDe(m2).fatoGerador) && !/intervenção/.test(fatoDe(m2).fatoGerador)
    && new Set(fatos.map((f) => f.referenciaId)).size === fatos.length, "o mês retido fala em intervenção; o que falta fechar só pede o fechamento", fatos.map((f) => f.fatoGerador.slice(0, 70)));
  ok(!fatos.some((f) => /Nova do Distrito/.test(f.fatoGerador)), "a congregação nova não aparece como faltando");
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND DesativadoEm IS NULL", { m: mes, d: distrito });

  console.log("== painel, lista, ficha e quem vê o quê ==");
  r = guardar("catalogosGeral", await GET("catalogos"));
  ok(r.body.papeis.geral === true && r.body.papeis.presidente === false && r.body.gatilhos.MILHAO, "catálogos do Secretário Geral", r.body.papeis);
  r = guardar("catalogosDistrito", await GET("catalogos", {}, DIST(P.tesoureiro)));
  ok(r.body.papeis.geral === false && r.body.papeis.distritos.includes(distrito), "a Tesoureira é do Distrito dela", r.body.papeis);
  r = guardar("listaDistrito", await GET("lista", {}, DIST(P.tesoureiro)));
  ok(r.body.distritos.length === 1 && r.body.distritos[0].distritoId === distrito, "quem é do Distrito vê só o dele", r.body.distritos.map((d) => d.nome));
  r = await GET("ficha", { distritoId: legado }, DIST(P.tesoureiro));
  ok(r.status === 404, "a ficha de outro Distrito: 404", r.status);
  r = guardar("listaNIF", await GET("lista", {}, NIF()));
  ok(r.body.distritos.length >= 3, "o NIF vê todos", r.body.distritos.length);
  r = guardar("painelGeral", await GET("painel"));
  ok(r.status === 200 && r.body.distritos.some((d) => d.distritoId === distrito), "o painel do nível geral", r.body.total);
  r = guardar("fichaGeral", await GET("ficha", { distritoId: distrito }));
  ok(r.body.distrito.acoes.desativar === true && r.body.distrito.acoes.intervir === false && r.body.distrito.cde.pastor.length === 1
    && r.body.distrito.cde.superintendentes.length === 1 && r.body.distrito.cde.vices.length === 1, "a ficha: as ações do nível geral e o CDE calculado", r.body.distrito.acoes);
  ok(!JSON.stringify(r.body).includes("@exemplo.org"), "a ficha não leva e-mail de ninguém");
  r = guardar("fichaPresidente", await GET("ficha", { distritoId: distrito }, PRES()));
  ok(r.body.distrito.acoes.intervir === true, "o Presidente vê o botão da intervenção");
  r = await GET("reunioes", {}, DIST(P.tesoureiro));
  ok(r.status === 403, "as reuniões da CLI são do nível geral");
  r = guardar("reunioes", await GET("reunioes"));
  ok(r.body.reunioes.some((s) => s.sessaoId === reuniao) && !r.body.reunioes.some((s) => s.sessaoId === reuniaoAberta), "só as reuniões encerradas");

  console.log("== intervenção imediata ==");
  const sidDe = {};
  for (const m of [P.pastor, P.tesoureiro, P.delegado, 3001]) { sidDe[m] = crypto.randomUUID(); await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, @m)", { s: sidDe[m], m }); }
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, 1001)", { s: crypto.randomUUID() });
  const tesLid = await escalar("SELECT LiderancaId FROM Lideranca WHERE MembroId = @m", { m: P.tesoureiro });
  await q("INSERT INTO DelegacoesAcesso (LiderancaId, DeleganteMembroId, DelegadoMembroId, DataInicio, DataFim, Motivo) VALUES (@l, @de, @dd, @i, @f, N'férias')",
    { l: tesLid, de: P.tesoureiro, dd: P.delegado, i: hojeBr(), f: `${Number(hojeBr().slice(0, 4)) + 1}-01-01` });
  const iv = { distritoId: distrito, motivo: "DESVINCULACAO", fundamentacao: "O Pastor Distrital registrou estatuto próprio em cartório, sem a Sede.", interventorMembroId: P.interventor,
    bloqueioContas: true, procuracao: true };
  r = await POST("intervir", iv, SEC());
  ok(r.status === 403 && /Pastor Presidente/.test(r.body.mensagem), "o Secretário Geral não decreta a intervenção", r.body);
  r = await POST("intervir", iv, PRES_SEM_FATOR());
  ok(r.status === 428, "sem a confirmação recente: 428", r.status);
  r = await POST("intervir", { ...iv, interventorMembroId: P.sobProcesso }, PRES());
  ok(r.status === 422 && /processo/.test(r.body.mensagem), "Interventor sob processo: recusado", r.body);
  r = await POST("intervir", { ...iv, interventorMembroId: 3003 }, PRES());
  ok(r.status === 422 && /já tem o cargo/.test(r.body.mensagem), "Interventor que já tem outro cargo (o Pastor de Área): recusado, para não trocar o cargo dele", r.body);
  r = await POST("intervir", { ...iv, interventorMembroId: 1001 }, PRES());
  ok(r.status === 422 && /já tem o cargo/.test(r.body.mensagem) && (await vigente(1001)) === 1, "o próprio Presidente como Interventor: recusado (perderia o acesso geral)", r.body);
  r = await POST("intervir", { ...iv, interventorMembroId: P.superint }, PRES());
  ok(r.status === 422 && /liderança do Distrito/.test(r.body.mensagem), "Interventor da liderança destituída: recusado", r.body);
  r = guardar("intervir", await POST("intervir", iv, PRES()));
  ok(r.status === 200 && r.body.sucesso && r.body.destituidos === 4, "o Presidente decreta: 4 acessos da liderança distrital encerrados", r.body);
  r = guardar("fichaSobIntervencao", await GET("ficha", { distritoId: distrito }, PRES()));
  ok(r.body.distrito.acoes.encerrarIntervencao && !r.body.distrito.acoes.intervir && r.body.distrito.sinais.intervencaoSemInterventorComAcesso, "a ficha sob intervenção: encerrar, e o aviso do acesso do Interventor");
  const fora = [];
  for (const m of [P.pastor, P.tesoureiro, P.superint, P.vice]) if ((await vigente(m)) !== 0) fora.push(m);
  ok(fora.length === 0, "o Pastor, a Tesoureira, o Superintendente e o Vice saíram (AtivoAte = ontem)", fora);
  ok((await vigente(3001)) === 1 && (await vigente(3002)) === 1 && (await vigente(3003)) === 1, "Dirigentes e o Pastor de Área não são tocados");
  ok((await escalar("SELECT Status FROM DelegacoesAcesso WHERE LiderancaId = @l", { l: tesLid })) === "CANCELADA", "a delegação do cargo destituído foi cancelada");
  ok((await escalar("SELECT COUNT(*) FROM SessoesAtivas WHERE SessaoId IN (@a, @b, @c) AND Encerrada = 1", { a: sidDe[P.pastor], b: sidDe[P.tesoureiro], c: sidDe[P.delegado] })) === 3
    && (await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: sidDe[3001] })) === false, "caíram as sessões dos destituídos e do delegado, não as dos outros");
  cli = await cliIds();
  ok(!cli.has(P.superint) && !cli.has(P.vice), "o Superintendente e o Vice saíram da CLI (o Pastor continua pela ordenação)");
  r = await POST("intervir", iv, PRES());
  ok(r.status === 422, "uma intervenção aberta por Distrito", r.body);
  r = await POST("desativar", { distritoId: distrito, sessaoId: reuniao, motivo: "A CLI desativou o Distrito." });
  ok(r.status === 422 && /intervenção/.test(r.body.mensagem), "não se desativa durante a intervenção", r.body);
  const papelInterv = await papelId("Interventor Distrital");
  r = await LID({ membroId: P.pastor, papelId: await papelId("Tesoureiro de Distrito"), escopoTipo: "DISTRITO", escopoId: distrito, duracaoMeses: 12 }, SEC());
  ok(r.body.sucesso === false && /sob intervenção/.test(r.body.mensagem) && (await vigente(P.pastor)) === 0, "durante a intervenção a Secretaria não recoloca o destituído por outro papel do Distrito", r.body);
  r = await LID({ membroId: P.superint, papelId: await papelId("Superintendente Regional"), escopoTipo: "REGIAO", escopoId: regiao, duracaoMeses: 12 }, SEC());
  ok(r.body.sucesso === false && /sob intervenção/.test(r.body.mensagem), "nem o Superintendente de uma Região do território", r.body);
  r = await LID({ membroId: P.interventor, papelId: papelInterv, escopoTipo: "DISTRITO", escopoId: distrito, senha: "NovaSenha#2026" }, SEC());
  ok(r.body.sucesso === false, "o acesso do Interventor não é dado pela Secretaria", r.body);
  r = await LID({ membroId: P.outroPastor, papelId: papelInterv, escopoTipo: "DISTRITO", escopoId: distrito, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === false && /pessoa nomeada/.test(r.body.mensagem), "só a pessoa nomeada recebe o acesso de Interventor", r.body);
  r = await LID({ membroId: P.interventor, papelId: papelInterv, escopoTipo: "DISTRITO", escopoId: distrito, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === true && (await vigente(P.interventor)) === 1, "o Presidente dá o acesso ao Interventor", r.body);
  r = await LID(dar(P.outroPastor), PRES());
  ok(r.body.sucesso === false && /sob intervenção/.test(r.body.mensagem), "não se nomeia Pastor Distrital durante a intervenção", r.body);
  r = await GET("ficha", { distritoId: distrito }, DIST(P.interventor));
  ok(r.status === 200 && r.body.distrito.intervencoes[0].aberta && r.body.distrito.cde.interventor.length === 1, "o Interventor vê a ficha do Distrito");
  r = await POST("encerrar", { distritoId: distrito, resultado: "O estatuto paralelo foi anulado e as contas regularizadas." }, SEC());
  ok(r.status === 403, "o Secretário Geral não encerra", r.body);
  const sidInterv = crypto.randomUUID();
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, @m)", { s: sidInterv, m: P.interventor });
  r = guardar("encerrar", await POST("encerrar", { distritoId: distrito, resultado: "O estatuto paralelo foi anulado e as contas regularizadas." }, PRES()));
  ok(r.body.sucesso && (await vigente(P.interventor)) === 0 && (await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: sidInterv })) === true,
    "o Presidente encerra: o acesso do Interventor termina e a sessão cai", r.body);
  r = await LID(dar(P.pastor, { duracaoMeses: 24 }), SEC());
  ok(r.body.sucesso === false && (await vigente(P.pastor)) === 0, "renovar o mandato vencido do Pastor Distrital é dar o papel: a Secretaria não pode", r.body);
  r = await LID(dar(P.pastor, { duracaoMeses: 24 }), PRES());
  ok(r.body.sucesso === true && (await vigente(P.pastor)) === 1, "o Presidente devolve o Pastor Distrital depois da intervenção", r.body);

  console.log("== desativação por decreto da CLI ==");
  const reuniaoFim = await sessaoCLI("CLI desativa o Distrito E2E", hojeBr());
  r = await POST("desativar", { distritoId: distrito, sessaoId: reuniaoFim, motivo: "A base de Belém volta a ser administrada pela Sede." }, DIST(P.pastor));
  ok(r.status === 403, "o Distrito não se desativa sozinho", r.body);
  const sidPastor = crypto.randomUUID();
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, @m)", { s: sidPastor, m: P.pastor });
  r = guardar("desativar", await POST("desativar", { distritoId: distrito, sessaoId: reuniaoFim, motivo: "A base de Belém volta a ser administrada pela Sede." }));
  const perFim = await um("SELECT * FROM DistritoPeriodos WHERE DistritoId = @d AND Legado = 0 ORDER BY PeriodoId DESC", { d: distrito });
  // Trava 9-A — o Dízimo deste mês já foi registrado (acima): o mês continua do Distrito e a Sede volta a receber no mês seguinte
  ok(r.body.sucesso && perFim.FinanceiroAteMes === di.proximoMes(mes) && (await escalar("SELECT Ativo FROM Distritos WHERE DistritoId = @d", { d: distrito })) === false,
    "desativado: o período fecha no mês seguinte ao último Dízimo registrado", perFim);
  ok((await vigente(P.pastor)) === 0 && (await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: sidPastor })) === true, "o acesso de escopo do Distrito termina e a sessão cai");
  r = await RATEIO(L.GERAL(1002, ["financeiro"]));
  ok(!(r.body.itens || r.body.pendentes || r.body || []).some((i) => Number(i.congregacaoId) === Number(central) && i.mesReferencia === mes)
    && (await escalar("SELECT RepasseDistritoId FROM FechamentosTesouraria WHERE CongregacaoId = @c AND MesReferencia = @m", { c: central, m: mes })) === distrito,
    "o mês com o Dízimo registrado não volta para o malote da Sede (o registro não fica órfão)");
  r = await POST("desativar", { distritoId: distrito, sessaoId: reuniaoFim, motivo: "A base de Belém volta a ser administrada pela Sede." });
  ok(r.status === 422, "desativar de novo: recusado", r.body);
  const reuniaoVelha = await sessaoCLI("CLI antiga E2E", "2020-01-10");
  r = await POST("ativar", { ...ativ, sessaoId: reuniaoVelha });
  ok(r.status === 422 && /anterior à última desativação/.test(r.body.mensagem), "reativar com reunião anterior à desativação: recusado", r.body);
  r = await GET("ficha", { distritoId: distrito });
  ok(r.body.distrito.periodos.length === 1 && r.body.distrito.periodos[0].desativadoEm, "o período desativado fica no histórico");
  guardar("fichaDesativada", r);
  ok(r.body.distrito.acoes.ativar && !r.body.distrito.acoes.desativar, "desativado: o nível geral pode ativar de novo");
  // desativado, ninguém tem escopo dele: o balanço que ficou devendo é enviado pelo nível geral
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND Legado = 0", { m: `${anoPassado - 1}-06`, d: distrito });
  r = await GET("ficha", { distritoId: distrito });
  ok(r.body.distrito.acoes.enviarBalanco && r.body.distrito.anosParaBalanco.includes(anoPassado - 1), "o Distrito desativado: o nível geral vê o balanço devido");
  r = await POST("balanco", { ...bal, ano: anoPassado - 1 });
  ok(r.body.sucesso === true, "e envia ao NIF", r.body);
  await q("UPDATE DistritoPeriodos SET FinanceiroDesdeMes = @m WHERE DistritoId = @d AND Legado = 0", { m: mes, d: distrito });

  console.log("== garantias do banco ==");
  await falhaNoBanco("gatilho (b) com menos de um milhão", `INSERT INTO DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes, AtivacaoSessaoId, Gatilho, Cidade, UF, Populacao, FontePopulacao, Fundamentacao, AtivacaoRegistradaPor)
    VALUES (@d, 0, @h, @m, @s, N'MILHAO', N'X', 'PA', 900000, N'IBGE', N'Fundamentação qualquer.', 1002)`, { d: vazio, h: hojeBr(), m: mes, s: reuniao });
  await falhaNoBanco("decreto pela metade", `INSERT INTO DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes, Gatilho) VALUES (@d, 0, @h, @m, N'METROPOLE')`, { d: vazio, h: hojeBr(), m: mes });
  await falhaNoBanco("dois períodos abertos no mesmo Distrito", `INSERT INTO DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes) VALUES (@d, 1, @h, @m)`, { d: legado, h: hojeBr(), m: mes });
  await falhaNoBanco("desativação antes da ativação", `UPDATE DistritoPeriodos SET DesativadoEm = '2000-01-01', FinanceiroAteMes = FinanceiroDesdeMes, DesativacaoSessaoId = @s, DesativacaoMotivo = N'x',
    DesativacaoRegistradaPor = 1002 WHERE DistritoId = @d`, { d: legado, s: reuniao });
  await falhaNoBanco("mês financeiro malformado", `UPDATE DistritoPeriodos SET FinanceiroDesdeMes = '2026-1' WHERE DistritoId = @d`, { d: legado });
  await falhaNoBanco("motivo de intervenção fora do catálogo", `INSERT INTO DistritoIntervencoes (DistritoId, Motivo, Fundamentacao, InterventorMembroId, DecretadaEm, DecretadaPor) VALUES (@d, N'VINGANCA', N'x', @i, @h, 1001)`,
    { d: legado, i: P.interventor, h: hojeBr() });
  await q(`INSERT INTO DistritoIntervencoes (DistritoId, Motivo, Fundamentacao, InterventorMembroId, DecretadaEm, DecretadaPor) VALUES (@d, N'OUTRA', N'Fundamentação.', @i, @h, 1001)`, { d: legado, i: P.interventor, h: hojeBr() });
  await falhaNoBanco("duas intervenções abertas", `INSERT INTO DistritoIntervencoes (DistritoId, Motivo, Fundamentacao, InterventorMembroId, DecretadaEm, DecretadaPor) VALUES (@d, N'OUTRA', N'Fundamentação.', @i, @h, 1001)`,
    { d: legado, i: P.interventor, h: hojeBr() });
  await falhaNoBanco("encerramento sem resultado", `UPDATE DistritoIntervencoes SET EncerradaEm = @h, EncerradaPor = 1001 WHERE DistritoId = @d`, { d: legado, h: hojeBr() });
  await q("DELETE FROM DistritoIntervencoes WHERE DistritoId = @d", { d: legado });
  await falhaNoBanco("balanço analisado por quem enviou", `UPDATE DistritoBalancos SET Status = N'ENVIADO', AnalisadoPor = NULL, AnalisadoEm = NULL WHERE BalancoId = @b;
    UPDATE DistritoBalancos SET Status = N'APROVADO', AnalisadoPor = EnviadoPor, AnalisadoEm = SYSUTCDATETIME() WHERE BalancoId = @b`, { b: b2 });
  await falhaNoBanco("devolvido sem motivo", `UPDATE DistritoBalancos SET Status = N'DEVOLVIDO', MotivoDevolucao = NULL WHERE BalancoId = @b`, { b: b1 });
  await falhaNoBanco("dois balanços vivos do mesmo ano", `INSERT INTO DistritoBalancos (DistritoId, Ano, Versao, Receitas, Despesas, SaldoFinal, Status, EnviadoPor) VALUES (@d, @a, 9, 1, 1, 0, N'ENVIADO', @m)`,
    { d: distrito, a: anoPassado, m: P.tesoureiro });
  await falhaNoBanco("receita negativa", `INSERT INTO DistritoBalancos (DistritoId, Ano, Versao, Receitas, Despesas, SaldoFinal, Status, EnviadoPor) VALUES (@d, 2001, 1, -1, 1, 0, N'ENVIADO', @m)`,
    { d: distrito, m: P.tesoureiro });

  console.log("== segurança ==");
  r = await rota("painel", {});
  ok(r.status === 401, "sem login: 401", r.status);
  r = await GET("painel", {}, PINM());
  ok(r.status === 403, "sessão por PIN: 403", r.status);
  r = await GET("painel", {}, DIR());
  ok(r.status === 403, "sem a permissão 'distritos': 403", r.status);
  r = await GET("acao-que-nao-existe");
  ok(r.status === 404, "ação inexistente: 404");
  r = await rota("painel", { metodo: "DELETE", token: SEC() });
  ok(r.status === 405, "método não suportado: 405");
  r = await GET("ficha", { distritoId: "0x1" });
  ok(r.status === 400, "id malformado: 400");
  await fuzz("ativar", "ativar", { ...ativ, distritoId: vazio }, ["distritoId", "sessaoId", "gatilho", "cidade", "uf", "populacao", "fontePopulacao", "fundamentacao"]);
  await fuzz("desativar", "desativar", { distritoId: vazio, sessaoId: reuniaoFim, motivo: "Motivo de teste do lixo." }, ["distritoId", "sessaoId", "motivo"]);
  await fuzz("intervir", "intervir", { ...iv, distritoId: vazio }, ["distritoId", "motivo", "fundamentacao", "interventorMembroId", "bloqueioContas", "procuracao", "judicial"], PRES());
  await fuzz("encerrar", "encerrar", { distritoId: vazio, resultado: "Resultado de teste do lixo." }, ["distritoId", "resultado"], PRES());
  await fuzz("balanco", "balanco", { ...bal, ano: 2001 }, ["distritoId", "ano", "receitas", "despesas", "saldoFinal", "observacoes"], DIST(P.tesoureiro));
  await fuzz("analisar", "analisar", { balancoId: b2, decisao: "DEVOLVER", motivo: "Motivo de teste do lixo." }, ["balancoId", "decisao", "motivo"], NIF());

  console.log("== Meus Dados ==");
  const t = await diDb.dadosDoTitular(await obterPool(), P.tesoureiro);
  ok(t.balancosEnviados.length === 2 && t.balancosEnviados[0].ano === anoPassado, "a Tesoureira vê os balanços que enviou", t);
  const iT = await diDb.dadosDoTitular(await obterPool(), P.interventor);
  ok(iT.intervencoesComoInterventor.length === 1 && iT.intervencoesComoInterventor[0].encerradaEm, "o Interventor vê a intervenção", iT);

  if (process.env.E2E_CONTRATO === "1") {
    const destino = path.join(__dirname, "..", "front-distritos", "contrato-real.json");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log("contrato gravado em", destino);
  }
  fim("e2e-73 distritos");
})().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
