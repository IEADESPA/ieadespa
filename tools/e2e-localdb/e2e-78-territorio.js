// e2e-78-territorio.js — v9.5 (Mapa territorial): fluxos, garantias do banco, segurança e lixo, com os handlers e o banco REAIS, sobre a base
// "cenario-territorio" (`bash rodar.sh preparar-territorio`: a base de Missões com a 170 aplicada duas vezes). Monta o próprio cenário.
// O endereço em linhas (Pessoas e Meus Dados; a linha única montada; a tela antiga), o cadastro de bairros (a fila dos escritos, homônimo sem acento, renomear,
// desativar, juntar), o ponto das Extensões, o mapa de cobertura (descoberto pelo raio; o escopo do Dirigente), a densidade, a tabela de critérios e a simulação
// de emancipação (cada indicador medido de verdade), o atalho de quem pode pedir, a emancipação levando o ponto, a LGPD e o lixo.
const L = require("./lib");
const { ok, fim, q, um, escalar, obterPool, path, API, hojeBr, LIXO } = L;
const { chamarRota } = require("./lib-afm");
const fs = require("fs");
const crypto = require("crypto");

console.error = () => { };
const contrato = {};
const guardar = (nome, r) => { contrato[nome] = r && r.body; return r; };
const tr = require(path.join(API, "shared/territorio.js"));
const terDb = require(path.join(API, "shared/territorioDb.js"));
const rota = (acao, { token, metodo = "GET", corpo, query } = {}) => chamarRota("GestaoTerritorio/index.js", { metodo, binding: acao ? { acao } : {}, token, corpo, query });
const POST = (acao, corpo, token) => rota(acao, { metodo: "POST", corpo, token });
const GET = (acao, query, token) => rota(acao, { query, token });
const pessoas = (corpo, token, metodo = "POST", query) => chamarRota("GestaoPessoas/index.js", { metodo, binding: {}, token, corpo, query });
const meusDados = (matricula, corpo, metodo = "POST") => chamarRota("AtualizarMeusDados/index.js", { metodo, binding: { matricula: String(matricula) }, token: L.PIN(matricula), corpo });
const hoje = hojeBr();
const mesesAtras = (n) => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
const jan = tr.janela12Meses(hoje);
const mesAtual = hoje.slice(0, 7);
const mesAntesDaJanela = (() => { const [y, m] = jan.de.split("-").map(Number); const t = y * 12 + m - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; })();

const SID_SEC = crypto.randomUUID();
const SEC = () => L.sessao(1002, { via: "SENHA", fator: { via: "CHAVE", em: Date.now() }, nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["expansao", "pessoas", "reunioes"], sid: SID_SEC });
const DIR = () => L.LIDER(3001, ["expansao", "pessoas"], ["Central E2E"]);
const DIR_VILA = () => L.LIDER(9850, ["expansao"], ["Vila Nova E2E"]);
const CME = () => L.LIDER(3003, ["expansao"], ["Central E2E", "Vila Nova E2E"], "AREA");
const CME_SEM_PERMISSAO = () => L.LIDER(3003, [], ["Central E2E", "Vila Nova E2E"], "AREA");
const SEM = () => L.LIDER(3001, ["pessoas"], ["Central E2E"]);
const PINM = () => L.sessao(3001, { via: "PIN", permissoes: ["expansao"] });
const P = { c1: 9801, c2: 9802, c3: 9803, c4: 9804, c5: 9805, c6: 9806, cDeslig: 9807, v1: 9811, v2: 9812, v3: 9813,
  enc: 9821, presb: 9822, diac: 9823, m4: 9824, semCom: 9825, sobProc: 9826, extDeslig: 9827 };

const TABELAS = ["Bairros", "CriteriosEmancipacao", "TerritorioParametros", "ExtensoesTenda", "MembroReferencia"];
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
    if (![200, 201, 400, 403, 404, 422].includes(r.status)) quebras.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} -> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    else if (r.status >= 400 && (await retrato()) !== antes) mudancas.push(`${campo}=${JSON.stringify(lixo).slice(0, 30)} mexeu no banco`);
    if (r.body && /SELECT |INSERT |UPDATE |mssql|tedious|node_modules/i.test(JSON.stringify(r.body))) quebras.push(`${campo} vazou texto interno`);
  }
  ok(quebras.length === 0, `${rotulo}: ${n} chamadas com lixo, nenhuma 500 nem vazamento`, quebras.slice(0, 5));
  ok(mudancas.length === 0, `${rotulo}: chamada recusada nunca altera o banco`, mudancas.slice(0, 5));
}
async function falhaNoBanco(rotulo, texto, params) {
  let erro = null;
  try { await q(texto, params); } catch (e) { erro = e; }
  ok(!!erro, `banco: ${rotulo}`, erro ? undefined : ["passou sem erro"]);
}
const linhaMembro = (id) => um("SELECT * FROM MembroReferencia WHERE MembroId = @id", { id });
const bairroDoMapa = (mapa, nome) => (mapa.bairros || []).find((b) => b.nome === nome);

