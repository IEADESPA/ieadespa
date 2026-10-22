// Testes de UNIDADE dos LOTES de inscrição (v7.13): a regra (api/src/lib/lotes.js), a montagem da inscrição com lote (CriarInscricao.montarRegistros), o laço da senha com a
// recusa do lote (api/src/lib/vagasEvento.js) e — o que mais importa — a CORRIDA contra um Directus de mentira em memória, com centenas de inscrições ao mesmo tempo e várias
// "instâncias": o lote NUNCA passa do número de vagas, e o limite geral do evento continua mandando para a lista de espera (sem recusar). Inclui o teste do teste: sem a chave
// única, ou contando o lote antes da senha, a corrida estoura. E as funções de verdade (CriarInscricao e StatusInscricao) com um `fetch` de mentira.
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/lotes-unidade.cjs
process.env.TELEFONE_CHAVE_SEGREDO = "segredo-de-teste-unidade-nao-usar-em-producao";
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-admin-de-teste";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const L = require("../../api/src/lib/lotes.js");
const { montarRegistros } = require("../../api/CriarInscricao/index.js");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const BRT = (texto) => new Date(`${texto}-03:00`).getTime(); // um instante no horário de Brasília

function novaInstancia() {
  delete require.cache[require.resolve("../../api/src/lib/limiteLote.js")];
  delete require.cache[require.resolve("../../api/src/lib/vagasEvento.js")];
  return require("../../api/src/lib/vagasEvento.js");
}

