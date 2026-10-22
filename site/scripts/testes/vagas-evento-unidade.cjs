// Testes de UNIDADE da trava de vagas e de cupom das inscrições em evento (api/src/lib/vagasEvento.js + a regra de CriarInscricao): a regra de quem fica confirmado e quem leva o desconto,
// o laço da senha e — o que mais importa — a corrida contra um Directus de MENTIRA em memória, com centenas de inscrições ao mesmo tempo e várias "instâncias": as vagas e os usos do
// cupom NUNCA passam do número. Inclui o teste do teste: sem a chave única, ou lendo na ordem errada, a corrida estoura (se não estourasse, este teste não provaria nada).
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/vagas-evento-unidade.cjs
process.env.TELEFONE_CHAVE_SEGREDO = "segredo-de-teste-unidade-nao-usar-em-producao";
process.env.DIRECTUS_URL = "http://x";
process.env.DIRECTUS_ADMIN_TOKEN = "x";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { montarRegistros } = require("../../api/CriarInscricao/index.js");

let falhas = 0;
const eq = (a, b, d) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Cada instância do Azure Functions tem a SUA fila e a SUA memória: o módulo é recarregado para simular uma instância nova, todas no MESMO banco.
function novaInstancia() {
  delete require.cache[require.resolve("../../api/src/lib/limiteLote.js")];
  delete require.cache[require.resolve("../../api/src/lib/vagasEvento.js")];
  return require("../../api/src/lib/vagasEvento.js");
}
const V0 = novaInstancia();

// ----- a regra (função pura que a trava chama a cada tentativa) -----
console.log("== quem fica confirmado e quem leva o desconto ==");
const base = { nomes: ["Ana"], evento: { vagas_limite: 5 }, eventoId: 1, valorFaixa: 100, cupom: null, contarVagas: true, pendenteAprovacao: false, telefone: "11 99999-0000", telefoneHash: "hash", telefoneChave: "chave", email: null };
const sit = (m) => m.registros.map((r) => [r.aguardando_vaga, r.valor, r.cupom_usado]);
let m = montarRegistros(base, { confirmados: 0, usosCupom: 0 });
eq([sit(m), m.confirmadosNovos, m.usosNovos], [[[false, 100, null]], 1, 0], "com vaga: confirmado");
m = montarRegistros(base, { confirmados: 5, usosCupom: 0 });
eq([sit(m), m.confirmadosNovos], [[[true, 100, null]], 0], "vagas cheias: lista de espera");
m = montarRegistros({ ...base, nomes: ["A", "B", "C"] }, { confirmados: 4, usosCupom: 0 });
eq([sit(m).map((x) => x[0]), m.confirmadosNovos], [[false, true, true], 1], "grupo de 3 com 1 vaga: o primeiro confirma, os outros 2 vão para a lista de espera");
m = montarRegistros({ ...base, contarVagas: false, pendenteAprovacao: true }, { confirmados: 999, usosCupom: 0 });
eq([sit(m), m.registros[0].pendente_aprovacao, m.confirmadosNovos], [[[false, 100, null]], true, 0], "evento com aprovação: ninguém vai para a lista de espera (a equipe decide)");
m = montarRegistros({ ...base, evento: { vagas_limite: null }, contarVagas: false }, { confirmados: 0, usosCupom: 0 });
eq(sit(m), [[false, 100, null]], "evento sem limite de vagas: sempre confirmado");
const cupomFixo = { codigo: "PAZ10", tipo: "fixo", valor: 10, limite_usos: 2, usos: 0 };
m = montarRegistros({ ...base, nomes: ["A", "B", "C"], cupom: cupomFixo, contarVagas: false, evento: {} }, { confirmados: 0, usosCupom: 1 });
eq([sit(m), m.usosNovos], [[[false, 90, "PAZ10"], [false, 100, null], [false, 100, null]], 1], "cupom com limite 2 e 1 uso já feito: só a primeira pessoa do grupo leva o desconto");
m = montarRegistros({ ...base, cupom: cupomFixo, contarVagas: false }, { confirmados: 0, usosCupom: 2 });
eq([sit(m), m.usosNovos], [[[false, 100, null]], 0], "cupom esgotado: sem desconto, inscrição segue");
m = montarRegistros({ ...base, cupom: { codigo: "P50", tipo: "percentual", valor: 50, limite_usos: null }, contarVagas: false }, { confirmados: 0, usosCupom: 1000 });
eq([sit(m), m.usosNovos], [[[false, 50, "P50"]], 1], "cupom sem limite: sempre aplica (50%), e a contagem não importa");
m = montarRegistros({ ...base, cupom: { codigo: "FIM", tipo: "fixo", valor: 500, limite_usos: 9 }, contarVagas: false }, { confirmados: 0, usosCupom: 0 });
eq(m.registros[0].valor, 0, "desconto maior que o valor: zero, nunca negativo");
eq(montarRegistros(base, { confirmados: 0, usosCupom: 0 }).registros[0].codigo.length, 6, "cada inscrição ganha um código de check-in de 6 letras");

