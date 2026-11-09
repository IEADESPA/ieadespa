// Testes de UNIDADE do "Como pagar" dos eventos (09/11/2026), sem rede externa: o código Pix (BR Code) com e sem valor — a página de
// doações sai byte a byte igual —, as chaves Pix (CPF/CNPJ com dígito, e-mail, celular, aleatória), a conferência do painel, a leitura
// do campo do Directus que nunca quebra a montagem, as costuras nas páginas (evento, "Informar pagamento", Minha Conta, painel) e o
// script do esquema rodando de verdade contra um Directus de mentira (servidor HTTP local).
// Como rodar (de dentro de site/):  node scripts/testes/pagamento-evento-unidade.cjs
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { carregarTs } = require("./carregar-ts.cjs");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
async function tentar(nome, fn) {
  try { await fn(); } catch (e) { falhas++; total++; console.log("  FALHA", nome, "→ o bloco quebrou:", e && e.message); }
}
const ler = (rel) => fs.readFileSync(path.join(__dirname, "../../src", rel), "utf8");

/** Lê o BR Code campo a campo (ID de 2 dígitos + tamanho de 2 dígitos + valor) e devolve a lista, ou lança se o formato quebrar. */
function lerTlv(texto) {
  const campos = [];
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const n = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(n) || i + 4 + n > texto.length) throw new Error(`TLV quebrado em ${i}`);
    campos.push({ id, valor: texto.slice(i + 4, i + 4 + n) });
    i += 4 + n;
  }
  return campos;
}