(async () => {
  const pool = await obterPool();
  console.log("== a 170 (aplicada duas vezes) ==");
  ok((await escalar("SELECT COUNT(*) FROM CriteriosEmancipacao")) === 5, "a régua inicial: 5 critérios, semeados uma vez só");
  ok((await um("SELECT RaioCoberturaKm, CriteriosSemeados FROM TerritorioParametros WHERE Id = 1")).CriteriosSemeados === true, "a marca de semeado ficou gravada");
  ok(Number((await um("SELECT RaioCoberturaKm FROM TerritorioParametros WHERE Id = 1")).RaioCoberturaKm) === 3, "o raio começa em 3 km");
  ok((await escalar("SELECT COUNT(*) FROM TerritorioParametros")) === 1, "uma linha só de parâmetros");
  await q("DELETE FROM CriteriosEmancipacao");
  const reaplica = require("child_process").spawnSync(process.execPath, ["-r", "./shim-mssql.js", "aplicar-migracao.js", "170", "1"], { cwd: __dirname, encoding: "utf8" });
  ok(/aplicada/.test(reaplica.stdout || ""), "a 170 reaplicada depois de apagar os critérios", (reaplica.stdout || reaplica.stderr || "").slice(-200));
  ok((await escalar("SELECT COUNT(*) FROM CriteriosEmancipacao")) === 0, "apagar as linhas não as faz voltar no próximo deploy (a régua só nasce uma vez)");
  await q(`INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor, Ativo, Ordem, Observacao) VALUES
    (N'MESES_ABERTA', N'MINIMO', 24, 1, 10, NULL), (N'MEMBROS_EM_COMUNHAO', N'MINIMO', 50, 1, 20, NULL), (N'ENCARREGADO_EM_COMUNHAO', N'SIM', NULL, 1, 30, NULL),
    (N'OBREIROS', N'MINIMO', 1, 1, 40, NULL), (N'DIZIMO_MEDIO_12M', N'MINIMO', 3000, 1, 50, NULL)`);

  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  await q("UPDATE Congregacoes SET Lat = '-6.067500', Lng = '-49.902500' WHERE CongregacaoId = @c", { c: central });
  await q("UPDATE Congregacoes SET Lat = '-6.080000', Lng = '-49.880000' WHERE CongregacaoId = @c", { c: vila });
  const membro = (id, nome, cong, { status = "ATIVO", situacao = "EM_COMUNHAO", ext = null, cargo = null } = {}) =>
    q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, ExtensaoId, CargoMinisterial) VALUES (@id, @n, @c, @s, @si, @e, @cg)",
      { id, n: nome, c: cong, s: status, si: situacao, e: ext, cg: cargo });
  for (const [id, n] of [[P.c1, "Central Um E2E"], [P.c2, "Central Dois E2E"], [P.c3, "Central Três E2E"], [P.c4, "Central Quatro E2E"], [P.c5, "Central Cinco E2E"], [P.c6, "Central Seis E2E"]]) await membro(id, n, central);
  await membro(P.cDeslig, "Central Desligado E2E", central, { status: "DESLIGADO", situacao: "SEM_COMUNHAO" });
  for (const [id, n] of [[P.v1, "Vila Um E2E"], [P.v2, "Vila Dois E2E"], [P.v3, "Vila Três E2E"]]) await membro(id, n, vila);
  await membro(9850, "Dirigente Vila E2E", vila);
  const ext = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa, AbertaEm, Endereco, Cidade, UF) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Território E2E', @c, 1, @a, N'Rua da Tenda, 5', N'Parauapebas', N'PA')",
    { c: central, a: mesesAtras(30) });
  const extVila = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Vila E2E', @c, 1)", { c: vila });
  await membro(P.enc, "Encarregado Tenda E2E", central, { ext });
  await membro(P.presb, "Presbítero Tenda E2E", central, { ext, cargo: "PRESBITERO" });
  await membro(P.diac, "Diácono Tenda E2E", central, { ext, cargo: "DIACONO" });
  await membro(P.m4, "Membro Quatro Tenda E2E", central, { ext });
  await membro(P.semCom, "Sem Comunhão Tenda E2E", central, { ext, situacao: "SEM_COMUNHAO", cargo: "DIACONO" });
  await membro(P.sobProc, "Sob Processo Tenda E2E", central, { ext, cargo: "PRESBITERO" });
  await membro(P.extDeslig, "Desligado Tenda E2E", central, { ext, status: "DESLIGADO", situacao: "SEM_COMUNHAO", cargo: "PRESBITERO" });
  // revisão de 06/11/2026: o congregado e o novo convertido não são membros (Estatuto Art. 7º, I) — nem no mapa nem na simulação
  await membro(9828, "Congregado Tenda E2E", central, { ext, situacao: "CONGREGADO", cargo: "PRESBITERO" });
  await membro(9829, "Novo Convertido Tenda E2E", central, { ext, situacao: "NOVO_CONVERTIDO" });
  await membro(9808, "Congregado Central E2E", central, { situacao: "CONGREGADO" });
  await q("INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, @d, 'EM_ANDAMENTO')", { m: P.sobProc, d: hoje });
  await q("INSERT INTO ExtensaoEncarregados (ExtensaoId, MembroId, Desde, RegistradoPor) VALUES (@e, @m, @d, 1002)", { e: ext, m: P.enc, d: mesesAtras(30) });
  await q("INSERT INTO SessoesAtivas (SessaoId, MembroId) VALUES (@s, 1002)", { s: SID_SEC });
  process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR = "AIzaTESTE_e2e_chave_de_mentira_0001";

  console.log("== acesso ==");
  let m, x;
  let r = await rota("mapa", {});
  ok(r.status === 401, "sem login: 401", r.status);
  r = await GET("mapa", {}, PINM());
  ok(r.status === 403, "sessão por PIN: 403", r.status);
  r = await GET("mapa", {}, SEM());
  ok(r.status === 403, "sem 'expansao' e fora da CME: 403", r.status);
  r = guardar("catalogosCMESemPermissao", await GET("catalogos", {}, CME_SEM_PERMISSAO()));
  ok(r.status === 200 && r.body.papeis.cme === true && r.body.papeis.geral === false, "a CME entra mesmo sem a permissão", r.body && r.body.papeis);
  r = guardar("catalogosGeral", await GET("catalogos", {}, SEC()));
  ok(r.status === 200 && r.body.papeis.geral === true && r.body.mapa.chave === process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR, "o nível geral recebe a chave do Maps (da configuração do servidor)");
  ok(r.body.indicadores.length === 8 && r.body.operadores.length === 3 && r.body.ufs.length === 27 && r.body.raioKm === 3, "catálogos: os 8 indicadores, as 3 comparações, as UFs e o raio");
  process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR = "chave com espaço <script>";
  r = await GET("catalogos", {}, SEC());
  ok(r.body.mapa.chave === null, "uma chave fora do formato não vai à tela (fica na lista e desenho)");
  delete process.env.GOOGLE_MAPS_CHAVE_NAVEGADOR;
  r = guardar("catalogosDirigente", await GET("catalogos", {}, DIR()));
  ok(r.body.mapa.chave === null && r.body.papeis.geral === false, "sem a configuração: sem chave");
  for (const [acao, corpo] of [["bairro", { nome: "X E2E", cidade: "Parauapebas", uf: "PA" }], ["raio", { raioKm: 2, versao: 0 }], ["criterio", { indicador: "OBREIROS", operador: "MINIMO", valor: 1 }],
    ["criterio-apagar", { criterioId: 1, versao: 0 }], ["bairro-juntar", { bairroId: 1, versao: 0, destinoId: 2 }]]) {
    r = await POST(acao, corpo, DIR());
    ok(r.status === 403, `o Dirigente não faz "${acao}" (só o nível geral)`, r.status);
    r = await POST(acao, corpo, CME());
    ok(r.status === 403, `a CME não faz "${acao}"`, r.status);
  }
  r = await GET("bairros", {}, DIR());
  ok(r.status === 403, "o cadastro de bairros (com a contagem de todos) é do nível geral", r.status);
  r = await POST("inexistente", {}, SEC());
  ok(r.status === 404, "ação desconhecida: 404");
  r = await rota("mapa", { metodo: "DELETE", token: SEC() });
  ok(r.status === 405, "método desconhecido: 405");

  console.log("== bairros ==");
  r = guardar("bairroCriado", await POST("bairro", { nome: " Centro E2E ", cidade: "Parauapebas", uf: "pa", lat: "-6.068", lng: "-49.903" }, SEC()));
  ok(r.status === 201 && r.body.membrosLigados === 0, "o nível geral cadastra o bairro", r.body);
  const b1 = r.body.bairroId;
  let lin = await um("SELECT * FROM Bairros WHERE BairroId = @b", { b: b1 });
  ok(lin.Nome === "Centro E2E" && lin.UF === "PA" && Number(lin.Lat) === -6.068 && lin.CriadoPor === 1002 && lin.Versao === 0, "gravado aparado, com a UF em maiúscula, o ponto e quem cadastrou");
  r = await POST("bairro", { nome: "centro e2e", cidade: "PARAUAPEBAS", uf: "PA" }, SEC());
  ok(r.status === 422 && /Já existe/.test(r.body.mensagem), "homônimo na mesma cidade (maiúscula diferente): recusado", r.body);
  r = await POST("bairro", { nome: "Centro E2E", cidade: "Marabá", uf: "PA" }, SEC());
  ok(r.status === 201, "o mesmo nome em outra cidade: pode");
  const bMaraba = r.body.bairroId;
  r = await POST("bairro", { nome: "Bairro Longe E2E", cidade: "Parauapebas", uf: "PA", lat: "-6.150000", lng: "-49.950000" }, SEC());
  const b2 = r.body.bairroId;
  r = await POST("bairro", { nome: "Sem Ponto E2E", cidade: "Parauapebas", uf: "PA" }, SEC());
  const b3 = r.body.bairroId;
  ok(b2 && b3, "mais dois bairros (um sem ponto)");
  r = await POST("bairro", { nome: "Ponto Torto E2E", cidade: "Parauapebas", uf: "PA", lat: "-6.1" }, SEC());
  ok(r.status === 422 && /as duas/.test(r.body.mensagem), "só a latitude: recusado");
  r = await POST("bairro", { nome: "Zero E2E", cidade: "Parauapebas", uf: "PA", lat: 0, lng: 0 }, SEC());
  ok(r.status === 422, "o ponto 0,0: recusado");

  console.log("== o endereço em linhas (Pessoas) ==");
  const TOK_PES = () => L.GERAL(1002, ["pessoas"]);
  const fichaBase = async (id) => { const m = await linhaMembro(id); return { membroId: id, nome: m.Nome, congregacaoId: m.CongregacaoId, status: m.Status, situacaoMembro: m.SituacaoMembro, extensaoId: m.ExtensaoId }; };
  r = await pessoas({ ...(await fichaBase(P.c1)), enderecoPartes: { logradouro: "Rua A", numero: "10", complemento: "casa 2", bairroId: String(b1), cidade: "Marabá", uf: "MG", cep: "68515000" } }, TOK_PES());
  ok(r.status === 200 && r.body.sucesso !== false, "a Secretaria grava o endereço em linhas", r.body);
  lin = await linhaMembro(P.c1);
  ok(lin.EnderecoBairroId === b1 && lin.EnderecoCidade === "Parauapebas" && lin.EnderecoUF === "PA" && lin.EnderecoCep === "68515-000" && lin.EnderecoBairroTexto === null,
    "o bairro da lista manda na cidade e na UF; o CEP com o traço", lin);
  ok(lin.Endereco === "Rua A, 10, casa 2 — Centro E2E — Parauapebas/PA — CEP 68515-000", "a linha única montada com as linhas", lin.Endereco);
  for (const id of [P.c2, P.c3]) await pessoas({ ...(await fichaBase(id)), enderecoPartes: { logradouro: "Rua B", bairroId: b1 } }, TOK_PES());
  ok((await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE EnderecoBairroId = @b", { b: b1 })) === 3, "três moradores do Centro");
  r = await pessoas({ ...(await fichaBase(P.c6)), enderecoPartes: { bairroId: b1, bairroTexto: "Outro" } }, TOK_PES());
  ok(r.body.sucesso === false && /OU escreva/.test(r.body.mensagem), "o bairro da lista E escrito: recusado", r.body);
  r = await pessoas({ ...(await fichaBase(P.c6)), enderecoPartes: { bairroTexto: "Lugar Novo E2E" } }, TOK_PES());
  ok(r.body.sucesso === false && /cidade e a UF/.test(r.body.mensagem), "o bairro escrito sem cidade e UF: recusado");
  r = await pessoas({ ...(await fichaBase(P.c6)), enderecoPartes: { bairroId: 999999 } }, TOK_PES());
  ok(r.body.sucesso === false && /não está mais na lista/.test(r.body.mensagem), "bairro inexistente: recusado");
  r = await pessoas({ ...(await fichaBase(P.c6)), enderecoPartes: { cep: "123" } }, TOK_PES());
  ok(r.body.sucesso === false && /8 números/.test(r.body.mensagem), "CEP errado: recusado");
  ok((await linhaMembro(P.c6)).Endereco === null, "nada gravado pelas recusas");
  // a tela antiga (só a linha única)
  r = await pessoas({ ...(await fichaBase(P.c5)), endereco: "Rua Velha, 1, Centro" }, TOK_PES());
  lin = await linhaMembro(P.c5);
  ok(r.status === 200 && lin.Endereco === "Rua Velha, 1, Centro" && lin.EnderecoBairroId === null, "a linha única sozinha continua valendo (endereço ainda não passado para as linhas)");
  const linhaC1 = (await linhaMembro(P.c1)).Endereco;
  r = await pessoas({ ...(await fichaBase(P.c1)), endereco: linhaC1 }, TOK_PES());
  lin = await linhaMembro(P.c1);
  ok(lin.EnderecoBairroId === b1 && lin.EnderecoLogradouro === "Rua A" && lin.Endereco === linhaC1, "tela antiga mandando a MESMA linha: as linhas ficam");
  r = await pessoas({ ...(await fichaBase(P.c1)), endereco: "Outro lugar, 99" }, TOK_PES());
  lin = await linhaMembro(P.c1);
  ok(lin.EnderecoBairroId === null && lin.EnderecoLogradouro === null && lin.Endereco === "Outro lugar, 99", "tela antiga mudando a linha: as linhas deixam de valer (limpas)");
  await pessoas({ ...(await fichaBase(P.c1)), enderecoPartes: { logradouro: "Rua A", numero: "10", bairroId: b1 } }, TOK_PES());
  r = await pessoas({}, TOK_PES(), "GET", { lista: "bairros" });
  ok(r.status === 200 && r.body.bairros.some((b) => b.bairroId === b1) && !JSON.stringify(r.body).includes("Membros"), "a lista dos bairros para o formulário (sem contagem de ninguém)");
  r = await pessoas({}, TOK_PES(), "GET");
  const fichaC1 = (Array.isArray(r.body) ? r.body : []).find((m) => m.membroId === P.c1);
  ok(fichaC1 && fichaC1.enderecoBairroId === b1 && fichaC1.enderecoBairroNome === "Centro E2E" && fichaC1.enderecoLogradouro === "Rua A", "a ficha devolve as linhas e o nome do bairro");

  console.log("== o endereço em linhas (Meus Dados) e a fila ==");
  r = guardar("meusDadosGet", await meusDados(P.c4, {}, "GET"));
  ok(r.status === 200 && Array.isArray(r.body.bairros) && r.body.dados.enderecoPartes && r.body.dados.enderecoPartes.bairroId === null, "o Meus Dados traz as linhas e a lista dos bairros");
  ok(!Object.keys(r.body.dados).some((k) => /^Endereco|^BairroNome/.test(k)), "sem as colunas cruas do banco na resposta");
  r = await meusDados(P.c4, { enderecoPartes: { logradouro: "Travessa C", bairroId: b2 } });
  ok(r.status === 200 && r.body.sucesso === true, "o membro grava o próprio endereço em linhas");
  lin = await linhaMembro(P.c4);
  ok(lin.EnderecoBairroId === b2 && lin.Endereco === "Travessa C — Bairro Longe E2E — Parauapebas/PA", "a linha única do Meus Dados também é montada", lin.Endereco);
  r = await meusDados(P.c4, { telefone: "94999990000" });
  ok((await linhaMembro(P.c4)).EnderecoBairroId === b2, "mudar só o telefone não mexe no endereço");
  r = await chamarRota("AtualizarMeusDados/index.js", { metodo: "POST", binding: { matricula: String(P.c3) }, token: L.PIN(P.c4), corpo: { enderecoPartes: { bairroId: b2 } } });
  ok(r.status === 403, "ninguém grava o endereço de outra pessoa pelo Meus Dados", r.status);
  for (const id of [P.v1, P.v2]) {
    r = await meusDados(id, { enderecoPartes: { bairroTexto: id === P.v1 ? "São Jorge E2E" : "sao jorge e2e ", cidade: "parauapebas", uf: "pa" } });
    ok(r.body.sucesso === true, `o membro ${id} escreve o bairro que não está na lista`);
  }
  r = await meusDados(P.v3, { enderecoPartes: { bairroTexto: " centro e2e ", cidade: "PARAUAPEBAS", uf: "pa" } });
  lin = await linhaMembro(P.v3);
  ok(r.body.sucesso === true && lin.EnderecoBairroId === b1 && lin.EnderecoBairroTexto === null && lin.EnderecoCidade === "Parauapebas" && lin.Endereco === "Centro E2E — Parauapebas/PA",
    "o bairro escrito que já está na lista vira o bairro da lista (não fica preso na fila)", lin);
  r = guardar("mapaComFila", await GET("mapa", {}, SEC()));
  ok(r.body.fila.length === 1 && r.body.fila[0].membros === 2, "a fila dos escritos agrupa sem maiúscula e sem acento (2 pessoas, 1 bairro)", r.body.fila);
  ok(!JSON.stringify(r.body.fila).includes("Vila Um"), "a fila não tem nome de ninguém");
  r = await GET("mapa", {}, CME());
  ok(r.body.fila.length === 0, "a fila é só do nível geral");
  r = await POST("bairro", { nome: "São Jorge E2E", cidade: "Parauapebas", uf: "PA", lat: "-6.100000", lng: "-49.880000" }, SEC());
  ok(r.status === 201 && r.body.membrosLigados === 2, "cadastrar o bairro liga de uma vez quem o tinha escrito", r.body);
  const bJorge = r.body.bairroId;
  lin = await linhaMembro(P.v2);
  ok(lin.EnderecoBairroId === bJorge && lin.EnderecoBairroTexto === null && lin.EnderecoCidade === "Parauapebas" && lin.Endereco === "São Jorge E2E — Parauapebas/PA",
    "a pessoa da fila: ligada ao bairro, cidade corrigida e a linha única refeita", lin);
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId = @m", { b: b3, m: P.v3 });
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE ExtensaoId = @e", { b: b2, e: ext });
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId = 9808", { b: b1 });

  console.log("== editar, desativar e juntar bairros ==");
  r = guardar("bairros", await GET("bairros", {}, SEC()));
  let bj = r.body.bairros.find((b) => b.bairroId === bJorge);
  ok(bj && bj.membros === 2 && bj.ativo === true, "a lista do cadastro traz a contagem e a situação");
  r = await POST("bairro-editar", { bairroId: bJorge, versao: bj.versao + 5, nome: "São Jorge II E2E", cidade: "Parauapebas", uf: "PA" }, SEC());
  ok(r.status === 422 && /mudou/.test(r.body.mensagem), "versão velha: recusado (Isto mudou)");
  r = await POST("bairro-editar", { bairroId: bJorge, versao: bj.versao, nome: "São Jorge II E2E", cidade: "Parauapebas", uf: "PA", lat: "-6.100000", lng: "-49.880000" }, SEC());
  ok(r.status === 200, "o nível geral renomeia o bairro", r.body);
  ok((await linhaMembro(P.v2)).Endereco === "São Jorge II E2E — Parauapebas/PA", "renomear refaz a linha única dos moradores");
  r = await POST("bairro-editar", { bairroId: bJorge, versao: bj.versao, nome: "São Jorge III E2E", cidade: "Parauapebas", uf: "PA" }, SEC());
  ok(r.status === 422, "a mesma versão não passa duas vezes");
  r = await POST("bairro-editar", { bairroId: b1, versao: 0, nome: "Bairro Longe E2E", cidade: "Parauapebas", uf: "PA" }, SEC());
  ok(r.status === 422 && /Já existe/.test(r.body.mensagem), "renomear para o nome de outro bairro da cidade: recusado");
  r = await POST("bairro-ativo", { bairroId: b1, versao: 0, ativo: false }, SEC());
  ok(r.status === 422 && /moram neste bairro/.test(r.body.mensagem), "desativar com moradores ativos: recusado");
  r = await POST("bairro-ativo", { bairroId: bMaraba, versao: 0, ativo: false }, SEC());
  ok(r.status === 200, "desativar sem moradores: pode");
  r = await POST("bairro", { nome: "Centro E2E", cidade: "Marabá", uf: "PA" }, SEC());
  ok(r.status === 201, "o nome do desativado fica livre");
  const bMaraba2 = r.body.bairroId;
  r = await POST("bairro-ativo", { bairroId: bMaraba, versao: 1, ativo: true }, SEC());
  ok(r.status === 422 && /junte os dois/.test(r.body.mensagem), "reativar com outro ativo de mesmo nome: recusado (juntar)", r.body);
  r = await POST("bairro", { nome: "Centro Repetido E2E", cidade: "Parauapebas", uf: "PA" }, SEC());
  const bRep = r.body.bairroId;
  await q("UPDATE MembroReferencia SET EnderecoBairroId = @b WHERE MembroId = @m", { b: bRep, m: P.c6 });
  r = await POST("bairro-juntar", { bairroId: bRep, versao: 0, destinoId: bRep }, SEC());
  ok(r.status === 422, "juntar com ele mesmo: recusado");
  r = await POST("bairro-juntar", { bairroId: bRep, versao: 0, destinoId: bMaraba }, SEC());
  ok(r.status === 422 && /precisa estar ativo/.test(r.body.mensagem), "juntar num desativado: recusado");
  r = await POST("bairro-juntar", { bairroId: bRep, versao: 0, destinoId: b1 }, SEC());
  ok(r.status === 200 && r.body.membrosMovidos === 1, "juntar o repetido no Centro: o morador passa", r.body);
  lin = await linhaMembro(P.c6);
  ok(lin.EnderecoBairroId === b1 && lin.Endereco === "Centro E2E — Parauapebas/PA", "o morador do repetido agora é do Centro (linha refeita)", lin.Endereco);
  ok((await um("SELECT Ativo FROM Bairros WHERE BairroId = @b", { b: bRep })).Ativo === false, "o repetido ficou desativado");
  r = await pessoas({ ...(await fichaBase(P.c6)), enderecoPartes: { bairroId: bRep } }, TOK_PES());
  ok(r.body.sucesso === false, "o bairro desativado não pode mais ser escolhido");
  await q("DELETE FROM Bairros WHERE BairroId = @b", { b: bMaraba2 });

  m = (await GET("mapa", {}, SEC())).body;
  x = bairroDoMapa(m, "Bairro Longe E2E");
  ok(x && x.descoberto === false && x.aConferir === true && m.totais.aConferir === 1, "antes do ponto da Tenda: o Longe (moradores da Tenda sem ponto) fica \"a conferir\", não \"descoberto\"", x);
  console.log("== o ponto das Extensões ==");
  r = guardar("extensoesDirigente", await GET("extensoes", {}, DIR()));
  const e1 = r.body.extensoes.find((e) => e.extensaoId === ext);
  ok(e1 && e1.podeMarcar === true && e1.lat === null && !r.body.extensoes.some((e) => e.extensaoId === extVila), "o Dirigente vê e pode marcar a Extensão da Central (não a da Vila)");
  r = await GET("extensoes", {}, CME());
  ok(r.body.extensoes.some((e) => e.extensaoId === extVila) && r.body.extensoes.every((e) => e.podeMarcar === false), "a CME vê todas, mas não marca");
  r = await POST("ponto-extensao", { extensaoId: ext, lat: "-6.151000", lng: "-49.951000" }, DIR_VILA());
  ok(r.status === 403, "o Dirigente da Vila não marca a Extensão da Central");
  r = await POST("ponto-extensao", { extensaoId: ext, lat: "-6.151000", lng: "-49.951000" }, CME());
  ok(r.status === 403, "a CME não marca");
  r = guardar("pontoMarcado", await POST("ponto-extensao", { extensaoId: ext, lat: "-6.151000", lng: "-49.951000" }, DIR()));
  ok(r.status === 200, "o Dirigente da Mãe marca o ponto", r.body);
  lin = await um("SELECT Lat, Lng, PontoMarcadoPor FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: ext });
  ok(Number(lin.Lat) === -6.151 && lin.PontoMarcadoPor === 3001, "gravado, com quem marcou");
  r = await POST("ponto-extensao", { extensaoId: 999999, lat: "-6.1", lng: "-49.9" }, SEC());
  ok(r.status === 404, "Extensão inexistente: 404");
  r = await POST("ponto-extensao", { extensaoId: extVila, lat: "-6.1" }, SEC());
  ok(r.status === 422, "meio ponto: recusado");
  r = await POST("ponto-extensao", { extensaoId: extVila, lat: "-6.090000", lng: "-49.870000" }, SEC());
  ok(r.status === 200, "o nível geral marca qualquer uma");
  r = await POST("ponto-extensao", { extensaoId: extVila, lat: null, lng: null }, SEC());
  ok(r.status === 200 && (await um("SELECT Lat FROM ExtensoesTenda WHERE ExtensaoId = @e", { e: extVila })).Lat === null, "os dois vazios apagam o ponto");
  const extInativa = await escalar("INSERT INTO ExtensoesTenda (Nome, CongregacaoMaeId, Ativa) OUTPUT INSERTED.ExtensaoId VALUES (N'Tenda Fechada E2E', @c, 0)", { c: central });
  r = await POST("ponto-extensao", { extensaoId: extInativa, lat: "-6.1", lng: "-49.9" }, SEC());
  ok(r.status === 422 && /não está mais ativa/.test(r.body.mensagem), "Extensão inativa: recusado");

  console.log("== o mapa de cobertura ==");
  r = guardar("mapaGeral", await GET("mapa", {}, SEC()));
  m = r.body;
  ok(r.status === 200 && m.escopo === "TODOS" && m.raioKm === 3, "o nível geral vê todos");
  x = bairroDoMapa(m, "Centro E2E");
  ok(x && x.membros === 4 && x.maisPerto && x.maisPerto.nome === "Central E2E" && x.distanciaKm === 0.1 && x.descoberto === false, "Centro: 4 moradores, a Central a 0,1 km, coberto", x);
  x = bairroDoMapa(m, "Bairro Longe E2E");
  ok(x && x.membros === 7 && x.maisPerto.nome === "Tenda Território E2E" && x.maisPerto.tipo === "EXTENSAO" && x.descoberto === false, "Longe: 7 moradores, a Tenda (com ponto) logo ao lado: coberto", x);
  x = bairroDoMapa(m, "São Jorge II E2E");
  ok(x && x.membros === 2 && x.maisPerto.nome === "Vila Nova E2E" && x.distanciaKm === 2.2 && !x.descoberto, "São Jorge: a Vila a 2,2 km, coberto com o raio de 3 km", x);
  x = bairroDoMapa(m, "Sem Ponto E2E");
  ok(x && x.semPonto === true && x.membros === 1 && x.descoberto === false, "o bairro sem ponto: contado, sem distância");
  const ativos = await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE ${terDb.SO_MEMBROS}`);
  const semBairro = await escalar(`SELECT COUNT(*) FROM MembroReferencia m WHERE ${terDb.SO_MEMBROS} AND EnderecoBairroId IS NULL`);
  ok(ativos < (await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE Status = N'ATIVO'")), "o mapa conta membros: os congregados e o novo convertido ficam fora");
  ok(m.totais.membros === ativos && m.totais.semLocalizacao === semBairro && m.totais.localizados === ativos - semBairro, "os totais batem com o banco (só os ativos; o desligado não conta)", m.totais);
  ok(m.totais.bairrosSemPonto === 1 && m.totais.descobertos === 0, "um bairro com gente sem ponto; nenhum descoberto");
  const dens = (nome) => m.densidade.find((d) => d.nome === nome);
  ok(dens("Tenda Território E2E").membrosLocalizados === 6 && dens("Tenda Território E2E").maisPertoDeOutra === 0, "a Tenda: os 6 da Extensão, todos mais perto dela");
  ok(dens("Central E2E").membrosLocalizados === 5 && dens("Central E2E").maisPertoDeOutra === 1, "a Central: 5 com bairro (4 no Centro, 1 no Longe) — 1 mora mais perto da Tenda", dens("Central E2E"));
  ok(!JSON.stringify(m).match(/Central Um E2E|Vila Dois E2E|Encarregado Tenda/), "o mapa nunca traz nome de membro");
  r = guardar("mapaDirigente", await GET("mapa", {}, DIR()));
  ok(r.body.escopo === "MEUS" && bairroDoMapa(r.body, "São Jorge II E2E").membros === 0 && bairroDoMapa(r.body, "Bairro Longe E2E").membros === 7, "o Dirigente vê só os membros da Central (os da Vila contam zero)");
  ok(!r.body.densidade.some((d) => d.nome === "Vila Nova E2E") && r.body.unidades.some((u) => u.nome === "Vila Nova E2E"), "as unidades de todos aparecem (públicas); a densidade, só as dele");
  ok(r.body.fila.length === 0, "o Dirigente não vê a fila");
  r = guardar("mapaCME", await GET("mapa", {}, CME()));
  ok(r.body.escopo === "TODOS", "a CME vê todos (contagem)");

  console.log("== o raio ==");
  r = await POST("raio", { raioKm: "2", versao: 5 }, SEC());
  ok(r.status === 422 && /mudou/.test(r.body.mensagem), "raio com versão velha: recusado");
  r = await POST("raio", { raioKm: "0,05", versao: 0 }, SEC());
  ok(r.status === 422, "raio abaixo de 0,1 km: recusado");
  r = await POST("raio", { raioKm: "2", versao: 0 }, SEC());
  ok(r.status === 200 && r.body.raioKm === 2, "o nível geral muda o raio para 2 km");
  m = (await GET("mapa", {}, SEC())).body;
  ok(bairroDoMapa(m, "São Jorge II E2E").descoberto === true && m.totais.descobertos === 1, "com 2 km, São Jorge (a 2,2 km) fica descoberto");
  r = await GET("criterios", {}, DIR());
  ok(r.body.raioKm === 2 && r.body.versaoParametros === 1, "todos leem o raio e a versão");

  console.log("== critérios ==");
  r = guardar("criteriosDirigente", await GET("criterios", {}, DIR()));
  ok(r.status === 200 && r.body.criterios.length === 5, "o Dirigente lê a tabela");
  const listaCrit = r.body.criterios;
  const crit = (ind) => listaCrit.find((c) => c.indicador === ind);
  r = await POST("criterio", { indicador: "ENCARREGADO_EM_COMUNHAO", operador: "MINIMO", valor: 1 }, SEC());
  ok(r.status === 422 && /precisa ser sim/.test(r.body.mensagem), "sim/não com \"pelo menos\": recusado");
  r = await POST("criterio", { indicador: "NIVEL_PSC_MAE", operador: "MINIMO", valor: 6 }, SEC());
  ok(r.status === 422 && /até 5/.test(r.body.mensagem), "nível do PSC acima de 5: recusado");
  r = await POST("criterio", { indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: "2,5" }, SEC());
  ok(r.status === 422 && /inteiro/.test(r.body.mensagem), "membros com vírgula: recusado");
  r = guardar("criterioCriado", await POST("criterio", { indicador: "NIVEL_PSC_MAE", operador: "MINIMO", valor: 3, ordem: 60, observacao: "Mãe saudável" }, SEC()));
  ok(r.status === 201, "o nível geral cria um critério");
  const cPsc = r.body.criterioId;
  r = await POST("criterio", { indicador: "DISTANCIA_MAE_KM", operador: "MINIMO", valor: "1,5", ordem: 70, ativo: false }, SEC());
  const cDist = r.body.criterioId;
  ok(r.status === 201 && (await um("SELECT Ativo, Valor FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: cDist })).Ativo === false, "um critério desligado (não conta)");
  lin = await um("SELECT * FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: cPsc });
  ok(lin.CriadoPor === 1002 && Number(lin.Valor) === 3 && lin.Observacao === "Mãe saudável", "gravado com quem criou");
  const cMembros = crit("MEMBROS_EM_COMUNHAO"), cDiz = crit("DIZIMO_MEDIO_12M");
  r = await POST("criterio-editar", { criterioId: cMembros.criterioId, versao: cMembros.versao + 1, indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 4 }, SEC());
  ok(r.status === 422 && /mudou/.test(r.body.mensagem), "editar com versão velha: recusado");

  console.log("== simulação de emancipação ==");
  // o dízimo dos membros da Tenda: só o confirmado, ativo, de dízimo, dentro dos 12 meses fechados
  const diz1 = await escalar("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) OUTPUT INSERTED.DizimistaId VALUES (@c, N'Presbítero Tenda E2E', @m)", { c: central, m: P.presb });
  const diz2 = await escalar("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) OUTPUT INSERTED.DizimistaId VALUES (@c, N'Diácono Tenda E2E', @m)", { c: central, m: P.diac });
  const dizFora = await escalar("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) OUTPUT INSERTED.DizimistaId VALUES (@c, N'Central Um E2E', @m)", { c: central, m: P.c1 });
  let termo = 970000;
  const lanc = (d, valor, mesRef, { tipo = "DIZIMO", status = "ATIVO", conf = "CONFIRMADO" } = {}) => q(`INSERT INTO LancamentosTesouraria (CongregacaoId, DizimistaId, TermoNumero, Tipo, Valor, FormaPagamento, MesReferencia, RegistradoPor, Status, StatusConfirmacao)
    VALUES (@c, @d, @t, @tp, @v, N'PIX', @m, 1002, @s, @cf)`, { c: central, d, t: ++termo, tp: tipo, v: valor, m: mesRef, s: status, cf: conf });
  await lanc(diz1, "1000.00", jan.de); await lanc(diz1, "1000.00", jan.ate); await lanc(diz1, "1000.00", jan.ate);
  await lanc(diz2, "600.00", jan.ate);
  await lanc(diz2, "5000.00", mesAtual);                              // o mês corrente não entra
  await lanc(diz2, "5000.00", mesAntesDaJanela);                      // antes da janela, não
  await lanc(diz2, "5000.00", jan.ate, { status: "CANCELADO" });      // cancelado, não
  await lanc(diz2, "5000.00", jan.ate, { conf: "PENDENTE" });         // autolançamento sem confirmar, não
  await lanc(diz2, "5000.00", jan.ate, { tipo: "OFERTA" });           // oferta, não
  await lanc(dizFora, "9000.00", jan.ate);                            // dízimo de quem não é da Tenda, não
  await q("INSERT INTO PscAvaliacoes (CongregacaoId, Ano, Status, NivelFinal) VALUES (@c, 2024, N'HOMOLOGADA', 2), (@c, 2025, N'HOMOLOGADA', 4), (@c, 2026, N'RASCUNHO', 5)", { c: central });
  r = guardar("simulacaoGeral", await GET("simulacao", {}, SEC()));
  ok(r.status === 200 && r.body.janelaDizimo.de === jan.de && r.body.janelaDizimo.ate === jan.ate, "a simulação diz a janela do dízimo");
  let s1 = r.body.extensoes.find((e) => e.extensaoId === ext);
  const brutas = await terDb.medidasDasExtensoes(pool, [
    { extensaoId: ext, congregacaoMaeId: central, abertaEm: mesesAtras(30), lat: -6.151, lng: -49.951, maeLat: -6.0675, maeLng: -49.9025 },
    { extensaoId: extVila, congregacaoMaeId: vila, abertaEm: null, lat: null, lng: null, maeLat: -6.08, maeLng: -49.88 }], hoje);
  const med = brutas.get(ext);
  ok(Object.keys(s1.medidas).sort().join() === s1.avaliacao.itens.map((i) => i.indicador).sort().join(), "a resposta traz só as medidas dos critérios ativos", Object.keys(s1.medidas));
  const itDiz = s1.avaliacao.itens.find((i) => i.indicador === "DIZIMO_MEDIO_12M");
  ok(s1.medidas.DIZIMO_MEDIO_12M === null && itDiz.medido === null && itDiz.oculto === true && !("DIZIMISTAS_12M" in s1.medidas), "com 2 dizimistas, o dízimo médio sai sem o valor (seria o de uma pessoa)");
  ok(!/"(medido|DIZIMO_MEDIO_12M)":300\b/.test(JSON.stringify(r.body)) && !/"DIZIMISTAS_12M"/.test(JSON.stringify(r.body)), "o valor do dízimo (R$ 300) não aparece em lugar nenhum da resposta");
  ok(med.MESES_ABERTA === 30, "meses desde a abertura: 30", med.MESES_ABERTA);
  ok(med.MEMBROS_EM_COMUNHAO === 4, "membros em comunhão: 4 (sem o sem comunhão, o sob disciplina, o desligado, o congregado e o novo convertido)", med.MEMBROS_EM_COMUNHAO);
  ok(med.ENCARREGADO_EM_COMUNHAO === true, "o Encarregado em comunhão, da Mãe");
  ok(med.OBREIROS === 2, "obreiros em comunhão: 2 (o presbítero sob disciplina, o diácono sem comunhão, o desligado e o congregado não contam)", med.OBREIROS);
  ok(med.DIZIMO_MEDIO_12M === 300, "dízimo médio: R$ 3.600 / 12 = R$ 300 (só o que vale)", med.DIZIMO_MEDIO_12M);
  ok(med.DIZIMISTAS_12M === 2, "dizimistas: 2", med.DIZIMISTAS_12M);
  const kmMae = Math.round(tr.distanciaKm({ lat: -6.151, lng: -49.951 }, { lat: -6.0675, lng: -49.9025 }) * 10) / 10;
  ok(med.DISTANCIA_MAE_KM === kmMae && kmMae > 10, "distância até a Mãe pelos pontos (" + kmMae + " km)", med.DISTANCIA_MAE_KM);
  ok(med.NIVEL_PSC_MAE === 4, "o PSC homologado mais recente da Mãe (o rascunho não conta): 4", med.NIVEL_PSC_MAE);
  ok(s1.avaliacao.situacao === "NAO_ATENDE" && s1.avaliacao.total === 6 && !s1.podePedir, "com a régua inicial (50 membros, R$ 3.000): ainda não atende", s1.avaliacao);
  ok(!s1.avaliacao.itens.some((i) => i.criterioId === cDist), "o critério desligado não aparece");
  const s2 = r.body.extensoes.find((e) => e.extensaoId === extVila);
  const medVila = brutas.get(extVila);
  ok(s2 && medVila.MESES_ABERTA === null && medVila.DISTANCIA_MAE_KM === null && medVila.NIVEL_PSC_MAE === null && s2.avaliacao.itens.find((i) => i.indicador === "MESES_ABERTA").resultado === "SEM_DADO",
    "a Extensão sem data de abertura, sem ponto e com a Mãe sem PSC: não dá para medir (nunca conta como atendido)", medVila);
  ok(medVila.ENCARREGADO_EM_COMUNHAO === false, "sem Encarregado: não");
  r = await POST("criterio-editar", { criterioId: cMembros.criterioId, versao: cMembros.versao, indicador: "MEMBROS_EM_COMUNHAO", operador: "MINIMO", valor: 4, ordem: 20 }, SEC());
  ok(r.status === 200, "o nível geral baixa o mínimo de membros para 4");
  r = await POST("criterio-editar", { criterioId: cDiz.criterioId, versao: cDiz.versao, indicador: "DIZIMO_MEDIO_12M", operador: "MINIMO", valor: "300,00", ordem: 50 }, SEC());
  ok(r.status === 200, "e o dízimo para R$ 300");
  lin = await um("SELECT AlteradoPor, Versao FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: cDiz.criterioId });
  ok(lin.AlteradoPor === 1002 && lin.Versao === cDiz.versao + 1, "a mudança registra quem e sobe a versão");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'CriteriosEmancipacao' AND Acao = N'CRITERIO_ALTERADO'")) >= 2, "cada mudança de critério na auditoria");
  r = guardar("simulacaoDirigente", await GET("simulacao", {}, DIR()));
  s1 = r.body.extensoes.find((e) => e.extensaoId === ext);
  ok(s1.avaliacao.situacao === "ATENDE_TUDO" && s1.podePedir === true, "agora a Tenda atende tudo, e o Dirigente da Mãe pode pedir", s1.avaliacao);
  ok(!r.body.extensoes.some((e) => e.extensaoId === extVila), "o Dirigente não vê a Extensão da Vila");
  ok(r.body.extensoes[0].extensaoId === ext, "quem atende tudo vem primeiro");
  const diz3 = await escalar("INSERT INTO Dizimistas (CongregacaoId, Nome, MembroId) OUTPUT INSERTED.DizimistaId VALUES (@c, N'Membro Quatro Tenda E2E', @m)", { c: central, m: P.m4 });
  await lanc(diz3, "1200.00", jan.ate);
  s1 = (await GET("simulacao", {}, DIR())).body.extensoes.find((e) => e.extensaoId === ext);
  const itDiz3 = s1.avaliacao.itens.find((i) => i.indicador === "DIZIMO_MEDIO_12M");
  ok(itDiz3.medido === 400 && !itDiz3.oculto && s1.medidas.DIZIMO_MEDIO_12M === 400, "com 3 dizimistas, o valor aparece: R$ 4.800 / 12 = R$ 400", itDiz3);
  r = await GET("simulacao", {}, DIR_VILA());
  ok(!r.body.extensoes.some((e) => e.extensaoId === ext), "o Dirigente da Vila não vê a Tenda da Central");
  r = guardar("simulacaoCME", await GET("simulacao", {}, CME()));
  ok(r.body.extensoes.find((e) => e.extensaoId === ext).podePedir === true, "o Pastor de Área (cobre a Central) também pode pedir");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'SEM_COMUNHAO' WHERE MembroId = @m", { m: P.enc });
  s1 = (await GET("simulacao", {}, SEC())).body.extensoes.find((e) => e.extensaoId === ext);
  ok(s1.medidas.ENCARREGADO_EM_COMUNHAO === false && s1.medidas.MEMBROS_EM_COMUNHAO === 3 && s1.avaliacao.situacao === "NAO_ATENDE", "o Encarregado sem comunhão: o critério cai na hora (calculado na leitura)");
  await q("UPDATE MembroReferencia SET SituacaoMembro = N'EM_COMUNHAO' WHERE MembroId = @m", { m: P.enc });
  await q("UPDATE CriteriosEmancipacao SET Ativo = 0");
  r = await GET("simulacao", {}, SEC());
  ok(r.body.criterios.length === 0 && r.body.extensoes.every((e) => e.avaliacao.situacao === "SEM_CRITERIOS" && !e.podePedir), "nenhum critério ativo: a simulação não aponta ninguém");
  await q("UPDATE CriteriosEmancipacao SET Ativo = 1 WHERE CriterioId <> @c", { c: cDist });
  r = await GET("criterios", {}, SEC());
  const cApagar = r.body.criterios.find((c) => c.criterioId === cPsc);
  r = await POST("criterio-apagar", { criterioId: cPsc, versao: cApagar.versao + 1 }, SEC());
  ok(r.status === 422, "apagar com versão velha: recusado");
  r = await POST("criterio-apagar", { criterioId: cPsc, versao: cApagar.versao }, SEC());
  ok(r.status === 200 && (await escalar("SELECT COUNT(*) FROM CriteriosEmancipacao WHERE CriterioId = @c", { c: cPsc })) === 0, "o nível geral apaga o critério");
  ok((await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'CriteriosEmancipacao' AND Acao = N'CRITERIO_APAGADO' AND RegistroId = @c", { c: cPsc })) === 1, "o apagado fica na auditoria");
  r = await POST("criterio-apagar", { criterioId: cPsc, versao: 0 }, SEC());
  ok(r.status === 404, "apagar o que não existe: 404");

  console.log("== a emancipação leva o ponto ==");
  const cli = await escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId SELECT OrgaoId, N'CLI território E2E', @d, N'EXTRAORDINARIA', N'ENCERRADA' FROM Orgaos WHERE Sigla = N'CLI'`, { d: hoje });
  const EXP = (acao, corpo, token) => chamarRota("GestaoExpansao/index.js", { metodo: "POST", binding: { acao }, token, corpo });
  r = await EXP("pedido", { tipo: "EMANCIPACAO", extensaoId: ext, nome: "Betel Território E2E", justificativa: "A Tenda atende todos os critérios do mapa territorial." }, DIR());
  ok(r.status === 201, "o Dirigente pede a emancipação (o atalho da simulação)", r.body);
  const ped = r.body.pedidoId;
  s1 = (await GET("simulacao", {}, DIR())).body.extensoes.find((e) => e.extensaoId === ext);
  ok(s1.pedidoEmAndamento === ped && s1.podePedir === false, "com o pedido correndo, o atalho some");
  r = await EXP("parecer", { pedidoId: ped, parecer: "FAVORAVEL", fundamentacao: "Atende a régua do mapa territorial." }, CME());
  ok(r.status === 200, "a CME dá o parecer");
  r = await EXP("decidir", { pedidoId: ped, sessaoId: cli, resultado: "APROVADO" }, SEC());
  ok(r.status === 200, "a CLI aprova", r.body);
  lin = await um("SELECT Lat, Lng FROM Congregacoes WHERE Nome = N'Betel Território E2E'");
  ok(lin && Number(lin.Lat) === -6.151 && Number(lin.Lng) === -49.951, "a congregação nascida da emancipação herda o ponto da Extensão", lin);
  m = (await GET("mapa", {}, SEC())).body;
  ok(m.unidades.some((u) => u.nome === "Betel Território E2E" && u.tipo === "CONGREGACAO" && u.lat === -6.151) && !m.unidades.some((u) => u.nome === "Tenda Território E2E"), "no mapa, a congregação nova no lugar da Extensão");

  console.log("== LGPD ==");
  r = guardar("meusDadosLgpd", await chamarRota("MeusDadosLGPD/index.js", { metodo: "GET", binding: { matricula: String(P.c1) }, token: L.PIN(P.c1) }));
  ok(r.status === 200 && r.body.territorio && r.body.territorio.endereco.bairroNome === "Centro E2E" && r.body.territorio.endereco.logradouro === "Rua A", "Meus Dados (LGPD) mostra o endereço em linhas", r.body && r.body.territorio);
  r = guardar("meusDadosLgpdSec", await chamarRota("MeusDadosLGPD/index.js", { metodo: "GET", binding: { matricula: "1002" }, token: L.PIN(1002) }));
  const atos = r.body.territorio.atos;
  ok(atos.bairros.some((b) => b.cadastrou && /Centro E2E/.test(b.bairro)) && atos.criterios.some((c) => c.ultimaMudancaEm) && atos.raioDeCobertura.length === 1, "e os atos de quem cadastrou bairros, mudou critérios e o raio", atos);
  r = await chamarRota("MeusDadosLGPD/index.js", { metodo: "GET", binding: { matricula: "3001" }, token: L.PIN(3001) });
  ok(r.body.territorio.atos.pontosDeExtensao.some((p) => p.extensao === "Tenda Território E2E"), "e o ponto de Extensão que o Dirigente marcou");
  const { minimizarCamposExMembro } = require(path.join(API, "shared/minimizacaoLgpd.js"));
  await minimizarCamposExMembro(pool, P.c2, { dataSaida: hoje, motivo: "Carta de Mudança" });
  lin = await linhaMembro(P.c2);
  ok(lin.Endereco === null && lin.EnderecoLogradouro === null && lin.EnderecoBairroId === null && lin.EnderecoCidade === null && lin.EnderecoUF === null, "a minimização do ex-membro limpa as linhas junto com a linha única");

  console.log("== o banco segura sozinho ==");
  await falhaNoBanco("bairro da lista E escrito", "UPDATE MembroReferencia SET EnderecoBairroId = @b, EnderecoBairroTexto = N'x' WHERE MembroId = @m", { b: b1, m: P.c3 });
  await falhaNoBanco("CEP fora do formato", "UPDATE MembroReferencia SET EnderecoCep = N'68515000' WHERE MembroId = @m", { m: P.c3 });
  await falhaNoBanco("UF minúscula", "UPDATE MembroReferencia SET EnderecoUF = N'pa' WHERE MembroId = @m", { m: P.c3 });
  await falhaNoBanco("UF minúscula no bairro", "UPDATE Bairros SET UF = N'pa' WHERE BairroId = @b", { b: b3 });
  await falhaNoBanco("bairro com meio ponto", "UPDATE Bairros SET Lat = 1 WHERE BairroId = @b", { b: b3 });
  await falhaNoBanco("bairro homônimo sem acento", "INSERT INTO Bairros (Nome, Cidade, UF) VALUES (N'Sao Jorge II E2E', N'parauapebas', N'PA')");
  await falhaNoBanco("bairro com espaço sobrando", "INSERT INTO Bairros (Nome, Cidade, UF) VALUES (N' Novo E2E', N'Parauapebas', N'PA')");
  await falhaNoBanco("critério de sim/não com valor", "INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor) VALUES (N'ENCARREGADO_EM_COMUNHAO', N'SIM', 1)");
  await falhaNoBanco("critério de número sem valor", "INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor) VALUES (N'OBREIROS', N'MINIMO', NULL)");
  await falhaNoBanco("indicador fora da lista", "INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor) VALUES (N'QUALQUER', N'MINIMO', 1)");
  await falhaNoBanco("valor negativo", "INSERT INTO CriteriosEmancipacao (Indicador, Operador, Valor) VALUES (N'OBREIROS', N'MAXIMO', -1)");
  await falhaNoBanco("segunda linha de parâmetros", "INSERT INTO TerritorioParametros (Id) VALUES (2)");
  await falhaNoBanco("raio zero", "UPDATE TerritorioParametros SET RaioCoberturaKm = 0 WHERE Id = 1");
  await falhaNoBanco("ponto de Extensão fora da faixa", "UPDATE ExtensoesTenda SET Lat = 91, Lng = 0 WHERE ExtensaoId = @e", { e: extVila });

  console.log("== lixo ==");
  await fuzz("bairro", "bairro", { nome: "Lixo E2E", cidade: "Parauapebas", uf: "PA" }, ["nome", "cidade", "uf", "lat", "lng"], SEC);
  await q("DELETE FROM Bairros WHERE Nome NOT LIKE N'%E2E%' OR Nome = N'Lixo E2E'");
  const bl = (await GET("bairros", {}, SEC())).body.bairros.find((b) => b.bairroId === b3);
  await fuzz("bairro-editar", "bairro-editar", { bairroId: b3, versao: bl.versao, nome: "Sem Ponto E2E", cidade: "Parauapebas", uf: "PA" }, ["bairroId", "versao", "lat"], SEC);
  await fuzz("bairro-juntar", "bairro-juntar", { bairroId: 999999, versao: 0, destinoId: b1 }, ["bairroId", "versao", "destinoId"], SEC);
  await fuzz("ponto-extensao", "ponto-extensao", { extensaoId: extVila, lat: "-6.09", lng: "-49.87" }, ["extensaoId", "lat", "lng"], SEC);
  await fuzz("raio", "raio", { raioKm: "2", versao: 999 }, ["raioKm", "versao"], SEC);
  await fuzz("criterio", "criterio", { indicador: "OBREIROS", operador: "MINIMO", valor: 1, ativo: false }, ["indicador", "operador", "valor", "ordem", "observacao", "ativo"], SEC);
  await fuzz("criterio-editar", "criterio-editar", { criterioId: cMembros.criterioId, versao: 999, indicador: "OBREIROS", operador: "MINIMO", valor: 1 }, ["criterioId", "versao", "valor"], SEC);
  const quebrasEnd = [];
  for (const campo of ["logradouro", "numero", "complemento", "bairroId", "bairroTexto", "cidade", "uf", "cep"]) for (const lixo of LIXO) {
    const partes = { logradouro: "Rua Lixo" };
    if (lixo === undefined) delete partes[campo]; else partes[campo] = lixo;
    const rr = await meusDados(P.c3, { enderecoPartes: partes });
    if (![200, 400, 422].includes(rr.status) || /SELECT |mssql|tedious/i.test(JSON.stringify(rr.body))) quebrasEnd.push(`${campo}=${JSON.stringify(lixo).slice(0, 20)} -> ${rr.status}`);
  }
  for (const lixo of LIXO) {
    const rr = await meusDados(P.c3, { enderecoPartes: lixo });
    if (![200, 400, 422].includes(rr.status)) quebrasEnd.push(`enderecoPartes=${JSON.stringify(lixo).slice(0, 20)} -> ${rr.status}`);
  }
  ok(quebrasEnd.length === 0, `Meus Dados: ${8 * LIXO.length + LIXO.length} endereços com lixo, nenhuma 500`, quebrasEnd.slice(0, 5));
  ok((await um("SELECT COUNT(*) n FROM MembroReferencia WHERE EnderecoLogradouro IS NOT NULL AND (EnderecoCep IS NOT NULL AND EnderecoCep NOT LIKE N'[0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]')")).n === 0, "nenhum CEP torto ficou gravado");

  if (process.env.E2E_CONTRATO) {
    const destino = path.resolve(__dirname, "..", "front-territorio", "contrato-real.json");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(contrato, null, 1));
    console.log(`contrato gravado em ${destino}`);
  }
  fim("e2e-78 território");
})().catch((e) => { console.log("ERRO", e && e.stack); process.exitCode = 1; L.shimEncerrar(); });
