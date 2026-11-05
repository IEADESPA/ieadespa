// e2e-75-trava9a.js — Trava de Revisão 9-A (v9.1 a v9.3): as correções das duas revisões independentes, com os handlers e o banco REAIS, sobre a base
// "cenario-trava9a" (`bash rodar.sh preparar-trava9a`: a base da v9.3 com a 168 aplicada duas vezes). Monta o próprio cenário.
// A vacância que tira o Encarregado e o dirigente de entidade; a direção de entidade só em comunhão e sem licença; a exoneração só pelo Presidente; o Pastor
// Distrital que não troca cargo em silêncio nem vale em Distrito legado; os papéis de nome protegido; a Área, a Região e o Quadrante em uso; o território parado
// na intervenção; a troca do Interventor; a Extensão desativada pelo cadastro; a emancipação no território da Mãe; o CDE calculado na reunião; Meus Dados; a
// desativação com o Dízimo já registrado; a referência do aviso por motivo; a CME sem acesso à tela; a retenção sem prazo final.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr } = L;
const { chamarRota } = require("./lib-afm");
const crypto = require("crypto");

console.error = () => { };
const di = require(path.join(API, "shared/distritos.js"));
const diDb = require(path.join(API, "shared/distritosDb.js"));
const exDb = require(path.join(API, "shared/expansaoDb.js"));
const ev = require(path.join(API, "shared/entidadesVinculadas.js"));
const { encerrarVinculos } = require(path.join(API, "shared/vacancia.js"));
const { universoDoOrgao } = require(path.join(API, "shared/universo.js"));
const DST = (acao, corpo, token) => chamarRota("GestaoDistritos/index.js", { metodo: "POST", binding: { acao }, token, corpo });
const ENT = (acao, corpo, token) => chamarRota("GestaoEntidadesVinculadas/index.js", { metodo: "POST", binding: { acao }, token, corpo });
const LID = (corpo, token) => chamarRota("GestaoLideranca/index.js", { metodo: "POST", binding: {}, token, corpo });
const CAT = (catalogo, corpo, token, metodo = "POST", id) => chamarRota("GestaoCatalogos/index.js", { metodo, binding: { catalogo, ...(id ? { id: String(id) } : {}) }, token, corpo });
const SEC = () => L.GERAL(1002, ["distritos", "permissoes", "pessoas", "entidades_vinculadas", "expansao", "financeiro"]);
const PRES = () => L.GERAL(1001, ["distritos", "permissoes", "entidades_vinculadas"]);
const mes = di.mesDe(hojeBr());
const papelId = (nome) => escalar("SELECT PapelId FROM Papeis WHERE Nome = @n", { n: nome });
const vigente = async (m) => escalar("SELECT CASE WHEN AtivoAte IS NULL OR AtivoAte >= CAST(SYSUTCDATETIME() AS DATE) THEN 1 ELSE 0 END FROM Lideranca WHERE MembroId = @m", { m });
function cnpjAlfa(raiz) { for (let d = 0; d < 100; d++) { const c = `${raiz}0001${String(d).padStart(2, "0")}`; if (ev.validarCnpj(c, { matriz: true }).valido) return c; } return null; }
const P = { enc: 9701, conselheiro: 9702, diretor: 9703, licenciado: 9704, pastorArea: 9705, pastorLeg: 9706, interv1: 9707, interv2: 9708, encExt: 9709, escopoExt: 9710, sob: 9711 };

