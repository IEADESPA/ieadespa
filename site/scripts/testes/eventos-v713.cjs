// Bateria da v7.13 (EVENTOS, INSCRIÇÕES E CONGRESSOS) pelo HTTP, contra o emulador `swa-local.cjs` ligado a um Directus de TESTE (a réplica local, C:/tmp/directus-local).
// Prova, gravando de verdade num Directus real:
//   1. LOTES: 40 inscrições AO MESMO TEMPO num lote de 10 vagas → exatamente 10 no lote, as outras recusadas com "esse lote esgotou" (409) — nunca passa; lote vencido recusado;
//      a página pública recebe a situação dos lotes (esgotado/vencido); o limite geral do evento continua mandando para a lista de espera;
//   2. INFORMAR O PAGAMENTO (código + telefone): grava o aviso, NÃO marca pago, informar de novo substitui, telefone errado não acha;
//   3. CONFIRMAR COM NOME E HORA: com um usuário de equipe temporário, marcar/desmarcar "pago" grava quem (o id e o nome DO TOKEN) e quando; cortesia exige motivo e quem
//      autorizou; tipo de participante; um perfil sem permissão é recusado;
//   4. CREDENCIAMENTO POR LOCAL: a equipe registra entradas em `evento_entradas` com o PRÓPRIO token; o Directus grava quem foi (`user_created`) por cima do que a chamada
//      mandar; a mesma entrada não duplica (chave única); a mesma pessoa entra em dois locais; a contagem passa da capacidade e o aviso aparece; o público não lê nem grava;
//   5. AUSENTES: quem tinha vaga e não entrou, por lote e por tipo;
//   6. CRACHÁ: a verificação (código + telefone) devolve o tipo e as respostas escolhidas pelo evento.
// Apaga tudo no fim (evento, inscrições, entradas, usuário, função e política temporários).
//
// SÓ NA RÉPLICA LOCAL (cria usuário, função e política temporários): recusa rodar se DIRECTUS_URL não for 127.0.0.1/localhost, a não ser com V713_FORA_DO_LOCAL=sim.
//   DIRECTUS_URL=http://127.0.0.1:8055 DIRECTUS_ADMIN_TOKEN=… node scripts/testes/swa-local.cjs 4400 --ip-aleatorio      (em outro terminal)
//   SITE_URL=http://127.0.0.1:4400 DIRECTUS_URL=http://127.0.0.1:8055 DIRECTUS_ADMIN_TOKEN=… node scripts/testes/eventos-v713.cjs
// Pré-requisito: o esquema `site/scripts/directus-eventos-v713-esquema.mjs` (e o da trava, `directus-vagas-esquema.mjs`) aplicados nesse Directus.
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { carregarTs } = require("./carregar-ts.cjs");
const { ambiente, Verificador, esperar } = require("./comum.cjs");

let C, IPainel;

