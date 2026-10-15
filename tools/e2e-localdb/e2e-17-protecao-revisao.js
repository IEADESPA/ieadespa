// e2e-17-protecao-revisao.js — v7.8: o que a revisão independente da proteção de crianças pediu e que os roteiros 14 a 16 ainda não cobriam, contra o SQL Server real:
// vincular a pessoa do cadastro ao envolvido; os tetos de registro por pessoa e do canal de ajuda; a regra de aviso obrigatória que ninguém desliga; a rotina horária que só abre o banco
// quando há prazo correndo; o reenvio do e-mail que não saiu. Parte da base "cenario-protecao": BASE=cenario-protecao bash rodar.sh roteiro e2e-17-protecao-revisao.js
process.env.CRON_SECRET = "segredo-cron-so-do-teste-e2e";
const fs = require("fs");
const L = require("./lib");
const { q, um, escalar, ok, fim, GET, POST, GERAL, LIDER, PIN, sessao, API, path, obterPool, chamar } = L;
const P = require(path.join(API, "GestaoProtecaoMenores/index.js"));
const VERIFICADOR = require(path.join(API, "ProtecaoVerificador/index.js"));
const REGRAS = require(path.join(API, "GestaoNotificacaoRegras/index.js"));
const pdb = require(path.join(API, "shared/protecaoDb.js"));
const pendencia = require(path.join(API, "shared/protecaoPendencia.js"));
const storage = require(path.join(API, "shared/storage.js"));
const notificacoes = require(path.join(API, "shared/notificacoes.js"));
const { eq, c1 } = JSON.parse(fs.readFileSync(path.join(__dirname, "cenario-menores.json"), "utf8"));
const hoje = L.hojeBr();
const PERM = ["protecao_menores"];
const presidente = GERAL(1001, PERM);
const secretarioGeral = GERAL(1002, PERM);
const semFator = sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM });
const dirCentral = LIDER(3001, PERM, ["Central E2E"]);
const incidente = (extra = {}) => ({ nivel: "QUEBRA_POLITICA", dataOcorrencia: hoje, congregacaoId: c1, descricao: "Um adulto ficou a sós com uma criança na sala do maternal.", ...extra });
const alegacao = (extra = {}) => incidente({ nivel: "ALEGACAO", relatadoPor: "VOLUNTARIO", relato: "A criança disse, com as palavras dela, que o tio a machucou no banheiro.", ...extra });
const idDe = async (protocolo) => escalar("SELECT IncidenteId FROM IncidentesProtecao WHERE Protocolo = @p", { p: protocolo });
const aloca = (servico, equipe, membro) => q("INSERT INTO EscalasAlocacoes (ServicoId, EquipeId, MembroId, Status) VALUES (@s, @e, @m, 'ACEITO')", { s: servico, e: equipe, m: membro });
const servico = async (dataHora) => (await q("INSERT INTO EscalasServicos (CongregacaoId, DataHora, Descricao, Status) VALUES (@c, @d, N'Culto P78 revisão', 'RASCUNHO'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1, d: dataHora }))[0].id;
const chamarRotina = async (handler, headers = {}) => { const ctx = { bindingData: {}, log: Object.assign(() => { }, { error() { }, info() { }, warn() { }, verbose() { } }) }; await handler(ctx, { method: "POST", headers, query: {}, body: {} }); return ctx.res || { status: 0, body: null }; };

(async () => {
  let r;
  const pool = await obterPool();

  console.log("== vincular a pessoa do cadastro ao envolvido (só nível geral, confirmação reforçada) ==");
  r = await POST(P, "registrar", PIN(6013), alegacao({ envolvidoNome: "Fulano de Tal (apelido do vizinho)", descricao: "Relato de quem só sabe o apelido da pessoa envolvida, sem a matrícula." }));
  ok(r.status === 201, "registro de suspeita com a pessoa só por nome", r.body);
  const alg = await idDe(r.body.protocolo);
  let d = await GET(P, "incidente", presidente, { incidenteId: alg });
  ok(d.status === 200 && d.body.envolvidos.length === 1 && d.body.envolvidos[0].membroId == null && d.body.acoes.vincularEnvolvido === true, "a Diretoria vê o envolvido só por nome e a ação de vincular", d.body.acoes);
  ok(Array.isArray(d.body.possiveisMembros), "e recebe a lista de pessoas do cadastro para escolher", typeof d.body.possiveisMembros);
  d = await GET(P, "incidente", dirCentral, { incidenteId: alg });
  ok(d.status === 200 && d.body.acoes.vincularEnvolvido === false && !("possiveisMembros" in d.body && d.body.possiveisMembros && d.body.possiveisMembros.length), "o Dirigente da congregação não vincula e não recebe a lista de pessoas", d.body.acoes);
  r = await POST(P, "vincular-envolvido", dirCentral, { incidenteId: alg, membroId: 6011 }); ok(r.status === 403, "o Dirigente é recusado (nível geral)", r.status);
  r = await POST(P, "vincular-envolvido", PIN(6013), { incidenteId: alg, membroId: 6011 }); ok(r.status === 403, "quem registrou também", r.status);
  r = await POST(P, "vincular-envolvido", semFator, { incidenteId: alg, membroId: 6011 }); ok(r.status === 428, "sem a confirmação reforçada: 428", r.status);
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: alg, membroId: 999999 }); ok(r.status === 422 && /não foi encontrada/.test(r.body.mensagem), "matrícula que não existe: 422", r.body);
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: 999999, membroId: 6011 }); ok(r.status === 404, "incidente que não existe: 404", r.status);
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: alg, membroId: "abc" }); ok(r.status === 400 || r.status === 422, "matrícula que não é número: recusada", r.status);
  const sv = await servico(new Date(Date.now() + 3 * 86400000));
  await aloca(sv, eq.bercario, 6011);
  const semAntes = await escalar("SELECT COUNT(*) FROM Notificacoes");
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: alg, membroId: 6011 });
  ok(r.status === 200 && r.body.sucesso === true && /escalas com menores/.test(r.body.mensagem), "a Diretoria vincula e a pessoa sai das escalas por cautela", r.body);
  ok((await escalar("SELECT Status FROM EscalasAlocacoes WHERE ServicoId = @s AND MembroId = 6011", { s: sv })) === "CANCELADA", "a escala futura foi desmarcada na hora");
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: alg, membroId: 6011 }); ok(r.status === 422 && /já está vinculada/.test(r.body.mensagem), "vincular a mesma pessoa duas vezes: 422", r.body);
  d = await GET(P, "incidente", presidente, { incidenteId: alg });
  ok(d.body.envolvidos.length === 2 && d.body.envolvidos.some((e) => e.membroId === 6011 && e.afastamentoCautelar === true), "o envolvido vinculado entra com o afastamento cautelar", d.body.envolvidos);
  r = await POST(P, "encerrar", presidente, { incidenteId: alg, resultado: "ENCAMINHADO_AUTORIDADE", providencia: "Comunicado ao Conselho Tutelar." });
  ok(r.status === 422 && /Comitê decidir/.test(r.body.mensagem), "o caso não fecha antes de o Comitê decidir sobre o afastamento da pessoa vinculada", r.body);
  const audVinc = await q("SELECT RegistroId, UsuarioId, DadosDepois FROM AuditLog WHERE Acao = 'PROTECAO_ENVOLVIDO_VINCULADO'");
  ok(audVinc.length === 1 && audVinc[0].RegistroId === 0 && audVinc[0].UsuarioId === null && !/6011|Fulano/.test(String(audVinc[0].DadosDepois)), "a auditoria do vínculo é sem ator, sem número da pessoa e sem nome (suspeita de violência)", audVinc[0]);
  const vistaDele = await GET(P, "meus", LIDER(6011, PERM, ["Central E2E"]));
  ok(vistaDele.status === 200 && !JSON.stringify(vistaDele.body).includes(String(alg)) || (vistaDele.body.incidentes || []).length === 0, "a pessoa vinculada não vê o incidente em lugar nenhum (nem em Meus registros)", vistaDele.body);
  r = await GET(P, "incidente", LIDER(6011, PERM, ["Central E2E"]), { incidenteId: alg }); ok(r.status === 404, "nem abre o detalhe (404)", r.status);
  void semAntes;
  // incidente encerrado: não vincula mais (usa a rota do banco; o encerramento tem os seus próprios roteiros)
  const encerrado = await q("INSERT INTO IncidentesProtecao (Protocolo, Nivel, Origem, RegistradoPorMembroId, CongregacaoId, DataOcorrencia, Descricao, Status, ExigeComunicacao, ConhecidoEm, RegistradoEm) VALUES (N'PRO-2026-ENC1', 'QUEBRA_POLITICA', 'MEMBRO', 6016, @c, CAST(SYSUTCDATETIME() AS DATE), N'Caso já encerrado para o teste de vínculo.', 'ABERTO', 0, SYSUTCDATETIME(), SYSUTCDATETIME()); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: c1 });
  await q("UPDATE IncidentesProtecao SET Status = 'ENCERRADO', EncerradoEm = SYSUTCDATETIME(), EncerradoPorMembroId = 1001, EncerramentoResultado = 'MEDIDA_INTERNA', EncerramentoProvidencia = N'Conversa e reforço da regra.' WHERE IncidenteId = @i", { i: encerrado[0].id });
  r = await POST(P, "vincular-envolvido", presidente, { incidenteId: encerrado[0].id, membroId: 6012 }); ok(r.status === 422 && /encerrado/.test(r.body.mensagem), "incidente encerrado não recebe novo vínculo", r.body);

  console.log("== teto de registros por pessoa (10 em 24 horas, 3 suspeitas) ==");
  for (let i = 0; i < 10; i++) {
    r = await POST(P, "registrar", PIN(6014), incidente({ descricao: `Registro de teste do teto, número ${i}: a porta da sala ficou fechada com um adulto e uma criança.` }));
    if (r.status !== 201) break;
  }
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE RegistradoPorMembroId = 6014")) === 10, "dez registros passam");
  r = await POST(P, "registrar", PIN(6014), incidente({ descricao: "O décimo primeiro registro do mesmo dia, mesmo por pessoa de boa-fé." }));
  ok(r.status === 429 && r.body.limite === true && /100/.test(r.body.mensagem) && /190/.test(r.body.mensagem), "o décimo primeiro é recusado e a resposta manda ligar para o 100 ou 190 (a criança em perigo não fica sem caminho)", r.body);
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE RegistradoPorMembroId = 6014")) === 10, "e nada foi gravado");
  for (let i = 0; i < 3; i++) {
    r = await POST(P, "registrar", PIN(6015), alegacao({ envolvidoNome: `Pessoa sem matrícula ${i}`, descricao: `Suspeita de teste ${i}: a criança contou algo grave, dito com as palavras dela.` }));
    ok(r.status === 201, `suspeita ${i + 1} de 3 passa`, r.body);
  }
  r = await POST(P, "registrar", PIN(6015), alegacao({ envolvidoNome: "Outra pessoa", descricao: "Quarta suspeita em 24 horas da mesma pessoa que registra." }));
  ok(r.status === 429 && r.body.limite === true, "a quarta suspeita do dia é recusada (teto de 3)", r.body);
  r = await POST(P, "registrar", PIN(6015), incidente({ descricao: "Mas uma quebra de política comum ainda passa depois das três suspeitas." }));
  ok(r.status === 201, "o teto das suspeitas não trava o registro das quebras comuns", r.body);

  console.log("== teto do canal de ajuda sem login (15 por hora) ==");
  const base = { quemSou: "OUTRA_PESSOA", contato: "WhatsApp 91 90000-0000" };
  let aceitos = 0, limitados = 0, outros = [];
  for (let i = 0; i < 16; i++) {
    const rr = await pdb.registrarPedidoDeAjuda(pool, { dados: { ...base, texto: `Pedido de ajuda de teste número ${i}: vi um adulto da igreja ficar sozinho com uma criança várias vezes.` } });
    if (rr.sucesso) aceitos++; else if (rr.limite) limitados++; else outros.push(rr);
  }
  ok(aceitos === 15 && limitados === 1 && outros.length === 0, "15 pedidos entram e o 16º é barrado com a orientação (sem 500)", { aceitos, limitados, outros });
  const barrado = await pdb.registrarPedidoDeAjuda(pool, { dados: { ...base, texto: "Mais um pedido de ajuda de teste depois de bater no teto do canal." } });
  ok(barrado.limite === true && /100/.test(barrado.mensagem) && /190/.test(barrado.mensagem), "a resposta do barrado mostra o 100 e o 190", barrado);
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE Origem = 'CANAL_AJUDA'")) === 15, "e só 15 ficaram gravados");

  console.log("== a regra de aviso que protege criança não se desliga ==");
  const adm = GERAL(1001, ["permissoes"]);
  const regrasDe = (chave, corpo, token = adm) => chamar(REGRAS, { acao: undefined, metodo: "PUT", corpo, token });
  const comChave = async (chave, corpo, token = adm) => { const ctx = { bindingData: { chave }, log: { error() { }, info() { }, warn() { }, verbose() { } } }; await REGRAS(ctx, { method: "PUT", query: {}, body: corpo, headers: { "x-auth-token": token } }); return ctx.res; };
  void regrasDe;
  r = await comChave("PROTECAO_PRAZO_24H", { ativa: false }); ok(r.status === 422 && /protege crianças/.test(r.body.mensagem), "desligar o aviso do prazo de 24 horas: 422", r.body);
  r = await comChave("PROTECAO_PRAZO_24H", { canalEmail: false }); ok(r.status === 422, "desligar só o e-mail também", r.status);
  r = await comChave("MENORES_VENCIMENTO_PROXIMO", { ativa: false });
  const existeMenores = await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave = N'MENORES_VENCIMENTO_PROXIMO'");
  ok(existeMenores === 0 ? r.status === 404 : r.status === 422, "o mesmo vale para os avisos do ministério com menores", r.status);
  ok((await escalar("SELECT Ativa FROM NotificacaoRegras WHERE Chave = N'PROTECAO_PRAZO_24H'")) === true && (await escalar("SELECT CanalEmail FROM NotificacaoRegras WHERE Chave = N'PROTECAO_PRAZO_24H'")) === true, "e a regra continua ligada, com e-mail");
  r = await comChave("PROTECAO_PRAZO_24H", { titulo: "Proteção: o prazo de 24 horas para comunicar o Conselho Tutelar" });
  ok(r.status === 200, "o título (só o texto) pode ser ajustado", r.body);
  r = await comChave("PROTECAO_PRAZO_24H", { ativa: false }, dirCentral); ok(r.status === 403, "e o Dirigente nem chega à tela das regras", r.status);

  console.log("== rotina horária: só abre o banco se há prazo correndo ==");
  const cab = { "x-cron-secret": process.env.CRON_SECRET, "x-somente-se-pendente": "1" };
  const guardado = { valor: null, gravados: [] };
  process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";     // só para a rotina achar que há Storage; as duas funções abaixo são de mentira
  storage.lerJsonPrivado = async () => { if (guardado.valor === "ERRO") throw new Error("armazém fora do ar"); return guardado.valor; };
  storage.salvarJsonPrivado = async (nome, v) => { guardado.gravados.push({ nome, v }); };
  r = await chamarRotina(VERIFICADOR, {}); ok(r.status === 401 || r.status === 403, "sem o segredo: recusada", r.status);
  guardado.valor = { pendentes: 0, proximoPrazo: null, em: new Date().toISOString() };
  r = await chamarRotina(VERIFICADOR, cab);
  ok(r.status === 200 && r.body.ocioso === true && !guardado.gravados.length, "marca 'nenhuma pendência': responde 'ocioso' sem abrir o banco (e sem regravar a marca)", r.body);
  guardado.valor = { pendentes: 2, proximoPrazo: new Date().toISOString(), em: new Date().toISOString() };
  r = await chamarRotina(VERIFICADOR, cab);
  ok(r.status === 200 && r.body.sucesso === true && !r.body.ocioso && guardado.gravados.length === 1, "marca com pendência: a rotina roda inteira e refaz a marca", r.body);
  const real = await q("SELECT COUNT(*) AS n FROM IncidentesProtecao i WHERE i.Status = 'ABERTO' AND i.ExigeComunicacao = 1 AND i.PrazoNotificacaoEm > DATEADD(HOUR, -30, SYSUTCDATETIME()) AND NOT EXISTS (SELECT 1 FROM IncidenteComunicacoes k WHERE k.IncidenteId = i.IncidenteId)");
  ok(guardado.gravados[0].v.pendentes === real[0].n && real[0].n > 0, "a marca regravada bate com o banco (há suspeita aberta com prazo correndo)", { marca: guardado.gravados[0].v, banco: real[0].n });
  guardado.valor = "ERRO"; guardado.gravados.length = 0;
  r = await chamarRotina(VERIFICADOR, cab);
  ok(r.status === 200 && !r.body.ocioso, "armazém fora do ar: na dúvida, a rotina olha o banco (nunca fica cega)", r.body);
  guardado.valor = null;
  r = await chamarRotina(VERIFICADOR, cab);
  ok(r.status === 200 && !r.body.ocioso, "sem marca nenhuma: também olha o banco", r.body);
  guardado.valor = { pendentes: 0 };
  r = await chamarRotina(VERIFICADOR, { "x-cron-secret": process.env.CRON_SECRET });
  ok(r.status === 200 && !r.body.ocioso, "sem o cabeçalho (a rodada manual) a rotina nunca é 'ociosa'", r.body);
  // a rotina horária NÃO cria os avisos que são da rodada diária
  const antesPadrao = await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave IN (N'PROTECAO_PADRAO_QUEBRAS', N'PROTECAO_COMITE_INCOMPLETO', N'PROTECAO_CAUTELAR_SEM_DECISAO', N'PROTECAO_RESUMO_DIARIO')");
  await chamarRotina(VERIFICADOR, cab);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave IN (N'PROTECAO_PADRAO_QUEBRAS', N'PROTECAO_COMITE_INCOMPLETO', N'PROTECAO_CAUTELAR_SEM_DECISAO', N'PROTECAO_RESUMO_DIARIO')")) === antesPadrao, "a rodada de hora em hora não cria os avisos de padrão, Comitê, afastamento sem decisão e resumo (são da rodada das 7h)");
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;

  console.log("== o e-mail que não saiu é reenviado ==");
  await q("UPDATE MembroReferencia SET Email = N'presidente.e2e@exemplo.invalid' WHERE MembroId = 1001");
  const nova = await notificacoes.criarNotificacao(pool, { regraChave: "PROTECAO_INCIDENTE_NOVO", destinatarioMembroId: 1001, titulo: "Aviso de teste do reenvio", mensagem: "Há um incidente novo de proteção. Abra o sistema.", categoria: "PROTECAO", referenciaTabela: "IncidentesProtecao", referenciaId: alg + 5000 });
  ok(nova.criada === true, "um aviso criado cujo e-mail não saiu", nova);
  const nid = nova.notificacaoId;
  const chamadas = [];
  const dep = { enviarCanais: async (p, o) => { chamadas.push(o); await p.request().input("n", L.sql.Int, o.notificacaoId).query("UPDATE Notificacoes SET EnviadaEmail = 1 WHERE NotificacaoId = @n"); } };
  let re = await pdb.reenviarEmailsPendentes(pool, { deps: dep });
  ok(chamadas.every((c) => c.notificacaoId !== nid), "recém-criado (menos de 10 minutos): ainda não é reenviado (a primeira tentativa pode estar em curso)", re);
  await q("UPDATE Notificacoes SET CriadaEm = DATEADD(MINUTE, -30, SYSUTCDATETIME()) WHERE NotificacaoId = @n", { n: nid });
  re = await pdb.reenviarEmailsPendentes(pool, { deps: dep });
  ok(chamadas.some((c) => c.notificacaoId === nid && c.email === "presidente.e2e@exemplo.invalid" && /Aviso de teste/.test(c.titulo)), "passados 10 minutos sem e-mail: reenvia", re);
  ok((await escalar("SELECT EnviadaEmail FROM Notificacoes WHERE NotificacaoId = @n", { n: nid })) === true, "e a marca de enviado é gravada");
  const total = chamadas.length;
  await pdb.reenviarEmailsPendentes(pool, { deps: dep });
  ok(chamadas.length === total, "o que já foi enviado não é reenviado de novo");
  await q("UPDATE Notificacoes SET EnviadaEmail = 0, CriadaEm = DATEADD(HOUR, -60, SYSUTCDATETIME()) WHERE NotificacaoId = @n", { n: nid });
  await pdb.reenviarEmailsPendentes(pool, { deps: dep });
  ok(chamadas.length === total, "passadas 48 horas desiste (não manda e-mail velho)");
  const falha = { enviarCanais: async () => { throw new Error("serviço de e-mail fora do ar"); } };
  await q("UPDATE Notificacoes SET CriadaEm = DATEADD(MINUTE, -30, SYSUTCDATETIME()) WHERE NotificacaoId = @n", { n: nid });
  const sobFalha = await pdb.reenviarEmailsPendentes(pool, { deps: falha }).then(() => true, () => false);
  ok(sobFalha === true, "se o serviço de e-mail continua fora do ar, o reenvio não derruba a rotina");

  fim("e2e-17-protecao-revisao");
})().catch((e) => { console.log("ERRO:", e.stack || e); process.exitCode = 1; try { L.sql.__encerrar(); } catch { } });