(async () => {
  await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const beta = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  const area1 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Alfa E2E'");
  const area2 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Beta E2E'");
  for (const [id, nome, cargo, status] of [[P.enc, "Encarregado Trava E2E", null, "ATIVO"], [P.conselheiro, "Conselheiro Trava E2E", null, "ATIVO"], [P.diretor, "Diretor Trava E2E", null, "ATIVO"],
    [P.licenciado, "Licenciado Trava E2E", null, "LICENCA_CANDIDATURA"], [P.pastorArea, "Pastor Area Trava E2E", "PASTOR", "ATIVO"], [P.pastorLeg, "Pastor Leg Trava E2E", "PASTOR", "ATIVO"],
    [P.interv1, "Interventor Um Trava E2E", null, "ATIVO"], [P.interv2, "Interventor Dois Trava E2E", null, "ATIVO"], [P.encExt, "Encarregado Ext Trava E2E", null, "ATIVO"],
    [P.escopoExt, "Escopo Ext Trava E2E", null, "ATIVO"], [P.sob, "Sob Processo Trava E2E", null, "ATIVO"]]) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, CargoMinisterial, DataNascimento, Email) VALUES (@id, @n, @c, @s, 'EM_COMUNHAO', @cargo, '1980-01-01', @em)",
      { id, n: nome, c: central, s: status, cargo, em: `p${id}@exemplo.org` });
  }
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.sob, d: hojeBr() });
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  const dist = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Trava E2E', 0)");
  const quad = await escalar("INSERT INTO Quadrantes (Nome, Ativo, DistritoId) OUTPUT INSERTED.QuadranteId VALUES (N'Quadrante Trava E2E', 1, @d)", { d: dist });
  const regiao = await escalar("INSERT INTO Regioes (Nome, Ativa, QuadranteId) OUTPUT INSERTED.RegiaoId VALUES (N'Região Trava E2E', 1, @q)", { q: quad });
  await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = @a", { r: regiao, a: area1 });
  const dist2 = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Outro Trava E2E', 0)");
  const quad2 = await escalar("INSERT INTO Quadrantes (Nome, Ativo, DistritoId) OUTPUT INSERTED.QuadranteId VALUES (N'Quadrante Outro Trava E2E', 1, @d)", { d: dist2 });
  const regiao2 = await escalar("INSERT INTO Regioes (Nome, Ativa, QuadranteId) OUTPUT INSERTED.RegiaoId VALUES (N'Região Outra Trava E2E', 1, @q)", { q: quad2 });
  await q("UPDATE Areas SET RegiaoId = @r WHERE AreaId = @a", { r: regiao2, a: area2 });
  const cli = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI da Trava 9-A', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });

  console.log("== a migração 168: a retenção sem prazo final ==");
  const dias = await q(`SELECT Categoria, DiasRetencao FROM PoliticasRetencao WHERE Categoria IN (N'Entidades vinculadas: atos de governança', N'Expansão: abertura e emancipação', N'Distritos: decretos, intervenções e balanços')`);
  ok(dias.length === 3 && dias.every((l) => l.DiasRetencao === null), "as três políticas da FASE 9 ficaram sem prazo final (NULL), como o texto e o ROPA dizem", dias);

  console.log("== a vacância tira o Encarregado e o dirigente de entidade ==");
  const ext = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Trava E2E', @c, 1)", { c: central });
  await q("INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde) VALUES (@e, @m, @d)", { e: ext, m: P.enc, d: hojeBr() });
  let r = await ENT("tipo", { nome: "Escola Trava E2E", natureza: "EDUCACAO" }, SEC());
  const tipoId = r.body.tipoId || (await escalar("SELECT TipoId FROM EntidadeTipos WHERE Nome = N'Escola Trava E2E'"));
  r = await ENT("entidade", { razaoSocial: "Escola da Trava E2E", cnpj: cnpjAlfa("TR9AXY12"), tipoId, finalidade: "Educação infantil para o bairro da Trava." }, SEC());
  const entidade = r.body.entidadeId || (await escalar("SELECT EntidadeId FROM EntidadesVinculadas WHERE RazaoSocial = N'Escola da Trava E2E'"));
  const IND = { indicacaoAto: "Ato da Presidência 9/2026", indicadoEm: hojeBr() };
  r = await ENT("dirigente-indicar", { entidadeId: entidade, funcao: "DIRETOR_ADMIN", membroId: P.diretor, ...IND }, PRES());
  ok(r.body.sucesso === true, "o Presidente indica o diretor", r.body);
  r = await ENT("dirigente-indicar", { entidadeId: entidade, funcao: "SECRETARIO", membroId: P.licenciado, ...IND }, PRES());
  ok(r.body.sucesso === false && /licença de candidatura/.test(r.body.mensagem), "quem está de licença de candidatura não é indicado (Art. 157 §2º)", r.body);
  r = await ENT("dirigente-indicar", { entidadeId: entidade, funcao: "SECRETARIO", membroId: P.sob, ...IND }, PRES());
  ok(r.body.sucesso === false && /processo disciplinar/.test(r.body.mensagem), "quem está sob processo não é indicado", r.body);
  const pool = await obterPool();
  await encerrarVinculos(pool, L.sql, P.enc, "DESLIGAMENTO");
  await encerrarVinculos(pool, L.sql, P.diretor, "FALECIMENTO");
  ok((await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE MembroId = @m AND Ate IS NOT NULL AND MotivoSaida LIKE N'Vacância%'", { m: P.enc })) === 1, "o Encarregado desligado sai da Extensão com o motivo");
  const dir = await um("SELECT Status, MotivoEncerramento FROM EntidadeDirigentes WHERE MembroId = @m", { m: P.diretor });
  ok(dir && dir.Status === "ENCERRADO" && dir.MotivoEncerramento === "FALECIMENTO", "o dirigente falecido sai da entidade (FALECIMENTO)", dir);

  console.log("== a exoneração só pelo Presidente ==");
  r = await ENT("dirigente-indicar", { entidadeId: entidade, funcao: "DIRETOR_ADMIN", membroId: P.conselheiro, ...IND }, PRES());
  const dir2 = await escalar("SELECT DirigenteId FROM EntidadeDirigentes WHERE MembroId = @m AND Status = N'INDICADO'", { m: P.conselheiro });
  r = await ENT("dirigente-encerrar", { dirigenteId: dir2, motivo: "EXONERACAO", data: hojeBr() }, SEC());
  ok(r.status === 403 && /Pastor Presidente/.test(r.body.mensagem), "a Secretaria não exonera", r.body);
  r = await ENT("dirigente-encerrar", { dirigenteId: dir2, motivo: "RENUNCIA", data: hojeBr() }, SEC());
  ok(r.body.sucesso === true, "mas registra a renúncia", r.body);

  console.log("== o Pastor Distrital não troca cargo em silêncio nem vale no Distrito legado ==");
  r = await DST("ativar", { distritoId: dist, sessaoId: cli, gatilho: "METROPOLE", cidade: "Belém", uf: "PA", fundamentacao: "Decreto da CLI na Trava 9-A." }, SEC());
  ok(r.body.sucesso === true, "o Distrito é ativado", r.body);
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'AREA', @a)", { m: P.pastorArea, p: await papelId("Pastor de Área"), a: area1 });
  const papelPastor = await papelId("Pastor Distrital");
  r = await LID({ membroId: P.pastorArea, papelId: papelPastor, escopoTipo: "DISTRITO", escopoId: dist, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === false && /Pastor de Área/.test(r.body.mensagem) && (await escalar("SELECT EscopoTipo FROM Lideranca WHERE MembroId = @m", { m: P.pastorArea })) === "AREA",
    "dar Pastor Distrital a quem é Pastor de Área: recusado (a Área ficaria sem líder)", r.body);
  const legado = await escalar("INSERT INTO Distritos (Nome, Ativo) OUTPUT INSERTED.DistritoId VALUES (N'Distrito Legado Trava E2E', 1)");
  await q("INSERT INTO DistritoPeriodos (DistritoId, Legado, AtivadoEm, FinanceiroDesdeMes) VALUES (@d, 1, @h, @m)", { d: legado, h: hojeBr(), m: mes });
  r = await LID({ membroId: P.pastorLeg, papelId: papelPastor, escopoTipo: "DISTRITO", escopoId: legado, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === false && /registre o decreto/.test(r.body.mensagem), "Distrito legado (sem decreto) não recebe Pastor Distrital", r.body);

  console.log("== os papéis de nome protegido e as unidades em uso ==");
  const CATTOK = () => L.GERAL(1002, ["permissoes", "pessoas"]);
  for (const nome of ["Superintendente Regional", "Pastor de Área", "Secretário de Missões", "Dirigente de Congregação"]) {
    r = await CAT("papeis", { id: await papelId(nome), nome: `${nome} renomeado` }, CATTOK());
    ok(r.body.sucesso === false && (await papelId(nome)), `"${nome}" não se renomeia`, r.body);
  }
  r = await CAT("papeis", { id: await papelId("Vice-Presidente de Quadrante"), nivel: "REGIAO" }, CATTOK());
  ok(r.body.sucesso === false && (await escalar("SELECT Nivel FROM Papeis WHERE Nome = N'Vice-Presidente de Quadrante'")) === "QUADRANTE", "o Vice-Presidente de Quadrante não muda de nível", r.body);
  const areaLivre = await escalar("INSERT INTO Areas (Nome) OUTPUT INSERTED.AreaId VALUES (N'Área com Pastor Trava E2E')");
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'AREA', @a)", { m: P.conselheiro, p: await papelId("Pastor de Área"), a: areaLivre });
  r = await CAT("areas", undefined, CATTOK(), "DELETE", areaLivre);
  ok(r.body.sucesso === false && (await escalar("SELECT COUNT(*) FROM Areas WHERE AreaId = @a", { a: areaLivre })) === 1, "a Área com Pastor de Área não se exclui (ele continuaria na CME)", r.body);

  console.log("== o território parado durante a intervenção e a troca do Interventor ==");
  r = await DST("intervir", { distritoId: dist, motivo: "OUTRA", fundamentacao: "Intervenção da Trava 9-A para provar o território.", interventorMembroId: P.interv1 }, PRES());
  ok(r.body.sucesso === true, "o Presidente decreta a intervenção", r.body);
  r = await CAT("quadrantes", { id: quad, nome: "Quadrante Trava E2E", distritoId: null }, CATTOK());
  ok(r.body.sucesso === false && /intervenção/.test(r.body.mensagem) && (await escalar("SELECT DistritoId FROM Quadrantes WHERE QuadranteId = @q", { q: quad })) === dist, "o Quadrante não sai do Distrito sob intervenção", r.body);
  r = await CAT("congregacoes", { id: beta, nome: "Beta E2E", areaId: area1 }, CATTOK());
  ok(r.body.sucesso === false && /intervenção/.test(r.body.mensagem), "nem uma congregação entra nele", r.body);
  r = await CAT("regioes", { id: regiao, nome: "Região Trava E2E renomeada" }, CATTOK());
  ok(r.body.sucesso === true, "renomear (sem mudar o território) continua possível", r.body);
  r = await LID({ membroId: P.interv1, papelId: await papelId("Interventor Distrital"), escopoTipo: "DISTRITO", escopoId: dist, senha: "NovaSenha#2026" }, PRES());
  ok(r.body.sucesso === true && (await vigente(P.interv1)) === 1, "o Interventor recebe o acesso", r.body);
  const sidInterv = crypto.randomUUID();
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, @m)", { s: sidInterv, m: P.interv1 });
  r = await DST("interventor", { distritoId: dist, interventorMembroId: P.interv2 }, SEC());
  ok(r.status === 403, "a Secretaria não troca o Interventor", r.body);
  r = await DST("interventor", { distritoId: dist, interventorMembroId: P.sob }, PRES());
  ok(r.status === 422 && /processo/.test(r.body.mensagem), "o novo Interventor sob processo: recusado", r.body);
  r = await DST("interventor", { distritoId: dist, interventorMembroId: P.interv2 }, PRES());
  ok(r.body.sucesso === true && (await escalar("SELECT InterventorMembroId FROM DistritoIntervencoes WHERE DistritoId = @d AND EncerradaEm IS NULL", { d: dist })) === P.interv2
    && (await vigente(P.interv1)) === 0 && (await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: sidInterv })) === true,
    "o Presidente troca o Interventor: o acesso do anterior termina e a sessão cai", r.body);
  const cdeOrgao = await um("SELECT OrgaoLocalId, Sigla, Nivel, ReferenciaId FROM OrgaosLocais WHERE Nivel = 5 AND ReferenciaId = @d AND Sigla = N'CDE'", { d: dist });
  await LID({ membroId: P.interv2, papelId: await papelId("Interventor Distrital"), escopoTipo: "DISTRITO", escopoId: dist, senha: "NovaSenha#2026" }, PRES());
  const universo = await universoDoOrgao(pool, { orgaoLocalId: cdeOrgao.OrgaoLocalId, sigla: cdeOrgao.Sigla, nivel: cdeOrgao.Nivel, referenciaId: cdeOrgao.ReferenciaId });
  ok(universo.length === 1 && Number(universo[0].membroId) === P.interv2, "a reunião do CDE espera só quem compõe o conselho (aqui, o Interventor), não o território inteiro", universo.map((m) => m.membroId));
  r = await DST("encerrar", { distritoId: dist, resultado: "Encerrada na Trava 9-A depois das provas." }, PRES());
  ok(r.body.sucesso === true, "o Presidente encerra a intervenção", r.body);

  console.log("== a Extensão desativada pelo cadastro e a emancipação no território da Mãe ==");
  const ext2 = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Cadastro Trava E2E', @c, 1)", { c: central });
  await q("INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde) VALUES (@e, @m, @d)", { e: ext2, m: P.encExt, d: hojeBr() });
  const GERAL = { geral: true, cme: false, cobreMae: () => true, dirigeMae: () => true };
  r = await exDb.criarPedido(pool, { dados: { tipo: "EMANCIPACAO", extensaoId: ext2, nome: "Congregação Outro Distrito E2E", areaId: area2, justificativa: "Justificativa da emancipação da Trava." }, por: 1002, hoje: hojeBr(), alcance: GERAL });
  ok(r.sucesso === false && /outro Distrito/.test(r.mensagem), "a emancipação com a Área de outro Distrito: recusada (mudaria o destino do repasse sem decreto)", r);
  r = await exDb.criarPedido(pool, { dados: { tipo: "EMANCIPACAO", extensaoId: ext2, nome: "Congregação Mesmo Distrito E2E", justificativa: "Justificativa da emancipação da Trava." }, por: 1002, hoje: hojeBr(), alcance: GERAL });
  ok(r.sucesso === true, "sem Área (herda a da Mãe): o pedido entra", r);
  r = await CAT("extensoes", { id: ext2, nome: "Tenda Cadastro Trava E2E", congregacaoMaeId: central, ativa: false }, CATTOK());
  ok(r.body.sucesso === false && /pedido de emancipação/.test(r.body.mensagem), "a Extensão com pedido em andamento não se desativa pelo cadastro", r.body);
  await q("UPDATE PedidosExpansao SET Status = N'DESISTIDO', DesistidoEm = @h, DesistenciaMotivo = N'Desistência da Trava.', DesistidoPor = 1002 WHERE ExtensaoId = @e", { h: hojeBr(), e: ext2 });
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'EXTENSAO', @e)", { m: P.escopoExt, p: await papelId("Dirigente de Congregação"), e: ext2 });
  r = await CAT("extensoes", { id: ext2, nome: "Tenda Cadastro Trava E2E", congregacaoMaeId: central, ativa: false }, CATTOK());
  ok(r.body.sucesso === true && (await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e AND Ate IS NULL", { e: ext2 })) === 0 && (await vigente(P.escopoExt)) === 0,
    "desativada pelo cadastro: o Encarregado sai e o acesso de escopo dela termina", r.body);

  console.log("== Meus Dados: os atos da pessoa ==");
  const atos = await exDb.atosDoTitular(pool, 1002);
  ok(atos.some((a) => a.papeis.includes("pediu")) && atos.some((a) => a.papeis.includes("desistiu")), "os pedidos de expansão que a pessoa fez e de que desistiu", atos);
  const dt = await diDb.dadosDoTitular(pool, 1002);
  ok(dt.decretosRegistrados.some((d) => d.ato === "ativação"), "os decretos que a pessoa registrou", dt.decretosRegistrados);

  console.log("== a desativação com o Dízimo do mês já registrado ==");
  await q(`INSERT INTO FechamentosTesouraria (CongregacaoId, MesReferencia, TotalRecebido, TotalFinal, PercentualRetencaoLocal, ValorRetidoLocal, ValorRepasseGeral, Status, FechadoPor, RepasseDistritoId)
           SELECT c.CongregacaoId, @m, 1000, 1000, 40, 400, 600, 'REPASSADO', 1002, @d FROM Congregacoes c WHERE c.AreaId = @a AND c.Ativa = 1`, { m: mes, d: dist, a: area1 });
  r = await chamarRota("GestaoRepassesInstitucionais/index.js", { metodo: "POST", binding: {}, token: SEC(), corpo: { origemTipo: "DISTRITO", origemId: dist, mesReferencia: mes } });
  ok(r.status === 201, "o Dízimo do mês é registrado", r.body);
  r = await DST("desativar", { distritoId: dist, sessaoId: cli, motivo: "Desativação da Trava 9-A depois do registro." }, SEC());
  const perFim = await um("SELECT FinanceiroAteMes FROM DistritoPeriodos WHERE DistritoId = @d AND Legado = 0 ORDER BY PeriodoId DESC", { d: dist });
  ok(r.body.sucesso === true && perFim.FinanceiroAteMes === di.proximoMes(mes) && /a partir de/.test(r.body.mensagem)
    && (await escalar("SELECT COUNT(*) FROM FechamentosTesouraria WHERE RepasseDistritoId = @d AND MesReferencia = @m", { d: dist, m: mes })) > 0,
    "o mês com o Dízimo registrado continua do Distrito: a Sede volta no mês seguinte", { perFim, msg: r.body.mensagem });

  console.log("== a referência do aviso por motivo e a CME sem acesso ==");
  const fatos = await diDb.detectarRepasseVencido(pool, { hoje: "2099-01-10" });
  ok(fatos.every((f) => [1, 2, 3].includes(f.referenciaId % 10)), "toda referência do aviso termina no código do motivo", fatos.map((f) => f.referenciaId));
  const permAntes = await escalar("SELECT Permissoes FROM Papeis WHERE Nome = N'Pastor de Área'");
  await q("UPDATE Papeis SET Permissoes = REPLACE(Permissoes, N'expansao', N'') WHERE Nome = N'Pastor de Área'");
  const pn = await exDb.painel(pool, { alcance: GERAL, hoje: hojeBr() });
  await q("UPDATE Papeis SET Permissoes = @p WHERE Nome = N'Pastor de Área'", { p: permAntes });
  ok(pn.cme.pastoresSemAcesso.some((m) => Number(m.membroId) === P.pastorArea), "o painel acusa o Pastor de Área da CME sem a permissão da tela", pn.cme.pastoresSemAcesso);

  fim("e2e-75 trava 9-A");
})().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
