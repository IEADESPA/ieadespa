// fixtures.js — o SERVIDOR imitado da v7.11 (Cuidado pastoral), com estado (o que a tela grava fica gravado e volta na próxima leitura).
// O que roda aqui é o código DE VERDADE do servidor, inteiro:
//   - o HANDLER (api/GestaoCuidadoPastoral/index.js) é carregado com um `require` trocado: roteamento, métodos, 400/403/404/409/422/428/429, "Cache-Control", a montagem do
//     catálogo e a visão da permissão são os dele;
//   - o login usa o auth.js de verdade (visaoDaPermissao, restringirVisao, concessoesDaVisao, estaNoEscopo, RANKING_NIVEL, ehSessaoDeLideranca) e o escopoRotas.js de verdade; só o
//     exigirLogin (o token vira a sessão do cenário) e o exigirFatorRecente (a confirmação reforçada da vD.4) são imitados;
//   - a CAMADA DE BANCO (api/shared/cuidadoPastoralDb.js) roda INTEIRA — leituras e gravações, com as regras de api/shared/cuidadoPastoral.js — contra um banco falso que responde
//     a cada consulta dela (rotear). A consulta que o banco falso não conhece é erro alto ("consulta sem imitação"): se o servidor mudar, a prova acusa em vez de passar em falso.
//     Só as dependências de fora do módulo são trocadas: a auditoria, os avisos (notificarAgora), os prazos de Catálogos (lerPrazoDias → padrão), a trava, o território
//     (ancestraisTerritoriais) e a aptidão para menores.
// `contratoComOServidor()` confere por escrito o que a tela lê e manda contra o handler e as regras.
"use strict";
const fs = require("fs");
const path = require("path");
const API = path.resolve(__dirname, "../../api");
const SHARED = path.join(API, "shared");
const cpReal = require(path.join(SHARED, "cuidadoPastoral"));
const vol = require(path.join(SHARED, "voluntariado"));
const authReal = require(path.join(SHARED, "auth"));
const escopoRotas = require(path.join(SHARED, "escopoRotas"));
const { hojeBrasilia } = require(path.join(SHARED, "dataBrasilia"));
const parser = require(path.join(API, "node_modules/@babel/parser"));
const DB_SRC = fs.readFileSync(path.join(SHARED, "cuidadoPastoralDb.js"), "utf8");
const HANDLER_SRC = fs.readFileSync(path.join(API, "GestaoCuidadoPastoral/index.js"), "utf8");
const CP_SRC = fs.readFileSync(path.join(SHARED, "cuidadoPastoral.js"), "utf8");
const AUTH_SRC = fs.readFileSync(path.join(SHARED, "auth.js"), "utf8");
const MODULO_SRC = fs.readFileSync(path.resolve(__dirname, "../../app/modulos/cuidado-pastoral.js"), "utf8");

const HORA = 3600000, DIA = 24 * HORA;
// texto de ataque: sai do atributo (aspas), sai da tag (>) e abre uma imagem quebrada com onerror; o nome do campo identifica quem vazou
const ATAQUE = (campo) => `"'><img src=x onerror="window.__xss('${campo}')"><svg onload=window.__xss('${campo}')>[${campo}]`;

// extrai declarações de nível superior de um código (para ler constantes da tela no contrato)
function extrairDeCodigo(codigo, nomes, escopo) {
  const ast = parser.parse(codigo, { sourceType: "script", errorRecovery: false });
  const partes = new Map();
  for (const n of ast.program.body) {
    if (n.type === "FunctionDeclaration" && nomes.includes(n.id.name)) partes.set(n.id.name, codigo.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id.type === "Identifier" && nomes.includes(d.id.name)) partes.set(d.id.name, codigo.slice(n.start, n.end));
  }
  const falta = nomes.filter(x => !partes.has(x));
  if (falta.length) throw new Error(`extrairDeCodigo: não achei ${falta.join(", ")}`);
  const corpo = nomes.map(x => partes.get(x)).join("\n") + `\nreturn { ${nomes.join(", ")} };`;
  return new Function(...Object.keys(escopo), corpo)(...Object.values(escopo));
}

// a cópia das regras com texto de ataque em todo rótulo e descrição que vai para a tela (catálogo, tipo, origem, degrau, nível da nota, categoria, telefones, texto do prazo)
function cpComAtaque() {
  const c = Object.assign({}, cpReal);
  const rot = (obj, campo) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "object" ? Object.assign({}, v, { rotulo: `${v.rotulo} ${ATAQUE(`${campo}-${k}`)}` }, v.descricao ? { descricao: `${v.descricao} ${ATAQUE(`${campo}-desc-${k}`)}` } : {}) : `${v} ${ATAQUE(`${campo}-${k}`)}`]));
  c.TIPOS = rot(cpReal.TIPOS, "tipo"); c.ORIGENS = rot(cpReal.ORIGENS, "origem"); c.FORMAS_CONTATO = rot(cpReal.FORMAS_CONTATO, "forma"); c.DESFECHOS_CONCLUSAO = rot(cpReal.DESFECHOS_CONCLUSAO, "desfecho");
  c.DESFECHOS_CANCELAMENTO = rot(cpReal.DESFECHOS_CANCELAMENTO, "cancel"); c.DEGRAUS = rot(cpReal.DEGRAUS, "degrau"); c.NIVEIS_NOTA = rot(cpReal.NIVEIS_NOTA, "nivel");
  c.CATEGORIAS_ORACAO = rot(cpReal.CATEGORIAS_ORACAO, "categoria"); c.PARA_QUEM = rot(cpReal.PARA_QUEM, "paraquem");
  c.CONTATOS_DE_AJUDA = cpReal.CONTATOS_DE_AJUDA.map((x, i) => ({ nome: `${x.nome} ${ATAQUE(`ajudaNome${i}`)}`, numero: `${x.numero}${ATAQUE(`ajudaNumero${i}`)}`, descricao: `${x.descricao} ${ATAQUE(`ajudaDesc${i}`)}` }));
  c.situacaoDoPrazo = (p, a) => { const s = cpReal.situacaoDoPrazo(p, a); return Object.assign({}, s, s.texto ? { texto: `${s.texto} ${ATAQUE("prazo")}` } : {}); };
  return c;
}

