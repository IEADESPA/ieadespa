// e2e-71-expansao.js — v9.2 (Expansão): fluxos, garantias do banco, segurança e lixo, com o handler e o banco REAIS, sobre a base "cenario-expansao"
// (`bash rodar.sh preparar-expansao`: a base da v9.1 com a 166 aplicada duas vezes). Monta o próprio cenário.
// A CME calculada (Reg. Art. 23), a abertura de Extensão com o Encarregado (Art. 109-A), a emancipação com o parecer da CME em 15 dias (Art. 24 §2º) e a decisão da CLI
// executada na mesma gravação (os membros passam para a congregação nova, a Extensão fica emancipada, o acesso do escopo dela termina e as sessões caem), a nova
// congregação com a urgência, a desistência, a recusa, a troca do Encarregado, Meus Dados, as Comissões, os Projetos e os avisos.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const { chamarRota } = require("./lib-afm");
const fs = require("fs");
const crypto = require("crypto");

console.error = () => { };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const ex = require(path.join(API, "shared/expansao.js"));
const exDb = require(path.join(API, "shared/expansaoDb.js"));
const { somarDias } = require(path.join(API, "shared/entidadesVinculadas.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoExpansao/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token: token === undefined ? SEC() : token });
const GET = (acao, query, token) => rota(acao, { query, token: token === undefined ? SEC() : token });
const dias = (n) => somarDias(hojeBr(), n);

// do cenário de base (e2e-1): 1001 Presidente, 1002 Secretário Geral, 3001 Dirigente da Central, 3002 Dirigente da Vila Nova, 3003 Pastor da Área Alfa, 3004 Dirigente da Beta
const P = { missoes: 9401, encA: 9402, encB: 9403, vila: 9404, desligado: 9405, semComunhao: 9406, disciplina: 9407, m1: 9408, m2: 9409, m3: 9410, jea: 9411, pastorVencido: 9412,
  vilaDisciplina: 9413, exMembro: 9414 };
const SID_SEC = crypto.randomUUID();
const SEC = () => L.sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["expansao", "reunioes"], sid: SID_SEC });
const PRES = () => L.GERAL(1001, ["expansao"]);
const DIR = () => L.LIDER(3001, ["expansao"], ["Central E2E"]);
const DIRV = () => L.LIDER(3002, ["expansao"], ["Vila Nova E2E"]);
const PASTOR = () => L.LIDER(3003, ["expansao"], ["Central E2E", "Vila Nova E2E"], "AREA");
const MISS = () => L.sessao(P.missoes, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: ["reunioes", "pessoas", "expansao"] });
const OUTRO = () => L.LIDER(3004, ["pessoas"], ["Beta E2E"]);
const PINM = () => L.sessao(P.encA, { via: "PIN", permissoes: ["expansao"] });

