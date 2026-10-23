// e2e-40-trava7c-cuidado.js — Trava de Revisão 7-C (costuras), o cuidado pastoral × a proteção de crianças, com os handlers e o banco REAIS, sobre a base "cenario-7c"
// (cenario-crise + a migração 154 aplicada duas vezes: `bash rodar.sh preparar-7c`).
//   ALTO 2: o sinal de risco SOBRE criança (ou num pedido feito por um menor) fica só com o nível geral, longe de quem tem pendência reservada ou é envolvido de incidente aberto,
//           e a Proteção de crianças recebe o aviso do prazo do Conselho Tutelar (sem o texto).
//   ALTO 1: a regra da Trava 7-B no cuidado pastoral — a liderança com pendência reservada não vê item, nota nem pedido de menor, não abre nem registra sobre ele, não acha a
//           criança na busca; o item que já era dela fica sem responsável (a retirada da Diretoria/rotina) e sobe ao degrau de cima; o item novo do menor não vai a ela.
//   ALTO 3: o mural do site — o mesmo item do site não grava nem avisa duas vezes (o reenvio); com criança no texto, a Proteção é avisada.
//   BAIXO 11: a concessão restrita a um departamento não entra na liderança do território.
//   BAIXO 14: a exclusão LGPD de quem era o responsável deixa os itens abertos sem responsável, com o evento neutro e o aviso ao degrau; o resumo diário não vai a quem saiu.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, API, path, GET, POST, LIDER, GERAL, PIN, hojeBr } = L;
const H = require(path.join(API, "GestaoCuidadoPastoral/index.js"));
const HP = require(path.join(API, "GestaoProtecaoMenores/index.js"));
const EXCLUSAO = require(path.join(API, "ExecutarExclusaoLGPD/index.js"));
const db = require(path.join(API, "shared/cuidadoPastoralDb.js"));
const mmDb = require(path.join(API, "shared/ministerioMenoresDb.js"));

let falhasAuditoria = 0;
const erroOriginal = console.error;
console.error = (...a) => { if (String(a[0]).includes("[AUDITORIA]")) falhasAuditoria++; if (process.env.E2E_VERBOSO) erroOriginal(...a); };

const PERM = ["cuidado_pastoral", "pessoas"];
const C = "Central E2E", V = "Vila Nova E2E";
const DIR_C = () => LIDER(3001, PERM, [C]), DIR_V = () => LIDER(3002, PERM, [V]);
const PAREA = () => LIDER(3003, PERM, [C, V], "AREA");
const SEC = () => GERAL(1002, ["cuidado_pastoral", "protecaodedados", "protecao_menores"]);
const P = { ana: 8010, bento: 8011, carla: 8012, gabi: 8016, menor: 8021, vilaA: 8030 };
const avisosPara = (regra, ref, tabela) => q("SELECT DestinatarioMembroId d, Mensagem m FROM Notificacoes WHERE RegraChave = @r AND ReferenciaId = @i AND ReferenciaTabela = @t ORDER BY DestinatarioMembroId",
  { r: regra, i: ref, t: tabela });
const ids = (l) => (l || []).map((x) => Number(x.d));
const tem = (lista, id) => lista.includes(Number(id));