// ============================================================================
// O servidor (um por cenário): estado + banco falso + handler e camada de banco de verdade
// ============================================================================
function criarServidor({ ataque = false, agoraMs = Date.now() } = {}) {
  const cp = ataque ? cpComAtaque() : cpReal;
  const A = (campo, base) => (ataque ? `${base} ${ATAQUE(campo)}` : base);
  const S = {
    agoraMs, ataque, cp, avisoExterno: true, erros: [], auditoria: [], avisos: [], chamadas: [],
    congregacoes: [{ id: 1, nome: A("congNome1", "Central"), ativa: true, areaId: 100, regiaoId: 200 }, { id: 2, nome: A("congNome2", "Vila Nova"), ativa: true, areaId: 100, regiaoId: 200 },
      { id: 3, nome: A("congNome3", "Fora do Território"), ativa: true, areaId: 101, regiaoId: 200 }],
    membros: new Map(), itens: [], eventos: [], notas: [], leituras: [], pedidos: [],
    lideranca: [], sessoes: {},
    // (Trava 7-C) quem tem pendência reservada à Diretoria (a aptidão do ministério com menores) e quem é envolvido de incidente de proteção aberto
    bloqueados: new Set(), envolvidos: new Set(),
    seq: { item: 100, evento: 1000, nota: 500, pedido: 700, leitura: 1 }
  };
  const congDe = (id) => S.congregacoes.find(c => c.id === Number(id)) || null;
  const membro = (o) => {
    const m = { MembroId: o.id, Nome: o.nome, Telefone: o.telefone === undefined ? `(91) 9${String(o.id).padStart(4, "0")}-1234` : o.telefone, Email: o.email === undefined ? `m${o.id}@exemplo.org` : o.email,
      DataNascimento: o.nascimento || "1980-05-10", CongregacaoId: o.congregacaoId || 1, Status: o.status || "ATIVO", CargoMinisterial: o.cargo || null };
    S.membros.set(o.id, m);
    return m;
  };
  // gente de sempre: o Dirigente da Central (10, pastor), o Dirigente da Vila Nova (11), a Pastora de Área (12), o Presidente (13), um diácono (30), a irmã do círculo (31),
  // uma adolescente (40), membros acompanhados (50..52) e uma irmã que pede oração (60)
  membro({ id: 10, nome: A("nome10", "Pr. Paulo Dirigente"), cargo: "PASTOR" });
  membro({ id: 11, nome: A("nome11", "Ev. Marcos Vila"), congregacaoId: 2 });
  membro({ id: 12, nome: A("nome12", "Pra. Lídia Área"), cargo: "PASTOR", congregacaoId: 2 });
  membro({ id: 13, nome: A("nome13", "Diretor Geral Silas"), cargo: "PRESBITERO" });
  membro({ id: 30, nome: A("nome30", "Diác. João Voluntário") });
  membro({ id: 31, nome: A("nome31", "Irmã Rute Círculo") });
  membro({ id: 40, nome: A("nome40", "Joana Adolescente"), nascimento: "2012-03-01" });
  membro({ id: 50, nome: A("nome50", "Maria Afastada"), telefone: A("tel50", "(91) 98888-7777") });
  membro({ id: 51, nome: A("nome51", "José Internado") });
  membro({ id: 52, nome: A("nome52", "Joaquim Menor"), nascimento: "2014-08-20" });
  membro({ id: 60, nome: A("nome60", "Ana Pedinte") });
  // a Lideranca (o que liderancaDoTerritorio e dirigenteDa leem)
  S.lideranca = [
    { liderancaId: 1, membroId: 10, papel: "Dirigente de Congregação", escopoTipo: "CONGREGACAO", escopoId: 1, permissoes: "cuidado_pastoral,pessoas" },
    { liderancaId: 2, membroId: 11, papel: "Dirigente de Congregação", escopoTipo: "CONGREGACAO", escopoId: 2, permissoes: "pessoas" },
    { liderancaId: 3, membroId: 12, papel: "Pastor de Área", escopoTipo: "AREA", escopoId: 100, permissoes: "cuidado_pastoral" },
    { liderancaId: 4, membroId: 13, papel: "Presidente", escopoTipo: "GLOBAL", escopoId: null, permissoes: "cuidado_pastoral" }
  ];
  // as sessões no formato do token de verdade (concessões), lidas pelo auth.js de verdade
  const nomesDe = (ids) => ids.map(id => congDe(id).nome);
  const concessao = (nivel, permissoes, congs) => ({ origem: "PROPRIA", nivel, permissoes, escopoCongregacoes: congs === "TODAS" ? "TODAS" : nomesDe(congs), escopoExtensaoNome: null, departamentoId: null });
  const lideranca = (membroId, ...concessoes) => ({ membroId, via: "SENHA", concessoes, fator: false });
  const pin = (membroId) => ({ membroId, via: "PIN", fator: false });
  S.sessoes = {
    lid: lideranca(10, concessao("CONGREGACAO", ["cuidado_pastoral", "pessoas"], [1])),
    area: lideranca(12, concessao("AREA", ["cuidado_pastoral"], [1, 2])),
    geral: lideranca(13, concessao("GLOBAL", ["cuidado_pastoral"], "TODAS")),
    semperm: lideranca(11, concessao("CONGREGACAO", ["pessoas"], [2])),
    pin30: pin(30), pin31: pin(31), pin60: pin(60), pin50: pin(50)
  };

  // ---- dados iniciais (o mesmo formato das linhas de CuidadoItens, CuidadoEventos, NotasPastorais e PedidosOracao) ----
  const novoEvento = (o) => { const e = Object.assign({ EventoId: ++S.seq.evento, Em: new Date(S.agoraMs), MembroId: null, Forma: null, Conseguiu: null, Acompanhante: null, Observacao: null, NivelDe: null, NivelPara: null, PrazoNovo: null, ResponsavelMembroId: null }, o); S.eventos.push(e); return e; };
  const novoItem = (o) => {
    const it = {
      ItemId: o.id || ++S.seq.item, Tipo: o.tipo || "VISITANTE", CongregacaoId: o.congregacaoId || 1, MembroId: o.membroId || null, PessoaNome: o.membroId ? null : (o.pessoaNome || null),
      PessoaContato: o.membroId ? null : (o.pessoaContato || null), Motivo: o.motivo === undefined ? null : o.motivo, Origem: o.origem || "LIDERANCA", PedidoOracaoId: o.pedidoOracaoId || null,
      Urgente: !!o.urgente, SoNivelGeral: !!o.soNivelGeral, DeteccaoResumo: o.deteccaoResumo || null, ResponsavelMembroId: o.responsavel === undefined ? 10 : o.responsavel,
      PrazoEm: new Date(S.agoraMs + (o.prazoH === undefined ? 30 : o.prazoH) * HORA), Nivel: o.nivel || "CONGREGACAO", Escalonamentos: 0, LembretesGerais: 0, Status: o.status || "ABERTO",
      Desfecho: o.desfecho || null, EncerradoEm: o.status && o.status !== "ABERTO" ? new Date(S.agoraMs - DIA) : null, PrimeiroContatoEm: null,
      CriadoEm: new Date(S.agoraMs - (o.criadoH === undefined ? 20 : o.criadoH) * HORA), CriadoPorMembroId: o.criadoPor === undefined ? 10 : o.criadoPor, AnonimizadoEm: null
    };
    S.itens.push(it);
    if (o.eventos !== false) novoEvento({ ItemId: it.ItemId, Tipo: "CRIADO", MembroId: it.CriadoPorMembroId, Em: it.CriadoEm, PrazoNovo: it.PrazoEm });
    return it;
  };
  const novaNota = (o) => { const n = { NotaId: o.id || ++S.seq.nota, MembroId: o.membroId || null, ItemId: o.itemId || null, Nivel: o.nivel || "EQUIPE", Texto: o.texto, AutorMembroId: o.autor || 10, CriadaEm: new Date(S.agoraMs - (o.h || 5) * HORA), RetificaNotaId: o.retifica || null }; S.notas.push(n); return n; };
  const novoPedido = (o) => {
    const p = {
      PedidoId: o.id || ++S.seq.pedido, CongregacaoId: o.origem === "SITE" ? null : (o.congregacaoId || 1), Origem: o.origem || "SISTEMA", SiteItemId: o.siteItemId || null,
      SolicitanteMembroId: o.origem === "SITE" ? null : (o.solicitante === undefined ? 60 : o.solicitante), RegistradoPorMembroId: o.registradoPor || o.solicitante || 60,
      SolicitanteNome: o.solicitanteNome || null, SolicitanteContato: o.solicitanteContato || null, ParaQuem: o.paraQuem || "PROPRIO", Categoria: o.categoria || "SAUDE", Texto: o.texto,
      PodeBoletim: o.podeBoletim !== false, QuerContato: !!o.querContato, Moderacao: o.moderacao || "AGUARDANDO", TextoBoletim: o.textoBoletim || null, BoletimAte: o.boletimAte || null,
      ModeradoEm: o.moderacao && o.moderacao !== "AGUARDANDO" ? new Date(S.agoraMs - 2 * HORA) : null, ModeradoPorMembroId: o.moderacao && o.moderacao !== "AGUARDANDO" ? 10 : null,
      Risco: !!o.risco, RiscoOrigem: o.risco ? (o.riscoOrigem || "AUTOMATICO") : null, RiscoCrianca: !!o.riscoCrianca, RiscoJaTeve: !!(o.risco || o.riscoJaTeve), SoNivelGeral: !!o.soNivelGeral,
      RiscoMarcadoEm: o.risco ? new Date(S.agoraMs - HORA) : null, RiscoDesmarcadoEm: o.riscoDesmarcadoMotivo ? new Date(S.agoraMs - HORA) : null, RiscoDesmarcadoMotivo: o.riscoDesmarcadoMotivo || null,
      CriadoEm: new Date(S.agoraMs - (o.h === undefined ? 3 : o.h) * HORA), AnonimizadoEm: null
    };
    S.pedidos.push(p);
    return p;
  };

  // ============================================================================
  // O banco falso: cada consulta da camada de banco de verdade, pelo texto (normalizado) e pelos parâmetros
  // ============================================================================
  const agoraSql = () => new Date(S.agoraMs);
  const hojeSql = () => hojeBrasilia(agoraSql());
  const nomeDe = (id) => (id ? (S.membros.get(Number(id)) || {}).Nome || null : null);
  function linhaItem(it) {
    const c = congDe(it.CongregacaoId), m = it.MembroId ? S.membros.get(it.MembroId) : null;
    return Object.assign({}, it, { CongregacaoNome: c ? c.nome : null, PessoaNomeExibido: m ? m.Nome : it.PessoaNome, MembroTelefone: m ? m.Telefone : null, MembroEmail: m ? m.Email : null,
      MembroNascimento: m ? m.DataNascimento : null, MembroStatus: m ? m.Status : null, MembroCongregacaoId: m ? m.CongregacaoId : null, MembroCongregacaoNome: m ? (congDe(m.CongregacaoId) || {}).nome || null : null,
      ResponsavelNome: nomeDe(it.ResponsavelMembroId) });
  }
  function linhaPedido(p) {
    const c = congDe(p.CongregacaoId), s = p.SolicitanteMembroId ? S.membros.get(p.SolicitanteMembroId) : null;
    const itens = S.itens.filter(i => Number(i.PedidoOracaoId) === Number(p.PedidoId)).sort((a, b) => (Number(a.Status !== "ABERTO") - Number(b.Status !== "ABERTO")) || (b.ItemId - a.ItemId));
    return Object.assign({}, p, { CongregacaoNome: c ? c.nome : null, SolicitanteNome: s ? s.Nome : p.SolicitanteNome, SolicitanteStatus: s ? s.Status : null, SolicitanteNascimento: s ? s.DataNascimento : null, SolicitanteCongregacaoId: s ? s.CongregacaoId : null,
      RegistradoPorNome: nomeDe(p.RegistradoPorMembroId), ModeradoPorNome: nomeDe(p.ModeradoPorMembroId), ItemId: itens[0] ? itens[0].ItemId : null, ItemStatus: itens[0] ? itens[0].Status : null });
  }
  // "coluna IN (@t0, @t1)" → [ids]; "1 = 0" → []; sem filtro → null (todas)
  function idsDoIn(t, coluna, inp) {
    const m = new RegExp(`${coluna.replace(".", "\\.")} IN \\(([^)]*)\\)`).exec(t);
    if (m) return m[1].split(",").map(x => Number(inp[x.trim().replace(/^@/, "")]));
    if (t.includes("1 = 0")) return [];
    return null;
  }
  const noIn = (ids, v) => ids === null || ids.includes(Number(v));
  const duplicado = () => Object.assign(new Error("Cannot insert duplicate key row (UX_CuidadoItens)"), { number: 2627 });
  const consultasSemImitacao = [];
  function rotear(q, inp) {
    // (as dicas de trava — WITH (UPDLOCK, ROWLOCK|HOLDLOCK) — não mudam o resultado: saem antes de reconhecer a consulta)
    const t = q.replace(/\s+/g, " ").replace(/ WITH \([A-Z, ]+\)/g, "").trim();
    const agora = agoraSql().getTime();
    const it = (id) => S.itens.find(i => i.ItemId === Number(id));
    const pe = (id) => S.pedidos.find(p => p.PedidoId === Number(id));
    // (Trava 7-C) as regiões sem Superintendente Regional (só o painel do nível geral pergunta)
    if (t.includes("FROM Regioes rg JOIN Areas a") && t.includes("EscopoTipo = 'REGIAO'")) return (S.regioesSemSup || []).map(r => ({ RegiaoId: r.id, Nome: r.nome, Congregacoes: r.congregacoes }));
    // ---------------- gravações ----------------
    if (t.startsWith("INSERT INTO CuidadoItens")) {
      const membroId = inp.m || null;
      if (membroId && ["NOVO_CONVERTIDO", "AFASTAMENTO", "PEDIDO_VISITA", "POS_INTERNACAO"].includes(inp.t) && S.itens.some(i => i.Status === "ABERTO" && i.Tipo === inp.t && i.MembroId === Number(membroId))) throw duplicado();
      if (inp.po && S.itens.some(i => i.Status === "ABERTO" && Number(i.PedidoOracaoId) === Number(inp.po))) throw duplicado();
      const novo = { ItemId: ++S.seq.item, Tipo: inp.t, CongregacaoId: Number(inp.c), MembroId: membroId ? Number(membroId) : null, PessoaNome: inp.pn || null, PessoaContato: inp.pc || null, Motivo: inp.mo || null,
        Origem: inp.o, PedidoOracaoId: inp.po || null, Urgente: !!inp.u, SoNivelGeral: !!inp.sg, DeteccaoResumo: inp.dr || null, ResponsavelMembroId: inp.r || null, PrazoEm: new Date(inp.pz), Nivel: inp.nv || "CONGREGACAO",
        Escalonamentos: 0, LembretesGerais: 0, Status: "ABERTO", Desfecho: null, EncerradoEm: null, PrimeiroContatoEm: null, CriadoEm: agoraSql(), CriadoPorMembroId: inp.cp || null, AnonimizadoEm: null };
      S.itens.push(novo);
      return [{ id: novo.ItemId }];
    }
    if (t.startsWith("INSERT INTO CuidadoEventos")) {
      const e = novoEvento({ ItemId: Number(inp.i), Tipo: inp.t, MembroId: inp.m || null, Em: inp.em ? new Date(inp.em) : agoraSql(), Forma: inp.f || null, Conseguiu: inp.cs == null ? null : !!inp.cs, Acompanhante: inp.ac || null,
        Observacao: inp.ob || null, NivelDe: inp.nd || null, NivelPara: inp.np || null, PrazoNovo: inp.pz ? new Date(inp.pz) : null, ResponsavelMembroId: inp.rp || null });
      return [{ id: e.EventoId }];
    }
    if (t.includes("FROM CuidadoItens WHERE ItemId = @id")) {
      const i = it(inp.id);
      return i ? [{ Status: i.Status, ResponsavelMembroId: i.ResponsavelMembroId, PrazoEm: i.PrazoEm, Nivel: i.Nivel, PrimeiroContatoEm: i.PrimeiroContatoEm, Urgente: i.Urgente }] : [];
    }
    if (t.startsWith("UPDATE CuidadoItens SET PrimeiroContatoEm = @em")) { const i = it(inp.id); if (i && !i.PrimeiroContatoEm) i.PrimeiroContatoEm = new Date(inp.em); return []; }
    if (t.startsWith("UPDATE CuidadoItens SET ResponsavelMembroId = @r")) { const i = it(inp.id); if (i && i.Status === "ABERTO") i.ResponsavelMembroId = Number(inp.r); return []; }
    if (t.startsWith("UPDATE CuidadoItens SET PrazoEm = @pz")) { const i = it(inp.id); if (i && i.Status === "ABERTO") i.PrazoEm = new Date(inp.pz); return []; }
    if (t.startsWith("UPDATE CuidadoItens SET Status = @s, Desfecho = @d")) {
      const i = it(inp.id);
      if (i && i.Status === "ABERTO") Object.assign(i, { Status: inp.s, Desfecho: inp.d, EncerradoEm: agoraSql() });
      return [];
    }
    if (t.startsWith("UPDATE CuidadoItens SET Urgente = 1")) {
      const i = it(inp.i);
      if (i && i.Status === "ABERTO") { i.Urgente = true; if (i.PrazoEm > new Date(inp.pz)) i.PrazoEm = new Date(inp.pz); if (inp.sg) i.SoNivelGeral = true; }
      return [];
    }
    if (t.includes("SELECT TOP 1 ItemId FROM CuidadoItens WHERE MembroId = @m AND Tipo = @t AND Status = 'ABERTO'")) {
      return S.itens.filter(i => i.MembroId === Number(inp.m) && i.Tipo === inp.t && i.Status === "ABERTO").slice(0, 1).map(i => ({ ItemId: i.ItemId }));
    }
    if (t.includes("SELECT TOP 1 ItemId FROM CuidadoItens WHERE PedidoOracaoId = @p AND Status = 'ABERTO'")) {
      return S.itens.filter(i => Number(i.PedidoOracaoId) === Number(inp.p) && i.Status === "ABERTO").slice(0, 1).map(i => ({ ItemId: i.ItemId }));
    }
    if (t.includes("SELECT PedidoId FROM PedidosOracao WHERE PedidoId = @p")) return S.pedidos.filter(p => p.PedidoId === Number(inp.p)).map(p => ({ PedidoId: p.PedidoId }));
    if (t.includes("SELECT COUNT(*) AS n FROM NotasPastorais WHERE AutorMembroId = @a")) return [{ n: S.notas.filter(n => n.AutorMembroId === Number(inp.a) && n.CriadaEm.getTime() >= agora - DIA).length }];
    if (t.startsWith("INSERT INTO NotasPastorais (")) {
      const n = novaNota({ membroId: inp.m || null, itemId: inp.i || null, nivel: inp.nv, texto: inp.t, autor: Number(inp.a), retifica: inp.rt || null, h: 0 });
      return [{ id: n.NotaId }];
    }
    // o mesmo texto da mesma pessoa em 10 minutos é o mesmo pedido (a resposta que se perdeu na rede)
    if (t.includes("SELECT TOP 1 PedidoId, Risco FROM PedidosOracao WHERE RegistradoPorMembroId = @r AND Texto = @t AND CriadoEm >= DATEADD(MINUTE, -10, SYSUTCDATETIME())")) {
      return S.pedidos.filter(p => p.RegistradoPorMembroId === Number(inp.r) && p.Texto === inp.t && p.CriadoEm.getTime() >= agora - 10 * 60000).sort((a, b) => b.PedidoId - a.PedidoId).slice(0, 1)
        .map(p => ({ PedidoId: p.PedidoId, Risco: p.Risco }));
    }
    if (t.includes("SELECT COUNT(*) AS n FROM PedidosOracao WHERE RegistradoPorMembroId = @r"))return [{ n: S.pedidos.filter(p => p.RegistradoPorMembroId === Number(inp.r) && p.CriadoEm.getTime() >= agora - DIA).length }];
    if (t.includes("SELECT COUNT(*) AS n FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO'")) return [{ n: S.itens.filter(i => i.MembroId === Number(inp.m) && i.Origem === "PEDIDO_MEMBRO" && i.CriadoEm.getTime() >= agora - DIA).length }];
    if (t.startsWith("INSERT INTO PedidosOracao")) {
      const p = novoPedido({ congregacaoId: Number(inp.c), solicitante: inp.s ? Number(inp.s) : null, registradoPor: Number(inp.r), solicitanteNome: inp.sn, solicitanteContato: inp.sc, paraQuem: inp.pq, categoria: inp.cat,
        texto: inp.t, podeBoletim: !!inp.pb, querContato: !!inp.qc, risco: !!inp.rk, riscoOrigem: inp.ro, riscoCrianca: !!inp.rc, soNivelGeral: !!inp.sg, h: 0 });
      if (!inp.s) p.SolicitanteMembroId = null;
      p.RegistradoPorMembroId = Number(inp.r);
      return [{ id: p.PedidoId }];
    }
    if (t.startsWith("UPDATE PedidosOracao SET Moderacao = @mo")) {
      const p = pe(inp.id);
      if (!p || p.Risco || p.AnonimizadoEm || p.Moderacao !== inp.de) return [{ n: 0 }];
      Object.assign(p, { Moderacao: inp.mo, TextoBoletim: inp.tb || null, BoletimAte: inp.ba || null, ModeradoPorMembroId: Number(inp.m), ModeradoEm: agoraSql() });
      return [{ n: 1 }];
    }
    if (t.startsWith("UPDATE PedidosOracao SET Risco = 0")) {
      const p = pe(inp.id);
      if (!p || !p.Risco) return [{ n: 0 }];
      Object.assign(p, { Risco: false, RiscoDesmarcadoEm: agoraSql(), RiscoDesmarcadoMotivo: inp.mo });
      return [{ n: 1 }];
    }
    if (t.startsWith("UPDATE PedidosOracao SET Risco = 1")) {
      const p = pe(inp.id);
      if (!p || p.Risco || p.AnonimizadoEm) return [{ n: 0 }];
      Object.assign(p, { Risco: true, RiscoOrigem: "LIDERANCA", RiscoJaTeve: true, RiscoMarcadoEm: agoraSql() });
      if (inp.sg) p.SoNivelGeral = true;
      if (p.Moderacao === "APROVADO") Object.assign(p, { Moderacao: "AGUARDANDO", TextoBoletim: null, BoletimAte: null });
      return [{ n: 1 }];
    }
    if (t.startsWith("INSERT INTO NotasPastoraisLeituras")) { S.leituras.push({ LeituraId: S.seq.leitura++, NotaId: Number(inp.n), MembroId: Number(inp.m), LidaEm: agoraSql() }); return []; }
    // ---------------- leituras: itens ----------------
    if (t.includes("SELECT TOP (@lim) * FROM (") && t.includes("FROM CuidadoItens i JOIN Congregacoes c")) {
      let l = S.itens.map(linhaItem);
      if (t.includes("i.Status <> 'ABERTO'")) l = l.filter(i => i.Status !== "ABERTO" && i.EncerradoEm && i.EncerradoEm.getTime() >= agora - Number(inp.enc) * DIA);
      else l = l.filter(i => i.Status === "ABERTO");
      if (t.includes("i.PrazoEm < SYSUTCDATETIME()")) l = l.filter(i => i.PrazoEm.getTime() < agora);
      if (t.includes("i.ResponsavelMembroId IS NULL")) l = l.filter(i => !i.ResponsavelMembroId);
      if (t.includes("i.Urgente = 1")) l = l.filter(i => i.Urgente);
      if (t.includes("i.CongregacaoId = @c")) l = l.filter(i => i.CongregacaoId === Number(inp.c));
      if (t.includes("i.Tipo = @t")) l = l.filter(i => i.Tipo === inp.t);
      if (t.includes("i.MembroId <> @eu")) l = l.filter(i => !i.MembroId || i.MembroId !== Number(inp.eu));
      if (t.includes("i.SoNivelGeral = 0")) l = l.filter(i => !i.SoNivelGeral);
      const ids = idsDoIn(t, "i.CongregacaoId", inp);
      l = l.filter(i => noIn(ids, i.CongregacaoId));
      l.sort(t.includes("ORDER BY i.EncerradoEm DESC") ? (a, b) => b.EncerradoEm - a.EncerradoEm : (a, b) => (Number(b.Urgente) - Number(a.Urgente)) || (a.PrazoEm - b.PrazoEm));
      return l.slice(0, Number(inp.lim));
    }
    if (t.includes("FROM CuidadoItens i JOIN Congregacoes c") && t.includes("WHERE i.ItemId = @id")) return S.itens.filter(i => i.ItemId === Number(inp.id)).map(linhaItem);
    if (t.includes("FROM CuidadoItens i JOIN Congregacoes c") && t.includes("WHERE i.ResponsavelMembroId = @m")) {
      const m = Number(inp.m);
      return S.itens.map(linhaItem).filter(i => i.ResponsavelMembroId === m && (!i.MembroId || i.MembroId !== m) && (i.Status === "ABERTO" || (i.EncerradoEm && i.EncerradoEm.getTime() >= agora - 30 * DIA)))
        .sort((a, b) => (Number(a.Status !== "ABERTO") - Number(b.Status !== "ABERTO")) || (Number(b.Urgente) - Number(a.Urgente)) || (a.PrazoEm - b.PrazoEm));
    }
    if (t.includes("FROM CuidadoEventos e")) {
      return S.eventos.filter(e => e.ItemId === Number(inp.id)).sort((a, b) => a.EventoId - b.EventoId).map(e => Object.assign({}, e, { PorNome: nomeDe(e.MembroId), ResponsavelNome: nomeDe(e.ResponsavelMembroId) }));
    }
    if (t.includes("SELECT TOP 1 1 AS x FROM CuidadoItens i JOIN MembroReferencia m ON m.MembroId = i.MembroId")) {
      return S.itens.filter(i => i.Status === "ABERTO" && i.ResponsavelMembroId === Number(inp.v) && i.MembroId === Number(inp.m)).filter(i => { const p = S.membros.get(i.MembroId); return p && p.Status === "ATIVO" && p.CongregacaoId === i.CongregacaoId; })
        .slice(0, 1).map(() => ({ x: 1 }));
    }
    if (t.includes("SELECT TOP 1 1 AS x FROM CuidadoItens WHERE Status = 'ABERTO' AND ResponsavelMembroId = @v AND ItemId = @i")) {
      return S.itens.filter(i => i.Status === "ABERTO" && i.ResponsavelMembroId === Number(inp.v) && i.ItemId === Number(inp.i)).slice(0, 1).map(() => ({ x: 1 }));
    }
    if (t.includes("SELECT TOP 30 ItemId, Tipo, Status, CriadoEm, EncerradoEm FROM CuidadoItens WHERE MembroId = @m AND Origem = 'PEDIDO_MEMBRO'")) {
      return S.itens.filter(i => i.MembroId === Number(inp.m) && i.Origem === "PEDIDO_MEMBRO").sort((a, b) => b.ItemId - a.ItemId).slice(0, 30);
    }
    // ---------------- pessoas, congregações e liderança ----------------
    if (t.includes("SELECT CargoMinisterial FROM MembroReferencia WHERE MembroId = @m")) { const m = S.membros.get(Number(inp.m)); return m ? [{ CargoMinisterial: m.CargoMinisterial }] : []; }
    if (t.includes("SELECT m.MembroId, m.Nome, m.Email, m.Telefone, m.Status, m.DataNascimento, m.CongregacaoId, c.Nome AS CongregacaoNome")) {
      const m = S.membros.get(Number(inp.m));
      return m ? [Object.assign({}, m, { CongregacaoNome: (congDe(m.CongregacaoId) || {}).nome || null })] : [];
    }
    if (t === "SELECT CongregacaoId, Nome FROM Congregacoes") return S.congregacoes.map(c => ({ CongregacaoId: c.id, Nome: c.nome }));
    if (t.includes("SELECT CongregacaoId, Nome FROM Congregacoes WHERE CongregacaoId = @c")) { const c = congDe(inp.c); return c ? [{ CongregacaoId: c.id, Nome: c.nome }] : []; }
    if (t.includes("SELECT CongregacaoId, Nome FROM Congregacoes WHERE Ativa = 1 ORDER BY Nome")) return S.congregacoes.filter(c => c.ativa).map(c => ({ CongregacaoId: c.id, Nome: c.nome })).sort((a, b) => a.Nome.localeCompare(b.Nome));
    if (t.includes("FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId AND p.Nome = @papel")) {
      return S.lideranca.filter(l => l.papel === inp.papel && l.escopoTipo === "CONGREGACAO" && l.escopoId === Number(inp.c) && (S.membros.get(l.membroId) || {}).Status === "ATIVO")
        .sort((a, b) => b.liderancaId - a.liderancaId).slice(0, 1).map(l => { const m = S.membros.get(l.membroId); return { membroId: m.MembroId, nome: m.Nome, email: m.Email }; });
    }
    if (t.includes("FROM Lideranca l JOIN Papeis p ON p.PapelId = l.PapelId JOIN MembroReferencia m ON m.MembroId = l.MembroId")) {
      const perm = String(inp.perm).replace(/%/g, "").replace(/,/g, "");
      const alvo = { CONGREGACAO: inp.c, AREA: inp.a, REGIAO: inp.rg, QUADRANTE: inp.q, DISTRITO: inp.d };
      return S.lideranca.filter(l => `,${l.permissoes},`.includes(`,${perm},`) && (S.membros.get(l.membroId) || {}).Status === "ATIVO" && (l.escopoTipo === "GLOBAL" || (alvo[l.escopoTipo] != null && Number(alvo[l.escopoTipo]) === l.escopoId)))
        .map(l => { const m = S.membros.get(l.membroId); return { EscopoTipo: l.escopoTipo, membroId: m.MembroId, nome: m.Nome, email: m.Email, CargoMinisterial: m.CargoMinisterial }; });
    }
    if (t.includes("SELECT TOP 20 m.MembroId, m.Nome, m.DataNascimento FROM MembroReferencia m")) {
      const termo = cpReal.normalizar(String(inp.q).replace(/%/g, ""));
      return [...S.membros.values()].filter(m => m.Status === "ATIVO" && m.CongregacaoId === Number(inp.c) && cpReal.normalizar(m.Nome).includes(termo)).sort((a, b) => a.Nome.localeCompare(b.Nome)).slice(0, 20)
        .map(m => ({ MembroId: m.MembroId, Nome: m.Nome, DataNascimento: m.DataNascimento }));
    }
    // ---------------- notas ----------------
    if (t.includes("LEN(n.Texto) AS Tamanho")) {
      const l = S.notas.filter(n => (t.includes("n.MembroId = @m") ? n.MembroId === Number(inp.m) : n.ItemId === Number(inp.i))).sort((a, b) => b.NotaId - a.NotaId);
      return l.map(n => ({ NotaId: n.NotaId, Nivel: n.Nivel, AutorMembroId: n.AutorMembroId, AutorNome: nomeDe(n.AutorMembroId), CriadaEm: n.CriadaEm, RetificaNotaId: n.RetificaNotaId, Tamanho: n.Texto.length }));
    }
    if (t.includes("SELECT NotaId, MembroId, ItemId, Nivel, AutorMembroId FROM NotasPastorais WHERE NotaId = @n")) return S.notas.filter(n => n.NotaId === Number(inp.n)).map(n => ({ NotaId: n.NotaId, MembroId: n.MembroId, ItemId: n.ItemId, Nivel: n.Nivel, AutorMembroId: n.AutorMembroId }));
    if (t.includes("SELECT n.NotaId, n.Nivel, n.Texto, n.CriadaEm, n.RetificaNotaId, a.Nome AS AutorNome, n.AutorMembroId")) return S.notas.filter(n => n.NotaId === Number(inp.n)).map(n => Object.assign({}, n, { AutorNome: nomeDe(n.AutorMembroId) }));
    if (t.includes("FROM NotasPastoraisLeituras l JOIN MembroReferencia m")) return S.leituras.filter(l => l.NotaId === Number(inp.n)).sort((a, b) => b.LeituraId - a.LeituraId).slice(0, 30).map(l => ({ LidaEm: l.LidaEm, Nome: nomeDe(l.MembroId) }));
    // ---------------- pedidos ----------------
    if (t.includes("FROM PedidosOracao WHERE SolicitanteMembroId = @m ORDER BY PedidoId DESC")) return S.pedidos.filter(p => p.SolicitanteMembroId === Number(inp.m)).sort((a, b) => b.PedidoId - a.PedidoId).slice(0, 50);
    if (t.includes("SELECT TOP 300 * FROM (") && t.includes("FROM PedidosOracao p LEFT JOIN Congregacoes c")) {
      let l = S.pedidos.map(linhaPedido).filter(p => !p.AnonimizadoEm);
      if (t.includes("p.Risco = 1")) l = l.filter(p => p.Risco);
      else if (t.includes("p.Moderacao = 'APROVADO' AND p.BoletimAte")) l = l.filter(p => p.Moderacao === "APROVADO" && p.BoletimAte && p.BoletimAte >= hojeSql());
      else if (t.includes("p.CriadoEm >= DATEADD(DAY, -90")) l = l.filter(p => p.CriadoEm.getTime() >= agora - 90 * DIA);
      else l = l.filter(p => p.Moderacao === "AGUARDANDO" && !p.Risco);
      if (t.includes("p.CongregacaoId = @c")) l = l.filter(p => p.CongregacaoId === Number(inp.c));
      if (t.includes("p.SolicitanteMembroId <> @eu")) l = l.filter(p => !p.SolicitanteMembroId || p.SolicitanteMembroId !== Number(inp.eu));
      if (t.includes("p.SoNivelGeral = 0")) l = l.filter(p => !p.SoNivelGeral);
      const ids = idsDoIn(t, "p.CongregacaoId", inp);
      return l.filter(p => noIn(ids, p.CongregacaoId)).sort((a, b) => (Number(b.Risco) - Number(a.Risco)) || (b.PedidoId - a.PedidoId)).slice(0, 300);
    }
    if (t.includes("FROM PedidosOracao p LEFT JOIN Congregacoes c") && t.includes("WHERE p.PedidoId = @id")) return S.pedidos.filter(p => p.PedidoId === Number(inp.id)).map(linhaPedido);
    if (t.includes("SELECT p.PedidoId, p.TextoBoletim, p.ModeradoEm, p.BoletimAte, p.Categoria, c.Nome AS CongregacaoNome")) {
      let l = S.pedidos.map(linhaPedido).filter(p => p.Moderacao === "APROVADO" && !p.Risco && p.BoletimAte && p.BoletimAte >= String(inp.hoje) && !p.AnonimizadoEm);
      if (t.includes("p.CongregacaoId = @c")) l = l.filter(p => p.CongregacaoId === Number(inp.c));
      const ids = idsDoIn(t, "p.CongregacaoId", inp);
      return l.filter(p => noIn(ids, p.CongregacaoId)).sort((a, b) => a.CongregacaoNome.localeCompare(b.CongregacaoNome) || (b.ModeradoEm - a.ModeradoEm))
        .map(p => ({ PedidoId: p.PedidoId, TextoBoletim: p.TextoBoletim, ModeradoEm: p.ModeradoEm, BoletimAte: p.BoletimAte, Categoria: p.Categoria, CongregacaoNome: p.CongregacaoNome }));
    }
    // ---------------- painel ----------------
    if (t.includes("AS Abertos") && t.includes("FROM CuidadoItens i") && t.includes("GROUP BY i.CongregacaoId")) {
      const ids = idsDoIn(t, "i.CongregacaoId", inp);
      const l = S.itens.filter(i => (!i.MembroId || i.MembroId !== Number(inp.eu)) && (!t.includes("i.SoNivelGeral = 0") || !i.SoNivelGeral) && noIn(ids, i.CongregacaoId));
      return [...new Set(l.map(i => i.CongregacaoId))].map(c => {
        const d = l.filter(i => i.CongregacaoId === c), ab = d.filter(i => i.Status === "ABERTO");
        const cc = d.filter(i => i.PrimeiroContatoEm && i.CriadoEm.getTime() >= agora - 90 * DIA);
        return { CongregacaoId: c, Abertos: ab.length, Vencidos: ab.filter(i => i.PrazoEm.getTime() < agora).length, SemResponsavel: ab.filter(i => !i.ResponsavelMembroId).length, Urgentes: ab.filter(i => i.Urgente).length,
          Detectados30: d.filter(i => i.Origem === "DETECCAO" && i.CriadoEm.getTime() >= agora - 30 * DIA).length,
          HorasAtePrimeiroContato: cc.length ? cc.reduce((s, i) => s + Math.floor((i.PrimeiroContatoEm - i.CriadoEm) / 60000), 0) / cc.length / 60 : null };
      });
    }
    if (t.includes("AS Aguardando") && t.includes("AS ComRisco")) {
      const ids = idsDoIn(t, "p.CongregacaoId", inp);
      const l = S.pedidos.filter(p => !p.AnonimizadoEm && (!p.SolicitanteMembroId || p.SolicitanteMembroId !== Number(inp.eu)) && (!t.includes("p.SoNivelGeral = 0") || !p.SoNivelGeral) && noIn(ids, p.CongregacaoId));
      return [...new Set(l.map(p => p.CongregacaoId))].map(c => ({ CongregacaoId: c, Aguardando: l.filter(p => p.CongregacaoId === c && p.Moderacao === "AGUARDANDO" && !p.Risco).length, ComRisco: l.filter(p => p.CongregacaoId === c && p.Risco).length }));
    }
    // (Trava 7-C) os envolvidos de incidente de proteção aberto, entre os ids pedidos
    if (t.includes("FROM IncidenteEnvolvidos e JOIN IncidentesProtecao i") && t.includes("i.Status = 'ABERTO'")) {
      return JSON.parse(inp.ids || "[]").map(Number).filter((id) => S.envolvidos.has(id)).map((id) => ({ MembroId: id }));
    }
    consultasSemImitacao.push(t.slice(0, 200));
    throw new Error(`consulta sem imitação: ${t.slice(0, 200)}`);
  }
  const novoRequest = () => { const inp = {}; const r = { input(n, tipo, v) { inp[n] = v; return r; }, async query(q) { return { recordset: rotear(q, inp) }; } }; return r; };
  const pool = { request: novoRequest };
  const sqlFalso = {
    Int: "Int", Bit: "Bit", Date: "Date", DateTime2: "DateTime2", Float: "Float", NVarChar: () => "NVarChar",
    Transaction: class { constructor() {} async begin() {} async commit() {} async rollback() {} },
    Request: class { constructor() { return novoRequest(); } }
  };

  // ---- a camada de banco de verdade, com as dependências de fora trocadas ----
  const requireDoDb = (p) => {
    if (p === "./db") return { sql: sqlFalso };
    if (p === "./auditoria") return { registrarAuditoria: async (x) => { S.auditoria.push(x); } };
    if (p === "./cuidadoPastoral") return cp;
    if (p === "./dataBrasilia") return { hojeBrasilia };
    if (p === "./voluntariado") return vol;
    if (p === "./canaisDb") return {
      notificarAgora: async (pool_, o) => { S.avisos.push({ regra: o.regraChave, destinatarios: (o.destinatarios || []).map(d => d.membroId), mensagem: o.mensagem }); return { externas: S.avisoExterno && (o.destinatarios || []).length ? (o.destinatarios || []).length : 0 }; },
      lerPrazoDias: async () => null
    };
    if (p === "./escopo") return { ancestraisTerritoriais: async (pool_, sql_, nivel, id) => { const c = congDe(id) || {}; return { congregacaoId: Number(id), areaId: c.areaId || null, regiaoId: c.regiaoId || null, quadranteId: null, distritoId: null }; } };
    if (p === "./financeiroSeguro") return { obterTrava: async () => true };
    // (v7.11.1) o nível geral do cuidado, para o que vem do mural do site
    if (p === "./notificacoes") return { resolverDestinatariosPorPermissao: async () => S.lideranca.filter((l) => l.escopoTipo === "GLOBAL" && `,${l.permissoes},`.includes(",cuidado_pastoral,"))
      .map((l) => { const m = S.membros.get(l.membroId); return { membroId: m.MembroId, nome: m.Nome, email: m.Email }; }) };
    // (Trava 7-C) a aptidão de verdade é do ministério com menores; aqui, a pendência reservada vem do estado (S.bloqueados)
    if (p === "./ministerioMenores") return { temBloqueioReservado: (b) => (b || []).some((x) => x && x.codigo === "AUTO_DENUNCIA_EM_ANALISE") };
    if (p === "./ministerioMenoresDb") {
      const aptidao = (id) => ({ bloqueios: S.bloqueados.has(Number(id)) ? [{ codigo: "AUTO_DENUNCIA_EM_ANALISE" }] : [] });
      return { aptidaoDe: async (pool_, id) => aptidao(id), aptidaoEmLote: async (pool_, ids) => new Map((ids || []).map((id) => [Number(id), aptidao(id)])) };
    }
    throw new Error(`a camada de banco pediu um módulo que a imitação não tem: ${p}`);
  };
  const modDb = { exports: {} };
  new Function("require", "module", "exports", DB_SRC)(requireDoDb, modDb, modDb.exports);
  const db = modDb.exports;

  // ---- o login (token → sessão) e a confirmação reforçada; o resto do auth é o de verdade ----
  const MSG_FATOR = "Este ato exige confirmação recente de quem você é (chave de acesso ou código por e-mail).";
  const tokenDe = (req) => (req.headers || {})["x-auth-token"];
  const auth = Object.assign({}, authReal, {
    exigirLogin(req, context) {
      const s = S.sessoes[tokenDe(req)];
      if (!s) { context.res = { status: 401, body: { sucesso: false, mensagem: "Sessão inválida." } }; return null; }
      return s;
    },
    exigirFatorRecente(req, context) {
      const s = S.sessoes[tokenDe(req)];
      if (s && s.fator) return true;
      context.res = { status: 428, headers: { "Content-Type": "application/json" }, body: { sucesso: false, precisaFator: true, mensagem: MSG_FATOR } };
      return false;
    }
  });
  const requireDoHandler = (p) => {
    if (p === "../shared/auth") return auth;
    if (p === "../shared/db") return { getPool: async () => pool };
    if (p === "../shared/escopoRotas") return escopoRotas;
    if (p === "../shared/voluntariado") return vol;
    if (p === "../shared/cuidadoPastoral") return cp;
    if (p === "../shared/cuidadoPastoralDb") return db;
    throw new Error(`o handler pediu um módulo que a imitação não tem: ${p}`);
  };
  const modulo = { exports: {} };
  new Function("require", "module", "exports", HANDLER_SRC)(requireDoHandler, modulo, modulo.exports);
  const handler = modulo.exports;

  // A chamada que a tela faz (ambiente.js → api.servidor): { metodo, caminho: "cuidado-pastoral/<acao>", consulta, corpo, cabecalhos } → { status, corpo }
  async function servidor(chamada) {
    const m = /^cuidado-pastoral\/([a-z-]+)$/.exec(chamada.caminho);
    if (!m) return null;
    S.chamadas.push(chamada);
    const context = { bindingData: { acao: m[1] }, log: { error: (...a) => S.erros.push(a.map(x => (x && x.stack) || String(x)).join(" ")) }, res: null };
    const req = { method: chamada.metodo, headers: chamada.cabecalhos, query: chamada.consulta, body: chamada.corpo };
    await handler(context, req);
    return { status: context.res.status, corpo: context.res.body, cabecalhos: context.res.headers };
  }

  return { S, servidor, novoItem, novoEvento, novaNota, novoPedido, membro, congDe, cp, db, consultasSemImitacao, MSG_FATOR };
}

