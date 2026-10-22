// Testes de UNIDADE do CREDENCIAMENTO POR SALA/ALA, do RELATÓRIO DE AUSENTES e do CRACHÁ CONFIGURÁVEL (v7.13): src/lib/credenciamento.ts e src/lib/cracha.ts (funções puras,
// e o desenho do crachá num "jsPDF" de mentira), mais a função VerificarInscricao devolvendo os dados do crachá (com um `fetch` de mentira).
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/credenciamento-unidade.cjs
process.env.TELEFONE_CHAVE_SEGREDO = "segredo-de-teste-unidade-nao-usar-em-producao";
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-admin-de-teste";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { gerarHash } = require("../../api/src/lib/telefone.js");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);

function carregarTs(nome) {
  const arquivo = path.join(__dirname, `../../src/lib/${nome}.ts`);
  const js = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(`${nome}.js`);
  mod._compile(js, `${nome}.js`);
  return mod.exports;
}
const C = carregarTs("credenciamento");
const K = carregarTs("cracha");

(async () => {
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
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    pedidos.push(u.pathname + u.search);
    const r = (corpo) => new Response(JSON.stringify(corpo), { status: 200 });
    if (u.pathname === "/items/inscricoes_eventos") return r({ data: [{ id: 5, nome: "Maria", codigo: "ABC234", presente: false, pago: false, telefone: gerarHash(TEL) }] });
    if (u.pathname === "/items/inscricoes_eventos/5") return r({ data: { id: 5, tipo_participante: "Preletor", faixa_rotulo: "1º lote", valor: "50.00", cortesia: false, pagamento_informado_em: null } });
    if (u.pathname === "/items/eventos/9") return r({ data: { id: 9, cracha_config: { tipo: true, igreja: true, pergunta_igreja: 31, cidade: true, pergunta_cidade: 32, qr: true } } });
    if (u.pathname === "/items/respostas_inscricao") return r({ data: [{ pergunta: 31, valor: "Congregação Betel" }, { pergunta: 32, valor: "Parauapebas" }] });
    return new Response("{}", { status: 404 });
  };
  const handler = require("../../api/VerificarInscricao/index.js");
  const chamar = async (body) => { const ctx = { log: Object.assign(() => {}, { warn() {}, error() {} }) }; await handler(ctx, { headers: { "x-forwarded-for": "10.2.0.1, 1.1.1.1" }, body }); return ctx.res.body; };
  let b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, cracha: true });
  eq([b.encontrado, b.tipoParticipante, b.faixa, b.valor, b.cracha.igreja, b.cracha.cidade, b.cracha.config.qr], [true, "Preletor", "1º lote", 50, "Congregação Betel", "Parauapebas", true], "código + telefone: tipo, lote, valor e o crachá (igreja e cidade das perguntas escolhidas)");
  verdade(pedidos.some((p) => p.includes("filter[pergunta][_in]=31,32")), "lê só as respostas das 2 perguntas escolhidas");
  pedidos.length = 0;
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: "(94) 98888-0000", cracha: true });
  eq([b.encontrado, b.cracha, pedidos.some((p) => p.includes("/items/inscricoes_eventos/5") || p.includes("respostas"))], [false, undefined, false], "telefone errado: nada (nem lê os detalhes)");
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL });
  eq([b.encontrado, b.cracha], [true, undefined], "sem pedir o crachá: não lê o evento nem as respostas");
  globalThis.fetch = (orig => async (url, init) => (String(url).includes("/items/inscricoes_eventos/5") ? new Response("{}", { status: 500 }) : orig(url, init)))(globalThis.fetch);
  b = await chamar({ evento: 9, modo: "codigo", codigo: "ABC234", telefone: TEL, cracha: true });
  eq([b.encontrado, b.nome, b.tipoParticipante], [true, "Maria", undefined], "detalhes indisponíveis (Directus sem os campos ou fora): a verificação continua funcionando como antes");

  console.log(falhas === 0 ? `\nTUDO CERTO (${total} verificações)` : `\n${falhas} FALHA(S) de ${total}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