async function main() {
  C = await carregarTs("credenciamento");
  IPainel = await carregarTs("inscricoesPainel");
  const { SITE, URL, dx, site } = ambiente();
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL) && process.env.V713_FORA_DO_LOCAL !== "sim") {
    console.error("Esta bateria cria usuário, função e política temporários: só roda contra a réplica local (DIRECTUS_URL=http://127.0.0.1:8055). Ver o cabeçalho.");
    process.exit(2);
  }
  const v = new Verificador("v7.13 eventos");
  const tel = () => "9495" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  const ontem = new Date(Date.now() - 27 * 3600 * 1000).toISOString().slice(0, 10);
  const publico = async (m, q, b) => { const r = await fetch(URL + q, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const comToken = (token) => async (m, q, b) => { const r = await fetch(URL + q, { method: m, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, data: j.data, erro: j.errors?.[0]?.message, codigo: j.errors?.[0]?.extensions?.code }; };
  const painel = async (token, corpo) => { const r = await fetch(SITE + "/api/painel-inscricao", { method: "POST", headers: { "Content-Type": "application/json", "x-painel-token": token }, body: JSON.stringify(corpo) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };

  const campos = ((await dx("GET", "/fields/inscricoes_eventos")).data || []).map((f) => f.field);
  const temEntradas = (await dx("GET", "/collections/evento_entradas")).ok;
  v.ok("o Directus tem o esquema v7.13 (rode site/scripts/directus-eventos-v713-esquema.mjs se não)", campos.includes("faixa_rotulo") && campos.includes("pago_conferido_por") && temEntradas);
  v.ok("e o livro de senhas da trava (directus-vagas-esquema.mjs)", (await dx("GET", "/collections/evento_controle")).ok);
  if (!campos.includes("faixa_rotulo") || !temEntradas) { v.fim(); return; }

  const limpar = { evento: null, pergunta: null, politica: null, funcao: null, usuarios: [] };
  try {
    // ---------- o evento de teste ----------
    const ev = await dx("POST", "/items/eventos", {
      title: "TESTE V713 (apagar)", slug: "teste-v713-" + Date.now(), aceita_inscricao: true, inscricoes_encerradas: false, inscricoes_ate: "2030-12-31", event_date: "2030-12-20",
      vagas_limite: 15, requer_aprovacao: false, permite_inscricao_grupo: true,
      faixas_valor: [{ descricao: "1º lote", valor: 50, vagas: 10 }, { descricao: "2º lote", valor: 70 }, { descricao: "Lote vencido", valor: 30, ate: "2020-01-01" }],
      locais_checkin: [{ nome: "Sala A", capacidade: 2 }, "Portaria"],
    });
    if (!ev.ok) { console.log("não criou o evento:", ev.status, ev.erro); process.exit(1); }
    const E = ev.data.id;
    limpar.evento = E;
    const perg = await dx("POST", "/items/perguntas_evento", { evento: E, label: "Sua congregação", tipo: "texto_curto", obrigatoria: false, momento: "inscricao", ordem: 1 });
    limpar.pergunta = perg.data?.id;
    await dx("PATCH", `/items/eventos/${E}`, { cracha_config: { tipo: true, igreja: true, pergunta_igreja: perg.data?.id, cidade: false, qr: true } });
    console.log(`[${SITE}] evento de teste ${E}`);

    // ---------- 1. LOTES ----------
    const SIMULTANEAS = 40;
    const telefones = Array.from({ length: SIMULTANEAS }, tel);
    const inicio = Date.now();
    const rs = await Promise.all(telefones.map((t, i) => site("POST", "/api/criar-inscricao", { eventoId: E, nomes: [`Lote ${i}`], telefone: t, faixa: "1º lote", valorFaixa: 50, respostas: [{ pergunta: perg.data?.id, valor: "Congregação Betel" }] })));
    const porStatus = {};
    rs.forEach((r) => { porStatus[r.status] = (porStatus[r.status] || 0) + 1; });
    console.log(`  ${SIMULTANEAS} ao mesmo tempo no lote de 10 em ${Date.now() - inicio} ms | respostas ${JSON.stringify(porStatus)}`);
    const aceitas = rs.map((r, i) => ({ r, tel: telefones[i] })).filter((x) => x.r.status === 200);
    const esgotou = rs.filter((r) => r.status === 409 && r.j.motivo === "lote_esgotado");
    const doLote = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&filter[faixa_rotulo][_eq]=${encodeURIComponent("1º lote")}&fields=id,valor&limit=-1`)).data || [];
    v.ok("toda resposta é clara: aceita (200), 'esse lote esgotou' (409) ou 'tente de novo' (503)", rs.every((r) => r.status === 200 || r.status === 503 || (r.status === 409 && r.j.motivo === "lote_esgotado")), JSON.stringify(porStatus));
    v.ok("EXATAMENTE 10 inscrições no lote de 10 vagas (nunca passa)", doLote.length === 10, `${doLote.length} no banco`);
    v.ok("aceitas = gravadas", aceitas.length === doLote.length, `${aceitas.length} aceitas`);
    v.ok("as recusas dizem para escolher o lote seguinte", esgotou.length > 0 && esgotou.every((r) => /escolha o lote seguinte/i.test(r.j.erro)), esgotou[0]?.j?.erro);
    v.ok("quem entrou no lote tem o valor do lote (R$ 50)", doLote.every((i) => Number(i.valor) === 50));
    let r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Sem lote"], telefone: tel() });
    v.ok("[revisão 1] evento com lotes e inscrição SEM escolher o lote: 400 'Escolha o lote' (antes passava por cima do lote esgotado)", r.status === 400 && r.j.motivo === "lote_obrigatorio", r.j.erro);
    r = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["Vencido"], telefone: tel(), faixa: "Lote vencido", valorFaixa: 30 });
    v.ok("lote vencido: 409 'encerrou… escolha o lote seguinte'", r.status === 409 && r.j.motivo === "lote_vencido", r.j.erro);
    // o limite geral (15) continua mandando para a lista de espera no lote sem limite
    const grupo = await site("POST", "/api/criar-inscricao", { eventoId: E, nomes: ["G1", "G2", "G3", "G4", "G5", "G6", "G7"], telefone: tel(), faixa: "2º lote", valorFaixa: 70 });
    v.ok("grupo de 7 no 2º lote (sem limite) com 5 vagas gerais: aceito, 5 confirmados e 2 na LISTA DE ESPERA (o limite geral nunca recusa)", grupo.status === 200 && grupo.j.inscricoes.filter((i) => i.aguardandoVaga).length === 2 && grupo.j.inscricoes.every((i) => i.faixa === "2º lote"), JSON.stringify(grupo.j.inscricoes?.map((i) => i.aguardandoVaga)));
    await esperar(21000); // o status guarda a resposta por 20 s
    const status = await site("GET", `/api/status-inscricao/${E}`);
    const lote = (n) => (status.j.lotes || []).find((l) => l.descricao === n) || {};
    v.ok("página pública: 1º lote esgotado, lote vencido encerrado, 2º lote disponível", lote("1º lote").motivo === "esgotado" && lote("Lote vencido").motivo === "vencido" && lote("2º lote").disponivel === true, JSON.stringify(status.j.lotes));

    // ---------- 2. INFORMAR O PAGAMENTO ----------
    const alvo = aceitas[0];
    const codigo = alvo.r.j.inscricoes[0].codigo;
    const inscricaoId = alvo.r.j.inscricoes[0].id;
    const aviso = { data: ontem, meio: "PIX", valor: "50,00", nome: "Maria Teste" };
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo, telefone: alvo.tel, pagamento: aviso });
    let item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("informar pagamento (código + telefone): 200 e o aviso gravado", r.status === 200 && item.pagamento_informado_nome === "Maria Teste" && Number(item.pagamento_informado_valor) === 50 && item.pagamento_informado_meio === "PIX", r.j.erro || "");
    v.ok("informar NÃO marca como pago", item.pago !== true);
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo, telefone: alvo.tel, pagamento: { ...aviso, valor: "45", meio: "DINHEIRO", nome: "João Teste" } });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("informar de novo substitui o aviso", r.status === 200 && item.pagamento_informado_nome === "João Teste" && Number(item.pagamento_informado_valor) === 45);
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo, telefone: "(11) 90000-0000", pagamento: aviso });
    v.ok("telefone errado: 404", r.status === 404);
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo, telefone: alvo.tel, pagamento: { ...aviso, data: "2099-01-01" } });
    v.ok("data no futuro: 400", r.status === 400, r.j.erro);
    const ver = await site("POST", "/api/verificar-inscricao", { evento: E, modo: "codigo", codigo, telefone: alvo.tel, cracha: true });
    v.ok("a verificação mostra o aviso à própria pessoa (e o lote)", ver.j.pagamentoInformado?.nome === "João Teste" && ver.j.faixa === "1º lote");

    // ---------- 3. CONFIRMAR COM NOME E HORA (usuário de equipe temporário) ----------
    const pol = await dx("POST", "/policies", { name: "TESTE V713 equipe (apagar)", admin_access: false, app_access: false });
    limpar.politica = pol.data?.id;
    for (const [col, acao] of [["inscricoes_eventos", "read"], ["inscricoes_eventos", "update"], ["eventos", "read"], ["respostas_inscricao", "read"], ["evento_entradas", "create"], ["evento_entradas", "read"]]) {
      await dx("POST", "/permissions", { policy: limpar.politica, collection: col, action: acao, fields: ["*"], permissions: {}, validation: {} });
    }
    const funcao = await dx("POST", "/roles", { name: "TESTE V713 equipe (apagar)" });
    limpar.funcao = funcao.data?.id;
    await dx("POST", "/access", { role: limpar.funcao, policy: limpar.politica });
    const senha = "Teste-v713-" + Math.random().toString(36).slice(2) + "A1!";
    const email = `teste-v713-${Date.now()}@exemplo.org`;
    const usuario = await dx("POST", "/users", { email, password: senha, role: limpar.funcao, status: "active", first_name: "Equipe", last_name: "Teste" });
    if (usuario.data?.id) limpar.usuarios.push(usuario.data.id);
    v.ok("usuário de equipe temporário criado", usuario.ok, usuario.erro || "");
    const login = await publico("POST", "/auth/login", { email, password: senha });
    const tokenEquipe = login.j.data?.access_token;
    v.ok("e ele entra (token do painel)", Boolean(tokenEquipe));
    // um segundo usuário SEM permissão de alterar inscrições
    const polLeitor = await dx("POST", "/policies", { name: "TESTE V713 leitor (apagar)", admin_access: false, app_access: false });
    await dx("POST", "/permissions", { policy: polLeitor.data?.id, collection: "inscricoes_eventos", action: "read", fields: ["*"], permissions: {}, validation: {} });
    const funcaoLeitor = await dx("POST", "/roles", { name: "TESTE V713 leitor (apagar)" });
    await dx("POST", "/access", { role: funcaoLeitor.data?.id, policy: polLeitor.data?.id });
    limpar.extras = { politica: polLeitor.data?.id, funcao: funcaoLeitor.data?.id };
    const emailLeitor = `teste-v713-leitor-${Date.now()}@exemplo.org`;
    const leitor = await dx("POST", "/users", { email: emailLeitor, password: senha, role: funcaoLeitor.data?.id, status: "active" });
    if (leitor.data?.id) limpar.usuarios.push(leitor.data.id);
    const tokenLeitor = (await publico("POST", "/auth/login", { email: emailLeitor, password: senha })).j.data?.access_token;

    r = await painel(tokenEquipe, { inscricaoId, acao: "pago", pago: true, pago_conferido_por_nome: "Nome Inventado" });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("marcar pago pelo painel: pago, com QUEM (id e nome do token, não o inventado) e QUANDO", r.status === 200 && item.pago === true && item.pago_conferido_por === usuario.data.id && item.pago_conferido_por_nome === "Equipe Teste" && Math.abs(Date.parse(item.pago_conferido_em) - Date.now()) < 60000, `${r.status} ${item.pago_conferido_por_nome}`);
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo, telefone: alvo.tel, pagamento: aviso });
    v.ok("depois de confirmado, informar de novo é recusado (409)", r.status === 409);
    r = await painel(tokenEquipe, { inscricaoId, acao: "pago", pago: false });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("desmarcar também guarda quem e quando", r.status === 200 && item.pago === false && item.pago_conferido_por_nome === "Equipe Teste");
    r = await painel(tokenLeitor, { inscricaoId, acao: "pago", pago: true });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=pago`)).data;
    v.ok("perfil sem permissão de alterar inscrições: 403 e nada muda", r.status === 403 && item.pago === false, `${r.status} ${r.j.erro}`);
    r = await painel("token-inventado", { inscricaoId, acao: "pago", pago: true });
    v.ok("token inventado: 401", r.status === 401);
    const outra = aceitas[1].r.j.inscricoes[0].id;
    r = await painel(tokenEquipe, { inscricaoId: outra, acao: "cortesia", ativa: true, motivo: "", autorizadoPor: "Pr. Teste" });
    v.ok("cortesia sem motivo: 400", r.status === 400);
    r = await painel(tokenEquipe, { inscricaoId: outra, acao: "cortesia", ativa: true, motivo: "Preletor convidado", autorizadoPor: "Pr. Teste" });
    item = (await dx("GET", `/items/inscricoes_eventos/${outra}?fields=*`)).data;
    v.ok("cortesia com motivo e quem autorizou: gravada com quem registrou e quando", r.status === 200 && item.cortesia === true && item.cortesia_motivo === "Preletor convidado" && item.cortesia_autorizada_por === "Pr. Teste" && item.cortesia_registrada_por === usuario.data.id && Boolean(item.cortesia_em));
    r = await painel(tokenEquipe, { inscricaoId: outra, acao: "tipo", tipo: "Preletor" });
    v.ok("tipo de participante: Preletor", r.status === 200 && r.j.inscricao?.tipo_participante === "Preletor");
    const verPreletor = await site("POST", "/api/verificar-inscricao", { evento: E, modo: "codigo", codigo: aceitas[1].r.j.inscricoes[0].codigo, telefone: aceitas[1].tel, cracha: true });
    v.ok("CRACHÁ: a verificação devolve o tipo, a igreja (da pergunta escolhida) e a configuração do QR", verPreletor.j.cracha?.tipo === "Preletor" && verPreletor.j.cracha?.igreja === "Congregação Betel" && verPreletor.j.cracha?.config?.qr === true, JSON.stringify(verPreletor.j.cracha));
    r = await site("POST", "/api/informar-pagamento", { tipo: "inscricao", evento: E, codigo: aceitas[1].r.j.inscricoes[0].codigo, telefone: aceitas[1].tel, pagamento: aviso });
    v.ok("cortesia: informar pagamento é recusado (409)", r.status === 409);

    // revisão de 22/10/2026
    r = await painel(tokenEquipe, { inscricaoId, acao: "cortesia", ativa: false });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("[revisão 17] tirar a cortesia de quem nunca teve: 409 e nada gravado", r.status === 409 && !item.cortesia_em, `${r.status}`);
    r = await painel(tokenEquipe, { inscricaoId, acao: "pago", pago: true });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("[revisão 3] o painel grava o VALOR registrado junto (pago_conferido_valor)", r.status === 200 && item.pago_conferido_valor === true && !IPainel.registroDivergente(item).pago);
    const direto = await comToken(tokenEquipe)("PATCH", `/items/inscricoes_eventos/${inscricaoId}`, { pago: false });
    item = (await dx("GET", `/items/inscricoes_eventos/${inscricaoId}?fields=*`)).data;
    v.ok("[revisão 3] a equipe desmarca o 'pago' DIRETO no Directus (a licença não deixa fechar o campo): o painel mostra 'registro divergente'", direto.ok && IPainel.registroDivergente(item).pago && /divergente/.test(IPainel.textoConferencia(item)), IPainel.textoConferencia(item));
    // um anônimo cria uma resposta nova para a pergunta "igreja" de outra inscrição (aqui pelo administrador, imitando a criação pública)
    const insc2 = aceitas[1].r.j.inscricoes[0];
    await dx("POST", "/items/respostas_inscricao", { inscricao: insc2.id, pergunta: perg.data?.id, valor: "IGREJA FALSA" });
    const verFalsa = await site("POST", "/api/verificar-inscricao", { evento: E, modo: "codigo", codigo: insc2.codigo, telefone: aceitas[1].tel, cracha: true });
    v.ok("[revisão 2] resposta criada depois para a mesma pergunta NÃO muda o crachá (vale a da inscrição)", verFalsa.j.cracha?.igreja === "Congregação Betel", verFalsa.j.cracha?.igreja);
    const respostasGravadas = (await dx("GET", `/items/respostas_inscricao?filter[inscricao][_eq]=${insc2.id}&fields=id,date_created&sort=id`)).data || [];
    v.ok("[revisão 2] o Directus grava a data de criação da resposta (date_created)", respostasGravadas.length === 2 && respostasGravadas.every((x) => Boolean(x.date_created)));
    const verSem = await site("POST", "/api/verificar-inscricao", { evento: E, modo: "codigo", codigo: insc2.codigo, telefone: aceitas[1].tel });
    v.ok("[revisão 11] sem pedir detalhes nem crachá: a verificação não devolve os detalhes", verSem.j.encontrado === true && verSem.j.tipoParticipante === undefined);

    // ---------- 4. CREDENCIAMENTO POR LOCAL ----------
    const equipe = comToken(tokenEquipe);
    const agora = new Date();
    const entrar = (insc, local, extra = {}) => equipe("POST", "/items/evento_entradas", { evento: E, inscricao: insc, local, entrou_em: agora.toISOString(), chave: C.chaveEntrada(insc, local, agora), ...extra });
    const ids = aceitas.slice(0, 4).map((x) => x.r.j.inscricoes[0].id);
    let e = await entrar(ids[0], "Sala A", { user_created: "00000000-0000-0000-0000-000000000000" });
    const gravada = (await dx("GET", `/items/evento_entradas?filter[inscricao][_eq]=${ids[0]}&fields=*`)).data || [];
    v.ok("a equipe registra a entrada com o PRÓPRIO token", e.ok, e.erro || "");
    v.ok("quem fez o check-in é o do token: o Directus ignora o user_created inventado", gravada[0]?.user_created === usuario.data.id && Boolean(gravada[0]?.date_created), gravada[0]?.user_created);
    e = await entrar(ids[0], "Sala A");
    v.ok("a mesma entrada de novo (fila sem internet reenviando): recusada pela chave única, não duplica", !e.ok && e.codigo === "RECORD_NOT_UNIQUE", `${e.status} ${e.codigo}`);
    e = await entrar(ids[0], "Portaria");
    v.ok("a MESMA pessoa entra em outro local", e.ok);
    await entrar(ids[1], "Sala A");
    await entrar(ids[2], "Sala A");
    await equipe("PATCH", `/items/inscricoes_eventos/${ids[3]}`, { presente: true }); // presente pelo jeito antigo, sem entrada
    const ent = (await dx("GET", `/items/evento_entradas?filter[evento][_eq]=${E}&fields=inscricao,local,entrou_em,date_created&limit=-1`)).data || [];
    const contagens = C.contarPorLocal(ent, C.diaEmBrasilia(new Date()));
    const locais = C.normalizarLocais((await dx("GET", `/items/eventos/${E}?fields=locais_checkin`)).data.locais_checkin);
    v.ok("contagem por local: Sala A com 3 pessoas, Portaria com 1", contagens["Sala A"] === 3 && contagens.Portaria === 1, JSON.stringify(contagens));
    const avisoSala = C.avisoCapacidade(locais.find((l) => l.nome === "Sala A"), contagens["Sala A"]);
    v.ok("Sala A (capacidade 2) passou da capacidade: o aviso aparece", avisoSala?.nivel === "passou", avisoSala?.texto);
    let p = await publico("POST", "/items/evento_entradas", { evento: E, inscricao: ids[3], local: "Sala A", chave: "x:y:z" });
    v.ok("o PÚBLICO não grava entrada", p.status === 401 || p.status === 403, String(p.status));
    p = await publico("GET", `/items/evento_entradas?filter[evento][_eq]=${E}`);
    v.ok("nem lê", p.status === 401 || p.status === 403, String(p.status));
    p = await publico("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&fields=pagamento_informado_nome,pago_conferido_por_nome,cortesia_motivo`);
    v.ok("os campos novos com dado pessoal não têm leitura pública", p.status === 401 || p.status === 403 || (Array.isArray(p.j.data) && p.j.data.every((x) => !x.pagamento_informado_nome && !x.cortesia_motivo)), String(p.status));

    // ---------- 5. AUSENTES ----------
    const todas = (await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${E}&fields=id,nome,presente,aguardando_vaga,pendente_aprovacao,faixa_rotulo,tipo_participante&limit=-1`)).data || [];
    const ausentes = C.listarAusentes(todas, ent);
    const comVaga = todas.filter((i) => !i.aguardando_vaga && !i.pendente_aprovacao);
    v.ok("ausentes: quem entrou (3 pessoas em locais) e quem foi marcado presente (1) não estão na lista", !ausentes.some((a) => ids.includes(a.id)));
    v.ok("ausentes = os com vaga que não vieram (a lista de espera fica de fora)", ausentes.length === comVaga.length - 4 && !ausentes.some((a) => a.aguardando_vaga), `${ausentes.length} de ${comVaga.length}`);
    const porLote = C.resumoAusencia(todas, ent, "lote");
    v.ok("relatório por lote: 1º lote com 10 inscritos e 6 ausentes", porLote.find((g) => g.grupo === "1º lote")?.inscritos === 10 && porLote.find((g) => g.grupo === "1º lote")?.ausentes === 6, JSON.stringify(porLote));
    const porTipo = C.agruparAusentes(ausentes, "tipo");
    v.ok("relatório por tipo: agrupa (Participante)", porTipo.length >= 1 && porTipo.every((g) => g.pessoas.length > 0), porTipo.map((g) => `${g.grupo}:${g.pessoas.length}`).join(" "));
  } finally {
    // ---------- limpeza ----------
    if (limpar.evento) {
      const ins = ((await dx("GET", `/items/inscricoes_eventos?filter[evento][_eq]=${limpar.evento}&fields=id&limit=-1`)).data || []).map((i) => i.id);
      if (ins.length) await dx("DELETE", "/items/inscricoes_eventos", ins);
      if (limpar.pergunta) await dx("DELETE", `/items/perguntas_evento/${limpar.pergunta}`);
      await dx("DELETE", `/items/eventos/${limpar.evento}`);
      const sobras = ((await dx("GET", `/items/evento_entradas?filter[evento][_eq]=${limpar.evento}&fields=id&limit=-1`)).data || []).length;
      v.ok("limpeza: evento, inscrições e entradas apagados (as entradas vão em cascata)", sobras === 0, `${sobras} entradas sobrando`);
    }
    for (const id of limpar.usuarios) await dx("DELETE", `/users/${id}`);
    for (const id of [limpar.funcao, limpar.extras?.funcao].filter(Boolean)) await dx("DELETE", `/roles/${id}`);
    for (const id of [limpar.politica, limpar.extras?.politica].filter(Boolean)) await dx("DELETE", `/policies/${id}`);
  }
  v.fim();
}

main().catch((e) => { console.error("ERRO NA BATERIA:", e && e.stack); process.exit(1); });
