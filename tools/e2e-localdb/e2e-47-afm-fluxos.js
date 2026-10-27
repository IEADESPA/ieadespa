// e2e-47-afm-fluxos.js — v8.1 (AFM e faltas da CLI), com os handlers e o banco REAIS, sobre a base "cenario-afm" (cenario-trava7c + a migração 156 aplicada duas vezes:
// `bash rodar.sh preparar-afm`).
// O esquema da 156 (tabelas, CHECK, gatilhos, índices únicos, permissão, papel, avisos, retenção, a matrícula automática dos oficiais), o tipo da reunião da CLI, as 3 faltas
// seguidas (exclusão só pelo sistema, sem perder o cargo; anulação quando a falta é justificada depois; providências; comunicação; readmissão que recomeça a contagem), o
// catálogo fechado da justificativa (vedados recusados no pedido do obreiro e na Secretaria), a Extraordinária que não conta, a Sessão Magna com as duas turmas e a falta dupla,
// a desmatrícula automática e a reprovação, a licença para oficiar (turma de batismo), a rematrícula, a CLI sem o inativo por Ordenação, o Reitor (nomear, homologar, reconduzir,
// substituir), docentes, a CDER, Meu Painel, Meus Dados, os avisos (detectores), a rotina diária, a retenção do detalhe e a auditoria.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GERAL, PIN, LIDER, hojeBr } = L;
const { P, montarCenario, chamarRota } = require("./lib-afm");

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const db = require(path.join(API, "shared/afmDb.js"));
const { composicaoCLI } = require(path.join(API, "shared/universo.js"));
const PERM = ["reunioes", "assembleia", "cli", "pessoas", "afm", "consagracoes"];
const SEC = GERAL(1002, PERM);
const falha = async (texto, params) => { try { await q(texto, params); return null; } catch (e) { return e.message || String(e); } };
const somarDias = (iso, d) => { const [a, m, x] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, x + d)).toISOString().slice(0, 10); };

let orgaoCLI;
let senhaN = 0;
async function abrir(tipoSessao, descricao) {
  const senha = `afm${++senhaN}`;
  const r = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: SEC, corpo: { orgaoId: orgaoCLI, descricao, senhaAcesso: senha, tipoSessao } });
  return { r, sessaoId: r.body && r.body.sessaoId, senha };
}
const presenca = (sessao, matricula) => chamarRota("RegistrarPresenca/index.js", { metodo: "POST", corpo: { matricula, senha: sessao.senha }, headers: { "x-forwarded-for": `10.1.${senhaN}.${matricula % 250}` } });
// Uma reunião que conta falta por dia (AbrirReuniao): antes de encerrar, a reunião que conta vai para uma data passada, cada uma depois da anterior — como os domingos reais.
let idade = 0;
async function encerrar(sessaoId) {
  await q("UPDATE Sessoes SET DataSessao = DATEADD(DAY, @d, CAST(SYSUTCDATETIME() AS DATE)) WHERE SessaoId = @s AND ContaFaltasCLI = 1", { d: -(400 - 7 * ++idade), s: sessaoId });
  return chamarRota("EncerrarReuniao/index.js", { metodo: "POST", binding: { sessaoId }, token: SEC, corpo: {} });
}
const dataDa = async (sessaoId) => { const d = await escalar("SELECT CONVERT(varchar(10), DataSessao, 120) FROM Sessoes WHERE SessaoId = @s", { s: sessaoId }); return d; };
const justificar = (sessaoId, corpo, token = SEC) => chamarRota("JustificarFalta/index.js", { metodo: "POST", binding: { sessaoId }, token, corpo });
const pedir = (sessaoId, matricula, corpo) => chamarRota("SolicitarJustificativa/index.js", { metodo: "POST", binding: { matricula, sessaoId }, token: PIN(matricula), corpo });
const afmGet = (acao, token = SEC) => chamarRota("GestaoAFM/index.js", { binding: { acao }, token });
const afmPost = (acao, corpo, token = SEC) => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao }, token, corpo });
async function naCLI(id) { return (await composicaoCLI(await obterPool(), orgaoCLI)).some((m) => Number(m.membroId) === id); }
const exclusaoVigente = (id) => um("SELECT * FROM CLIExclusoesFaltas WHERE MembroId = @id AND ReadmitidaEm IS NULL AND AnuladaEm IS NULL", { id });
const matriculaAtual = (id) => um("SELECT TOP 1 * FROM Matriculas_AFM WHERE MembroId = @id ORDER BY MatriculaId DESC", { id });
const presencaDe = (sessaoId, id) => um("SELECT * FROM Presencas WHERE SessaoId = @s AND MembroId = @id", { s: sessaoId, id });
// E2E_CONTRATO=1: grava as respostas REAIS dos handlers em tools/front-afm/contrato-real.json (a prova da tela usa o formato verdadeiro, não um imaginado)
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };

(async () => {
  await obterPool();
  const hoje = hojeBr();

  console.log("== migração 156: esquema ==");
  for (const t of ["AFMDesmatriculas", "CLIExclusoesFaltas", "AFMCorpoDocente"]) ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t })) === 1, `tabela ${t} existe`);
  for (const [t, c] of [["Sessoes", "ContaFaltasCLI"], ["Presencas", "EsperadoCLI"], ["Presencas", "EsperadoAFM"], ["Presencas", "MotivoCodigo"], ["Presencas", "PendenteCodigo"],
    ["Presencas", "ComprovanteConferido"], ["Matriculas_AFM", "Origem"], ["Matriculas_AFM", "NivelConcluido"], ["Matriculas_AFM", "ReciclagemAprovadaEm"], ["ComissaoMembros", "Qualificacao"]]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(@t) AND name = @c", { t: `dbo.${t}`, c })) === 1, `coluna ${t}.${c} existe`);
  }
  for (const g of ["TR_AFMDesmatriculas_Protegida", "TR_CLIExclusoesFaltas_Protegida"]) ok((await escalar("SELECT COUNT(*) FROM sys.triggers WHERE name = @g AND is_disabled = 0", { g })) === 1, `gatilho ${g} ligado`);
  for (const ix of ["UX_Matriculas_AFM_Automatica", "UX_AFMDesmatriculas_Vigente", "UX_CLIExclusoesFaltas_Vigente", "UX_AFMCorpoDocente_UmReitor", "UX_AFMCorpoDocente_Ativo"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = @i AND is_unique = 1 AND has_filter = 1", { i: ix })) === 1, `índice único filtrado ${ix}`);
  }
  for (const c of ["CK_Presencas_MotivoCodigo", "CK_Presencas_PendenteCodigo", "CK_Matriculas_AFM_Origem", "CK_Matriculas_AFM_Status", "CK_Matriculas_AFM_Nivel", "CK_Matriculas_AFM_Reciclagem",
    "CK_AFMDesmatriculas_Motivo", "CK_AFMDesmatriculas_Gatilho", "CK_AFMDesmatriculas_Reprovacao", "CK_AFMDesmatriculas_Anulacao", "CK_CLIExclusoesFaltas_Readmissao", "CK_CLIExclusoesFaltas_Comunicada",
    "CK_CLIExclusoesFaltas_Anulacao", "CK_CLIExclusoesFaltas_UmFim", "CK_CLIExclusoesFaltas_Datas", "CK_AFMCorpoDocente_Papel", "CK_AFMCorpoDocente_Mandato", "CK_AFMCorpoDocente_Homologacao",
    "CK_AFMCorpoDocente_Fim", "CK_AFMCorpoDocente_Datas"]) {
    ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = @c AND is_disabled = 0 AND is_not_trusted = 0", { c })) === 1, `CHECK ${c} ligado e confiável`);
  }
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'afm' AND LEN(Nome) <= 100")) === 1, "a permissão afm existe");
  const comAfm = (await q("SELECT Nome FROM Papeis WHERE (',' + Permissoes + ',') LIKE '%,afm,%' ORDER BY Nome")).map((p) => p.Nome);
  ok(comAfm.includes("Reitor da AFM") && comAfm.includes("Secretário Geral") && !comAfm.some((n) => /Dirigente|Pastor de/.test(n)), "afm: Presidente, Secretário Geral e Reitor da AFM (não o território)", comAfm);
  ok((await escalar("SELECT COUNT(*) FROM Papeis WHERE (',' + Permissoes + ',') LIKE '%,afm,%afm,%'")) === 0, "reaplicar não duplicou a permissão");
  const regras = await q("SELECT Chave, Obrigatoria FROM NotificacaoRegras WHERE Chave IN ('CLI_FALTAS_ALERTA','CLI_EXCLUSAO_FALTAS','AFM_FALTAS_ALERTA','AFM_DESMATRICULA','AFM_REITORIA')");
  ok(regras.length === 5 && regras.filter((r) => r.Obrigatoria).length === 4, "as 5 regras de aviso existem (só a da Reitoria não é obrigatória)", regras);
  ok((await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria IN (N'AFM — matrículas, desmatrículas e corpo docente', N'CLI — exclusões por faltas', N'CLI — detalhe da justificativa de falta')")) === 3, "as 3 políticas de retenção existem");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT Categoria FROM PoliticasRetencao GROUP BY Categoria HAVING COUNT(*) > 1) x")) === 0, "reaplicar não duplicou políticas");
  ok((await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE m.Status = 'ATIVO' AND m.CargoMinisterial IN ('AUXILIAR','MISSIONARIO','DIACONO','PRESBITERO','EVANGELISTA','PASTOR')
                     AND NOT EXISTS (SELECT 1 FROM Matriculas_AFM a WHERE a.MembroId = m.MembroId)`)) === 0, "a migração matriculou todo oficial ativo");
  ok((await escalar("SELECT COUNT(*) FROM (SELECT MembroId FROM Matriculas_AFM WHERE Origem = 'AUTOMATICA' GROUP BY MembroId HAVING COUNT(*) > 1) x")) === 0, "reaplicar não matriculou duas vezes");
  ok((await escalar("SELECT COUNT(*) FROM Sessoes WHERE ContaFaltasCLI = 1")) === 0, "nenhuma reunião antiga conta falta (só as abertas depois da v8.1)");
  // as garantias do banco
  ok(/CK_Presencas_MotivoCodigo/.test(await falha("UPDATE TOP (1) Presencas SET MotivoCodigo = 'ESCALA_CONGREGACAO'") || ""), "o banco recusa um motivo vedado (CHECK)");
  ok(/CK_Matriculas_AFM_Reciclagem/.test(await falha("INSERT INTO Matriculas_AFM (MembroId, StatusMatricula, Origem) VALUES (1002, 'ATIVA', 'REMATRICULA')") || ""), "rematrícula sem reciclagem: o banco recusa");
  ok(/CK_AFMCorpoDocente_Mandato/.test(await falha("INSERT INTO AFMCorpoDocente (MembroId, Papel, DataInicio) VALUES (1002, 'REITOR', '2026-01-01')") || ""), "Reitor sem mandato: o banco recusa");

  console.log("== cenário ==");
  ({ orgaoCLI } = await montarCenario());
  const pool = await obterPool();
  ok(await naCLI(P.faltoso) && await naCLI(P.fiscal) && await naCLI(P.tesoureiro) && await naCLI(P.cei) && !(await naCLI(P.diacono)), "composição: Presbítero, Conselheiro Fiscal, Tesoureiro e CEI na CLI; Diácono não");
  await db.garantirMatriculas(pool);
  ok((await matriculaAtual(P.diacono)) && (await matriculaAtual(P.diacono)).Origem === "AUTOMATICA", "o oficial novo é matriculado sozinho (Art. 66 §2º)");
  ok(!(await matriculaAtual(P.fiscal)), "quem não é oficial não é matriculado");
  ok((await db.garantirMatriculas(pool)) === 0, "rodar de novo não matricula ninguém");

  console.log("== tipo da reunião da CLI ==");
  const ruim = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: SEC, corpo: { orgaoId: orgaoCLI, descricao: "x", senhaAcesso: "zz", tipoSessao: "QUALQUER" } });
  ok(ruim.status === 400, "tipo inválido: 400", ruim);
  const semTipo = await chamarRota("AbrirReuniao/index.js", { metodo: "POST", token: SEC, corpo: { orgaoId: orgaoCLI, descricao: "x", senhaAcesso: "zz" } });
  ok(semTipo.status === 400, "na CLI o tipo é obrigatório (nada de Ordinária por omissão)", semTipo);

  console.log("== 3 faltas seguidas na CLI (ordinárias) ==");
  const S = [];
  for (let i = 1; i <= 3; i++) {
    const s = await abrir("ORDINARIA", `Ordinária ${i} E2E`);
    ok(s.r.status === 201, `abre a ordinária ${i}`, s.r.body);
    S.push(s);
    ok((await presenca(s, P.presente)).body.sucesso === true, `o Pastor bate ponto na ${i}`);
    for (const id of [P.dupla, P.reprovado, P.reitor, P.mestre]) await presenca(s, id);
    if (i === 3) await presenca(s, P.tesoureiro);
    const e = await encerrar(s.sessaoId);
    ok(e.status === 200 && e.body.sucesso, `encerra a ordinária ${i}`, e.body);
    if (i === 3) ok(/exclusão\(ões\) da CLI por 3 faltas seguidas/.test(e.body.mensagem), "a mensagem do encerramento conta as exclusões", e.body.mensagem);
    if (i === 2) {
      // depois da 2ª: o aviso preventivo (2 de 3) — antes, não depois
      const alerta = await db.detectarAlertaCLI(pool);
      ok(alerta.some((f) => f.destinatarios[0].membroId === P.faltoso && f.referenciaId === S[1].sessaoId), "2 faltas: o aviso preventivo vai à própria pessoa", alerta.map((f) => f.destinatarios[0].membroId));
      ok(!alerta.some((f) => f.destinatarios[0].membroId === P.presente), "quem esteve presente não recebe aviso");
      // o pedido do próprio Tesoureiro: vedado recusado, aceito fica pendente
      const vedado = await pedir(S[1].sessaoId, P.tesoureiro, { codigo: "ESCALA_CONGREGACAO", detalhe: "estava escalado" });
      ok(vedado.status === 422 && /Art\. 149 §2º, II/.test(vedado.body.mensagem), "o pedido com motivo vedado (escala) é recusado com o artigo", vedado);
      const textoLivre = await pedir(S[1].sessaoId, P.tesoureiro, { motivo: "estava viajando" });
      ok(textoLivre.status === 422, "na CLI, o texto livre sem o catálogo não serve mais", textoLivre);
      const pedido = await pedir(S[1].sessaoId, P.tesoureiro, { codigo: "VIAGEM_PROFISSIONAL", detalhe: "Congresso da empresa em Belém" });
      ok(pedido.status === 200, "o pedido com motivo aceito fica pendente", pedido);
      const pend = await presencaDe(S[1].sessaoId, P.tesoureiro);
      ok(pend.PendenteCodigo === "VIAGEM_PROFISSIONAL" && /Viagem profissional civil — Congresso/.test(pend.JustificativaPendente) && !pend.FaltaJustificada, "pendente com o código e o texto", pend);
      const secVedado = await justificar(S[1].sessaoId, { membroId: P.tesoureiro, codigo: "EVENTO_DEPARTAMENTO" });
      ok(secVedado.status === 422, "a Secretaria também não consegue justificar com motivo vedado", secVedado);
      const aprov = await justificar(S[1].sessaoId, { membroId: P.tesoureiro, codigo: pend.PendenteCodigo, detalhe: "Congresso da empresa em Belém" });
      ok(aprov.status === 200, "a Secretaria aprova pelo catálogo", aprov.body);
      const j = await presencaDe(S[1].sessaoId, P.tesoureiro);
      ok(j.FaltaJustificada && j.MotivoCodigo === "VIAGEM_PROFISSIONAL" && !j.PendenteCodigo && !j.JustificativaPendente && j.ComprovanteConferido === null, "justificada: código gravado, pendência limpa, sem comprovante (não é Magna)", j);
    }
  }
  const p1 = await presencaDe(S[0].sessaoId, P.faltoso);
  ok(p1 && p1.Presente === false && p1.EsperadoCLI === true && p1.EsperadoAFM === false, "a falta guarda que era esperado pela CLI (e não pela AFM)", p1);
  ok((await presencaDe(S[0].sessaoId, P.presente)).EsperadoCLI === true, "a presença também guarda (check-in)");
  ok((await um("SELECT ContaFaltasCLI c, TipoSessao t FROM Sessoes WHERE SessaoId = @s", { s: S[0].sessaoId })).c === true, "a Ordinária conta falta");

  const dataS3 = await dataDa(S[2].sessaoId);
  const exF = await exclusaoVigente(P.faltoso);
  ok(!!exF && exF.SessoesGatilho === S.map((s) => s.sessaoId).join(",") && String(exF.DataExclusao.toISOString ? exF.DataExclusao.toISOString().slice(0, 10) : exF.DataExclusao).slice(0, 10) === dataS3,
    "Presbítero: exclusão registrada com as 3 reuniões e a data da 3ª", exF);
  ok(/ORDENACAO/.test(exF.ComoEntrava) && !/ASSENTO/.test(exF.ComoEntrava), "o retrato diz que entrava por Ordenação", exF.ComoEntrava);
  ok(!(await naCLI(P.faltoso)), "excluído sai da composição da CLI");
  ok((await escalar("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @id", { id: P.faltoso })) === "PRESBITERO", "…e continua Presbítero (não perde o cargo)");
  ok(!(await exclusaoVigente(P.tesoureiro)), "Tesoureiro: a falta justificada interrompeu a sequência — não foi excluído");
  const exFis = await exclusaoVigente(P.fiscal);
  ok(!!exFis && /CONSELHO_FISCAL/.test(exFis.ComoEntrava), "Conselheiro Fiscal (Função): excluído, com o caminho guardado", exFis);
  ok((await escalar("SELECT COUNT(*) FROM Assentos WHERE MembroId = @id AND DataFim IS NULL", { id: P.fiscal })) === 1, "o sistema NÃO fecha a cadeira do Conselho Fiscal sozinho (é ato humano)");
  ok(!!(await exclusaoVigente(P.cei)), "membro do CEI: excluído");
  ok(!(await exclusaoVigente(P.presente)) && !(await exclusaoVigente(P.dupla)), "quem esteve presente não é excluído");
  ok((await db.apurar(pool, {})).exclusoes.length === 0, "apurar de novo não cria exclusão repetida");

  console.log("== painel Faltas e cadeiras e providências ==");
  const painel = guardar("faltas-cli", await afmGet("faltas-cli"));
  ok(painel.status === 200 && painel.body.limite === 3, "o painel abre para a Secretaria", painel.status);
  const pF = painel.body.exclusoes.find((e) => e.membroId === P.faltoso);
  ok(pF && pF.vigente && pF.providencias.map((x) => x.tipo).join() === "MANTEM_CARGO,REINGRESSO", "só Ordenação: 'mantém o cargo' e 'reingresso'", pF && pF.providencias);
  const pFis = painel.body.exclusoes.find((e) => e.membroId === P.fiscal);
  const age = pFis && pFis.providencias.find((x) => x.tipo === "AGE_DESTITUICAO");
  ok(age && age.prazo === somarDias(dataS3, 30) && pFis.providencias[0].tipo === "COMUNICAR_CLI", "Conselho Fiscal: comunicar a CLI e AGE em até 30 dias, com o prazo", pFis && pFis.providencias);
  const pCei = painel.body.exclusoes.find((e) => e.membroId === P.cei);
  ok(pCei && !pCei.providencias.some((x) => x.tipo === "AGE_DESTITUICAO"), "CEI: sem AGE (o Art. 27 §2º não o inclui)");
  ok(painel.body.emRisco.every((m) => m.membroId !== P.faltoso), "o excluído não aparece em 'em risco' (já saiu)");
  const ex = await db.detectarExclusoesCLI(pool);
  const pessoaFiscal = ex.find((f) => f.referenciaId === exFis.ExclusaoId && f.destinatarios.length === 1 && f.destinatarios[0].membroId === P.fiscal);
  const geral = ex.find((f) => f.referenciaId === exFis.ExclusaoId && f.destinatarios.every((d) => d.membroId !== P.fiscal));
  ok(!!pessoaFiscal && /Seu cargo ministerial não muda/.test(pessoaFiscal.fatoGerador), "o aviso da exclusão vai à própria pessoa", ex.map((f) => f.destinatarios.length));
  ok(!geral || /Assembleia Geral Extraordinária/.test(geral.fatoGerador), "e à Secretaria do nível geral, com as providências (quando há quem receba)");

  console.log("== comunicar e readmitir ==");
  const com1 = await afmPost("comunicar-exclusao", { exclusaoId: exFis.ExclusaoId, data: somarDias(hoje, 1) });
  ok(com1.status === 400, "comunicação no futuro: 400", com1);
  const com2 = await afmPost("comunicar-exclusao", { exclusaoId: exFis.ExclusaoId, data: hoje });
  ok(com2.status === 200, "comunicação à CLI registrada", com2.body);
  ok((await afmPost("comunicar-exclusao", { exclusaoId: exFis.ExclusaoId, data: hoje })).status === 422, "registrar a comunicação duas vezes: recusado");
  const semAto = await afmPost("readmitir", { exclusaoId: exFis.ExclusaoId, data: hoje, ato: "x" });
  ok(semAto.status === 400, "readmitir sem o ato: 400", semAto);
  const re = await afmPost("readmitir", { exclusaoId: exFis.ExclusaoId, data: hoje, ato: "Ata da CLI nº 12/2026 — novo processo de admissão" });
  ok(re.status === 200, "readmissão registrada (Art. 149 §1º)", re.body);
  ok(await naCLI(P.fiscal), "readmitido volta à composição");
  ok(!(await db.apurar(pool, { membroIds: [P.fiscal] })).exclusoes.length, "a contagem recomeça: as 3 faltas antigas não excluem de novo");
  ok(/TR_CLIExclusoesFaltas|só recebe cada passo uma vez/.test(await falha("UPDATE CLIExclusoesFaltas SET ReadmissaoAto = N'outro' WHERE ExclusaoId = @id", { id: exFis.ExclusaoId }) || ""), "o gatilho não deixa reescrever a readmissão");
  ok(/não se apaga/.test(await falha("DELETE FROM CLIExclusoesFaltas WHERE ExclusaoId = @id", { id: exFis.ExclusaoId }) || ""), "o gatilho não deixa apagar a exclusão");
  ok(/fato apurado não muda/.test(await falha("UPDATE CLIExclusoesFaltas SET DataExclusao = '2020-01-01' WHERE ExclusaoId = @id", { id: exF.ExclusaoId }) || ""), "nem mudar o fato apurado");

  console.log("== justificativa depois anula a exclusão ==");
  const jF = await justificar(S[1].sessaoId, { membroId: P.faltoso, codigo: "SAUDE" });
  ok(jF.status === 200 && /exclusão\(ões\) anulada/.test(jF.body.mensagem), "justificar a 2ª falta anula a exclusão na hora", jF.body);
  const anul = await um("SELECT * FROM CLIExclusoesFaltas WHERE ExclusaoId = @id", { id: exF.ExclusaoId });
  ok(anul.AnuladaEm && /justificada/.test(anul.MotivoAnulacao) && anul.AnuladaPor === null, "anulada pelo sistema, com o motivo", anul);
  ok(await naCLI(P.faltoso), "volta à composição");

  console.log("== Extraordinária não conta ==");
  const E1 = await abrir("EXTRAORDINARIA", "Extraordinária E2E");
  ok(E1.r.status === 201, "abre a Extraordinária");
  await encerrar(E1.sessaoId);
  ok((await um("SELECT ContaFaltasCLI c FROM Sessoes WHERE SessaoId = @s", { s: E1.sessaoId })).c === false, "Extraordinária: ContaFaltasCLI = 0");
  ok(!!(await presencaDe(E1.sessaoId, P.faltoso)), "a falta é registrada (presença) …");
  ok(!(await exclusaoVigente(P.faltoso)), "… mas não pesa na sanção");

  console.log("== Sessão Magna: duas turmas, falta dupla, desmatrícula ==");
  const M = [];
  for (let i = 1; i <= 3; i++) {
    const s = await abrir("MAGNA_AFM", `Sessão Magna ${i} E2E`);
    ok(s.r.status === 201, `abre a Sessão Magna ${i}`, s.r.body);
    M.push(s);
    for (const id of [P.presente, P.auxiliar, P.tesoureiro, P.faltoso, P.fiscal, P.reprovado, P.reitor, P.mestre, P.cei, P.foraCLI]) {
      const r = await presenca(s, id);
      if (id === P.auxiliar && i === 1) ok(r.body.sucesso === true, "o Auxiliar (só AFM) bate ponto na Magna", r.body);
    }
    const e = await encerrar(s.sessaoId);
    ok(e.status === 200, `encerra a Magna ${i}`);
    if (i === 1) {
      const aux = await presencaDe(s.sessaoId, P.auxiliar);
      ok(aux.EsperadoAFM === true && aux.EsperadoCLI === false, "Auxiliar: esperado só pela AFM");
      const pas = await presencaDe(s.sessaoId, P.presente);
      ok(pas.EsperadoAFM === true && pas.EsperadoCLI === true, "Pastor: esperado pelas duas (uma presença vale para as duas)");
      const fis = await presencaDe(s.sessaoId, P.fiscal);
      ok(fis.EsperadoAFM === false && fis.EsperadoCLI === true, "Conselheiro (não oficial): só CLI");
      const dia = await presencaDe(s.sessaoId, P.diacono);
      ok(dia && dia.Presente === false && dia.EsperadoAFM === true && dia.EsperadoCLI === false, "o Diácono faltoso tem falta só na AFM");
      const fr = guardar("frequencia-magna", await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: s.sessaoId }, token: SEC }));
      const comp = (await composicaoCLI(pool, orgaoCLI)).length;
      ok(fr.body.sessao.tipoSessao === "MAGNA_AFM" && fr.body.quorum.totalAtivos <= comp, "na Magna o quórum segue o da CLI, não soma a turma da Academia", { total: fr.body.quorum.totalAtivos, comp });
      ok(fr.body.frequencia.some((f) => f.membroId === P.auxiliar && f.esperadoAFM === true), "a frequência mostra quem era esperado pela AFM");
    }
    if (i === 2) {
      const al = await db.detectarAlertaAFM(pool);
      ok(al.some((f) => f.destinatarios[0].membroId === P.diacono), "2 Magnas: o aviso preventivo da AFM vai ao Diácono");
    }
  }
  const mD = await matriculaAtual(P.diacono);
  ok(mD.StatusMatricula === "INATIVA", "Diácono: matrícula INATIVA na 3ª Magna (Art. 69 §2º)", mD);
  const dD = await um("SELECT * FROM AFMDesmatriculas WHERE MembroId = @id AND AnuladaEm IS NULL", { id: P.diacono });
  ok(dD && dD.Motivo === "FALTAS" && dD.SessoesGatilho === M.map((s) => s.sessaoId).join(",") && dD.RegistradoPor === null, "desmatrícula por faltas, com as 3 Magnas, pelo sistema", dD);
  ok(!!(await exclusaoVigente(P.dupla)) && (await matriculaAtual(P.dupla)).StatusMatricula === "INATIVA", "falta dupla: o Presbítero ausente nas 3 Magnas é excluído da CLI E desmatriculado");
  ok((await matriculaAtual(P.auxiliar)).StatusMatricula === "ATIVA", "o Auxiliar presente segue ativo");
  ok(!(await exclusaoVigente(P.tesoureiro)), "o Tesoureiro (presente nas Magnas) segue na CLI");
  const dd = await db.detectarDesmatriculas(pool);
  ok(dd.some((f) => f.destinatarios.length === 1 && f.destinatarios[0].membroId === P.diacono && /sem licença para oficiar/.test(f.fatoGerador)), "o aviso da desmatrícula vai ao obreiro");
  ok(/Desmatr|só muda para ser anulada/.test(await falha("UPDATE AFMDesmatriculas SET Detalhe = N'x' WHERE MembroId = @id", { id: P.diacono }) || ""), "o gatilho não deixa reescrever a desmatrícula");

  console.log("== licença para oficiar: turma de batismo ==");
  const anoBat = Number(hoje.slice(0, 4)) + 1;
  const turmaRuim = await chamarRota("GestaoTurmasBatismo/index.js", { metodo: "POST", token: SEC, corpo: { dataBatismo: `${anoBat}-05-10`, local: "Batistério E2E", tipoLocal: "BATISTERIO", oficiantesMembroIds: [P.presente, P.diacono] } });
  ok(turmaRuim.status === 422 && /Diacono Magna E2E/.test(turmaRuim.body.mensagem) && /inativo na AFM/.test(turmaRuim.body.mensagem), "oficiante inativo na AFM: a turma é recusada com o nome e o motivo", turmaRuim.body);
  const turmaLeigo = await chamarRota("GestaoTurmasBatismo/index.js", { metodo: "POST", token: SEC, corpo: { dataBatismo: `${anoBat}-05-10`, local: "Batistério E2E", tipoLocal: "BATISTERIO", oficiantesMembroIds: [P.fiscal] } });
  ok(turmaLeigo.status === 422 && /Só oficiais/.test(turmaLeigo.body.mensagem), "quem não é oficial não oficia batismo (Art. 66 §2º, I)", turmaLeigo.body);
  const turmaOk = await chamarRota("GestaoTurmasBatismo/index.js", { metodo: "POST", token: SEC, corpo: { dataBatismo: `${anoBat}-05-10`, local: "Batistério E2E", tipoLocal: "BATISTERIO", oficiantesMembroIds: [P.presente] } });
  ok(turmaOk.status === 201 || turmaOk.status === 200, "oficiante com matrícula ativa: a turma é criada", turmaOk.body);

  console.log("== a justificativa documentada na Magna desfaz a falta dupla ==");
  const semDoc = await justificar(M[1].sessaoId, { membroId: P.dupla, codigo: "LUTO" });
  ok(semDoc.status === 422 && /documentada/.test(semDoc.body.mensagem), "na Magna, sem confirmar o documento: recusado (Art. 69 §2º, I)", semDoc.body);
  const comDoc = await justificar(M[1].sessaoId, { membroId: P.dupla, codigo: "LUTO", detalhe: "Falecimento do pai", comprovanteConferido: true });
  ok(comDoc.status === 200 && /anulada/.test(comDoc.body.mensagem) && /reativada/.test(comDoc.body.mensagem), "com o documento: anula a exclusão E reativa a matrícula", comDoc.body);
  ok(!(await exclusaoVigente(P.dupla)) && (await matriculaAtual(P.dupla)).StatusMatricula === "ATIVA" && await naCLI(P.dupla), "o Presbítero volta à CLI e à AFM");
  ok((await presencaDe(M[1].sessaoId, P.dupla)).ComprovanteConferido === true, "o comprovante conferido fica gravado");

  console.log("== rematrícula ==");
  ok((await afmPost("rematricular", { membroId: P.diacono })).status === 422, "rematricular sem a reciclagem: recusado");
  ok((await afmPost("rematricular", { membroId: P.diacono, reciclagemAprovadaEm: somarDias(hoje, -400) })).status === 422, "reciclagem antes da desmatrícula: recusado");
  ok((await afmPost("rematricular", { membroId: P.auxiliar, reciclagemAprovadaEm: hoje })).status === 422, "quem está ativo não se rematricula");
  const rem = await afmPost("rematricular", { membroId: P.diacono, reciclagemAprovadaEm: hoje, observacao: "Reciclagem de outubro" });
  ok(rem.status === 201, "rematrícula com a reciclagem aprovada", rem.body);
  const mD2 = await matriculaAtual(P.diacono);
  ok(mD2.Origem === "REMATRICULA" && mD2.StatusMatricula === "ATIVA" && mD2.MatriculaId !== mD.MatriculaId, "nova matrícula ATIVA", mD2);
  ok(!(await db.apurar(pool, { membroIds: [P.diacono] })).desmatriculas.length, "a contagem recomeça: as 3 Magnas antigas não desmatriculam de novo");
  ok((await licenca(P.diacono)).podeOficiar, "o Diácono volta a poder oficiar");

  console.log("== reprovação técnica e a CLI por Ordenação ==");
  ok(await naCLI(P.reprovado), "antes: o Pastor está na CLI por Ordenação");
  ok((await afmPost("reprovar", { membroId: P.reprovado, data: hoje, detalhe: "curto" })).status === 400, "reprovar sem descrever a avaliação: 400");
  const rep = await afmPost("reprovar", { membroId: P.reprovado, data: hoje, detalhe: "Prova de liturgia do Seminário de novembro" });
  ok(rep.status === 200, "reprovação registrada", rep.body);
  ok((await matriculaAtual(P.reprovado)).StatusMatricula === "INATIVA" && !(await naCLI(P.reprovado)), "inativo: sai da CLI por Ordenação (Estatuto Art. 15 §1º, I)");
  ok((await afmPost("reprovar", { membroId: P.reprovado, data: hoje, detalhe: "Prova de liturgia do Seminário de novembro" })).status === 422, "reprovar quem já está inativo: recusado");
  const painel2 = guardar("faltas-cli-inativo", await afmGet("faltas-cli"));
  ok(painel2.body.inativosAFM.some((m) => m.membroId === P.reprovado), "o painel da CLI lista o inativo que entraria por Ordenação");
  ok((await afmPost("anular-reprovacao", { membroId: P.diacono, motivo: "Engano no registro da prova" })).status === 422, "anular-reprovação de quem não tem reprovação: recusado");
  const an = await afmPost("anular-reprovacao", { membroId: P.reprovado, motivo: "A prova foi lançada no obreiro errado" });
  ok(an.status === 200 && (await matriculaAtual(P.reprovado)).StatusMatricula === "ATIVA" && await naCLI(P.reprovado), "anulada a reprovação: ativo e de volta à CLI", an.body);

  console.log("== nível de escolaridade ==");
  ok((await afmPost("nivel", { membroId: P.presente, nivel: "DOUTORADO", concluido: true })).status === 422, "nível fora da lista: recusado");
  ok((await afmPost("nivel", { membroId: P.presente, nivel: "AVANCADO", concluido: "sim" })).status === 422, "concluído precisa ser sim/não de verdade");
  ok((await afmPost("nivel", { membroId: P.presente, nivel: "AVANCADO", concluido: false })).status === 200, "nível registrado");
  const mats = guardar("matriculas", await afmGet("matriculas"));
  const mp = mats.body.itens.find((m) => m.membroId === P.presente);
  ok(mp && mp.nivelAtende === false && /concluído/.test(mp.nivelExigido), "Pastor com Avançado ainda cursando: abaixo do exigido (Art. 72, V, b)", mp);
  await afmPost("nivel", { membroId: P.presente, nivel: "AVANCADO", concluido: true });
  ok((await afmGet("matriculas")).body.itens.find((m) => m.membroId === P.presente).nivelAtende === true, "concluído: atende");

  console.log("== Reitor, docentes e CDER ==");
  ok((await afmGet("corpo-docente")).body.reitoria.situacao === "VAGA", "Reitoria começa vaga");
  ok((await db.detectarReitoria(pool)).length === 1, "aviso: Reitoria vaga");
  const nom = await afmPost("nomear-reitor", { membroId: P.reitor, dataInicio: hoje, titulacao: "Mestre em Teologia" });
  ok(nom.status === 201 && /homologação/.test(nom.body.mensagem), "Reitor nomeado (falta a homologação)", nom.body);
  let cd = await afmGet("corpo-docente");
  ok(cd.body.reitoria.situacao === "AGUARDANDO_HOMOLOGACAO" && cd.body.reitoria.reitor.mandatoAte === `${hoje.slice(0, 4)}-12-31`, "aguardando homologação; mandato até 31/12", cd.body.reitoria);
  ok((await afmPost("homologar-reitor", { data: somarDias(hoje, -10), ato: "Ata da CLI 10/2026" })).status === 422, "homologação antes da nomeação: recusada");
  ok((await afmPost("homologar-reitor", { data: hoje, ato: "Ata da CLI 10/2026" })).status === 200, "homologação registrada");
  ok((await afmGet("corpo-docente")).body.reitoria.situacao === "EM_EXERCICIO", "em exercício");
  ok((await afmPost("reconduzir-reitor", { ano: Number(hoje.slice(0, 4)) })).status === 422, "reconduzir para o mesmo ano: recusado");
  ok((await afmPost("reconduzir-reitor", { ano: Number(hoje.slice(0, 4)) + 1 })).status === 200, "recondução para o ano seguinte");
  ok((await db.detectarReitoria(pool)).length === 0, "Reitoria em dia: sem aviso");
  ok((await afmPost("nomear-reitor", { membroId: P.reitor, dataInicio: hoje })).status === 422, "nomear de novo quem já é Reitor: recusado (é recondução)");
  const nom2 = await afmPost("nomear-reitor", { membroId: P.presente, dataInicio: hoje, homologadoCLIEm: hoje, homologacaoAto: "Ata da CLI 11/2026" });
  ok(nom2.status === 201, "nova nomeação substitui o Reitor no mesmo ato", nom2.body);
  ok((await escalar("SELECT COUNT(*) FROM AFMCorpoDocente WHERE Papel = 'REITOR' AND DataFim IS NULL")) === 1, "um Reitor por vez");
  ok(/UX_AFMCorpoDocente_UmReitor|duplicate|duplicada|exclusiva/i.test(await falha("INSERT INTO AFMCorpoDocente (MembroId, Papel, DataInicio, MandatoAte) VALUES (@m, 'REITOR', @d, '2026-12-31')", { m: P.mestre, d: hoje }) || ""), "o banco não deixa dois Reitores");
  ok((await afmPost("docente", { membroId: P.mestre, titulacao: "Bacharel em Teologia", dataInicio: hoje })).status === 201, "docente cadastrado");
  ok((await afmPost("docente", { membroId: P.mestre, titulacao: "Bacharel em Teologia", dataInicio: hoje })).status === 422, "o mesmo docente duas vezes: recusado");
  cd = guardar("corpo-docente", await afmGet("corpo-docente"));
  const doc = cd.body.ativos.find((d) => d.papel === "DOCENTE" && d.membroId === P.mestre);
  ok(cd.body.encerrados.some((d) => d.membroId === P.reitor && /Substituído/.test(d.motivoFim)), "o Reitor anterior fica no histórico");
  ok((await afmPost("encerrar-corpo", { corpoDocenteId: doc.corpoDocenteId, data: hoje, motivo: "Mudou de cidade" })).status === 200, "docente encerrado");

  const comissao = (sigla, corpo) => chamarRota("GestaoComissoes/index.js", { metodo: "POST", binding: { sigla }, token: SEC, corpo });
  ok((await comissao("cder", { membroId: P.mestre })).status === 400, "CDER sem a titulação: 400");
  ok((await comissao("cder", { membroId: P.foraCLI, qualificacao: "Mestre em Teologia" })).body.sucesso === false, "CDER: quem não compõe a CLI é recusado (Art. 22)");
  ok((await comissao("cder", { membroId: P.presente, qualificacao: "Mestre em Teologia" })).body.sucesso === false, "CDER: o Reitor já entra pelo cargo");
  ok((await comissao("cder", { membroId: P.mestre, qualificacao: "Mestre em Teologia" })).status === 201, "CDER: mestre da CLI incluído");
  ok((await comissao("cder", { membroId: P.tesoureiro, qualificacao: "Mestre em Teologia Sistemática" })).status === 201, "CDER: o segundo mestre");
  ok((await comissao("cder", { membroId: P.dupla, qualificacao: "Mestre em Teologia" })).body.sucesso === false, "CDER: o terceiro passa do limite de 2");
  const lista = guardar("comissoes", await chamarRota("GestaoComissoes/index.js", { token: SEC }));
  ok(lista.body.CDER && lista.body.CDER.reitor && lista.body.CDER.reitor.membroId === P.presente && lista.body.CDER.mestres.length === 2 && lista.body.CDER.mestres.every((m) => m.qualificacao && m.foraDaCLI === false),
    "a CDER mostra o Reitor (calculado) e os 2 mestres com a titulação", lista.body.CDER);

  console.log("== Meu Painel e Meus Dados ==");
  const minha = guardar("minha-situacao", await afmGet("minha-situacao", PIN(P.tesoureiro)));
  ok(minha.status === 200 && minha.body.cli.naCLI === true && minha.body.afm && minha.body.afm.status === "ATIVA", "Meu Painel: na CLI e matrícula ativa", minha.body);
  const minhaFis = await afmGet("minha-situacao", PIN(P.fiscal));
  ok(minhaFis.body.afm === null, "quem não é oficial não tem bloco da AFM");
  const freq = guardar("minha-frequencia", await chamarRota("MinhaFrequencia/index.js", { binding: { matricula: P.tesoureiro }, token: PIN(P.tesoureiro) }));
  ok(freq.body.historico.some((h) => h.ehCLI === 1 && h.tipoSessao === "MAGNA_AFM"), "Minha Frequência diz quais reuniões são da CLI (para o catálogo)", freq.body.historico[0]);
  const md = await chamarRota("MeusDadosLGPD/index.js", { binding: { matricula: P.dupla }, token: PIN(P.dupla) });
  const afmCli = md.body && (md.body.afmCli || (md.body.dados && md.body.dados.afmCli));
  ok(afmCli && afmCli.exclusoesCLI.length === 1 && afmCli.exclusoesCLI[0].anuladaEm && afmCli.desmatriculasAFM.length === 1 && afmCli.matriculasAFM.length === 1, "Meus Dados: exclusão e desmatrícula (anuladas) e a matrícula", afmCli);

  console.log("== rotina diária, retenção e auditoria ==");
  const rot = await db.rotinaDiaria(pool);
  ok(rot.falhas.length === 0, "a rotina diária roda sem falha", rot);
  const ret = await db.aplicarRetencao(pool, { hoje: somarDias(hoje, 800) });
  ok(ret.detalhesApagados >= 1, "800 dias depois: o detalhe escrito da justificativa sai", ret);
  const jRet = await presencaDe(S[1].sessaoId, P.tesoureiro);
  ok(jRet.MotivoJustificativa === null && jRet.MotivoCodigo === "VIAGEM_PROFISSIONAL" && jRet.FaltaJustificada === true, "fica o código (sustenta a contagem), sai o texto", jRet);
  ok((await db.apurar(pool, {})).exclusoes.length === 0, "apagar o detalhe não muda a apuração");
  const acoes = (await q("SELECT DISTINCT Acao FROM AuditLog WHERE Tabela IN ('CLIExclusoesFaltas','AFMDesmatriculas','Matriculas_AFM','AFMCorpoDocente')")).map((a) => a.Acao);
  for (const a of ["CLI_EXCLUSAO_FALTAS", "CLI_EXCLUSAO_ANULADA", "CLI_EXCLUSAO_COMUNICADA", "CLI_READMISSAO", "AFM_DESMATRICULA_FALTAS", "AFM_DESMATRICULA_ANULADA", "AFM_REPROVACAO",
    "AFM_REPROVACAO_ANULADA", "AFM_REMATRICULA", "AFM_NIVEL", "AFM_REITOR_NOMEADO", "AFM_REITOR_HOMOLOGADO", "AFM_REITOR_RECONDUZIDO", "AFM_DOCENTE_CADASTRADO", "AFM_DOCENTE_ENCERRADO"]) {
    ok(acoes.includes(a), `auditoria: ${a}`);
  }
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE RegistroId IS NULL")) === 0, "nenhum registro de auditoria sem RegistroId");
  ok(falhasAuditoria === 0, "nenhuma falha ao gravar a auditoria", falhasAuditoria);

  guardar("catalogos", await afmGet("catalogos"));
  guardar("sessoes-magnas", await afmGet("sessoes-magnas"));
  guardar("reunioes-cli", await chamarRota("ListarReunioes/index.js", { token: SEC, query: { orgaoId: orgaoCLI } }));
  guardar("frequencia-ordinaria", await chamarRota("ListarFrequencia/index.js", { binding: { sessaoId: S[1].sessaoId }, token: SEC }));
  if (process.env.E2E_CONTRATO) {
    const destino = path.join(__dirname, "..", "front-afm", "contrato-real.json");
    require("fs").mkdirSync(path.dirname(destino), { recursive: true });
    require("fs").writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log("contrato gravado:", Object.keys(contrato).join(", "));
  }
  fim("e2e-47 (AFM e faltas da CLI — fluxos)");
})().catch((e) => { console.log("ERRO FATAL:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });

async function licenca(id) { return (await db.licencasDe(await obterPool(), [id])).get(id); }