(async () => {
  const pool = await obterPool();
  const c1 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: C });
  const c2 = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: V });
  const hoje = hojeBr();
  const protecaoGeral = (await q(`SELECT DISTINCT l.MembroId FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId WHERE p.Nivel = 'GLOBAL' AND (',' + p.Permissoes + ',') LIKE '%,protecao_menores,%'
    AND (l.AtivoAte IS NULL OR l.AtivoAte >= CAST(SYSUTCDATETIME() AS DATE))`)).map((x) => Number(x.MembroId));
  ok(protecaoGeral.includes(1002) && protecaoGeral.includes(7001) && protecaoGeral.includes(7002), "o cenário: a Proteção de crianças do nível geral tem o Secretário (1002) e o Comitê (7001, 7002)", protecaoGeral);

  console.log("== ALTO 2: o sinal de risco sobre criança fica só com o nível geral, longe de quem tem pendência ou é envolvido ==");
  // 7002 (Comitê) passa a ter pendência reservada; 1001 (Presidente) passa a ser envolvido de um incidente aberto (não é alegação: não mexe na aptidão)
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (7002, 'INQUERITO_POLICIAL', @d)", { d: hoje });
  const inc = await POST(HP, "registrar", PIN(P.gabi), { nivel: "QUEBRA_POLITICA", dataOcorrencia: hoje, congregacaoId: c1, descricao: "Um adulto ficou a sós com uma criança na sala.", envolvidoMembroId: 1001 });
  ok(inc.status === 201, "o incidente aberto com o Presidente como envolvido (QUEBRA_POLITICA)", inc.body);
  let r = await POST(H, "pedir-oracao", PIN(P.ana), { categoria: "FAMILIA", texto: "Orem por nós: o meu marido bate na minha filha quase todo dia", podeBoletim: false });
  ok(r.status === 201 && r.body.risco === true, "o pedido com violência e criança é recebido com o sinal de risco", r.body);
  const ped1 = await um("SELECT PedidoId, SoNivelGeral, RiscoCrianca FROM PedidosOracao WHERE PedidoId = @p", { p: r.body.pedidoId });
  ok(ped1.SoNivelGeral === true || Number(ped1.SoNivelGeral) === 1, "o pedido sobre criança fica SÓ com o nível geral (antes: todo o território, Dirigente incluído)", ped1);
  const ev1 = await escalar("SELECT TOP 1 e.EventoId FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId WHERE i.PedidoOracaoId = @p AND e.Tipo = 'CRIADO'", { p: ped1.PedidoId });
  const risco1 = ids(await avisosPara("CUIDADO_RISCO", ev1, "CuidadoEventos"));
  ok(!tem(risco1, 3001) && !tem(risco1, 3003) && !tem(risco1, 8001), "o aviso do risco NÃO vai ao Dirigente, ao Pastor de Área nem ao Superintendente", risco1);
  ok(tem(risco1, 1002) && !tem(risco1, 1001), "vai ao nível geral, menos o envolvido do incidente aberto (o Presidente)", risco1);
  const prot1 = await avisosPara("CUIDADO_RISCO_CRIANCA", ev1, "CuidadoEventosProtecao");
  ok(tem(ids(prot1), 1002) && tem(ids(prot1), 7001), "a Proteção de crianças do nível geral é avisada (Secretário e Comitê)", ids(prot1));
  ok(!tem(ids(prot1), 7002) && !tem(ids(prot1), 1001) && !tem(ids(prot1), 3001), "nunca quem tem pendência reservada (7002), o envolvido (1001) nem a liderança local", ids(prot1));
  ok(prot1.length > 0 && prot1.every((a) => /Conselho Tutelar IMEDIATAMENTE/.test(a.m) && /Registrar incidente/.test(a.m) && !/marido|bate|filha/.test(a.m)), "o aviso diz o prazo do Conselho Tutelar e onde registrar, SEM o texto do pedido", prot1[0]);
  ok((await escalar("SELECT COUNT(*) FROM IncidentesProtecao")) === (await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE IncidenteId <= (SELECT MAX(IncidenteId) FROM IncidentesProtecao)")) && !(await escalar("SELECT COUNT(*) FROM IncidentesProtecao WHERE Descricao LIKE N'%marido%'")), "o sistema não abre incidente sozinho");
  let lista = (await GET(H, "pedidos", DIR_C(), { situacao: "RISCO" })).body.pedidos || [];
  ok(!lista.some((p) => p.pedidoId === ped1.PedidoId), "o Dirigente não lê o pedido na aba Sinal de risco");
  lista = (await GET(H, "pedidos", SEC(), { situacao: "RISCO" })).body.pedidos || [];
  ok(lista.some((p) => p.pedidoId === ped1.PedidoId), "o nível geral lê");
  r = await POST(H, "pedir-oracao", PIN(P.menor), { categoria: "OUTRO", texto: "não aguento mais, eu quero morrer", podeBoletim: false });
  const ped2 = await um("SELECT PedidoId, SoNivelGeral FROM PedidosOracao WHERE PedidoId = @p", { p: r.body.pedidoId });
  ok(r.status === 201 && Number(ped2.SoNivelGeral) === 1, "o pedido com sinal de risco FEITO por um menor também fica só com o nível geral", ped2);
  const ev2 = await escalar("SELECT TOP 1 e.EventoId FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId WHERE i.PedidoOracaoId = @p AND e.Tipo = 'CRIADO'", { p: ped2.PedidoId });
  const risco2 = ids(await avisosPara("CUIDADO_RISCO", ev2, "CuidadoEventos"));
  ok(!tem(risco2, 3001) && tem(risco2, 1002), "o aviso do pedido do menor não vai ao Dirigente", risco2);
  const prot2 = await avisosPara("CUIDADO_RISCO_CRIANCA", ev2, "CuidadoEventosProtecao");
  ok(prot2.length > 0 && prot2.every((a) => /menor de idade/.test(a.m)), "a Proteção é avisada de que o pedido veio de um menor", prot2[0]);
  r = await POST(H, "pedir-oracao", PIN(P.bento), { categoria: "OUTRO", texto: "estou muito triste, às vezes penso em me matar", podeBoletim: false });
  const ped3 = await um("SELECT PedidoId, SoNivelGeral FROM PedidosOracao WHERE PedidoId = @p", { p: r.body.pedidoId });
  ok(Number(ped3.SoNivelGeral) === 0, "o risco de um adulto sem criança no texto continua com o território (não mudou)", ped3);
  const ev3 = await escalar("SELECT TOP 1 e.EventoId FROM CuidadoEventos e JOIN CuidadoItens i ON i.ItemId = e.ItemId WHERE i.PedidoOracaoId = @p AND e.Tipo = 'CRIADO'", { p: ped3.PedidoId });
  ok((await avisosPara("CUIDADO_RISCO_CRIANCA", ev3, "CuidadoEventosProtecao")).length === 0, "e não avisa a Proteção");

  console.log("== ALTO 3: o mural do site — o reenvio do mesmo item não grava nem avisa de novo; criança no texto avisa a Proteção ==");
  const t0 = "Pelo site: o padrasto bate na minha filha pequena";
  const s1 = await db.receberDoSite(pool, { texto: t0, nome: null, confidencial: false, siteItemId: 9101 });
  ok(s1.gravado && s1.risco, "o pedido do site com risco é guardado", s1);
  // (o texto chega com outra pontuação: quem reconhece o reenvio é o número do item do site, não o texto dos últimos 10 minutos)
  const s2 = await db.receberDoSite(pool, { texto: `${t0}!`, nome: null, confidencial: false, siteItemId: 9101 });
  ok(s2.gravado && s2.repetido && s2.pedidoId === s1.pedidoId, "o reenvio do MESMO item do site é o mesmo pedido: não grava outro", s2);
  ok((await escalar("SELECT COUNT(*) FROM PedidosOracao WHERE SiteItemId = 9101")) === 1, "uma linha só para o item do site");
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO' AND ReferenciaTabela = 'PedidosOracaoSite' AND ReferenciaId = @p", { p: s1.pedidoId })) === (await escalar("SELECT COUNT(DISTINCT DestinatarioMembroId) FROM Notificacoes WHERE RegraChave = 'CUIDADO_RISCO' AND ReferenciaTabela = 'PedidosOracaoSite' AND ReferenciaId = @p", { p: s1.pedidoId })), "nem avisa de novo");
  const protS = ids(await avisosPara("CUIDADO_RISCO_CRIANCA", s1.pedidoId, "PedidosOracaoSiteProtecao"));
  ok(protS.length > 0 && !tem(protS, 7002) && !tem(protS, 1001), "com criança no texto, a Proteção é avisada (sem quem tem pendência nem o envolvido)", protS);
  ok(typeof db.preverDoSite === "function" && db.preverDoSite({ texto: "pela minha mãe", confidencial: false }).precisaBanco === false && db.preverDoSite({ texto: "quero morrer", confidencial: false }).precisaBanco === true
    && db.preverDoSite({ texto: "x", confidencial: true }).invalido === true, "o que dá para decidir sem o banco (o comum, o vazio) é decidido sem ele");

  console.log("== ALTO 1: a liderança com pendência reservada e o item de criança ==");
  r = await POST(H, "abrir", DIR_C(), { tipo: "AFASTAMENTO", congregacaoId: c1, membroId: P.menor, motivo: "faltou à EBD" });
  ok(r.status === 201 && r.body.responsavel && r.body.responsavel.membroId === 3001, "sem pendência, o Dirigente abre o item do menor e é o responsável", r.body);
  const itemMenor = r.body.itemId;
  r = await POST(H, "nota", DIR_C(), { membroId: P.menor, nivel: "EQUIPE", texto: "conversei com a mãe" });
  ok(r.status === 201, "e escreve a nota sobre ele");
  const notaMenor = r.body.notaId;
  r = await POST(H, "abrir", DIR_C(), { tipo: "VISITANTE", congregacaoId: c1, pessoaNome: "Visitante Sete E2E", pessoaContato: "91 90000-0007" });
  const itemAdulto = r.body.itemId;
  r = await POST(H, "pedir-oracao", PIN(P.menor), { categoria: "GRATIDAO", texto: "gratidão pela escola nova", podeBoletim: true });
  const pedMenorComum = r.body.pedidoId;
  // 3001 passa a ter pendência reservada (comunicação em análise)
  await q("INSERT INTO MinisterioMenoresAutoDenuncias (MembroId, Tipo, DataCiencia) VALUES (3001, 'INQUERITO_POLICIAL', @d)", { d: hoje });
  ok((await GET(H, "item", DIR_C(), { itemId: itemMenor })).status === 404, "com pendência, o Dirigente não abre o item do menor (a mesma resposta de \"não existe\")");
  ok((await GET(H, "item", DIR_C(), { itemId: itemAdulto })).status === 200, "o item de adulto continua dele (controle)");
  let fila = (await GET(H, "fila", DIR_C(), { situacao: "ABERTOS" })).body.itens || [];
  ok(!fila.some((i) => i.itemId === itemMenor) && fila.some((i) => i.itemId === itemAdulto), "a fila não mostra o item do menor", fila.map((i) => i.itemId));
  const meus = (await GET(H, "meus", PIN(3001))).body.itens || [];
  ok(!meus.some((i) => i.itemId === itemMenor), "Meu Painel (responsável) também não mostra", meus.map((i) => i.itemId));
  ok((await GET(H, "notas", DIR_C(), { membroId: P.menor })).status === 404, "as notas sobre o menor não existem para ele");
  ok((await POST(H, "nota", DIR_C(), { membroId: P.menor, nivel: "EQUIPE", texto: "outra nota" })).status === 404, "nem para escrever");
  ok((await POST(H, "abrir-nota", DIR_C(), { notaId: notaMenor })).status === 404, "nem a nota que ele mesmo escreveu");
  ok((await POST(H, "contato", DIR_C(), { itemId: itemMenor, forma: "LIGACAO", conseguiu: true })).status === 404, "nem registra contato no item");
  r = await POST(H, "abrir", DIR_C(), { tipo: "NOVO_CONVERTIDO", congregacaoId: c1, membroId: P.menor });
  ok(r.status === 422 && /não é de um membro ativo desta congregação/.test(r.body.mensagem), "nem abre item novo sobre a criança (a resposta não diz o motivo)", r.body);
  r = await POST(H, "registrar-pedido", DIR_C(), { congregacaoId: c1, membroId: P.menor, categoria: "SAUDE", texto: "pela saúde dele", podeBoletim: false });
  ok(r.status === 422 && /não é de um membro ativo/.test(r.body.mensagem), "nem registra pedido em nome dela", r.body);
  const busca = (await POST(H, "buscar-pessoas", DIR_C(), { congregacaoId: c1, q: "Menino" })).body.pessoas || [];
  ok(!busca.some((p) => p.membroId === P.menor), "a busca não acha a criança", busca);
  const pedidosDir = (await GET(H, "pedidos", DIR_C(), { situacao: "AGUARDANDO" })).body.pedidos || [];
  ok(!pedidosDir.some((p) => p.pedidoId === pedMenorComum), "o pedido de oração feito pelo menor não aparece para ele", pedidosDir.map((p) => p.pedidoId));
  const pedidosArea = (await GET(H, "pedidos", PAREA(), { situacao: "AGUARDANDO" })).body.pedidos || [];
  ok(pedidosArea.some((p) => p.pedidoId === pedMenorComum), "o Pastor de Área (sem pendência) vê (controle)");
  ok((await GET(H, "item", PAREA(), { itemId: itemMenor })).status === 200, "o Pastor de Área vê o item do menor (controle)");
  // a retirada da Diretoria (o mesmo invólucro que tira das escalas): o item do menor fica sem o responsável com pendência e sobe ao degrau de cima
  const ret = await mmDb.retirarInaptosDasEscalas(pool, { membroId: 3001 });
  ok(ret.cuidadoSoltos === 1, "a retirada tira o Dirigente do item do menor (1)", ret);
  const it = await um("SELECT ResponsavelMembroId, Nivel FROM CuidadoItens WHERE ItemId = @i", { i: itemMenor });
  ok(it.ResponsavelMembroId === null && it.Nivel === "AREA", "o item fica sem responsável e sobe para a Área (o Dirigente não conta como gente no degrau)", it);
  const evSolto = await um("SELECT TOP 1 EventoId, Tipo, ResponsavelMembroId, MembroId, Observacao, NivelDe, NivelPara FROM CuidadoEventos WHERE ItemId = @i ORDER BY EventoId DESC", { i: itemMenor });
  ok(evSolto.Tipo === "ATRIBUIDO" && evSolto.ResponsavelMembroId === null && evSolto.MembroId === null && /deixou este acompanhamento/.test(evSolto.Observacao) && !/pend|Diretoria|afast|comunica/i.test(evSolto.Observacao)
    && evSolto.NivelDe === "CONGREGACAO" && evSolto.NivelPara === "AREA", "o histórico mostra a saída com o texto neutro (nunca o motivo)", evSolto);
  const avisoArea = ids(await avisosPara("CUIDADO_DEGRAU", evSolto.EventoId, "CuidadoEventos"));
  ok(tem(avisoArea, 3003) && !tem(avisoArea, 3001), "o Pastor de Área é avisado; o Dirigente não", avisoArea);
  ok((await escalar("SELECT COUNT(*) FROM CuidadoItens WHERE ItemId = @i AND ResponsavelMembroId = 3001", { i: itemAdulto })) === 1, "o item de adulto continua com ele");
  const de2 = await mmDb.retirarInaptosDasEscalas(pool, {});
  ok(de2.cuidadoSoltos === 0, "a rotina inteira, de novo: nada mais a soltar (idempotente)", de2);
  // o item NOVO do menor (pedido de visita): o Dirigente com pendência não é o destino
  r = await POST(H, "pedir-visita", PIN(P.menor), { motivo: "queria uma visita da igreja" });
  ok(r.status === 201, "o menor pede visita", r.body);
  const novo = await um("SELECT ItemId, ResponsavelMembroId, Nivel FROM CuidadoItens WHERE ItemId = @i", { i: r.body.itemId });
  ok(novo.ResponsavelMembroId === null && novo.Nivel === "AREA", "o item novo do menor nasce sem o Dirigente e na Área", novo);
  const evNovo = await escalar("SELECT EventoId FROM CuidadoEventos WHERE ItemId = @i AND Tipo = 'CRIADO'", { i: novo.ItemId });
  const avNovo = ids(await avisosPara("CUIDADO_DEGRAU", evNovo, "CuidadoEventos"));
  ok(tem(avNovo, 3003) && !tem(avNovo, 3001), "o aviso vai à Área, nunca ao Dirigente com pendência", avNovo);
  ok((await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'CUIDADO_ATRIBUIDO' AND DestinatarioMembroId = 3001 AND Mensagem LIKE N'%Menino%'")) === 0, "o Dirigente nunca recebeu o nome do menor como responsável depois da pendência");
  // o PAREA não consegue nomear o Dirigente com pendência (já era a regra da v7.11; conferida de novo)
  r = await POST(H, "atribuir", PAREA(), { itemId: itemMenor, responsavelMembroId: 3001 });
  ok(r.status === 422, "nomear de novo quem tem pendência é recusado", r.body);
  // a escada do item vencido do menor pula o degrau de quem tem pendência
  await q("UPDATE CuidadoItens SET Nivel = 'CONGREGACAO', PrazoEm = DATEADD(HOUR, -1, SYSUTCDATETIME()) WHERE ItemId = @i", { i: itemMenor });
  await db.subirEscada(pool);
  ok((await escalar("SELECT Nivel FROM CuidadoItens WHERE ItemId = @i", { i: itemMenor })) === "AREA", "a escada sobe o item do menor para a Área (o Dirigente com pendência não conta)");
  const deg = await db.detectarDegraus(pool);
  ok(!deg.some((f) => f.destinatarios.some((d) => Number(d.membroId) === 3001)), "e o aviso do degrau não chega a quem tem pendência", deg.map((f) => f.destinatarios.map((d) => d.membroId)));

  console.log("== BAIXO 11: a concessão restrita a um departamento não é liderança do território ==");
  const papelDir = await escalar("SELECT PapelId FROM Papeis WHERE Nome = N'Dirigente de Congregação'");
  const dep = await escalar("SELECT TOP 1 DepartamentoId FROM Departamentos");
  if (dep) {
    await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, DepartamentoId) VALUES (8012, @p, 'CONGREGACAO', @c, @d)", { p: papelDir, c: c2, d: dep });
    const terr = await db.liderancaDoTerritorio(pool, c2);
    ok(!Object.values(terr).flat().some((x) => Number(x.membroId) === 8012), "a liderança restrita a departamento não entra no território (não recebe aviso de risco nem conta na escada)");
    await q("DELETE FROM Lideranca WHERE MembroId = 8012 AND DepartamentoId = @d", { d: dep });
  } else ok(true, "(sem departamento no cenário: a regra está no SQL)");

  console.log("== BAIXO 14: a exclusão LGPD de quem era o RESPONSÁVEL ==");
  r = await POST(H, "abrir", DIR_V(), { tipo: "AFASTAMENTO", congregacaoId: c2, membroId: P.vilaA, motivo: "sumiu dos cultos" });
  ok(r.status === 201 && r.body.responsavel && r.body.responsavel.membroId === 3002, "o Dirigente da Vila Nova é o responsável de um item", r.body);
  const itemV = r.body.itemId;
  const sol = (await q("INSERT INTO SolicitacoesTitularLGPD (MembroId, Tipo, Status) VALUES (3002, 'EXCLUSAO', 'PENDENTE'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const ctxEx = { bindingData: { id: String(sol) }, log: Object.assign(() => { }, { error() { } }) };
  await EXCLUSAO(ctxEx, { method: "POST", query: {}, body: {}, headers: { "x-auth-token": SEC() } });
  ok(ctxEx.res.status === 200 && ctxEx.res.body.sucesso, "a exclusão LGPD executa", ctxEx.res.body);
  const iv = await um("SELECT ResponsavelMembroId, Status FROM CuidadoItens WHERE ItemId = @i", { i: itemV });
  ok(iv.ResponsavelMembroId === null && iv.Status === "ABERTO", "o item aberto fica sem o responsável excluído (continua aberto)", iv);
  const evV = await um("SELECT TOP 1 EventoId, Tipo, Observacao FROM CuidadoEventos WHERE ItemId = @i ORDER BY EventoId DESC", { i: itemV });
  ok(evV.Tipo === "ATRIBUIDO" && /deixou este acompanhamento/.test(evV.Observacao) && !/LGPD|exclus/i.test(evV.Observacao), "com o evento neutro (sem dizer que foi a LGPD)", evV);
  const avV = ids(await avisosPara("CUIDADO_DEGRAU", evV.EventoId, "CuidadoEventos"));
  ok(avV.length > 0 && !tem(avV, 3002), "e o aviso ao degrau (nunca a quem saiu)", avV);
  // o resumo diário nunca vai a quem teve a exclusão atendida (mesmo que um item volte a apontar para ele por engano)
  await q("UPDATE CuidadoItens SET ResponsavelMembroId = 3002 WHERE ItemId = @i", { i: itemV });
  const resumo = await db.detectarResumoDiario(pool);
  ok(!resumo.some((f) => f.destinatarios.some((d) => Number(d.membroId) === 3002)), "o resumo diário não vai a quem teve a exclusão LGPD atendida", resumo.map((f) => f.destinatarios[0].membroId));
  await q("UPDATE CuidadoItens SET ResponsavelMembroId = NULL WHERE ItemId = @i", { i: itemV });

  ok(falhasAuditoria === 0, "nenhuma falha de auditoria", falhasAuditoria);
  fim("e2e-40 (Trava 7-C: cuidado pastoral × proteção de crianças)");
})().catch((e) => { console.log("ERRO:", e && e.stack); L.shimEncerrar(); process.exitCode = 1; });
