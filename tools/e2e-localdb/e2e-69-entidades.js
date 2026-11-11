// e2e-69-entidades.js — v9.1 (Entidades vinculadas): fluxos, garantias do banco, segurança e lixo, com o handler e o banco REAIS, sobre a base "cenario-entidades"
// (`bash rodar.sh preparar-entidades`: a base da FASE 8 com a 165 aplicada duas vezes). Monta o próprio cenário.
// Tipos e formação do gestor (Reg. Art. 153), cadastro com CNPJ de matriz (inclusive o alfanumérico), aprovação da CLI e ratificação da Assembleia (Art. 18, VII, "b"),
// dirigentes (indicação, homologação, nepotismo do Art. 76 §2º), prestação de contas por período com o atraso calculado (Art. 67), intervenção com os 5 dias, a decretação
// só do Pastor Presidente, os 15 dias da CLI e a caducidade (Reg. Art. 47-A), a correção da caducidade, a nova apuração, a extinção (Art. 68), Meus Dados e os avisos.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const { chamarRota } = require("./lib-afm");
const fs = require("fs");

console.error = () => { };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const ev = require(path.join(API, "shared/entidadesVinculadas.js"));
const evDb = require(path.join(API, "shared/entidadesVinculadasDb.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoEntidadesVinculadas/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token: token === undefined ? SEC() : token });
const GET = (acao, query, token) => rota(acao, { query, token: token === undefined ? SEC() : token });
const dias = (n) => ev.somarDias(hojeBr(), n);

const PRES_ID = 1001, SEC_ID = 1002;
const P = { pedagoga: 9301, medico: 9302, filhoSec: 9303, menor: 9304, desligado: 9305, interventor: 9306, diretor: 9307 };
const SEC = () => L.GERAL(SEC_ID, ["entidades_vinculadas"]);
const PRES = () => L.GERAL(PRES_ID, ["entidades_vinculadas"]);
const OUTRA = () => L.GERAL(1003, ["pessoas", "financeiro", "setores_tecnicos"]);
const LOCAL = () => L.LIDER(P.pedagoga, ["entidades_vinculadas"], ["Central E2E"]);
const PINM = () => L.sessao(P.pedagoga, { via: "PIN", permissoes: ["entidades_vinculadas"] });

// um CNPJ alfanumérico de matriz com os dígitos certos (a raiz com letras, a ordem 0001)
function cnpjAlfa(raiz) { for (let d = 0; d < 100; d++) { const c = `${raiz}0001${String(d).padStart(2, "0")}`; if (ev.validarCnpj(c, { matriz: true }).valido) return c; } return null; }
const TABELAS = ["EntidadeTipos", "EntidadeTipoFormacoes", "EntidadesVinculadas", "EntidadeDirigentes", "EntidadeIntervencoes", "EntidadePrestacoes"];
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
    if (![200, 201, 400, 403, 404, 422].includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}
async function sessao(orgao, descricao, data) {
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, @d, @dt, @t, 'ENCERRADA' FROM Orgaos WHERE Sigla = @o`, { o: orgao, d: descricao, dt: data, t: orgao === "CLI" ? "EXTRAORDINARIA" : "ORDINARIA" });
}

(async () => {
  await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const ano = Number(hojeBr().slice(0, 4));
  const pessoas = [[P.pedagoga, "Pedagoga Membro E2E", "1980-01-01", "ATIVO"], [P.medico, "Medico Membro E2E", "1975-01-01", "ATIVO"], [P.filhoSec, "Filho do Secretario E2E", "1995-01-01", "ATIVO"],
    [P.menor, "Membro Menor Entidade E2E", `${ano - 16}-01-01`, "ATIVO"], [P.desligado, "Membro Desligado E2E", "1980-01-01", "DESLIGADO"], [P.interventor, "Interventor Membro E2E", "1970-01-01", "ATIVO"],
    [P.diretor, "Diretor Presidente E2E", "1970-01-01", "ATIVO"]];
  for (const [m, nome, nasc, st] of pessoas) {
    await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @m)
             INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (@m, @n, @c, @s, 'EM_COMUNHAO', @d, '2010-01-01', @e)`,
      { m, n: nome, c: central, s: st, d: nasc, e: `ent${m}@e2e.local` });
  }
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, @m, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`, { m: PRES_ID });
  await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, @m, 'FUNCAO', 'SECRETARIO_1', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`, { m: SEC_ID });
  await q(`INSERT INTO VinculosFamiliares (MembroId, MembroParenteId, TipoVinculoId) VALUES (@pai, @filho, 2)`, { pai: SEC_ID, filho: P.filhoSec });
  const cliHoje = await sessao("CLI", "CLI E2E entidades (hoje)", hojeBr());
  const agHoje = await sessao("ASSEMBLEIA_GERAL", "AG E2E entidades (hoje)", hojeBr());
  const cliAberta = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI aberta E2E', @d, 'EXTRAORDINARIA', 'ABERTA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });
  const cliFutura = await sessao("CLI", "CLI E2E futura", dias(3));
  const cliSeminario = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'Seminário E2E', @d, 'SEMINARIO_AFM', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: hojeBr() });

  console.log("== a migração 165 ==");
  ok(await escalar("SELECT COUNT(*) FROM EntidadeTipos WHERE Nome IN (N'Hospital', N'Escola', N'ONG / Associação de assistência social', N'Outra entidade')") === 4, "os 4 tipos semeados");
  ok(await escalar("SELECT COUNT(*) FROM EntidadeTipoFormacoes f JOIN EntidadeTipos t ON t.TipoId = f.TipoId WHERE t.Nome = N'Hospital'") === 2, "Hospital: Gestão hospitalar e Medicina (Art. 153)");
  ok(await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'entidades_vinculadas'") === 1, "a permissão entidades_vinculadas");
  ok(await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE N'ENTIDADE[_]%' AND NivelAlvo = N'GLOBAL'") === 5, "as 5 regras de aviso (nível geral)");
  ok(await escalar("SELECT COUNT(*) FROM EntidadeTipos") === 4, "a semente só uma vez (a 165 rodou duas vezes)");
  ok(await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria = N'Entidades vinculadas: atos de governança' AND BaseLegal <> N'x'") === 1, "a política de retenção com o texto");
  ok(await escalar("SELECT COUNT(*) FROM Prazos WHERE Sigla = 'ENTIDADE_PRESTACAO_PRAZO_DIAS' AND Dias = 120") === 1, "o prazo padrão da entrega (120 dias)");

  console.log("== a porta ==");
  const TODAS = [["GET", "catalogos"], ["GET", "painel"], ["GET", "entidades"], ["GET", "tipos"], ["POST", "entidade"], ["POST", "intervencao-decretar"], ["POST", "extinguir"]];
  for (const [nome, tk] of [["sem sessão", null], ["PIN", PINM()], ["nível local", LOCAL()], ["outra permissão", OUTRA()]]) {
    const st = [];
    for (const [m, a] of TODAS) st.push((await rota(a, { metodo: m, token: tk || undefined, corpo: {} })).status);
    ok(st.every((s) => s === (tk ? 403 : 401)), `${nome}: ${tk ? 403 : 401} em todas`, st);
  }
  let r = guardar("catalogosSec", await GET("catalogos"));
  ok(r.status === 200 && r.body.papeis.presidente === false && r.body.destinos.length === 4, "catálogos: a Secretaria não é o Presidente", r.body.papeis);
  r = guardar("catalogos", await GET("catalogos", {}, PRES()));
  ok(r.body.papeis.presidente === true, "catálogos: o Presidente em exercício (a cadeira na Diretoria Executiva)");

  console.log("== tipos ==");
  r = guardar("tipos", await GET("tipos", { todos: 1 }));
  const tipoHosp = r.body.tipos.find((t) => t.nome === "Hospital"), tipoEsc = r.body.tipos.find((t) => t.nome === "Escola"), tipoOng = r.body.tipos.find((t) => t.nome.startsWith("ONG"));
  ok(tipoHosp && tipoEsc && tipoEsc.formacoes.join() === "Pedagogia", "a lista dos tipos com as formações", r.body.tipos.map((t) => t.nome));
  r = await POST("tipo", { nome: "Creche E2E", natureza: "EDUCACAO", formacoes: ["Pedagogia", "pedagogia"] });
  ok(r.status === 201, "cria um tipo (formação repetida entra uma vez)", r.body);
  const tipoCreche = r.body.tipoId;
  ok(await escalar("SELECT COUNT(*) FROM EntidadeTipoFormacoes WHERE TipoId = @t", { t: tipoCreche }) === 1, "uma formação só");
  ok((await POST("tipo", { nome: "Creche E2E", natureza: "SAUDE" })).status === 422, "nome repetido: 422");

  console.log("== cadastro e CNPJ ==");
  const CNPJ_ESC = "11.222.333/0001-81";
  r = await POST("entidade", { razaoSocial: "Escola Cristã Esperança E2E", cnpj: CNPJ_ESC, tipoId: tipoEsc.tipoId, finalidade: "Educação infantil e fundamental para o bairro.", uf: "pa", municipio: "Belém" });
  ok(r.status === 201, "cadastra a escola (proposta)", r.body);
  const esc = r.body.entidadeId;
  ok(await escalar("SELECT Status FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: esc }) === "PROPOSTA", "nasce PROPOSTA");
  ok((await POST("entidade", { razaoSocial: "Outra E2E", cnpj: "11222333000181", tipoId: tipoEsc.tipoId, finalidade: "Qualquer finalidade escrita." })).status === 422, "CNPJ repetido: 422");
  ok((await POST("entidade", { razaoSocial: "Filial E2E", cnpj: "11222333000262", tipoId: tipoEsc.tipoId, finalidade: "Qualquer finalidade escrita." })).body.mensagem.includes("matriz"), "filial: recusada (Art. 64)");
  const cnpjH = cnpjAlfa("12ABC345");
  r = await POST("entidade", { razaoSocial: "Hospital Beneficente E2E", nomeFantasia: "HB E2E", cnpj: cnpjH, tipoId: tipoHosp.tipoId, finalidade: "Atendimento hospitalar sem fins lucrativos." });
  ok(r.status === 201, "CNPJ alfanumérico de matriz aceito", { cnpjH, b: r.body });
  const hosp = r.body.entidadeId;
  r = await POST("entidade", { razaoSocial: "Associação Ação Social E2E", cnpj: cnpjAlfa("ZZ9ABC12"), tipoId: tipoOng.tipoId, finalidade: "Assistência social às famílias carentes." });
  const ong = r.body.entidadeId;
  ok(r.status === 201, "a ONG");
  r = await POST("entidade-editar", { entidadeId: esc, razaoSocial: "Escola Cristã Esperança E2E", cnpj: "11444777000161", tipoId: tipoEsc.tipoId, finalidade: "Educação infantil e fundamental para o bairro." });
  ok(r.status === 200 && (await escalar("SELECT Cnpj FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: esc })) === "11444777000161", "proposta: o CNPJ ainda muda", r.body);

  console.log("== indicação antes do vínculo; formação do gestor (Art. 153) ==");
  const IND = { indicacaoAto: "Ato da Presidência 1/2026", indicadoEm: dias(-40) };
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "GESTOR_TECNICO", membroId: P.pedagoga, formacao: "Administração", ...IND });
  ok(r.status === 422 && /Pedagogia/.test(r.body.mensagem) && /153/.test(r.body.mensagem), "gestor da escola sem Pedagogia: recusado", r.body);
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "GESTOR_TECNICO", membroId: P.pedagoga, formacao: "pedagogia", registroProfissional: "MEC 123", ...IND });
  ok(r.status === 201, "gestora com Pedagogia (sem acento e caixa)", r.body);
  const gestora = r.body.dirigenteId;
  ok((await POST("dirigente-homologar", { dirigenteId: gestora, sessaoId: cliHoje })).body.mensagem.includes("vínculo"), "homologar antes da aprovação do vínculo: recusado");
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "DIRETOR_PRESIDENTE", membroId: SEC_ID, ...IND });
  ok(r.status === 422 && /própria/.test(r.body.mensagem), "ninguém registra a própria indicação", r.body);
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "DIRETOR_PRESIDENTE", membroId: P.diretor, ...IND });
  ok(r.status === 201, "o Diretor-Presidente indicado");
  const diretorPres = r.body.dirigenteId;
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "DIRETOR_PRESIDENTE", membroId: P.medico, ...IND });
  ok(r.status === 422 && /em aberto/.test(r.body.mensagem), "um só Diretor-Presidente em aberto (índice único)", r.body);
  ok((await POST("dirigente-indicar", { entidadeId: esc, funcao: "SECRETARIO", membroId: P.menor, ...IND })).body.mensagem.includes("Menor"), "menor de idade não dirige");
  ok((await POST("dirigente-indicar", { entidadeId: esc, funcao: "SECRETARIO", membroId: P.desligado, ...IND })).body.mensagem.includes("ativo"), "desligado não é indicado");
  // Trava 9-B: o congregado não dirige entidade (Estatuto Art. 7º, I) — antes só o "sem comunhão" era recusado
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'CONGREGADO' WHERE MembroId = @m", { m: P.interventor });
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "SECRETARIO", membroId: P.interventor, ...IND });
  ok(r.status === 422 && /congregado/.test(r.body.mensagem), "Trava 9-B: congregado não é indicado", r.body);
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO' WHERE MembroId = @m", { m: P.interventor });
  ok((await POST("dirigente-indicar", { entidadeId: esc, funcao: "SECRETARIO", membroId: 999999, ...IND })).status === 422, "matrícula inexistente");

  console.log("== nepotismo (Art. 76 §2º) ==");
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "DIRETOR_FINANCEIRO", membroId: P.filhoSec, remunerado: true, ...IND });
  ok(r.status === 422 && /76/.test(r.body.mensagem), "filho do Secretário (Diretoria Executiva) em cargo remunerado: vedado", r.body);
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "DIRETOR_FINANCEIRO", membroId: P.filhoSec, remunerado: false, ...IND });
  ok(r.status === 201, "o mesmo, sem remuneração: permitido");
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "CONSELHEIRO_FISCAL", nomeExterno: "Contadora Externa E2E", remunerado: true, ...IND });
  ok(r.status === 422 && /declara/.test(r.body.mensagem), "profissional de fora remunerado sem a declaração: recusado");
  r = await POST("dirigente-indicar", { entidadeId: esc, funcao: "CONSELHEIRO_FISCAL", nomeExterno: "Contadora Externa E2E", remunerado: true, declaracaoParentesco: true, formacao: "Ciências Contábeis", ...IND });
  ok(r.status === 201, "com a declaração: indicado");

  console.log("== aprovação da CLI e a Assembleia ==");
  ok((await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: agHoje })).status === 422, "a Assembleia não serve de reunião da CLI");
  ok((await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: cliAberta })).status === 422, "reunião ainda aberta: recusada");
  ok((await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: cliFutura })).status === 422, "reunião com data futura: recusada");
  ok((await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: cliSeminario })).status === 422, "o Seminário (sem pauta administrativa): recusado");
  r = await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: cliHoje });
  ok(r.status === 200 && /Assembleia/.test(r.body.mensagem), "vínculo aprovado pela CLI", r.body);
  ok((await POST("vinculo-aprovar", { entidadeId: esc, sessaoId: cliHoje })).status === 422, "de novo: recusado");
  r = await POST("entidade-editar", { entidadeId: esc, razaoSocial: "Escola Cristã Esperança E2E", cnpj: CNPJ_ESC, tipoId: tipoEsc.tipoId, finalidade: "Educação infantil e fundamental para o bairro." });
  ok(r.status === 422 && /CNPJ/.test(r.body.mensagem), "ativa: o CNPJ não muda mais");
  r = await POST("tipo-editar", { tipoId: tipoEsc.tipoId, nome: "Escola", natureza: "SAUDE", formacoes: ["Pedagogia"] });
  ok(r.status === 422 && /natureza/.test(r.body.mensagem), "a natureza do tipo com entidade não muda (Art. 68)");
  for (const e of [hosp, ong]) await POST("vinculo-aprovar", { entidadeId: e, sessaoId: cliHoje });
  r = await POST("vinculo-nao-aprovar", { entidadeId: esc, motivo: "Tentativa depois de ativa." });
  ok(r.status === 422, "ativa não volta a não aprovada");
  r = await POST("entidade", { razaoSocial: "Projeto Recusado E2E", cnpj: "45723174000110", tipoId: tipoOng.tipoId, finalidade: "Projeto que a CLI não aprovou." });
  const recusada = r.body.entidadeId;
  ok((await POST("vinculo-nao-aprovar", { entidadeId: recusada, motivo: "A CLI entendeu que a finalidade não é da Igreja." })).status === 422, "a recusa da CLI exige a reunião");
  r = await POST("vinculo-nao-aprovar", { entidadeId: recusada, sessaoId: cliHoje, motivo: "A CLI entendeu que a finalidade não é da Igreja." });
  ok(r.status === 200 && (await escalar("SELECT Status FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: recusada })) === "NAO_APROVADA", "não aprovada, com o motivo");

  console.log("== homologação ==");
  r = await POST("dirigente-homologar", { dirigenteId: gestora, sessaoId: cliHoje });
  ok(r.status === 200, "gestora homologada", r.body);
  ok((await POST("dirigente-homologar", { dirigenteId: gestora, sessaoId: cliHoje })).status === 422, "de novo: recusado");
  await POST("dirigente-homologar", { dirigenteId: diretorPres, sessaoId: cliHoje });
  r = guardar("painel", await GET("painel"));
  ok(r.status === 200 && r.body.aguardandoAG.length === 3 && r.body.semGestor.some((x) => x.entidadeId === hosp) && !r.body.semGestor.some((x) => x.entidadeId === esc),
    "painel: 3 aguardando a Assembleia; o hospital sem gestor habilitado, a escola não", { ag: r.body.aguardandoAG.length, sem: r.body.semGestor });
  r = await POST("assembleia", { entidadeId: esc, sessaoId: cliHoje, resultado: "RATIFICADA" });
  ok(r.status === 422, "a ratificação é da Assembleia, não da CLI");
  r = await POST("assembleia", { entidadeId: esc, sessaoId: agHoje, resultado: "RATIFICADA" });
  ok(r.status === 200 && (await escalar("SELECT VinculoAGResultado FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: esc })) === "RATIFICADA", "a Assembleia ratificou o vínculo");
  ok((await POST("assembleia", { entidadeId: esc, sessaoId: agHoje, resultado: "RATIFICADA" })).status === 422, "nada mais esperando a Assembleia");

  console.log("== prestação de contas (Art. 67) ==");
  await q("UPDATE EntidadesVinculadas SET VinculoEm = @d WHERE EntidadeId = @e", { e: esc, d: `${ano - 2}-03-01` });
  r = guardar("entidade", await GET("entidade", { entidadeId: esc }));
  const per = r.body.entidade.periodos;
  ok(per.length === 3 && per[0].situacao === "EM_CURSO" && per[1].situacao === "ATRASADA" && per[2].situacao === "ATRASADA", "3 exercícios: o corrente em curso e os dois anteriores atrasados", per.map((p) => `${p.codigo}:${p.situacao}`));
  ok((await GET("painel")).body.prestacoesAtrasadas.filter((x) => x.entidadeId === esc).length === 2, "o painel mostra as duas atrasadas");
  const fatos = await evDb.detectarPrestacoesAtrasadas(await obterPool());
  const daEscola = fatos.filter((f) => /Escola Cristã/.test(f.fatoGerador));
  ok(daEscola.length === 1 && /2024.*2025|2025.*2024/.test(daEscola[0].fatoGerador) && new Set(fatos.map((f) => f.referenciaId)).size === fatos.length, "o aviso mensal: um por entidade, com os dois períodos, sem referência repetida", fatos);
  const anoAnt = String(ano - 2);
  const ENTREGA = { entidadeId: esc, periodo: anoAnt, entregueEm: `${ano - 1}-03-15`, relatorioAtividades: true, balancoAuditado: true, auditoriaOrgao: "Conselho Fiscal da Escola E2E" };
  ok((await POST("prestacao-registrar", { ...ENTREGA, periodo: String(ano) })).body.mensagem.includes("não terminou"), "o exercício corrente ainda não se presta");
  ok((await POST("prestacao-registrar", { ...ENTREGA, periodo: "2010" })).status === 422, "período de antes do vínculo: recusado");
  ok((await POST("prestacao-registrar", { ...ENTREGA, balancoAuditado: false })).status === 422, "sem o balanço auditado: recusado");
  r = await POST("prestacao-registrar", ENTREGA);
  ok(r.status === 200, "a prestação do primeiro exercício (entregue com atraso)", r.body);
  const prest = r.body.prestacaoId;
  r = await POST("prestacao-registrar", { ...ENTREGA, auditoriaOrgao: "Auditoria corrigida E2E" });
  ok(r.status === 200 && /corrigida/.test(r.body.mensagem), "antes da CLI, a entrega se corrige");
  ok((await POST("prestacao-config", { entidadeId: esc, periodicidade: "SEMESTRAL", prazoEntregaDias: 120 })).status === 422, "a periodicidade fica fixa depois da primeira prestação");
  ok((await POST("prestacao-config", { entidadeId: esc, periodicidade: "ANUAL", prazoEntregaDias: 365 })).body.mensagem.includes("primeiro período"), "depois de vencido um período, o prazo não muda (apagaria o atraso para trás)");
  ok((await POST("prestacao-config", { entidadeId: ong, periodicidade: "SEMESTRAL", prazoEntregaDias: 60 })).status === 200, "antes de terminar o primeiro período, muda");
  ok((await POST("prestacao-config", { entidadeId: ong, periodicidade: "ANUAL", prazoEntregaDias: 120 })).status === 200, "e volta");
  ok((await POST("prestacao-apreciar", { prestacaoId: prest, sessaoId: cliHoje, resultado: "APROVADA_COM_RESSALVAS" })).status === 422, "com ressalvas, sem escrever as ressalvas: recusado");
  r = await POST("prestacao-apreciar", { prestacaoId: prest, sessaoId: cliHoje, resultado: "APROVADA" });
  ok(r.status === 200, "a CLI apreciou");
  ok((await POST("prestacao-apreciar", { prestacaoId: prest, sessaoId: cliHoje, resultado: "REPROVADA", observacao: "tentando mudar depois" })).status === 422, "apreciada não muda");
  ok((await POST("prestacao-registrar", ENTREGA)).status === 422, "nem a entrega");
  // Trava 9-A — a verificação anual é registrada por quem tem assento no Conselho Fiscal: sem ele, recusada; com ele, valem as regras de antes
  ok((await POST("prestacao-cf", { prestacaoId: prest, verificadaEm: `${ano - 1}-04-10`, resultado: "SEM_CONFUSAO" })).status === 403, "quem não é do Conselho Fiscal não registra a verificação (Trava 9-A)");
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'CONSELHO_FISCAL' AND a.MembroId = @m AND a.DataFim IS NULL", { m: SEC_ID }))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, @m, 'FUNCAO', 'MEMBRO', '2025-01-01' FROM Orgaos WHERE Sigla = 'CONSELHO_FISCAL'`, { m: SEC_ID });
  }
  ok((await POST("prestacao-cf", { prestacaoId: prest, verificadaEm: `${ano - 2}-12-31`, resultado: "SEM_CONFUSAO" })).status === 422, "a verificação do Conselho Fiscal é depois do fim do exercício");
  r = await POST("prestacao-cf", { prestacaoId: prest, verificadaEm: `${ano - 1}-04-10`, resultado: "SEM_CONFUSAO" });
  ok(r.status === 200, "a verificação anual do Conselho Fiscal (Art. 66 §3º)");
  r = await GET("entidade", { entidadeId: esc });
  ok(r.body.entidade.periodos.find((p) => p.codigo === anoAnt).situacao === "APRECIADA" && !r.body.entidade.pendencias.some((p) => /Conselho Fiscal/.test(p)), "o exercício apreciado e sem pendência do Conselho Fiscal");

  console.log("== apuração e intervenção (Reg. Art. 47-A) ==");
  ok((await POST("apuracao-abrir", { entidadeId: recusada, motivo: "GESTAO_TEMERARIA", fatos: "Fatos graves em entidade não aprovada pela CLI." })).status === 422, "só entidade ativa passa por apuração");
  r = await POST("apuracao-abrir", { entidadeId: esc, motivo: "DESVIO_FINALIDADE", fatos: "Recursos da mensalidade usados para pagar evento da igreja (e2e)." });
  ok(r.status === 201, "apuração aberta", r.body);
  const iv = r.body.intervencaoId;
  ok((await POST("apuracao-abrir", { entidadeId: esc, motivo: "RISCO_IMAGEM", fatos: "Segunda apuração ao mesmo tempo na mesma escola." })).status === 422, "uma em curso por entidade (índice único)");
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).".padEnd(40, "."), interventorMembroId: P.interventor });
  ok(r.status === 403, "a Secretaria não decreta (só o Pastor Presidente)", r.body);
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.interventor }, PRES());
  ok(r.status === 422 && /notificado/.test(r.body.mensagem), "o Presidente, sem a notificação do gestor: recusado (Art. 65 §3º)", r.body);
  ok((await POST("apuracao-notificar", { intervencaoId: iv, notificadoEm: dias(1), forma: "Carta entregue em mãos" })).status === 422, "notificação no futuro: recusada");
  r = await POST("apuracao-notificar", { intervencaoId: iv, notificadoEm: hojeBr(), forma: "Carta entregue em mãos ao diretor" });
  ok(r.status === 200, "notificação registrada", r.body);
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.interventor }, PRES());
  ok(r.status === 422 && /5 dias/.test(r.body.mensagem), "antes dos 5 dias: recusado", r.body);
  ok((await POST("apuracao-notificar", { intervencaoId: iv, notificadoEm: dias(-5), forma: "Carta entregue em mãos ao diretor" })).body.mensagem.includes("abertura"), "notificação anterior à abertura da apuração: recusada");
  await q("UPDATE EntidadeIntervencoes SET AbertaEm = @d WHERE IntervencaoId = @i", { i: iv, d: dias(-10) });   // a apuração foi aberta há 10 dias
  ok((await POST("apuracao-notificar", { intervencaoId: iv, notificadoEm: dias(-5), forma: "Carta entregue em mãos ao diretor" })).status === 200, "a notificação de 5 dias atrás");
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.interventor }, PRES());
  ok(r.status === 422 && r.body.mensagem.includes(`manifestar até ${ev.br(hojeBr())}`), "no 5º dia o gestor ainda pode se manifestar: decretar só amanhã (revisão de 03/11/2026)", r.body);
  ok((await POST("apuracao-notificar", { intervencaoId: iv, notificadoEm: dias(-6), forma: "Carta entregue em mãos ao diretor" })).status === 200, "a notificação de 6 dias atrás");
  r = await POST("apuracao-manifestacao", { intervencaoId: iv, manifestacaoEm: dias(-2), resumo: "O diretor nega o desvio e pede prazo para explicar." });
  ok(r.status === 200, "a manifestação do gestor");
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.desligado, afastaDiretoria: true }, PRES());
  ok(r.status === 422 && /Interventor/.test(r.body.mensagem), "interventor desligado: recusado");
  const presSemFator = L.sessao(PRES_ID, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["entidades_vinculadas"] });
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.interventor, afastaDiretoria: true }, presSemFator);
  ok(r.status === 428 && r.body.precisaFator, "sem a confirmação recente (chave do aparelho ou código): 428");
  r = await POST("intervencao-decretar", { intervencaoId: iv, fundamentacao: "Desvio de finalidade comprovado pelos extratos (e2e).", interventorMembroId: P.interventor, afastaDiretoria: true }, PRES());
  ok(r.status === 200 && r.body.mensagem.includes(ev.br(dias(15))), "decretada pelo Presidente: prazo de 15 dias", r.body);
  let linha = await um("SELECT Status, CONVERT(varchar(10), DecretadaEm, 120) AS De, CONVERT(varchar(10), PrazoRatificacao, 120) AS Pr FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv });
  ok(linha.Status === "DECRETADA" && linha.De === hojeBr() && linha.Pr === dias(15), "no banco: hoje e hoje + 15", linha);
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = N'ENTIDADE_INTERVENCAO_DECRETADA' AND DestinatarioMembroId <> @p", { p: PRES_ID }) >= 0, "o aviso da decretação (a quem tem a permissão no nível geral)");
  r = guardar("entidadeIntervencao", await GET("entidade", { entidadeId: esc }));
  const afastados = r.body.entidade.dirigentes.filter((d) => d.afastadoPelaIntervencao).map((d) => d.dirigenteId);
  ok(r.body.entidade.emIntervencao && afastados.includes(gestora) && afastados.includes(diretorPres), "a diretoria aparece afastada enquanto a intervenção vale", afastados);
  const prazoFatos = await evDb.detectarPrazoIntervencao(await obterPool());
  ok(prazoFatos.some((f) => /faltam 15 dias/.test(f.fatoGerador)), "o aviso diário: faltam 15 dias", prazoFatos.map((f) => f.fatoGerador));
  ok((await POST("intervencao-ratificar", { intervencaoId: iv, sessaoId: cliHoje, resultado: "RATIFICADA" }, PRES())).body.mensagem.includes("Quem decretou"), "quem decretou não registra a decisão da CLI");

  console.log("== a caducidade (15 dias sem ratificação) ==");
  await q("UPDATE EntidadeIntervencoes SET DecretadaEm = @d, PrazoRatificacao = @p, NotificadoEm = @n, ManifestacaoEm = NULL WHERE IntervencaoId = @i", { i: iv, d: dias(-20), p: dias(-5), n: dias(-26) });
  r = await GET("painel");
  linha = await um("SELECT Status, CONVERT(varchar(10), CaducadaEm, 120) AS Ca FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv });
  ok(linha.Status === "CADUCADA" && linha.Ca === hojeBr(), "o primeiro pedido marcou: perdeu a eficácia", linha);
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'EntidadeIntervencoes' AND RegistroId = @i AND Acao = 'ENTIDADE_INTERVENCAO_CADUCADA'", { i: iv }) === 1, "uma linha na auditoria");
  await GET("painel");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'EntidadeIntervencoes' AND RegistroId = @i AND Acao = 'ENTIDADE_INTERVENCAO_CADUCADA'", { i: iv }) === 1, "o pedido seguinte não marca de novo");
  r = await GET("entidade", { entidadeId: esc });
  ok(!r.body.entidade.emIntervencao && !r.body.entidade.dirigentes.some((d) => d.afastadoPelaIntervencao), "caducada: a diretoria volta");
  r = await POST("intervencao-ratificar", { intervencaoId: iv, sessaoId: cliHoje, resultado: "RATIFICADA" });
  ok(r.status === 422 && /prazo/.test(r.body.mensagem), "reunião depois do prazo não ratifica", r.body);
  ok((await POST("intervencao-encerrar", { intervencaoId: iv, motivo: "Gestão devolvida ao diretor." }, PRES())).status === 422, "a caducada não se encerra (já não vale)");
  const cliNoPrazo = await sessao("CLI", "CLI E2E dentro do prazo", dias(-8));
  r = await POST("intervencao-ratificar", { intervencaoId: iv, sessaoId: cliNoPrazo, resultado: "RATIFICADA" });
  ok(r.status === 422 && /ata/.test(r.body.mensagem), "a correção da caducidade exige a referência da ata", r.body);
  await q("UPDATE EntidadeIntervencoes SET PrazoRatificacao = @p, DecretadaEm = @d, NotificadoEm = @n WHERE IntervencaoId = @i", { i: iv, p: dias(-11), d: dias(-26), n: dias(-32) });
  r = await POST("intervencao-ratificar", { intervencaoId: iv, sessaoId: await sessao("CLI", "CLI E2E antiga", dias(-15)), resultado: "RATIFICADA", ataReferencia: "Ata 7/2026" });
  ok(r.status === 422 && /correção só cabia/.test(r.body.mensagem), "passados 10 dias do prazo, a correção não cabe mais", r.body);
  await q("UPDATE EntidadeIntervencoes SET PrazoRatificacao = @p, DecretadaEm = @d, NotificadoEm = @n WHERE IntervencaoId = @i", { i: iv, p: dias(-5), d: dias(-20), n: dias(-26) });
  r = await POST("intervencao-ratificar", { intervencaoId: iv, sessaoId: cliNoPrazo, resultado: "RATIFICADA", ataReferencia: "Ata 8/2026 da CLI" });
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = N'ENTIDADE_INTERVENCAO_CORRIGIDA'") >= 0 && (await escalar("SELECT CorrecaoAta FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv })) === "Ata 8/2026 da CLI", "a correção guarda a ata (e avisa)");
  ok(r.status === 200 && r.body.destituidos === 4, "a reunião feita DENTRO do prazo, registrada tarde: corrige a caducidade e destitui a diretoria de antes da decretação", r.body);
  linha = await um("SELECT Status, CaducadaEm FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv });
  ok(linha.Status === "RATIFICADA" && linha.CaducadaEm === null, "ratificada, sem a marca de caducada", linha);
  ok(await escalar("SELECT COUNT(*) FROM EntidadeDirigentes WHERE EntidadeId = @e AND MotivoEncerramento = 'DESTITUICAO_INTERVENCAO' AND IntervencaoId = @i", { e: esc, i: iv }) === 4, "os mandatos encerrados por destituição, ligados à intervenção");
  ok((await POST("intervencao-defesa", { intervencaoId: iv, defesaEm: hojeBr(), referencia: "Protocolo CEI 12/2026" })).status === 200, "a defesa no Conselho de Ética");
  let pnl = await GET("painel");
  ok(pnl.body.aguardandoAG.some((x) => x.objeto === "DESTITUICAO" && x.entidadeId === esc && x.assembleiaJaHouve === true), "a destituição espera a Assembleia (Art. 18, VII, c) — e uma Assembleia já houve depois", pnl.body.aguardandoAG);
  ok((await POST("intervencao-assembleia", { intervencaoId: iv, sessaoId: cliHoje, resultado: "RATIFICADA" })).status === 422, "a destituição: só a Assembleia");
  ok((await POST("intervencao-assembleia", { intervencaoId: iv, sessaoId: agHoje, resultado: "RATIFICADA" })).status === 200, "a Assembleia ratificou a destituição");
  ok((await POST("intervencao-assembleia", { intervencaoId: iv, sessaoId: agHoje, resultado: "RATIFICADA" })).status === 422, "e não de novo");
  ok((await POST("intervencao-encerrar", { intervencaoId: iv, motivo: "Gestão devolvida à nova diretoria." }, presSemFator)).status === 428, "encerrar também exige a confirmação recente");
  ok((await POST("intervencao-encerrar", { intervencaoId: iv, motivo: "Gestão devolvida à nova diretoria." })).status === 403, "a Secretaria não encerra a intervenção");
  ok((await POST("intervencao-encerrar", { intervencaoId: iv, motivo: "Gestão devolvida à nova diretoria." }, PRES())).status === 200, "o Presidente encerra");

  console.log("== urgência, não ratificação e nova apuração (hospital) ==");
  r = await POST("apuracao-abrir", { entidadeId: hosp, motivo: "INADIMPLENCIA_FISCAL", fatos: "Tributos atrasados há meses com risco de penhora (e2e)." });
  const iv2 = r.body.intervencaoId;
  r = await POST("intervencao-decretar", { intervencaoId: iv2, fundamentacao: "Contas bloqueadas e folha de pagamento em risco (e2e).", urgencia: true, interventorNome: "Administrador Hospitalar Externo E2E" }, PRES());
  ok(r.status === 422 && /urgência/i.test(r.body.mensagem), "urgência sem justificativa: recusada");
  r = await POST("intervencao-decretar", { intervencaoId: iv2, fundamentacao: "Contas bloqueadas e folha de pagamento em risco (e2e).", urgencia: true,
    urgenciaJustificativa: "Penhora marcada para amanhã sobre o caixa do hospital.", interventorNome: "Administrador Hospitalar Externo E2E" }, PRES());
  ok(r.status === 200, "com urgência e justificativa: decretada sem esperar os 5 dias", r.body);
  r = await POST("intervencao-ratificar", { intervencaoId: iv2, sessaoId: cliHoje, resultado: "NAO_RATIFICADA", observacao: "A CLI entendeu que não havia urgência." });
  ok(r.status === 200 && (await escalar("SELECT Status FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv2 })) === "NAO_RATIFICADA", "a CLI não ratificou: sem efeito");
  r = await POST("apuracao-reabrir", { intervencaoId: iv2 });
  ok(r.status === 201, "nova apuração com os mesmos fatos", r.body);
  const iv3 = r.body.intervencaoId;
  ok((await POST("apuracao-reabrir", { intervencaoId: iv2 })).status === 422, "não reabre duas vezes (uma em curso)");
  ok((await escalar("SELECT NotificadoEm FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: iv3 })) === null, "a reabertura NÃO aproveita a notificação antiga (revisão de 03/11/2026)");
  r = await POST("intervencao-decretar", { intervencaoId: iv3, fundamentacao: "Contas bloqueadas e folha de pagamento em risco (e2e).", urgencia: true,
    urgenciaJustificativa: "Penhora marcada para amanhã sobre o caixa do hospital.", interventorNome: "Administrador Hospitalar Externo E2E" }, PRES());
  ok(r.status === 422 && /sem urgência/.test(r.body.mensagem), "depois da recusa da CLI, a urgência não contorna a notificação e os 5 dias", r.body);
  ok((await POST("apuracao-arquivar", { intervencaoId: iv3, motivo: "Tributos quitados pela própria diretoria." })).status === 200, "arquivada");

  console.log("== garantias do banco (CHECK e índice) ==");
  const tenta = async (sqlTxt, p) => { try { await q(sqlTxt, p); return false; } catch (e) { return true; } };
  ok(await tenta("UPDATE EntidadeIntervencoes SET PrazoRatificacao = DATEADD(DAY, 20, DecretadaEm) WHERE IntervencaoId = @i", { i: iv }), "CHECK: o prazo é sempre a decretação + 15");
  ok(await tenta("UPDATE EntidadeIntervencoes SET RatificacaoEm = DATEADD(DAY, 1, PrazoRatificacao) WHERE IntervencaoId = @i", { i: iv }), "CHECK: ratificação fora do prazo não grava");
  ok(await tenta("UPDATE EntidadesVinculadas SET Cnpj = '11222333000262' WHERE EntidadeId = @e", { e: ong }), "CHECK: CNPJ de filial não grava");
  ok(await tenta("UPDATE EntidadesVinculadas SET Status = 'EXTINTA' WHERE EntidadeId = @e", { e: ong }), "CHECK: extinta sem o destino do patrimônio não grava");
  ok(await tenta(`INSERT INTO EntidadeIntervencoes (EntidadeId, Status, Motivo, Fatos, AbertaEm, AbertaPor, Urgencia, DecretadaEm, DecretadaPor, Fundamentacao, InterventorNome, PrazoRatificacao)
                  VALUES (@e, 'DECRETADA', 'RISCO_IMAGEM', N'x', @h, 1, 0, @h, 1, N'x', N'x', DATEADD(DAY, 15, @h))`, { e: ong, h: hojeBr() }), "CHECK: decretar sem notificação e sem urgência não grava");
  ok(await tenta("INSERT INTO EntidadeIntervencoes (EntidadeId, Motivo, Fatos, AbertaEm, AbertaPor) VALUES (@e, 'RISCO_IMAGEM', N'x', @h, 1); INSERT INTO EntidadeIntervencoes (EntidadeId, Motivo, Fatos, AbertaEm, AbertaPor) VALUES (@e, 'RISCO_IMAGEM', N'y', @h, 1)", { e: ong, h: hojeBr() }), "índice: duas apurações em curso não gravam");
  await q("DELETE FROM EntidadeIntervencoes WHERE EntidadeId = @e AND Status = 'APURACAO'", { e: ong });

  console.log("== extinção (Art. 68) e a Assembleia ==");
  await POST("assembleia", { entidadeId: hosp, sessaoId: agHoje, resultado: "RATIFICADA" });
  await POST("dirigente-indicar", { entidadeId: hosp, funcao: "GESTOR_TECNICO", membroId: P.medico, formacao: "Medicina", ...IND });
  r = await POST("extinguir", { entidadeId: hosp, sessaoId: cliHoje, destinoPatrimonio: "EDUCACAO_CONGENERE", destinatarioNome: "Escola Qualquer" });
  ok(r.status === 422 && /68/.test(r.body.mensagem), "hospital não manda o patrimônio a escola");
  r = await POST("extinguir", { entidadeId: hosp, sessaoId: cliHoje, destinoPatrimonio: "SAUDE_MATRIZ_ASSISTENCIAL", destinatarioNome: "Ação Social da Matriz" });
  ok(r.status === 422 && /assistencial/.test(r.body.mensagem), "à Matriz só confirmando a atividade assistencial do mesmo tipo");
  r = await POST("extinguir", { entidadeId: hosp, sessaoId: cliHoje, destinoPatrimonio: "SAUDE_OUTRA_INSTITUICAO", destinatarioNome: "Santa Casa E2E", destinatarioCnpj: "45723174000110",
    bensComodato: "Ambulância placa ABC1D23 (comodato da Matriz)" });
  ok(r.status === 200, "extinta com o destino e os bens em comodato", r.body);
  ok(await escalar("SELECT COUNT(*) FROM EntidadeDirigentes WHERE EntidadeId = @e AND Status IN ('INDICADO','HOMOLOGADO')", { e: hosp }) === 0, "os mandatos se encerram");
  r = await POST("assembleia", { entidadeId: hosp, sessaoId: agHoje, resultado: "NAO_RATIFICADA" });
  ok(r.status === 422, "não ratificar exige a observação");
  r = await POST("assembleia", { entidadeId: hosp, sessaoId: agHoje, resultado: "NAO_RATIFICADA", observacao: "A Assembleia quer manter o hospital." });
  linha = await um("SELECT Status, ExtincaoEm, DestinoPatrimonio FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: hosp });
  ok(r.status === 200 && linha.Status === "ATIVA" && linha.ExtincaoEm === null && linha.DestinoPatrimonio === null, "a Assembleia não ratificou: volta a ativa, a extinção fica sem efeito", linha);
  ok((await escalar("SELECT CONVERT(varchar(10), ExtincaoVetadaEm, 120) FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: hosp })) === hojeBr(), "a recusa da Assembleia fica guardada (Art. 19 §1º)");
  const EXT = { entidadeId: hosp, sessaoId: cliHoje, destinoPatrimonio: "SAUDE_OUTRA_INSTITUICAO", destinatarioNome: "Santa Casa E2E" };
  r = await POST("extinguir", EXT);
  ok(r.status === 422 && /19 §1º/.test(r.body.mensagem), "a CLI não renova a extinção sem nova autorização da Assembleia", r.body);
  const agAutoriza = await sessao("ASSEMBLEIA_GERAL", "AG E2E autoriza", hojeBr());
  // uma intervenção em curso no hospital: a extinção a encerra
  r = await POST("apuracao-abrir", { entidadeId: hosp, motivo: "RISCO_IMAGEM", fatos: "Fatos que deixam de importar com a extinção (e2e)." });
  const ivHosp = r.body.intervencaoId;
  r = await POST("extinguir", { ...EXT, autorizacaoAGSessaoId: agAutoriza });
  ok(r.status === 200 && (await escalar("SELECT Status FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: ivHosp })) === "ARQUIVADA", "com a autorização: extinta, e a apuração em curso arquivada", r.body);
  // uma intervenção decretada na ONG: o vínculo desfeito a encerra
  r = await POST("apuracao-abrir", { entidadeId: ong, motivo: "RISCO_IMAGEM", fatos: "Fatos da associação antes do desfazimento (e2e)." });
  const ivOng = r.body.intervencaoId;
  await q("UPDATE EntidadeIntervencoes SET Status = 'DECRETADA', NotificadoEm = @n, DecretadaEm = @d, DecretadaPor = 1001, Fundamentacao = N'Fundamentação (e2e)', InterventorNome = N'Interventor E2E', PrazoRatificacao = @p WHERE IntervencaoId = @i",
    { i: ivOng, n: dias(-8), d: hojeBr(), p: dias(15) });
  r = await POST("assembleia", { entidadeId: ong, sessaoId: agHoje, resultado: "NAO_RATIFICADA", observacao: "A Assembleia não quer a associação vinculada." });
  ok(r.status === 200 && (await escalar("SELECT Status FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: ong })) === "DESFEITA", "criação não ratificada: vínculo desfeito");
  ok((await escalar("SELECT Status FROM EntidadeIntervencoes WHERE IntervencaoId = @i", { i: ivOng })) === "ENCERRADA", "e a intervenção decretada nela se encerra (nada fica valendo nem avisando)");
  ok(!(await evDb.detectarPrazoIntervencao(await obterPool())).some((f) => f.referenciaId - (f.referenciaId % 10000) === ivOng * 10000), "o aviso diário não fala dela");
  const cnpjOng = await escalar("SELECT Cnpj FROM EntidadesVinculadas WHERE EntidadeId = @e", { e: ong });
  const NOVA = { razaoSocial: "Associação Ação Social de novo E2E", cnpj: cnpjOng, tipoId: tipoOng.tipoId, finalidade: "Assistência social às famílias carentes." };
  r = await POST("entidade", NOVA);
  ok(r.status === 422 && /19 §1º/.test(r.body.mensagem), "o CNPJ do vínculo desfeito só volta com a autorização da Assembleia", r.body);
  r = await POST("entidade", { ...NOVA, autorizacaoAGSessaoId: agAutoriza });
  ok(r.status === 201, "com a autorização: nova proposta com o mesmo CNPJ", r.body);
  r = await POST("entidade", { ...NOVA, autorizacaoAGSessaoId: agAutoriza });
  ok(r.status === 422 && /Já existe/.test(r.body.mensagem), "mas não duas propostas vivas com o mesmo CNPJ");
  r = await POST("entidade", { razaoSocial: "Projeto Recusado de novo E2E", cnpj: "45723174000110", tipoId: tipoOng.tipoId, finalidade: "Nova proposta depois da recusa da CLI." });
  ok(r.status === 201, "a proposta que a CLI recusou pode ser apresentada de novo");

  console.log("== Meus Dados, contrato e auditoria ==");
  r = await chamarRota("MeusDadosLGPD/index.js", { binding: { matricula: String(P.pedagoga) }, token: L.sessao(P.pedagoga, { via: "PIN" }) });
  ok(r.status === 200 && r.body.entidadesVinculadas && r.body.entidadesVinculadas.funcoes.some((f) => /Gestor/.test(f.funcao)), "Meus Dados: a função na escola", r.body && r.body.entidadesVinculadas);
  r = await chamarRota("MeusDadosLGPD/index.js", { binding: { matricula: String(P.interventor) }, token: L.sessao(P.interventor, { via: "PIN" }) });
  ok(r.body.entidadesVinculadas.comoInterventor.length === 1, "Meus Dados: o interventor vê a intervenção");
  guardar("entidades", await GET("entidades"));
  guardar("entidadeFinal", await GET("entidade", { entidadeId: esc }));
  guardar("reunioesCLI", await GET("reunioes", { orgao: "CLI" }));
  guardar("reunioesAG", await GET("reunioes", { orgao: "AG" }));
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela LIKE N'Entidade%' AND (RegistroId IS NULL OR Acao IS NULL)") === 0, "auditoria: nenhuma linha sem registro");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela LIKE N'Entidade%'") >= 30, "auditoria: cada ato gravou a sua linha");

  console.log("== lixo em cada campo ==");
  await fuzz("entidade", "entidade", { razaoSocial: "Lixo E2E", cnpj: "45723174000110", tipoId: tipoOng.tipoId, finalidade: "Finalidade de teste com lixo." }, ["razaoSocial", "cnpj", "tipoId", "finalidade", "uf", "nomeFantasia"]);
  await fuzz("dirigente-indicar", "dirigente-indicar", { entidadeId: esc, funcao: "SECRETARIO", membroId: P.diretor, ...IND }, ["entidadeId", "funcao", "membroId", "nomeExterno", "indicadoEm", "mandatoAte", "remunerado"]);
  await fuzz("apuracao-abrir", "apuracao-abrir", { entidadeId: recusada, motivo: "RISCO_IMAGEM", fatos: "Fatos de teste suficientemente longos." }, ["entidadeId", "motivo", "fatos"]);
  await fuzz("prestacao-registrar", "prestacao-registrar", { entidadeId: esc, periodo: "1999", entregueEm: hojeBr(), relatorioAtividades: true, balancoAuditado: true, auditoriaOrgao: "Órgão" }, ["entidadeId", "periodo", "entregueEm", "auditoriaOrgao"]);
  await fuzz("extinguir", "extinguir", { entidadeId: esc, sessaoId: cliHoje, destinoPatrimonio: "CONGENERE_SEM_FINS", destinatarioNome: "Destino E2E" }, ["entidadeId", "sessaoId", "destinoPatrimonio", "destinatarioCnpj", "bensComodato", "autorizacaoAGSessaoId"]);
  await fuzz("decretar", "intervencao-decretar", { intervencaoId: iv3, fundamentacao: "x".repeat(40), interventorNome: "Fulano de Tal" }, ["intervencaoId", "fundamentacao", "urgencia", "interventorMembroId"], PRES());

  if (process.env.E2E_CONTRATO === "1") {
    const destino = path.join(__dirname, "..", "front-entidades", "contrato-real.json");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log("contrato gravado em", destino);
  }
  fim("e2e-69 entidades vinculadas");
})().catch((e) => { console.log("FALHOU:", e && e.stack); process.exitCode = 1; L.shimEncerrar(); });