const TABELAS = ["PedidosExpansao", "ExtensaoEncarregados", "ExtensoesTenda", "Congregacoes", "MembroReferencia", "Lideranca", "SessoesAtivas"];
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
async function sessao(descricao, data, { tipo = "EXTRAORDINARIA", status = "ENCERRADA" } = {}) {
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, @d, @dt, @t, @s FROM Orgaos WHERE Sigla = N'CLI'`, { d: descricao, dt: data, t: tipo, s: status });
}
async function falhaNoBanco(rotulo, texto, params) {
  let erro = null;
  try { await q(texto, params); } catch (e) { erro = e; }
  ok(!!erro, `banco: ${rotulo}`, erro ? undefined : ["passou sem erro"]);
}
const avisos = (chave, membroId) => escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = @c AND DestinatarioMembroId = @m", { c: chave, m: membroId });

(async () => {
  await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const area1 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Alfa E2E'");
  const area2 = await escalar("SELECT AreaId FROM Areas WHERE Nome = N'Área Beta E2E'");
  const semiadespa = await escalar("SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'SEMIADESPA'");
  const pessoas = [[P.missoes, "Secretario de Missoes E2E", central, "ATIVO", "EM_COMUNHAO"], [P.encA, "Encarregada A E2E", central, "ATIVO", "EM_COMUNHAO"],
    [P.encB, "Encarregado B E2E", central, "ATIVO", "EM_COMUNHAO"], [P.vila, "Membro Vila E2E", vila, "ATIVO", "EM_COMUNHAO"], [P.desligado, "Desligado Exp E2E", central, "DESLIGADO", "EM_COMUNHAO"],
    [P.semComunhao, "Sem Comunhao Exp E2E", central, "ATIVO", "SEM_COMUNHAO"], [P.disciplina, "Disciplina Exp E2E", central, "ATIVO", "EM_COMUNHAO"],
    [P.m1, "Membro Tenda 1 E2E", central, "ATIVO", "EM_COMUNHAO"], [P.m2, "Membro Tenda 2 E2E", central, "ATIVO", "EM_COMUNHAO"], [P.m3, "Membro Tenda 3 E2E", central, "ATIVO", "EM_COMUNHAO"],
    [P.jea, "Membro JEA E2E", central, "ATIVO", "EM_COMUNHAO"], [P.pastorVencido, "Pastor Vencido E2E", central, "ATIVO", "EM_COMUNHAO"],
    [P.vilaDisciplina, "Disciplina Vila E2E", vila, "ATIVO", "EM_COMUNHAO"], [P.exMembro, "Ex-membro da Tenda E2E", central, "DESLIGADO", "EM_COMUNHAO"]];
  for (const [m, nome, c, st, sit] of pessoas) {
    await q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, Email) VALUES (@m, @n, @c, @s, @sit, '1980-01-01', '2010-01-01', @e)`,
      { m, n: nome, c, s: st, sit, e: `exp${m}@e2e.local` });
  }
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.disciplina, d: hojeBr() });
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.vilaDisciplina, d: hojeBr() });
  const papel = (nome) => escalar("SELECT PapelId FROM Papeis WHERE Nome = @n", { n: nome });
  const papelMissoes = await papel("Secretário de Missões");
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'DEPARTAMENTO', @e)", { m: P.missoes, p: papelMissoes, e: semiadespa });
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'AREA', @e)", { m: P.jea, p: await papel("Membro da JEA"), e: area1 });
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, AtivoAte) VALUES (@m, @p, 'AREA', @e, @a)", { m: P.pastorVencido, p: await papel("Pastor de Área"), e: area2, a: dias(-1) });
  const cliHoje = await sessao("CLI E2E expansão (hoje)", hojeBr());
  const cliOntem = await sessao("CLI E2E expansão (ontem)", dias(-1));
  const cliMeio = await sessao("CLI E2E expansão (5 dias atrás)", dias(-5));
  const cliAberta = await sessao("CLI E2E expansão aberta", hojeBr(), { status: "ABERTA" });
  const cliFutura = await sessao("CLI E2E expansão futura", dias(3));
  const cliSeminario = await sessao("Seminário E2E expansão", hojeBr(), { tipo: "SEMINARIO_AFM" });

  console.log("== a migração 166 ==");
  for (const t of ["PedidosExpansao", "ExtensaoEncarregados"]) ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = @t", { t }) === 1, `tabela ${t} criada`);
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ExtensoesTenda') AND name IN ('Endereco','Bairro','Cidade','UF','AbertaEm','EmancipadaEm','CongregacaoEmancipadaId')") === 7, "ExtensoesTenda ganhou as 7 colunas");
  const pm = await um("SELECT Nivel, Permissoes FROM Papeis WHERE Nome = N'Secretário de Missões'");
  ok(pm && pm.Nivel === "DEPARTAMENTO" && /(^|,)expansao(,|$)/.test(pm.Permissoes) && /(^|,)reunioes(,|$)/.test(pm.Permissoes), "o papel Secretário de Missões nasceu no nível Departamento, com as permissões do Líder Geral e a de expansão");
  ok(await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome IN (N'Presidente', N'Secretário Geral', N'Dirigente de Congregação', N'Pastor de Área', N'Secretário de Missões') AND (',' + Permissoes + ',') LIKE '%,expansao,%'") === 5, "a permissão expansao veio para os cinco papéis");
  ok(await escalar("SELECT COUNT(*) FROM Papeis WHERE (',' + ISNULL(Permissoes,'') + ',') LIKE '%,expansao,%expansao,%'") === 0, "a 166 duas vezes não duplicou a permissão");
  ok(await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave IN (N'EXPANSAO_PEDIDO_NOVO', N'EXPANSAO_PARECER_VENCIDO', N'EXPANSAO_DECIDIDO')") === 3, "as três regras de aviso");
  ok(await escalar("SELECT COUNT(*) FROM PoliticasRetencao WHERE Categoria = N'Expansão: abertura e emancipação' AND BaseLegal <> N'x'") === 1, "a política de retenção com o texto");
  ok(await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'expansao'") === 1, "a funcionalidade expansao");

  console.log("== a CME calculada (Regimento Art. 23) ==");
  let cme = await exDb.composicaoCME(await obterPool());
  const ids = cme.map((m) => m.membroId).sort();
  ok(JSON.stringify(ids) === JSON.stringify([3003, P.missoes]), "a CME: o Secretário de Missões e o Pastor de Área em vigor (sem o Membro da JEA nem o Pastor vencido)", [JSON.stringify(cme)]);
  ok(cme.find((m) => m.membroId === P.missoes).secretarioMissoes && cme.find((m) => m.membroId === P.missoes).comAcessoTela, "o Secretário de Missões marcado, com acesso à tela");
  await q("UPDATE Lideranca SET PapelId = @p WHERE MembroId = @m", { p: await papel("Líder Geral de Departamento/Secretaria"), m: P.missoes });
  cme = await exDb.composicaoCME(await obterPool());
  ok(cme.some((m) => m.membroId === P.missoes && !m.comAcessoTela), "com o papel antigo (Líder Geral da SEMIADESPA) continua na CME, sem acesso à tela");
  let r = await GET("painel");
  ok(r.body.cme.secretarioSemAcesso.length === 1 && !r.body.cme.semSecretario, "o Painel avisa: o Secretário de Missões está com o papel antigo");
  r = await GET("pedidos", {}, L.sessao(P.missoes, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "DEPARTAMENTO", escopoCongregacoes: "TODAS", permissoes: ["reunioes", "pessoas"] }));
  ok(r.status === 200, "quem compõe a CME entra mesmo sem a permissão");
  await q("UPDATE Lideranca SET PapelId = @p WHERE MembroId = @m", { p: papelMissoes, m: P.missoes });

  console.log("== abertura de Extensão da Tenda (Art. 109-A) ==");
  const ABRE = { tipo: "ABERTURA_EXTENSAO", congregacaoMaeId: central, encarregadoMembroId: P.encA, nome: "Tenda Esperança E2E", endereco: "Rua A, 10", bairro: "Bairro Novo", cidade: "Parauapebas", uf: "PA", justificativa: "Doze famílias de membros no bairro; ponto cedido por um irmão." };
  guardar("catalogosDirigente", await GET("catalogos", {}, DIR()));
  ok(contrato.catalogosDirigente.maes.map((m) => m.nome).join() === "Central E2E" && !contrato.catalogosDirigente.tipos.some((t) => t.codigo === "NOVA_CONGREGACAO"), "catálogos do Dirigente: só a congregação dele como Mãe, sem 'nova congregação'");
  r = await POST("pedido", ABRE, DIRV());
  ok(r.status === 422 && /escopo/.test(r.body.mensagem), "o Dirigente de outra congregação não pede pela Central");
  for (const [m, rot] of [[P.vila, "de outra congregação"], [P.desligado, "desligado"], [P.semComunhao, "sem comunhão"], [P.disciplina, "sob disciplina"], [99999, "inexistente"]]) {
    r = await POST("pedido", { ...ABRE, encarregadoMembroId: m }, DIR());
    ok(r.status === 422, `Encarregado ${rot}: recusado`);
  }
  // a recusa não conta nada de quem é de outra congregação: a matrícula inexistente, a de outra congregação e a de outra congregação SOB DISCIPLINA dão a mesma resposta
  const respostas = [];
  for (const m of [99999, P.vila, P.vilaDisciplina]) respostas.push((await POST("pedido", { ...ABRE, encarregadoMembroId: m }, DIR())).body.mensagem);
  ok(new Set(respostas).size === 1 && /própria Congregação-Mãe/.test(respostas[0]), "a recusa do Encarregado de fora não revela se ele existe nem se está sob disciplina", respostas);
  ok(await escalar("SELECT COUNT(*) FROM PedidosExpansao") === 0, "nenhuma recusa gravou pedido");
  r = guardar("pedidoAbertura", await POST("pedido", ABRE, DIR()));
  ok(r.status === 201, "o Dirigente pede a abertura", [JSON.stringify(r.body)]);
  const pAbre = r.body.pedidoId;
  let lin = await um("SELECT * FROM PedidosExpansao WHERE PedidoId = @id", { id: pAbre });
  ok(lin.Status === "AGUARDANDO_CLI" && lin.ParecerCME === null && lin.SolicitadoPor === 3001, "a abertura vai direto à CLI (sem CME), com quem pediu");
  ok(await avisos("EXPANSAO_PEDIDO_NOVO", 1002) === 1 && await avisos("EXPANSAO_PEDIDO_NOVO", 3001) === 0, "o aviso do pedido novo foi ao nível geral (não a quem pediu)");
  r = await POST("parecer", { pedidoId: pAbre, parecer: "FAVORAVEL", fundamentacao: "Viável e bem localizada." }, PASTOR());
  ok(r.status === 422, "a abertura não recebe parecer da CME");
  r = await POST("decidir", { pedidoId: pAbre, sessaoId: cliHoje, resultado: "APROVADO" }, DIR());
  ok(r.status === 403, "o Dirigente não registra a decisão da CLI");
  for (const [s, rot] of [[cliAberta, "aberta"], [cliFutura, "futura"], [cliSeminario, "do Seminário"], [999999, "inexistente"]]) {
    r = await POST("decidir", { pedidoId: pAbre, sessaoId: s, resultado: "APROVADO" });
    ok(r.status === 422, `reunião ${rot}: recusada`);
  }
  r = await POST("decidir", { pedidoId: pAbre, sessaoId: cliOntem, resultado: "APROVADO" });
  ok(r.status === 422 && /anterior ao pedido/.test(r.body.mensagem), "reunião anterior ao pedido: recusada");
  r = await POST("decidir", { pedidoId: pAbre, sessaoId: cliHoje, resultado: "APROVADO", urgencia: true });
  ok(r.status === 422 && /não passa pela CME/.test(r.body.mensagem), "urgência numa abertura (que nem passa pela CME): recusada sem erro");
  ok(await escalar("SELECT COUNT(*) FROM ExtensoesTenda") === 0, "nada foi aberto pelas recusas");
  r = guardar("decidirAbertura", await POST("decidir", { pedidoId: pAbre, sessaoId: cliHoje, resultado: "APROVADO" }));
  ok(r.status === 200, "a CLI aprovou: a Extensão nasceu", [JSON.stringify(r.body)]);
  const ext = await escalar("SELECT ExtensaoId FROM ExtensoesTenda WHERE Nome = N'Tenda Esperança E2E'");
  lin = await um("SELECT * FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext });
  ok(lin && lin.Ativa && lin.CongregacaoMaeId === central && lin.Endereco === "Rua A, 10" && lin.UF === "PA" && L.hojeBr() === new Date(lin.AbertaEm).toISOString().slice(0, 10), "a Extensão ativa, da Central, com o endereço e a data da reunião");
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e AND MembroId = @m AND Ate IS NULL", { e: ext, m: P.encA }) === 1, "o Encarregado em aberto");
  lin = await um("SELECT * FROM PedidosExpansao WHERE PedidoId = @id", { id: pAbre });
  ok(lin.Status === "APROVADO" && lin.ExtensaoCriadaId === ext && lin.DecisaoSessaoId === cliHoje && !lin.DecisaoUrgencia, "o pedido aprovado aponta para a Extensão");
  ok(await avisos("EXPANSAO_DECIDIDO", 3001) === 1, "quem pediu foi avisado da decisão");
  r = await POST("decidir", { pedidoId: pAbre, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 422 && await escalar("SELECT COUNT(*) FROM ExtensoesTenda") === 1, "decidir de novo: recusado, nada duplicado");
  r = await POST("pedido", { ...ABRE, nome: "  TENDA ESPERANCA e2e " }, DIR());
  ok(r.status === 422 && /já tem uma Extensão com esse nome/.test(r.body.mensagem), "outra Extensão com o mesmo nome (maiúscula, acento, espaços): recusada");

  console.log("== o que cada um vê ==");
  ok((await GET("pedidos", {}, DIR())).body.pedidos.some((p) => p.pedidoId === pAbre), "o Dirigente vê o pedido dele");
  ok((await GET("pedidos", {}, DIRV())).body.pedidos.length === 0, "o Dirigente da Vila Nova não vê o pedido da Central");
  ok((await GET("pedido", { pedidoId: pAbre }, DIRV())).status === 404, "nem pela ficha (404, igual a não existir)");
  ok((await GET("extensao-historico", { extensaoId: ext }, DIRV())).status === 404, "nem o histórico da Extensão");
  ok((await GET("pedidos", {}, MISS())).body.pedidos.some((p) => p.pedidoId === pAbre), "a CME vê todos");
  ok((await GET("reunioes", {}, DIR())).status === 403, "as reuniões da CLI só para o nível geral");
  for (const [m, a] of [["GET", "painel"], ["GET", "pedidos"], ["POST", "pedido"], ["POST", "encarregado"]]) {
    ok((await rota(a, { metodo: m, token: OUTRO() })).status === 403, `sem a permissão e fora da CME: 403 (${a})`);
    ok((await rota(a, { metodo: m, token: PINM() })).status === 403, `sessão de PIN: 403 (${a})`);
    ok((await rota(a, { metodo: m })).status === 401, `sem sessão: 401 (${a})`);
  }

  console.log("== troca do Encarregado ==");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encA, motivo: "Mesma pessoa." }, DIR());
  ok(r.status === 422, "a mesma pessoa: recusada");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.semComunhao, motivo: "Troca indevida." }, DIR());
  ok(r.status === 422, "Encarregado sem comunhão: recusado");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encB, motivo: "Troca indevida." }, DIRV());
  ok(r.status === 404, "o Dirigente de outra congregação não troca (404)");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encB, motivo: "Troca indevida." }, PASTOR());
  ok(r.status === 403, "o Pastor da Área vê, mas quem troca o Encarregado é o Dirigente da Mãe (Art. 109-A, I)");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encB, motivo: "Troca indevida." }, MISS());
  ok(r.status === 403 || r.status === 404, "o Secretário de Missões (escopo de departamento) não troca o Encarregado de congregação nenhuma");
  r = await POST("pedido", { ...ABRE, nome: "Tenda do Secretario E2E" }, MISS());
  ok(r.status === 422 && /escopo/.test(r.body.mensagem), "nem pede abertura de Extensão por uma Mãe (o escopo de departamento não alcança congregação)");
  r = await POST("pedido", { ...ABRE, nome: "Tenda do Pastor E2E" }, PASTOR());
  ok(r.status === 422 && /Dirigente/.test(r.body.mensagem), "a abertura (com o Encarregado de confiança) é pedida pelo Dirigente da Mãe, não pelo Pastor da Área");
  ok(!(await GET("extensoes", {}, MISS())).body.extensoes.some((e) => e.pendencia || e.podeEditar || e.podeVerHistorico), "a CME sem escopo na Mãe vê a Extensão, mas não a pendência do Encarregado nem o histórico");
  ok((await GET("extensao-historico", { extensaoId: ext }, MISS())).status === 404, "o histórico (com os motivos de saída) não vai à CME de fora");
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encB, motivo: "A irmã mudou de cidade." }, DIR());
  ok(r.status === 200, "o Dirigente troca o Encarregado");
  const hist = (await GET("extensao-historico", { extensaoId: ext }, DIR())).body.encarregados;
  ok(hist.length === 2 && hist.find((h) => h.membroId === P.encA).ate === hojeBr() && hist.find((h) => h.membroId === P.encA).motivoSaida === "A irmã mudou de cidade." && !hist.find((h) => h.membroId === P.encB).ate, "o histórico: a anterior encerrada com o motivo, o novo em aberto");
  // o Encarregado com acesso de escopo da própria Extensão
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'EXTENSAO', @e)", { m: P.encB, p: await papel("Membro da JAI"), e: ext });
  const ENC = () => L.sessao(P.encB, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "EXTENSAO", escopoCongregacoes: ["Central E2E"], escopoExtensaoNome: "Tenda Esperança E2E", permissoes: ["expansao"] });
  r = await POST("encarregado", { extensaoId: ext, membroId: P.encA, motivo: "Tentativa do próprio." }, ENC());
  ok(r.status === 404 || r.status === 403, "o escopo da Extensão não troca o Encarregado (só a Mãe)");
  r = await POST("pedido", { ...ABRE, nome: "Tenda do Encarregado E2E" }, ENC());
  ok(r.status === 422, "o escopo da Extensão não pede pela Mãe");

  console.log("== emancipação (CME em 15 dias e a CLI) ==");
  await q("UPDATE MembroReferencia SET ExtensaoId = @e WHERE MembroId IN (@a, @b, @c, @x)", { e: ext, a: P.m1, b: P.m2, c: P.m3, x: P.exMembro });
  await q("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) VALUES (@c, N'Membro Tenda 1 E2E', @m)", { c: central, m: P.m1 });
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, 1002)", { s: SID_SEC });
  const sidEnc = crypto.randomUUID();
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, @m)", { s: sidEnc, m: P.encB });
  const EMA = { tipo: "EMANCIPACAO", extensaoId: ext, nome: "Betel E2E", justificativa: "A Extensão tem rol próprio, obreiros formados e sustenta o aluguel." };
  r = await POST("pedido", { ...EMA, nome: "vila nova e2e" }, DIR());
  ok(r.status === 422 && /Já existe uma congregação/.test(r.body.mensagem), "nome de congregação que já existe: recusado");
  r = guardar("pedidoEmancipacao", await POST("pedido", EMA, DIR()));
  ok(r.status === 201, "o Dirigente pede a emancipação", [JSON.stringify(r.body)]);
  const pEma = r.body.pedidoId;
  lin = await um("SELECT * FROM PedidosExpansao WHERE PedidoId = @id", { id: pEma });
  ok(lin.Status === "EM_PARECER" && lin.CongregacaoMaeId === central && lin.ExtensaoId === ext, "a emancipação espera o parecer da CME, guardando a Mãe");
  ok(await avisos("EXPANSAO_PEDIDO_NOVO", 3003) === 1 && await avisos("EXPANSAO_PEDIDO_NOVO", P.missoes) === 1, "o aviso do pedido foi à CME (o Pastor de Área e o Secretário de Missões)");
  r = await POST("pedido", { ...EMA, nome: "Betel Dois E2E" }, DIR());
  ok(r.status === 422 && /já tem um pedido de emancipação/.test(r.body.mensagem), "a mesma Extensão não tem dois pedidos de emancipação em andamento");
  ok(!(await GET("catalogos", {}, DIR())).body.extensoes.some((e) => e.extensaoId === ext), "a Extensão com pedido em andamento sai da lista dos catálogos");
  r = await POST("decidir", { pedidoId: pEma, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 422 && /urgência/.test(r.body.mensagem), "sem o parecer, a CLI só decide com a urgência");
  r = await POST("parecer", { pedidoId: pEma, parecer: "FAVORAVEL", fundamentacao: "Viável: rol próprio e sustento." }, DIR());
  ok(r.status === 403, "quem não é da CME não emite o parecer");
  guardar("pedidoEmParecerCME", await GET("pedido", { pedidoId: pEma }, PASTOR()));
  ok(contrato.pedidoEmParecerCME.pedido.acoes.parecer === true && contrato.pedidoEmParecerCME.pedido.acoes.decidir === false, "a ficha diz à CME que ela pode emitir o parecer (e não decidir)");
  r = guardar("parecer", await POST("parecer", { pedidoId: pEma, parecer: "favoravel", fundamentacao: "Viável: rol próprio de 40 membros e o aluguel sustentado pela Extensão." }, PASTOR()));
  ok(r.status === 200, "o Pastor de Área (CME) emite o parecer");
  r = await POST("parecer", { pedidoId: pEma, parecer: "CONTRARIO", fundamentacao: "Outro parecer em cima." }, MISS());
  ok(r.status === 422, "o parecer não se emite duas vezes");
  lin = await um("SELECT * FROM PedidosExpansao WHERE PedidoId = @id", { id: pEma });
  ok(lin.Status === "AGUARDANDO_CLI" && lin.ParecerCME === "FAVORAVEL" && lin.ParecerPor === 3003, "o parecer gravado; o pedido segue para a CLI");
  await q("UPDATE PedidosExpansao SET SolicitadoEm = @s, ParecerEm = @p WHERE PedidoId = @id", { s: dias(-10), p: dias(-2), id: pEma });
  r = await POST("decidir", { pedidoId: pEma, sessaoId: cliMeio, resultado: "APROVADO" });
  ok(r.status === 422 && /anterior ao parecer/.test(r.body.mensagem), "reunião anterior ao parecer: recusada");
  r = await POST("decidir", { pedidoId: pEma, sessaoId: cliHoje, resultado: "APROVADO", urgencia: true });
  ok(r.status === 422 && /já foi emitido/.test(r.body.mensagem), "com o parecer emitido, não há urgência");
  ok(await escalar("SELECT COUNT(*) FROM Congregacoes WHERE Nome = N'Betel E2E'") === 0, "nada nasceu pelas recusas");
  r = guardar("decidirEmancipacao", await POST("decidir", { pedidoId: pEma, sessaoId: cliHoje, resultado: "APROVADO" }));
  ok(r.status === 200 && r.body.membrosTransferidos === 3, "a CLI aprovou: a congregação nasceu e os 3 membros passaram", [JSON.stringify(r.body)]);
  const betel = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Betel E2E'");
  lin = await um("SELECT * FROM Congregacoes WHERE CongregacaoId = @c", { c: betel });
  ok(lin.Ativa && lin.AreaId === area1 && lin.Endereco === "Rua A, 10" && lin.Estado === "PA" && lin.FundacaoAno === Number(hojeBr().slice(0, 4)) && (lin.Categoria || "CONGREGACAO") === "CONGREGACAO", "a congregação nova: ativa, na Área da Mãe, com o endereço da Extensão e o ano de fundação");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (@a, @b, @c) AND CongregacaoId = @n AND ExtensaoId IS NULL", { a: P.m1, b: P.m2, c: P.m3, n: betel }) === 3, "os membros da Extensão estão na congregação nova (e fora da Extensão)");
  lin = await um("SELECT CongregacaoId, ExtensaoId FROM MembroReferencia WHERE MembroId = @m", { m: P.exMembro });
  ok(lin.CongregacaoId === central && lin.ExtensaoId === ext, "quem já saiu (desligado) fica onde estava: a ficha dele é história da Mãe");
  ok(await escalar("SELECT CongregacaoId FROM Dizimistas WHERE MembroId = @m", { m: P.m1 }) === betel, "o dízimo de quem passou vai à tesouraria da congregação nova");
  ok(await escalar("SELECT COUNT(*) FROM OrgaosLocais WHERE Nivel = 1 AND ReferenciaId = @c AND Sigla = N'JAI' AND Ativo = 1", { c: betel }) === 1, "a JAI da congregação nova já existe (sem esperar o próximo deploy)");
  lin = await um("SELECT * FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext });
  ok(!lin.Ativa && lin.CongregacaoEmancipadaId === betel && lin.EmancipadaEm, "a Extensão ficou inativa, emancipada, apontando para a congregação nova");
  ok(await escalar("SELECT COUNT(*) FROM ExtensaoEncarregados WHERE ExtensaoId = @e AND Ate IS NULL", { e: ext }) === 0, "o Encarregado da Extensão foi encerrado");
  ok(new Date(await escalar("SELECT AtivoAte FROM Lideranca WHERE MembroId = @m", { m: P.encB })).toISOString().slice(0, 10) === dias(-1), "o acesso com escopo da Extensão terminou (vence ontem)");
  ok(await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: sidEnc }) === true && await escalar("SELECT Encerrada FROM SessoesAtivas WHERE SessaoId = @s", { s: SID_SEC }) === false, "as sessões abertas caíram, menos a de quem registrou");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'ExtensoesTenda' AND Acao = N'EXTENSAO_EMANCIPADA' AND DadosDepois LIKE '%' + CAST(@m AS varchar(10)) + '%'", { m: P.m2 }) === 1, "a auditoria guarda a lista dos membros transferidos");
  r = await POST("pedido", { ...EMA, nome: "Betel Três E2E" }, DIR());
  ok(r.status === 422 && /já foi emancipada/.test(r.body.mensagem), "a Extensão emancipada não se emancipa de novo");
  r = guardar("painelDepois", await GET("painel"));
  ok(r.body.congregacoesSemDirigente.some((c) => c.congregacaoId === betel), "o Painel: a congregação nova ainda sem Dirigente");
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'CONGREGACAO', @c)", { m: P.m2, p: await papel("Membro da JAI"), c: betel });
  ok((await GET("painel")).body.congregacoesSemDirigente.some((c) => c.congregacaoId === betel), "outro papel de nível Congregação (Membro da JAI) não tira a pendência: só o Dirigente");
  // depois da emancipação, a Extensão não serve mais de escopo nem de cadastro
  r = await chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: L.GERAL(1002, ["pessoas"]), corpo: { membroId: P.m3, nome: "Membro Tenda 3 E2E", congregacaoId: central, status: "ATIVO", extensaoId: ext } });
  ok(r.body && r.body.sucesso === false && /Extensão da Tenda inválida/.test(r.body.mensagem), "o cadastro de pessoas não põe ninguém na Extensão emancipada", [JSON.stringify(r.body)]);
  r = await chamarRota("GestaoCatalogos/index.js", { metodo: "POST", binding: { catalogo: "extensoes" }, token: L.GERAL(1002, ["pessoas"]), corpo: { id: ext, nome: "Tenda Esperança E2E", congregacaoMaeId: central, ativa: true } });
  ok(r.body && r.body.sucesso === false && /emancipada/.test(r.body.mensagem) && !(await escalar("SELECT Ativa FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext })), "o cadastro de Extensões não reativa a emancipada (sem erro)", [r.status, JSON.stringify(r.body)]);
  r = await chamarRota("GestaoCatalogos/index.js", { metodo: "DELETE", binding: { catalogo: "congregacoes", id: String(betel) }, token: L.GERAL(1002, ["pessoas"]) });
  ok(r.status !== 500 && r.body && r.body.sucesso === false && await escalar("SELECT COUNT(*) FROM Congregacoes WHERE CongregacaoId = @c", { c: betel }) === 1, "a congregação nascida de um pedido não se exclui (em uso, sem erro)", [r.status, JSON.stringify(r.body)]);
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (@m, @p, 'CONGREGACAO', @c)", { m: P.m1, p: await papel("Dirigente de Congregação"), c: betel });
  ok(!(await GET("painel")).body.congregacoesSemDirigente.some((c) => c.congregacaoId === betel), "com o Dirigente cadastrado em Liderança, a pendência some sozinha");
  guardar("extensoesTodas", await GET("extensoes", { todas: 1 }));
  ok(contrato.extensoesTodas.extensoes.some((e) => e.extensaoId === ext && e.emancipadaNome === "Betel E2E" && !e.podeEditar), "a lista completa mostra a emancipada com o nome da congregação");
  ok(!(await GET("extensoes")).body.extensoes.some((e) => e.extensaoId === ext), "a lista das ativas não traz a emancipada");

  console.log("== nova congregação (urgência) e o parecer vencido ==");
  r = await POST("pedido", { tipo: "NOVA_CONGREGACAO", nome: "Filadélfia E2E", justificativa: "Bairro novo sem igreja perto, com 30 famílias.", areaId: area2 }, DIR());
  ok(r.status === 403, "o Dirigente não pede nova congregação");
  r = await POST("pedido", { tipo: "NOVA_CONGREGACAO", nome: "Filadélfia E2E", justificativa: "Bairro novo sem igreja perto, com 30 famílias.", areaId: 999999 });
  ok(r.status === 422, "Área inexistente: recusada");
  r = await POST("pedido", { tipo: "NOVA_CONGREGACAO", nome: "Filadélfia E2E", justificativa: "Bairro novo sem igreja perto, com 30 famílias.", areaId: area2 });
  ok(r.status === 201, "o nível geral pede a nova congregação");
  const pNova = r.body.pedidoId;
  r = await POST("parecer", { pedidoId: pNova, parecer: "FAVORAVEL", fundamentacao: "Pedido do próprio Secretário Geral." }, SEC());
  ok(r.status === 403, "o Secretário Geral (fora da CME) não emite parecer");
  ok((await exDb.detectarParecerVencido(await obterPool())).length === 0, "dentro dos 15 dias: nenhum aviso de vencido");
  await q("UPDATE PedidosExpansao SET SolicitadoEm = @s WHERE PedidoId = @id", { s: dias(-16), id: pNova });
  const fatos = await exDb.detectarParecerVencido(await obterPool());
  ok(fatos.length === 1 && fatos[0].referenciaId === pNova && /1 dia de atraso/.test(fatos[0].fatoGerador), "no 16º dia, o aviso do parecer vencido", [JSON.stringify(fatos)]);
  const dest = fatos[0].destinatarios.map((d) => d.membroId);
  ok(dest.includes(3003) && dest.includes(P.missoes) && dest.includes(1002) && new Set(dest).size === dest.length, "o aviso vai à CME e ao nível geral, sem repetir ninguém");
  r = guardar("painelVencido", await GET("painel"));
  ok(r.body.parecerVencido.some((p) => p.pedidoId === pNova), "o Painel mostra o parecer vencido");
  r = await POST("decidir", { pedidoId: pNova, sessaoId: cliHoje, resultado: "APROVADO", urgencia: true });
  ok(r.status === 200, "a CLI decidiu em regime de urgência (sem o parecer)", [JSON.stringify(r.body)]);
  lin = await um("SELECT p.DecisaoUrgencia, c.AreaId FROM PedidosExpansao p JOIN Congregacoes c ON c.CongregacaoId = p.CongregacaoCriadaId WHERE p.PedidoId = @id", { id: pNova });
  ok(lin && lin.DecisaoUrgencia && lin.AreaId === area2, "a urgência ficou registrada e a congregação nasceu na Área escolhida");

  console.log("== desistência e recusa ==");
  r = await POST("pedido", { ...ABRE, nome: "Tenda Dois E2E", encarregadoMembroId: P.encA }, DIR());
  const pDois = r.body.pedidoId;
  ok((await POST("desistir", { pedidoId: pDois, motivo: "Não é meu." }, DIRV())).status === 404, "outro Dirigente não desiste (404)");
  ok((await POST("desistir", { pedidoId: pDois, motivo: "Não é meu." }, PASTOR())).status === 403, "a CME vê, mas não desiste do pedido alheio");
  ok((await POST("desistir", { pedidoId: pDois }, DIR())).status === 422, "desistir pede o motivo");
  ok((await POST("desistir", { pedidoId: pDois, motivo: "O ponto cedido não está mais disponível." }, DIR())).status === 200, "quem pediu desiste");
  ok((await POST("desistir", { pedidoId: pDois, motivo: "De novo." }, DIR())).status === 422, "desistir de novo: recusado");
  ok((await POST("decidir", { pedidoId: pDois, sessaoId: cliHoje, resultado: "APROVADO" })).status === 422, "o pedido retirado não se decide");
  r = await POST("pedido", { ...ABRE, nome: "Tenda Três E2E" }, DIR());
  const pTres = r.body.pedidoId;
  ok((await POST("decidir", { pedidoId: pTres, sessaoId: cliHoje, resultado: "REJEITADO" })).status === 422, "a recusa pede o motivo");
  ok((await POST("decidir", { pedidoId: pTres, sessaoId: cliHoje, resultado: "REJEITADO", motivo: "Sem obreiro disponível para encarregar." })).status === 200, "a CLI recusou");
  ok(await escalar("SELECT COUNT(*) FROM ExtensoesTenda WHERE Nome = N'Tenda Três E2E'") === 0 && await avisos("EXPANSAO_DECIDIDO", 3001) === 3, "a recusa não abre nada e avisa quem pediu");

  console.log("== o que muda entre o pedido e a decisão ==");
  r = await POST("pedido", { ...ABRE, nome: "Tenda Quatro E2E", encarregadoMembroId: P.encA }, DIR());
  const pQuatro = r.body.pedidoId;
  await q("UPDATE Congregacoes SET Categoria = 'EXTENSAO_TENDA' WHERE CongregacaoId = @c", { c: central });
  r = await POST("decidir", { pedidoId: pQuatro, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 422 && /não está mais ativa como congregação/.test(r.body.mensagem), "a Mãe rebaixada depois do pedido: a abertura não se executa");
  ok((await GET("catalogos", {}, DIR())).body.maes.length === 0, "a Mãe rebaixada some dos catálogos");
  r = await POST("pedido", { ...ABRE, nome: "Tenda Cinco E2E" }, DIR());
  ok(r.status === 422 && /rebaixada/.test(r.body.mensagem), "a Mãe rebaixada não pede Extensão (Art. 129 §3º)");
  await q("UPDATE Congregacoes SET Categoria = 'CONGREGACAO' WHERE CongregacaoId = @c", { c: central });
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'SEM_COMUNHAO' WHERE MembroId = @m", { m: P.encA });
  r = await POST("decidir", { pedidoId: pQuatro, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 422 && /comunhão/.test(r.body.mensagem), "o Encarregado perdeu a comunhão depois do pedido: a abertura não se executa");
  await q("UPDATE MembroReferencia SET SituacaoMembro = 'EM_COMUNHAO' WHERE MembroId = @m", { m: P.encA });
  await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) VALUES (N'TENDA QUATRO e2e', @c, 1)", { c: central });
  r = await POST("decidir", { pedidoId: pQuatro, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 422 && /já tem uma Extensão com esse nome/.test(r.body.mensagem), "a homônima cadastrada entre o pedido e a decisão: recusada");
  await q("DELETE FROM ExtensoesTenda WHERE Nome = N'TENDA QUATRO e2e'");
  ok(await escalar("SELECT Status FROM PedidosExpansao WHERE PedidoId = @id", { id: pQuatro }) === "AGUARDANDO_CLI", "nenhuma recusa mexeu no pedido");
  r = await POST("decidir", { pedidoId: pQuatro, sessaoId: cliHoje, resultado: "APROVADO" });
  ok(r.status === 200, "resolvido, a abertura se executa");
  const ext4 = await escalar("SELECT ExtensaoId FROM ExtensoesTenda WHERE Nome = N'Tenda Quatro E2E'");
  r = guardar("extensoesAtivas", await GET("extensoes", {}, DIR()));
  ok(r.body.extensoes.some((e) => e.extensaoId === ext4 && e.encarregado && e.encarregado.membroId === P.encA && !e.pendencia), "a Extensão nova sem pendência");
  await q("UPDATE MembroReferencia SET CongregacaoId = @v WHERE MembroId = @m", { v: vila, m: P.encA });
  r = await GET("extensoes", {}, DIR());
  ok(/não preenche mais os requisitos/.test(r.body.extensoes.find((e) => e.extensaoId === ext4).pendencia || ""), "o Encarregado mudou de congregação: a pendência aparece");
  ok((await GET("painel", {}, DIR())).body.extensoesComPendencia.some((e) => e.extensaoId === ext4), "e vai ao Painel do Dirigente");
  await q("UPDATE MembroReferencia SET CongregacaoId = @c WHERE MembroId = @m", { c: central, m: P.encA });

  console.log("== garantias do banco ==");
  await falhaNoBanco("a urgência numa abertura", "UPDATE PedidosExpansao SET DecisaoUrgencia = 1 WHERE PedidoId = @id", { id: pAbre });
  await falhaNoBanco("a abertura sem o Encarregado", "INSERT INTO PedidosExpansao (Tipo, Status, Nome, Justificativa, CongregacaoMaeId, SolicitadoPor, SolicitadoEm) VALUES (N'ABERTURA_EXTENSAO', N'AGUARDANDO_CLI', N'X', N'Justificativa X', @c, 1, @h)", { c: central, h: hojeBr() });
  await falhaNoBanco("a emancipada reativada", "UPDATE ExtensoesTenda SET Ativa = 1 WHERE ExtensaoId = @e", { e: ext });
  await falhaNoBanco("dois Encarregados em aberto", "INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde) VALUES (@e, @m, @h)", { e: ext4, m: P.encB, h: hojeBr() });
  await falhaNoBanco("aprovado sem a unidade criada", "UPDATE PedidosExpansao SET Status = N'APROVADO', DecisaoResultado = N'APROVADO', DecisaoSessaoId = @s, DecisaoEm = @h WHERE PedidoId = @id", { s: cliHoje, h: hojeBr(), id: pTres });
  await falhaNoBanco("parecer antes do pedido", "UPDATE PedidosExpansao SET ParecerEm = DATEADD(DAY, -30, SolicitadoEm) WHERE PedidoId = @id", { id: pEma });
  await falhaNoBanco("decisão antes do parecer", "UPDATE PedidosExpansao SET DecisaoEm = DATEADD(DAY, -1, ParecerEm) WHERE PedidoId = @id", { id: pEma });
  await falhaNoBanco("parecer numa abertura", "UPDATE PedidosExpansao SET ParecerCME = N'FAVORAVEL', ParecerFundamentacao = N'x', ParecerPor = 1, ParecerEm = SolicitadoEm WHERE PedidoId = @id", { id: pAbre });
  await falhaNoBanco("duas emancipações em andamento da mesma Extensão",
    "INSERT INTO PedidosExpansao (Tipo, Status, Nome, Justificativa, CongregacaoMaeId, ExtensaoId, SolicitadoPor, SolicitadoEm) VALUES (N'EMANCIPACAO', N'EM_PARECER', N'A', N'J', @c, @e, 1, @h), (N'EMANCIPACAO', N'EM_PARECER', N'B', N'J', @c, @e, 1, @h)", { c: central, e: ext4, h: hojeBr() });

  console.log("== Meus Dados, Comissões e Projetos ==");
  r = await chamarRota("MeusDadosLGPD/index.js", { binding: { matricula: String(P.encA) }, token: L.sessao(P.encA, { via: "PIN" }) });
  const meus = r.body.extensoesEncarregadas || [];
  ok(meus.length === 2 && meus.some((x) => x.extensao === "Tenda Esperança E2E" && x.ate) && meus.some((x) => x.extensao === "Tenda Quatro E2E" && !x.ate), "Meus Dados: a Encarregada vê as Extensões que encarregou e encarrega");
  r = await chamarRota("GestaoComissoes/index.js", { token: SEC() });
  ok(r.status === 200 && r.body.CME.length === 2 && r.body.CME.every((m) => !("email" in m)), "a tela das Comissões mostra a CME, sem o e-mail");
  r = await chamarRota("GestaoProjetos/index.js", { metodo: "POST", token: L.GERAL(1002, ["reunioes", "cli"]), corpo: { autorMembroId: P.missoes, titulo: "Plano de expansão E2E", texto: "Texto do projeto de expansão.", comissaoTematica: "CME" } });
  ok(r.body && r.body.sucesso === true, "um projeto pode ir à CME como comissão temática", [JSON.stringify(r.body)]);
  const projeto = await escalar("SELECT TOP 1 ProjetoId FROM Projetos WHERE ComissaoTematica = 'CME' ORDER BY ProjetoId DESC");
  r = await chamarRota("GestaoProjetos/index.js", { metodo: "POST", binding: { id: String(projeto), acao: "parecer", sigla: "CME" }, token: MISS(), corpo: { parecer: "FAVORAVEL" } });
  ok(r.body && r.body.sucesso === false && /protocolou/.test(r.body.mensagem), "o autor do projeto (o Secretário de Missões) não emite o parecer sobre ele", [JSON.stringify(r.body)]);
  r = await chamarRota("GestaoProjetos/index.js", { metodo: "POST", binding: { id: String(projeto), acao: "parecer", sigla: "CME" }, token: DIRV(), corpo: { parecer: "FAVORAVEL" } });
  ok(!(r.body && r.body.sucesso === true), "quem não é da CME não emite o parecer da CME no projeto");
  r = await chamarRota("GestaoProjetos/index.js", { metodo: "POST", binding: { id: String(projeto), acao: "parecer", sigla: "CME" }, token: PASTOR(), corpo: { parecer: "FAVORAVEL" } });
  ok(r.body && r.body.sucesso === true, "o Pastor de Área (CME) emite o parecer da CME no projeto", [JSON.stringify(r.body)]);

  console.log("== a CME sem quem está sob disciplina; o primeiro Encarregado sem motivo; a 166 não devolve a permissão ==");
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.missoes, d: hojeBr() });
  ok(!(await exDb.composicaoCME(await obterPool())).some((m) => m.membroId === P.missoes), "o Secretário de Missões sob disciplina sai da CME (não dá parecer)");
  await q("DELETE FROM ProcessosDisciplinares WHERE MembroId = @m", { m: P.missoes });
  const semEnc = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Sem Encarregado E2E', @c, 1)", { c: central });
  r = await POST("encarregado", { extensaoId: semEnc, membroId: P.encB }, DIR());
  ok(r.status === 200 && /definido/.test(r.body.mensagem), "o primeiro Encarregado se define sem motivo (ninguém sai)", [JSON.stringify(r.body)]);
  r = await POST("encarregado", { extensaoId: semEnc, membroId: P.encA }, DIR());
  ok(r.status === 422 && /motivo/.test(r.body.mensagem), "a troca pede o motivo (quem sai fica com o registro)");
  await q("UPDATE Papeis SET Permissoes = REPLACE(',' + Permissoes + ',', ',expansao,', ',') WHERE Nome = N'Dirigente de Congregação'");
  await q("UPDATE Papeis SET Permissoes = SUBSTRING(Permissoes, 2, LEN(Permissoes) - 2) WHERE Nome = N'Dirigente de Congregação'");
  const mig = require("child_process").spawnSync(process.execPath, ["-r", "./shim-mssql.js", "aplicar-migracao.js", "166"], { cwd: __dirname, encoding: "utf8" });
  ok(/aplicada/.test(mig.stdout || ""), "a 166 aplicada de novo (o próximo deploy)", [(mig.stdout || "") + (mig.stderr || "")]);
  ok(await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Dirigente de Congregação' AND (',' + Permissoes + ',') LIKE '%,expansao,%'") === 0, "a permissão tirada em Permissões não volta com o deploy");
  ok(await escalar("SELECT COUNT(*) FROM Papeis WHERE Nome = N'Dirigente de Congregação' AND (',' + Permissoes + ',') LIKE '%,reunioes,%'") === 1, "e as outras permissões do papel ficaram intactas");

  console.log("== auditoria ==");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela IN (N'PedidosExpansao', N'ExtensoesTenda', N'Congregacoes') AND (Acao LIKE N'EXPANSAO%' OR Acao LIKE N'EXTENSAO%' OR Acao LIKE N'CONGREGACAO[_]%')") >= 15, "auditoria: cada ato gravou a sua linha");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela IN (N'PedidosExpansao', N'ExtensoesTenda') AND (RegistroId IS NULL OR Acao IS NULL)") === 0, "auditoria: nenhuma linha sem registro");

  console.log("== lixo em cada campo ==");
  await fuzz("pedido (abertura)", "pedido", { ...ABRE, nome: "Tenda Lixo E2E" }, ["tipo", "nome", "congregacaoMaeId", "encarregadoMembroId", "justificativa", "uf", "endereco"], DIR());
  await fuzz("pedido (emancipação)", "pedido", { tipo: "EMANCIPACAO", extensaoId: ext4, nome: "Lixo Cong E2E", justificativa: "Justificativa de teste com lixo." }, ["extensaoId", "areaId", "nome"], SEC());
  await q("UPDATE PedidosExpansao SET Status = N'DESISTIDO', DesistidoEm = SolicitadoEm, DesistidoPor = 1, DesistenciaMotivo = N'limpeza do lixo' WHERE Nome = N'Lixo Cong E2E' AND Status = N'EM_PARECER'");
  r = await POST("pedido", { tipo: "NOVA_CONGREGACAO", nome: "Lixo Parecer E2E", justificativa: "Para o lixo no parecer." });
  const pLixo = r.body.pedidoId;
  await fuzz("parecer", "parecer", { pedidoId: pLixo, parecer: "CONTRARIO", fundamentacao: "Fundamentação de teste." }, ["pedidoId", "parecer", "fundamentacao"], MISS());
  r = await POST("pedido", { tipo: "NOVA_CONGREGACAO", nome: "Lixo Decisao E2E", justificativa: "Para o lixo na decisão." });
  await fuzz("decidir", "decidir", { pedidoId: r.body.pedidoId, sessaoId: cliHoje, resultado: "REJEITADO", motivo: "Motivo de teste" }, ["pedidoId", "sessaoId", "resultado", "urgencia", "motivo"]);
  await fuzz("encarregado", "encarregado", { extensaoId: ext4, membroId: P.encA, motivo: "Motivo de teste" }, ["extensaoId", "membroId", "motivo"], DIR());
  await fuzz("desistir", "desistir", { pedidoId: pLixo, motivo: "Motivo de teste" }, ["pedidoId", "motivo"], SEC());

  guardar("catalogosGeral", await GET("catalogos"));
  guardar("catalogosCME", await GET("catalogos", {}, PASTOR()));
  guardar("painelGeral", await GET("painel"));
  guardar("pedidosGeral", await GET("pedidos"));
  guardar("pedidoFinal", await GET("pedido", { pedidoId: pEma }));
  guardar("reunioes", await GET("reunioes"));
  guardar("historico", await GET("extensao-historico", { extensaoId: ext }));
  if (process.env.E2E_CONTRATO === "1") {
    const destino = path.join(__dirname, "..", "front-expansao", "contrato-real.json");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log("contrato gravado em", destino);
  }
  fim("e2e-71 expansão");
})().catch((e) => { console.log("FALHOU:", e && e.stack); process.exitCode = 1; L.shimEncerrar(); });
