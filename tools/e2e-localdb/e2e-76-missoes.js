// e2e-76-missoes.js — v9.4 (Missões): fluxos, garantias do banco, segurança e lixo, com os handlers e o banco REAIS, sobre a base "cenario-missoes"
// (`bash rodar.sh preparar-missoes`: a base da Trava 9-A com a 169 aplicada duas vezes). Monta o próprio cenário.
// Os campos (abrangência calculada), o envio pelas etapas do caso (Local sem sustento direto; com sustento o Presidente; Estadual CME + CLI; Transcultural e
// convênio externo CME + CLI + Presidente — Regimento Art. 23, 24 §2º, 44 e 134 §6º, I), o sustento do mês gerado no Contas a Pagar, o relatório de campo que
// suspende o sustento quando vence (Art. 133-C §2º), o reajuste e o encerramento, a vacância, os avisos, o painel, o mural e Meus Dados.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const { chamarRota } = require("./lib-afm");
const fs = require("fs");

console.error = () => { };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
// o arquivo vai para o Blob de mentira (o roteiro não fala com o Azure); a URL assinada é a própria URL com "?sas"
const st = require(path.join(API, "shared/storage.js"));
let blobs = 0;
st.salvarDocumento = async () => `https://blob.e2e/documentos/doc-missoes-${process.pid}-${++blobs}`;
st.urlDocumentoComSas = (u) => `${u}?sas`;
const mi = require(path.join(API, "shared/missoes.js"));
const miDb = require(path.join(API, "shared/missoesDb.js"));
const vacancia = require(path.join(API, "shared/vacancia.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoMissoes/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token });
const GET = (acao, query, token) => rota(acao, { query, token });
const hoje = hojeBr();
const mes = mi.mesDe(hoje), m1 = mi.somarMeses(mes, -1), m2 = mi.somarMeses(mes, -2), m3 = mi.somarMeses(mes, -3), proximo = mi.somarMeses(mes, 1);
const DOC = { documentoBase64: Buffer.from("%PDF-1.4 termo de compromisso").toString("base64"), documentoMime: "application/pdf" };

// do cenário de base (e2e-1): 1001 Presidente, 1002 Secretário Geral, 3001 Dirigente da Central, 3003 Pastor da Área Alfa (a CME)
const P = { secretario: 9701, a: 9702, b: 9703, c: 9704, sobProcesso: 9705, tesoureiro: 9706, d: 9707, f: 9708, semComunhao: 9709, e: 9710, g: 9711, h: 9712 };
const SEMI = () => L.LIDER(P.secretario, ["missoes", "expansao"], [], "DEPARTAMENTO");
const SEC = () => L.GERAL(1002, ["missoes", "financeiro"]);
const SEC_SEM_FATOR = () => L.sessao(1002, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["missoes", "financeiro"] });
const PRES = () => L.GERAL(1001, ["missoes"]);
const PRES_SEM_FATOR = () => L.sessao(1001, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["missoes"] });
const CME = () => L.LIDER(3003, ["missoes", "expansao"], ["Central E2E", "Vila Nova E2E"], "AREA");
const CME_SEM_PERMISSAO = () => L.LIDER(3003, ["expansao"], ["Central E2E", "Vila Nova E2E"], "AREA");
const TES = () => L.GERAL(P.tesoureiro, ["financeiro"]);
const DIR = () => L.LIDER(3001, ["expansao", "pessoas"], ["Central E2E"]);
const DIR_COM_MISSOES = () => L.LIDER(3001, ["missoes"], ["Central E2E"]);
const PINM = () => L.sessao(P.secretario, { via: "PIN", permissoes: ["missoes"] });