// ----- a leitura da resposta de gravação -----
console.log("== a resposta da gravação em lote ==");
(async () => {
  const res = (status, corpo) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });
  eq(await V0.classificarGravacaoLote(res(200, { data: [{ id: 1 }] })), { ok: true, data: [{ id: 1 }], status: 200 }, "gravou");
  eq(await V0.classificarGravacaoLote(res(400, { errors: [{ extensions: { code: "RECORD_NOT_UNIQUE" } }] })), { conflito: true }, "chave única violada = conflito de senha (a leitura é refeita)");
  eq((await V0.classificarGravacaoLote(res(400, { errors: [{ extensions: { code: "INVALID_PAYLOAD" } }] }))).falhou, true, "outro 400 NÃO é conflito: é falha");
  eq((await V0.classificarGravacaoLote(res(500, "boom"))).falhou, true, "500 é falha");
  eq((await V0.classificarGravacaoLote(res(403, { errors: [{ message: "sem permissão" }] }))).status, 403, "403 é devolvido para o aviso de esquema ausente");

  // ----- o laço da senha -----
  console.log("== o laço da senha: ordem das leituras e desistências ==");
  const eventos = [];
  await V0.reservarEGravarEvento({
    lerUltimaSenha: async () => { eventos.push("senha"); return 0; }, lerEstado: async () => { eventos.push("conta"); return { confirmados: 0, usosCupom: 0 }; },
    montar: () => ({ registros: [], confirmadosNovos: 0, usosNovos: 0 }), gravar: async (_r, n) => { eventos.push("grava" + n); return { ok: true }; },
  });
  eq(eventos, ["senha", "conta", "grava1"], "primeiro a última senha, DEPOIS a contagem, depois grava h+1 (é essa ordem que garante a exatidão)");
  let tentativas = 0;
  const lidas = [];
  const rr = await V0.reservarEGravarEvento({
    esperar: async () => {}, lerUltimaSenha: async () => 3, lerEstado: async () => ({ confirmados: 2, usosCupom: 0 }),
    montar: (e) => { lidas.push(e.confirmados); return { registros: [], confirmadosNovos: 1, usosNovos: 0 }; },
    gravar: async () => { tentativas += 1; return tentativas < 3 ? { conflito: true } : { ok: true }; },
  });
  eq([rr.ok, tentativas, rr.ultima, rr.estado.confirmados], [true, 3, 4, 3], "conflito: lê de novo e tenta de novo; ao fim guarda a senha e a contagem somada");
  eq((await V0.reservarEGravarEvento({ esperar: async () => {}, maxTentativas: 4, lerUltimaSenha: async () => 1, lerEstado: async () => ({ confirmados: 0, usosCupom: 0 }), montar: () => ({ registros: [] }), gravar: async () => ({ conflito: true }) })).ocupado, true, "conflito sem fim: desiste ('ocupado'), nunca grava sem a senha");
  eq((await V0.reservarEGravarEvento({ lerUltimaSenha: async () => 1, lerEstado: async () => ({ confirmados: 0, usosCupom: 0 }), montar: () => ({ registros: [] }), gravar: async () => ({ falhou: true, status: 500 }) })).falhou.status, 500, "falha que não é conflito não é repetida");
  const comMemoria = [];
  await V0.reservarEGravarEvento({
    estadoInicial: { ultima: 7, estado: { confirmados: 3, usosCupom: 1 }, em: 123 },
    lerUltimaSenha: async () => { comMemoria.push("leu-senha"); return 7; }, lerEstado: async () => { comMemoria.push("leu-estado"); return { confirmados: 3, usosCupom: 1 }; },
    montar: (e) => { comMemoria.push(`monta:${e.confirmados}`); return { registros: [] }; }, gravar: async (_r, n) => { comMemoria.push("grava" + n); return { ok: true }; },
  });
  eq(comMemoria, ["monta:3", "grava8"], "com memória recente: não lê nada, grava a senha seguinte à lembrada");

  // ----- o Directus de mentira -----
  // Cada operação demora um tempo aleatório (para as inscrições se entrelaçarem de verdade). A gravação em lote é atômica: ou grava tudo e a senha, ou nada, e a chave única recusa quem chegou
  // depois — como o PostgreSQL faz com a transação do Directus. `semUnico` desliga a chave única (para o teste do teste).
  // `leiturasQueFalham`: as primeiras N leituras (GET) respondem 503 (Directus ocupado); `Infinity` = todas. `gravacaoDepoisDeGravar`: grava e responde 503 (o 5xx que vem DEPOIS de o banco gravar).
  function novoDirectus({ atraso = 4, falhaGravacao = false, semEsquema = false, semPermissaoDaSenha = false, semUnico = false, leiturasQueFalham = 0, gravacaoDepoisDeGravar = false } = {}) {
    const banco = { inscricoes: [], chaves: new Set(), controle: [], proximoId: 1, chamadas: { senha: 0, vagas: 0, cupom: 0, gravacao: 0, conflitos: 0, leiturasRecusadas: 0 } };
    const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
    async function directus(caminho, init = {}) {
      await dormir(Math.floor(Math.random() * atraso));
      const metodo = init.method || "GET";
      if (metodo === "GET" && banco.chamadas.leiturasRecusadas < leiturasQueFalham) { banco.chamadas.leiturasRecusadas += 1; return json(503, { errors: [{ message: "ocupado" }] }); }
      const url = new URL("http://x" + caminho);
      const evento = Number((/evento\]\[_eq\]=(\d+)/.exec(caminho) || /evento\]\[_eq\]=(\d+)/.exec(decodeURIComponent(caminho)) || [])[1]);
      if (url.pathname === "/items/evento_controle" && metodo === "GET") {
        banco.chamadas.senha += 1;
        if (semEsquema) return json(403, { errors: [{ message: "You don't have permission to access collection \"evento_controle\" or it does not exist." }] });
        return json(200, { data: banco.controle.filter((c) => c.evento === evento).sort((a, b) => b.n - a.n).slice(0, 1).map((c) => ({ n: c.n })) });
      }
      if (url.pathname === "/items/inscricoes_eventos" && metodo === "GET") {
        const doEvento = banco.inscricoes.filter((i) => i.evento === evento);
        if (caminho.includes("cupom_usado")) {
          banco.chamadas.cupom += 1;
          const codigo = decodeURIComponent((/cupom_usado\]\[_eq\]=([^&]+)/.exec(caminho) || [])[1]);
          return json(200, { data: [{ count: { id: String(doEvento.filter((i) => i.cupom_usado === codigo).length) } }] });
        }
        banco.chamadas.vagas += 1;
        return json(200, { data: [{ count: { id: String(doEvento.filter((i) => i.aguardando_vaga === false || i.aguardando_vaga == null).length) } }] });
      }
      if (url.pathname === "/items/inscricoes_eventos" && metodo === "POST") {
        banco.chamadas.gravacao += 1;
        if (falhaGravacao) return json(500, { errors: [{ message: "boom" }] });
        const corpo = JSON.parse(init.body);
        if (semPermissaoDaSenha && corpo.some((r) => r.controle)) return json(403, { errors: [{ message: "You don't have permission to access field controle" }] });
        for (const r of corpo) for (const c of r.controle || []) {
          if (!semUnico && banco.chaves.has(c.chave)) { banco.chamadas.conflitos += 1; return json(400, { errors: [{ message: "unique", extensions: { code: "RECORD_NOT_UNIQUE" } }] }); }
        }
        const criadas = corpo.map((r) => {
          const { controle, ...resto } = r;
          const linha = { id: banco.proximoId++, ...resto };
          for (const c of controle || []) { banco.chaves.add(c.chave); banco.controle.push({ evento: c.evento, n: c.n, inscricao: linha.id, pessoas: c.pessoas }); }
          banco.inscricoes.push(linha);
          return linha;
        });
        if (gravacaoDepoisDeGravar) return json(503, { errors: [{ message: "o gateway desistiu depois de o banco gravar" }] });
        return json(200, { data: criadas });
      }
      return json(404, { errors: [{ message: "rota não prevista no teste: " + caminho }] });
    }
    return { directus, banco };
  }

  const confirmadas = (fake, ev = 1) => fake.banco.inscricoes.filter((i) => i.evento === ev && !i.aguardando_vaga).length;
  const comCupom = (fake, codigo, ev = 1) => fake.banco.inscricoes.filter((i) => i.evento === ev && i.cupom_usado === codigo).length;
  const FILA_FOLGADA = { maxNaFila: 100000, esperaMaxMs: 600000 };
  // O que a função de inscrição faz: monta com a regra real (`montarRegistros`) e grava pela trava.
  const inscrever = (modulo, fake, { pessoas = 1, vagas = 40, cupom = null, contarVagas = true, evento = 1, opcoesFila = FILA_FOLGADA, repeticao = { esperar: async () => {} } } = {}) => {
    const montar = (estado) => montarRegistros({ nomes: Array.from({ length: pessoas }, (_, i) => `Pessoa ${i}`), evento: { vagas_limite: vagas }, eventoId: evento, valorFaixa: 100, cupom, contarVagas, pendenteAprovacao: false, telefone: "11 99999-0000", telefoneHash: "hash", telefoneChave: "chave", email: null }, estado);
    // `repeticao.esperar` vazio: o teste não espera de verdade entre as releituras
    return modulo.gravarInscricoesComTrava({ directus: fake.directus, eventoId: evento, cupomCodigo: cupom && cupom.limite_usos != null ? cupom.codigo : null, contarVagas, montar, log: () => {}, opcoesFila, repeticao }).catch((e) => ({ erro: e.message }));
  };
  async function rajada(instancias, inscricoes, opcoes, { atraso = 6, fake = novoDirectus({ atraso }), ev = 1 } = {}) {
    const modulos = Array.from({ length: instancias }, () => novaInstancia());
    const resultados = await Promise.all(Array.from({ length: inscricoes }, (_, i) => inscrever(modulos[i % instancias], fake, { ...opcoes, evento: ev })));
    return { fake, resultados };
  }
  const so200 = (rs) => rs.filter((x) => x.criadas).length;

  console.log("== uma instância, 100 inscrições ao mesmo tempo, 40 vagas ==");
  {
    const { fake, resultados } = await rajada(1, 100, { vagas: 40 });
    eq(so200(resultados), 100, "TODAS são aceitas (quem não cabe vai para a lista de espera)");
    eq([confirmadas(fake), fake.banco.inscricoes.length - confirmadas(fake)], [40, 60], "no banco: exatamente 40 confirmadas e 60 na lista de espera");
    eq(fake.banco.controle.map((c) => c.n).sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1), "as senhas são 1..100, sem buraco e sem repetição");
    eq(fake.banco.chamadas.conflitos, 0, "com a fila, nenhuma disputa de senha");
  }

  console.log("== várias instâncias disputando as mesmas vagas (só a chave única do banco segura) ==");
  for (const instancias of [2, 4, 8]) {
    const { fake, resultados } = await rajada(instancias, 120, { vagas: 40 });
    const aceitas = so200(resultados);
    eq(confirmadas(fake) <= 40, true, `${instancias} instâncias: NUNCA passa de 40 confirmadas (tem ${confirmadas(fake)})`);
    eq(fake.banco.inscricoes.length, aceitas, `${instancias} instâncias: aceitas = gravadas (${aceitas}) — nenhuma aceita sem gravar, nenhuma gravada sem resposta`);
    eq(confirmadas(fake), 40, `${instancias} instâncias: havendo demanda, as vagas enchem exatamente em 40 (${fake.banco.chamadas.conflitos} recusas do banco na disputa)`);
    eq(new Set(fake.banco.controle.map((c) => c.n)).size, fake.banco.controle.length, `${instancias} instâncias: nenhuma senha repetida`);
    eq(resultados.filter((x) => x.erro || (x.erroHttp && x.erroHttp.status !== 503)).length, 0, `${instancias} instâncias: só aceita ou "tente de novo", nenhum erro estranho`);
  }

  console.log("== inscrição em GRUPO na corrida (3 pessoas cada) ==");
  {
    const { fake, resultados } = await rajada(4, 60, { vagas: 40, pessoas: 3 });
    eq(confirmadas(fake) <= 40, true, `grupos de 3 em 4 instâncias: nunca passa de 40 (tem ${confirmadas(fake)})`);
    eq(confirmadas(fake), 40, "e as vagas enchem exatamente (um grupo pode ficar dividido: parte confirmada, parte na espera)");
    eq(fake.banco.inscricoes.length, so200(resultados) * 3, "cada grupo aceito gravou as 3 pessoas");
    eq(fake.banco.controle.every((c) => c.pessoas === 3), true, "a senha de cada grupo guarda quantas pessoas ele tinha");
    eq(fake.banco.controle.length, so200(resultados), "UMA senha por inscrição (não por pessoa)");
  }

  console.log("== limite de usos do cupom ==");
  {
    const cupom = { codigo: "PAZ10", tipo: "fixo", valor: 10, limite_usos: 10 };
    const { fake, resultados } = await rajada(4, 80, { vagas: null, contarVagas: false, cupom });
    eq([so200(resultados), comCupom(fake, "PAZ10")], [80, 10], "80 inscrições ao mesmo tempo com um cupom de 10 usos: todas aceitas, e o desconto vai para exatamente 10");
    eq(fake.banco.inscricoes.filter((i) => i.cupom_usado === "PAZ10").every((i) => i.valor === 90) && fake.banco.inscricoes.filter((i) => !i.cupom_usado).every((i) => i.valor === 100), true, "quem levou o cupom paga 90; os outros, 100");
    const grupos = await rajada(2, 30, { vagas: null, contarVagas: false, cupom: { ...cupom, limite_usos: 25 }, pessoas: 2 });
    eq(comCupom(grupos.fake, "PAZ10"), 25, "grupos de 2 e limite 25: exatamente 25 descontos (o grupo da fronteira leva 1)");
  }

  console.log("== vagas E cupom ao mesmo tempo ==");
  {
    const cupom = { codigo: "DUPLO", tipo: "percentual", valor: 50, limite_usos: 15 };
    const { fake, resultados } = await rajada(4, 100, { vagas: 30, cupom });
    eq([confirmadas(fake), comCupom(fake, "DUPLO"), so200(resultados)], [30, 15, 100], "30 vagas e 15 usos de cupom, 100 inscrições ao mesmo tempo: os dois limites exatos");
  }

  console.log("== cupons diferentes no mesmo evento não misturam a contagem ==");
  {
    const modulo = novaInstancia();
    const fake = novoDirectus({ atraso: 1 });
    const A = { codigo: "AAA", tipo: "fixo", valor: 10, limite_usos: 5 };
    const B = { codigo: "BBB", tipo: "fixo", valor: 10, limite_usos: 5 };
    for (let i = 0; i < 3; i++) await inscrever(modulo, fake, { vagas: null, contarVagas: false, cupom: A });
    const r = await inscrever(modulo, fake, { vagas: null, contarVagas: false, cupom: B });
    eq([comCupom(fake, "AAA"), comCupom(fake, "BBB"), r.estado.usosCupom], [3, 1, 1], "o cupom B começa do ZERO (a memória do A não vale para ele)");
    for (let i = 0; i < 4; i++) await inscrever(modulo, fake, { vagas: null, contarVagas: false, cupom: B });
    const esgotada = await inscrever(modulo, fake, { vagas: null, contarVagas: false, cupom: B });
    eq([comCupom(fake, "BBB"), esgotada.montagem.usosNovos], [5, 0], "B esgota em 5 e a seguinte entra sem desconto");
  }

  console.log("== eventos diferentes não se atrapalham ==");
  {
    const modulo = novaInstancia();
    const fake = novoDirectus({ atraso: 2 });
    await Promise.all([...Array.from({ length: 30 }, () => inscrever(modulo, fake, { vagas: 10, evento: 1 })), ...Array.from({ length: 30 }, () => inscrever(modulo, fake, { vagas: 20, evento: 2 }))]);
    eq([confirmadas(fake, 1), confirmadas(fake, 2)], [10, 20], "evento 1 com 10 vagas e evento 2 com 20, juntos: cada um respeita o seu");
    eq([fake.banco.controle.filter((c) => c.evento === 1).length, fake.banco.controle.filter((c) => c.evento === 2).length], [30, 30], "cada evento tem o seu livro de senhas (1..30)");
  }

  console.log("== gente demais de uma vez: 'tente de novo' na hora, sem estourar ==");
  {
    const modulo = novaInstancia();
    const fake = novoDirectus({ atraso: 40 });
    const inicio = Date.now();
    const r = await Promise.all(Array.from({ length: 120 }, () => inscrever(modulo, fake, { vagas: 20, opcoesFila: { esperaMaxMs: 500, duracaoInicialMs: 100 } })));
    const aceitas = so200(r);
    const ocupadas = r.filter((x) => x.erroHttp && x.erroHttp.status === 503 && x.erroHttp.body.motivo === "ocupado").length;
    verdade(aceitas > 0 && ocupadas > 0, `parte entra (${aceitas}) e parte recebe "tente de novo" (${ocupadas})`);
    eq(aceitas + ocupadas, 120, "toda inscrição tem resposta: aceita ou 503, nenhum erro estranho");
    eq(fake.banco.inscricoes.length, aceitas, "aceitas = gravadas");
    eq(confirmadas(fake) <= 20, true, "e as vagas não passaram");
    verdade(Date.now() - inicio < 5000, "as recusas foram imediatas (não ficaram esperando a fila inteira)");
  }

  console.log("== a memória do estado: pula leituras sem afrouxar a garantia ==");
  {
    let modulo = novaInstancia();
    let fake = novoDirectus({ atraso: 2 });
    for (let i = 0; i < 30; i++) await inscrever(modulo, fake, { vagas: 100 });
    eq([fake.banco.chamadas.senha, fake.banco.chamadas.vagas, fake.banco.chamadas.gravacao], [1, 1, 30], "30 inscrições em sequência: UMA leitura do livro e UMA contagem, 30 gravações");
    // a idade conta desde a última leitura REAL
    modulo = novaInstancia();
    fake = novoDirectus({ atraso: 1 });
    await inscrever(modulo, fake, { vagas: 100 });
    const chave = modulo.chaveDoEstado(1, null, true);
    const primeiro = modulo.estadoRecente(chave).em;
    await dormir(40);
    await inscrever(modulo, fake, { vagas: 100 });
    eq(modulo.estadoRecente(chave).em, primeiro, "gravar usando a memória NÃO renova a hora da leitura: em poucos segundos tudo é lido de novo");
    // estado velho é ignorado: a equipe mexeu nas inscrições por fora
    modulo = novaInstancia();
    fake = novoDirectus({ atraso: 1 });
    for (let i = 0; i < 3; i++) await inscrever(modulo, fake, { vagas: 3 });
    fake.banco.inscricoes.splice(0, 2); // a equipe apagou 2 inscrições
    const chave2 = modulo.chaveDoEstado(1, null, true);
    modulo.lembrarEstado(chave2, 3, { confirmados: 3, usosCupom: 0 }, Date.now() - 10000);
    const livre = await inscrever(modulo, fake, { vagas: 3 });
    eq(livre.montagem.registros[0].aguardando_vaga, false, "passados poucos segundos (estado velho), lê de novo, vê as vagas liberadas e confirma");
    // outra instância gravou no meio: a senha que a memória pede já foi tomada, o banco recusa e a leitura nova mostra o que mudou
    const a = novaInstancia();
    const b = novaInstancia();
    fake = novoDirectus({ atraso: 1 });
    await inscrever(a, fake, { vagas: 5 });                                   // A grava 1 de 5 e fica com a memória
    for (let i = 0; i < 3; i++) await inscrever(b, fake, { vagas: 5 });       // B grava mais 3 (4 de 5) sem A saber
    const r1 = await inscrever(a, fake, { vagas: 5 });                        // memória velha: tenta a senha 2, o banco recusa, A lê de novo (4 de 5) e grava a 5ª
    const r2 = await inscrever(a, fake, { vagas: 5 });                        // a 6ª pessoa de 5 vagas: lista de espera
    eq([r1.montagem.registros[0].aguardando_vaga, r2.montagem.registros[0].aguardando_vaga, confirmadas(fake), fake.banco.chamadas.conflitos], [false, true, 5, 1], "A com memória velha: o banco recusa a senha tomada por B, A relê e só então grava; a 6ª vai para a lista de espera (5 de 5)");
  }

  console.log("== Directus ocupado: a leitura que falha é refeita, a gravação nunca é repetida às cegas ==");
  {
    // 6 leituras recusadas no começo, 30 inscrições ao mesmo tempo, 40 vagas: nenhuma falha chega à pessoa e nada passa do limite
    const ocupado = novoDirectus({ atraso: 3, leiturasQueFalham: 6 });
    const { resultados } = await rajada(2, 30, { vagas: 10, repeticao: { tentativas: 20, esperar: async () => {} } }, { fake: ocupado });
    eq([so200(resultados), confirmadas(ocupado), ocupado.banco.chamadas.leiturasRecusadas], [30, 10, 6], "6 leituras recusadas (503) no começo da rajada, com folga de tentativas: as 30 inscrições entram, as vagas continuam exatas (10)");
    // o Directus não volta: depois de 3 tentativas a função desiste COM ERRO (a API responde 502) e nada é gravado
    const fora = novoDirectus({ atraso: 1, leiturasQueFalham: Infinity });
    const r = await inscrever(novaInstancia(), fora, { vagas: 10 });
    verdade(/falha ao ler o livro de senhas do evento \(503\)/.test(r.erro || ""), "Directus fora do ar: erro claro depois das tentativas, sem gravar");
    eq([fora.banco.chamadas.leiturasRecusadas, fora.banco.inscricoes.length], [3, 0], "foram exatamente 3 tentativas de leitura");
    // o 5xx que vem DEPOIS de o banco gravar: repetir a gravação criaria a inscrição em dobro, então ela NÃO é repetida
    const depois = novoDirectus({ atraso: 1, gravacaoDepoisDeGravar: true });
    const g = await inscrever(novaInstancia(), depois, { vagas: 10 });
    eq([g.erroHttp && g.erroHttp.status, depois.banco.chamadas.gravacao, depois.banco.inscricoes.length], [502, 1, 1], "5xx na gravação: 502 para a pessoa, UMA só gravação (nunca em dobro)");
    // a espera entre as tentativas cresce e a de esquema ausente não repete
    const esperas = [];
    let chamadas = 0;
    await V0.lerComRepeticao(async () => { chamadas += 1; if (chamadas < 3) throw new Error("x"); return "ok"; }, { esperar: async (ms) => { esperas.push(ms); }, aleatorio: () => 0 });
    eq([chamadas, esperas], [3, [150, 300]], "duas esperas crescentes (150 ms, 300 ms) antes da terceira tentativa");
    let semEsq = 0;
    await V0.lerComRepeticao(async () => { semEsq += 1; const e = new Error("sem esquema"); e.semEsquema = true; throw e; }, { esperar: async () => {} }).catch(() => {});
    eq(semEsq, 1, "esquema ausente: uma tentativa só (repetir não adianta)");
  }

  console.log("== falhas ==");
  {
    const modulo = novaInstancia();
    const falha = novoDirectus({ falhaGravacao: true });
    const f = await inscrever(modulo, falha, { vagas: 10 });
    eq([f.erroHttp.status, f.erroHttp.body.erro], [502, "Falha ao registrar a inscrição."], "o Directus recusa a gravação: 502, a inscrição não é aceita");
    eq(falha.banco.inscricoes.length, 0, "nada gravado");
    const sem = await inscrever(novaInstancia(), novoDirectus({ semEsquema: true }), { vagas: 10 });
    eq(sem, { semControle: true }, "esquema ausente (o Directus responde 403 para a coleção do livro de senhas): avisa para a função de inscrição gravar do jeito antigo, sem trava, em vez de falhar");
    const semPerm = await inscrever(novaInstancia(), novoDirectus({ semPermissaoDaSenha: true }), { vagas: 10 });
    eq(semPerm, { semControle: true }, "403 na gravação da senha: também cai no jeito antigo");
    const quebrado = await novaInstancia().gravarInscricoesComTrava({ directus: async () => new Response("{}", { status: 500 }), eventoId: 1, montar: () => ({ registros: [] }), log: () => {} }).catch((e) => ({ erro: e.message }));
    verdade(/livro de senhas/.test(quebrado.erro || ""), "sem conseguir ler o livro de senhas a função LANÇA erro (a API responde 502 e a inscrição não entra)");
  }

  // ----- o teste do teste -----
  console.log("== o teste do teste: sem a trava, a corrida estoura (se não estourasse, nada acima provaria algo) ==");
  {
    const { fake } = await rajada(4, 120, { vagas: 40 }, { fake: novoDirectus({ atraso: 6, semUnico: true }) });
    verdade(confirmadas(fake) > 40, `sem a chave única do banco, a mesma rajada ESTOURA as vagas (${confirmadas(fake)} confirmadas para 40)`);

    // ordem errada: conta ANTES de ler a última senha. Duas instâncias contam o mesmo número e a senha sozinha não percebe. O mutante é a própria biblioteca com as duas leituras trocadas.
    const caminhoLib = require.resolve("../../api/src/lib/vagasEvento.js");
    const fonte = fs.readFileSync(caminhoLib, "utf8");
    const mutante = fonte.replace(/ultima = await lerUltimaSenha\(\);\s*\n\s*estado = await lerEstado\(\);[^\n]*/, "estado = await lerEstado();\n      ultima = await lerUltimaSenha();");
    verdade(mutante !== fonte, "(o mutante da ordem foi criado: a contagem passa a vir antes da última senha)");
    const instanciaMutante = () => {
      delete require.cache[require.resolve("../../api/src/lib/limiteLote.js")];
      const mm = new Module(caminhoLib);
      mm.filename = caminhoLib;
      mm.paths = Module._nodeModulePaths(path.dirname(caminhoLib));
      mm._compile(mutante, caminhoLib);
      return mm.exports;
    };
    // A corrida depende do acaso (quase sempre estoura na primeira rodada, às vezes não): até 5 rodadas; basta UMA estourar para provar que o teste pega o defeito (22/10/2026:
    // com uma rodada só, cerca de 1 vez em 6 o mutante ficava em 40 e o teste do teste falhava à toa).
    let maior = 0;
    for (let rodada = 0; rodada < 5 && maior <= 40; rodada += 1) {
      const mutantes = [0, 1, 2, 3].map(instanciaMutante);
      const fake2 = novoDirectus({ atraso: 6 });
      await Promise.all(Array.from({ length: 120 }, (_, i) => inscrever(mutantes[i % 4], fake2, { vagas: 40 })));
      maior = Math.max(maior, confirmadas(fake2));
    }
    verdade(maior > 40, `lendo na ordem errada (conta, depois a senha), a rajada ESTOURA as vagas (${maior} confirmadas para 40)`);
  }

  console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
