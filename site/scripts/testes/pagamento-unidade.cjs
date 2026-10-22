// Testes de UNIDADE do "INFORMAR O PAGAMENTO" e do "CONFIRMAR COM NOME E HORA" (v7.13): as regras puras (api/src/lib/pagamentoInformado.js e auditoriaPagamento.js,
// src/lib/informarPagamento.ts e inscricoesPainel.ts) e as funções de verdade com um `fetch` de mentira — InformarPagamento (código+telefone, Minha Conta, telefone do pedido),
// PainelInscricao (quem e quando saem do token, nunca da tela), ConsultarMinhaConta e ConsultarPedidosCamiseta (o id e o aviso já informado).
// Sem rede. Como rodar (de dentro de site/):  node scripts/testes/pagamento-unidade.cjs
process.env.TELEFONE_CHAVE_SEGREDO = "segredo-de-teste-unidade-nao-usar-em-producao";
process.env.DIRECTUS_URL = "http://directus.teste";
process.env.DIRECTUS_ADMIN_TOKEN = "token-admin-de-teste";
process.env.CONTA_TOKEN_SECRET = "segredo-da-conta-de-teste";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { carregarTs } = require("./carregar-ts.cjs");
const P = require("../../api/src/lib/pagamentoInformado.js");
const A = require("../../api/src/lib/auditoriaPagamento.js");
const { gerarHash, chaveTelefone } = require("../../api/src/lib/telefone.js");
const { assinar } = require("../../api/src/lib/contaToken.js");

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
const BRT = (texto) => new Date(`${texto}-03:00`).getTime();

let IP, IPainel;

