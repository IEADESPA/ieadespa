// e2e-89-transferencia.js — a TRANSFERÊNCIA DE CONGREGAÇÃO como fluxo (FASE 10, v10.1b passo 3, migração 176, 17/11/2026), contra o SQL Server de verdade:
// pela Geral e na mesma área entra na hora; entre áreas o destino (ou a Geral) aceita ou recusa; a própria pessoa pede e cancela o seu; a área acompanha mas não
// pede nem decide; o cadastro (GestaoPessoas) não troca mais a congregação; o dízimo acompanha; a linha do tempo mostra; os avisos; o escopo por nível; e as
// corridas com vários processos node (dois aceites, aceite × cancelamento, dois pedidos). Roda sobre a base cenario-176 (`bash rodar.sh preparar-176` e depois
// `BASE=cenario-176 bash rodar.sh roteiro e2e-89-transferencia.js`); monta o próprio cenário.
process.env.AUTH_SECRET = "segredo-da-transferencia-de-congregacao-" + "x".repeat(24);
const { spawn } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path, LIXO } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E89", CJ: "Cidade Jardim E2E89", BP: "Bairro da Paz E2E89", SEDE: "Sede E2E89", INAT: "Fechada E2E89" };
const tok = {
  geral: () => L.sessao(8901, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  vn: () => L.sessao(8902, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  bp: () => L.sessao(8903, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.BP], permissoes: PERM }),
  sede: () => L.sessao(8904, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.SEDE], permissoes: PERM }),
  area1: () => L.sessao(8905, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: [C.VN, C.CJ], permissoes: PERM }),
  area2: () => L.sessao(8907, { via: "SENHA", fator: fator(), nivel: "AREA", escopoCongregacoes: [C.BP, C.SEDE], permissoes: PERM }),
  extVn: () => L.sessao(8906, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], escopoExtensaoNome: "Tenda E2E89", permissoes: PERM }),
  semPerm: () => L.sessao(8908, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: ["financeiro"] }),
  pin: (id) => L.PIN(id)
};