(async () => {
  const P = await carregarTs("pix");
  const G = await carregarTs("pagamentoEvento");

  await tentar("o código Pix", async () => {
    console.log("== o código Pix (BR Code) ==");
    eq(P.crc16("123456789"), "29B1", "CRC16-CCITT (0x1021, início 0xFFFF): o valor de conferência do algoritmo para \"123456789\" é 29B1");
    // capturados ANTES da mudança (09/11/2026): sem valor, o código não pode mudar nem um caractere (a página de doações usa este)
    const DOACOES = "00020101021126360014br.gov.bcb.pix0114107435860001385204000053039865802BR5908IEADESPA6011PARAUAPEBAS62070503***630453C0";
    const FULANO = "00020101021126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304A5E2";
    const igreja = { chave: "10743586000138", nome: "IEADESPA", cidade: "Parauapebas" };
    eq(P.buildPixPayload(igreja), DOACOES, "sem valor: igual ao de antes, byte a byte (página de doações)");
    for (const v of [undefined, null, 0, -5, NaN, Infinity]) eq(P.buildPixPayload({ ...igreja, valor: v }), DOACOES, `valor ${String(v)}: sem o campo do valor`);
    eq(P.buildPixPayload({ chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "BRASILIA" }), FULANO, "chave aleatória: igual ao de antes");
    const comValor = P.buildPixPayload({ ...igreja, valor: 150 });
    const campos = lerTlv(comValor);
    eq(campos.map((c) => c.id), ["00", "01", "26", "52", "53", "54", "58", "59", "60", "62", "63"], "com valor: o campo 54 entra entre a moeda (53) e o país (58), na ordem do padrão");
    eq(campos.find((c) => c.id === "54").valor, "150.00", "o valor com ponto e 2 casas");
    eq(comValor.slice(-4), P.crc16(comValor.slice(0, -4)), "o CRC do código com valor confere");
    eq(lerTlv(campos.find((c) => c.id === "26").valor).map((c) => c.valor), ["br.gov.bcb.pix", "10743586000138"], "a conta: o domínio do Pix e a chave");
    eq(P.valorPix(0.1 + 0.2), "0.30", "0,1 + 0,2 vira 0.30 (sem o erro de ponto flutuante)");
    eq(P.valorPix(1234.5), "1234.50", "1.234,50");
    eq(P.valorPix(1e12), null, "valor que não cabe nos 13 caracteres do campo: sem valor");
  });

  await tentar("as chaves Pix", async () => {
    console.log("== as chaves Pix ==");
    eq(G.chaveParaPix("cnpj", "10.743.586/0001-38"), "10743586000138", "o CNPJ da Igreja confere e vai só com os números");
    eq(G.chaveParaPix("cnpj", "10.743.586/0001-39"), null, "CNPJ com o dígito errado: recusado");
    eq(G.chaveParaPix("cnpj", "11111111111111"), null, "CNPJ de números repetidos: recusado");
    eq(G.chaveParaPix("cpf", "529.982.247-25"), "52998224725", "CPF válido");
    eq(G.chaveParaPix("cpf", "529.982.247-26"), null, "CPF com o dígito errado: recusado");
    eq(G.chaveParaPix("cpf", "111.111.111-11"), null, "CPF de números repetidos: recusado");
    eq(G.chaveParaPix("email", " Tesouraria@IEADESPA.org "), "tesouraria@ieadespa.org", "e-mail em minúsculas e sem espaço");
    eq(G.chaveParaPix("email", "sem-arroba.org"), null, "e-mail sem @: recusado");
    eq(G.chaveParaPix("email", `${"a".repeat(71)}@ex.com`), null, "e-mail com mais de 77 caracteres (não cabe no código Pix): recusado");
    eq(G.chaveParaPix("celular", "(94) 99123-4567"), "+5594991234567", "celular vira +55 com DDD");
    eq(G.chaveParaPix("celular", "+55 94 99123-4567"), "+5594991234567", "celular já com +55");
    eq(G.chaveParaPix("celular", "(94) 3346-1234"), null, "telefone fixo não é chave de celular");
    eq(G.chaveParaPix("aleatoria", "123E4567-E89B-12D3-A456-426614174000"), "123e4567-e89b-12d3-a456-426614174000", "chave aleatória em minúsculas");
    eq(G.chaveParaPix("aleatoria", "123e4567"), null, "chave aleatória pela metade: recusada");
    eq(G.chaveParaPix("outra", "x"), null, "tipo que não existe: recusado");
  });

  await tentar("a conferência do painel", async () => {
    console.log("== a conferência do painel ==");
    const pix = (tipo, chave, nome = "IEADESPA") => ({ pix: { tipo, chave, nome }, dinheiro: null });
    eq(G.problemaPagamento({ pix: null, dinheiro: null }), null, "nada preenchido pode (evento sem valor)");
    eq(G.problemaPagamento(pix("cnpj", "10.743.586/0001-38")), null, "o Pix da Igreja pode");
    eq(G.problemaPagamento(pix("", "x")), "Escolha o tipo da chave Pix.", "sem o tipo");
    eq(G.problemaPagamento(pix("cnpj", "  ")), "Digite a chave Pix.", "sem a chave");
    eq(G.problemaPagamento(pix("cpf", "123")), "Esse CPF não confere (confira os números).", "CPF errado");
    eq(G.problemaPagamento(pix("cnpj", "123")), "Esse CNPJ não confere (confira os números).", "CNPJ errado");
    eq(G.problemaPagamento(pix("email", "x")), "Esse e-mail não parece certo.", "e-mail errado");
    verdade(/DDD e o 9/.test(G.problemaPagamento(pix("celular", "3346-1234"))), "celular errado: diz como é");
    verdade(/chave aleatória/.test(G.problemaPagamento(pix("aleatoria", "abc"))), "aleatória errada: diz como é");
    verdade(/nome que aparece no banco/.test(G.problemaPagamento(pix("cnpj", "10743586000138", " "))), "sem o nome do recebedor: recusado (é a defesa contra o Pix trocado)");
    const din = (contato, telefone, onde) => ({ pix: null, dinheiro: { contato, telefone, onde } });
    eq(G.problemaPagamento(din("", "94991234567", "")), "Digite o nome de quem recebe em dinheiro.", "dinheiro sem quem recebe");
    eq(G.problemaPagamento(din("Maria", "", "")), "Para o dinheiro, informe o telefone de quem recebe ou onde e quando entregar.", "dinheiro sem telefone nem onde");
    eq(G.problemaPagamento(din("Maria", "1234", "")), "O telefone precisa ter o DDD, por exemplo (94) 99123-4567.", "telefone sem DDD");
    eq(G.problemaPagamento(din("Maria", "(94) 3346-1234", "")), null, "telefone fixo com DDD pode (é contato, não chave)");
    eq(G.problemaPagamento(din("Maria", "", "Secretaria da sede")), null, "só o lugar pode");
  });

  await tentar("a leitura do campo do Directus", async () => {
    console.log("== a leitura do campo do Directus (nunca quebra a montagem) ==");
    const vazio = { pix: null, dinheiro: null, observacao: "" };
    for (const lixo of [null, undefined, "", "{", "[]", [], 5, true, { pix: "x" }, { pix: [] }, { dinheiro: 3 }]) eq(G.normalizarPagamento(lixo), vazio, `lixo ${JSON.stringify(lixo)}: sem forma de pagamento`);
    const certo = { pix: { tipo: "cnpj", chave: "10.743.586/0001-38", nome: "IEADESPA" }, dinheiro: { contato: "Irmã Maria", telefone: "(94) 99123-4567", onde: "Secretaria da sede" }, observacao: "Pague até 20/11." };
    eq(G.normalizarPagamento(certo), { pix: certo.pix, dinheiro: { ...certo.dinheiro, telefone: "94991234567" }, observacao: "Pague até 20/11." }, "o certo passa (telefone só com os números)");
    eq(G.normalizarPagamento(JSON.stringify(certo)).pix, certo.pix, "o JSON em texto também é lido");
    eq(G.normalizarPagamento({ pix: { tipo: "cnpj", chave: "10743586000139", nome: "X" } }).pix, null, "chave que não confere: o Pix não aparece (melhor nada que um Pix errado)");
    eq(G.normalizarPagamento({ pix: { tipo: "cnpj", chave: "10743586000138", nome: "" } }).pix, null, "sem o nome do recebedor: o Pix não aparece");
    eq(G.normalizarPagamento({ pix: { tipo: "pix", chave: "10743586000138", nome: "X" } }).pix, null, "tipo desconhecido: o Pix não aparece");
    eq(G.normalizarPagamento({ dinheiro: { contato: "Maria", telefone: "", onde: "" } }).dinheiro, null, "dinheiro sem telefone nem lugar: não aparece");
    eq(G.normalizarPagamento({ dinheiro: { contato: "Maria", telefone: "+55 (94) 99123-4567", onde: "" } }).dinheiro.telefone, "94991234567", "telefone com +55: só DDD e número");
    const sujo = G.normalizarPagamento({ pix: { tipo: "cnpj", chave: "10743586000138", nome: "IEA\u202eDESPA\u0007\n" }, observacao: "linha 1\u2028linha 2\u200b " + "x".repeat(400) });
    eq(sujo.pix.nome, "IEA DESPA", "caractere invisível, de controle e de inverter o texto vira espaço");
    verdade(sujo.observacao.startsWith("linha 1 linha 2") && sujo.observacao.length === 300, "o recado: uma linha só, cortado em 300");
    eq(G.normalizarPagamento({ pix: { tipo: "cnpj", chave: "10743586000138", nome: "N".repeat(90) } }).pix.nome.length, 60, "o nome cortado em 60");
  });

  await tentar("telefone, WhatsApp e o código da página", async () => {
    console.log("== telefone, WhatsApp e o código da página ==");
    eq(G.formatarTelefone("94991234567"), "(94) 99123-4567", "celular formatado");
    eq(G.formatarTelefone("9433461234"), "(94) 3346-1234", "fixo formatado");
    eq(G.linkWhatsApp("94991234567"), "https://wa.me/5594991234567", "celular tem link do WhatsApp");
    eq(G.linkWhatsApp("9433461234"), null, "fixo não tem link do WhatsApp");
    const pag = G.normalizarPagamento({ pix: { tipo: "celular", chave: "(94) 99123-4567", nome: "Maria Tesoureira" } });
    eq(G.dadosDoCodigoPix(pag, "Parauapebas"), { chave: "+5594991234567", nome: "Maria Tesoureira", cidade: "Parauapebas" }, "o código usa a chave no formato do Pix e a cidade do site");
    eq(G.dadosDoCodigoPix(G.normalizarPagamento(null), "Parauapebas"), null, "sem Pix, sem código");
    const longo = G.normalizarPagamento({ pix: { tipo: "email", chave: `${"a".repeat(67)}@ex.com.br`, nome: "X" } });
    const codigo = P.buildPixPayload({ ...G.dadosDoCodigoPix(longo, "Parauapebas"), valor: 99999.99 });
    const c26 = lerTlv(codigo).find((c) => c.id === "26");
    verdade(c26.valor.length <= 99 && codigo.slice(-4) === P.crc16(codigo.slice(0, -4)), "a maior chave aceita (e-mail de 77) ainda cabe no código e o CRC confere");
  });

  await tentar("as páginas", async () => {
    console.log("== as páginas ==");
    const comp = ler("components/ComoPagar.astro");
    verdade(!/set:html/.test(comp), "o bloco \"Como pagar\" não injeta HTML (o Astro escapa todo texto)");
    verdade(/ainda não foi publicada aqui\. Não pague a ninguém que entrar em contato pedindo/.test(comp), "sem forma de pagamento: avisa e manda não pagar a quem pedir");
    verdade(/confira no app do banco se o recebedor é <strong>\{pagamento\.pix\.nome\}<\/strong>/.test(comp), "manda conferir o nome do recebedor no app do banco");
    verdade(/href=\{`tel:\+55\$\{telefone\}`\}/.test(comp) && /data-copiar=\{chaveCopiar\}/.test(comp) && /data-copiar=\{payload\}/.test(comp), "o telefone vira link de ligar, e há os botões de copiar a chave e o Copia e Cola");
    const nav = fs.readFileSync(path.join(__dirname, "../../src/lib/pagamentoNavegador.ts"), "utf8");
    verdade(/addEventListener\("astro:page-load", iniciar\)/.test(nav) && /dataset\.qrLigado/.test(nav) && /dataset\.copiarLigado/.test(nav), "o script roda a cada troca de página e liga cada coisa uma vez só");
    verdade(!/innerHTML = (?!qr\.createImgTag)/.test(nav), "o valor depois da inscrição é montado com textContent (o único innerHTML é a imagem do QR)");
    const ev = ler("pages/evento/[slug].astro");
    const valores = ev.slice(ev.indexOf("lotes.length > 0 && ("), ev.indexOf("{inscricaoAberta ? ("));
    verdade(/<ComoPagar pagamento=\{pagamento\} cidade=\{config\.address_city\}/.test(valores) && valores.indexOf("<ComoPagar") < valores.indexOf("<AvisoGolpe"), "a página do evento mostra o \"Como pagar\" junto dos valores, antes do aviso contra golpe");
    verdade(/const pagamento = normalizarPagamento\(event\.pagamento_config\);/.test(ev), "a página lê o campo só pela normalização");
    verdade(/data-pagar-agora hidden/.test(ev) && /\.filter\(\(r\) => !r\.pendenteAprovacao && !r\.aguardandoVaga\)/.test(ev) && /window\.ieadespaPagamento\.mostrarValor\(pagarAgora/.test(ev), "depois da inscrição: o valor só de quem ficou confirmado (espera e aprovação pendente ainda não pagam)");
    const inf = ler("pages/informar-pagamento/[slug].astro");
    verdade(/<ComoPagar pagamento=\{pagamento\} cidade=\{config\.address_city\}/.test(inf) && /<AvisoGolpe/.test(inf), "a \"Informar pagamento\" mostra o \"Como pagar\" e o aviso");
    const mc = ler("pages/minha-conta.astro");
    verdade(/podeInformarInscricao\(i\) && i\.eventoSlug \? `<p class="minha-conta-card-detalhe"><a href="\/informar-pagamento\/\$\{escapeHtml\(i\.eventoSlug\)\}\/#como-pagar"/.test(mc), "Minha Conta: \"Como pagar\" só na inscrição que ainda tem o que pagar");
  });

  await tentar("o painel", async () => {
    console.log("== os painéis (aba Pagamento: eventos e camisetas) ==");
    const lib = fs.readFileSync(path.join(__dirname, "../../src/lib/painelPagamento.ts"), "utf8");
    const comp = ler("components/PainelPagamento.astro");
    verdade(/data-igreja-cnpj=\{siteConfig\.cnpj\}/.test(comp) && /fPixTipo\.value = "cnpj";/.test(lib), "o botão da chave Pix da Igreja usa o CNPJ do site");
    const salvar = lib.slice(lib.indexOf("form.addEventListener(\"submit\""));
    verdade(/body: JSON\.stringify\(\{ pagamento_config: valor \}\)/.test(salvar), "a aba grava SÓ `pagamento_config`");
    verdade(salvar.indexOf("problemaPagamento(dados)") > -1 && salvar.indexOf("problemaPagamento(dados)") < salvar.indexOf("await pedir("), "confere antes de gravar");
    verdade(salvar.indexOf("if (!disponivel)") > -1 && salvar.indexOf("if (!disponivel)") < salvar.indexOf("await pedir("), "sem o campo no Directus, não grava (avisa)");
    verdade(/if \(ocupado\) return;/.test(salvar) && /finally \{\s*ocupado = false;/.test(salvar), "um salvamento por vez");
    verdade(/hasOwnProperty\.call\(op\.registro, "pagamento_config"\)/.test(lib), "sabe se o campo existe pelo registro lido com `*`");
    const ev = ler("pages/painel-eventos/evento/index.astro");
    verdade(/data-tab="pagamento">Pagamento<\/button>/.test(ev) && /<PainelPagamento alvo="evento" \/>/.test(ev) && /ligarPainelPagamento\(\{[\s\S]{0,200}colecao: "eventos"/.test(ev), "painel de eventos: a aba usa o componente e grava em `eventos`");
    const lerForm = ev.slice(ev.indexOf("function lerFormulario()"), ev.indexOf("// ---------- v7.13: crachá"));
    verdade(lerForm.length > 100 && !/pagamento_config/.test(lerForm), "o \"Salvar evento\" não manda `pagamento_config` (um não apaga o outro)");
    verdade(!/f-pix-tipo/.test(ev), "o formulário não ficou duplicado no painel de eventos");
    const cam = ler("pages/painel-camisetas/grupo/index.astro");
    verdade(/data-tab="pagamento">Pagamento<\/button>/.test(cam) && /<PainelPagamento alvo="campanha" \/>/.test(cam) && /colecao: "camiseta_grupos"/.test(cam) && /herdado: pagamentoDoEvento/.test(cam) && /pedir: api/.test(cam), "painel de camisetas: a aba grava em `camiseta_grupos`, mostra o herdado do evento e renova a sessão");
    verdade(/\/items\/eventos\/\$\{grupo\.evento\}\?fields=\*/.test(cam), "o evento vinculado é lido com `*` (sem o campo, nada de 403)");
    const lerFormCam = cam.slice(cam.indexOf("evento: fEvento.value"), cam.indexOf("ativo: fAtivo.checked"));
    verdade(lerFormCam.length > 50 && !/pagamento_config/.test(lerFormCam), "o \"Salvar\" da campanha não manda `pagamento_config`");
  });

  await tentar("camisetas", async () => {
    console.log("== camisetas: o como pagar da campanha ou do evento ==");
    const propria = { pix: { tipo: "cnpj", chave: "10743586000138", nome: "IEADESPA" } };
    const doEvento = { dinheiro: { contato: "Maria", telefone: "94991234567", onde: "" } };
    eq(G.pagamentoDaCampanha(propria, doEvento).pix.chave, "10743586000138", "a campanha com o seu: vale o dela");
    eq(G.pagamentoDaCampanha(propria, doEvento).dinheiro, null, "e não mistura com o do evento");
    eq(G.pagamentoDaCampanha(null, doEvento).dinheiro.contato, "Maria", "a campanha vazia: vale o do evento vinculado");
    eq(G.pagamentoDaCampanha({ observacao: "só recado" }, doEvento).dinheiro.contato, "Maria", "só um recado na campanha (sem forma de pagamento): vale o do evento");
    eq(G.temFormaDePagamento(G.pagamentoDaCampanha(null, null)), false, "nenhum dos dois: vazio (a página avisa)");
    eq(G.temFormaDePagamento(G.pagamentoDaCampanha({ pix: { tipo: "cnpj", chave: "1", nome: "X" } }, "lixo")), false, "Pix errado na campanha e lixo no evento: vazio");
    const pg = ler("pages/camiseta/[slug].astro");
    verdade(/fields=\*,evento\.\*,ministerio\.name/.test(pg), "a página da camiseta lê o evento com `evento.*` (sem o campo, nada de 403 no build)");
    verdade(/const pagamento = pagamentoDaCampanha\(lote\.pagamento_config, lote\.evento\?\.pagamento_config\);/.test(pg), "e escolhe pela regra da campanha");
    verdade(/\{temPreco && <ComoPagar pagamento=\{pagamento\} cidade=\{config\.address_city\} depoisDe="fazer o pedido"/.test(pg) && pg.indexOf("<ComoPagar") < pg.indexOf("<AvisoGolpe"), "o \"Como pagar\" só quando há preço, antes do aviso contra golpe");
    verdade(/const totalPedido = Math\.round\(itens\.reduce\(\(soma, item\) => soma \+ item\.quantidade \* precoTamanho\(item\.tamanho\), 0\) \* 100\) \/ 100;/.test(pg) && pg.indexOf("const totalPedido") < pg.indexOf("form.reset();"), "depois do pedido: o valor é calculado dos itens ANTES de limpar o formulário");
    verdade(/window\.ieadespaPagamento\.mostrarValor\(pagarAgora, totalPedido, "Depois de pagar, informe o pagamento em \\"Meus pedidos\\"/.test(pg), "e o texto diz para informar em \"Meus pedidos\"");
    for (const [arq, nome] of [["pages/meus-pedidos-camiseta.astro", "Meus pedidos"], ["pages/minha-conta.astro", "Minha Conta"]]) {
      const t = ler(arq);
      verdade(/preencherComoPagarPedido\(caixa, p\.comoPagar, /.test(t) && /data-como-pagar-pedido="\$\{p\.id\}"/.test(t) && /data-pix-cidade=\{config\.address_city\}/.test(t), `${nome}: o pedido que deve mostra como pagar o que falta`);
    }
    const nav = fs.readFileSync(path.join(__dirname, "../../src/lib/pagamentoNavegador.ts"), "utf8");
    const pedido = nav.slice(nav.indexOf("export function preencherComoPagarPedido"), nav.indexOf("function iniciar()"));
    verdade(pedido.length > 500 && !/innerHTML/.test(pedido) && /buildPixPayload\(\{ \.\.\.codigo, valor: falta \}\)/.test(pedido), "o como pagar do pedido: sem innerHTML e com o Pix de exatamente o que falta");
    verdade(/a\.href = `tel:\+55\$\{tel\.replace\(\/\\D\/g, ""\)\}`;/.test(pedido), "o link de ligar só com dígitos");
  });

  await tentar("as consultas de pedidos", async () => {
    console.log("== as consultas de pedidos (api) ==");
    const { pagamentoDosGrupos } = require("../../api/src/lib/comoPagar.js");
    const chamadas = [];
    const fetchOriginal = global.fetch;
    let modo = "ok";
    global.fetch = async (url) => {
      chamadas.push(String(url));
      if (modo === "fora") return { ok: false, status: 503, json: async () => ({}) };
      if (modo === "lança") throw new Error("rede");
      if (String(url).includes("/items/camiseta_grupos")) return { ok: true, json: async () => ({ data: [{ id: 10, evento: 304, pagamento_config: null }, { id: 11, evento: null, pagamento_config: { pix: 1 } }] }) };
      if (String(url).includes("/items/eventos")) return { ok: true, json: async () => ({ data: [{ id: 304, pagamento_config: { dinheiro: 2 } }] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    try {
      let m = await pagamentoDosGrupos("http://d", {}, [10, 11, 10, "x", null]);
      eq([m.get(10), m.get(11)], [{ campanha: null, evento: { dinheiro: 2 } }, { campanha: { pix: 1 }, evento: null }], "devolve o da campanha e o do evento vinculado, crus");
      verdade(chamadas.every((u) => /fields=\*&/.test(u)) && /filter\[id\]\[_in\]=10,11&/.test(chamadas[0]), "lê com `fields=*` (sem o campo, nada de 403) e só os grupos pedidos, sem repetir");
      chamadas.length = 0;
      m = await pagamentoDosGrupos("http://d", {}, []);
      eq([m.size, chamadas.length], [0, 0], "nenhum pedido devendo: nem pergunta ao Directus");
      modo = "fora";
      eq((await pagamentoDosGrupos("http://d", {}, [10])).size, 0, "Directus fora: mapa vazio (a consulta segue sem o como pagar)");
      modo = "lança";
      eq((await pagamentoDosGrupos("http://d", {}, [10])).size, 0, "erro de rede: mapa vazio, sem quebrar");
    } finally {
      global.fetch = fetchOriginal;
    }
    for (const arq of ["ConsultarPedidosCamiseta", "ConsultarMinhaConta"]) {
      const t = fs.readFileSync(path.join(__dirname, `../../api/${arq}/index.js`), "utf8");
      verdade(/grupo\.id,grupo\.nome/.test(t) && /await pagamentoDosGrupos\(DIRECTUS_URL, headers, devendo\.map\(\(p\) => p\.grupo\?\.id\)\)/.test(t) && /comoPagar: .*valorTotal > Number\(p\.valor_pago \?\? 0\) \? comoPagar\.get\(Number\(p\.grupo\?\.id\)\) \?\? null : null/.test(t), `${arq}: o como pagar só no pedido que ainda deve`);
    }
  });

  await tentar("o script do esquema", async () => {
    console.log("== o script do esquema contra um Directus de mentira ==");
    const rodar = (estado, args) =>
      new Promise((ok) => {
        const chamadas = [];
        const srv = http.createServer((req, res) => {
          let corpo = "";
          req.on("data", (c) => (corpo += c));
          req.on("end", () => {
            chamadas.push({ metodo: req.method, url: req.url, corpo: corpo ? JSON.parse(corpo) : null });
            const responder = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data })); };
            const col = (req.url.match(/^\/fields\/([a-z_]+)/) || [])[1];
            if (req.method === "GET" && col) return responder((estado.campos[col] || []).map((field) => ({ field })));
            if (req.method === "GET" && req.url.startsWith("/policies")) return responder(estado.politicas);
            const colPerm = decodeURIComponent(req.url).match(/filter\[collection\]\[_eq\]=([a-z_]+)/);
            if (req.method === "GET" && req.url.startsWith("/permissions")) return responder(estado.permissoes.filter((p) => !colPerm || (p.collection || "eventos") === colPerm[1]));
            if (req.method === "POST" && col) return responder({});
            if (req.method === "PATCH" && req.url.startsWith("/permissions/")) return responder({});
            responder(null, 404);
          });
        });
        srv.listen(0, "127.0.0.1", () => {
          const filho = spawn(process.execPath, [path.join(__dirname, "../directus-pagamento-evento-esquema.mjs"), ...args], {
            env: { ...process.env, DIRECTUS_URL: `http://127.0.0.1:${srv.address().port}`, DIRECTUS_ADMIN_TOKEN: "token-de-teste" },
          });
          let saida = "";
          filho.stdout.on("data", (c) => (saida += c));
          filho.stderr.on("data", (c) => (saida += c));
          filho.on("close", (codigo) => srv.close(() => ok({ codigo, saida, chamadas })));
        });
      });
    const politicas = [{ id: "pub", name: null, admin_access: false }, { id: "ed", name: "Editor de eventos", admin_access: false }, { id: "gc", name: "Gestor de Camisetas", admin_access: false }, { id: "adm", name: "Administrator", admin_access: true }];
    // o retrato de produção em 09/11/2026: eventos tudo "*"; camiseta_grupos com a leitura PÚBLICA numa lista
    const hoje = [
      { id: 1, collection: "eventos", policy: null, action: "read", fields: ["*"] },
      { id: 2, collection: "eventos", policy: "ed", action: "read", fields: ["*"] },
      { id: 3, collection: "eventos", policy: "ed", action: "update", fields: ["*"] },
      { id: 4, collection: "camiseta_grupos", policy: null, action: "read", fields: ["id", "slug", "nome"] },
      { id: 5, collection: "camiseta_grupos", policy: "gc", action: "update", fields: ["*"] },
      { id: 6, collection: "camiseta_grupos", policy: "adm", action: "read", fields: ["id"] },
    ];
    const semCampo = { eventos: ["id", "title"], camiseta_grupos: ["id", "nome"] };
    const comCampo = { eventos: ["id", "pagamento_config"], camiseta_grupos: ["id", "pagamento_config"] };
    let r = await rodar({ campos: semCampo, politicas, permissoes: hoje }, []);
    const criou = r.chamadas.filter((c) => c.metodo === "POST").map((c) => [c.url, c.corpo.field, c.corpo.type]);
    eq([r.codigo, criou], [0, [["/fields/eventos", "pagamento_config", "json"], ["/fields/camiseta_grupos", "pagamento_config", "json"]]], "sem os campos: cria os dois (eventos e camiseta_grupos, json) e termina bem");
    eq(r.chamadas.filter((c) => c.metodo === "PATCH").map((c) => [c.url, c.corpo.fields]), [["/permissions/4", ["id", "slug", "nome", "pagamento_config"]]], "só a leitura pública das camisetas (uma lista) ganha o campo; \"*\" e administrador ficam como estão");
    r = await rodar({ campos: comCampo, politicas, permissoes: hoje.map((p) => (p.id === 4 ? { ...p, fields: [...p.fields, "pagamento_config"] } : p)) }, []);
    eq([r.codigo, r.chamadas.filter((c) => c.metodo !== "GET").length], [0, 0], "rodar de novo (tudo já feito): não grava nada");
    r = await rodar({ campos: semCampo, politicas, permissoes: hoje }, ["--simular"]);
    eq([r.codigo, r.chamadas.filter((c) => c.metodo !== "GET").length, /\[simular\] eventos\.pagamento_config/.test(r.saida) && /\[simular\] camiseta_grupos\.pagamento_config/.test(r.saida)], [0, 0, true], "--simular: só diz o que faria, não grava nada");
    r = await rodar({ campos: comCampo, politicas, permissoes: [...hoje, { id: 9, collection: "camiseta_grupos", policy: null, action: "update", fields: ["*"] }] }, []);
    eq([r.codigo, /o PÚBLICO pode alterar camiseta_grupos/.test(r.saida)], [1, true], "o público podendo alterar campanhas: avisa e termina com erro");
    verdade(!/token-de-teste/.test(r.saida), "o token nunca aparece na saída");
  });

  await tentar("o tutorial", async () => {
    console.log("== o tutorial \"Como participar\" ==");
    const t = ler("pages/como-participar.astro");
    for (const id of ["antes", "inscricao", "pagar", "pix", "informar", "no-dia", "depois", "camisetas", "golpe", "duvidas"])
      verdade(new RegExp(`id: "${id}"`).test(t) && new RegExp(`id="${id}"`).test(t), `a seção #${id} está no índice e na página`);
    verdade(/<AvisoGolpe/.test(t) && /Pix Copia e Cola/.test(t) && /não pague/i.test(t), "o tutorial ensina o Pix Copia e Cola e traz o aviso contra golpe");
    const links = [
      ["pages/evento/[slug].astro", 'href="/como-participar/"'],
      ["pages/eventos.astro", 'href="/como-participar/"'],
      ["pages/camiseta/[slug].astro", 'href="/como-participar/#camisetas"'],
      ["pages/informar-pagamento/[slug].astro", 'href="/como-participar/#pix"'],
      ["pages/meus-pedidos-camiseta.astro", 'href="/como-participar/#camisetas"'],
    ];
    for (const [arq, href] of links) verdade(ler(arq).includes(href), `${arq} aponta para o tutorial`);
    verdade(fs.readFileSync(path.join(__dirname, "../../src/config/site.ts"), "utf8").includes('{ label: "Como participar dos eventos", href: "/como-participar/" }'), "o rodapé tem o link");
    const ev = ler("pages/evento/[slug].astro");
    verdade(/Para quem se inscreveu/.test(ev) && ev.indexOf("Para quem se inscreveu") < ev.indexOf("abrir o check-in de presença"), "os atalhos de quem se inscreveu vêm antes do check-in da equipe");
  });

  console.log(`\ncomo pagar: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  process.exit(falhas ? 1 : 0);
})();