(async () => {
  console.log("== a lista de lotes ==");
  eq(L.normalizarFaixas([{ descricao: " Membro ", valor: "50", ate: "2026-11-05", vagas: "100" }, { descricao: "", valor: 10 }, { descricao: "Visitante", valor: 70, ate: "05/11/2026", vagas: 0 }]),
    [{ descricao: "Membro", valor: 50, ate: "2026-11-05", vagas: 100 }, { descricao: "Visitante", valor: 70, ate: null, vagas: null }],
    "limpa: descrição sem espaços, valor número; data fora do formato e vagas 0 viram 'sem'; faixa sem nome some");
  eq(L.normalizarFaixas('[{"descricao":"A","valor":1}]').length, 1, "aceita o JSON em texto");
  eq([L.normalizarFaixas(null), L.normalizarFaixas("lixo"), L.normalizarFaixas({})], [[], [], []], "nada / lixo: lista vazia");
  eq(L.normalizarFaixas([{ descricao: "X", valor: 1, ate: "2026-02-30" }])[0].ate, null, "dia que não existe (30/02) não vale como prazo");
  eq(L.normalizarFaixas([{ descricao: "X", valor: 1, vagas: 2.5 }])[0].vagas, null, "vagas quebradas não valem");

  console.log("== lote vencido: o último dia vale até 23:59:59 de Brasília ==");
  const f = { descricao: "1º lote", valor: 50, ate: "2026-11-05", vagas: null };
  eq(L.loteVencido(f, BRT("2026-11-05T23:59:58")), false, "05/11 às 23:59:58 (Brasília): ainda vale");
  eq(L.loteVencido(f, BRT("2026-11-06T00:00:01")), true, "06/11 à meia-noite e um segundo: vencido");
  eq(L.loteVencido(f, Date.parse("2026-11-06T02:00:00Z")), false, "02:00 UTC do dia 6 ainda é 23:00 do dia 5 em Brasília: vale");
  eq(L.loteVencido({ ...f, ate: null }, Date.now()), false, "sem prazo: nunca vence");

  console.log("== qual lote a pessoa escolheu ==");
  const faixas = L.normalizarFaixas([
    { descricao: "1º lote", valor: 50, ate: "2026-11-05", vagas: 100 },
    { descricao: "2º lote", valor: 70, ate: "2026-11-20" },
    { descricao: "Visitante", valor: 70 },
  ]);
  const antes = BRT("2026-11-01T10:00:00");
  const depois = BRT("2026-11-10T10:00:00");
  eq(L.escolherFaixa(faixas, { rotulo: "1º lote", valor: 50 }, antes).faixa.descricao, "1º lote", "pelo rótulo (e o valor batendo)");
  eq(L.escolherFaixa(faixas, { rotulo: "1º lote", valor: 70 }, antes).erro.status, 400, "rótulo do lote barato com o valor do caro: recusa (400)");
  eq(L.escolherFaixa(faixas, { rotulo: "Inventado" }, antes).erro.body.erro, "Faixa de valor inválida.", "rótulo que não existe: 400");
  const venc = L.escolherFaixa(faixas, { rotulo: "1º lote", valor: 50 }, depois);
  eq([venc.erro.status, venc.erro.body.motivo, venc.erro.body.lote], [409, "lote_vencido", "1º lote"], "lote vencido: 409 com o motivo e o lote");
  verdade(/encerrou em 05\/11\/2026\. Escolha o lote seguinte/.test(venc.erro.body.erro), "e a frase diz até quando valia e o que fazer");
  eq(L.escolherFaixa(faixas, { valor: 50 }, antes).faixa.descricao, "1º lote", "página antiga (só o valor): acha pela faixa de mesmo valor");
  eq(L.escolherFaixa(faixas, { valor: 70 }, depois).faixa.descricao, "2º lote", "só o valor, repetido em duas faixas: a primeira em vigor");
  eq(L.escolherFaixa(faixas, { valor: 50 }, depois).erro.status, 409, "só o valor de um lote vencido: 409");
  eq(L.escolherFaixa(faixas, {}, antes), { faixa: null }, "sem escolher faixa: segue sem faixa (como sempre foi)");
  eq(L.escolherFaixa([], { rotulo: "x", valor: 9 }, antes), { faixa: null }, "evento sem faixas: ignora o que vier");

  console.log("== situação dos lotes (página pública) ==");
  const sit = L.situacaoDosLotes(faixas, { "1º lote": 100 }, antes);
  eq(sit.map((s) => [s.descricao, s.disponivel, s.motivo, s.restantes]), [["1º lote", false, "esgotado", 0], ["2º lote", true, null, null], ["Visitante", true, null, null]], "lote com 100 de 100: esgotado; os outros, disponíveis");
  eq(L.situacaoDosLotes(faixas, { "1º lote": 30 }, depois).map((s) => s.motivo), ["vencido", null, null], "vencido pela data, mesmo com vagas");
  eq(L.situacaoDosLotes(faixas, {}, antes)[0].restantes, null, "sem a contagem (esquema não aplicado): disponível, a trava decide na hora");

  console.log("== a inscrição com lote (montarRegistros) ==");
  const base = { nomes: ["Ana"], evento: { vagas_limite: 5 }, eventoId: 1, valorFaixa: 50, faixa: faixas[0], contarLote: true, cupom: null, contarVagas: true, pendenteAprovacao: false, telefone: "11 99999-0000", telefoneHash: "hash", telefoneChave: "chave", email: null };
  let m = montarRegistros(base, { confirmados: 0, usosCupom: 0, usadasLote: 99 });
  eq([m.registros.length, m.registros[0].faixa_rotulo, m.loteNovos, m.registros[0].aguardando_vaga], [1, "1º lote", 1, false], "cabe no lote (99 de 100): grava com o rótulo do lote");
  m = montarRegistros(base, { confirmados: 0, usosCupom: 0, usadasLote: 100 });
  eq([m.recusa.status, m.recusa.body.motivo, m.recusa.body.restantes, m.registros.length], [409, "lote_esgotado", 0, 0], "lote cheio: recusa 409, nada a gravar");
  verdade(/Esse lote esgotou .*Escolha o lote seguinte/.test(m.recusa.body.erro), "com a frase 'esse lote esgotou, escolha o lote seguinte'");
  m = montarRegistros({ ...base, nomes: ["A", "B", "C"] }, { confirmados: 0, usosCupom: 0, usadasLote: 98 });
  eq([m.recusa && m.recusa.body.restantes], [2], "grupo de 3 com 2 vagas no lote: recusa o grupo inteiro (diz que restam 2)");
  verdade(/só tem 2 vagas e a inscrição tem 3 pessoas/.test(m.recusa.body.erro), "e explica: só tem 2 vagas para 3 pessoas");
  m = montarRegistros(base, { confirmados: 5, usosCupom: 0, usadasLote: 10 });
  eq([m.registros[0].aguardando_vaga, m.loteNovos], [true, 1], "evento lotado (5 de 5) mas o lote tem vaga: entra na LISTA DE ESPERA (o limite geral nunca recusa) e conta no lote");
  m = montarRegistros({ ...base, faixa: faixas[2], contarLote: false }, { confirmados: 0, usosCupom: 0, usadasLote: 9999 });
  eq([m.registros[0].faixa_rotulo, m.recusa], ["Visitante", undefined], "lote sem vagas: não conta nada, só grava o rótulo");
  m = montarRegistros({ ...base, faixa: null, contarLote: false, valorFaixa: null }, { confirmados: 0, usosCupom: 0 });
  eq([m.registros[0].faixa_rotulo, m.loteNovos], [null, 0], "sem faixa: faixa_rotulo vazio");

  console.log("== o laço da senha com a recusa do lote ==");
  const V0 = novaInstancia();
  {
    const leituras = [];
    const r = await V0.reservarEGravarEvento({
      estadoInicial: { ultima: 7, estado: { confirmados: 0, usosCupom: 0, usadasLote: 100 }, em: Date.now() },
      lerUltimaSenha: async () => { leituras.push("senha"); return 9; },
      lerEstado: async () => { leituras.push("conta"); return { confirmados: 0, usosCupom: 0, usadasLote: 99 }; },
      montar: (e) => (e.usadasLote >= 100 ? { recusa: { status: 409 } } : { registros: [{}], confirmadosNovos: 1, usosNovos: 0, loteNovos: 1 }),
      gravar: async (_r, n) => { leituras.push("grava" + n); return { ok: true }; },
    });
    eq([leituras, r.ok, r.estado.usadasLote], [["senha", "conta", "grava10"], true, 100], "recusa tirada da MEMÓRIA não vale: relê (uma vaga voltou), grava e soma o lote");
    const r2 = await V0.reservarEGravarEvento({
      lerUltimaSenha: async () => 3, lerEstado: async () => ({ confirmados: 0, usosCupom: 0, usadasLote: 100 }),
      montar: () => ({ recusa: { status: 409, body: { motivo: "lote_esgotado" } } }), gravar: async () => { throw new Error("não devia gravar"); },
    });
    eq([r2.ok, r2.recusa.status, r2.ultima, r2.estado.usadasLote], [false, 409, 3, 100], "recusa com leitura de verdade: devolve a recusa SEM gravar");
  }

  // ----- o Directus de mentira (como o de vagas-evento-unidade.cjs, mais a contagem por lote) -----
  function novoDirectus({ atraso = 4, semUnico = false, semCampoLote = false } = {}) {
    const banco = { inscricoes: [], chaves: new Set(), controle: [], proximoId: 1, conflitos: 0, contagensLote: 0 };
    const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
    async function directus(caminho, init = {}) {
      await dormir(Math.floor(Math.random() * atraso));
      const metodo = init.method || "GET";
      const url = new URL("http://x" + caminho);
      const q = decodeURIComponent(caminho);
      const evento = Number((/evento\]\[_eq\]=(\d+)/.exec(q) || [])[1]);
      if (url.pathname === "/items/evento_controle" && metodo === "GET") {
        return json(200, { data: banco.controle.filter((c) => c.evento === evento).sort((a, b) => b.n - a.n).slice(0, 1).map((c) => ({ n: c.n })) });
      }
      if (url.pathname === "/items/inscricoes_eventos" && metodo === "GET") {
        const doEvento = banco.inscricoes.filter((i) => i.evento === evento);
        if (q.includes("faixa_rotulo")) {
          if (semCampoLote) return json(403, { errors: [{ message: "You don't have permission to access field faixa_rotulo" }] });
          banco.contagensLote += 1;
          const rotulo = url.searchParams.get("filter[faixa_rotulo][_eq]");
          return json(200, { data: [{ count: { id: String(doEvento.filter((i) => i.faixa_rotulo === rotulo).length) } }] });
        }
        if (q.includes("cupom_usado")) return json(200, { data: [{ count: { id: "0" } }] });
        return json(200, { data: [{ count: { id: String(doEvento.filter((i) => i.aguardando_vaga === false || i.aguardando_vaga == null).length) } }] });
      }
      if (url.pathname === "/items/inscricoes_eventos" && metodo === "POST") {
        const corpo = JSON.parse(init.body);
        for (const r of corpo) for (const c of r.controle || []) {
          if (!semUnico && banco.chaves.has(c.chave)) { banco.conflitos += 1; return json(400, { errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }] }); }
        }
        const criadas = corpo.map((r) => {
          const { controle, ...resto } = r;
          const linha = { id: banco.proximoId++, ...resto };
          for (const c of controle || []) { banco.chaves.add(c.chave); banco.controle.push({ evento: c.evento, n: c.n, inscricao: linha.id }); }
          banco.inscricoes.push(linha);
          return linha;
        });
        return json(200, { data: criadas });
      }
      return json(404, { errors: [{ message: "rota não prevista no teste: " + caminho }] });
    }
    return { directus, banco };
  }
  const noLote = (fake, rotulo) => fake.banco.inscricoes.filter((i) => i.faixa_rotulo === rotulo).length;
  const confirmadas = (fake) => fake.banco.inscricoes.filter((i) => !i.aguardando_vaga).length;
  const FILA_FOLGADA = { maxNaFila: 100000, esperaMaxMs: 600000 };
  const inscrever = (modulo, fake, { pessoas = 1, vagasEvento = null, faixa, opcoesFila = FILA_FOLGADA } = {}) => {
    const contarVagas = vagasEvento != null;
    const contarLote = faixa.vagas != null;
    const montar = (estado) => montarRegistros({ nomes: Array.from({ length: pessoas }, (_, i) => `Pessoa ${i}`), evento: { vagas_limite: vagasEvento }, eventoId: 1, valorFaixa: faixa.valor, faixa, contarLote, cupom: null, contarVagas, pendenteAprovacao: false, telefone: "11 99999-0000", telefoneHash: "hash", telefoneChave: "chave", email: null }, estado);
    return modulo.gravarInscricoesComTrava({ directus: fake.directus, eventoId: 1, contarVagas, loteRotulo: contarLote ? faixa.descricao : null, montar, log: () => {}, opcoesFila, repeticao: { esperar: async () => {} } }).catch((e) => ({ erro: e.message }));
  };
  async function rajada(instancias, quantas, opcoes, fake = novoDirectus({ atraso: 6 }), modulos = Array.from({ length: instancias }, () => novaInstancia())) {
    const resultados = await Promise.all(Array.from({ length: quantas }, (_, i) => inscrever(modulos[i % instancias], fake, typeof opcoes === "function" ? opcoes(i) : opcoes)));
    return { fake, resultados };
  }
  const LOTE1 = { descricao: "1º lote", valor: 50, ate: null, vagas: 40 };
  const LOTE2 = { descricao: "2º lote", valor: 70, ate: null, vagas: null };

  console.log("== a corrida: 40 vagas no lote, muita gente ao mesmo tempo ==");
  {
    const { fake, resultados } = await rajada(1, 100, { faixa: LOTE1 });
    const aceitas = resultados.filter((r) => r.criadas).length;
    const recusadas = resultados.filter((r) => r.recusa && r.recusa.status === 409).length;
    eq([noLote(fake, "1º lote"), aceitas, recusadas], [40, 40, 60], "uma instância, 100 ao mesmo tempo: exatamente 40 no lote, 60 recusadas com 'escolha o lote seguinte'");
    verdade(resultados.filter((r) => r.recusa).every((r) => r.recusa.body.motivo === "lote_esgotado"), "toda recusa é a do lote esgotado (409)");
  }
  for (const instancias of [2, 4, 8]) {
    const { fake, resultados } = await rajada(instancias, 160, { faixa: LOTE1 });
    const aceitas = resultados.filter((r) => r.criadas).length;
    const estranhos = resultados.filter((r) => r.erro || (r.erroHttp && r.erroHttp.status !== 503)).length;
    eq(noLote(fake, "1º lote"), 40, `${instancias} instâncias, 160 inscrições: o lote enche EXATAMENTE em 40 (${fake.banco.conflitos} recusas do banco na disputa)`);
    eq(fake.banco.inscricoes.length, aceitas, `${instancias} instâncias: aceitas = gravadas (${aceitas})`);
    eq(estranhos, 0, `${instancias} instâncias: só aceita, 'esgotou' (409) ou 'tente de novo' (503)`);
  }

  console.log("== grupos na fronteira do lote ==");
  {
    const { fake, resultados } = await rajada(4, 60, { faixa: LOTE1, pessoas: 3 });
    eq(noLote(fake, "1º lote") <= 40, true, `grupos de 3: nunca passa de 40 (tem ${noLote(fake, "1º lote")})`);
    eq(noLote(fake, "1º lote"), 39, "e fica em 39: o grupo de 3 que não cabe nas últimas vagas é recusado INTEIRO (não divide o grupo entre lotes)");
    verdade(resultados.some((r) => r.recusa && r.recusa.body.restantes === 1), "a recusa da fronteira diz que resta 1 vaga");
  }

  console.log("== dois lotes ao mesmo tempo, o limite geral do evento junto ==");
  {
    const { fake, resultados } = await rajada(4, 120, (i) => ({ faixa: i % 2 ? LOTE2 : LOTE1, vagasEvento: 50 }));
    eq([noLote(fake, "1º lote"), noLote(fake, "2º lote")], [40, 60], "1º lote para em 40 (os outros 20 recusados), o 2º (sem limite) recebe os 60");
    eq(confirmadas(fake), 50, "o limite GERAL do evento (50) confirma exatamente 50 — o resto vai para a LISTA DE ESPERA, sem recusar");
    eq(resultados.filter((r) => r.recusa).length, 20, "só as 20 do lote esgotado foram recusadas");
  }

  console.log("== a memória: o lote esgotado responde sem martelar o Directus, e uma vaga que volta é vista ==");
  {
    const modulo = novaInstancia();
    const fake = novoDirectus({ atraso: 1 });
    for (let i = 0; i < 40; i++) await inscrever(modulo, fake, { faixa: LOTE1 });
    const r = await inscrever(modulo, fake, { faixa: LOTE1 });
    eq([r.recusa && r.recusa.status, noLote(fake, "1º lote")], [409, 40], "a 41ª em sequência: 409");
    fake.banco.inscricoes.splice(0, 1); // a equipe apagou uma inscrição do lote
    const volta = await inscrever(modulo, fake, { faixa: LOTE1 });
    verdade(volta.criadas, "a vaga apagada volta NA HORA: a recusa pela memória é sempre conferida com uma leitura nova");
  }

  console.log("== sem o campo faixa_rotulo no Directus (esquema v7.13 não aplicado) ==");
  {
    const r = await inscrever(novaInstancia(), novoDirectus({ semCampoLote: true }), { faixa: LOTE1 });
    eq(r, { semControle: true }, "a contagem do lote dá 403: avisa para gravar do jeito antigo, nunca deixa de aceitar inscrição");
  }

  console.log("== o teste do teste ==");
  {
    let maior = 0;
    for (let rodada = 0; rodada < 3 && maior <= 40; rodada += 1) {
      const { fake } = await rajada(4, 160, { faixa: LOTE1 }, novoDirectus({ atraso: 6, semUnico: true }));
      maior = Math.max(maior, noLote(fake, "1º lote"));
    }
    verdade(maior > 40, `sem a chave única do banco, a mesma rajada ESTOURA o lote (${maior} para 40)`);
    // ordem errada: conta (o lote) ANTES de ler a última senha
    const caminhoLib = require.resolve("../../api/src/lib/vagasEvento.js");
    const fonte = fs.readFileSync(caminhoLib, "utf8");
    const mutante = fonte.replace(/ultima = await lerUltimaSenha\(\);\s*\n\s*estado = await lerEstado\(\);[^\n]*/, "estado = await lerEstado();\n      ultima = await lerUltimaSenha();");
    verdade(mutante !== fonte, "(o mutante da ordem foi criado)");
    const instanciaMutante = () => {
      delete require.cache[require.resolve("../../api/src/lib/limiteLote.js")];
      const mm = new Module(caminhoLib);
      mm.filename = caminhoLib;
      mm.paths = Module._nodeModulePaths(path.dirname(caminhoLib));
      mm._compile(mutante, caminhoLib);
      return mm.exports;
    };
    maior = 0;
    for (let rodada = 0; rodada < 5 && maior <= 40; rodada += 1) {
      const { fake } = await rajada(4, 160, { faixa: LOTE1 }, novoDirectus({ atraso: 6 }), [0, 1, 2, 3].map(instanciaMutante));
      maior = Math.max(maior, noLote(fake, "1º lote"));
    }
    verdade(maior > 40, `contando o lote ANTES da senha, a rajada ESTOURA (${maior} para 40)`);
    // a recusa tem de acontecer DENTRO da trava: um mutante que esquece a recusa (montar ignora o lote) estoura
    const semRecusa = await rajada(4, 100, { faixa: { ...LOTE1, vagas: null } });
    verdade(noLote(semRecusa.fake, "1º lote") > 40, "sem o número de vagas no lote, nada segura (100 gravadas): é a contagem dentro da trava que segura");
  }

  // ----- as funções de verdade, com fetch de mentira -----
  console.log("== CriarInscricao: lote vencido, esgotado e o rótulo gravado ==");
  {
    const fake = novoDirectus({ atraso: 0 });
    const evento = { id: 1, title: "Seminário", aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: null, vagas_limite: null, requer_aprovacao: false, permite_inscricao_grupo: true,
      faixas_valor: [{ descricao: "1º lote", valor: 50, ate: "2020-01-01" }, { descricao: "2º lote", valor: 70, vagas: 2 }] };
    globalThis.fetch = async (url, init = {}) => {
      const caminho = String(url).replace(process.env.DIRECTUS_URL, "");
      if (caminho.startsWith("/items/eventos/1")) return new Response(JSON.stringify({ data: evento }), { status: 200 });
      if (caminho.includes("telefone_chave")) return new Response(JSON.stringify({ data: [{ count: { id: "0" } }] }), { status: 200 });
      if (caminho.startsWith("/items/respostas_inscricao")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return fake.directus(caminho, init);
    };
    delete require.cache[require.resolve("../../api/CriarInscricao/index.js")];
    const handler = require("../../api/CriarInscricao/index.js");
    let ip = 0;
    const chamar = async (body) => { const ctx = { log: Object.assign(() => {}, { warn() {}, error() {} }) }; await handler(ctx, { headers: { "x-forwarded-for": `10.0.0.${++ip}, 1.1.1.1` }, body }); return ctx.res; };
    let r = await chamar({ eventoId: 1, nomes: ["Ana"], telefone: "94 99999-0001", faixa: "1º lote", valorFaixa: 50 });
    eq([r.status, r.body.motivo], [409, "lote_vencido"], "lote vencido: 409 antes de qualquer gravação");
    r = await chamar({ eventoId: 1, nomes: ["Ana"], telefone: "94 99999-0002", faixa: "2º lote", valorFaixa: 70 });
    eq([r.status, r.body.inscricoes[0].faixa, fake.banco.inscricoes[0].faixa_rotulo, Number(fake.banco.inscricoes[0].valor)], [200, "2º lote", "2º lote", 70], "lote em vigor: 200, rótulo e valor gravados");
    r = await chamar({ eventoId: 1, nomes: ["Bia", "Caio"], telefone: "94 99999-0003", faixa: "2º lote", valorFaixa: 70 });
    eq([r.status, r.body.motivo, r.body.restantes], [409, "lote_esgotado", 1], "grupo de 2 com 1 vaga no lote: 409 'escolha o lote seguinte'");
    r = await chamar({ eventoId: 1, nomes: ["Bia"], telefone: "94 99999-0004", faixa: "2º lote", valorFaixa: 70 });
    eq(r.status, 200, "uma pessoa ainda cabe");
    r = await chamar({ eventoId: 1, nomes: ["Davi"], telefone: "94 99999-0005", faixa: "2º lote", valorFaixa: 70 });
    eq([r.status, r.body.motivo, noLote(fake, "2º lote")], [409, "lote_esgotado", 2], "a 3ª no lote de 2: 409, o lote fica em 2");
    r = await chamar({ eventoId: 1, nomes: ["Eva"], telefone: "94 99999-0006", faixa: "2º lote", valorFaixa: 999 });
    eq(r.status, 400, "rótulo certo com valor inventado: 400");
  }

  console.log("== StatusInscricao: a situação dos lotes para a página ==");
  {
    const evento = { id: 2, aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: null, vagas_limite: null, requer_aprovacao: false,
      faixas_valor: [{ descricao: "1º lote", valor: 50, ate: "2020-01-01" }, { descricao: "2º lote", valor: 70, vagas: 3 }, { descricao: "3º lote", valor: 90, vagas: 10 }] };
    const pedidos = [];
    globalThis.fetch = async (url) => {
      const caminho = decodeURIComponent(String(url).replace(process.env.DIRECTUS_URL, ""));
      pedidos.push(caminho);
      if (caminho.startsWith("/items/eventos/2")) return new Response(JSON.stringify({ data: evento }), { status: 200 });
      if (caminho.includes("groupBy[]=faixa_rotulo")) return new Response(JSON.stringify({ data: [{ faixa_rotulo: "2º lote", count: { id: "3" } }, { faixa_rotulo: "3º lote", count: { id: "4" } }, { faixa_rotulo: null, count: { id: "9" } }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    };
    delete require.cache[require.resolve("../../api/StatusInscricao/index.js")];
    const handler = require("../../api/StatusInscricao/index.js");
    const ctx = { log: Object.assign(() => {}, { warn() {}, error() {} }) };
    await handler(ctx, { params: { eventoId: "2" } });
    eq(ctx.res.body.lotes.map((l) => [l.descricao, l.disponivel, l.motivo, l.restantes]), [["1º lote", false, "vencido", null], ["2º lote", false, "esgotado", 0], ["3º lote", true, null, 6]], "vencido, esgotado (3 de 3) e disponível (restam 6)");
    eq(ctx.res.body.lotes.some((l) => "inscritos" in l), false, "o número de inscritos de cada lote não sai (só 'restam N')");
    eq(pedidos.filter((p) => p.includes("groupBy")).length, 1, "UMA consulta agrupada para todos os lotes");
  }

  console.log(falhas === 0 ? `\nTUDO CERTO (${total} verificações)` : `\n${falhas} FALHA(S) de ${total}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
