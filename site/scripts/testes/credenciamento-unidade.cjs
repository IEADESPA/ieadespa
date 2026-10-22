// Testes de UNIDADE do CREDENCIAMENTO POR SALA/ALA, do RELATÓRIO DE AUSENTES e do CRACHÁ CONFIGURÁVEL (v7.13): src/lib/credenciamento.ts e src/lib/cracha.ts (funções puras,
// e o desenho do crachá num "jsPDF" de mentira), mais a função VerificarInscricao devolvendo os dados do crachá (com um `fetch` de mentira).
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/credenciamento-unidade.cjs
process.env.TELEFONE_CHAVE_SEGREDO = "segredo-de-teste-unidade-nao-usar-em-producao";
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-admin-de-teste";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { carregarTs } = require("./carregar-ts.cjs");
const { gerarHash } = require("../../api/src/lib/telefone.js");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);

// Um bloco que quebra (ex.: rodando contra o código de antes da revisão, sem a função nova) conta como falha e o teste segue para os outros blocos.
async function tentar(nome, fn) {
  try { await fn(); } catch (e) { falhas++; total++; console.log("  FALHA", nome, "→ o bloco quebrou:", e && e.message); }
}

let C, K;

(async () => {
  C = await carregarTs("credenciamento");
  K = await carregarTs("cracha");
  console.log("== os locais do evento (formato antigo e novo) ==");
  eq(C.normalizarLocais(["Portaria Leste", "Sala 2"]), [{ nome: "Portaria Leste", capacidade: null }, { nome: "Sala 2", capacidade: null }], "formato antigo (só nomes): continua valendo, sem capacidade");
  eq(C.normalizarLocais([{ nome: " Sala 2 ", capacidade: "40" }, "Portaria", { nome: "Ala Kids", capacidade: 0 }, { nome: "Sala 2", capacidade: 10 }, "", null, 7]),
    [{ nome: "Sala 2", capacidade: 40 }, { nome: "Portaria", capacidade: null }, { nome: "Ala Kids", capacidade: null }],
    "misturado: objeto com capacidade, nome sozinho, capacidade 0 = sem; nome repetido fica uma vez; vazio, nulo e número soltos somem");
  eq([C.normalizarLocais(null), C.normalizarLocais("lixo"), C.normalizarLocais('["A"]')], [[], [], [{ nome: "A", capacidade: null }]], "nada, lixo e JSON em texto");
  eq(C.serializarLocais([{ nome: "Portaria", capacidade: null }, { nome: "Sala 2", capacidade: 40 }]), ["Portaria", { nome: "Sala 2", capacidade: 40 }], "o painel grava: sem capacidade = só o nome (o formato antigo); com capacidade = objeto");

  console.log("== a chave da entrada (uma por pessoa, local e dia de Brasília) ==");
  eq(C.chaveEntrada(15, "Sala 2", "2026-11-20T02:30:00Z"), "15:Sala 2:2026-11-19", "02:30 UTC do dia 20 ainda é dia 19 em Brasília");
  eq(C.chaveEntrada(15, "Sala 2", "2026-11-20T03:00:00Z"), "15:Sala 2:2026-11-20", "03:00 UTC = meia-noite em Brasília: dia 20");
  eq(C.chaveEntrada(15, null, "2026-11-20T15:00:00Z"), "15::2026-11-20", "sem local: a parte do local fica vazia");
  verdade(C.chaveEntrada(15, "Sala 2", "2026-11-20T15:00:00Z") !== C.chaveEntrada(15, "Sala 3", "2026-11-20T15:00:00Z"), "a mesma pessoa em outro local: outra chave (pode entrar nos dois)");

  console.log("== contagem por local e capacidade ==");
  const entradas = [
    { inscricao: 1, local: "Sala 2", entrou_em: "2026-11-20T13:00:00Z" },
    { inscricao: 1, local: "Sala 2", entrou_em: "2026-11-20T14:00:00Z" }, // a mesma pessoa de novo no mesmo local: conta uma
    { inscricao: 2, local: "Sala 2", entrou_em: "2026-11-20T13:10:00Z" },
    { inscricao: 1, local: "Portaria", entrou_em: "2026-11-20T12:00:00Z" },
    { inscricao: 3, local: "Sala 2", entrou_em: "2026-11-21T13:00:00Z" }, // outro dia
    { inscricao: 4, local: null, date_created: "2026-11-20T13:00:00Z" },
  ];
  eq(C.contarPorLocal(entradas), { "Sala 2": 3, Portaria: 1, "": 1 }, "pessoas diferentes por local (todos os dias)");
  eq(C.contarPorLocal(entradas, "2026-11-20"), { "Sala 2": 2, Portaria: 1, "": 1 }, "só o dia 20 (a sala de hoje); sem hora do aparelho vale a do servidor");
  eq([C.jaEntrouNoLocal(entradas, 1, "Sala 2", "2026-11-20"), C.jaEntrouNoLocal(entradas, 1, "Sala 3", "2026-11-20"), C.jaEntrouNoLocal(entradas, 3, "Sala 2", "2026-11-20"), C.jaEntrouNoLocal(entradas, "1", "Portaria")], [true, false, false, true], "já entrou neste local hoje? (id em número ou texto)");
  const sala = { nome: "Sala 2", capacidade: 2 };
  eq([C.avisoCapacidade(sala, 1), C.avisoCapacidade(sala, 2)?.nivel, C.avisoCapacidade(sala, 3)?.nivel, C.avisoCapacidade({ nome: "X", capacidade: null }, 999)], [null, "cheio", "passou", null], "aviso: nada abaixo; 'cheio' ao chegar; 'passou' ao passar; sem capacidade, nunca");
  eq(C.avisoCapacidade(sala, 3).texto, "⚠️ Sala 2 passou da capacidade: 3 pessoas para 2 lugares.", "a frase do aviso");
  eq(C.resumoLocais([sala, { nome: "Portaria", capacidade: null }], { "Sala 2": 3 }).map((r) => [r.texto, r.aviso && r.aviso.nivel]), [["Sala 2: 3 de 2", "passou"], ["Portaria: 0", null]], "o resumo da tela de check-in");

  console.log("== relatório de ausentes ==");
  const inscricoes = [
    { id: 1, nome: "Ana", presente: true, faixa_rotulo: "1º lote", tipo_participante: "Participante" },
    { id: 2, nome: "Bruno", presente: false, faixa_rotulo: "1º lote", tipo_participante: "Preletor" },
    { id: 3, nome: "Carla", presente: false, faixa_rotulo: "2º lote", tipo_participante: null },
    { id: 4, nome: "Davi", presente: false, faixa_rotulo: null, tipo_participante: "Equipe" },        // tem entrada: veio
    { id: 5, nome: "Edu", presente: false, aguardando_vaga: true, faixa_rotulo: "1º lote" },            // lista de espera: não tinha vaga
    { id: 6, nome: "Fábio", presente: false, pendente_aprovacao: true, faixa_rotulo: "1º lote" },      // aguardando aprovação
    { id: 7, nome: "Ágata", presente: false, faixa_rotulo: "1º lote" },
  ];
  const ausentes = C.listarAusentes(inscricoes, [{ inscricao: 4, local: "Sala 2" }]);
  eq(ausentes.map((i) => i.id), [2, 3, 7], "ausente = com vaga, sem presença e sem entrada (lista de espera e aguardando aprovação ficam de fora)");
  eq(C.agruparAusentes(ausentes, "lote").map((g) => [g.grupo, g.pessoas.map((p) => p.nome)]), [["1º lote", ["Ágata", "Bruno"]], ["2º lote", ["Carla"]]], "por lote, nomes em ordem alfabética (com acento certo)");
  eq(C.agruparAusentes([...ausentes, { id: 9, nome: "Zé", faixa_rotulo: "" }], "lote").map((g) => g.grupo), ["1º lote", "2º lote", "Sem lote"], "'Sem lote' vai para o fim");
  eq(C.agruparAusentes(ausentes, "tipo").map((g) => [g.grupo, g.pessoas.length]), [["Participante", 2], ["Preletor", 1]], "por tipo (sem tipo = Participante)");
  eq(C.resumoAusencia(inscricoes, [{ inscricao: 4 }], "lote"), [{ grupo: "1º lote", inscritos: 3, ausentes: 2, taxa: 67 }, { grupo: "2º lote", inscritos: 1, ausentes: 1, taxa: 100 }, { grupo: "Sem lote", inscritos: 1, ausentes: 0, taxa: 0 }], "resumo: inscritos com vaga, ausentes e a taxa, por grupo");

  console.log("== crachá: a configuração ==");
  eq(K.normalizarConfigCracha(null), { tipo: false, igreja: false, cidade: false, qr: false, pergunta_igreja: null, pergunta_cidade: null }, "sem configuração: só o nome (o crachá de sempre)");
  eq(K.normalizarConfigCracha('{"tipo":true,"igreja":true,"pergunta_igreja":"12","cidade":true,"qr":true}'), { tipo: true, igreja: true, cidade: false, qr: true, pergunta_igreja: 12, pergunta_cidade: null }, "cidade ligada sem pergunta escolhida fica desligada; texto JSON aceito");
  eq(K.normalizarConfigCracha({ tipo: "sim", qr: 1 }).tipo || K.normalizarConfigCracha({ tipo: "sim", qr: 1 }).qr, false, "só 'true' de verdade liga");

  console.log("== crachá: o que vai para cada pessoa ==");
  const tudo = K.normalizarConfigCracha({ tipo: true, igreja: true, pergunta_igreja: 1, cidade: true, pergunta_cidade: 2, qr: true });
  eq(K.camposDoCracha(tudo, { nome: "  Maria  Souza ", codigo: "ABC234", tipo: "Preletor", igreja: "Congregação Betel", cidade: "Parauapebas" }, 9),
    { nome: "Maria Souza", tipo: "Preletor", linhas: ["Congregação Betel", "Parauapebas"], qr: "9:ABC234" }, "tudo ligado: tipo, igreja, cidade e o QR '<evento>:<código>' (o mesmo do /qrcode/)");
  eq(K.camposDoCracha(tudo, { nome: "Ana", codigo: "X1", tipo: null, igreja: "", cidade: null }, 9), { nome: "Ana", tipo: "Participante", linhas: [], qr: "9:X1" }, "sem tipo = Participante; resposta em branco não aparece");
  eq(K.camposDoCracha(K.normalizarConfigCracha(null), { nome: "Ana", codigo: "X1", tipo: "Preletor", igreja: "Betel" }, 9), { nome: "Ana", tipo: null, linhas: [], qr: null }, "sem configuração: nada além do nome, mesmo havendo dados");
  eq(K.camposDoCracha(tudo, { nome: "Ana", codigo: null }, 9).qr, null, "sem código: sem QR");
  eq(K.camposDoCracha(tudo, { nome: "Ana", igreja: "x".repeat(200) }, 9).linhas[0].length, 60, "linha longa é cortada (cabe no crachá)");

  console.log("== crachá: o QR e o desenho ==");
  eq(K.matrizQr("9:ABC"), null, "sem a biblioteca do QR na página: sem QR (e sem erro)");
  globalThis.qrcode = (tipo, correcao) => {
    let dado = "";
    return { addData: (t) => { dado = t; }, make() {}, getModuleCount: () => 21, isDark: (l, c) => (l + c + dado.length) % 2 === 0 };
  };
  const mq = K.matrizQr("9:ABC234");
  eq([mq.tamanho, typeof mq.escuro(0, 0)], [21, "boolean"], "com a biblioteca: a matriz 21x21 do QR");
  const docFalso = () => {
    const chamadas = { texto: [], retangulosPretos: 0 };
    let corPreta = false;
    return {
      chamadas,
      setDrawColor() {}, setLineWidth() {}, setFont() {}, setFontSize() {}, setTextColor() {}, setLineDashPattern() {}, roundedRect() {}, addImage() {},
      setFillColor: (r, g, b) => { corPreta = r === 0 && g === 0 && b === 0; },
      rect: (_x, _y, _w, _h, estilo) => { if (estilo === "F" && corPreta) chamadas.retangulosPretos += 1; },
      text: (t) => { chamadas.texto.push([].concat(t).join(" ")); },
      splitTextToSize: (t) => [String(t)],
    };
  };
  let doc = docFalso();
  K.desenharCracha(doc, { x: 0, y: 0, largura: 260, altura: 340 }, { nome: "Maria", eventoTitulo: "Seminário", tema: "Tema do ano", logo: null });
  eq([doc.chamadas.texto.includes("MARIA"), doc.chamadas.texto.includes("IDENTIFICAÇÃO"), doc.chamadas.texto.includes("Tema do ano"), doc.chamadas.retangulosPretos], [true, true, true, 0], "sem extras: o crachá de sempre (nome, 'IDENTIFICAÇÃO', tema, sem QR)");
  doc = docFalso();
  const campos = K.camposDoCracha(tudo, { nome: "Maria", codigo: "ABC234", tipo: "Preletor", igreja: "Betel", cidade: "Parauapebas" }, 9);
  K.desenharCracha(doc, { x: 0, y: 0, largura: 260, altura: 340 }, { nome: campos.nome, eventoTitulo: "Seminário", tema: "Tema do ano", logo: null }, { tipo: campos.tipo, linhas: campos.linhas, qr: K.matrizQr(campos.qr) });
  const escuros = Array.from({ length: 21 * 21 }, (_, k) => (Math.floor(k / 21) + (k % 21) + "9:ABC234".length) % 2 === 0).filter(Boolean).length;
  eq([doc.chamadas.texto.includes("PRELETOR"), doc.chamadas.texto.includes("Betel"), doc.chamadas.texto.includes("Parauapebas"), doc.chamadas.retangulosPretos], [true, true, true, escuros], "com extras: o tipo em destaque, igreja, cidade e um quadradinho preto por módulo escuro do QR");
  eq(doc.chamadas.texto.includes("IDENTIFICAÇÃO"), false, "com o tipo, o tipo ocupa o lugar do 'IDENTIFICAÇÃO'");

  console.log("== VerificarInscricao devolve os dados do crachá (só depois do telefone) ==");
  const TEL = "(94) 99123-4567";
  const pedidos = [];
  let configCracha = { tipo: true, igreja: true, pergunta_igreja: 31, cidade: true, pergunta_cidade: 32, qr: true };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    pedidos.push(u.pathname + u.search);
    const r = (corpo) => new Response(JSON.stringify(corpo), { status: 200 });
    if (u.pathname === "/items/inscricoes_eventos") return r({ data: [{ id: 5, nome: "Maria", codigo: "ABC234", presente: false, pago: false, telefone: gerarHash(TEL) }] });
    if (u.pathname === "/items/inscricoes_eventos/5") return r({ data: { id: 5, date_created: "2026-10-20T10:00:00Z", tipo_participante: "Preletor", faixa_rotulo: "1º lote", valor: "50.00", cortesia: false, pagamento_informado_em: null } });
    if (u.pathname === "/items/eventos/9") return r({ data: { id: 9, cracha_config: configCracha } });
    // a resposta da inscrição (id 1), uma sem data (antiga, id 2) e a de um ANÔNIMO criada depois (id 9) — o Directus devolve na ordem do id
    if (u.pathname === "/items/respostas_inscricao") return r({ data: [{ id: 1, pergunta: 31, valor: "Congregação Betel", date_created: "2026-10-20T10:00:02Z" }, { id: 2, pergunta: 32, valor: "Parauapebas", date_created: null }, { id: 9, pergunta: 31, valor: "IGREJA FALSA", date_created: "2026-10-21T08:00:00Z" }, { id: 10, pergunta: 33, valor: "PESQUISA", date_created: "2026-10-20T10:00:03Z" }] });
    if (u.pathname === "/items/perguntas_evento") return r({ data: [{ id: 31, evento: 9, momento: "inscricao" }, { id: 32, evento: 9, momento: "inscricao" }, { id: 33, evento: 9, momento: "pos_evento" }].filter((p) => (u.searchParams.get("filter[id][_in]") || "").split(",").includes(String(p.id))) });
    return new Response("{}", { status: 404 });
  };
  const handler = require("../../api/VerificarInscricao/index.js");
  const chamar = async (body) => { const ctx = { log: Object.assign(() => {}, { warn() {}, error() {} }) }; await handler(ctx, { headers: { "x-forwarded-for": "10.2.0.1, 1.1.1.1" }, body }); return ctx.res.body; };
  let b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, cracha: true });
  eq([b.encontrado, b.tipoParticipante, b.faixa, b.valor, b.cracha.igreja, b.cracha.cidade, b.cracha.config.qr], [true, "Preletor", "1º lote", 50, "Congregação Betel", "Parauapebas", true], "[revisão 2] código + telefone: o crachá usa a resposta da INSCRIÇÃO — a 'IGREJA FALSA' criada depois por um anônimo é ignorada");
  verdade(pedidos.some((p) => p.includes("filter[pergunta][_in]=31,32")), "lê só as respostas das 2 perguntas escolhidas");
  pedidos.length = 0;
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: "(94) 98888-0000", cracha: true });
  eq([b.encontrado, b.cracha, pedidos.some((p) => p.includes("/items/inscricoes_eventos/5") || p.includes("respostas"))], [false, undefined, false], "telefone errado: nada (nem lê os detalhes)");
  pedidos.length = 0;
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL });
  eq([b.encontrado, b.cracha, b.tipoParticipante, pedidos.filter((p) => p.startsWith("/items/inscricoes_eventos/5") || p.startsWith("/items/eventos") || p.startsWith("/items/respostas")).length], [true, undefined, undefined, 0], "[revisão 11] sem pedir detalhes nem crachá (QR, certificado, pesquisa): só a verificação, nenhuma leitura a mais");
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, detalhes: true });
  eq([b.tipoParticipante, b.faixa, b.cracha], ["Preletor", "1º lote", undefined], "[revisão 11] com `detalhes: true` (página Informar pagamento): os detalhes, sem o crachá");
  // revisão 2: a pergunta "igreja" apontando para uma pergunta da PESQUISA pós-evento (que tem criação pública) não vale
  configCracha = { tipo: true, igreja: true, pergunta_igreja: 33, cidade: false, qr: false };
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, cracha: true });
  eq(b.cracha.igreja, null, "[revisão 2] pergunta da pesquisa pós-evento não vai para o crachá");
  configCracha = { tipo: true, igreja: true, pergunta_igreja: 31, cidade: true, pergunta_cidade: 32, qr: true };
  globalThis.fetch = (orig => async (url, init) => (String(url).includes("/items/inscricoes_eventos/5") ? new Response("{}", { status: 500 }) : orig(url, init)))(globalThis.fetch);
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, cracha: true });
  eq([b.encontrado, b.nome, b.tipoParticipante], [true, "Maria", undefined], "detalhes indisponíveis (Directus sem os campos ou fora): a verificação continua funcionando como antes");

  await tentar("revisão 2 (regra da resposta)", async () => {
console.log("== revisão de 22/10/2026: a regra da resposta do crachá (API e painel iguais) ==");
  const KJ = require("../../api/src/lib/cracha.js");
  const respostas = [
    { id: 4, pergunta: 31, valor: "Betel", date_created: "2026-10-20T10:00:05Z" },
    { id: 8, pergunta: 31, valor: "FALSA", date_created: "2026-10-20T10:30:00Z" },
    { id: 9, pergunta: 32, valor: "TARDE", date_created: "2026-10-20T10:30:00Z" },
    { id: 10, pergunta: 34, valor: "Antiga", date_created: null },
    { id: 11, pergunta: 35, valor: "Outro evento", date_created: "2026-10-20T10:00:05Z" },
  ];
  const perguntas = [{ id: 31, evento: 9, momento: "inscricao" }, { id: 32, evento: 9, momento: "inscricao" }, { id: 34, evento: 9, momento: null }, { id: 36, evento: 9, momento: "pos_evento" }, { id: 35, evento: 7, momento: "inscricao" }];
  for (const [nome, regra] of [["API", KJ], ["painel", K]]) {
    const opcoes = { perguntasValidas: regra.perguntasDoCracha(perguntas, 9), inscricaoCriadaEm: "2026-10-20T10:00:00Z" };
    eq([31, 32, 34, 35, 36].map((p) => regra.respostaParaCracha(respostas, p, opcoes)), ["Betel", null, "Antiga", null, null], `[revisão 2] ${nome}: a mais antiga vence; criada 30 min depois não vale; antiga sem data vale; pergunta de outro evento ou da pesquisa não vale`);
  }

  });
  await tentar("revisão 14 (fila do check-in)", async () => {
console.log("== revisão de 22/10/2026: a fila do check-in ==");
  eq([["presenca", 200], ["presenca", 401], ["presenca", 404], ["presenca", 403], ["presenca", 503], ["entrada", 400, ["RECORD_NOT_UNIQUE"]], ["entrada", 400, ["INVALID_PAYLOAD"]], ["entrada", 403], ["entrada", 404], ["entrada", 500], ["entrada", 429]].map(([e, s, c]) => C.classificarRespostaCheckin(e, s, c || [])),
    ["ok", "sessao", "permanente", "permanente", "tentar_de_novo", "repetida", "permanente", "sem_esquema", "permanente", "tentar_de_novo", "tentar_de_novo"], "[revisão 14] falha permanente (400/404) sai da fila; 401 pede login sem perder a fila; rede/5xx/429 tenta de novo");
  const conhecidas = [{ inscricao: 5, local: "Sala A", entrou_em: "2026-11-20T13:00:00Z" }];
  eq([C.entradaJaConhecida(conhecidas, { inscricao: "5", local: "Sala A", entrou_em: "2026-11-20T18:00:00Z" }), C.entradaJaConhecida(conhecidas, { inscricao: 5, local: "Sala B", entrou_em: "2026-11-20T18:00:00Z" })], [true, false], "[revisão 14] a mesma entrada (confirmação × sincronização) não entra duas vezes na contagem");
  const paginaCheckin = fs.readFileSync(path.join(__dirname, "../../src/pages/checkin/[slug].astro"), "utf8");
  verdade(paginaCheckin.includes("classificarRespostaCheckin(") && paginaCheckin.includes("entradaJaConhecida(") && paginaCheckin.includes("avisarFalhaPermanente(") && paginaCheckin.includes("renovarToken("), "[revisão 14] a tela de check-in usa a classificação, tira da fila a falha permanente, avisa, e renova a sessão antes de pedir login");

  });
  await tentar("revisão 16 (LGPD)", async () => {
console.log("== revisão de 22/10/2026: o pedido de dados pessoais (LGPD) mostra os dados novos ==");
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const r = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status });
    if (u.pathname === "/users/me") return r({ data: { id: "equipe" } });
    if (u.pathname === "/items/inscricoes_eventos" && !u.searchParams.get("filter[id][_in]")) return r({ data: [{ id: 5, nome: "Maria", telefone: gerarHash(TEL), codigo: "ABC234", evento: { title: "Seminário" } }] });
    if (u.pathname === "/items/inscricoes_eventos") return r({ data: [{ id: 5, faixa_rotulo: "1º lote", tipo_participante: "Preletor", cortesia: true, cortesia_motivo: "Convidado", cortesia_autorizada_por: "Pr. João", pagamento_informado_em: "2026-10-21T10:00:00Z", pagamento_informado_valor: "50", pagamento_informado_meio: "PIX", pagamento_informado_nome: "Maria" }] });
    if (u.pathname === "/items/evento_entradas") return r({ data: [{ inscricao: 5, local: "Sala A", entrou_em: "2026-11-20T13:00:00Z" }] });
    if (u.pathname === "/items/camiseta_pedidos" && !u.searchParams.get("filter[id][_in]")) return r({ data: [{ id: 10, nome: "Maria", telefone: gerarHash(TEL), grupo: { nome: "Camiseta" } }] });
    if (u.pathname === "/items/camiseta_pedidos") return r({ data: [{ id: 10, pagamento_informado_em: "2026-10-21T10:00:00Z", pagamento_informado_valor: "40" }] });
    return r({}, 404);
  };
  const lgpd = require("../../api/BuscarDadosPessoais/index.js");
  const ctxL = { log: Object.assign(() => {}, { warn() {}, error() {} }) };
  await lgpd(ctxL, { headers: { "x-forwarded-for": "10.3.0.1, 1.1.1.1" }, body: { staffToken: "t", telefone: TEL } });
  const insc = ctxL.res.body.inscricoes[0] || {};
  eq([insc.lote, insc.tipoParticipante, insc.cortesia?.motivo, insc.pagamentoInformado?.valor, insc.entradas?.[0]?.local, ctxL.res.body.pedidos[0]?.pagamentoInformado?.valor], ["1º lote", "Preletor", "Convidado", 50, "Sala A", 40], "[revisão 16] a busca da LGPD devolve lote, tipo, cortesia, pagamento informado e entradas (e o aviso do pedido de camiseta)");
  verdade(fs.readFileSync(path.join(__dirname, "../../src/pages/painel-eventos/lgpd.astro"), "utf8").includes("extrasHtml(i)"), "[revisão 16] e a tela da LGPD mostra esses dados");

  });
  console.log(falhas === 0 ? `\nTUDO CERTO (${total} verificações)` : `\n${falhas} FALHA(S) de ${total}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