(async () => {
  IP = await carregarTs("informarPagamento");
  IPainel = await carregarTs("inscricoesPainel");
  console.log("== a validação do aviso de pagamento ==");
  const agora = BRT("2026-10-22T10:00:00");
  const bom = { data: "2026-10-20", meio: "pix", valor: "50,00", nome: "  Maria   da Silva " };
  eq(P.validarPagamentoInformado(bom, agora), { ok: true, pagamento: { data: "2026-10-20", meio: "PIX", valor: 50, nome: "Maria da Silva" } }, "aviso certo: meio em maiúsculas, valor com vírgula, nome sem espaços sobrando");
  const erroDe = (mudanca) => P.validarPagamentoInformado({ ...bom, ...mudanca }, agora).erro || null;
  verdade(/futuro/.test(erroDe({ data: "2026-10-23" })), "data no futuro: recusa");
  eq(erroDe({ data: "2026-10-22" }), null, "hoje vale");
  eq(P.validarPagamentoInformado({ ...bom, data: "2026-10-22" }, Date.parse("2026-10-22T02:00:00Z")).erro, "A data do pagamento não pode ser no futuro.", "às 23h do dia 21 em Brasília (02h UTC do dia 22), o dia 22 ainda é futuro");
  verdade(/mais de 1 ano/.test(erroDe({ data: "2025-10-21" })), "mais de 1 ano atrás: recusa");
  eq(erroDe({ data: "2025-10-22" }), null, "exatamente 1 ano atrás: vale");
  verdade(/não existe/.test(erroDe({ data: "2026-02-30" })), "30/02 não existe");
  verdade(/Informe a data/.test(erroDe({ data: "20/10/2026" })), "data fora do formato AAAA-MM-DD");
  verdade(/como pagou/.test(erroDe({ meio: "boleto" })), "meio que não está na lista");
  for (const meio of ["PIX", "TRANSFERENCIA", "DINHEIRO", "OUTRO", "dinheiro"]) eq(erroDe({ meio }), null, `meio ${meio} vale`);
  eq([P.lerValor("50"), P.lerValor("50.5"), P.lerValor("50,50"), P.lerValor("1.234,56"), P.lerValor("R$ 70,00"), P.lerValor(80)], [50, 50.5, 50.5, 1234.56, 70, 80], "valores: 50 · 50.5 · 50,50 · 1.234,56 · R$ 70,00 · número");
  eq([P.lerValor("0"), P.lerValor("-5"), P.lerValor("50,555"), P.lerValor("abc"), P.lerValor("50001"), P.lerValor(Infinity), P.lerValor(null), P.lerValor("1e3")], [null, null, null, null, null, null, null, null], "recusa zero, negativo, 3 casas, texto, acima de R$ 50.000, infinito, vazio e notação científica");
  verdade(/nome de quem pagou/.test(erroDe({ nome: " a " })), "nome curto demais");
  verdade(/no máximo 120/.test(erroDe({ nome: "x".repeat(121) })), "nome com mais de 120 letras");
  eq(erroDe({ nome: "x".repeat(120) }), null, "120 letras vale");
  verdade(/não é aceito/.test(erroDe({ nome: "Maria\u0000" })), "caractere de controle no nome: recusa");
  verdade(/não é aceito/.test(erroDe({ nome: "Maria‮axiram" })), "caractere invisível de direção de texto: recusa");
  verdade(/não é aceito/.test(erroDe({ nome: "Maria\nJoão" })), "quebra de linha no nome: recusa");
  eq(P.validarPagamentoInformado(null, agora).ok, false, "sem aviso nenhum: recusa");
  const campos = P.camposDoAviso({ data: "2026-10-20", meio: "PIX", valor: 50, nome: "Maria" }, "2026-10-22T13:00:00.000Z");
  eq(Object.keys(campos), ["pagamento_informado_data", "pagamento_informado_meio", "pagamento_informado_valor", "pagamento_informado_nome", "pagamento_informado_em"], "grava só os 5 campos do aviso (nunca 'pago')");
  eq(P.avisoDoRegistro({ ...campos, pagamento_informado_valor: "50.00" }), { data: "2026-10-20", meio: "PIX", meioRotulo: "Pix", valor: 50, nome: "Maria", em: "2026-10-22T13:00:00.000Z" }, "o aviso lido de volta, com o rótulo do meio");
  eq(P.avisoDoRegistro({ pagamento_informado_em: null }), null, "sem aviso: null");

  console.log("== o texto do aviso nas páginas ==");
  eq(IP.textoPagamentoInformado({ data: "2026-10-20", meio: "PIX", valor: 50, nome: "Maria", em: "2026-10-22T13:30:00.000Z" }), "Você informou: R$ 50,00 por Pix em 20/10/2026, pago por Maria (informado em 22/10/2026, 10:30).", "frase completa, com a hora de Brasília");
  eq(IP.textoPagamentoInformado(null), null, "sem aviso: nada");
  eq(IP.hojeBrasilia(Date.parse("2026-10-22T02:00:00Z")), "2026-10-21", "o 'hoje' do campo de data é o de Brasília");
  verdade(IP.formularioPagamentoHtml("x", { valor: 50, nome: '<b>"x"</b>' }).includes("&lt;b&gt;&quot;x&quot;&lt;/b&gt;"), "o formulário escapa o nome sugerido (nada de HTML vindo dos dados)");
  verdade(IP.formularioPagamentoHtml("x", { valor: 50 }).includes('value="50,00"'), "sugere o valor da inscrição com vírgula");

  console.log("== o aviso contra golpe: um texto só, em todas as telas de pagamento ==");
  const Golpe = await carregarTs("avisoGolpe");
  verdade(/NÃO entra em contato com ninguém por mensagem, telefone ou e-mail pedindo pagamento ou Pix/.test(Golpe.AVISO_GOLPE) && /avise a Secretaria/.test(Golpe.AVISO_GOLPE), "o texto diz que a Igreja não pede pagamento por mensagem/telefone/e-mail e manda avisar a Secretaria");
  const componente = fs.readFileSync(path.join(__dirname, "../../src/components/AvisoGolpe.astro"), "utf8");
  verdade(componente.includes("{AVISO_GOLPE}") && !/<button|hidden/.test(componente.replace(/\/\*[\s\S]*?\*\//, "")), "o componente mostra a constante (sem texto próprio) e não tem botão de fechar nem fica escondido");
  for (const pagina of ["evento/[slug].astro", "informar-pagamento/[slug].astro", "minha-conta.astro", "camiseta/[slug].astro", "meus-pedidos-camiseta.astro"]) {
    const fonte = fs.readFileSync(path.join(__dirname, "../../src/pages", pagina), "utf8");
    verdade(fonte.includes('import AvisoGolpe from "@/components/AvisoGolpe.astro"') && /<AvisoGolpe[\s/]/.test(fonte), `a página ${pagina} mostra o aviso contra golpe`);
  }

  console.log("== quem confirmou e quando (regras puras) ==");
  eq([A.nomeDoUsuario({ first_name: "Maria", last_name: "Souza" }), A.nomeDoUsuario({ email: "m@x.org" }), A.nomeDoUsuario({ id: "abcdef123456" }), A.nomeDoUsuario(null)], ["Maria Souza", "m@x.org", "Usuário abcdef12", "Equipe"], "o nome que aparece: nome completo, senão e-mail, senão o começo do id");
  const perm = (access, fields) => ({ inscricoes_eventos: { update: { access, fields } } });
  eq([A.perfilPode(perm("full", ["*"]), "pago"), A.perfilPode(perm("partial", ["pago", "nome"]), "cortesia"), A.perfilPode(perm("partial", ["nome"]), "pago"), A.perfilPode(perm("partial", ["nome"]), "tipo"), A.perfilPode(perm("none", []), "tipo"), A.perfilPode({}, "pago")], [true, true, false, false, false, false], "[revisão 6] pagamento só com o campo 'pago'; o tipo só com o campo tipo_participante (antes bastava alterar qualquer campo)");
  eq([A.perfilPode(perm("partial", ["tipo_participante"]), "tipo"), A.perfilPode(perm("full", ["*"]), "tipo")], [true, true], "[revisão 6] tipo com o campo na lista, ou com '*': pode");
  const eu = { id: "u-1", first_name: "Maria", last_name: "Souza" };
  eq(A.montarAlteracao({ acao: "pago", pago: true }, eu, "2026-10-22T13:00:00Z"), { campos: { pago: true, pago_conferido_valor: true, pago_conferido_em: "2026-10-22T13:00:00Z", pago_conferido_por: "u-1", pago_conferido_por_nome: "Maria Souza" } }, "[revisão 3] marcar pago: grava pago + o VALOR registrado + quem + quando");
  eq(A.montarAlteracao({ acao: "pago", pago: false }, eu, "t").campos.pago_conferido_por_nome, "Maria Souza", "desmarcar também registra quem e quando");
  eq(A.montarAlteracao({ acao: "pago", pago: "sim" }, eu).erro !== undefined, true, "'pago' tem de ser verdadeiro/falso");
  eq(A.montarAlteracao({ acao: "pago", pago: true, pago_conferido_por_nome: "Outra Pessoa" }, eu, "t").campos.pago_conferido_por_nome, "Maria Souza", "nome vindo da chamada é IGNORADO: vale o do token");
  eq(A.montarAlteracao({ acao: "pago", pago: true }, { first_name: "Sem id" }).erro, "Não foi possível saber quem está logado.", "sem id do usuário: recusa");
  verdade(/motivo/.test(A.montarAlteracao({ acao: "cortesia", ativa: true, motivo: "", autorizadoPor: "Pr. João" }, eu).erro), "cortesia sem motivo: recusa");
  verdade(/autorizou/.test(A.montarAlteracao({ acao: "cortesia", ativa: true, motivo: "Preletor convidado", autorizadoPor: " " }, eu).erro), "cortesia sem quem autorizou: recusa");
  verdade(/não é aceito/.test(A.montarAlteracao({ acao: "cortesia", ativa: true, motivo: "ok\u0007", autorizadoPor: "Pr. João" }, eu).erro), "motivo com caractere de controle: recusa");
  eq(A.montarAlteracao({ acao: "cortesia", ativa: true, motivo: " Preletor  convidado ", autorizadoPor: "Pr. João" }, eu, "t"), { campos: { cortesia: true, cortesia_registrada_valor: true, cortesia_motivo: "Preletor convidado", cortesia_autorizada_por: "Pr. João", cortesia_em: "t", cortesia_registrada_por: "u-1", cortesia_registrada_por_nome: "Maria Souza" } }, "cortesia: motivo, quem autorizou, quem registrou e quando");
  eq(A.montarAlteracao({ acao: "cortesia", ativa: false }, eu, "t").campos, { cortesia: false, cortesia_registrada_valor: false, cortesia_motivo: null, cortesia_autorizada_por: null, cortesia_em: "t", cortesia_registrada_por: "u-1", cortesia_registrada_por_nome: "Maria Souza" }, "tirar a cortesia: registra quem tirou e quando");
  eq([A.montarAlteracao({ acao: "tipo", tipo: "Preletor" }, eu).campos, A.montarAlteracao({ acao: "tipo", tipo: "Chefe" }, eu).erro], [{ tipo_participante: "Preletor" }, "Tipo de participante inválido."], "tipo de participante: só os 5 da lista");
  eq(A.montarAlteracao({ acao: "apagar" }, eu).erro, "Ação inválida.", "ação desconhecida: recusa");

  console.log("== a situação de pagamento no painel ==");
  const insc = (o) => ({ id: o.id || 1, valor: 50, pago: false, cortesia: false, aguardando_vaga: false, pendente_aprovacao: false, ...o });
  const lista = [
    insc({ id: 1, pago: true }),
    insc({ id: 2, cortesia: true, pago: false }),
    insc({ id: 3, pagamento_informado_em: "2026-10-21T10:00:00Z" }),
    insc({ id: 4 }),
    insc({ id: 5, aguardando_vaga: true }),
    insc({ id: 6, cortesia: true, pago: true }),
    insc({ id: 7, pago: true, pagamento_informado_em: "2026-10-21T10:00:00Z" }),
  ];
  eq(lista.map(IPainel.situacaoPagamento), ["pago", "cortesia", "a_conferir", "pendente", "pendente", "cortesia", "pago"], "situação: cortesia vence tudo; pago; informado e não confirmado = a conferir; o resto, pendente");
  const ids = (filtro) => lista.filter((i) => IPainel.passaNoFiltroPagamento(i, filtro)).map((i) => i.id);
  eq([ids("pagos"), ids("nao-pagos"), ids("a-conferir"), ids("cortesia")], [[1, 7], [3, 4, 5], [3], [2, 6]], "filtros: 'não pagos' NÃO inclui cortesia; 'a conferir' = informado e não confirmado");
  eq(IPainel.passaNoFiltroPagamento(lista[0], "presentes"), null, "filtro que não é de pagamento: o painel decide");
  eq(IPainel.totaisPagamento(lista), { pagos: 2, arrecadado: 100, cortesias: 2, aConferir: 1, aReceber: 100 }, "totais: a receber = só quem tem vaga, sem cortesia e sem pagar (3 e 4); lista de espera fora");
  eq(IPainel.contagemPorLote([{ id: 1, faixa_rotulo: "1º lote" }, { id: 2, faixa_rotulo: "1º lote" }, { id: 3, faixa_rotulo: "Antigo" }, { id: 4 }], [{ descricao: "1º lote", vagas: 2 }, { descricao: "2º lote" }]),
    [{ descricao: "1º lote", vagas: 2, inscritos: 2 }, { descricao: "2º lote", vagas: null, inscritos: 0 }, { descricao: "Antigo", vagas: null, inscritos: 1 }], "contagem por lote na ordem das faixas; lote que saiu das faixas aparece no fim");
  eq(IPainel.textoConferencia(insc({ pago: true, pago_conferido_em: "2026-10-22T13:00:00Z", pago_conferido_por_nome: "Maria" })), "Confirmado por Maria em 22/10/2026, 10:00", "texto: confirmado por quem e quando (hora de Brasília)");
  eq(IPainel.textoConferencia(insc({ pago: false, pago_conferido_em: "2026-10-22T13:00:00Z", pago_conferido_por_nome: "João" })), "Desmarcado por João em 22/10/2026, 10:00", "texto: desmarcado por quem e quando");
  eq(IPainel.textoConferencia(insc({})), null, "ninguém mexeu: sem texto");
  verdade(/^Cortesia: Preletor — autorizada por Pr\. João \(registrada por Maria em /.test(IPainel.textoCortesia(insc({ cortesia: true, cortesia_motivo: "Preletor", cortesia_autorizada_por: "Pr. João", cortesia_registrada_por_nome: "Maria", cortesia_em: "2026-10-22T13:00:00Z" }))), "texto da cortesia: motivo, quem autorizou, quem registrou");

  // ----- o Directus de mentira -----
  const TEL = "(94) 99123-4567";
  const banco = {
    inscricoes_eventos: [
      { id: 1, evento: 9, codigo: "ABC234", telefone: gerarHash(TEL), email: "maria@x.org", pago: false, cortesia: false, valor: 50 },
      { id: 2, evento: 9, codigo: "PAGO22", telefone: gerarHash(TEL), email: "maria@x.org", pago: true, cortesia: false, valor: 50 },
      { id: 3, evento: 9, codigo: "CORT33", telefone: gerarHash(TEL), email: "outra@x.org", pago: false, cortesia: true, valor: 50 },
      { id: 4, evento: 9, codigo: "ESPE44", telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", pago: false, valor: 50, aguardando_vaga: true },
      { id: 5, evento: 9, codigo: "APRO55", telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", pago: false, valor: 50, pendente_aprovacao: true },
      { id: 6, evento: 9, codigo: "ZERO66", telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", pago: false, valor: 0 },
      { id: 7, evento: 9, codigo: "CHAV77", telefone: "lixo:00", telefone_chave: chaveTelefone(TEL), email: "maria@x.org", pago: false, valor: 50 }, // só a chave confere
    ],
    camiseta_pedidos: [
      { id: 10, telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", avulso: false, valor_pago: 0 },
      { id: 11, telefone: gerarHash(TEL), telefone_chave: null, email: null, avulso: false, valor_pago: 0 }, // pedido antigo, sem a chave
      { id: 12, telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", avulso: true, valor_pago: 0 },
      { id: 13, telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", avulso: false, valor_pago: 50 },
      { id: 14, telefone: gerarHash(TEL), telefone_chave: chaveTelefone(TEL), email: "maria@x.org", avulso: false, valor_pago: 0, gratis: true },
    ],
    camiseta_itens_pedido: [10, 11, 12, 13, 14].map((pedido) => ({ pedido, tamanho: "M", quantidade: 1 })),
  };
  const opcoes = { semEsquema: false };
  const NOVOS = new Set(["pagamento_informado_data", "pagamento_informado_meio", "pagamento_informado_valor", "pagamento_informado_nome", "pagamento_informado_em", "pago_conferido_em", "pago_conferido_por", "pago_conferido_por_nome", "cortesia", "cortesia_motivo", "cortesia_autorizada_por", "cortesia_em", "cortesia_registrada_por", "cortesia_registrada_por_nome", "tipo_participante"]);
  const usuarios = { "token-da-maria": { id: "u-maria", first_name: "Maria", last_name: "Souza", email: "maria@igreja.org", pode: true }, "token-do-leitor": { id: "u-leitor", first_name: "Leitor", pode: false }, "token-sem-nome": { id: "u-joao", pode: true }, "token-parcial": { id: "u-parcial", first_name: "Parcial", pode: "parcial" } };
  const nomesNoAdmin = { "u-joao": { id: "u-joao", first_name: "João", last_name: "Lima" } };
  const registro = [];
  const resp = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const metodo = init.method || "GET";
    const auth = String((init.headers || {}).Authorization || "").replace("Bearer ", "");
    registro.push({ metodo, caminho: u.pathname + u.search, auth, corpo: init.body ? JSON.parse(init.body) : null });
    const admin = auth === process.env.DIRECTUS_ADMIN_TOKEN;
    if (u.pathname === "/users/me") return usuarios[auth] ? resp(200, { data: auth === "token-sem-nome" ? { id: "u-joao" } : usuarios[auth] }) : resp(401, { errors: [{ message: "token inválido" }] });
    if (u.pathname.startsWith("/users/")) return admin && nomesNoAdmin[u.pathname.split("/").pop()] ? resp(200, { data: nomesNoAdmin[u.pathname.split("/").pop()] }) : resp(403, {});
    if (u.pathname === "/permissions/me") return resp(200, { data: { inscricoes_eventos: { update: usuarios[auth]?.pode === "parcial" ? { access: "partial", fields: ["pago", "nome"] } : usuarios[auth]?.pode ? { access: "full", fields: ["*"] } : { access: "none", fields: [] } } } });
    if (u.pathname.startsWith("/fields/inscricoes_eventos/")) return opcoes.semEsquema ? resp(403, { errors: [{ message: "forbidden" }] }) : resp(200, { data: { field: u.pathname.split("/").pop() } });
    const m = /^\/items\/(\w+)(?:\/(\d+))?$/.exec(u.pathname);
    if (!m) return resp(404, {});
    const [, colecao, id] = m;
    if (!admin && !usuarios[auth]) return resp(401, {});
    const tabela = banco[colecao] || [];
    if (id) {
      const item = tabela.find((x) => x.id === Number(id));
      if (!item) return resp(403, { errors: [{ message: "forbidden" }] });
      if (metodo === "PATCH") {
        for (const [k, v] of Object.entries(JSON.parse(init.body))) if (!(opcoes.semEsquema && NOVOS.has(k))) item[k] = v; // sem o esquema, o Directus ignora campo desconhecido
      }
      return resp(200, { data: colecao === "camiseta_pedidos" ? { ...item, grupo: { valor_venda: item.gratis ? null : 50, precos_tamanho: null } } : { ...item } });
    }
    if (colecao === "camiseta_itens_pedido") return resp(200, { data: tabela.filter((x) => x.pedido === Number(u.searchParams.get("filter[pedido][_eq]"))) });
    const evento = Number(u.searchParams.get("filter[evento][_eq]"));
    const codigo = u.searchParams.get("filter[codigo][_eq]");
    return resp(200, { data: tabela.filter((x) => (!evento || x.evento === evento) && (!codigo || x.codigo === codigo)) });
  };

  const contexto = () => ({ log: Object.assign(() => {}, { warn() {}, error() {} }) });
  let ip = 0;
  const chamar = async (pasta, body, headers = {}, ipFixo = null) => {
    const handler = require(`../../api/${pasta}/index.js`);
    const ctx = contexto();
    await handler(ctx, { headers: { "x-forwarded-for": `${ipFixo || `10.1.${Math.floor(++ip / 200)}.${ip % 200}`}, 1.1.1.1`, ...headers }, body, params: {} });
    return ctx.res;
  };
  const aviso = { data: "2026-10-20", meio: "PIX", valor: "50,00", nome: "Maria Souza" };
  // A data do aviso tem de estar dentro de 1 ano de HOJE (o teste roda em qualquer dia): usa ontem.
  aviso.data = IP.hojeBrasilia(Date.now() - 24 * 3600 * 1000);

  console.log("== InformarPagamento: inscrição pelo código + telefone ==");
  let r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "abc234", telefone: TEL, pagamento: aviso });
  eq([r.status, r.body.ok, r.body.informado.valor, r.body.informado.meio], [200, true, 50, "PIX"], "código (minúsculo ok) + telefone certos: 200, aviso gravado");
  const patch = registro.filter((x) => x.metodo === "PATCH").pop();
  eq([patch.auth === process.env.DIRECTUS_ADMIN_TOKEN, Object.keys(patch.corpo).sort()], [true, ["pagamento_informado_data", "pagamento_informado_em", "pagamento_informado_meio", "pagamento_informado_nome", "pagamento_informado_valor"]], "grava com o token de administrador SÓ os 5 campos do aviso");
  eq(banco.inscricoes_eventos[0].pago, false, "informar NUNCA marca como pago");
  const primeiroEm = banco.inscricoes_eventos[0].pagamento_informado_em;
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ABC234", telefone: TEL, pagamento: { ...aviso, valor: "70", meio: "DINHEIRO" } });
  eq([r.status, banco.inscricoes_eventos[0].pagamento_informado_valor, banco.inscricoes_eventos[0].pagamento_informado_meio], [200, 70, "DINHEIRO"], "informar de novo SUBSTITUI o aviso anterior");
  verdade(banco.inscricoes_eventos[0].pagamento_informado_em >= primeiroEm, "e o 'informado em' é o novo");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ABC234", telefone: "(94) 98888-0000", pagamento: aviso });
  eq([r.status, r.body.erro], [404, "Não encontramos esse registro com os dados informados. Confira e tente de novo."], "telefone errado: 404 (a mesma resposta de código inexistente)");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ZZZ999", telefone: TEL, pagamento: aviso });
  eq(r.status, 404, "código inexistente: 404 igual");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "PAGO22", telefone: TEL, pagamento: aviso });
  eq(r.status, 409, "inscrição já confirmada pela equipe: 409");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "CORT33", telefone: TEL, pagamento: aviso });
  eq([r.status, /cortesia/.test(r.body.erro)], [409, true], "cortesia: 409 (não há o que pagar)");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ABC234", telefone: TEL, pagamento: { ...aviso, valor: "0" } });
  eq(r.status, 400, "valor zero: 400 (antes de procurar a inscrição)");
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "AB'; DROP", telefone: TEL, pagamento: aviso });
  eq(r.status, 400, "código com caracteres estranhos: 400");
  r = await chamar("InformarPagamento", { tipo: "boleto", pagamento: aviso });
  eq(r.status, 400, "tipo de registro inválido: 400");

  console.log("== InformarPagamento: pela Minha Conta (token) ==");
  r = await chamar("InformarPagamento", { tipo: "inscricao", token: assinar("Maria@X.org"), inscricaoId: 1, pagamento: aviso });
  eq(r.status, 200, "token da conta com o mesmo e-mail da inscrição (maiúsculas não importam): 200");
  r = await chamar("InformarPagamento", { tipo: "inscricao", token: assinar("maria@x.org"), inscricaoId: 3, pagamento: aviso });
  eq(r.status, 404, "inscrição de outro e-mail: 404");
  r = await chamar("InformarPagamento", { tipo: "inscricao", token: "falso.token", inscricaoId: 1, pagamento: aviso });
  eq(r.status, 401, "token inválido: 401");
  r = await chamar("InformarPagamento", { tipo: "pedido", token: assinar("maria@x.org"), pedidoId: 10, pagamento: aviso });
  eq([r.status, banco.camiseta_pedidos[0].pagamento_informado_nome, banco.camiseta_pedidos[0].valor_pago], [200, "Maria Souza", 0], "pedido de camiseta pela conta: aviso gravado, valor pago intocado");
  r = await chamar("InformarPagamento", { tipo: "pedido", token: assinar("maria@x.org"), pedidoId: 11, pagamento: aviso });
  eq(r.status, 404, "pedido sem e-mail não é da conta: 404");

  console.log("== InformarPagamento: pedido pelo telefone ==");
  r = await chamar("InformarPagamento", { tipo: "pedido", telefone: TEL, pedidoId: 10, pagamento: aviso });
  eq(r.status, 200, "pela chave do telefone: 200");
  r = await chamar("InformarPagamento", { tipo: "pedido", telefone: "94 99123-4567", pedidoId: 11, pagamento: aviso });
  eq(r.status, 200, "pedido antigo (sem chave): confere pelo hash do telefone");
  r = await chamar("InformarPagamento", { tipo: "pedido", telefone: "(11) 90000-0000", pedidoId: 10, pagamento: aviso });
  eq(r.status, 404, "telefone de outra pessoa: 404");
  r = await chamar("InformarPagamento", { tipo: "pedido", telefone: TEL, pedidoId: 999, pagamento: aviso });
  eq(r.status, 404, "pedido que não existe: 404");

  console.log("== InformarPagamento: sem o esquema e o limite por IP ==");
  opcoes.semEsquema = true;
  banco.inscricoes_eventos[0].pagamento_informado_em = null;
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ABC234", telefone: TEL, pagamento: aviso });
  eq(r.status, 503, "Directus sem os campos (ignora em silêncio): a função confere a resposta e diz 503, não finge que gravou");
  opcoes.semEsquema = false;
  const respostas = [];
  for (let i = 0; i < 52; i++) respostas.push((await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "ZZZ999", telefone: TEL, pagamento: aviso }, {}, "10.9.9.9")).status);
  eq([respostas.slice(0, 50).every((s) => s === 404), respostas.slice(50)], [true, [429, 429]], "[revisão 9] 50 tentativas por IP em 5 minutos (Wi-Fi do evento); a 51ª recebe 429");

  console.log("== PainelInscricao: quem e quando saem do token ==");
  const tok = { "x-painel-token": "token-da-maria" };
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: true });
  eq(r.status, 401, "sem token do painel: 401");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: true }, { "x-painel-token": "token-vencido" });
  eq(r.status, 401, "token que o Directus não reconhece: 401");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: true }, { "x-painel-token": "token-do-leitor" });
  eq([r.status, banco.inscricoes_eventos[0].pago], [403, false], "perfil que não pode alterar inscrições: 403, nada muda");
  r = await chamar("PainelInscricao", { inscricaoId: 999, acao: "pago", pago: true }, tok);
  eq(r.status, 404, "inscrição que o perfil não enxerga: 404");
  registro.length = 0;
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: true, pago_conferido_por_nome: "Pastor Presidente", pago_conferido_em: "2020-01-01" }, tok);
  const i1 = banco.inscricoes_eventos[0];
  eq([r.status, i1.pago, i1.pago_conferido_por, i1.pago_conferido_por_nome], [200, true, "u-maria", "Maria Souza"], "marcar pago: grava pago, o id e o NOME DE QUEM ESTÁ LOGADO (o nome inventado na chamada é ignorado)");
  verdade(Math.abs(Date.parse(i1.pago_conferido_em) - Date.now()) < 5000, "e a hora é a do servidor (não a '2020-01-01' da chamada)");
  const gravacao = registro.find((x) => x.metodo === "PATCH");
  eq([gravacao.auth === process.env.DIRECTUS_ADMIN_TOKEN, Object.keys(gravacao.corpo).sort()], [true, ["pago", "pago_conferido_em", "pago_conferido_por", "pago_conferido_por_nome", "pago_conferido_valor"]], "grava com o token de administrador só os 5 campos (pago, valor registrado, quem, quando)");
  verdade(registro.some((x) => x.caminho.startsWith("/users/me") && x.auth === "token-da-maria") && registro.some((x) => x.caminho === "/permissions/me" && x.auth === "token-da-maria"), "quem é e o que pode: perguntado ao Directus com o token DA PESSOA");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: false }, tok);
  eq([r.status, i1.pago, r.body.inscricao.pago_conferido_por_nome], [200, false, "Maria Souza"], "desmarcar: também guarda quem e quando");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "cortesia", ativa: true, motivo: "", autorizadoPor: "Pr. João" }, tok);
  eq([r.status, i1.cortesia], [400, false], "cortesia sem motivo: 400, nada muda");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "cortesia", ativa: true, motivo: "Preletor convidado", autorizadoPor: "Pr. João" }, tok);
  eq([r.status, i1.cortesia, i1.cortesia_motivo, i1.cortesia_autorizada_por, i1.cortesia_registrada_por_nome], [200, true, "Preletor convidado", "Pr. João", "Maria Souza"], "cortesia: motivo, quem autorizou e quem registrou");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: true }, { "x-painel-token": "token-sem-nome" });
  eq([r.status, i1.pago_conferido_por, i1.pago_conferido_por_nome], [200, "u-joao", "João Lima"], "perfil que não lê o próprio nome em /users/me: o id vem do token e o nome é lido pelo administrador PARA ESSE id");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "tipo", tipo: "Preletor" }, tok);
  eq([r.status, i1.tipo_participante], [200, "Preletor"], "tipo de participante: Preletor");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "tipo", tipo: "Rei" }, tok);
  eq(r.status, 400, "tipo fora da lista: 400");
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "apagar" }, tok);
  eq(r.status, 400, "ação desconhecida: 400");
  // sem o esquema: confere ANTES de gravar (senão o 'pago' mudaria e o 'quem' sumiria)
  delete require.cache[require.resolve("../../api/PainelInscricao/index.js")]; // memória da instância zerada
  opcoes.semEsquema = true;
  registro.length = 0;
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "pago", pago: false }, tok);
  eq([r.status, i1.pago, registro.some((x) => x.metodo === "PATCH")], [503, true, false], "Directus sem os campos de auditoria: 503 e NADA é gravado (nem o 'pago')");
  opcoes.semEsquema = false;

  await tentar("revisões 3, 6, 8, 10, 12, 13 e 17", async () => {
console.log("== revisão de 22/10/2026 ==");
  // 12: milhar só com o primeiro dígito de 1 a 9
  eq([P.lerValor("0.050"), P.lerValor("0.001"), P.lerValor("1.234"), P.lerValor("0,05"), P.lerValor("00.500")], [null, null, 1234, 0.05, null], "[revisão 12] '0.050' e '0.001' NÃO viram R$ 50 nem R$ 1; '1.234' continua R$ 1.234");
  // 13: os invisíveis que faltavam
  for (const cp of [0x061c, 0x00ad, 0x034f, 0x180e, 0xe0001, 0xe007f]) {
    const ch = String.fromCodePoint(cp);
    verdade(/não é aceito/.test(P.validarPagamentoInformado({ ...bom, nome: `Maria${ch}Souza` }, agora).erro || ""), `[revisão 13] U+${cp.toString(16).toUpperCase()} no nome de quem pagou: recusado`);
    verdade(/não é aceito/.test(A.montarAlteracao({ acao: "cortesia", ativa: true, motivo: `Preletor${ch}`, autorizadoPor: "Pr. João" }, eu).erro || ""), `[revisão 13] U+${cp.toString(16).toUpperCase()} no motivo da cortesia: recusado`);
  }
  eq(P.validarPagamentoInformado({ ...bom, nome: "José Ñandú Çá" }, agora).ok, true, "[revisão 13] acentos, ç e ñ continuam valendo");
});
  await tentar("revisão 3 (registro divergente)", async () => {
  // 3: registro divergente (o 'pago' mudado por fora do painel)
  const conferida = { id: 1, pago: true, pago_conferido_valor: true, pago_conferido_em: "2026-10-22T13:00:00Z", pago_conferido_por_nome: "Maria" };
  eq([IPainel.registroDivergente(conferida).pago, /divergente/.test(IPainel.textoConferencia(conferida))], [false, false], "[revisão 3] pago igual ao registrado: sem aviso");
  eq([IPainel.registroDivergente({ ...conferida, pago: false }).pago, /divergente/.test(IPainel.textoConferencia({ ...conferida, pago: false }))], [true, true], "[revisão 3] desmarcaram o pago FORA do painel: 'registro divergente'");
  verdade(/^Confirmado por Maria/.test(IPainel.textoConferencia({ ...conferida, pago: false })), "[revisão 3] e o texto diz o que foi REGISTRADO (confirmado por Maria), não o valor de agora");
  eq([IPainel.registroDivergente({ id: 2, cortesia: true }).cortesia, IPainel.registroDivergente({ id: 2, cortesia: true, cortesia_em: "x", cortesia_registrada_valor: true }).cortesia, IPainel.registroDivergente({ id: 2, cortesia: false, cortesia_em: "x", cortesia_registrada_valor: true }).cortesia],
    [true, false, true], "[revisão 3] cortesia ligada sem registro, ou tirada por fora: divergente");
  verdade(/divergente/.test(IPainel.textoCortesia({ id: 2, cortesia: true })), "[revisão 3] o texto da cortesia avisa a divergência");
});
  await tentar("revisões 8, 10, 17 e 6 (funções)", async () => {
  // 8: a mesma regra da tela no servidor
  for (const [codigo, motivo] of [["ESPE44", "lista de espera"], ["APRO55", "aguardando aprovação"], ["ZERO66", "sem valor"]]) {
    r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo, telefone: TEL, pagamento: aviso });
    eq(r.status, 409, `[revisão 8] inscrição ${motivo}: 409`);
  }
  for (const [pedidoId, motivo] of [[12, "venda avulsa (balcão)"], [13, "já quitado"], [14, "campanha grátis"]]) {
    r = await chamar("InformarPagamento", { tipo: "pedido", telefone: TEL, pedidoId, pagamento: aviso });
    eq(r.status, 409, `[revisão 8] pedido ${motivo}: 409`);
  }
  // 10: com a chave gravada, só a chave; sem ela, o scrypt ASSÍNCRONO (nunca o scryptSync, que trava o processo)
  r = await chamar("InformarPagamento", { tipo: "inscricao", evento: 9, codigo: "CHAV77", telefone: TEL, pagamento: aviso });
  eq(r.status, 200, "[revisão 10] inscrição com a chave do telefone gravada: confere pela chave (o hash nem é usado)");
  const cripto = require("crypto");
  const scryptSyncOriginal = cripto.scryptSync;
  let chamadasSync = 0;
  cripto.scryptSync = (...a) => { chamadasSync += 1; return scryptSyncOriginal(...a); };
  try {
    r = await chamar("InformarPagamento", { tipo: "pedido", telefone: TEL, pedidoId: 11, pagamento: aviso });
    const r2 = await chamar("InformarPagamento", { tipo: "pedido", telefone: "(11) 90000-0000", pedidoId: 11, pagamento: aviso });
    eq([r.status, r2.status, chamadasSync], [200, 404, 0], "[revisão 10] pedido antigo (sem chave): confere pelo hash com o scrypt assíncrono — nenhum scryptSync");
  } finally {
    cripto.scryptSync = scryptSyncOriginal;
  }
  // 17: tirar cortesia de quem nunca teve
  registro.length = 0;
  r = await chamar("PainelInscricao", { inscricaoId: 2, acao: "cortesia", ativa: false }, tok);
  eq([r.status, registro.some((x) => x.metodo === "PATCH"), banco.inscricoes_eventos[1].cortesia_em ?? null], [409, false, null], "[revisão 17] tirar a cortesia de quem não tem: 409 e nada gravado");
  // 6: o tipo exige o campo
  r = await chamar("PainelInscricao", { inscricaoId: 1, acao: "tipo", tipo: "Equipe" }, { "x-painel-token": "token-parcial" });
  eq(r.status, 403, "[revisão 6] perfil que altera só 'pago' e 'nome' não muda o tipo de participante (403)");

  });
  console.log("== Minha Conta e Meus pedidos devolvem o id e o aviso ==");
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname === "/items/inscricoes_eventos") return resp(200, { data: [{ id: 1, codigo: "ABC234", pago: false, cortesia: false, valor: "50.00", faixa_rotulo: "1º lote", presente: false, aguardando_vaga: false, pendente_aprovacao: false, pagamento_informado_em: "2026-10-21T10:00:00Z", pagamento_informado_valor: "50.00", pagamento_informado_meio: "PIX", evento: { slug: "s", title: "Seminário", event_date: "2026-11-20" } }] });
    if (u.pathname === "/items/camiseta_pedidos") return resp(200, { data: [{ id: 10, telefone: "x", valor_pago: "10.00", avulso: false, separado: false, pagamento_informado_em: "2026-10-21T10:00:00Z", pagamento_informado_valor: "40", grupo: { nome: "Camiseta", valor_venda: 50 } }] });
    if (u.pathname === "/items/camiseta_itens_pedido") return resp(200, { data: [{ id: 1, pedido: 10, tamanho: "M", quantidade: 1, quantidade_retirada: 0 }] });
    return resp(404, {});
  };
  r = await chamar("ConsultarMinhaConta", { token: assinar("maria@x.org") });
  eq([r.body.inscricoes[0].id, r.body.inscricoes[0].faixa, r.body.inscricoes[0].valor, r.body.inscricoes[0].pagamentoInformado.valor], [1, "1º lote", 50, 50], "Minha Conta: inscrição com id, lote, valor e o aviso");
  eq([r.body.pedidos[0].id, r.body.pedidos[0].valorTotal, r.body.pedidos[0].pagamentoInformado.valor], [10, 50, 40], "Minha Conta: pedido com id, total e o aviso");
  eq(JSON.stringify(r.body).includes("telefone"), false, "nada de telefone (nem hash) na resposta");
  r = await chamar("ConsultarPedidosCamiseta", { telefone: TEL });
  eq([r.status, r.body.pedidos[0].id, r.body.pedidos[0].pagamentoInformado.valor], [200, 10, 40], "Meus pedidos: id e o aviso");
  eq(JSON.stringify(r.body).includes('"telefone"'), false, "nada de telefone na resposta");

  console.log(falhas === 0 ? `\nTUDO CERTO (${total} verificações)` : `\n${falhas} FALHA(S) de ${total}`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.log("ERRO NO TESTE:", e && e.stack); process.exit(1); });
