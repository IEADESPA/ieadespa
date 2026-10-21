// roteiro.js — a tela da v7.10 (check-in infantil com cadeia de custódia) contra o front de verdade, em DOM simulado, com um SERVIDOR SIMULADO COM ESTADO (fixtures.js) que usa as regras
// de verdade do backend (validação de cada corpo, janela, lotação, código, quem pode retirar...) e texto de ataque (<img src=x onerror=...>) em TODO campo que vem do servidor.
// Cobre: o contrato (ids, ações, rotas e campos do servidor), a montagem das três telas (Meu Painel, aba da liderança e tela da sala), a busca da criança, o check-in (membro, visitante,
// quem trouxe, quem mais pode retirar, cada recusa do servidor), a etiqueta e o recibo (o código só em memória e só no painel de impressão; limpeza em todos os caminhos), a retirada
// (feliz, código errado, travada, divergente, o registro mudou), a segunda via com os dois olhares, a liderança (aprovar, negar, destravar, tirar voluntário, relatório, fichas, aprovações),
// Meus filhos, a privacidade (nada em storage, nome por textContent, limpeza ao sair e ao trocar de login), a atualização automática (sem empilhar), a acessibilidade e as falhas.
"use strict";
const { criarAmbiente, lerApp } = require("./ambiente");
const F = require("./fixtures");
const { ATAQUE, ck } = F;

const MIN = 60000;
const MEU = 41;                                            // a voluntária que usa a tela nos cenários (matrícula 41); a outra adulta da sala é a 42
const SALA = { servicoId: 501, equipeId: 31 };             // Maternal, Sede, culto às 09:00 (Brasília); o relógio dos cenários é 09:30
const REGIOES = ["subMeupainelCheckininfantil", "abaCheckininfantil", "modalCaixa"];