async function filho() {
  const spec = JSON.parse(process.argv[3]);
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  try {
    const res = await chamarRota(spec.rota, { metodo: "POST", token: tok[spec.quem](), binding: spec.binding || {}, corpo: spec.corpo || {} });
    const b = res.body || {};
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: true, status: res.status, sucesso: b.sucesso, situacao: b.situacao, mensagem: b.mensagem }) + "\n");
  } catch (e) {
    process.stdout.write("@@RESULTADO@@" + JSON.stringify({ ok: false, erro: e && e.message }) + "\n");
  }
  L.shimEncerrar();
}
async function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const T = (quem, { id, acao, metodo = "POST", corpo, query } = {}) => chamarRota("GestaoTransferencias/index.js", { metodo, token: typeof quem === "string" ? tok[quem]() : quem,
    binding: { ...(id != null ? { id: String(id) } : {}), ...(acao ? { acao } : {}) }, corpo: corpo || {}, query: query || {} });
  const pedir = (quem, membroId, destino, motivo) => T(quem, { corpo: { membroId, congregacaoDestinoId: destino, motivo } });
  const minha = (membroId, { metodo = "GET", acao, corpo } = {}) => chamarRota("MinhaTransferencia/index.js", { metodo, token: tok.pin(membroId),
    binding: { matricula: String(membroId), ...(acao ? { acao } : {}) }, corpo: corpo || {} });
  const congDe = async (id) => escalar("SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @id", { id });
  const situacaoDe = async (id) => escalar("SELECT Situacao FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id });

  console.log("== a migração 176 (aplicada duas vezes no preparo) ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = 'TransferenciasCongregacao'") === 1, "a tabela TransferenciasCongregacao");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_Transferencias_PendentePorMembro' AND is_unique = 1 AND has_filter = 1") === 1, "o índice único do pedido pendente por pessoa");
  ok(await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave IN ('TRANSFERENCIA_PARA_ACEITAR','TRANSFERENCIA_RECUSADA','TRANSFERENCIA_CONCLUIDA')") === 3, "as 3 regras de aviso, sem repetir");

  console.log("== o cenário: duas áreas, cinco congregações, as secretarias e as pessoas ==");
  const a1 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área T1 E2E89'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const a2 = (await q("INSERT INTO Areas (Nome) VALUES (N'Área T2 E2E89'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = async (nome, area, ativa = 1) => (await q("INSERT INTO Congregacoes (Nome, AreaId, Ativa) VALUES (@n, @a, @at); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area, at: ativa }))[0].id;
  const VN = await cong(C.VN, a1), CJ = await cong(C.CJ, a1), BP = await cong(C.BP, a2), SEDE = await cong(C.SEDE, a2), INAT = await cong(C.INAT, a1, 0);
  const ext = (await q("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId) VALUES (N'Tenda E2E89', @c); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { c: VN }))[0].id;
  const pessoa = async (id, nome, c, extra = {}) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, ExtensaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, FormaAdmissao)
      VALUES (@id, @n, @c, @x, @st, 'EM_COMUNHAO', '1990-01-01', '2015-04-12', 'BATISMO')`, { id, n: nome, c, x: extra.ext || null, st: extra.status || "ATIVO" });
  for (const [id, nome] of [[8901, "Geral E2E89"], [8902, "Sec VN E2E89"], [8903, "Sec BP E2E89"], [8904, "Sec Sede E2E89"], [8905, "Area1 E2E89"], [8906, "Ext E2E89"], [8907, "Area2 E2E89"], [8908, "SemPerm E2E89"]]) await pessoa(id, nome, VN);
  for (let i = 1; i <= 20; i++) await pessoa(890000 + i, `Pessoa ${String(i).padStart(2, "0")} E2E89`, i === 20 ? null : VN, { ext: i === 3 ? ext : null });
  await pessoa(890030, "Desligada E2E89", VN, { status: "DESLIGADO" });
  await pessoa(890021, "Pessoa da Tenda E2E89", VN, { ext });
  await q("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId, Ativo) VALUES (@c, N'Pessoa 01 E2E89', 890001, 1)", { c: VN });
  const papelSec = (await q("INSERT INTO Papeis (Nome, Nivel, Permissoes) VALUES (N'Secretaria Local E2E89', 'CONGREGACAO', 'pessoas'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) VALUES (8903, @p, 'CONGREGACAO', @c)", { p: papelSec, c: BP });
  ok(true, "cenário montado");

  console.log("== pela Geral: entra na hora, mesmo entre áreas (e o dízimo e a Extensão acompanham) ==");
  let r = await pedir("geral", 890001, BP, "mudou de bairro");
  ok(r.body && r.body.sucesso && r.body.situacao === "CONCLUIDA" && r.body.regra === "GERAL", "a Geral pede: CONCLUIDA na hora, regra GERAL", JSON.stringify(r.body));
  ok(await congDe(890001) === BP, "a ficha passou para o destino");
  ok(await escalar("SELECT CongregacaoId FROM Dizimistas WHERE MembroId = 890001 AND Ativo = 1") === BP, "o dízimo ativo passou para a tesouraria do destino");
  ok(await escalar("SELECT DecididoComo FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: r.body.transferenciaId }) === "GERAL", "decidido como GERAL");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = 890001 AND Acao = N'Transferiu de congregação'") === 1, "a trilha registra a mudança da ficha");
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'TRANSFERENCIA_CONCLUIDA' AND DestinatarioMembroId = 890001") === 1, "a pessoa recebe o aviso da conclusão");
  r = await pedir("geral", 890003, SEDE);
  ok(r.body && r.body.situacao === "CONCLUIDA" && await escalar("SELECT ExtensaoId FROM MembroReferencia WHERE MembroId = 890003") === null, "quem estava numa Extensão sai dela ao mudar de congregação");

  console.log("== pela origem, na MESMA ÁREA: entra na hora ==");
  r = await pedir("vn", 890002, CJ);
  ok(r.body && r.body.situacao === "CONCLUIDA" && r.body.regra === "MESMA_AREA", "Vila Nova → Cidade Jardim (mesma área): CONCLUIDA na hora", JSON.stringify(r.body));
  ok(await congDe(890002) === CJ && await escalar("SELECT DecididoComo FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: r.body.transferenciaId }) === "AUTOMATICO", "ficha no destino, decidido AUTOMATICO");

  console.log("== pela origem, ENTRE ÁREAS: o destino aceita ou recusa ==");
  r = await pedir("vn", 890004, BP, "trabalho novo");
  const t1 = r.body && r.body.transferenciaId;
  ok(r.body && r.body.situacao === "PENDENTE" && r.body.regra === "ENTRE_AREAS", "Vila Nova → Bairro da Paz: PENDENTE", JSON.stringify(r.body));
  ok(await congDe(890004) === VN, "a ficha continua na origem até o destino aceitar");
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'TRANSFERENCIA_PARA_ACEITAR' AND DestinatarioMembroId = 8903 AND ReferenciaId = @id", { id: t1 }) === 1, "a secretaria do destino recebe o aviso para aceitar");
  r = await pedir("vn", 890004, SEDE);
  ok(r.status === 409 && /já há um pedido/i.test(r.body.mensagem), "um segundo pedido para a mesma pessoa: 409 (já há um em andamento)", JSON.stringify(r.body));
  r = await T("vn", { id: t1, acao: "aceitar" });
  ok(r.status === 403, "a origem não aceita (só o destino ou a Geral)", JSON.stringify(r.body));
  r = await T("area1", { id: t1, acao: "aceitar" });
  ok(r.status === 403, "a área acompanha, mas não aceita", JSON.stringify(r.body));
  r = await T("bp", { metodo: "GET", query: { caixa: "chegando" } });
  const chegando = (r.body.itens || []).find((x) => x.transferenciaId === t1);
  ok(!!chegando && chegando.podeDecidir === true && chegando.podeCancelar === false, "o destino vê o pedido em 'chegando', com aceitar/recusar e sem cancelar", JSON.stringify(chegando));
  r = await T("vn", { metodo: "GET", query: { caixa: "saindo" } });
  const saindo = (r.body.itens || []).find((x) => x.transferenciaId === t1);
  ok(!!saindo && saindo.podeDecidir === false && saindo.podeCancelar === true, "a origem vê em 'saindo', pode cancelar e não decide");
  r = await T("area1", { metodo: "GET" });
  ok((r.body.itens || []).some((x) => x.transferenciaId === t1), "a área de origem acompanha o pedido");
  r = await T("area2", { metodo: "GET" });
  ok((r.body.itens || []).some((x) => x.transferenciaId === t1), "a área de destino também acompanha");
  r = await T("bp", { id: t1, acao: "recusar", corpo: { motivo: " " } });
  ok(r.body && r.body.sucesso === false && /motivo/i.test(r.body.mensagem), "recusar sem motivo: pede o motivo", JSON.stringify(r.body));
  r = await T("bp", { id: t1, acao: "recusar", corpo: { motivo: "a pessoa ainda não se apresentou aqui" } });
  ok(r.body && r.body.sucesso && r.body.situacao === "RECUSADA", "o destino recusa com motivo", JSON.stringify(r.body));
  ok(await congDe(890004) === VN, "recusado: a ficha fica na origem");
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'TRANSFERENCIA_RECUSADA' AND DestinatarioMembroId = 8902 AND ReferenciaId = @id", { id: t1 }) === 1, "quem pediu (a origem) recebe o aviso da recusa");
  r = await T("vn", { id: t1, metodo: "GET" });
  ok(r.body && r.body.transferencia && r.body.transferencia.motivoRecusa === "a pessoa ainda não se apresentou aqui", "a origem lê o motivo da recusa");
  r = await T("bp", { id: t1, acao: "aceitar" });
  ok(r.status === 409, "aceitar um pedido já recusado: 409");
  r = await pedir("vn", 890004, BP);
  const t2 = r.body && r.body.transferenciaId;
  ok(r.body && r.body.situacao === "PENDENTE", "depois da recusa, um pedido novo pode ser feito");
  r = await T("bp", { id: t2, acao: "aceitar" });
  ok(r.body && r.body.sucesso && r.body.situacao === "CONCLUIDA" && await congDe(890004) === BP, "o destino aceita: a ficha passa para o destino", JSON.stringify(r.body));
  ok(await escalar("SELECT DecididoComo FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: t2 }) === "DESTINO", "decidido como DESTINO");
  ok(await escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = 'TRANSFERENCIA_CONCLUIDA' AND DestinatarioMembroId = 890004") === 1, "a pessoa recebe o aviso da conclusão");

  console.log("== a Geral decide a qualquer hora, e a caixa dos parados (7 dias) é só dela ==");
  r = await pedir("vn", 890005, SEDE);
  const t3 = r.body.transferenciaId;
  await q("UPDATE TransferenciasCongregacao SET PedidoEm = DATEADD(DAY, -8, SYSUTCDATETIME()) WHERE TransferenciaId = @id", { id: t3 });
  r = await T("geral", { metodo: "GET", query: { caixa: "paradas" } });
  const parado = (r.body.itens || []).find((x) => x.transferenciaId === t3);
  ok(!!parado && parado.diasParado >= 8 && parado.podeDecidir === true, "a Geral vê o pedido parado há 8 dias e pode decidir", JSON.stringify(parado));
  r = await T("vn", { metodo: "GET", query: { caixa: "paradas" } });
  ok(r.status === 403, "a caixa dos parados não abre para a congregação");
  r = await T("geral", { id: t3, acao: "aceitar" });
  ok(r.body && r.body.situacao === "CONCLUIDA" && await congDe(890005) === SEDE && await escalar("SELECT DecididoComo FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: t3 }) === "GERAL", "a Geral aceita no lugar do destino");

  console.log("== cancelar: quem pediu, a origem ou a Geral; o destino não ==");
  r = await pedir("vn", 890006, BP);
  const t4 = r.body.transferenciaId;
  r = await T("bp", { id: t4, acao: "cancelar" });
  ok(r.status === 403, "o destino não cancela (ele recusa)");
  r = await T("vn", { id: t4, acao: "cancelar" });
  ok(r.body && r.body.situacao === "CANCELADA" && await congDe(890006) === VN, "a origem cancela; a ficha fica");
  r = await pedir("vn", 890007, BP);
  r = await T("geral", { id: r.body.transferenciaId, acao: "cancelar" });
  ok(r.body && r.body.situacao === "CANCELADA", "a Geral cancela");

  console.log("== a própria pessoa pede (e só ela cancela o que pediu) ==");
  r = await minha(890008, { metodo: "POST", corpo: { congregacaoDestinoId: BP, motivo: "vou morar perto" } });
  const t5 = r.body && r.body.transferenciaId;
  ok(r.body && r.body.sucesso && r.body.situacao === "PENDENTE", "a pessoa pede a sua (entre áreas): PENDENTE", JSON.stringify(r.body));
  ok(await escalar("SELECT PedidoComo FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: t5 }) === "PROPRIO", "pedido como PROPRIO");
  r = await minha(890008);
  const meu = r.body && (r.body.pedidos || []).find((x) => x.transferenciaId === t5);
  ok(!!meu && meu.pedidoPorVoce === true && meu.podeCancelar === true && !("pedidoPorNome" in meu), "a pessoa vê o seu pedido (sem nomes de quem pediu/decidiu)", JSON.stringify(meu));
  ok(Array.isArray(r.body.congregacoes) && !r.body.congregacoes.some((c) => c.nome === C.INAT), "a lista de destinos só tem congregações ativas");
  r = await minha(890008, { metodo: "POST", acao: "cancelar", corpo: { transferenciaId: t5 } });
  ok(r.body && r.body.situacao === "CANCELADA", "a pessoa cancela o que ela pediu", JSON.stringify(r.body));
  r = await pedir("vn", 890009, BP);
  const t6 = r.body.transferenciaId;
  r = await minha(890009, { metodo: "POST", acao: "cancelar", corpo: { transferenciaId: t6 } });
  ok(r.status === 403 && await situacaoDe(t6) === "PENDENTE", "a pessoa não cancela o pedido feito pela origem");
  r = await minha(890010, { metodo: "POST", acao: "cancelar", corpo: { transferenciaId: t6 } });
  ok(r.body && r.body.sucesso === false && await situacaoDe(t6) === "PENDENTE", "nem o pedido de outra pessoa (não existe para ela)");
  r = await minha(890011, { metodo: "POST", corpo: { congregacaoDestinoId: CJ } });
  ok(r.body && r.body.situacao === "CONCLUIDA" && await congDe(890011) === CJ, "a pessoa pede para a mesma área: entra na hora");
  r = await chamarRota("MinhaTransferencia/index.js", { metodo: "GET", token: tok.pin(890012), binding: { matricula: "890013" } });
  ok(r.status === 403, "uma pessoa não vê a transferência de outra (só a própria matrícula)");

  console.log("== o que é recusado: destino inválido, mesma congregação, quem saiu, sem congregação, quem não pode pedir ==");
  r = await pedir("geral", 890012, INAT);
  ok(r.body && r.body.sucesso === false && /ativa/i.test(r.body.mensagem), "destino fechado (inativo): recusado");
  r = await pedir("geral", 890012, VN);
  ok(r.body && r.body.sucesso === false && /mesma/i.test(r.body.mensagem), "destino igual à congregação de hoje: recusado");
  r = await pedir("geral", 890030, BP);
  ok(r.body && r.body.sucesso === false && /saiu do rol/i.test(r.body.mensagem), "quem já saiu do rol: recusado");
  r = await pedir("geral", 890020, BP);
  ok(r.body && r.body.sucesso === false && /não tem congregação/i.test(r.body.mensagem), "ficha sem congregação: recusado (a Secretaria acerta o cadastro)");
  r = await pedir("area1", 890012, BP);
  ok(r.status === 403 && /origem/i.test(r.body.mensagem), "a área não pede (403, com quem pede)", JSON.stringify(r.body));
  r = await pedir("extVn", 890021, BP);
  ok(r.status === 403 && await congDe(890021) === VN, "o escopo de uma Extensão não pede, nem para quem está na Extensão (a transferência é da congregação)", JSON.stringify(r.body));
  r = await pedir("extVn", 890012, BP);
  ok(r.body && r.body.sucesso === false && /não encontrada/i.test(r.body.mensagem), "quem está fora da Extensão nem existe para ela");
  r = await pedir("sede", 890012, BP);
  ok(r.body && r.body.sucesso === false && /não encontrada/i.test(r.body.mensagem), "a congregação de fora: a pessoa 'não existe' para ela");
  r = await pedir("semPerm", 890012, BP);
  ok(r.status === 403, "sem a permissão de pessoas: 403");

  console.log("== o escopo: quem não alcança nem vê o pedido ==");
  r = await pedir("vn", 890012, BP);
  const t7 = r.body.transferenciaId;
  r = await T("sede", { id: t7, metodo: "GET" });
  ok(r.body && r.body.sucesso === false, "a congregação de fora não vê o pedido (não existe)");
  r = await T("sede", { metodo: "GET" });
  ok(!(r.body.itens || []).some((x) => x.transferenciaId === t7), "nem na lista dela");
  r = await T("sede", { id: t7, acao: "aceitar" });
  ok(r.body && r.body.sucesso === false && await situacaoDe(t7) === "PENDENTE", "nem consegue aceitar");
  r = await T("extVn", { metodo: "GET" });
  ok(!(r.body.itens || []).length, "quem só alcança a Extensão não vê os pedidos da congregação inteira", JSON.stringify(r.body).slice(0, 200));
  r = await T("extVn", { id: t7, metodo: "GET" });
  ok(r.body && r.body.sucesso === false, "nem abre um pedido da congregação pelo número");

  console.log("== o cadastro não troca mais a congregação (só a transferência) ==");
  const salvarPessoa = (corpo) => chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: tok.geral(), corpo });
  r = await salvarPessoa({ membroId: 890013, nome: "Pessoa 13 E2E89", congregacaoId: BP, status: "ATIVO" });
  ok(r.status === 409 && r.body.transferencia === true && await congDe(890013) === VN, "trocar a congregação pelo cadastro: 409 com o caminho da transferência", JSON.stringify(r.body));
  r = await salvarPessoa({ membroId: 890013, nome: "Pessoa Treze E2E89", congregacaoId: VN, status: "ATIVO", situacaoMembro: "EM_COMUNHAO" });
  ok(r.body && r.body.sucesso !== false && await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 890013") === "Pessoa Treze E2E89", "salvar com a mesma congregação segue normal", JSON.stringify(r.body).slice(0, 200));
  r = await salvarPessoa({ membroId: 890020, nome: "Pessoa 20 E2E89", congregacaoId: SEDE, status: "ATIVO", situacaoMembro: "EM_COMUNHAO" });
  ok(r.body && r.body.sucesso !== false && await congDe(890020) === SEDE, "a ficha sem congregação recebe a primeira pelo cadastro");

  console.log("== a linha do tempo mostra a transferência ==");
  r = await chamarRota("LinhaDoTempoMembro/index.js", { metodo: "GET", token: tok.geral(), binding: { membroId: "890004" } });
  const ev = (r.body.eventos || []).filter((e) => e.tipo === "TRANSFERENCIA");
  ok(ev.length === 1 && ev[0].titulo === `Transferência: ${C.VN} → ${C.BP}` && /destino/.test(ev[0].detalhe), "a linha do tempo da secretaria: 'Transferência: Vila Nova → Bairro da Paz' (aceita pelo destino)", JSON.stringify(ev));
  r = await chamarRota("MinhaLinhaDoTempo/index.js", { metodo: "GET", token: tok.pin(890004), binding: { matricula: "890004" } });
  ok((r.body.eventos || []).some((e) => e.tipo === "TRANSFERENCIA"), "a própria pessoa vê a sua transferência na linha do tempo");
  r = await chamarRota("LinhaDoTempoMembro/index.js", { metodo: "GET", token: tok.geral(), binding: { membroId: "890006" } });
  ok(!(r.body.eventos || []).some((e) => e.tipo === "TRANSFERENCIA"), "pedido cancelado não entra na linha do tempo");

  console.log("== corridas com vários processos ==");
  r = await pedir("vn", 890014, BP);
  const c1 = r.body.transferenciaId;
  let res = await disparar([{ rota: "GestaoTransferencias/index.js", quem: "bp", binding: { id: String(c1), acao: "aceitar" } }, { rota: "GestaoTransferencias/index.js", quem: "geral", binding: { id: String(c1), acao: "aceitar" } }]);
  ok(res.every((x) => x.ok) && res.filter((x) => x.sucesso === true).length === 1 && res.filter((x) => x.status === 409).length === 1, "dois aceites ao mesmo tempo: um passa, o outro 409", JSON.stringify(res));
  ok(await congDe(890014) === BP && await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = 'MembroReferencia' AND RegistroId = 890014 AND Acao = N'Transferiu de congregação'") === 1, "a ficha mudou uma vez só");
  r = await pedir("vn", 890015, BP);
  const c2 = r.body.transferenciaId;
  res = await disparar([{ rota: "GestaoTransferencias/index.js", quem: "bp", binding: { id: String(c2), acao: "aceitar" } }, { rota: "GestaoTransferencias/index.js", quem: "vn", binding: { id: String(c2), acao: "cancelar" } }]);
  const sit = await situacaoDe(c2);
  ok(res.every((x) => x.ok) && res.filter((x) => x.sucesso === true).length === 1 && ((sit === "CONCLUIDA" && await congDe(890015) === BP) || (sit === "CANCELADA" && await congDe(890015) === VN)),
    `aceite × cancelamento ao mesmo tempo: um vence e o estado fecha (${sit})`, JSON.stringify(res));
  res = await disparar([1, 2, 3, 4].map((i) => ({ rota: "GestaoTransferencias/index.js", quem: "vn", corpo: { membroId: 890016, congregacaoDestinoId: i % 2 ? BP : SEDE } })));
  ok(res.every((x) => x.ok && x.status !== 500) && res.filter((x) => x.sucesso === true).length === 1 && await escalar("SELECT COUNT(*) FROM TransferenciasCongregacao WHERE MembroId = 890016 AND Situacao = 'PENDENTE'") === 1,
    "quatro pedidos ao mesmo tempo para a mesma pessoa: um fica, os outros recebem 'já há um pedido'", JSON.stringify(res));
  res = await disparar([1, 2, 3].map(() => ({ rota: "GestaoTransferencias/index.js", quem: "vn", corpo: { membroId: 890017, congregacaoDestinoId: CJ } })));
  ok(res.every((x) => x.ok && x.status !== 500) && await congDe(890017) === CJ && await escalar("SELECT COUNT(*) FROM TransferenciasCongregacao WHERE MembroId = 890017 AND Situacao = 'CONCLUIDA'") === 1,
    "três transferências na hora ao mesmo tempo (mesma área): uma só acontece, sem erro", JSON.stringify(res));

  console.log("== lixo nos campos: nunca 500, e recusado não grava ==");
  let quebras = 0, gravou = 0;
  for (const campo of ["membroId", "congregacaoDestinoId", "motivo"]) for (const lixo of LIXO) {
    const antes = await escalar("SELECT COUNT(*) FROM TransferenciasCongregacao");
    const corpo = { membroId: 890018, congregacaoDestinoId: BP, motivo: "teste" };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const x = await T("vn", { corpo });
    if (x.status === 500) quebras++;
    const depois = await escalar("SELECT COUNT(*) FROM TransferenciasCongregacao");
    if (depois !== antes) { gravou++; await q("DELETE FROM TransferenciasCongregacao WHERE MembroId = 890018"); }
    if (campo !== "motivo" && depois !== antes && !(campo === "membroId" && lixo === 890018)) quebras++;
  }
  ok(quebras === 0, `pedido com lixo (${LIXO.length * 3} chamadas): nenhuma 500 nem gravação com matrícula/destino inválidos`);
  for (const acao of ["aceitar", "recusar", "cancelar", "lixo"]) for (const id of ["0", "-1", "abc", "99999999", "1.5"]) {
    const x = await T("geral", { id, acao, corpo: { motivo: "x" } });
    if (x.status === 500) quebras++;
  }
  ok(quebras === 0, "ações com id de lixo: nunca 500");
  const motivoLongo = await pedir("vn", 890019, BP, "y".repeat(5000));
  ok(motivoLongo.body.sucesso && (await escalar("SELECT LEN(Motivo) FROM TransferenciasCongregacao WHERE TransferenciaId = @id", { id: motivoLongo.body.transferenciaId })) === 500, "o motivo longo é cortado em 500 letras");
  const html = JSON.stringify((await T("vn", { metodo: "GET" })).body);
  ok(!/SELECT |INSERT |UPDATE |mssql|tedious|node_modules/.test(html), "as respostas não vazam texto interno");

  fim("e2e-89 (transferência de congregação)");
  L.shimEncerrar();
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.log("ERRO", e.message, e.stack); fim("e2e-89 (abortado)"); L.shimEncerrar(); });