// ---- contrato: o que a tela lê e manda existe no servidor (se o servidor mudar um nome, isto acusa antes da tela quebrar em silêncio) ----
function contratoComOServidor() {
  const faltam = [];
  // 1) os campos que a tela LÊ das respostas
  const lidos = {
    db: ["itemId", "tipo", "tipoRotulo", "congregacaoId", "congregacaoNome", "pessoaNome", "menor", "origem", "origemRotulo", "urgente", "soNivelGeral", "responsavel", "prazoEm", "prazo", "nivel",
      "nivelRotulo", "status", "desfecho", "desfechoRotulo", "encerradoEm", "encerrado", "criadoEm", "primeiroContatoEm", "membroId", "pedidoOracaoId", "deteccaoResumo", "motivo", "contato", "sugestaoAbandono",
      "eventoId", "em", "por", "formaRotulo", "conseguiu", "acompanhante", "observacao", "nivelParaRotulo", "prazoNovo", "responsavelNome",
      "eventos", "notas", "podeGerir", "podeNotaNiveis", "agora",
      "notaId", "autor", "minha", "criadaEm", "retificaNotaId", "tamanho", "pedeConfirmacao", "texto", "nome", "lidaEm",
      "pedidoId", "solicitante", "solicitanteContato", "registradoPor", "paraQuem", "paraQuemRotulo", "categoria", "categoriaRotulo", "podeBoletim", "querContato", "moderacao", "textoBoletim",
      "boletimAte", "moderadoPor", "moderadoEm", "risco", "riscoOrigem", "riscoCrianca", "riscoJaTeve", "riscoDesmarcadoMotivo", "riscoDesmarcadoEm", "sugestaoBoletim", "itemAberto",
      "oracao", "visitas", "situacao", "linha", "ate", "abertos", "vencidos", "semResponsavel", "urgentes", "detectados30Dias", "horasAtePrimeiroContato", "pedidosAguardando", "pedidosRisco",
      "lideranca", "maior", "avisada", "ajuda", "mensagem", "sucesso", "LIDERANCA", "AUTOMATICO", "APROVADO", "AGUARDANDO", "NAO_PUBLICAR"],
    handler: ["papeis", "gestao", "geral", "tipos", "manual", "soMembro", "formas", "formasPresenciais", "desfechosConclusao", "desfechosCancelamento", "niveisNota", "categorias", "degraus",
      "contatosDeAjuda", "limites", "motivo", "observacao", "nota", "pedido", "boletim", "contato", "adiarDias", "contatoRetroativoDias", "itens", "notas", "leituras", "pessoas", "congregacoes", "pedidos", "linhas", "item"],
    cp: ["numero", "descricao", "rotulo"]
  };
  for (const [fonte, texto] of [["db", DB_SRC], ["handler", HANDLER_SRC], ["cp", CP_SRC]]) for (const c of lidos[fonte]) if (!new RegExp(`\\b${c}\\b`).test(texto)) faltam.push(`lê ${fonte}:${c}`);
  // 2) os campos que a tela MANDA no corpo (cada um é lido pelo handler ou pela regra: d.<campo>, corpo.<campo> ou dados.<campo>)
  const mandados = ["tipo", "congregacaoId", "membroId", "pessoaNome", "pessoaContato", "motivo", "responsavelMembroId", "urgente", "itemId", "forma", "conseguiu", "acompanhante", "observacao", "data",
    "desfecho", "novoPrazo", "nivel", "texto", "retificaNotaId", "notaId", "categoria", "podeBoletim", "querContato", "paraQuem", "hospital", "contato", "solicitanteNome", "solicitanteContato",
    "pedidoId", "decisao", "textoBoletim", "marcar", "q"];
  const leitores = `${HANDLER_SRC}\n${CP_SRC}\n${DB_SRC}`;
  for (const c of mandados) if (!new RegExp(`\\b(d|corpo|dados|\\(dados \\|\\| \\{\\}\\))\\.${c}\\b`).test(leitores)) faltam.push(`manda ${c}`);
  // 3) as ações e os métodos que a tela usa existem no handler com o mesmo método
  const lista = (nome) => { const m = new RegExp(`const ${nome} = \\[([^\\]]*)\\]`).exec(HANDLER_SRC); return m ? [...m[1].matchAll(/"([a-z-]+)"/g)].map(x => x[1]) : []; };
  const leituras = lista("LEITURAS"), escritas = lista("ESCRITAS");
  const gets = new Set([...MODULO_SRC.matchAll(/cpaObter\(\s*[`"]([a-z-]+)/g)].map(x => x[1]));
  const posts = new Set([...MODULO_SRC.matchAll(/cpaPostar\(\s*"([a-z-]+)"/g)].map(x => x[1]));
  for (const a of gets) if (!leituras.includes(a)) faltam.push(`GET ${a} não é leitura do handler`);
  for (const a of posts) if (!escritas.includes(a)) faltam.push(`POST ${a} não é escrita do handler`);
  if (gets.size < 10 || posts.size < 15) faltam.push(`a varredura das ações da tela achou poucas (${gets.size} GET, ${posts.size} POST)`);
  // 4) o 428 da confirmação reforçada é o do auth de verdade, e a tela chama o MESMO confirmarFatorAgora
  if (!/precisaFator: true/.test(AUTH_SRC)) faltam.push("auth: o 428 não traz mais precisaFator");
  if (!AUTH_SRC.includes("Este ato exige confirmação recente de quem você é (chave de acesso ou código por e-mail).")) faltam.push("auth: a mensagem do 428 mudou (a imitação do exigirFatorRecente usa a de antes)");
  if (!/await confirmarFatorAgora\(\)/.test(MODULO_SRC)) faltam.push("a tela não chama mais confirmarFatorAgora no 428");
  // 5) as constantes da tela que espelham o servidor (os telefones de ajuda e os limites) são as mesmas
  const constTela = extrairDeCodigo(MODULO_SRC, ["CPA_CONTATOS_PADRAO", "CPA_LIMITES_PADRAO"], {});
  if (JSON.stringify(constTela.CPA_CONTATOS_PADRAO) !== JSON.stringify(cpReal.CONTATOS_DE_AJUDA)) faltam.push("CPA_CONTATOS_PADRAO difere de CONTATOS_DE_AJUDA do servidor");
  const limServ = { motivo: cpReal.MAX_MOTIVO, observacao: cpReal.MAX_OBSERVACAO, nota: cpReal.MAX_NOTA, pedido: cpReal.MAX_PEDIDO, boletim: cpReal.MAX_BOLETIM, nome: cpReal.MAX_NOME, contato: cpReal.MAX_CONTATO, adiarDias: cpReal.MAX_ADIAR_DIAS, contatoRetroativoDias: cpReal.CONTATO_RETROATIVO_DIAS };
  if (JSON.stringify(constTela.CPA_LIMITES_PADRAO) !== JSON.stringify(limServ)) faltam.push("CPA_LIMITES_PADRAO difere dos limites do servidor");
  // 6) os códigos fixos da tela existem na regra
  for (const s of ["ABERTOS", "VENCIDOS", "SEM_RESPONSAVEL", "URGENTES", "ENCERRADOS"]) if (!DB_SRC.includes(`"${s}"`)) faltam.push(`situação da fila ${s}`);
  for (const s of ["AGUARDANDO", "RISCO", "APROVADOS", "TODOS"]) if (!HANDLER_SRC.includes(`"${s}"`)) faltam.push(`situação dos pedidos ${s}`);
  for (const s of ["CRIADO", "ATRIBUIDO", "CONTATO", "PRAZO_ADIADO", "CONCLUIDO", "CANCELADO", "URGENTE", "ESCALONADO", "LEMBRETE_GERAL"]) if (!DB_SRC.includes(`"${s}"`)) faltam.push(`tipo de evento ${s}`);
  for (const s of ["NORMAL", "ATENCAO", "VENCIDO"]) if (!CP_SRC.includes(`"${s}"`)) faltam.push(`faixa do prazo ${s}`);
  return faltam;
}

module.exports = { ATAQUE, HORA, DIA, criarServidor, contratoComOServidor, cp: cpReal };