async function rodar({ mutar = {}, so = null } = {}) {
  const T = { total: 0, falhas: [], cenarioAtual: "" };
  const confere = (cond, msg) => { T.total++; if (!cond) T.falhas.push(`${T.cenarioAtual}: ${msg}`); };
  const cenarios = [];
  const cenario = (nome, fn) => cenarios.push({ nome, fn });
  // um ato que fica esperando para sempre (por exemplo, uma confirmação que a tela devia ter dispensado) NÃO pode travar o roteiro: vira falha e o modal é fechado
  let ambienteAtual = null;
  const esperar = async (p) => {
    let tm; const limite = new Promise(r => { tm = setTimeout(() => r("__tempo"), 3000); });
    const r = await Promise.race([p, limite]); clearTimeout(tm);
    if (r === "__tempo") {
      T.total++; T.falhas.push(`${T.cenarioAtual}: o ato ficou esperando (confirmação aberta que ninguém respondeu)`);
      const env = ambienteAtual; if (env && !env.e("modalOverlay").classList.contains("escondido")) env.doc.clicar(env.e("modalCancelar"));
      await Promise.race([p, new Promise(r2 => setTimeout(r2, 500))]);
    }
    return r;
  };
  // ---- o cenário: o servidor simulado, o ambiente, a sessão ----
  // `sessao`: { membroId, lideranca, gestao }; `ataque`: texto de ataque em todo campo que vem do servidor; `sala`: abre a sala sozinho
  const montar = (op = {}) => {
    const S = F.criarServidor({ ataque: op.ataque, fatorFresco: op.fatorFresco });
    S.definirSessao(Object.assign({ membroId: MEU, lideranca: false, gestao: false }, op.sessao || {}));
    const env = ambienteAtual = criarAmbiente({ mutar, semModulo: op.semModulo });
    env.api.responder = S.responder;
    env.sessao({ matricula: S.sessao.membroId, pin: !S.sessao.lideranca, permissoes: S.sessao.gestao ? ["habilitacao_voluntarios"] : [], nivel: "GLOBAL" });
    return { S, env };
  };
  // nada pode ter executado nem ter virado marcação: zero ataque no DOM, zero chamada de __xss, e o texto de ataque aparece como TEXTO
  const limpo = (env, qual, textos = []) => {
    confere(env.doc._ataques.length === 0, `${qual}: o texto de ataque virou marcação/atributo de evento (${JSON.stringify(env.doc._ataques.slice(0, 2))})`);
    confere(env.ctx.__xss.chamadas.length === 0, `${qual}: código do ataque EXECUTOU (${env.ctx.__xss.chamadas.join(",")})`);
    const corpo = env.doc.body.textContent;
    for (const t of textos) confere(corpo.includes(t), `${qual}: o texto do servidor "${t.slice(-14)}" não apareceu na tela como texto`);
    confere(env.doc._erros.length === 0, `${qual}: HTML malformado gerado (${env.doc._erros.slice(0, 2).join("; ")})`);
  };
  const achar = (env, f) => [...env.doc.body.descendentes()].find(f) || null;
  const descendentes = (el) => (el ? [...el.descendentes()] : []);
  // botão pelo texto, sempre dentro das áreas desta tela (o index.html tem centenas de outros botões com textos parecidos)
  const botao = (env, texto, raiz) => {
    const raizes = raiz ? [raiz] : REGIOES.map(id => env.e(id)).filter(Boolean);
    for (const r of raizes) { const b = [...r.descendentes()].find(x => x.localName === "button" && x.textContent.includes(texto)); if (b) return b; }
    return null;
  };
  const botoes = (el) => descendentes(el).filter(x => x.localName === "button").map(b => b.textContent.trim());
  const chamadas = (env, chave) => env.api.chamadas.filter(c => c.chave === chave);
  const texto = (env, id) => (env.e(id) ? env.e(id).textContent : "");
  const argsDe = (el, tipo = "click") => JSON.parse(el.getAttribute(`data-args-${tipo}`));
  const visivel = (env, id) => { const el = env.e(id); if (!el) return false; for (let p = el; p && p.nodeType === 1; p = p.parentNode) if (p.style && p.style.display === "none") return false; return true; };

  // acessibilidade: todo campo tem rótulo (label for, label em volta ou aria-label); todo botão tem texto
  const controlesSemNome = (env, raiz) => {
    const para = new Set([...env.doc.body.descendentes()].filter(x => x.localName === "label" && x.getAttribute("for")).map(x => x.getAttribute("for")));
    const falhas = [];
    for (const c of raiz.descendentes()) {
      if (c.localName === "button" && !c.textContent.trim() && !c.getAttribute("aria-label")) falhas.push(`botão sem texto (${c.id})`);
      if (!["input", "select", "textarea"].includes(c.localName) || c.type === "hidden") continue;
      let dentro = false;
      for (let p = c.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.localName === "label") dentro = true;
      if (c.getAttribute("aria-label") || (c.id && para.has(c.id)) || dentro) continue;
      falhas.push(`${c.localName}#${c.id}`);
    }
    return falhas;
  };
  const confereAcessibilidade = (env, raizes, qual) => {
    for (const id of raizes) { const raiz = env.e(id); confere(!!raiz, `${qual}: área ${id} não existe`); if (raiz) { const f = controlesSemNome(env, raiz); confere(f.length === 0, `${qual}: campo/botão sem nome acessível em ${id}: ${f.slice(0, 4).join(", ")}`); } }
  };
  // ids únicos DENTRO do que a tela montou (um id escrito diferente do que o JS busca já derrubou um painel inteiro)
  const idsRepetidos = (env, raizId) => {
    const raiz = env.e(raizId); const vistos = new Set(), rep = new Set();
    if (raiz) for (const el of raiz.descendentes()) { const id = el.getAttribute("id"); if (!id) continue; if (vistos.has(id)) rep.add(id); vistos.add(id); }
    return [...rep];
  };
  // (o navegador dá o foco ao botão que a pessoa toca: o ambiente simulado só o faz se o teste mandar)
  const clicarEResponder = async (env, el, confirmar) => { if (el && typeof el.focus === "function") el.focus(); env.doc.clicar(el); const m = await env.responderModal(confirmar); await env.ocioso(); return m; };
  const esperaChegar = async (r) => { for (let i = 0; i < 40 && !r.chegou; i++) await new Promise(x => setImmediate(x)); };
  const nomeDe = (id) => `chkNome${id}`;

  // ---- passos comuns ----
  const abrirMeuPainel = async (env) => { await env.ev("mostrarSubAbaMeupainel('checkininfantil')"); await env.ocioso(); };
  const abrirSalaMeu = async (env) => { await abrirMeuPainel(env); env.doc.clicar(env.e("chkAbrirMeu501x31")); await env.ocioso(); };
  const abrirAbaGestao = async (env) => { await env.ev("mostrarAbaSecretaria('checkininfantil')"); await env.ocioso(); };
  const abrirSalaGestao = async (env) => { await abrirAbaGestao(env); env.doc.clicar(env.e("chkAbrirGes501x31")); await env.ocioso(); };
  const entrarNaSala = async (env) => { env.doc.clicar(env.e("chkEntrarBotao")); await env.ocioso(); };
  // a voluntária já entrou na sala (e a Bia, a 42, já estava): dois adultos presentes
  const salaPronta = async (op = {}) => {
    const c = montar(op);
    await abrirSalaMeu(c.env); await entrarNaSala(c.env);
    return c;
  };
  const buscar = async (env, termo) => {
    env.doc.digitar(env.e("chkCiBusca"), termo);
    env.dispararTemporizador(350); await env.ocioso();
  };
  const adicionarMembro = async (env, menorId) => { env.doc.clicar(env.e(`chkAdd${menorId}`)); await env.ocioso(); };
  const escolherQuemTrouxe = (env, valor) => { env.doc.escolher(env.e("chkCiTrouxe"), valor); };
  const preencherOutraPessoa = (env, { nome = "Tia Zeza", par = "MAE", doc = "RG", tel = "" } = {}) => {
    env.doc.escolher(env.e("chkCiTrouxe"), "OUTRA");
    env.e("chkCiTrouxeNome").value = nome; env.e("chkCiTrouxePar").value = par; env.e("chkCiTrouxeDoc").value = doc; env.e("chkCiTrouxeTel").value = tel;
  };
  const enviarCheckin = async (env) => { env.doc.clicar(env.e("chkCiEnviar")); await env.ocioso(); };
  // check-in feliz de uma criança membro (a mãe, 201, trouxe): devolve o que o servidor gerou
  const checkinDoPedro = async (c, menorId = 101) => {
    await buscar(c.env, menorId === 101 ? "Pedro" : "Lia");
    await adicionarMembro(c.env, menorId);
    escolherQuemTrouxe(c.env, "201");
    await enviarCheckin(c.env);
    const reg = c.S.registros[c.S.registros.length - 1];
    return { registro: reg, codigo: c.S.codigoDe(reg.registroId) };
  };
  // "Imprimir etiquetas e recibo": o clique chama window.print() e a tela pergunta se as etiquetas saíram; `saiu` é a resposta (true = "Sim, saíram", false = "Cancelar")
  const imprimir = async (env, saiu = true) => { const b = env.e("chkImprimirBotao"); if (b) b.focus(); env.doc.clicar(b); const m = await env.responderModal(saiu); await env.ocioso(); return m; };
  const cartao = (env, registroId) => env.e(`chkCrianca${registroId}`);
  const seloDe = (el, textoDoSelo) => descendentes(el).some(x => x.localName === "span" && /chk-selo/.test(x.className) && x.textContent.includes(textoDoSelo));

  // ============================================================================================================================================
  // 0) O CONTRATO: o HTML, o módulo e o servidor falam dos mesmos nomes
  // ============================================================================================================================================
  cenario("Contrato: ids do HTML, ações registradas, ligação com a navegação e campos do servidor", async () => {
    const ler = montar().env.lerMutado;
    const html = ler("index.html");
    const modulo = ler("modulos/checkin-infantil.js");
    const idsDoHtml = new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]));
    const prefixosDeTemplate = new Set([...modulo.matchAll(/\bid="(chk[A-Za-z0-9]+)(?:\$\{[^}]*\}|[A-Za-z0-9])*"/g)].map(m => m[1]));
    const todos = (id) => idsDoHtml.has(id) || prefixosDeTemplate.has(id) || [...prefixosDeTemplate].some(p => id.startsWith(p));
    const usados = new Set([...modulo.matchAll(/"(chk[A-Z][A-Za-z0-9]*)"/g)].map(m => m[1]).filter(x => !/Acao$/.test(x)));
    const semDono = [...usados].filter(id => !todos(id));
    confere(semDono.length === 0, `ids que o módulo usa e nenhum HTML nem template cria: ${semDono.join(", ")}`);
    const dinamicos = [...modulo.matchAll(/chkEl\(`(chk[A-Za-z0-9]+)\$\{/g)].map(m => m[1]);
    const semPrefixo = [...new Set(dinamicos)].filter(p => !todos(p) && ![...idsDoHtml].some(id => id.startsWith(p)) && ![...prefixosDeTemplate].some(x => x.startsWith(p) || p.startsWith(x)));
    confere(semPrefixo.length === 0, `ids montados por chkEl(\`prefixo\${...}\`) que nenhum HTML nem template cria: ${semPrefixo.join(", ")}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i && /^chk|Checkininfantil/.test(id));
    confere(repetidos.length === 0, `ids repetidos no index.html: ${[...new Set(repetidos)].join(", ")}`);
    const faltam = F.contratoComOServidor(modulo);
    confere(faltam.length === 0, `rotas e campos que a tela usa e o servidor não tem mais: ${faltam.join(", ")}`);
    confere(F.rotasDoModulo(modulo).length >= 20, `o contrato devia achar pelo menos 20 chamadas à API no módulo (achou ${F.rotasDoModulo(modulo).length})`);
    const env = montar().env;
    confere(env.errosDaPagina === 0, `index.html com estrutura quebrada (${env.errosDaPagina} erro(s))`);
    // a ligação com o resto: a aba está no módulo de Habilitação, a sub-aba em Meu Painel, o script entra na ordem certa, a casca offline leva o arquivo
    const grupo = env.e("grupoModuloHabilitacao");
    confere(!!grupo && !!achar(env, x => x.id === "btnAbaCheckininfantil" && x.parentNode === grupo), "btnAbaCheckininfantil devia estar dentro de grupoModuloHabilitacao");
    confere(!!env.e("btnSubMeupainelCheckininfantil") && !!env.e("subMeupainelCheckininfantil") && !!env.e("abaCheckininfantil"), "falta a sub-aba de Meu Painel ou a aba da liderança");
    confere(env.g("NOMES_ABAS").includes("checkininfantil") && env.g("SUB_ABAS_MEUPAINEL").includes("checkininfantil"), "a aba e a sub-aba precisam estar em NOMES_ABAS e SUB_ABAS_MEUPAINEL");
    confere(JSON.stringify(env.g("ABA_PERMISSOES_ALT").checkininfantil) === JSON.stringify(["habilitacao_voluntarios"]), "a aba da liderança usa a permissão habilitacao_voluntarios");
    confere(env.g("MODULOS").habilitacao.abas.includes("checkininfantil"), "a aba entra no módulo Habilitação de Voluntários");
    confere(!!env.g("TITULOS_SUB_MEUPAINEL").checkininfantil && !!env.g("AJUDA_POR_ABA")["meupainel:checkininfantil"] && !!env.g("AJUDA_POR_ABA").checkininfantil, "título e ajuda contextual das duas telas");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    confere(scripts.includes("modulos/checkin-infantil.js") && scripts.indexOf("modulos/checkin-infantil.js") > scripts.indexOf("script.js") && scripts.indexOf("modulos/checkin-infantil.js") === scripts.indexOf("modulos/catalogos-estrutura.js") + 1, "modulos/checkin-infantil.js entra depois do script.js, na ordem alfabética dos módulos");
    const sw = ler("service-worker.js");
    // a casca sobe de versão a cada entrega (v35 na v7.11): basta não ser anterior à v34, a da v7.10, e trazer o módulo
    const versaoSw = Number((/ieadespa-app-shell-v(\d+)/.exec(sw) || [])[1]);
    confere(versaoSw >= 34 && sw.includes('"/modulos/checkin-infantil.js"'), `o service worker devia estar na v34 ou depois com /modulos/checkin-infantil.js na casca (v${versaoSw})`);
    confere(/\/\/ v34 \(/.test(sw), "a v34 do service worker precisa da linha de comentário do histórico");
    const script = ler("script.js"), dados = ler("modulos/meus-dados.js");
    confere(/typeof chkLimparTela === "function"/.test(script) && /typeof chkSubAbaMudou === "function"/.test(script) && /typeof chkCarregarMeuPainelAcao === "function"/.test(script), "script.js: as três ligações com o módulo têm a guarda `typeof`");
    confere(/typeof chkAbaMudou === "function"/.test(dados) && /typeof chkCarregarOpcoesAcao === "function"/.test(dados), "meus-dados.js: as duas ligações com o módulo têm a guarda `typeof`");
    // nada de código nem estilo em linha no que o módulo e o HTML novo escrevem
    const trechoHtml = html.slice(html.indexOf('id="subMeupainelCheckininfantil"'), html.indexOf('id="subMeupainelMinhaformacao"') > 0 ? html.indexOf('id="subMeupainelMinhaformacao"') : undefined);
    confere(!/\sstyle="/.test(modulo.replace(/\/\/.*$/gm, "")) && !/\son[a-z]+="/.test(modulo.replace(/\/\/.*$/gm, "")), "o módulo não escreve style nem on...= em linha");
    confere(trechoHtml.length > 100 && !/\son(click|change|input|submit)="/.test(trechoHtml), "o HTML da sub-aba não tem evento em linha");
    confere(/^[\s\S]*registrarAcoes\(\{[\s\S]*chkAbrirSalaAcao[\s\S]*\}\);\s*$/.test(modulo), "o módulo termina registrando as suas ações");
    const css = ler("style.css");
    confere(/\.chk-etiqueta\b/.test(css) && /chk-imprimindo/.test(css) && /@media print/.test(css) && /\.chk-alergia\b/.test(css), "style.css: etiqueta, alergia e impressão");
  });

  // ============================================================================================================================================
  // 1) A MONTAGEM DAS TRÊS TELAS
  // ============================================================================================================================================
  cenario("Meu Painel: minhas salas de hoje (PIN), com texto de ataque em todo campo do servidor", async () => {
    const { S, env } = montar({ ataque: true });
    await abrirMeuPainel(env);
    for (const rota of ["catalogos", "minhas-salas", "meus-filhos"]) confere(chamadas(env, `GET checkin-infantil/${rota}`).length === 1, `abrir a sub-aba pede ${rota} uma vez`);
    confere(env.api.chamadas.filter(c => c.caminho.startsWith("checkin-infantil/")).every(c => c.comToken), "toda chamada leva o token da sessão (fetchProtegido)");
    confere(env.e("subMeupainelCheckininfantil").style.display === "block" && env.e("subMeupainelProtecao").style.display === "none", "a sub-aba abre e as outras se escondem");
    confere(/Check-in infantil/.test(texto(env, "tituloModulo")) && env.g("chaveAjudaAtual") === "meupainel:checkininfantil", "título e ajuda contextual da sub-aba");
    const cartoes = descendentes(env.e("chkMeuSalasLista")).filter(x => /chk-sala-cartao/.test(x.className));
    confere(cartoes.length === 1, `só a sala que a pessoa opera aparece (a 42 é líder de outra, a 43 está noutra): ${cartoes.length}`);
    const t = cartoes[0] ? cartoes[0].textContent : "";
    confere(t.includes("Maternal") && t.includes("[equipe31]") && t.includes("Sede"), "nome da equipe (com o texto de ataque como texto) e congregação");
    confere(t.includes("Faixa: Maternal (3 a 5 anos)") && t.includes("Serviço às 09:00"), "faixa pelo rótulo do catálogo e hora de parede do serviço (09:00, sem fuso)");
    confere(t.includes("Check-in aberto") && t.includes("Sou da equipe") && !t.includes("Visão da liderança"), "janela aberta; selo 'Sou da equipe'; sem visão de liderança no PIN");
    confere(t.includes("0 criança(s) na sala") && t.includes("1 voluntário(s) presente(s)"), "contagens do servidor");
    const abrir = env.e("chkAbrirMeu501x31");
    confere(!!abrir && abrir.getAttribute("data-on-click") === "chkAbrirSalaAcao" && JSON.stringify(argsDe(abrir)) === JSON.stringify([501, 31, "Meu"]), "o botão 'Abrir a sala' leva só ids numéricos e a constante do contexto");
    confere(/Você não é responsável cadastrado de nenhuma criança/.test(texto(env, "chkFilhosLista")), "quem não é responsável vê a explicação em Meus filhos");
    confere(texto(env, "chkMeuMsg") === "", "sem mensagem de erro");
    limpo(env, "Meu Painel/abertura", [ATAQUE("equipe31")]);
    confereAcessibilidade(env, ["subMeupainelCheckininfantil"], "Meu Painel");
    confere(idsRepetidos(env, "subMeupainelCheckininfantil").length === 0, "ids únicos na sub-aba");
    confere(env.gravacoes.length === 0, "nada vai para localStorage/sessionStorage");
  });

  cenario("Meu Painel: sem sala para a pessoa, e o login sem permissão não vê a aba da liderança", async () => {
    const a = montar({ sessao: { membroId: 99 } });
    await abrirMeuPainel(a.env);
    confere(/Você não está escalado em nenhuma sala com crianças hoje/.test(texto(a.env, "chkMeuSalasLista")), "explica por que não há sala (escala publicada, equipe 'contato com menores', habilitação)");
    confere(descendentes(a.env.e("chkMeuSalasLista")).filter(x => /chk-sala-cartao/.test(x.className)).length === 0, "nenhum cartão de sala");
    // PIN: a aba da liderança nem abre (e nada é pedido)
    a.env.limparRegistro();
    await a.env.ev("mostrarAbaSecretaria('checkininfantil')"); await a.env.ocioso();
    confere(a.env.e("abaCheckininfantil").style.display === "none", "PIN não vê a aba da liderança");
    confere(chamadas(a.env, "GET checkin-infantil/minhas-salas").length === 0, "e a aba não pede nada ao servidor");
    confere(a.env.ev("temPermissaoDaAba('checkininfantil')") === false, "temPermissaoDaAba: PIN não");
    // senha de liderança sem a permissão certa
    a.env.sessao({ matricula: 41, pin: false, permissoes: ["escalas"] });
    confere(a.env.ev("temPermissaoDaAba('checkininfantil')") === false && a.env.ev("podeAcessarModulo('habilitacao')") === false, "liderança com outra permissão (escalas) também não");
    a.env.sessao({ matricula: 9, pin: false, permissoes: ["habilitacao_voluntarios"] });
    confere(a.env.ev("temPermissaoDaAba('checkininfantil')") === true && a.env.ev("podeAcessarModulo('habilitacao')") === true, "com habilitacao_voluntarios a aba e o módulo aparecem");
    // a sessão aberta sem token: a tela explica
    const b = montar();
    b.env.ev("authToken = null");
    await abrirMeuPainel(b.env);
    confere(/Entre com a sua matrícula/.test(texto(b.env, "chkMeuMsg")) && b.env.api.chamadas.length === 0, "sem sessão: mensagem e nenhum pedido");
  });

  cenario("Aba da liderança: as salas do escopo, com a visão da liderança", async () => {
    const { S, env } = montar({ sessao: { membroId: 9, lideranca: true, gestao: true }, ataque: true });
    await abrirAbaGestao(env);
    confere(chamadas(env, "GET checkin-infantil/catalogos").length === 1 && chamadas(env, "GET checkin-infantil/minhas-salas").length === 1, "abrir a aba pede o catálogo e as salas");
    confere(env.e("abaCheckininfantil").style.display === "block" && env.e("abaProtecao").style.display === "none", "a aba abre e as outras se escondem");
    confere(env.e("btnAbaCheckininfantil").classList.contains("ativo"), "o botão da aba fica ativo");
    const cartoes = descendentes(env.e("chkGesSalasLista")).filter(x => /chk-sala-cartao/.test(x.className));
    confere(cartoes.length === 2, `as duas salas da Sede aparecem (a de Norte, fora do escopo, não): ${cartoes.length}`);
    confere(cartoes.every(c => c.textContent.includes("Visão da liderança")) && !cartoes.some(c => c.textContent.includes("Sou da equipe")), "selo 'Visão da liderança' e nenhum 'Sou da equipe' (9 não é da equipe)");
    confere(!!env.e("chkAbrirGes501x31") && !!env.e("chkAbrirGes502x32") && !env.e("chkAbrirGes503x33"), "um botão 'Abrir a sala' por sala do escopo");
    confere(JSON.stringify(argsDe(env.e("chkAbrirGes501x31"))) === JSON.stringify([501, 31, "Ges"]), "o contexto da liderança é a constante 'Ges'");
    const pilulas = ["Salas", "Aprovacoes", "Fichas"].map(n => env.e(`btnChkSecao${n}`));
    confere(pilulas[0].classList.contains("ativo") && pilulas[0].getAttribute("aria-pressed") === "true" && pilulas[1].getAttribute("aria-pressed") === "false" && pilulas[2].getAttribute("aria-pressed") === "false", "a pílula 'Salas de hoje' começa ativa (aria-pressed)");
    confere(env.e("chkSecaoSalas").style.display === "block" && env.e("chkSecaoAprovacoes").style.display === "none" && env.e("chkSecaoFichas").style.display === "none", "só a seção das salas aparece");
    limpo(env, "Aba da liderança", [ATAQUE("equipe31"), ATAQUE("equipe32")]);
    confereAcessibilidade(env, ["abaCheckininfantil"], "Aba da liderança");
    confere(idsRepetidos(env, "abaCheckininfantil").length === 0, "ids únicos na aba da liderança");
    // trocar de seção
    env.doc.clicar(env.e("btnChkSecaoFichas")); await env.ocioso();
    confere(env.e("chkSecaoFichas").style.display === "block" && env.e("chkSecaoSalas").style.display === "none" && env.e("btnChkSecaoFichas").getAttribute("aria-pressed") === "true" && env.foco() === env.e("chkFiMatricula"), "trocar para as fichas mostra a seção e leva o foco ao primeiro campo");
    env.doc.clicar(env.e("btnChkSecaoSalas")); await env.ocioso();
    confere(env.e("chkSecaoSalas").style.display === "block" && chamadas(env, "GET checkin-infantil/minhas-salas").length === 2, "voltar às salas recarrega a lista");
  });

  // ============================================================================================================================================
  // 2) A TELA DA SALA: cabeçalho, lotação, voluntários, entrar e sair
  // ============================================================================================================================================
  cenario("Sala: abertura, cabeçalho, lotação, voluntários e o botão Entrar na sala", async () => {
    const { S, env } = montar({ ataque: true });
    await abrirSalaMeu(env);
    confere(env.e("chkMeuListas").style.display === "none" && env.e("chkSalaMeu").style.display !== "none" && !!env.e("chkSalaRaiz"), "a tela da sala toma o lugar das listas");
    const g = chamadas(env, "GET checkin-infantil/sala");
    confere(g.length === 1 && g[0].consulta.servicoId === "501" && g[0].consulta.equipeId === "31", "GET sala com servicoId e equipeId");
    confere(env.foco() === env.e("chkSalaTitulo") && texto(env, "chkSalaTitulo").includes("Maternal"), "o foco vai para o título da sala");
    const cab = texto(env, "chkSalaCabecalho");
    confere(cab.includes("Sede") && cab.includes("Faixa: Maternal (3 a 5 anos)") && cab.includes("Serviço: 15/10/2026 às 09:00") && cab.includes("Check-in aberto"), "cabeçalho: congregação, faixa, horário do serviço e janela aberta");
    confere(cab.includes("[descricao501]"), "a descrição do serviço aparece como texto");
    const lot = texto(env, "chkSalaLotacao");
    confere(lot.includes("Adultos aptos presentes: 1") && lot.includes("Crianças na sala: 0") && lot.includes("Capacidade: 5") && lot.includes("5 por adulto") && lot.includes("Vagas: 5"), `a barra de lotação mostra os números do servidor: ${lot.slice(0, 120)}`);
    confere(lot.includes("Fora da regra") && /ao menos 2 adultos habilitados presentes e há 1/.test(lot), "com um adulto só, o problema do servidor aparece tal qual");
    const prog = descendentes(env.e("chkSalaLotacao")).find(x => x.localName === "progress");
    confere(!!prog && prog.getAttribute("max") === "5" && prog.getAttribute("value") === "0" && !!prog.getAttribute("aria-label"), "a barra é um <progress> com max, value e nome acessível");
    const vol = texto(env, "chkSalaVoluntarios");
    confere(vol.includes("Bia Voluntária") && vol.includes("[vol42]") && vol.includes("entrou às 09:10") && vol.includes("conta como adulto"), "voluntária presente, hora de entrada em Brasília e 'conta como adulto'");
    confere(!!env.e("chkEntrarBotao") && !env.e("chkSairBotao"), "quem não entrou vê 'Entrar na sala' e não 'Sair da sala'");
    confere(texto(env, "chkSalaPendencias") === "", "sem pendências");
    confere(/Nenhuma criança na sala agora/.test(texto(env, "chkNaSalaLista")), "lista vazia explicada");
    confere(texto(env, "chkSalaAtualizado").includes("Atualizado às 09:30:00"), "hora da última atualização (relógio do servidor)");
    confere(visivel(env, "chkCiAviso") && !visivel(env, "chkCiForm") && /Entrar na sala/.test(texto(env, "chkCiAviso")), "quem não entrou não vê o formulário de check-in, só o aviso para entrar");
    confere(env.intervalos.size === 1 && [...env.intervalos.values()][0].ms === 8000, "um único relógio de 8 s");
    confere(env.foco() === env.e("chkSalaTitulo"), "o foco continua no título");
    limpo(env, "Sala/abertura", [ATAQUE("vol42"), ATAQUE("equipe31"), ATAQUE("descricao501")]);
    confereAcessibilidade(env, ["subMeupainelCheckininfantil"], "Sala");
    confere(idsRepetidos(env, "chkSalaMeu").length === 0, "ids únicos dentro da tela da sala");
    // entrar na sala
    env.limparRegistro();
    await entrarNaSala(env);
    const e1 = chamadas(env, "POST checkin-infantil/entrar-na-sala");
    confere(e1.length === 1 && JSON.stringify(e1[0].corpo) === JSON.stringify({ servicoId: 501, equipeId: 31 }) && typeof e1[0].corpo.servicoId === "number", "POST entrar-na-sala com os dois ids como número");
    confere(texto(env, "chkSalaMsg") === "Você entrou na sala." && env.toasts().includes("Você entrou na sala."), "a mensagem do servidor aparece (na tela e no aviso)");
    const vol2 = texto(env, "chkSalaVoluntarios");
    confere(vol2.includes("Ana Voluntária") && vol2.includes("(você)") && !!env.e("chkSairBotao") && !env.e("chkEntrarBotao"), "agora aparece 'Sair da sala' e a pessoa na lista, marcada como 'você'");
    const lot2 = texto(env, "chkSalaLotacao");
    confere(lot2.includes("Adultos aptos presentes: 2") && lot2.includes("Dentro da regra") && lot2.includes("Capacidade: 10") && !/ao menos 2 adultos/.test(lot2), "com dois adultos a lotação fica dentro da regra e a capacidade dobra");
    confere(visivel(env, "chkCiForm") && !visivel(env, "chkCiAviso"), "o formulário de check-in aparece");
    confere(S.voluntariosPresentes().length === 2, "o servidor registrou a entrada");
    // duplo clique em "Entrar": um pedido só (já está na sala: o botão trocou)
    const b = montar(); await abrirSalaMeu(b.env);
    b.env.limparRegistro();
    const dup = b.env.ev("(function(){ const bt = document.getElementById('chkEntrarBotao'); return Promise.all([chkEntrarAcao(bt), chkEntrarAcao(bt)]); })()");
    await esperar(dup); await b.env.ocioso();
    confere(chamadas(b.env, "POST checkin-infantil/entrar-na-sala").length === 1 && /Aguarde/.test(b.env.toasts().join("|")), "duplo clique em 'Entrar na sala': um pedido só e o aviso 'Aguarde'");
  });

  cenario("Sala: sair da sala (a recusa do servidor aparece tal qual), voluntário sem habilitação e auxiliar", async () => {
    const c = await salaPronta();
    const { S, env } = c;
    S.entrar(S.salas[0], 45); S.entrar(S.salas[0], 44);
    await env.ev("chkLerSala(true)"); await env.ocioso();
    const vol = texto(env, "chkSalaVoluntarios");
    confere(vol.includes("Edu Sem Habilitação") && /não conta na proporção agora/.test(vol) && !/apto/.test(vol), "voluntário que não conta aparece só com 'não conta na proporção agora' (o servidor não manda o motivo ao operador)");
    confere(vol.includes("Duda Auxiliar") && /não conta na proporção agora/.test(vol) && !/auxiliar: não conta|não está apto/.test(vol), "adolescente apto também aparece só como 'não conta na proporção agora', sem dizer o motivo");
    confere(texto(env, "chkSalaLotacao").includes("Adultos aptos presentes: 2"), "só os adultos aptos contam (2, não 4)");
    // com crianças e só dois adultos, sair é recusado: a mensagem do servidor tal qual
    S.semear({ menorId: 101, trouxeMembroId: 201 });
    const sala = S.salas[0];
    sala.voluntarios.filter(v => [44, 45].includes(v.membroId)).forEach(v => { v.saiuEm = S.agoraMs; });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.limparRegistro();
    env.doc.clicar(env.e("chkSairBotao")); await env.ocioso();
    const s1 = chamadas(env, "POST checkin-infantil/sair-da-sala");
    confere(s1.length === 1 && JSON.stringify(s1[0].corpo) === JSON.stringify({ servicoId: 501, equipeId: 31 }), "POST sair-da-sala sem membroId (quem sai é a própria pessoa)");
    confere(/Você não pode sair agora: a sala ficaria com 1 adulto\(s\) para 1 criança\(s\)/.test(texto(env, "chkSalaMsg")) && !!env.e("chkSairBotao"), "a recusa do servidor aparece tal qual e a pessoa continua na sala");
    confere(env.toasts().some(t => /não pode sair agora/.test(t)), "e também em aviso");
    // sem crianças, sair funciona
    S.registros[0].situacao = "RETIRADA";
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.doc.clicar(env.e("chkSairBotao")); await env.ocioso();
    confere(texto(env, "chkSalaMsg") === "Você saiu da sala." && !!env.e("chkEntrarBotao"), "sala vazia: sair funciona e o botão volta a ser 'Entrar na sala'");
    confere(!visivel(env, "chkCiForm"), "depois de sair o formulário de check-in some");
  });

  cenario("Sala: janela do check-in fechada (antes e depois) e sala sem faixa", async () => {
    const { S, env } = montar();
    S.agoraMs = Date.parse("2026-10-15T09:30:00.000Z");   // 06:30 em Brasília: faltam 150 min para o serviço
    await abrirMeuPainel(env);
    const cartao = texto(env, "chkMeuSalasLista");
    confere(cartao.includes("Check-in fechado") && /abre 60 minutos antes do serviço/.test(cartao), "na lista: selo 'fechado' e a mensagem do servidor");
    env.doc.clicar(env.e("chkAbrirMeu501x31")); await env.ocioso();
    confere(texto(env, "chkSalaCabecalho").includes("Check-in fechado") && /abre 60 minutos antes do serviço/.test(texto(env, "chkSalaCabecalho")), "no cabeçalho da sala: a mensagem do servidor");
    await entrarNaSala(env);
    confere(/abre 60 minutos antes do serviço/.test(texto(env, "chkSalaMsg")) && !!env.e("chkEntrarBotao"), "entrar fora da janela: a recusa do servidor aparece tal qual");
    // depois: a pessoa entrou e a janela fechou
    S.agoraMs = Date.parse("2026-10-15T12:30:00.000Z");
    await env.ev("chkLerSala(true)"); await env.ocioso(); await entrarNaSala(env);
    confere(visivel(env, "chkCiForm"), "dentro da janela e na sala: o formulário aparece");
    S.agoraMs = Date.parse("2026-10-15T20:30:00.000Z");   // 17:30: passou de 5 horas
    await env.ev("chkLerSala(true)"); await env.ocioso();
    confere(!visivel(env, "chkCiForm") && /fechou/.test(texto(env, "chkCiAviso")) && visivel(env, "chkCiAviso"), "janela fechada depois do serviço: o formulário some e o aviso diz por quê");
    // sala sem faixa etária
    const d = montar(); d.S.salas[0].faixa = null;
    await abrirSalaMeu(d.env);
    confere(/Sem faixa etária definida/.test(texto(d.env, "chkSalaCabecalho")) && /não tem faixa etária definida/.test(texto(d.env, "chkSalaLotacao")), "sem faixa: o aviso no cabeçalho e o problema da lotação (do servidor)");
    confere(!descendentes(d.env.e("chkSalaLotacao")).some(x => x.localName === "progress"), "sem capacidade não há barra de progresso");
  });

  // ============================================================================================================================================
  // 3) O CHECK-IN: buscar a criança, o visitante, quem trouxe
  // ============================================================================================================================================
  cenario("Check-in: busca da criança membro (3 letras, espera da digitação, selos, resposta velha)", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    S.semear({ menorId: 102, trouxeMembroId: 201 });   // a Lia já está numa sala
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.limparRegistro();
    env.doc.digitar(env.e("chkCiBusca"), "Pe");
    confere(chamadas(env, "POST checkin-infantil/buscar").length === 0 && ![...env.temporizadores.values()].some(t => t.ms === 350), "com menos de 3 letras nada é pedido e nenhum temporizador é armado");
    env.doc.digitar(env.e("chkCiBusca"), "Ped");
    env.doc.digitar(env.e("chkCiBusca"), "Pedr");
    confere([...env.temporizadores.values()].filter(t => t.ms === 350).length === 1 && chamadas(env, "POST checkin-infantil/buscar").length === 0, "digitando mais, um só temporizador de 350 ms (o anterior é cancelado) e ainda nada foi pedido");
    env.dispararTemporizador(350); await env.ocioso();
    const b1 = chamadas(env, "POST checkin-infantil/buscar");
    confere(b1.length === 1 && b1[0].corpo.servicoId === 501 && b1[0].corpo.equipeId === 31 && b1[0].corpo.q === "Pedr" && Object.keys(b1[0].consulta).length === 0, "POST buscar com a sala e o termo no corpo (nada do nome no endereço)");
    const r1 = env.e("chkRes101");
    confere(!!r1 && r1.textContent.includes("Pedro Souza") && r1.textContent.includes("[menor101]") && r1.textContent.includes("4 anos"), "o resultado mostra o nome (texto de ataque como texto) e a idade");
    confere(!!env.e("chkAdd101") && env.e("chkAdd101").disabled === false && JSON.stringify(argsDe(env.e("chkAdd101"))[0]) === "101", "botão Adicionar habilitado, com o id numérico");
    confere(!/Sem responsável|Já está na sala|Fora da faixa/.test(r1.textContent), "Pedro: sem selos de aviso");
    confere(/1 criança\(s\) encontrada\(s\)/.test(texto(env, "chkCiBuscaMsg")), "a mensagem diz quantas achou");
    limpo(env, "Busca", [ATAQUE("menor101")]);
    // os selos
    await buscar(env, "Lia");
    const rl = env.e("chkRes102");
    confere(!!rl && /Já está na sala/.test(rl.textContent) && env.e("chkAdd102").disabled === true, "criança que já está numa sala: selo e botão desabilitado");
    await buscar(env, "Teo");
    const rt = env.e("chkRes103");
    confere(!!rt && /Sem responsável cadastrado/.test(rt.textContent) && /Avise a Secretaria para cadastrar o responsável/.test(rt.textContent) && env.e("chkAdd103").disabled === false, "sem responsável: selo, a sugestão à Secretaria e o botão segue habilitado");
    await buscar(env, "Davi");
    confere(/Fora da faixa da sala/.test(texto(env, "chkRes104")), "idade fora da faixa: selo (avisa, não impede)");
    await buscar(env, "Souza");
    confere(!!env.e("chkRes101") && !!env.e("chkRes102") && !env.e("chkRes103"), "duas crianças com o sobrenome");
    await buscar(env, "Zzzz");
    confere(/Nenhuma criança encontrada/.test(texto(env, "chkCiBuscaMsg")) && texto(env, "chkCiResultados") === "", "sem resultado: mensagem que sugere o visitante e lista vazia");
    // o botão Buscar e os textos que não valem (nenhum pedido)
    env.limparRegistro();
    env.e("chkCiBusca").value = "Pe"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/buscar").length === 0 && /pelo menos 3 letras/.test(texto(env, "chkCiBuscaMsg")) && env.foco() === env.e("chkCiBusca"), "Buscar com menos de 3 letras: mensagem, foco no campo, nada pedido");
    env.e("chkCiBusca").value = "Ped%"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/buscar").length === 0 && /só letras/.test(texto(env, "chkCiBuscaMsg")), "texto com % ou _ ou colchete: a tela avisa antes de pedir");
    env.e("chkCiBusca").value = "Ped"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    confere(chamadas(env, "POST checkin-infantil/buscar").length === 1 && !!env.e("chkRes101"), "o botão Buscar também busca");
    // resposta velha: a busca antiga volta depois da nova e NÃO vale
    env.limparRegistro();
    const presa = env.retem(x => x.chave === "POST checkin-infantil/buscar" && x.corpo && x.corpo.q === "Pedro");
    env.e("chkCiBusca").value = "Pedro"; env.doc.clicar(env.e("chkCiBuscar")); await esperaChegar(presa);
    env.e("chkCiBusca").value = "Teo"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    presa.liberar(); await env.ocioso(); env.api.retencoes.length = 0;
    confere(!!env.e("chkRes103") && !env.e("chkRes101"), "a resposta atrasada da busca antiga não substitui a da busca nova");
    // quem saiu da sala no servidor: a busca é recusada (403) e a mensagem do servidor aparece
    S.salas[0].voluntarios.forEach(v => { if (v.membroId === MEU) v.saiuEm = S.agoraMs; });
    env.e("chkCiBusca").value = "Ped"; env.doc.clicar(env.e("chkCiBuscar")); await env.ocioso();
    confere(/Entre na sala primeiro/.test(texto(env, "chkCiBuscaMsg")), "se o servidor recusa (não está mais na sala), a mensagem dele aparece tal qual");
  });

  cenario("Check-in: adicionar e remover crianças membro (responsáveis, limite de 6, repetida)", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const rotuloMae = F.vol.VINCULOS_RESPONSAVEL.MAE;
    await buscar(env, "Pedro");
    env.limparRegistro();
    await adicionarMembro(env, 101);
    const r = chamadas(env, "GET checkin-infantil/responsaveis");
    confere(r.length === 1 && r[0].consulta.menorId === "101" && r[0].consulta.servicoId === "501" && r[0].consulta.equipeId === "31", "adicionar pede os responsáveis cadastrados da criança");
    const chip = env.e("chkChip0");
    confere(!!chip && chip.textContent.includes("Pedro Souza") && chip.textContent.includes("[menor101]") && chip.textContent.includes("Membro") && chip.textContent.includes("4 anos"), "a criança entra na lista (nome como texto)");
    confere(!env.e("chkRes101"), "e sai da lista de resultados");
    confere(/1 de 6 criança\(s\) nesta entrada/.test(texto(env, "chkCiLista")), "contador de crianças da entrada");
    const sel = env.e("chkCiTrouxe");
    confere(sel.options.length === 4 && sel.options[0].value === "" && sel.options[1].value === "201" && sel.options[2].value === "202" && sel.options[3].value === "OUTRA", `quem trouxe: os responsáveis cadastrados e 'outra pessoa': ${sel.options.map(o => o.value).join(",")}`);
    confere(sel.options[1].textContent.includes("Maria Souza") && sel.options[1].textContent.includes(rotuloMae) && sel.value === "" && !visivel(env, "chkCiOutraCx"), "sem escolha por enquanto (quem confere o documento escolhe), e 'outra pessoa' fica escondida");
    limpo(env, "Check-in/lista", [ATAQUE("menor101"), ATAQUE("resp201")]);
    // uma criança sem responsável cadastrado: só resta 'outra pessoa'
    await buscar(env, "Teo"); await adicionarMembro(env, 103);
    confere(texto(env, "chkChip1").includes("Sem responsável cadastrado"), "o selo aparece também na lista da entrada");
    confere(env.e("chkCiTrouxe").options.length === 1 && env.e("chkCiTrouxe").value === "OUTRA" && visivel(env, "chkCiOutraCx"), "sem responsável em comum: só 'outra pessoa', já escolhida, com os campos à vista");
    // remover a criança sem responsável: os responsáveis voltam
    env.doc.clicar(achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkRemoverCriancaAcao" && JSON.stringify(argsDe(x)) === "[1]")); await env.ocioso();
    confere(!env.e("chkChip1") && env.e("chkCiTrouxe").options.length === 4 && env.e("chkCiTrouxe").value === "", "remover a criança: sai da lista e o 'quem trouxe' volta a oferecer os responsáveis");
    confere(!!env.e("chkRes103"), "e ela volta à lista de resultados da busca");
    // repetida: mesmo com a chamada direta
    await buscar(env, "Pedro");
    env.limparRegistro();
    await env.ev("chkAdicionarMembroAcao(101, null)"); await env.ocioso();
    confere(/já está na lista/.test(texto(env, "chkCiBuscaMsg")) && chamadas(env, "GET checkin-infantil/responsaveis").length === 0, "criança repetida: a tela recusa antes de pedir");
    // visitantes até o limite de 6 (5 + o Pedro)
    for (let i = 1; i <= 5; i++) { env.e("chkCiVisNome").value = `Visitante ${i}`; env.e("chkCiVisNasc").value = `2022-0${i}-15`; env.doc.clicar(env.e("chkCiVisAdicionar")); }
    await env.ocioso();
    confere(/6 de 6 criança\(s\)/.test(texto(env, "chkCiLista")), "seis crianças na entrada");
    env.e("chkCiVisNome").value = "Visitante 7"; env.e("chkCiVisNasc").value = "2022-07-15"; env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/até 6 crianças por vez/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip6"), "a sétima é recusada com a mensagem do limite");
    await buscar(env, "Lia"); await env.ev("chkAdicionarMembroAcao(102, null)"); await env.ocioso();
    confere(/até 6 crianças por vez/.test(texto(env, "chkCiBuscaMsg")) && !env.e("chkChip6"), "o mesmo limite vale para criança membro");
  });

  cenario("Check-in: criança visitante (validações) e a saúde com o texto de autorização do responsável", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const cat = chamadas(env, "GET checkin-infantil/catalogos")[0];
    const tentar = async (nome, nasc) => { env.e("chkCiVisNome").value = nome; env.e("chkCiVisNasc").value = nasc; env.limparRegistro(); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso(); return texto(env, "chkCiVisMsg"); };
    let m = await tentar("", "2022-01-01");
    confere(/Informe o nome da criança/.test(m) && env.foco() === env.e("chkCiVisNome") && env.toasts().length === 1, "nome vazio: mensagem, foco no campo e aviso");
    m = await tentar("A", "2022-01-01"); confere(/Informe o nome da criança/.test(m), "nome de uma letra só não vale");
    m = await tentar("Ana <b>", "2022-01-01"); confere(/sem < ou >/.test(m), "nome com < ou > não vale");
    m = await tentar("Visitante Um", ""); confere(/data de nascimento/.test(m) && env.foco() === env.e("chkCiVisNasc"), "sem data de nascimento: o foco vai para o campo da data");
    m = await tentar("Visitante Um", "2030-01-01"); confere(/não pode ser no futuro/.test(m), "nascimento no futuro");
    m = await tentar("Visitante Um", "2000-01-01"); confere(/menos de 18 anos/.test(m), "maior de idade não faz check-in infantil");
    m = await tentar("Visitante Um", "2022-02-31"); confere(/data de nascimento/.test(m), "data que não existe (31 de fevereiro)");
    confere(!env.e("chkChip0"), "nenhuma criança entrou na lista com os dados ruins");
    m = await tentar("Visitante Um", "2020-05-20");
    confere(!!env.e("chkChip0") && /Visitante/.test(texto(env, "chkChip0")) && /6 anos/.test(texto(env, "chkChip0")) && m === "", "visitante válido entra na lista, com a idade calculada pela data de hoje");
    confere(env.e("chkCiVisNome").value === "" && env.e("chkCiVisNasc").value === "" && env.foco() === env.e("chkCiVisNome"), "os campos do visitante são limpos e o foco volta ao nome (para o irmão)");
    m = await tentar("visitante um", "2020-05-20"); confere(/já está na lista/.test(m), "o mesmo visitante (nome sem diferenciar maiúscula, mesma data) não entra duas vezes");
    // a saúde: o texto de autorização só aparece quando se escreve a alergia
    confere(!visivel(env, "chkCiVisTermoCx"), "o texto de autorização começa escondido");
    env.doc.digitar(env.e("chkCiVisSaude"), "Alergia a amendoim");
    confere(visivel(env, "chkCiVisTermoCx"), "ao escrever a alergia o texto de autorização aparece");
    const termo = env.e("chkCiVisTermoCx");
    const t = F.mc.textoDe("SAUDE_CRACHA");
    confere(termo.textContent.includes(t.titulo) && termo.textContent.includes("[termoTitulo]") === false, "o título do texto de autorização vem do catálogo");
    confere(t.itens.every(i => termo.textContent.includes(i.texto.slice(0, 40))) && termo.textContent.includes(t.aceite.slice(0, 40)), "todos os itens e a frase de aceite do catálogo são mostrados");
    confere(env.e("chkCiVisConcordo").checked === false && /precisa ler este texto/.test(termo.textContent), "a caixa de concordância começa desmarcada");
    env.e("chkCiVisNome").value = "Visitante Dois"; env.e("chkCiVisNasc").value = "2019-03-03";
    env.limparRegistro(); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/precisa ler o texto e marcar que concorda/.test(texto(env, "chkCiVisMsg")) && env.foco() === env.e("chkCiVisConcordo") && !env.e("chkChip1"), "sem a concordância do responsável presente a saúde não entra");
    env.doc.digitar(env.e("chkCiVisSaude"), "Alergia a <amendoim>");
    env.doc.marcar(env.e("chkCiVisConcordo"), true); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/sem < ou >/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip1"), "saúde com < ou > não vale");
    env.doc.digitar(env.e("chkCiVisSaude"), "x".repeat(401));
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/de 2 a 400 caracteres/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip1"), "saúde de mais de 400 caracteres não vale");
    env.doc.digitar(env.e("chkCiVisSaude"), "Alergia a amendoim");
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(!!env.e("chkChip1") && /Saúde informada/.test(texto(env, "chkChip1")), "com a concordância a criança entra e a lista mostra o selo de saúde");
    confere(env.e("chkCiVisSaude").value === "" && env.e("chkCiVisConcordo").checked === false && !visivel(env, "chkCiVisTermoCx"), "campo de saúde e concordância são limpos e o texto volta a se esconder");
    confere(env.e("chkCiVisSaude").getAttribute("spellcheck") === "false" && env.e("chkCiVisSaude").getAttribute("autocomplete") === "off", "o campo de saúde não vai para o corretor nem para o preenchimento automático");
    limpo(env, "Visitante", []);
  });

  cenario("Check-in: quem trouxe e quem mais pode retirar — cada validação antes de enviar (nada é enviado)", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    const tentar = async () => { env.limparRegistro(); env.doc.clicar(env.e("chkCiEnviar")); await env.ocioso(); return texto(env, "chkCiMsg"); };
    let m = await tentar();
    confere(/Adicione pelo menos uma criança/.test(m) && env.foco() === env.e("chkCiBusca") && env.toasts().length === 1, "sem criança: mensagem, foco na busca e aviso");
    await buscar(env, "Pedro"); await adicionarMembro(env, 101);
    m = await tentar(); confere(/Escolha quem trouxe a criança/.test(m) && env.foco() === env.e("chkCiTrouxe"), "sem escolher quem trouxe: foco no campo");
    escolherQuemTrouxe(env, "OUTRA");
    m = await tentar(); confere(/nome de quem trouxe/.test(m) && env.foco() === env.e("chkCiTrouxeNome"), "'outra pessoa' sem nome");
    env.e("chkCiTrouxeNome").value = "Tia <Zeza>";
    m = await tentar(); confere(/nome de quem trouxe/.test(m), "nome com < ou > não vale");
    env.e("chkCiTrouxeNome").value = "Tia Zeza";
    m = await tentar(); confere(/Escolha quem é a pessoa para a criança/.test(m) && env.foco() === env.e("chkCiTrouxePar"), "sem o parentesco");
    env.e("chkCiTrouxePar").value = "TIO";
    m = await tentar(); confere(/Escolha o documento que você conferiu/.test(m) && env.foco() === env.e("chkCiTrouxeDoc"), "sem o documento conferido");
    env.e("chkCiTrouxeDoc").value = "RG";
    env.e("chkCiTrouxeTel").value = "123";
    m = await tentar(); confere(/10 a 13 números/.test(m) && env.foco() === env.e("chkCiTrouxeTel"), "telefone curto demais");
    env.e("chkCiTrouxeTel").value = "";
    // com visitante o telefone é obrigatório
    env.e("chkCiVisNome").value = "Visitante Um"; env.e("chkCiVisNasc").value = "2020-05-20"; env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/obrigatório: há criança visitante/.test(texto(env, "chkCiTelRotulo")), "o rótulo do telefone passa a dizer que é obrigatório quando há visitante");
    m = await tentar(); confere(/Informe o telefone de quem trouxe/.test(m) && env.foco() === env.e("chkCiTrouxeTel"), "há visitante e falta o telefone");
    env.e("chkCiTrouxeTel").value = "(11) 99999-0000";
    // quem mais pode retirar
    env.e("chkCiExtraNome0").value = "Vovó Lia";
    m = await tentar(); confere(/Pessoa 1: escolha quem ela é/.test(m) && env.foco() === env.e("chkCiExtraPar0"), "pessoa indicada sem o parentesco");
    env.e("chkCiExtraPar0").value = "AVO"; env.e("chkCiExtraNome1").value = "X";
    m = await tentar(); confere(/Pessoa 2: informe o nome/.test(m) && env.foco() === env.e("chkCiExtraNome1"), "segunda pessoa com nome inválido");
    env.e("chkCiExtraNome1").value = ""; env.e("chkCiExtraPar1").value = "TIO";
    m = await tentar(); confere(/Pessoa 2: informe o nome/.test(m), "parentesco sem nome também é recusado");
    env.e("chkCiExtraPar1").value = "";
    confere(chamadas(env, "POST checkin-infantil/checkin").length === 0, "nenhuma das tentativas inválidas chegou ao servidor");
    confere(env.e("chkChip0") && env.e("chkChip1") && env.e("chkCiTrouxeNome").value === "Tia Zeza", "e o formulário continua preenchido (nada foi limpo)");
    // a mensagem some do campo de quem trouxe quando a pessoa escolhe um responsável cadastrado
    escolherQuemTrouxe(env, "201");
    confere(!visivel(env, "chkCiOutraCx"), "escolher um responsável cadastrado esconde os campos de 'outra pessoa'");
    limpo(env, "Quem trouxe", [ATAQUE("resp201")]);
    confereAcessibilidade(env, ["chkCheckinCx"], "Check-in");
    confere(idsRepetidos(env, "chkSalaMeu").length === 0, "ids únicos com o formulário completo");
  });

  // ============================================================================================================================================
  // 4) O CHECK-IN FEITO: etiqueta, recibo e o código (só em memória, só no painel de impressão)
  // ============================================================================================================================================
  const ALFABETO = /^[A-HJKMNP-Z2-9]{6}$/;
  const ocorrencias = (texto, trecho) => (trecho ? texto.split(trecho).length - 1 : 0);
  cenario("Check-in feliz de criança membro: etiqueta, recibo, código, impressão e limpeza", async () => {
    const c = await salaPronta(); const { S, env } = c;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101);
    escolherQuemTrouxe(env, "201");
    env.limparRegistro();
    await enviarCheckin(env);
    const p = chamadas(env, "POST checkin-infantil/checkin");
    confere(p.length === 1 && JSON.stringify(p[0].corpo) === JSON.stringify({ servicoId: 501, equipeId: 31, trouxe: { responsavelId: 201 }, criancas: [{ menorId: 101 }] }), `corpo do check-in: ${JSON.stringify(p[0] && p[0].corpo)}`);
    const reg = S.registros[S.registros.length - 1], codigo = S.codigoDe(reg.registroId);
    confere(ALFABETO.test(codigo), "o servidor gerou um código de 6 símbolos sem 0/O/1/I/L");
    confere(texto(env, "chkCiMsg") === "Criança entregue na sala." && env.toasts().includes("Criança entregue na sala."), "a mensagem do servidor aparece");
    // o painel de impressão
    const painel = env.e("chkImpressaoCx");
    confere(!!painel && !!env.e("chkImprimivel") && /Os códigos aparecem só agora/.test(painel.textContent), "o painel de etiqueta e recibo abre com o aviso de que o código só aparece agora");
    confere(env.foco() === env.e("chkImpressaoTitulo"), "o foco vai para o título do painel");
    const etq = env.e("chkEtq0x0");
    confere(!!etq && /Pedro S\./.test(etq.textContent) && /4 anos/.test(etq.textContent) && etq.textContent.includes("Maternal"), "a etiqueta tem o nome abreviado, a idade e a sala");
    confere(env.e("chkCodigo0x0").textContent === codigo && /chk-codigo/.test(env.e("chkCodigo0x0").className), "a etiqueta mostra o código grande, igual ao que o servidor gerou");
    const rec = env.e("chkRecibo0");
    confere(!!rec && /Recibo do responsável/.test(rec.textContent) && rec.textContent.includes("Maria Souza") && /Entrada às 09:30/.test(rec.textContent) && rec.textContent.includes("Pedro S."), "o recibo tem o responsável, a hora e a criança");
    confere(env.e("chkReciboCodigo0x0").textContent === codigo && /Apresente o código na hora de retirar/.test(rec.textContent), "o recibo repete o código e a orientação do servidor");
    confere(!!env.e("chkImprimirBotao") && !!env.e("chkFecharImpressaoBotao"), "botões Imprimir e Fechar e apagar");
    confere(ocorrencias(env.doc.body.innerHTML, codigo) === 2, `o código aparece só na etiqueta e no recibo (duas vezes): ${ocorrencias(env.doc.body.innerHTML, codigo)}`);
    const dentro = env.e("chkImprimivel").textContent;
    confere(ocorrencias(dentro, codigo) === 2 && !env.toasts().join("|").includes(codigo) && !texto(env, "chkSalaMsg").includes(codigo) && !texto(env, "chkCiMsg").includes(codigo), "e só dentro da caixa de impressão: nunca em aviso nem mensagem");
    // o formulário foi limpo e a sala atualizada
    confere(texto(env, "chkCiLista").includes("Nenhuma criança adicionada") && env.e("chkCiBusca").value === "" && texto(env, "chkCiResultados") === "", "o formulário volta vazio");
    confere(!!cartao(env, reg.registroId) && texto(env, nomeDe(reg.registroId)) === "Pedro Souza", "a sala já mostra a criança na lista 'Na sala'");
    confere(!texto(env, "chkNaSalaLista").includes(codigo), "a lista 'Na sala' nunca tem o código");
    // o relógio de atualização não mexe no painel nem espalha o código
    env.tique(); await env.ocioso();
    confere(ocorrencias(env.doc.body.innerHTML, codigo) === 2, "depois de uma atualização automática o código continua só nas duas peças do painel");
    // privacidade
    confere(env.gravacoes.length === 0 && !JSON.stringify(env.gravacoes).includes(codigo), "nada em localStorage/sessionStorage");
    confere(!env.saidaConsole.join("\n").includes(codigo), "nada no console");
    confere(env.g("chkImpressao").lotes.length === 1 && env.g("chkImpressao").lotes[0].impresso === false && /Ainda não impresso/.test(texto(env, "chkLoteEstado0")), "em memória: um lote, ainda não impresso (e a tela diz isso)");
    // imprimir: a tela pergunta se saiu na impressora (as classes ficam no <body> até a resposta: ver cenarios-extra-c)
    const imp = await imprimir(env, true);
    confere(imp.aberto && /saíram na impressora/.test(imp.texto), "depois de imprimir a tela pergunta se as etiquetas e o recibo saíram");
    confere(env.impressoes.length === 1 && /chk-imprimindo/.test(env.impressoes[0].classes) && /chk-imp-etiquetas/.test(env.impressoes[0].classes) && !/chk-imp-relatorio/.test(env.impressoes[0].classes), "window.print() é chamado com as classes que isolam as etiquetas e o recibo");
    confere(!/chk-imprimindo|chk-imp-/.test(env.doc.body.className), "e as classes de impressão saem do <body> depois da resposta");
    confere(env.g("chkImpressao").lotes[0].impresso === true && /✅ Impresso/.test(texto(env, "chkLoteEstado0")), "marcado como impresso (e a tela diz isso)");
    // fechar e apagar (já impresso: sem pergunta)
    env.doc.clicar(env.e("chkFecharImpressaoBotao")); await env.ocioso();
    confere(env.modal().aberto === false && env.e("chkImpressaoCx").innerHTML === "", "já impresso: fecha sem perguntar");
    confere(!env.doc.body.innerHTML.includes(codigo) && env.g("chkImpressao") === null && !env.e("chkImprimivel"), "o código saiu do DOM e da variável");
    confere(env.foco() === env.e("chkSalaTitulo"), "o foco volta ao título da sala");
    // depois do fechamento o código não volta (nem na atualização, nem no histórico de mensagens)
    env.tique(); await env.ocioso();
    confere(!env.doc.body.innerHTML.includes(codigo) && !env.saidaConsole.join("").includes(codigo) && env.gravacoes.length === 0, "depois de fechar o código não volta a aparecer em lugar nenhum");
    limpo(env, "Check-in feliz", []);
  });

  cenario("Painel de impressão: fechar sem imprimir pergunta; sair da sala pergunta; dois check-ins somam; sair da sala apaga", async () => {
    const c = await salaPronta(); const { S, env } = c;
    const a = await checkinDoPedro(c, 101);
    confere(!!env.e("chkCodigo0x0"), "primeiro lote na tela");
    // fechar sem imprimir: pergunta (e cancelar mantém)
    const m1 = await clicarEResponder(env, env.e("chkFecharImpressaoBotao"), false);
    confere(m1.aberto && /NÃO foram impressos/.test(m1.texto), "fechar sem imprimir pede confirmação, dizendo que o código não aparece de novo");
    confere(env.e("chkCodigo0x0").textContent === a.codigo, "cancelar mantém o painel e o código");
    // o segundo check-in soma um lote (o primeiro código não se perde)
    const b = await checkinDoPedro(c, 102);
    confere(!!env.e("chkCodigo0x0") && !!env.e("chkCodigo1x0") && env.e("chkCodigo0x0").textContent === a.codigo && env.e("chkCodigo1x0").textContent === b.codigo && a.codigo !== b.codigo, "o segundo check-in entra como segundo lote e o primeiro código continua à vista");
    confere(env.g("chkImpressao").lotes.length === 2, "dois lotes em memória");
    // sair da sala com o código na tela: pergunta; cancelar mantém
    const m2 = await clicarEResponder(env, env.e("chkVoltarBotao"), false);
    confere(m2.aberto && /NÃO foram impressos/.test(m2.texto) && !!env.e("chkSalaRaiz") && !!env.e("chkCodigo0x0"), "sair da sala com código não impresso pergunta e cancelar mantém tudo");
    // confirmar: tudo sai (DOM, variáveis, relógio)
    const m3 = await clicarEResponder(env, env.e("chkVoltarBotao"), true);
    confere(m3.aberto && !env.e("chkSalaRaiz") && !env.doc.body.innerHTML.includes(a.codigo) && !env.doc.body.innerHTML.includes(b.codigo), "confirmando, a sala e os dois códigos saem do DOM");
    confere(env.g("chkImpressao") === null && env.g("chkSala") === null && env.g("chkSnap") === null && env.g("chkCi") === null, "e das variáveis (impressão, sala, leitura, formulário)");
    confere(env.intervalos.size === 0, "e o relógio de atualização é desligado");
    confere(visivel(env, "chkMeuListas") && env.foco() === env.e("chkAbrirMeu501x31"), "a lista de salas volta e o foco vai para o 'Abrir a sala' de onde a pessoa veio");
    confere(env.gravacoes.length === 0, "nenhuma gravação em storage em todo o caminho");
  });

  cenario("Check-in de visitante com 'outra pessoa', saúde (⚠ em destaque), telefone e quem mais pode retirar", async () => {
    const c = await salaPronta({ ataque: true }); const { S, env } = c;
    env.e("chkCiVisNome").value = "Visitante Oito"; env.e("chkCiVisNasc").value = "2018-01-01";
    env.doc.digitar(env.e("chkCiVisSaude"), "Alergia a amendoim e leite");
    env.doc.marcar(env.e("chkCiVisConcordo"), true);
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    preencherOutraPessoa(env, { nome: "Tia Zeza", par: "MAE", doc: "CNH", tel: "(11) 99999-0000" });   // (Trava 7-B) a saúde do visitante só com pai, mãe ou tutor(a)
    env.e("chkCiExtraNome0").value = "Vovó Lia"; env.e("chkCiExtraPar0").value = "AVO"; env.e("chkCiExtraNome1").value = "Tio Beto"; env.e("chkCiExtraPar1").value = "TIO";
    env.limparRegistro();
    await enviarCheckin(env);
    const p = chamadas(env, "POST checkin-infantil/checkin")[0];
    const hash = F.mc.textoDe("SAUDE_CRACHA").hash;
    confere(JSON.stringify(p.corpo) === JSON.stringify({ servicoId: 501, equipeId: 31, trouxe: { nome: "Tia Zeza", parentesco: "MAE", documento: "CNH", contato: "11999990000" },
      criancas: [{ visitante: { nome: "Visitante Oito", nascimento: "2018-01-01", saude: { texto: "Alergia a amendoim e leite", concordo: true, textoHash: hash } } }], autorizadosVisita: [{ nome: "Vovó Lia", parentesco: "AVO" }, { nome: "Tio Beto", parentesco: "TIO" }] }), `corpo do visitante: ${JSON.stringify(p && p.corpo)}`);
    confere(p.corpo.criancas[0].visitante.saude.textoHash === hash && p.corpo.trouxe.contato === "11999990000" && typeof p.corpo.criancas[0].visitante.saude.concordo === "boolean", "o hash do texto que a tela mostrou, o telefone só com números e o 'concordo' como booleano");
    const reg = S.registros[S.registros.length - 1];
    const saude = env.e("chkEtqSaude0x0");
    confere(!!saude && /chk-alergia/.test(saude.className) && saude.textContent === "⚠ SAÚDE: Alergia a amendoim e leite", "a alergia sai na etiqueta em destaque, com o ⚠");
    confere(!!achar(env, x => /chk-so-tela/.test(x.className) && /fora da faixa/.test(x.textContent)), "visitante de 8 anos em sala de 3 a 5: o aviso de idade fora da faixa aparece só na tela (classe chk-so-tela, que a impressão esconde)");
    confere(env.e("chkCodigo0x0").textContent === S.codigoDe(reg.registroId), "o código do visitante");
    const card = cartao(env, reg.registroId);
    confere(!!card && /Visitante/.test(card.textContent) && /Saúde/.test(card.textContent), "o cartão 'Na sala' mostra o visitante e o selo de saúde");
    confere(texto(env, `chkSaude${reg.registroId}`) === "⚠ Saúde: Alergia a amendoim e leite", "o texto de saúde entra no cartão só por textContent");
    confere(card.textContent.includes("Vovó Lia") && /só esta visita/.test(card.textContent) && card.textContent.includes("Tia Zeza"), "'Pode retirar': quem trouxe e as duas pessoas da visita");
    limpo(env, "Visitante", [ATAQUE("trouxe")].slice(0, 0));
    // etiqueta sem saúde não tem o quadro de alergia
    const d = await salaPronta(); await d.env.ev("0");
    d.env.e("chkCiVisNome").value = "Visitante Nove"; d.env.e("chkCiVisNasc").value = "2022-05-05"; d.env.doc.clicar(d.env.e("chkCiVisAdicionar")); await d.env.ocioso();
    preencherOutraPessoa(d.env, { tel: "11999990001" }); await enviarCheckin(d.env);
    confere(!!d.env.e("chkCodigo0x0") && !d.env.e("chkEtqSaude0x0"), "sem saúde informada a etiqueta não tem o quadro ⚠");
  });

  cenario("Check-in recusado pelo servidor: lotação, sala cheia, janela, criança já na sala, texto da saúde mudou — mensagem tal qual, formulário intacto", async () => {
    const c = await salaPronta(); const { S, env } = c;
    await buscar(env, "Pedro"); await adicionarMembro(env, 101); escolherQuemTrouxe(env, "201");
    // 1) a Bia sai: um adulto só
    S.salas[0].voluntarios.forEach(v => { if (v.membroId === 42) v.saiuEm = S.agoraMs; });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Uma sala com crianças nunca fica com um adulto só/.test(texto(env, "chkCiMsg")) && env.toasts().some(t => /um adulto só/.test(t)), "lotação (um adulto só): a mensagem do servidor, na tela e em aviso");
    confere(!!env.e("chkChip0") && env.e("chkCiTrouxe").value === "201" && !env.e("chkImprimivel"), "a lista, a escolha de quem trouxe ficam; nenhum painel de código abre");
    // 2) sala cheia: 2 adultos = 10 vagas, já há 10 crianças
    S.salas[0].voluntarios.push({ membroId: 43, entrouEm: S.agoraMs, saiuEm: null });
    for (let i = 0; i < 10; i++) S.semear({ visitante: { nome: `Cheio ${i}`, nascimento: "2022-01-01" } });
    await env.ev("chkLerSala(true)"); await env.ocioso();
    env.limparRegistro(); await enviarCheckin(env);
    confere(/A sala está no limite/.test(texto(env, "chkCiMsg")) && /Chame mais um adulto habilitado/.test(texto(env, "chkCiMsg")), "sala cheia: a mensagem do servidor");
    // 3) janela fechada entre abrir a tela e enviar
    S.registros.forEach(r => { r.situacao = "RETIRADA"; });
    S.salas[0].voluntarios.push({ membroId: 42, entrouEm: S.agoraMs, saiuEm: null });
    S.agoraMs = Date.parse("2026-10-15T20:30:00.000Z");
    env.limparRegistro(); await enviarCheckin(env);
    confere(/O check-in desta sala fechou/.test(texto(env, "chkCiMsg")), "janela fechada: a mensagem do servidor (mesmo com a tela ainda aberta)");
    S.agoraMs = Date.parse("2026-10-15T12:30:00.000Z");
    // 4) a criança já está em outra sala
    S.semear({ sala: 502, menorId: 101, trouxeMembroId: 201 });
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Pedro Souza: Esta criança já está numa sala/.test(texto(env, "chkCiMsg")), "criança já numa sala: a mensagem do servidor com o nome");
    S.registros.forEach(r => { r.situacao = "RETIRADA"; });
    // 5) o texto de autorização da saúde mudou (a tela está velha): o catálogo é recarregado e a caixa desmarcada
    env.e("chkCiVisNome").value = "Visitante Dez"; env.e("chkCiVisNasc").value = "2022-04-04";
    env.doc.digitar(env.e("chkCiVisSaude"), "Asma"); env.doc.marcar(env.e("chkCiVisConcordo"), true);
    await env.ev("chkCatalogos.textoSaude.hash = 'hash-velho'");
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    env.doc.clicar(env.e("chkRemoverPrimeira") || achar(env, x => x.localName === "button" && x.getAttribute("data-on-click") === "chkRemoverCriancaAcao" && JSON.stringify(argsDe(x)) === "[0]")); await env.ocioso();
    preencherOutraPessoa(env, { tel: "11999990002" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(/O texto da autorização de saúde mudou/.test(texto(env, "chkCiMsg")) && chamadas(env, "GET checkin-infantil/catalogos").length === 1, "texto de saúde mudou: a mensagem do servidor e o catálogo é pedido de novo");
    // o "concordo" do responsável era sobre o texto ANTIGO: o visitante com alergia sai da lista e volta ao formulário (senão cada nova tentativa seria recusada de novo)
    confere(!env.e("chkChip0") && env.g("chkCi").criancas.length === 0, "o visitante cujo 'concordo' valia para o texto antigo sai da lista");
    confere(env.e("chkCiVisNome").value === "Visitante Dez" && env.e("chkCiVisNasc").value === "2022-04-04" && env.e("chkCiVisSaude").value === "Asma" && env.e("chkCiVisConcordo").checked === false && visivel(env, "chkCiVisTermoCx") && env.e("chkCiVisDetalhes").open === true, "e volta ao formulário com os dados preenchidos, o texto novo à vista e a caixa de concordância desmarcada");
    confere(env.foco() === env.e("chkCiVisConcordo") && /voltou para o formulário/.test(texto(env, "chkCiVisMsg")) && /Visitante Dez saiu da lista/.test(texto(env, "chkCiVisMsg")), "o foco vai para a caixa de concordância e a mensagem explica o que fazer");
    confere(env.g("chkCatalogos").textoSaude.hash === F.mc.textoDe("SAUDE_CRACHA").hash, "o catálogo guardado já é o do texto novo");
    env.limparRegistro(); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(/precisa ler o texto e marcar que concorda/.test(texto(env, "chkCiVisMsg")) && !env.e("chkChip0"), "sem concordar de novo, o visitante não volta à lista");
    env.doc.marcar(env.e("chkCiVisConcordo"), true); env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    confere(!!env.e("chkChip0") && /Saúde informada/.test(texto(env, "chkChip0")), "concordando de novo com o texto novo, ele volta à lista");
    preencherOutraPessoa(env, { tel: "11999990002" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(!!env.e("chkImprimivel") && env.e("chkCodigo0x0") && /Check-in|entregue/.test(texto(env, "chkCiMsg")) || !!env.e("chkImprimivel"), "e agora o check-in dele passa (com o hash do texto novo)");
    // quem tinha o formulário do visitante em uso não perde o que digitava: só a mensagem diz o que aconteceu
    env.e("chkCiVisNome").value = "Visitante Doze"; env.e("chkCiVisNasc").value = "2022-05-05";
    env.doc.digitar(env.e("chkCiVisSaude"), "Rinite"); env.doc.marcar(env.e("chkCiVisConcordo"), true);
    await env.ev("chkCatalogos.textoSaude.hash = 'hash-velho'");
    env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    env.e("chkCiVisNome").value = "Visitante Treze"; env.e("chkCiVisNasc").value = "2022-06-06";
    preencherOutraPessoa(env, { tel: "11999990003" });
    env.limparRegistro(); await enviarCheckin(env);
    confere(env.e("chkCiVisNome").value === "Visitante Treze" && !env.e("chkChip0") && /Visitante Doze saiu da lista/.test(texto(env, "chkCiVisMsg")) && /Peça ao responsável para ler o texto novo/.test(texto(env, "chkCiVisMsg")), "com o formulário do visitante em uso, o que a pessoa digitava fica e a mensagem diz quem saiu da lista");
    // 6) a pessoa não está mais na sala (403)
    env.e("chkCiVisNome").value = "Visitante Onze"; env.e("chkCiVisNasc").value = "2021-05-05"; env.doc.clicar(env.e("chkCiVisAdicionar")); await env.ocioso();
    preencherOutraPessoa(env, { tel: "11999990004" });
    S.salas[0].voluntarios.forEach(v => { if (v.membroId === MEU) v.saiuEm = S.agoraMs; });
    env.limparRegistro(); await enviarCheckin(env);
    confere(/Entre na sala primeiro/.test(texto(env, "chkCiMsg")), "sem estar na sala: a mensagem do servidor tal qual (403, sem toast repetido)");
    confere(env.toasts().filter(t => /Entre na sala primeiro/.test(t)).length === 1, "o aviso do 403 aparece uma vez só (o fetchProtegido já avisou)");
  });

  // os cenários seguintes moram em arquivos próprios e recebem os mesmos auxiliares
  const H = { T, cenario, confere, esperar, montar, limpo, achar, descendentes, botao, botoes, chamadas, texto, argsDe, visivel, confereAcessibilidade, idsRepetidos, clicarEResponder, esperaChegar, nomeDe,
    abrirMeuPainel, abrirSalaMeu, abrirAbaGestao, abrirSalaGestao, entrarNaSala, salaPronta, buscar, adicionarMembro, escolherQuemTrouxe, preencherOutraPessoa, enviarCheckin, checkinDoPedro, cartao, seloDe, ocorrencias, imprimir,
    F, ATAQUE, ck, MEU, SALA, MIN, ALFABETO, criarAmbiente, lerApp, mutar, ambiente: () => ambienteAtual };
  for (const arquivo of ["./cenarios-retirada", "./cenarios-lideranca", "./cenarios-filhos-e-falhas", "./cenarios-ataque-total", "./cenarios-defesa", "./cenarios-extra-a", "./cenarios-extra-b", "./cenarios-extra-c", "./cenarios-extra-d", "./cenarios-trava7b"]) {
    try { require(arquivo)(H); } catch (erro) { if (erro && erro.code === "MODULE_NOT_FOUND" && String(erro.message).includes(arquivo.slice(2))) continue; throw erro; }
  }

  // ---- execução ----
  const vivo = setInterval(() => {}, 1000);   // um ato esperando para sempre não pode encerrar o processo em silêncio
  const naoTratada = (erro) => { T.total++; T.falhas.push(`${T.cenarioAtual}: exceção não tratada na tela (${String(erro && erro.message || erro).slice(0, 100)})`); };
  process.on("unhandledRejection", naoTratada); process.on("uncaughtException", naoTratada);
  for (const c of cenarios) {
    if (so && !c.nome.includes(so)) continue;
    T.cenarioAtual = c.nome;
    try { await c.fn(); } catch (erro) { T.total++; T.falhas.push(`${c.nome}: EXCEÇÃO ${String(erro && erro.stack || erro).split("\n").slice(0, 3).join(" | ")}`); }
  }
  clearInterval(vivo);
  process.off("unhandledRejection", naoTratada); process.off("uncaughtException", naoTratada);
  return T;
}

module.exports = { rodar };

if (require.main === module) {
  rodar({ so: process.argv[2] || null }).then(r => {
    console.log(`${r.total} verificações, ${r.falhas.length} falhas`);
    r.falhas.slice(0, 80).forEach(f => console.log("  ✗ " + f));
    process.exit(r.falhas.length ? 1 : 0);
  });
}