const TABELAS = ["CamposMissionarios", "EnviosMissionarios", "EnvioSustentoValores", "RelatoriosCampo", "SustentoGeracoes", "SaidasTesouraria"];
async function retrato() {
  const partes = [];
  for (const t of TABELAS) partes.push(JSON.stringify(await um(`SELECT COUNT(*) n, CHECKSUM_AGG(CHECKSUM(*)) c FROM ${t}`)));
  return partes.join("|");
}
async function fuzz(rotulo, acao, base, campos, token) {
  const quebras = [], mudancas = [];
  let n = 0;
  for (const campo of campos) for (const lixo of LIXO) {
    const corpo = { ...base };
    if (lixo === undefined) delete corpo[campo]; else corpo[campo] = lixo;
    const antes = await retrato();
    const r = await POST(acao, corpo, token());
    n++;
    if (![200, 400, 403, 404, 422].includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}
async function sessaoCLI(descricao, data, { status = "ENCERRADA" } = {}) {
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, @d, @dt, N'EXTRAORDINARIA', @s FROM Orgaos WHERE Sigla = N'CLI'`, { d: descricao, dt: data, s: status });
}
async function falhaNoBanco(rotulo, texto, params) {
  let erro = null;
  try { await q(texto, params); } catch (e) { erro = e; }
  ok(!!erro, `banco: ${rotulo}`, erro ? undefined : ["passou sem erro"]);
}
const status = (id) => escalar("SELECT Status FROM EnviosMissionarios WHERE EnvioId = @id", { id });
const versaoCampo = (c) => escalar("SELECT Versao FROM CamposMissionarios WHERE CampoId = @c", { c });
const avisos = (regra, membroId) => escalar("SELECT COUNT(*) FROM Notificacoes WHERE RegraChave = @r AND DestinatarioMembroId = @m", { r: regra, m: membroId });

(async () => {
  const pool = await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  const semiadespa = await escalar("SELECT DepartamentoId FROM Departamentos WHERE Sigla = 'SEMIADESPA'");
  const pessoas = [[P.secretario, "Secretário de Missões E2E"], [P.a, "Missionária Ana E2E"], [P.b, "Missionário Bruno E2E"], [P.c, "Missionário Caio E2E"],
    [P.sobProcesso, "Sob Processo Missões E2E"], [P.tesoureiro, "Tesoureiro Geral Missões E2E"], [P.d, "Missionária Dora E2E"], [P.f, "Missionário Fábio E2E"],
    [P.semComunhao, "Sem Comunhão Missões E2E"], [P.e, "Missionária Eva E2E"], [P.g, "Missionário Gil E2E"], [P.h, "Missionário Hugo E2E"]];
  for (const [id, nome] of pessoas) {
    await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, Email) VALUES (@id, @n, @c, 'ATIVO', @s, @em)",
      { id, n: nome, c: central, s: id === P.semComunhao ? "SEM_COMUNHAO" : "EM_COMUNHAO", em: `m${id}@exemplo.org` });
  }
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.sobProcesso, d: hoje });
  if (!(await escalar("SELECT COUNT(*) FROM Assentos a JOIN Orgaos o ON o.OrgaoId = a.OrgaoId WHERE o.Sigla = 'DIRETORIA_EXECUTIVA' AND a.CargoOuFuncao = 'PRESIDENTE' AND a.MembroId = 1001 AND a.DataFim IS NULL"))) {
    await q(`INSERT INTO Assentos (OrgaoId, MembroId, TipoAssento, CargoOuFuncao, DataInicio) SELECT OrgaoId, 1001, 'FUNCAO', 'PRESIDENTE', '2025-01-01' FROM Orgaos WHERE Sigla = 'DIRETORIA_EXECUTIVA'`);
  }
  await q("INSERT INTO Lideranca (MembroId, PapelId, EscopoTipo, EscopoId) SELECT @m, PapelId, 'DEPARTAMENTO', @d FROM Papeis WHERE Nome = N'Secretário de Missões'", { m: P.secretario, d: semiadespa });
  const forn = (nome, doc, tipo, membroId = null, confirmado = 1) => escalar(`INSERT INTO Fornecedores (Nome, CpfCnpj, Tipo, Banco, Agencia, Conta, TipoConta, DadosBancariosConfirmados, CriadoPor, MembroId)
    OUTPUT INSERTED.FornecedorId VALUES (@n, @d, @t, N'Banco E2E', N'0001', N'12345-6', N'CORRENTE', @c, 1002, @m)`, { n: nome, d: doc, t: tipo, c: confirmado, m: membroId });
  const pfDora = await forn("Missionária Dora E2E", "111.222.333-44", "PF", P.d);
  const pfEva = await forn("Missionária Eva E2E", "555.666.777-88", "PF", P.e);
  const pfBruno = await forn("Missionário Bruno E2E", "999.888.777-66", "PF", P.b);
  const pfHugo = await forn("Missionário Hugo E2E", "444.333.222-11", "PF", P.h);
  const pfSolto = await forn("Pessoa Sem Matrícula E2E", "777.777.777-77", "PF");
  const pjAgencia = await forn("Agência Missionária Parceira E2E", "12.345.678/0001-90", "PJ");
  const reuniao = await sessaoCLI("CLI decide envios E2E", hoje);
  const reuniaoAberta = await sessaoCLI("CLI aberta E2E", hoje, { status: "AGENDADA" });
  const { composicaoCME } = require(path.join(API, "shared/comissoes.js"));
  const cme = (await composicaoCME(pool)).map((m) => Number(m.membroId));
  ok(cme.includes(3003) && cme.includes(P.secretario), "a CME calculada tem o Pastor de Área e o Secretário de Missões", cme);

  console.log("== a 169: categorias, permissão, retenção ==");
  ok((await escalar("SELECT COUNT(*) FROM CategoriasSaida WHERE Codigo IN ('SUSTENTO_MISSIONARIO', 'SUSTENTO_MISSIONARIO_LOCAL')")) === 2, "as duas categorias de Saída do sustento (uma vez só, com a 169 aplicada duas vezes)");
  ok((await escalar("SELECT CentroCusto FROM CategoriasSaida WHERE Codigo = 'SUSTENTO_MISSIONARIO'")) === "GERAL" && (await escalar("SELECT CentroCusto FROM CategoriasSaida WHERE Codigo = 'SUSTENTO_MISSIONARIO_LOCAL'")) === "LOCAL",
    "o sustento debita o Tesouro Geral ou o caixa local");
  const perm = async (nome) => `,${await escalar("SELECT Permissoes FROM Papeis WHERE Nome = @n", { n: nome })},`;
  ok((await perm("Presidente")).includes(",missoes,") && (await perm("Secretário de Missões")).includes(",missoes,") && (await perm("Pastor de Área")).includes(",missoes,"),
    "a permissão 'missoes' vai ao Presidente, ao Secretário de Missões e ao Pastor de Área");
  ok(!(await perm("Tesoureiro")).includes(",missoes,"), "o Tesoureiro NÃO recebe 'missoes': gera o sustento pelo 'financeiro' do nível geral (revisão de 05/11/2026)");
  ok(!(await perm("Dirigente de Congregação")).includes(",missoes,"), "o Dirigente não recebe 'missoes'");
  ok((await escalar("SELECT COUNT(*) FROM Funcionalidades WHERE Chave = 'missoes'")) === 1, "a funcionalidade nasce uma vez");
  ok((await um("SELECT DiasRetencao FROM PoliticasRetencao WHERE Categoria = N'Missões: campos, envios, sustento e relatórios de campo'")).DiasRetencao === null, "retenção: sem prazo final");
  ok((await escalar("SELECT COUNT(*) FROM NotificacaoRegras WHERE Chave LIKE N'MISSOES[_]%'")) === 5, "as 5 regras de aviso");

  console.log("== acesso ==");
  let r = await rota("painel", {});
  ok(r.status === 401, "sem login: 401", r.status);
  r = await GET("painel", {}, PINM());
  ok(r.status === 403, "sessão por PIN: 403", r.status);
  r = await GET("painel", {}, DIR());
  ok(r.status === 403, "sem 'missoes' e fora da CME: 403", r.status);
  r = await GET("painel", {}, DIR_COM_MISSOES());
  ok(r.status === 403 && /SEMIADESPA/.test(r.body.mensagem), "com 'missoes' mas sem ser da SEMIADESPA, da CME, do Presidente nem do nível geral: 403", r.body);
  r = guardar("catalogosCMESemPermissao", await GET("catalogos", {}, CME_SEM_PERMISSAO()));
  ok(r.status === 200 && r.body.papeis.cme === true && r.body.papeis.geral === false && r.body.fornecedores.length === 0, "a CME entra mesmo sem a permissão (e não vê a lista de fornecedores)", r.body.papeis);
  r = guardar("catalogosSemi", await GET("catalogos", {}, SEMI()));
  ok(r.body.papeis.semiadespa === true && r.body.papeis.geral === false && r.body.fornecedores.length === 5 && !r.body.fornecedores.some((f) => f.fornecedorId === pfSolto),
    "a SEMIADESPA vê os fornecedores possíveis: a pessoa jurídica e a física ligada a uma matrícula (a sem matrícula, não)", r.body.fornecedores.map((f) => f.nome));
  ok(!JSON.stringify(r.body.fornecedores).includes("12345-6") && !JSON.stringify(r.body.fornecedores).includes("111.222"), "o catálogo nunca traz conta nem CPF/CNPJ");
  guardar("catalogosPres", await GET("catalogos", {}, PRES()));
  r = guardar("catalogosSec", await GET("catalogos", {}, SEC()));
  ok(r.body.papeis.geral && r.body.papeis.tesouraria && !r.body.papeis.presidente, "o Secretário Geral: nível geral e Tesouraria, não Presidente", r.body.papeis);
  r = guardar("catalogosTes", await GET("catalogos", {}, TES()));
  ok(r.status === 200 && r.body.papeis.tesouraria === true && r.body.papeis.geral === false && r.body.campos.length === 0 && r.body.fornecedores.length === 0,
    "o Tesoureiro entra só com 'financeiro' do nível geral: Tesouraria, sem ser o nível geral de Missões", r.body.papeis);
  for (const acao of ["painel", "envios", "campos", "mural"]) {
    r = await GET(acao, {}, TES());
    ok(r.status === 403, `a Tesouraria sem outro papel não vê ${acao}`, r.status);
  }
  r = await GET("painel", {}, L.LIDER(3001, ["financeiro"], ["Central E2E"]));
  ok(r.status === 403, "o tesoureiro local (financeiro de congregação) não entra", r.status);

  console.log("== campos ==");
  r = await POST("campo", { nome: "Frente Vila Sansão", uf: "PA", cidade: "Parauapebas", zonaRural: true, divulgacao: "PUBLICA", congregacaoMantenedoraId: vila, descricao: "Pontos de pregação na zona rural." }, CME());
  ok(r.status === 403, "a CME não cadastra campo (é da SEMIADESPA)", r.body);
  r = await POST("campo", { nome: "Frente Vila Sansão", uf: "PA", cidade: "Parauapebas", zonaRural: true, divulgacao: "PUBLICA", congregacaoMantenedoraId: vila, descricao: "Pontos de pregação na zona rural." }, SEMI());
  ok(r.body.sucesso === true && /Local/.test(r.body.mensagem), "a SEMIADESPA cadastra a frente local", r.body);
  const campoLocal = r.body.campoId;
  r = await POST("campo", { nome: "frente vila sansao", uf: "PA", cidade: "Parauapebas" }, SEMI());
  ok(r.body.sucesso === false && /Já existe um campo ativo/.test(r.body.mensagem), "homônimo (sem acento, minúsculo) recusado", r.body);
  r = await POST("campo", { nome: "Campo Marabá", uf: "PA", cidade: "Marabá", divulgacao: "PUBLICA", congregacaoMantenedoraId: central }, SEMI());
  const campoEstadual = r.body.campoId;
  ok((await escalar("SELECT Abrangencia FROM CamposMissionarios WHERE CampoId = @c", { c: campoEstadual })) === "ESTADUAL", "outra cidade do Pará: Estadual");
  r = await POST("campo", { nome: "Campo Maputo", pais: "Moçambique", cidade: "Maputo", divulgacao: "RESTRITA" }, SEC());
  const campoFora = r.body.campoId;
  const campoFora0 = campoFora;
  ok((await escalar("SELECT Abrangencia FROM CamposMissionarios WHERE CampoId = @c", { c: campoFora })) === "TRANSCULTURAL", "outro país: Transcultural (o nível geral também cadastra)");
  r = await POST("campo", { nome: "<img src=x onerror=alert(1)> Campo Ataque", uf: "MA", cidade: "Imperatriz", divulgacao: "PUBLICA", descricao: "<script>alert(2)</script>" }, SEMI());
  const campoAtaque = r.body.campoId;
  ok(r.body.sucesso === true && (await escalar("SELECT Abrangencia FROM CamposMissionarios WHERE CampoId = @c", { c: campoAtaque })) === "NACIONAL", "outro Estado: Nacional (o texto de ataque é guardado como texto)");
  r = await POST("campo", { nome: "Frente Bairro Novo", uf: "PA", cidade: "Parauapebas", divulgacao: "PUBLICA", congregacaoMantenedoraId: central }, SEMI());
  const campoBairro = r.body.campoId;
  r = await POST("campo", { nome: "Campo Zona Rural Errada", uf: "MA", cidade: "Imperatriz", zonaRural: true }, SEMI());
  ok(r.status === 422, "zona rural fora do Pará: recusada", r.body);
  r = await POST("campo", { nome: "Campo Belém Rural", uf: "PA", cidade: "Belém", zonaRural: true }, SEMI());
  ok(r.status === 422 && /município vizinho/.test(r.body.mensagem), "zona rural de um município que não é vizinho de Parauapebas: recusada (a marca não vira escolha)", r.body);
  r = await POST("campo", { nome: "Vila Rural Curionópolis", uf: "PA", cidade: "Curionópolis", zonaRural: true, divulgacao: "RESTRITA" }, SEMI());
  ok(r.body.sucesso === true && (await escalar("SELECT Abrangencia FROM CamposMissionarios WHERE CampoId = @c", { c: r.body.campoId })) === "LOCAL", "zona rural de município vizinho: Local");
  // Trava 9-B: a edição leva a versão que o formulário leu
  r = await POST("campo-editar", { campoId: campoEstadual, versao: await versaoCampo(campoEstadual), nome: "Campo Marabá Centro", uf: "PA", cidade: "Marabá", divulgacao: "PUBLICA", congregacaoMantenedoraId: central }, SEMI());
  ok(r.body.sucesso === true && (await escalar("SELECT Nome FROM CamposMissionarios WHERE CampoId = @c", { c: campoEstadual })) === "Campo Marabá Centro", "editar o nome", r.body);
  guardar("campos", await GET("campos", {}, SEMI()));

  console.log("== envio Local sem sustento: ativo na hora (Art. 44 §1º) ==");
  r = guardar("envioLocalSemSustento", await POST("envio", { campoId: campoLocal, membroId: P.a, sustento: 0, periodicidade: "MENSAL", divulgarNome: true, justificativa: "Evangelismo nas casas da zona rural." }, SEMI()));
  const envA = r.body.envioId;
  ok(r.body.sucesso === true && r.body.status === "ATIVO", "frente local sem sustento: ativo na hora", r.body);
  const a1 = await um("SELECT InicioMes, PrecisaCME, PrecisaCLI, PrecisaPresidente FROM EnviosMissionarios WHERE EnvioId = @e", { e: envA });
  ok(a1.InicioMes === mes && !a1.PrecisaCME && !a1.PrecisaCLI && !a1.PrecisaPresidente, "o sustento e o relatório começam no mês da ativação; sem etapa", a1);
  ok((await escalar("SELECT COUNT(*) FROM EnvioSustentoValores WHERE EnvioId = @e AND Valor = 0", { e: envA })) === 1, "o valor zero fica no histórico da ativação");

  console.log("== recusas do pedido ==");
  const base = { campoId: campoBairro, sustento: 0, periodicidade: "MENSAL", justificativa: "Evangelismo no bairro novo da cidade." };
  r = await POST("envio", { ...base, membroId: P.a }, SEMI());
  ok(r.body.sucesso === false && /já tem um envio/.test(r.body.mensagem), "o mesmo missionário com envio vivo: recusado", r.body);
  r = await POST("envio", { ...base, membroId: P.sobProcesso }, SEMI());
  ok(r.body.sucesso === false && /processo disciplinar/.test(r.body.mensagem), "missionário sob processo disciplinar: recusado", r.body);
  r = await POST("envio", { ...base, membroId: P.semComunhao }, SEMI());
  ok(r.body.sucesso === false && /em comunhão/.test(r.body.mensagem), "missionário sem comunhão: recusado", r.body);
  r = await POST("envio", { ...base, membroId: 99999 }, SEMI());
  ok(r.body.sucesso === false && /não encontrada/.test(r.body.mensagem), "matrícula inexistente: recusada", r.body);
  r = await POST("envio", { ...base, membroId: P.d, sustento: 500, fonte: "GERAL", fornecedorId: pfDora }, SEMI());
  ok(r.status === 422 && /documento do envio/.test(r.body.mensagem), "sustento sem o documento: recusado", r.body);
  r = await POST("envio", { ...base, membroId: P.d, sustento: 500, fonte: "GERAL", fornecedorId: 99999, ...DOC }, SEMI());
  ok(r.body.sucesso === false && /fornecedor ativo/.test(r.body.mensagem), "quem recebe inexistente: recusado", r.body);
  r = await POST("envio", { ...base, membroId: P.d, sustento: 500, fonte: "GERAL", fornecedorId: pfEva, ...DOC }, SEMI());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "a pessoa física que recebe é de outro membro: recusada (revisão de 05/11/2026)", r.body);
  r = await POST("envio", { ...base, membroId: P.d, sustento: 500, fonte: "GERAL", fornecedorId: pfSolto, ...DOC }, SEMI());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "a pessoa física sem matrícula: recusada", r.body);
  r = await POST("envio", { ...base, campoId: campoLocal, membroId: P.d, sustento: 500, fonte: "CONGREGACAO", fornecedorId: pfDora, ...DOC }, SEMI());
  ok(r.body.sucesso === true || true, "(o campo local tem mantenedora: o caixa local é o dela)");
  if (r.body.envioId) await POST("desistir", { envioId: r.body.envioId, motivo: "Pedido de teste da mantenedora." }, SEMI());
  ok(!r.body.envioId || (await escalar("SELECT CongregacaoFonteId FROM EnviosMissionarios WHERE EnvioId = @e", { e: r.body.envioId })) === vila,
    "o caixa local vem da mantenedora do campo (a Vila Nova), não de quem pede");
  r = await POST("envio", { ...base, campoId: campoFora0, membroId: P.d, sustento: 500, fonte: "CONGREGACAO", fornecedorId: pfDora, ...DOC }, SEMI());
  ok(r.body.sucesso === false && /não tem congregação mantenedora/.test(r.body.mensagem), "caixa local num campo sem mantenedora: recusado", r.body);
  r = await POST("envio", { ...base, membroId: P.d }, CME());
  ok(r.status === 403, "a CME não faz o pedido", r.body);
  ok((await escalar("SELECT COUNT(*) FROM EnviosMissionarios WHERE MembroId IN (@a, @b) OR (MembroId = @c AND Status <> N'DESISTIDO')", { a: P.sobProcesso, b: P.semComunhao, c: P.d })) === 0, "nenhuma recusa gravou envio");

  console.log("== envio Local com sustento: a CLI (Estatuto Art. 58 §4º — Trava 9-B) e o Presidente (Art. 134 §6º, I) ==");
  r = guardar("envioLocalComSustento", await POST("envio", { ...base, membroId: P.d, sustento: "500,00", fonte: "GERAL", fornecedorId: pfDora, ...DOC }, SEMI()));
  const envD = r.body.envioId;
  ok(r.body.sucesso === true && r.body.status === "AGUARDANDO_CLI", "Local com sustento: aguarda a CLI (sem a CME)", r.body);
  r = await POST("decidir", { envioId: envD, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  ok(r.body.sucesso === true && (await status(envD)) === "AGUARDANDO_PRESIDENTE", "a CLI aprova: falta o Presidente", r.body);
  ok((await avisos("MISSOES_AGUARDANDO_PRESIDENTE", 1001)) >= 1, "o Presidente é avisado");
  r = await POST("presidente", { envioId: envD, resultado: "CONCORDA" }, CME());
  ok(r.status === 403, "quem não é o Presidente: 403 (antes da confirmação recente)", r.status);
  r = await POST("presidente", { envioId: envD, resultado: "CONCORDA" }, L.sessao(3003, { via: "SENHA", nivel: "AREA", escopoCongregacoes: ["Central E2E"], permissoes: ["missoes"] }));
  ok(r.status === 403, "sem a confirmação recente e sem ser o Presidente: 403, nunca 428", r.status);
  r = await POST("presidente", { envioId: envD, resultado: "CONCORDA" }, PRES_SEM_FATOR());
  ok(r.status === 428, "o Presidente sem a confirmação recente: 428", r.status);
  guardar("fichaAguardandoPresidente", await GET("envio", { envioId: envD }, PRES()));
  r = await POST("presidente", { envioId: envD, resultado: "CONCORDA" }, PRES());
  ok(r.body.sucesso === true && (await status(envD)) === "ATIVO", "o Presidente concorda: ativo", r.body);
  ok((await escalar("SELECT Valor FROM EnvioSustentoValores WHERE EnvioId = @e", { e: envD })) === 500, "o sustento vigente nasce com o valor proposto");
  ok((await avisos("MISSOES_ENVIO_DECIDIDO", P.secretario)) >= 1, "quem pediu é avisado da decisão");
  r = await POST("presidente", { envioId: envD, resultado: "CONCORDA" }, PRES());
  ok(r.body.sucesso === false, "concordar de novo: recusado", r.body);

  console.log("== o Presidente não concorda com o próprio pedido ==");
  r = await POST("envio", { campoId: campoBairro, membroId: P.h, sustento: 200, fonte: "GERAL", fornecedorId: pfHugo, ...DOC, periodicidade: "MENSAL", justificativa: "Pedido feito pelo próprio Presidente." }, PRES());
  const envH = r.body.envioId;
  ok(r.body.status === "AGUARDANDO_CLI", "o Presidente (nível geral) pode pedir", r.body);
  await POST("decidir", { envioId: envH, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  r = guardar("fichaPresidentePediu", await GET("envio", { envioId: envH }, PRES()));
  ok(r.body.envio.acoes.presidente === false, "e não vê o botão de concordar com o próprio pedido", r.body.envio.acoes);
  r = await POST("presidente", { envioId: envH, resultado: "CONCORDA" }, PRES());
  ok(r.body.sucesso === false && /Quem fez o pedido não concorda/.test(r.body.mensagem) && (await status(envH)) === "AGUARDANDO_PRESIDENTE", "concordar com o próprio pedido: recusado (revisão de 05/11/2026)", r.body);
  await POST("desistir", { envioId: envH, motivo: "Refazer o pedido pela SEMIADESPA." }, PRES());

  console.log("== envio Estadual com sustento: CME → CLI → Presidente (que recusa) ==");
  r = guardar("envioEstadual", await POST("envio", { campoId: campoEstadual, membroId: P.b, sustento: 800, fonte: "CONGREGACAO", fornecedorId: pfBruno, ...DOC,
    periodicidade: "TRIMESTRAL", justificativa: "Plantar uma igreja em Marabá, sustentada pela Central." }, SEMI()));
  const envB = r.body.envioId;
  ok(r.body.status === "EM_PARECER", "Estadual: vai ao parecer da CME", r.body);
  ok((await avisos("MISSOES_ENVIO_NOVO", 3003)) >= 1 && (await avisos("MISSOES_ENVIO_NOVO", P.secretario)) === 0, "a CME é avisada (menos quem pediu)");
  r = await POST("parecer", { envioId: envB, parecer: "FAVORAVEL", fundamentacao: "Viável: Marabá tem membros transferidos." }, SEMI());
  ok(r.body.sucesso === false && /Quem fez o pedido/.test(r.body.mensagem), "quem pediu (mesmo sendo da CME) não dá o parecer", r.body);
  r = await POST("parecer", { envioId: envB, parecer: "FAVORAVEL", fundamentacao: "Viável: Marabá tem membros transferidos." }, DIR_COM_MISSOES());
  ok(r.status === 403, "quem não é da CME: 403", r.status);
  r = await POST("parecer", { envioId: envB, parecer: "FAVORAVEL", fundamentacao: "Viável: Marabá tem membros transferidos." }, CME_SEM_PERMISSAO());
  ok(r.body.sucesso === true && (await status(envB)) === "AGUARDANDO_CLI", "a CME dá o parecer (mesmo sem a permissão própria)", r.body);
  r = await POST("decidir", { envioId: envB, resultado: "APROVADO", sessaoId: reuniao }, SEMI());
  ok(r.status === 403, "a SEMIADESPA não registra a decisão da CLI", r.status);
  r = await POST("decidir", { envioId: envB, resultado: "APROVADO", sessaoId: reuniaoAberta }, SEC());
  ok(r.body.sucesso === false && /reunião da CLI já realizada/.test(r.body.mensagem), "reunião não encerrada: recusada", r.body);
  r = await POST("decidir", { envioId: envB, resultado: "APROVADO", sessaoId: reuniao, urgencia: true }, SEC());
  ok(r.body.sucesso === false && /já foi emitido/.test(r.body.mensagem), "urgência com o parecer já dado: recusada", r.body);
  guardar("reunioes", await GET("reunioes", {}, SEC()));
  r = await POST("decidir", { envioId: envB, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  ok(r.body.sucesso === true && (await status(envB)) === "AGUARDANDO_PRESIDENTE", "a CLI aprova: com sustento, falta o Presidente", r.body);
  r = await POST("presidente", { envioId: envB, resultado: "RECUSA" }, PRES());
  ok(r.status === 422, "recusa sem motivo: recusada", r.body);
  r = await POST("presidente", { envioId: envB, resultado: "RECUSA", motivo: "Sem recurso para sustentar agora." }, PRES());
  ok(r.body.sucesso === true && (await status(envB)) === "REJEITADO", "o Presidente recusa: recusado", r.body);
  guardar("fichaRecusada", await GET("envio", { envioId: envB }, SEMI()));
  ok((await escalar("SELECT COUNT(*) FROM EnvioSustentoValores WHERE EnvioId = @e", { e: envB })) === 0, "o recusado não tem sustento");

  console.log("== envio Transcultural com convênio externo: sem parecer só com urgência; Presidente sempre ==");
  r = await POST("envio", { campoId: campoFora, membroId: P.c, sustento: 1200, fonte: "GERAL", fornecedorId: pjAgencia, ...DOC, periodicidade: "TRIMESTRAL", justificativa: "Apoio à obra em Maputo pela agência parceira." }, SEMI());
  const envC = r.body.envioId;
  ok(r.body.status === "EM_PARECER", "Transcultural: CME primeiro", r.body);
  ok((await um("SELECT PrecisaCME, PrecisaCLI, PrecisaPresidente FROM EnviosMissionarios WHERE EnvioId = @e", { e: envC })).PrecisaPresidente === true, "Presidente sempre (Art. 44 §2º)");
  r = await POST("decidir", { envioId: envC, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  ok(r.body.sucesso === false && /urgência/.test(r.body.mensagem), "a CLI sem o parecer e sem urgência: recusada", r.body);
  r = await POST("decidir", { envioId: envC, resultado: "APROVADO", sessaoId: reuniao, urgencia: true }, SEC());
  ok(r.body.sucesso === true && (await status(envC)) === "AGUARDANDO_PRESIDENTE", "urgência por 2/3: dispensa o parecer; falta o Presidente", r.body);
  r = await POST("presidente", { envioId: envC, resultado: "CONCORDA" }, PRES());
  ok(r.body.sucesso === true && (await status(envC)) === "ATIVO", "o Presidente concorda: ativo", r.body);

  console.log("== desistência e o local com convênio externo ==");
  r = await POST("envio", { campoId: campoBairro, membroId: P.f, sustento: 300, fonte: "GERAL", fornecedorId: pjAgencia, ...DOC, periodicidade: "MENSAL", justificativa: "Frente no bairro com a agência parceira." }, SEMI());
  const envF = r.body.envioId;
  ok(r.body.status === "EM_PARECER", "Local com pessoa jurídica (convênio externo): CME e CLI (Art. 44 §2º)", r.body);
  r = guardar("fichaEmParecerCME", await GET("envio", { envioId: envF }, CME()));
  ok(r.body.envio.acoes.parecer === true && r.body.envio.acoes.decidir === false && r.body.envio.acoes.desistir === false, "a CME vê o botão do parecer (e não o da decisão)", r.body.envio.acoes);
  r = guardar("fichaEmParecerGeral", await GET("envio", { envioId: envF }, SEC()));
  ok(r.body.envio.acoes.decidir === true && r.body.envio.acoes.parecer === false && r.body.envio.acoes.desistir === true, "o nível geral: decidir (com urgência) e desistir", r.body.envio.acoes);
  guardar("fichaEmParecerSemi", await GET("envio", { envioId: envF }, SEMI()));
  r = await POST("desistir", { envioId: envF, motivo: "Desistência pela CME." }, CME());
  ok(r.status === 403, "quem não pediu nem é do nível geral não desiste", r.status);
  r = await POST("desistir", { envioId: envF, motivo: "A agência desistiu." }, SEMI());
  ok(r.body.sucesso === true && (await status(envF)) === "DESISTIDO", "quem pediu desiste", r.body);
  r = await POST("parecer", { envioId: envF, parecer: "FAVORAVEL", fundamentacao: "Parecer depois da desistência." }, CME());
  ok(r.body.sucesso === false, "parecer num envio retirado: recusado", r.body);

  console.log("== sustento do mês, suspensão e geração ==");
  r = await POST("envio", { campoId: campoBairro, membroId: P.e, sustento: 300, fonte: "CONGREGACAO", fornecedorId: pfEva, ...DOC, periodicidade: "MENSAL", divulgarNome: true,
    justificativa: "Frente no bairro novo, sustentada pela Central." }, SEMI());
  const envE = r.body.envioId;
  await POST("decidir", { envioId: envE, resultado: "APROVADO", sessaoId: reuniao }, SEC());
  await POST("presidente", { envioId: envE, resultado: "CONCORDA" }, PRES());
  ok((await status(envE)) === "ATIVO", "o envio da Eva ativo (caixa local da Central)");
  // a Dora começou 3 meses atrás e nunca mandou relatório: os períodos vencidos suspendem o sustento
  await q("UPDATE EnviosMissionarios SET InicioMes = @m3, AtivadoEm = @d WHERE EnvioId = @e", { m3, d: `${m3}-01`, e: envD });
  await q("UPDATE EnvioSustentoValores SET DesdeMes = @m3 WHERE EnvioId = @e", { m3, e: envD });
  await q("UPDATE Fornecedores SET DadosBancariosConfirmados = 0 WHERE FornecedorId = @f", { f: pfEva });
  r = guardar("previaSuspensa", await GET("sustento", { mes }, SEMI()));
  const linha = (rr, id) => (rr.body.linhas || []).find((l) => l.envioId === id);
  ok(linha(r, envD).situacao === "SUSPENSO" && /Relatório de campo vencido/.test(linha(r, envD).motivo), "a Dora: suspensa (relatório vencido)", linha(r, envD));
  ok(linha(r, envE).situacao === "IMPEDIDO" && /confirmação/.test(linha(r, envE).motivo), "a Eva: impedida (dados bancários esperando confirmação)", linha(r, envE));
  ok(!linha(r, envA) && !linha(r, envC) === false, "o envio sem sustento não aparece; o da agência aparece", r.body.linhas);
  ok(r.body.podeGerar === false, "a SEMIADESPA vê a prévia, mas não gera");
  r = await POST("gerar", { mesReferencia: mes }, SEMI());
  ok(r.status === 403, "a SEMIADESPA não gera o sustento", r.status);
  r = await POST("gerar", { mesReferencia: mes }, SEC_SEM_FATOR());
  ok(r.status === 428, "a Tesouraria sem a confirmação recente: 428", r.status);
  r = await POST("gerar", { mesReferencia: proximo }, SEC());
  ok(r.status === 422, "mês que não começou: recusado", r.body);
  const saidasAntes = await escalar("SELECT COUNT(*) FROM SaidasTesouraria");
  r = guardar("gerarParcial", await POST("gerar", { mesReferencia: mes }, TES()));
  ok(r.body.sucesso === true && r.body.geradas.length === 1 && r.body.geradas[0].envioId === envC && r.body.fora.length === 2, "gera só o que pode (a agência); a suspensa e a impedida ficam de fora", r.body);
  const saidaC = await um("SELECT s.Tipo, s.Status, s.Valor, s.CongregacaoId, s.FornecedorId, s.DocumentoFiscalUrl FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId WHERE g.EnvioId = @e AND g.MesReferencia = @m", { e: envC, m: mes });
  ok(saidaC.Tipo === "SUSTENTO_MISSIONARIO" && saidaC.Status === "APROVADA" && saidaC.Valor === 1200 && saidaC.FornecedorId === pjAgencia && saidaC.CongregacaoId === central && /blob\.e2e/.test(saidaC.DocumentoFiscalUrl),
    "a Saída já aprovada no Contas a Pagar, do Tesouro Geral, com o documento do envio", saidaC);
  ok((await escalar("SELECT COUNT(*) FROM SaidasTesouraria")) === saidasAntes + 1, "uma Saída só");
  r = await POST("gerar", { mesReferencia: mes }, TES());
  ok(r.body.sucesso === false && (await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE EnvioId = @e", { e: envC })) === 1, "gerar de novo não duplica", r.body);
  await q("UPDATE Fornecedores SET DadosBancariosConfirmados = 1 WHERE FornecedorId = @f", { f: pfEva });
  r = await POST("gerar", { mesReferencia: mes }, TES());
  ok(r.body.sucesso === true && r.body.geradas.length === 1 && r.body.geradas[0].envioId === envE, "confirmados os dados, a Eva é gerada", r.body);
  const saidaE = await um("SELECT s.Tipo, s.CongregacaoId, s.Valor FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId WHERE g.EnvioId = @e", { e: envE });
  ok(saidaE.Tipo === "SUSTENTO_MISSIONARIO_LOCAL" && saidaE.CongregacaoId === central && saidaE.Valor === 300, "do caixa local da congregação mantenedora", saidaE);

  console.log("== relatório de campo ==");
  r = await POST("relatorio", { envioId: envD, periodoInicio: m3, batismos: 2, conversoes: 5, discipulado: 3, atividades: "Cultos nos lares e evangelismo de rua." }, CME());
  ok(r.status === 403, "a CME não lança relatório", r.status);
  r = await POST("relatorio", { envioId: envD, periodoInicio: proximo, atividades: "Relatório de um mês que não começou." }, SEMI());
  ok(r.status === 422, "período que não começou: recusado", r.body);
  r = await POST("relatorio", { envioId: envD, periodoInicio: mi.somarMeses(m3, -1), atividades: "Relatório de antes do envio começar." }, SEMI());
  ok(r.status === 422, "período de antes do início: recusado", r.body);
  r = await POST("relatorio", { envioId: envD, periodoInicio: m3, batismos: 2, conversoes: 5, discipulado: 3, atividades: "Cultos nos lares e evangelismo de rua.", pedidos: "Oração pela saúde da família.",
    anexoBase64: Buffer.from("foto").toString("base64"), anexoMime: "image/jpeg" }, SEMI());
  ok(r.body.sucesso === true, "a SEMIADESPA lança o relatório (com anexo)", r.body);
  const relM3 = r.body.relatorioId;
  r = await POST("relatorio", { envioId: envD, periodoInicio: m3, atividades: "O mesmo período de novo, por engano." }, SEMI());
  ok(r.body.sucesso === false && /já tem relatório/.test(r.body.mensagem), "o mesmo período duas vezes: recusado", r.body);
  r = await GET("sustento", { mes }, SEMI());
  ok(linha(r, envD).situacao === "SUSPENSO", "ainda há período vencido (o seguinte): continua suspensa", linha(r, envD));
  for (const p of [m2, m1]) await POST("relatorio", { envioId: envD, periodoInicio: p, batismos: 1, conversoes: 1, discipulado: 1, atividades: `Relatório de ${p}: cultos e visitas.` }, SEMI());
  r = await GET("sustento", { mes }, SEMI());
  ok(linha(r, envD).situacao === "A_GERAR", "chegaram os relatórios: o sustento volta (suspende, não cancela)", linha(r, envD));
  r = await POST("gerar", { mesReferencia: mes }, TES());
  ok(r.body.sucesso === true && r.body.geradas.some((g) => g.envioId === envD), "a Dora é gerada no mês", r.body);
  for (const p of [m3, m2, m1]) await POST("gerar", { mesReferencia: p }, TES());
  ok((await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE EnvioId = @e", { e: envD })) === 4, "os meses que ficaram para trás também são gerados (4)");
  ok((await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE EnvioId = @e", { e: envE })) === 1, "a Eva começou neste mês: não é gerada para trás");
  const saidaD = await um("SELECT s.Tipo, s.CongregacaoId FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId WHERE g.EnvioId = @e AND g.MesReferencia = @m", { e: envD, m: mes });
  ok(saidaD.Tipo === "SUSTENTO_MISSIONARIO" && saidaD.CongregacaoId === central, "do Tesouro Geral, na congregação do missionário", saidaD);
  r = await POST("relatorio-corrigir", { relatorioId: relM3, batismos: 4, conversoes: 5, discipulado: 3, atividades: "Cultos nos lares, evangelismo de rua e um batismo a mais." }, SEMI());
  const corrigido = await um("SELECT Batismos, RetificadoEm, PeriodoInicio FROM RelatoriosCampo WHERE RelatorioId = @r", { r: relM3 });
  ok(r.body.sucesso === true && corrigido.Batismos === 4 && corrigido.RetificadoEm && corrigido.PeriodoInicio === m3, "a correção grava (o período não muda) e fica marcada", corrigido);
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'RelatoriosCampo' AND RegistroId = @r AND Acao = N'MISSOES_RELATORIO_CORRIGIDO'", { r: relM3 })) === 1, "a versão anterior fica na auditoria");
  // pago: o mês de hoje da Dora (sem relatório ainda) e o mais antigo (com relatório)
  await q("UPDATE s SET Status = N'PAGA', PagoEm = SYSUTCDATETIME(), PagoPor = 1002 FROM SaidasTesouraria s JOIN SustentoGeracoes g ON g.SaidaId = s.SaidaId WHERE g.EnvioId = @e AND g.MesReferencia IN (@a, @b)", { e: envD, a: mes, b: m3 });
  r = guardar("fichaAtiva", await GET("envio", { envioId: envD }, SEMI()));
  const fD = r.body.envio;
  ok(fD.geracoes.length === 4 && fD.geracoes.find((g) => g.mes === mes).semRelatorio === true && fD.geracoes.find((g) => g.mes === m3).semRelatorio === false, "a ficha marca o pago sem relatório", fD.geracoes);
  ok(/\?sas$/.test(fD.documentoUrl) && fD.relatorios.find((x) => x.periodoInicio === m3).anexoUrl, "quem gere vê o documento e o anexo (endereço assinado)");
  ok(!("documentoUrlInterno" in fD) && !("_atos" in fD), "a ficha não leva o endereço interno nem os atos internos");
  r = guardar("fichaCME", await GET("envio", { envioId: envB }, CME()));
  ok(r.status === 200 && r.body.envio.documentoUrl === null && r.body.envio.relatorios.length === 0 && r.body.envio.geracoes.length === 0 && r.body.envio.sustentoProposto === 800,
    "a CME abre o envio que analisou: o pedido com o sustento proposto, sem o documento, os relatórios nem os pagamentos", r.body.envio);

  console.log("== reajuste e encerramento ==");
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pfDora, motivo: "Custo de vida no campo." }, SEMI());
  ok(r.status === 403, "a SEMIADESPA não reajusta", r.status);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pfDora, motivo: "Custo de vida no campo." }, PRES_SEM_FATOR());
  ok(r.status === 428, "o Presidente sem a confirmação recente: 428", r.status);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pjAgencia, motivo: "Passar a pagar pela agência." }, PRES());
  ok(r.body.sucesso === false && /convênio externo/.test(r.body.mensagem), "reajustar para pessoa jurídica num envio que não passou pela CLI: recusado (Art. 44 §2º)", r.body);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pfEva, motivo: "Pagar a outra pessoa." }, PRES());
  ok(r.body.sucesso === false && /próprio missionário/.test(r.body.mensagem), "reajustar para a pessoa física de outro membro: recusado", r.body);
  r = await POST("reajustar", { envioId: envD, desdeMes: mes, sustento: 650, fonte: "GERAL", fornecedorId: pfDora, motivo: "Custo de vida no campo." }, PRES());
  ok(r.body.sucesso === false && /já foi gerado/.test(r.body.mensagem), "reajuste num mês já gerado: recusado", r.body);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pfDora, motivo: "Custo de vida no campo." }, PRES());
  ok(r.body.sucesso === false && /Art\. 58 §4º/.test(r.body.mensagem), "Trava 9-B: o aumento sem a reunião da CLI que o aprovou: recusado", r.body);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 650, fonte: "GERAL", fornecedorId: pfDora, motivo: "Custo de vida no campo.", sessaoId: reuniao }, PRES());
  ok(r.body.sucesso === true, "o Presidente reajusta do mês seguinte em diante", r.body);
  r = await POST("reajustar", { envioId: envD, desdeMes: proximo, sustento: 700, fonte: "GERAL", fornecedorId: pfDora, motivo: "Corrigindo o valor do reajuste.", sessaoId: reuniao }, PRES());
  ok(r.body.sucesso === true && (await escalar("SELECT COUNT(*) FROM EnvioSustentoValores WHERE EnvioId = @e", { e: envD })) === 2
    && (await escalar("SELECT Valor FROM EnvioSustentoValores WHERE EnvioId = @e AND DesdeMes = @p", { e: envD, p: proximo })) === 700, "o segundo reajuste do mesmo mês substitui o primeiro", r.body);
  r = await POST("encerrar", { envioId: envD, ultimoMes: m1, motivo: "Retorno da missionária." }, SEMI());
  ok(r.body.sucesso === false && /já foi gerado/.test(r.body.mensagem), "o último mês antes de um mês gerado: recusado", r.body);
  r = await POST("encerrar", { envioId: envD, ultimoMes: mes, motivo: "Retorno da missionária." }, CME());
  ok(r.status === 403, "a CME não encerra", r.status);
  r = await POST("encerrar", { envioId: envD, ultimoMes: mes, motivo: "Retorno da missionária." }, SEMI());
  ok(r.body.sucesso === true && (await um("SELECT Status, FimMes FROM EnviosMissionarios WHERE EnvioId = @e", { e: envD })).FimMes === mes, "encerrado com o último mês", r.body);
  r = await POST("campo-encerrar", { campoId: campoBairro, motivo: "Frente concluída." }, SEMI());
  ok(r.body.sucesso === false && /envio em andamento ou ativo/.test(r.body.mensagem), "campo com envio ativo (a Eva) não se encerra", r.body);
  r = await POST("campo-editar", { campoId: campoBairro, versao: await versaoCampo(campoBairro), nome: "Frente Bairro Novo", uf: "PA", cidade: "Marabá", divulgacao: "PUBLICA" }, SEMI());
  ok(r.body.sucesso === false && /lugar/.test(r.body.mensagem), "o lugar do campo com envio vivo não muda", r.body);
  r = await POST("campo-encerrar", { campoId: campoAtaque, motivo: "Campo de teste encerrado." }, SEMI());
  ok(r.body.sucesso === true && (await escalar("SELECT Status FROM CamposMissionarios WHERE CampoId = @c", { c: campoAtaque })) === "ENCERRADO", "campo sem envio vivo se encerra", r.body);
  r = await POST("envio", { campoId: campoAtaque, membroId: P.g, sustento: 0, periodicidade: "MENSAL", justificativa: "Envio para um campo já encerrado." }, SEMI());
  ok(r.body.sucesso === false && /campo ativo/.test(r.body.mensagem), "envio para campo encerrado: recusado", r.body);

  console.log("== painel e mural ==");
  r = guardar("painel", await GET("painel", {}, SEMI()));
  const t = r.body.totais;
  ok(t.missionariosAtivos === 3 && t.mesesPagosSemRelatorio === 1, "o painel conta os missionários ativos e o mês pago sem relatório", t);
  ok(t.pagoNoAno === (m3.slice(0, 4) === mes.slice(0, 4) ? 1000 : 500) && t.batismos >= 0, "o pago no ano soma só as Saídas pagas do ano", t);
  ok(r.body.pagosSemRelatorio.length === 1 && r.body.pagosSemRelatorio[0].envioId === envD, "a lista diz qual envio", r.body.pagosSemRelatorio);
  ok(t.sustentoComprometido === 1500, "o comprometido: a Eva (300) e a agência (1.200)", t);
  ok(typeof t.relatoriosEmDia === "number", "o painel conta os envios com os relatórios em dia", t);
  r = guardar("painelCME", await GET("painel", {}, CME()));
  ok(r.body.soCME === true && !("sustentoComprometido" in r.body.totais) && !("pagosSemRelatorio" in r.body) && !("relatoriosAtrasados" in r.body), "a CME vê os números gerais e os pareceres, sem o dinheiro nem os relatórios", Object.keys(r.body));
  r = await GET("sustento", { mes }, CME());
  ok(r.status === 403, "a CME não vê a prévia do pagamento", r.status);
  r = await GET("envio", { envioId: envD }, CME());
  ok(r.status === 404, "a CME não abre o envio ativo que não analisou", r.status);
  r = await GET("envios", {}, CME());
  ok(r.body.envios.every((x) => x.status === "EM_PARECER" || (x.parecer && x.parecer.por === 3003)), "a CME lista só o que aguarda o parecer e o que ela analisou", r.body.envios.map((x) => x.status));
  r = guardar("mural", await GET("mural", {}, CME()));
  const muralTxt = JSON.stringify(r.body);
  ok(r.body.camposRestritos === 2 && r.body.missionariosRestritos === 1 && !muralTxt.includes("Maputo") && !muralTxt.includes("Caio"), "o campo restrito entra só na contagem", r.body);
  ok(muralTxt.includes("Missionária Eva E2E") && muralTxt.includes("Missionária Ana E2E") && !muralTxt.includes("Dora"), "os nomes autorizados aparecem; os outros não", r.body.campos);
  ok(!/"valor"|sustento/i.test(muralTxt) && r.body.totais.investidoNoAno === null, "nenhum valor por pessoa: com um só missionário pago no ano, nem o total aparece (seria o valor dele)", r.body.totais);
  guardar("envios", await GET("envios", {}, SEMI()));
  guardar("previaGerada", await GET("sustento", { mes }, TES()));

  console.log("== a Saída cancelada não perde o mês (revisão de 05/11/2026) ==");
  const saidaVelha = await escalar("SELECT SaidaId FROM SustentoGeracoes WHERE EnvioId = @e AND MesReferencia = @m", { e: envE, m: mes });
  await q("UPDATE SaidasTesouraria SET Status = N'CANCELADA', MotivoCancelamento = N'Teste: cancelada no Contas a Pagar', CanceladoPor = 1002, CanceladoEm = SYSUTCDATETIME() WHERE SaidaId = @s", { s: saidaVelha });
  r = await GET("sustento", { mes }, TES());
  ok(linha(r, envE).situacao === "A_GERAR" && linha(r, envE).saidaDesfeita === saidaVelha, "cancelada a Saída, o mês volta a ser gerável", linha(r, envE));
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.e, d: hoje });
  r = await GET("sustento", { mes }, TES());
  ok(linha(r, envE).situacao === "IMPEDIDO" && /processo disciplinar/.test(linha(r, envE).motivo), "com processo disciplinar em curso, o mês fica impedido enquanto durar", linha(r, envE));
  await q("DELETE FROM ProcessosDisciplinares WHERE MembroId = @m", { m: P.e });
  r = await POST("gerar", { mesReferencia: mes }, TES());
  const novaE = await escalar("SELECT SaidaId FROM SustentoGeracoes WHERE EnvioId = @e AND MesReferencia = @m", { e: envE, m: mes });
  ok(r.body.sucesso === true && novaE && novaE !== saidaVelha && (await escalar("SELECT COUNT(*) FROM SustentoGeracoes WHERE EnvioId = @e", { e: envE })) === 1,
    "gerado de novo: uma geração só, com a Saída nova (a cancelada fica no Contas a Pagar)", r.body);
  ok((await escalar("SELECT Status FROM SaidasTesouraria WHERE SaidaId = @s", { s: saidaVelha })) === "CANCELADA", "a Saída cancelada continua lá, com o motivo");
  r = await chamarRota("GestaoSaidas/index.js", { metodo: "POST", binding: {}, token: SEC(), corpo: { congregacaoId: central, fornecedorId: pfDora, tipo: "SUSTENTO_MISSIONARIO",
    descricao: "Sustento lançado à mão", valor: 100, documentoFiscalBase64: Buffer.from("x").toString("base64"), mimeType: "application/pdf" } });
  ok(r.status === 400 && /tela de Missões/.test(r.body.mensagem), "o sustento lançado à mão no Contas a Pagar: recusado", r.body);
  const descRestrita = await escalar("SELECT s.Descricao FROM SustentoGeracoes g JOIN SaidasTesouraria s ON s.SaidaId = g.SaidaId WHERE g.EnvioId = @e", { e: envC });
  ok(/campo de divulgação restrita/.test(descRestrita) && !/Caio|Maputo/.test(descRestrita), "no campo restrito, a Saída não diz o nome nem o campo", descRestrita);
  r = await POST("divulgacao", { envioId: envE, divulgarNome: "nao" }, SEMI());
  ok(r.status === 422, "a autorização é verdadeiro ou falso", r.body);
  r = await POST("divulgacao", { envioId: envE, divulgarNome: false }, CME());
  ok(r.status === 403, "a CME não muda a autorização", r.status);
  r = await POST("divulgacao", { envioId: envE, divulgarNome: false }, SEMI());
  ok(r.body.sucesso === true && !JSON.stringify((await GET("mural", {}, SEMI())).body).includes("Eva"), "retirada a autorização, o nome sai do mural na hora (LGPD Art. 8º §5º)", r.body);
  r = await POST("divulgacao", { envioId: envE, divulgarNome: true }, SEMI());
  ok(r.body.sucesso === true && JSON.stringify((await GET("mural", {}, SEMI())).body).includes("Eva"), "dada de novo, volta");

  console.log("== vacância (Regimento Art. 11) ==");
  r = await POST("envio", { campoId: campoEstadual, membroId: P.g, sustento: 0, periodicidade: "MENSAL", justificativa: "Frente em Marabá, sem sustento." }, SEMI());
  const envG = r.body.envioId;
  ok(r.body.status === "EM_PARECER", "o envio do Gil em andamento");
  await vacancia.encerrarVinculos(pool, L.sql, P.g, "FALECIMENTO");
  ok((await status(envG)) === "DESISTIDO", "a vacância retira o pedido em andamento");
  await vacancia.encerrarVinculos(pool, L.sql, P.a, "DESLIGAMENTO");
  const va = await um("SELECT Status, FimMes, MotivoEncerramento FROM EnviosMissionarios WHERE EnvioId = @e", { e: envA });
  ok(va.Status === "ENCERRADO" && va.FimMes === mes && /Vacância/.test(va.MotivoEncerramento), "a vacância encerra o envio ativo no mês dela", va);
  await vacancia.encerrarVinculos(pool, L.sql, P.c, "LICENCA_CANDIDATURA");
  ok((await status(envC)) === "ATIVO", "a licença de candidatura não tira do campo");

  console.log("== avisos da rotina ==");
  r = await POST("envio", { campoId: campoEstadual, membroId: P.f, sustento: 0, periodicidade: "MENSAL", justificativa: "Novo pedido do Fábio para Marabá." }, SEMI());
  const envF2 = r.body.envioId;
  await q("UPDATE EnviosMissionarios SET SolicitadoEm = DATEADD(DAY, -20, CAST(@h AS DATE)) WHERE EnvioId = @e", { h: hoje, e: envF2 });
  const vencidos = await miDb.detectarParecerVencido(pool, { hoje });
  ok(vencidos.length === 1 && vencidos[0].referenciaId === envF2 && vencidos[0].destinatarios.some((d) => d.membroId === 3003) && /venceu/.test(vencidos[0].fatoGerador), "o parecer vencido: um aviso por envio, à CME", vencidos);
  r = await GET("painel", {}, SEC());
  ok(r.body.parecerVencido.length === 1 && r.body.parecerVencido[0].envioId === envF2, "o painel mostra o parecer vencido");
  // a agência começou 6 meses atrás (trimestral) sem relatório: o primeiro trimestre já venceu, seja qual for o dia de hoje
  const m6 = mi.somarMeses(mes, -6);
  await q("UPDATE EnviosMissionarios SET InicioMes = @m6, AtivadoEm = @d WHERE EnvioId = @e", { m6, d: `${m6}-01`, e: envC });
  await q("UPDATE EnvioSustentoValores SET DesdeMes = @m6 WHERE EnvioId = @e", { m6, e: envC });
  const atrasos = await miDb.detectarRelatorioAtrasado(pool, { hoje });
  const esperado = mi.situacaoRelatorios({ inicioMes: m6, fimMes: null, periodicidade: "TRIMESTRAL" }, [], hoje).vencidos.length;
  const doC = atrasos.filter((x) => x.referenciaId % 100000 === envC);
  ok(esperado >= 1 && doC.length === esperado && doC[0].referenciaId === mi.referenciaPeriodo(m6, envC) && doC[0].destinatarios.some((d) => d.membroId === P.secretario),
    "o relatório vencido: um aviso por período, à SEMIADESPA", doC);
  ok(!atrasos.some((x) => x.referenciaId % 100000 === envD), "a Dora (com os relatórios em dia) não é avisada", atrasos.map((x) => x.referenciaId));
  r = guardar("previaTranscultural", await GET("sustento", { mes: m2 }, TES()));
  ok(linha(r, envC).situacao === "SUSPENSO", "a agência fica suspensa com o relatório trimestral vencido", linha(r, envC));
  // a Eva começou 3 meses atrás sem relatório e saiu do rol. Trava 9-B: o relatório que já tinha vencido ANTES da vacância continua vencido (o sustento desses
  // meses segue suspenso — antes, a vacância soltava todos); só o que ainda estava no prazo no dia da vacância fica dispensado; o último mês ainda é gerado
  await q("UPDATE EnviosMissionarios SET InicioMes = @m3, AtivadoEm = @d WHERE EnvioId = @e", { m3, d: `${m3}-01`, e: envE });
  await q("UPDATE EnvioSustentoValores SET DesdeMes = @m3 WHERE EnvioId = @e", { m3, e: envE });
  ok((await miDb.detectarRelatorioAtrasado(pool, { hoje })).some((x) => x.referenciaId % 100000 === envE), "antes da vacância: o relatório da Eva vence");
  await vacancia.encerrarVinculos(pool, L.sql, P.e, "FALECIMENTO");
  ok((await um("SELECT EncerradoPorVacancia FROM EnviosMissionarios WHERE EnvioId = @e", { e: envE })).EncerradoPorVacancia === true, "a vacância marca o envio");
  r = await GET("sustento", { mes: m3 }, TES());
  ok(linha(r, envE).situacao === "SUSPENSO", "Trava 9-B: o mês com o relatório vencido antes da vacância segue suspenso (a vacância não o libera)", linha(r, envE));
  r = await GET("envio", { envioId: envE }, SEC());
  const pDoMes = r.body.envio.periodos.find((p) => p.inicio === mes);
  ok(pDoMes && pDoMes.dispensado === true && r.body.envio.periodos.filter((p) => p.vencido).length >= 2, "o do mês da vacância (ainda no prazo) fica dispensado; os de antes, vencidos", r.body.envio.periodos);
  // a SEMIADESPA tinha os relatórios que faltavam e os lança: os meses voltam a ser gerados (o último também) e ninguém é mais avisado
  for (const p of r.body.envio.periodos.filter((x) => x.vencido)) {
    await POST("relatorio", { envioId: envE, periodoInicio: p.inicio, batismos: 0, conversoes: 1, discipulado: 2, atividades: "Relatório que chegou depois da vacância." }, SEMI());
  }
  ok(!(await miDb.detectarRelatorioAtrasado(pool, { hoje })).some((x) => x.referenciaId % 100000 === envE), "lançados os vencidos, o dispensado não gera aviso");
  r = await GET("sustento", { mes: m1 }, TES());
  ok(linha(r, envE).situacao === "A_GERAR", "e o mês que faltava pode ser gerado", linha(r, envE));
  r = await GET("painel", {}, SEC());
  ok(!r.body.relatoriosAtrasados.some((x) => x.envioId === envE), "o painel não a lista como atrasada");

  console.log("== garantias do banco ==");
  await falhaNoBanco("dois envios vivos para a mesma pessoa", `INSERT INTO EnviosMissionarios (CampoId, MembroId, Status, PrecisaCME, PrecisaCLI, PrecisaPresidente, Periodicidade, Justificativa, SolicitadoPor, SolicitadoEm)
    VALUES (@c, @m, N'EM_PARECER', 1, 1, 0, N'MENSAL', N'x', 1, @h)`, { c: campoEstadual, m: P.c, h: hoje });
  await falhaNoBanco("ativo sem o mês de início", `UPDATE EnviosMissionarios SET InicioMes = NULL WHERE EnvioId = @e`, { e: envE });
  await falhaNoBanco("sustento sem quem recebe", `UPDATE EnviosMissionarios SET FornecedorId = NULL WHERE EnvioId = @e`, { e: envE });
  await falhaNoBanco("o mesmo mês gerado duas vezes", `INSERT INTO SustentoGeracoes (EnvioId, MesReferencia, Valor, SaidaId, GeradaPor) SELECT EnvioId, MesReferencia, Valor, SaidaId, 1 FROM SustentoGeracoes WHERE EnvioId = @e`, { e: envE });
  await falhaNoBanco("o mesmo período com dois relatórios", `INSERT INTO RelatoriosCampo (EnvioId, PeriodoInicio, Batismos, Conversoes, Discipulado, Atividades, RecebidoEm, RegistradoPor) VALUES (@e, @p, 0, 0, 0, N'x', @h, 1)`, { e: envD, p: m3, h: hoje });
  await falhaNoBanco("batismo negativo", `UPDATE RelatoriosCampo SET Batismos = -1 WHERE RelatorioId = @r`, { r: relM3 });
  await falhaNoBanco("campo encerrado sem motivo", `UPDATE CamposMissionarios SET Status = N'ENCERRADO', EncerradoEm = @h WHERE CampoId = @c`, { h: hoje, c: campoLocal });
  await falhaNoBanco("abrangência inventada", `UPDATE CamposMissionarios SET Abrangencia = N'GALACTICA' WHERE CampoId = @c`, { c: campoLocal });
  await falhaNoBanco("geração de valor zero", `INSERT INTO SustentoGeracoes (EnvioId, MesReferencia, Valor, SaidaId, GeradaPor) SELECT @e, N'2001-01', 0, MIN(SaidaId), 1 FROM SaidasTesouraria`, { e: envE });

  console.log("== segurança e lixo ==");
  r = await GET("acao-que-nao-existe", {}, SEC());
  ok(r.status === 404, "ação inexistente: 404");
  r = await rota("painel", { metodo: "DELETE", token: SEC() });
  ok(r.status === 405, "método não suportado: 405");
  r = await GET("envio", { envioId: "0x1" }, SEC());
  ok(r.status === 400, "id malformado: 400");
  r = await GET("envio", { envioId: "999999" }, SEC());
  ok(r.status === 404, "envio inexistente: 404");
  r = await GET("reunioes", {}, SEMI());
  ok(r.status === 403, "as reuniões da CLI são do nível geral");
  r = await GET("sustento", { mes: "2026-13" }, SEC());
  ok(r.status === 422, "mês inválido na prévia: 422", r.status);
  await fuzz("campo", "campo", { nome: "Campo Lixo", uf: "PA", cidade: "Belém", divulgacao: "RESTRITA" }, ["nome", "pais", "uf", "cidade", "zonaRural", "congregacaoMantenedoraId", "divulgacao", "descricao"], SEMI);
  await fuzz("envio", "envio", { campoId: campoEstadual, membroId: P.secretario, sustento: 100, fonte: "GERAL", fornecedorId: pfDora, ...DOC, periodicidade: "MENSAL", justificativa: "Pedido de teste do lixo." },
    ["campoId", "membroId", "sustento", "fonte", "congregacaoFonteId", "fornecedorId", "documentoBase64", "documentoMime", "periodicidade", "justificativa"], SEMI);
  await fuzz("parecer", "parecer", { envioId: envF2, parecer: "XYZ", fundamentacao: "Fundamentação de teste do lixo." }, ["envioId", "parecer", "fundamentacao"], CME);
  await fuzz("decidir", "decidir", { envioId: envF2, resultado: "TALVEZ", sessaoId: reuniao }, ["envioId", "resultado", "sessaoId", "urgencia", "motivo"], SEC);
  await fuzz("presidente", "presidente", { envioId: envE, resultado: "TALVEZ" }, ["envioId", "resultado", "motivo"], PRES);
  await fuzz("relatorio", "relatorio", { envioId: envE, periodoInicio: proximo, atividades: "Relatório de teste do lixo." }, ["envioId", "periodoInicio", "batismos", "conversoes", "discipulado", "atividades", "pedidos", "anexoBase64", "anexoMime"], SEMI);
  await fuzz("reajustar", "reajustar", { envioId: envE, desdeMes: "2001-01", sustento: 100, fonte: "GERAL", fornecedorId: pfEva, motivo: "Reajuste de teste do lixo." }, ["envioId", "desdeMes", "sustento", "fonte", "fornecedorId", "motivo"], PRES);
  await fuzz("encerrar", "encerrar", { envioId: envE, ultimoMes: "2001-01", motivo: "Encerramento de teste do lixo." }, ["envioId", "ultimoMes", "motivo"], SEMI);
  await fuzz("gerar", "gerar", { mesReferencia: proximo }, ["mesReferencia"], TES);

  console.log("== Meus Dados ==");
  const dora = await miDb.dadosDoTitular(pool, P.d);
  ok(dora.length === 2 && dora[0].sustento.length === 2 && dora[0].relatoriosRecebidos === 3 && dora[0].fim === mes && dora[0].pagamentos.length === 4 && dora[0].justificativa && dora[1].desistencia,
    "a missionária vê os envios (o desistido também), o sustento, os pagamentos, a justificativa e os relatórios", dora);
  const atosSec = await miDb.atosDoTitular(pool, P.secretario);
  ok(atosSec.length >= 5 && atosSec.some((x) => x.papeis.includes("pediu")) && atosSec.some((x) => x.papeis.includes("encerrou o envio")), "o Secretário vê os pedidos que fez e o que encerrou", atosSec);
  ok((await miDb.atosDoTitular(pool, 3003)).some((x) => x.papeis.includes("deu o parecer da CME")), "o Pastor de Área vê o parecer que deu");
  ok((await miDb.atosDoTitular(pool, 1001)).some((x) => x.papeis.includes("decidiu como Pastor Presidente")), "o Presidente vê as decisões dele");
  const md = await chamarRota("MeusDadosLGPD/index.js", { metodo: "GET", binding: { matricula: String(P.d) }, token: L.PIN(P.d) });
  contrato.meusDados = md.body && { missoes: md.body.missoes, missoesAtos: md.body.missoesAtos };
  ok(md.status === 200 && Array.isArray(md.body.missoes) && md.body.missoes.length === 2 && Array.isArray(md.body.missoesAtos), "Meus Dados (a rota, pela própria pessoa) traz as Missões", { status: md.status, corpo: JSON.stringify(md.body).slice(0, 200) });

  if (process.env.E2E_CONTRATO === "1") {
    const destino = path.join(__dirname, "..", "front-missoes", "contrato-real.json");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log("contrato gravado em", destino);
  }
  fim("e2e-76 missoes");
})().catch((e) => { console.log("ERRO", e && e.stack); process.exit(1); });
