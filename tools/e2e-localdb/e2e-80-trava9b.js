// e2e-80-trava9b.js — Trava de Revisão 9-B (v9.4 e v9.5): os achados das duas revisões independentes, com os handlers e o banco REAIS, sobre a base
// "cenario-trava9b" (`bash rodar.sh preparar-trava9b`: a base do Território com a 171 aplicada duas vezes). Monta o próprio cenário.
// A vacância que soltava os meses suspensos e impedidos; o sustento que passa pela CLI (Estatuto Art. 58 §4º) e o aumento que cita a reunião; a mantenedora
// que não muda com o sustento saindo do caixa dela; a mantenedora sob tutela; a versão do campo; o conflito de interesse do próprio missionário; a CME que só é
// CME na lista; a permissão "missoes" para gerir; a decisão da CLI com a confirmação recente; o alerta falso de fracionamento; a contagem da Extensão.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr } = L;
const { chamarRota } = require("./lib-afm");

console.error = () => { };
const st = require(path.join(API, "shared/storage.js"));
let blobs = 0;
st.salvarDocumento = async () => `https://blob.e2e/documentos/doc-trava9b-${process.pid}-${++blobs}`;
st.urlDocumentoComSas = (u) => `${u}?sas`;
const mi = require(path.join(API, "shared/missoes.js"));
const vacancia = require(path.join(API, "shared/vacancia.js"));
const compliance = require(path.join(API, "shared/compliance.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoMissoes/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token });
const GET = (acao, query, token) => rota(acao, { query, token });
const hoje = hojeBr();
const mes = mi.mesDe(hoje), m1 = mi.somarMeses(mes, -1), m2 = mi.somarMeses(mes, -2), m3 = mi.somarMeses(mes, -3), proximo = mi.somarMeses(mes, 1);
const DOC = { documentoBase64: Buffer.from("%PDF-1.4 termo de compromisso").toString("base64"), documentoMime: "application/pdf" };

// do cenário de base (e2e-1): 1001 Presidente, 1002 Secretário Geral, 3001 Dirigente da Central, 3003 Pastor da Área Alfa (a CME)
const P = { secretario: 9851, ana: 9852, bia: 9853, davi: 9854, congregado: 9855, tesoureiro: 9856, extAtivo: 9857, extCongregado: 9858, extDesligado: 9859 };
const SEMI = () => L.LIDER(P.secretario, ["missoes", "expansao"], [], "DEPARTAMENTO");
const SEMI_SEM_PERMISSAO = () => L.LIDER(P.secretario, ["expansao"], [], "DEPARTAMENTO");
const SEC = () => L.GERAL(1002, ["missoes", "financeiro"]);
const SEC_SEM_FATOR = () => L.sessao(1002, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["missoes", "financeiro"] });
const PRES = () => L.GERAL(1001, ["missoes"]);
const CME = () => L.LIDER(3003, ["missoes", "expansao"], ["Central E2E", "Vila Nova E2E"], "AREA");
const TES = () => L.GERAL(P.tesoureiro, ["financeiro"]);
const EXP = () => L.GERAL(1002, ["expansao"]);

const status = (id) => escalar("SELECT Status FROM EnviosMissionarios WHERE EnvioId = @id", { id });
const versaoCampo = (c) => escalar("SELECT Versao FROM CamposMissionarios WHERE CampoId = @c", { c });
const linha = (rr, id) => (rr.body.linhas || []).find((l) => l.envioId === id);
async function sessaoCLI(descricao, data) {
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, @d, @dt, N'EXTRAORDINARIA', N'ENCERRADA' FROM Orgaos WHERE Sigla = N'CLI'`, { d: descricao, dt: data });
}

(async () => {
  const pool = await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const beta = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Beta E2E'");
  const semiadespa = await escalar("SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'SEMIADESPA'");
  const pessoas = [[P.secretario, "Secretário de Missões Trava E2E", "EM_COMUNHAO"], [P.ana, "Missionária Ana Trava E2E", "EM_COMUNHAO"], [P.bia, "Missionária Bia Trava E2E", "EM_COMUNHAO"],
    [P.davi, "Missionário Davi Trava E2E", "EM_COMUNHAO"], [P.congregado, "Congregado Trava E2E", "CONGREGADO"], [P.tesoureiro, "Tesoureiro Trava E2E", "EM_COMUNHAO"]];
  for (const [id, nome, sit] of pessoas) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, Email) VALUES (@id, @n, @c, 'ATIVO', @s, @em)", { id, n: nome, c: central, s: sit, em: `t${id}@exemplo.org` });
  }
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT @m, PapelId, 'DEPARTAMENTO', @d FROM Papeis WHERE Nome = N'Secretário de Missões'", { m: P.secretario, d: semiadespa });
  const forn = (nome, doc, tipo, membroId = null) => escalar(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Banco, Agencia, Conta, TipoConta, DadosBancariosConfirmados, CriadoPor, MembroId)
    OUTPUT INSERTED.FornecedorId VALUES (@n, @d, @t, N'Banco E2E', N'0001', N'12345-6', N'CORRENTE', 1, 1002, @m)`, { n: nome, d: doc, t: tipo, m: membroId });
  const pfAna = await forn("Missionária Ana Trava E2E", "111.222.333-01", "PF", P.ana);
  const pfBia = await forn("Missionária Bia Trava E2E", "111.222.333-02", "PF", P.bia);
  const pfDavi = await forn("Missionário Davi Trava E2E", "111.222.333-03", "PF", P.davi);
  const reuniao = await sessaoCLI("CLI Trava 9-B E2E", hoje);
  const reuniaoAntiga = await sessaoCLI("CLI antiga Trava 9-B E2E", `${m3}-01`);
  let r = await POST("campo", { nome: "Frente Trava Local", uf: "PA", cidade: "Parauapebas", divulgacao: "PUBLICA", congregacaoMantenedoraId: beta }, SEMI());
  const campoLocal = r.body.campoId;
  r = await POST("campo", { nome: "Campo Trava Belém", uf: "PA", cidade: "Belém", divulgacao: "PUBLICA" }, SEMI());
  const campoEstadual = r.body.campoId;
  r = await POST("campo", { nome: "Campo Trava Lima", pais: "Peru", cidade: "Lima", divulgacao: "RESTRITA" }, SEMI());
  const campoFora = r.body.campoId;
  ok(campoLocal && campoEstadual && campoFora, "os três campos");
  // o envio Local com sustento até ficar ativo: o pedido, a CLI (Trava 9-B) e o Presidente
  async function ativo(membroId, valor, fonte, fornecedorId) {
    const p = await POST("envio", { campoId: campoLocal, membroId, sustento: valor, fonte, fornecedorId, ...DOC, periodicidade: "MENSAL", justificativa: "Envio da Trava 9-B." }, SEMI());
    const id = p.body.envioId;
    const passos = [p.body.status];
    passos.push((await POST("decidir", { envioId: id, resultado: "APROVADO", sessaoId: reuniao }, SEC())).body.status);
    passos.push((await POST("presidente", { envioId: id, resultado: "CONCORDA" }, PRES())).body.status);
    return { id, passos };
  }

  console.log("== a migração 171 ==");
  ok((await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CamposMissionarios') AND name = N'Versao'")) === 1, "CamposMissionarios.Versao existe (a 171 aplicada duas vezes)");
  ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE name = N'CK_EnvioSustentoValores_Cli'")) === 1, "o CHECK da reunião da CLI no sustento");

  console.log("== a permissão 'missoes' para gerir; a decisão da CLI com a confirmação recente ==");
  r = await GET("catalogos", {}, SEMI_SEM_PERMISSAO());
  ok(r.status === 200 && r.body.papeis.semiadespa === false && r.body.papeis.cme === true, "o Secretário de Missões sem a permissão entra só como CME (antes geria tudo pela API)", r.body.papeis);
  r = await POST("campo", { nome: "Campo Sem Permissão", uf: "PA", cidade: "Parauapebas" }, SEMI_SEM_PERMISSAO());
  ok(r.status === 403, "sem a permissão, não cadastra campo", r.status);
  r = await POST("envio", { campoId: campoLocal, membroId: P.ana, sustento: 0, periodicidade: "MENSAL", justificativa: "Pedido sem a permissão." }, SEMI_SEM_PERMISSAO());
  ok(r.status === 403, "sem a permissão, não pede envio", r.status);

  console.log("== o congregado não é missionário (Estatuto Art. 7º, I) ==");
  r = await POST("envio", { campoId: campoLocal, membroId: P.congregado, sustento: 0, periodicidade: "MENSAL", justificativa: "Envio de um congregado." }, SEMI());
  ok(r.status === 422 && /congregado/.test(r.body.mensagem), "o congregado: recusado (antes passava como em comunhão)", r.body);

  console.log("== o sustento passa pela CLI; o aumento cita a reunião (Estatuto Art. 58 §4º) ==");
  const ana = await ativo(P.ana, 500, "GERAL", pfAna);
  ok(ana.passos.join(">") === "AGUARDANDO_CLI>AGUARDANDO_PRESIDENTE>ATIVO", "Local com sustento: a CLI, o Presidente e ativo", ana.passos);
  let erro = null;
  try { await q("INSERT INTO EnvioSustentoValores (EnvioId, DesdeMes, Valor, RegistradoPor, CliSessaoId) VALUES (@e, '2099-01', 0, 1002, @s)", { e: ana.id, s: reuniao }); } catch (e) { erro = e; }
  ok(!!erro && /CK_EnvioSustentoValores_Cli/.test(erro.message), "banco: a reunião sem a data é recusada (CK_EnvioSustentoValores_Cli)", erro && erro.message);
  r = await POST("decidir", { envioId: ana.id, resultado: "APROVADO", sessaoId: reuniao }, SEC_SEM_FATOR());
  ok(r.status === 428, "a decisão da CLI sem a confirmação recente: 428 (como na Expansão)", r.status);
  r = await POST("reajustar", { envioId: ana.id, desdeMes: proximo, sustento: 600, fonte: "GERAL", fornecedorId: pfAna, motivo: "Aumento no campo.", sessaoId: reuniaoAntiga }, PRES());
  ok(r.body.sucesso === false && /anterior à ativação/.test(r.body.mensagem), "a reunião de antes da ativação: recusada", r.body);
  r = await POST("reajustar", { envioId: ana.id, desdeMes: proximo, sustento: 600, fonte: "GERAL", fornecedorId: pfAna, motivo: "Aumento no campo.", sessaoId: 999999 }, PRES());
  ok(r.body.sucesso === false && /reunião da CLI/.test(r.body.mensagem), "a reunião que não existe: recusada", r.body);
  r = await POST("reajustar", { envioId: ana.id, desdeMes: proximo, sustento: 600, fonte: "GERAL", fornecedorId: pfAna, motivo: "Aumento no campo.", sessaoId: reuniao }, PRES());
  let v = await um("SELECT Valor, CliSessaoId, CONVERT(varchar(10), CliEm, 120) AS CliEm FROM EnvioSustentoValores WHERE EnvioId = @e AND DesdeMes = @p", { e: ana.id, p: proximo });
  ok(r.body.sucesso === true && v.Valor === 600 && v.CliSessaoId === reuniao && v.CliEm === hoje, "o aumento com a reunião: gravado com a reunião e a data", { r: r.body, v });
  r = await POST("reajustar", { envioId: ana.id, desdeMes: proximo, sustento: 550, fonte: "GERAL", fornecedorId: pfAna, motivo: "Ajuste para baixo." }, PRES());
  v = await um("SELECT Valor, CliSessaoId FROM EnvioSustentoValores WHERE EnvioId = @e AND DesdeMes = @p", { e: ana.id, p: proximo });
  ok(r.body.sucesso === true && v.Valor === 550 && v.CliSessaoId === reuniao, "a redução não pede a CLI e mantém a aprovação já registrada", { r: r.body, v });
  r = await GET("envio", { envioId: ana.id }, SEMI());
  ok(r.body.envio.valores.some((x) => x.desdeMes === proximo && x.cliEm === hoje), "a ficha mostra a data da CLI no valor", r.body.envio.valores);

  console.log("== a mantenedora e a tutela ==");
  const bia = await ativo(P.bia, 300, "CONGREGACAO", pfBia);
  ok(bia.passos[2] === "ATIVO", "o envio da Bia ativo, pago pelo caixa da Beta", bia.passos);
  const campoAtual = { campoId: campoLocal, nome: "Frente Trava Local", uf: "PA", cidade: "Parauapebas", divulgacao: "PUBLICA" };
  r = await POST("campo-editar", { ...campoAtual, versao: await versaoCampo(campoLocal), congregacaoMantenedoraId: central }, SEMI());
  ok(r.body.sucesso === false && /reajusta a fonte/.test(r.body.mensagem), "trocar a mantenedora com o sustento saindo do caixa dela: recusado", r.body);
  r = await POST("campo-editar", { ...campoAtual, versao: await versaoCampo(campoLocal) }, SEMI());
  ok(r.body.sucesso === false && /reajusta a fonte/.test(r.body.mensagem), "tirar a mantenedora: recusado também", r.body);
  const categoriaBeta = await escalar("SELECT Categoria FROM Congregacoes WHERE CongregacaoId = @c", { c: beta });
  await q("UPDATE Congregacoes SET Categoria = 'EXTENSAO_TENDA' WHERE CongregacaoId = @c", { c: beta });
  r = await GET("sustento", { mes }, TES());
  ok(linha(r, bia.id) && linha(r, bia.id).situacao === "IMPEDIDO" && /tutela/.test(linha(r, bia.id).motivo), "a mantenedora sob tutela: o mês fica impedido já na prévia (antes nascia a Saída que não podia sair)", linha(r, bia.id));
  ok(linha(r, ana.id) && linha(r, ana.id).situacao === "A_GERAR", "o envio pago pelo Tesouro Geral não muda", linha(r, ana.id));
  await q("UPDATE Congregacoes SET Categoria = @cat WHERE CongregacaoId = @c", { cat: categoriaBeta, c: beta });
  r = await POST("reajustar", { envioId: bia.id, desdeMes: mes, sustento: 300, fonte: "GERAL", fornecedorId: pfBia, motivo: "Passa para o Tesouro Geral." }, PRES());
  ok(r.body.sucesso === true, "o Presidente passa a fonte para o Tesouro Geral (o mesmo valor: sem a CLI)", r.body);
  r = await POST("campo-editar", { ...campoAtual, versao: await versaoCampo(campoLocal), congregacaoMantenedoraId: central }, SEMI());
  ok(r.body.sucesso === true && (await escalar("SELECT CongregacaoMantenedoraId FROM CamposMissionarios WHERE CampoId = @c", { c: campoLocal })) === central, "depois do reajuste, a mantenedora muda", r.body);

  console.log("== a versão do campo ==");
  const v0 = await versaoCampo(campoEstadual);
  const estadual = { campoId: campoEstadual, nome: "Campo Trava Belém", uf: "PA", cidade: "Belém" };
  r = await POST("campo-editar", { ...estadual, divulgacao: "RESTRITA" }, SEMI());
  ok(r.body.sucesso === false && /versão/.test(r.body.mensagem), "sem a versão: recusado", r.body);
  r = await POST("campo-editar", { ...estadual, versao: v0, divulgacao: "RESTRITA" }, SEMI());
  ok(r.body.sucesso === true && (await versaoCampo(campoEstadual)) === v0 + 1, "quem salva com a versão que leu: gravado, a versão sobe", r.body);
  r = await POST("campo-editar", { ...estadual, versao: v0, divulgacao: "PUBLICA", descricao: "Formulário velho." }, SEC());
  ok(r.body.sucesso === false && /mudou/.test(r.body.mensagem) && (await escalar("SELECT Divulgacao FROM CamposMissionarios WHERE CampoId = @c", { c: campoEstadual })) === "RESTRITA",
    "o formulário velho não desfaz a RESTRITA do outro (o mural não expõe o lugar)", r.body);

  console.log("== o próprio missionário não age no envio dele ==");
  r = await POST("envio", { campoId: campoEstadual, membroId: 3003, sustento: 0, periodicidade: "MENSAL", justificativa: "O Pastor de Área enviado a Belém." }, SEMI());
  const envPastor = r.body.envioId;
  ok(r.body.status === "EM_PARECER", "o Pastor de Área (da CME) pedido como missionário", r.body);
  r = await GET("envio", { envioId: envPastor }, CME());
  ok(r.body.envio && r.body.envio.acoes.parecer === false, "a ficha não mostra a ele o botão do parecer", r.body.envio && r.body.envio.acoes);
  r = await POST("parecer", { envioId: envPastor, parecer: "FAVORAVEL", fundamentacao: "Parecer sobre o próprio envio." }, CME());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem) && (await status(envPastor)) === "EM_PARECER", "ele não dá o parecer do próprio envio", r.body);
  r = await GET("envios", {}, CME());
  const doCme = (r.body.envios || []).find((e) => e.envioId === envPastor);
  ok(doCme && doCme.sustentoVigente === null && doCme.relatoriosVencidos === null && doCme.suspenso === null, "a CME que só é CME: a lista também esconde o sustento e os relatórios", doCme);
  r = await GET("envios", {}, SEMI());
  ok((r.body.envios || []).some((e) => e.envioId === ana.id && e.sustentoVigente === 500 && e.relatoriosVencidos === 0), "a SEMIADESPA continua vendo", (r.body.envios || []).find((e) => e.envioId === ana.id));
  await POST("desistir", { envioId: envPastor, motivo: "Fim da prova do parecer." }, SEMI());

  r = await POST("envio", { campoId: campoLocal, membroId: P.secretario, sustento: 0, periodicidade: "MENSAL", justificativa: "O Secretário de Missões enviado." }, SEC());
  const envSec = r.body.envioId;
  ok(r.body.status === "ATIVO", "o Secretário de Missões enviado (Local sem sustento: ativo)", r.body);
  r = await POST("relatorio", { envioId: envSec, periodoInicio: mes, batismos: 1, conversoes: 2, discipulado: 3, atividades: "Relatório do próprio envio." }, SEMI());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "ele não lança o próprio relatório (levantaria a própria suspensão)", r.body);
  r = await POST("relatorio", { envioId: envSec, periodoInicio: mes, batismos: 1, conversoes: 2, discipulado: 3, atividades: "Relatório lançado pelo nível geral." }, SEC());
  ok(r.body.sucesso === true, "outra pessoa lança", r.body);
  const relSec = r.body.relatorioId;
  r = await chamarRota("GestaoMissoes/index.js", { metodo: "POST", binding: { acao: "relatorio-corrigir" }, token: SEMI(), corpo: { relatorioId: relSec, batismos: 9, conversoes: 9, discipulado: 9, atividades: "Corrigindo o próprio." } });
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "nem corrige o próprio relatório", r.body);

  r = await POST("envio", { campoId: campoEstadual, membroId: 1002, sustento: 0, periodicidade: "MENSAL", justificativa: "O Secretário Geral enviado a Belém." }, SEMI());
  const envSG = r.body.envioId;
  await POST("parecer", { envioId: envSG, parecer: "FAVORAVEL", fundamentacao: "Parecer da CME sobre o envio do Secretário Geral." }, CME());
  r = await POST("decidir", { envioId: envSG, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem) && (await status(envSG)) === "AGUARDANDO_CLI", "o Secretário Geral não registra a decisão da CLI sobre o próprio envio", r.body);
  await POST("desistir", { envioId: envSG, motivo: "Fim da prova da decisão." }, SEMI());

  r = await POST("envio", { campoId: campoFora, membroId: 1001, sustento: 0, periodicidade: "TRIMESTRAL", justificativa: "O Pastor Presidente enviado ao Peru." }, SEMI());
  const envPres = r.body.envioId;
  await POST("parecer", { envioId: envPres, parecer: "FAVORAVEL", fundamentacao: "Parecer da CME sobre o envio do Presidente." }, CME());
  await POST("decidir", { envioId: envPres, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  ok((await status(envPres)) === "AGUARDANDO_PRESIDENTE", "o envio do Presidente aguarda o Presidente");
  r = await POST("presidente", { envioId: envPres, resultado: "CONCORDA" }, PRES());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem) && (await status(envPres)) === "AGUARDANDO_PRESIDENTE", "o Presidente não concorda com o próprio envio", r.body);
  await POST("desistir", { envioId: envPres, motivo: "Fim da prova da concordância." }, SEMI());
  r = await POST("envio", { campoId: campoLocal, membroId: 1001, sustento: 0, periodicidade: "MENSAL", justificativa: "O Presidente numa frente local." }, SEMI());
  const envPres2 = r.body.envioId;
  r = await POST("reajustar", { envioId: envPres2, desdeMes: proximo, sustento: 0, motivo: "Reajuste do próprio sustento." }, PRES());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "nem reajusta o próprio sustento", r.body);

  console.log("== a vacância por disciplina não solta os meses parados ==");
  const davi = await ativo(P.davi, 400, "GERAL", pfDavi);
  ok(davi.passos[2] === "ATIVO", "o envio do Davi ativo", davi.passos);
  await q("UPDATE EnviosMissionarios SET InicioMes = @m3, AtivadoEm = @d WHERE EnvioId = @e", { m3, d: `${m3}-01`, e: davi.id });
  await q("UPDATE EnvioSustentoValores SET DesdeMes = @m3 WHERE EnvioId = @e", { m3, e: davi.id });
  for (const p of [m3, m2, m1]) {
    await POST("relatorio", { envioId: davi.id, periodoInicio: p, batismos: 0, conversoes: 1, discipulado: 1, atividades: "Relatório em dia do Davi." }, SEMI());
  }
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.davi, d: `${m2}-15` });
  r = await GET("sustento", { mes: m2 }, TES());
  ok(linha(r, davi.id) && linha(r, davi.id).situacao === "IMPEDIDO" && /processo disciplinar em curso/.test(linha(r, davi.id).motivo), "com o processo em curso: parado até a decisão", linha(r, davi.id));
  await q("UPDATE ProcessosDisciplinares SET Status = 'JULGADO', Resultado = 'EXCLUSAO', DataConclusao = @h WHERE MembroId = @m", { h: hoje, m: P.davi });
  await vacancia.encerrarVinculos(pool, L.sql, P.davi, "DISCIPLINA");
  const enc = await um("SELECT Status, EncerradoPorVacancia, MotivoEncerramento FROM EnviosMissionarios WHERE EnvioId = @e", { e: davi.id });
  ok(enc.Status === "ENCERRADO" && enc.EncerradoPorVacancia === true && /Regimento, Art\. 95 §2º/.test(enc.MotivoEncerramento),
    "a decisão disciplinar encerra o envio e cita o Regimento, Art. 95 §2º (antes, o Estatuto Art. 11 §7º para todos)", enc);
  r = await GET("sustento", { mes: m3 }, TES());
  ok(linha(r, davi.id) && linha(r, davi.id).situacao === "A_GERAR", "o mês de antes do processo: pode ser gerado", linha(r, davi.id));
  r = await GET("sustento", { mes: m2 }, TES());
  ok(linha(r, davi.id) && linha(r, davi.id).situacao === "IMPEDIDO" && /já estava sob o processo/.test(linha(r, davi.id).motivo), "Trava 9-B: o mês em que o processo corria segue parado (antes, a vacância o soltava)", linha(r, davi.id));
  r = await GET("sustento", { mes: m1 }, TES());
  ok(linha(r, davi.id) && linha(r, davi.id).situacao === "IMPEDIDO", "o mês seguinte também", linha(r, davi.id));
  r = await GET("sustento", { mes }, TES());
  ok(linha(r, davi.id) && linha(r, davi.id).situacao === "A_GERAR", "o mês da vacância ainda é gerado (decisão de 05/11/2026)", linha(r, davi.id));

  console.log("== o alerta de fracionamento não pega o que foi gerado por deliberação ==");
  const critico = await compliance.valorCriticoQuatroOlhos(pool, L.sql);
  const agencia = await forn("Agência Trava 9-B E2E", "98.765.432/0001-10", "PJ");
  const loja = await forn("Loja Trava 9-B E2E", "98.765.432/0001-11", "PJ");
  const outraCategoria = await escalar("SELECT TOP 1 Codigo FROM CategoriasSaida WHERE Codigo NOT IN ('SUSTENTO_MISSIONARIO', 'SUSTENTO_MISSIONARIO_LOCAL', 'PREBENDA_PASTORAL') ORDER BY Codigo");
  const metade = Math.round(critico * 0.6 * 100) / 100;
  for (const [f, tipo] of [[agencia, "SUSTENTO_MISSIONARIO"], [agencia, "SUSTENTO_MISSIONARIO"], [loja, outraCategoria], [loja, outraCategoria]]) {
    await q(`INSERT INTO SaidasTesouraria (CongregacaoId, FornecedorId, Tipo, Descricao, Valor, DocumentoFiscalUrl, SolicitadoPor, Status)
             VALUES (@c, @f, @t, N'Saída da prova do fracionamento', @v, N'https://blob.e2e/documentos/nota-trava9b', 1002, N'APROVADA')`,
      { c: central, f, t: tipo, v: metade });
  }
  await compliance.escanearAlertasCompliance(pool, L.sql);
  const alerta = (f) => escalar("SELECT COUNT(*) FROM AlertasCompliance WHERE Tipo = 'FRACIONAMENTO' AND RegistroOrigemId = @f", { f });
  ok((await alerta(agencia)) === 0, "o sustento gerado no mesmo dia para a agência: sem alerta falso", { critico, metade });
  ok((await alerta(loja)) === 1, "a compra comum fracionada continua acusada", { outraCategoria });

  console.log("== a contagem da Extensão (o mesmo recorte do mapa) ==");
  const ext = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Trava 9-B E2E', @c, 1)", { c: central });
  for (const [id, nome, st, sit] of [[P.extAtivo, "Membro Tenda Trava E2E", "ATIVO", "EM_COMUNHAO"], [P.extCongregado, "Congregado Tenda Trava E2E", "ATIVO", "CONGREGADO"],
    [P.extDesligado, "Desligado Tenda Trava E2E", "DESLIGADO", "EM_COMUNHAO"]]) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, ExtensaoId, Status, SituacaoMembro) VALUES (@id, @n, @c, @x, @s, @sit)", { id, n: nome, c: central, x: ext, s: st, sit });
  }
  r = await chamarRota("GestaoExpansao/index.js", { metodo: "GET", binding: { acao: "extensoes" }, token: EXP() });
  const tenda = (r.body.extensoes || []).find((e) => e.extensaoId === ext);
  ok(tenda && Number(tenda.membros) === 1, "a pílula Extensões conta só o membro ativo (sem o congregado e o desligado)", tenda);

  fim("e2e-80 Trava 9-B");
})().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
