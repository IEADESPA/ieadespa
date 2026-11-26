// e2e-104-saidas-do-rol-tabela.js — a tabela das saídas do rol com a carta nova (FASE 10, Membros, missão B, migração 189), contra o SQL Server de verdade.
// Só dados de mentira. O que se prova é o banco segurando sozinho as regras da tabela, mesmo que uma rota erre:
//  - uma saída aberta por pessoa (o clique duplo não cria duas); quem voltou pode sair de novo; a volta não vem antes da saída;
//  - quem pede por si é a própria pessoa; o filho que sai junto aponta a saída de quem pediu;
//  - o protocolo e o código curto não se repetem; o código só tem os símbolos do papel (sem I, O, 0, 1 nem minúscula); a impressão é hex minúsculo;
//  - a carta viva tem o conteúdo em JSON; a apagada não tem conteúdo nem destino e tem a data; a etapa do apagamento leva a data dela;
//  - a impressão digital calculada na rota (shared/saidaMembro.js) confere depois da ida e volta do conteúdo pelo banco (com acento).
// Roda sobre a base cenario-189 (`BASE=cenario-189 bash rodar.sh roteiro e2e-104-saidas-do-rol-tabela.js`).
const L = require("./lib");
const { ok, fim, q, escalar, obterPool } = L;
const saida = require(L.path.join(L.API, "shared/saidaMembro.js"));

const CARLOS = 991041, LUCAS = 991042, MARIA = 991043, DEBORA = 991044;
const INDICES = ["UX_SaidasDoRol_Protocolo", "UX_SaidasDoRol_CodigoCurto", "UX_SaidasDoRol_Aberta", "IX_SaidasDoRol_Membro", "IX_SaidasDoRol_Congregacao",
  "IX_SaidasDoRol_PedidasSecretaria", "IX_SaidasDoRol_JuntoCom", "IX_SaidasDoRol_CartaViva", "IX_SaidasDoRol_Etapa"];

let seq = 0;
// uma linha de saída válida (com o que a rota calcularia), com as trocas do caso
function linha(membroId, trocas = {}) {
  seq++;
  const conteudo = { nome: `Pessoa E2E104 nº ${seq}`, matricula: membroId, destino: "Marabá - PA", situacao: "em Comunhão",
    historico: [["Chegada", "12/03/2009, por batismo, na Congregação Vila Nova"], ["Saída", "25/11/2026, com esta carta"]] };
  const sal = saida.gerarSal();
  return { membroId, congregacaoId: null, dia: "2026-11-25", como: "PROPRIO", por: membroId, junto: null, aviso: null, destino: "Marabá - PA",
    protocolo: `CARTA-2026-9${String(seq).padStart(3, "0")}`, codigo: saida.gerarCodigoCurto(), sal, impressao: saida.impressaoDigital(conteudo, sal),
    conteudo: JSON.stringify(conteudo), ...trocas };
}
async function inserir(l) {
  const pool = await obterPool();
  const r = await pool.request()
    .input("m", L.sql.Int, l.membroId).input("c", L.sql.Int, l.congregacaoId).input("dia", L.sql.Date, l.dia)
    .input("como", L.sql.NVarChar(12), l.como).input("por", L.sql.Int, l.por).input("junto", L.sql.Int, l.junto).input("aviso", L.sql.Bit, l.aviso)
    .input("destino", L.sql.NVarChar(80), l.destino).input("prot", L.sql.NVarChar(30), l.protocolo).input("cod", L.sql.Char(6), l.codigo)
    .input("sal", L.sql.Char(32), l.sal).input("imp", L.sql.Char(64), l.impressao).input("cont", L.sql.NVarChar(L.sql.MAX), l.conteudo)
    .query(`INSERT INTO SaidasDoRol (MembroId, CongregacaoId, DiaSaida, PedidoComo, PedidoPorMembroId, JuntoComSaidaId, AvisoPorEmail, DestinoCidade, Protocolo,
              CodigoCurto, Sal, ImpressaoDigital, Conteudo)
            OUTPUT INSERTED.SaidaId VALUES (@m, @c, @dia, @como, @por, @junto, @aviso, @destino, @prot, @cod, @sal, @imp, @cont)`);
  return r.recordset[0].SaidaId;
}
// o número do erro do banco (0 = gravou)
async function erroDe(fn) {
  try { await fn(); return 0; } catch (e) { return (e && (e.number || (e.originalError && e.originalError.info && e.originalError.info.number))) || -1; }
}

async function principal() {
  const [c1] = await q("SELECT TOP 1 CongregacaoId FROM Congregacoes ORDER BY CongregacaoId");
  await q(`DELETE FROM SaidasDoRol WHERE MembroId IN (${CARLOS}, ${LUCAS}, ${MARIA}, ${DEBORA}) AND JuntoComSaidaId IS NOT NULL;
           DELETE FROM SaidasDoRol WHERE MembroId IN (${CARLOS}, ${LUCAS}, ${MARIA}, ${DEBORA});
           DELETE FROM MembroReferencia WHERE MembroId IN (${CARLOS}, ${LUCAS}, ${MARIA}, ${DEBORA})`);
  await q(`INSERT INTO MembroReferencia (MembroId, Nome, Status, SituacaoMembro, CongregacaoId) VALUES
    (${CARLOS}, N'Carlos Saída E2E104', N'ATIVO', N'EM_COMUNHAO', @c), (${LUCAS}, N'Lucas Filho E2E104', N'ATIVO', N'CONGREGADO', @c),
    (${MARIA}, N'Maria Balcão E2E104', N'ATIVO', N'EM_COMUNHAO', @c), (${DEBORA}, N'Débora Secretária E2E104', N'ATIVO', N'EM_COMUNHAO', @c)`, { c: c1.CongregacaoId });

  // 1. a tabela e os índices
  ok((await escalar("SELECT COUNT(*) FROM sys.tables WHERE name = N'SaidasDoRol'")) === 1, "a tabela SaidasDoRol existe");
  const idx = (await q("SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.SaidasDoRol') AND name IS NOT NULL")).map((x) => x.name);
  for (const nome of INDICES) ok(idx.includes(nome), `o índice ${nome} existe`);
  ok((await escalar("SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.SaidasDoRol')")) === 8, "as 8 regras (CHECK) da tabela existem");

  // 2. a saída do Carlos, pedida por ele; o clique duplo não cria a segunda
  const lc = linha(CARLOS, { congregacaoId: c1.CongregacaoId });
  const idCarlos = await inserir(lc);
  ok(idCarlos > 0, "a saída pedida pelo próprio membro grava");
  ok((await erroDe(() => inserir(linha(CARLOS)))) === 2601, "a segunda saída aberta da mesma pessoa: o banco recusa (2601)");

  // 3. a impressão confere depois da ida e volta pelo banco (com acento)
  const lida = (await q(`SELECT Conteudo, Sal, ImpressaoDigital, EtapaApagamento, SaiuEm FROM SaidasDoRol WHERE SaidaId = ${idCarlos}`))[0];
  ok(saida.impressaoDigital(JSON.parse(lida.Conteudo), lida.Sal) === lida.ImpressaoDigital, "a impressão recalculada do conteúdo e do sal guardados confere");
  ok(lida.EtapaApagamento === 0 && lida.SaiuEm instanceof Date, "nasce na etapa 0, com a hora da saída");

  // 4. o filho que sai junto
  ok((await erroDe(() => inserir(linha(LUCAS, { como: "RESPONSAVEL", por: CARLOS })))) === 547, "o filho sem a saída de quem pediu: o banco recusa (547)");
  const idLucas = await inserir(linha(LUCAS, { como: "RESPONSAVEL", por: CARLOS, junto: idCarlos }));
  ok(idLucas > 0, "o filho com a saída do pai grava");

  // 5. quem pede por si é a própria pessoa; a secretaria pede por outro, com o aviso
  ok((await erroDe(() => inserir(linha(MARIA, { como: "PROPRIO", por: DEBORA })))) === 547, "'pedido próprio' feito por outra pessoa: o banco recusa (547)");
  const idMaria = await inserir(linha(MARIA, { como: "SECRETARIA", por: DEBORA, aviso: false }));
  ok(idMaria > 0, "o pedido da secretaria grava, com o aviso (sem e-mail na ficha)");

  // 6. protocolo e código únicos; o código só com os símbolos do papel; a impressão em hex minúsculo
  await q(`UPDATE SaidasDoRol SET VoltouEm = '2026-11-30' WHERE SaidaId = ${idMaria}`);
  ok((await erroDe(() => inserir(linha(MARIA, { protocolo: lc.protocolo })))) === 2601, "o protocolo repetido: o banco recusa (2601)");
  ok((await erroDe(() => inserir(linha(MARIA, { codigo: lc.codigo })))) === 2601, "o código curto repetido: o banco recusa (2601)");
  for (const ruim of ["k7p4m2", "K7P4MI", "K7P4M0", "K7P4M1", "K7P4O2", "K7P4M"]) {
    ok((await erroDe(() => inserir(linha(MARIA, { codigo: ruim })))) === 547, `o código '${ruim}' fora do papel: o banco recusa (547)`);
  }
  ok((await erroDe(() => inserir(linha(MARIA, { impressao: "A".repeat(64) })))) === 547, "a impressão fora do hex minúsculo: o banco recusa (547)");
  ok((await erroDe(() => inserir(linha(MARIA, { sal: "Z".repeat(32) })))) === 547, "o sal fora do hex minúsculo: o banco recusa (547)");
  ok((await erroDe(() => inserir(linha(MARIA, { conteudo: "{nao é json" })))) === 547, "o conteúdo que não é JSON: o banco recusa (547)");
  ok((await erroDe(() => inserir(linha(MARIA, { conteudo: null })))) === 547, "a carta nova sem conteúdo: o banco recusa (547)");

  // 7. quem voltou pode sair de novo; a volta não vem antes da saída
  const idMaria2 = await inserir(linha(MARIA, { como: "PROPRIO", por: MARIA, dia: "2026-12-10" }));
  ok(idMaria2 > 0, "quem voltou sai de novo (a saída antiga fechada pela volta)");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET VoltouEm = '2026-12-01' WHERE SaidaId = ${idMaria2}`))) === 547, "a volta antes da saída: o banco recusa (547)");

  // 8. o apagamento da carta: sem conteúdo E sem destino, com a data
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET Conteudo = NULL, ConteudoApagadoEm = SYSUTCDATETIME() WHERE SaidaId = ${idCarlos}`))) === 547,
    "apagar o conteúdo e deixar o destino: o banco recusa (547)");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET Conteudo = NULL, DestinoCidade = NULL WHERE SaidaId = ${idCarlos}`))) === 547,
    "apagar o conteúdo sem a data do apagamento: o banco recusa (547)");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET Conteudo = NULL, DestinoCidade = NULL, ConteudoApagadoEm = SYSUTCDATETIME() WHERE SaidaId = ${idCarlos}`))) === 0,
    "apagar o conteúdo e o destino, com a data: grava");
  const apagada = (await q(`SELECT Conteudo, DestinoCidade, Protocolo, CodigoCurto, ImpressaoDigital FROM SaidasDoRol WHERE SaidaId = ${idCarlos}`))[0];
  ok(apagada.Conteudo === null && apagada.DestinoCidade === null && apagada.Protocolo === lc.protocolo && apagada.CodigoCurto === lc.codigo
    && apagada.ImpressaoDigital === lc.impressao, "depois do apagamento ficam o protocolo, o código e a impressão (o QR ainda confere)");

  // 9. a etapa do apagamento leva a data
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET EtapaApagamento = 1 WHERE SaidaId = ${idCarlos}`))) === 547, "a etapa 1 sem a data: o banco recusa (547)");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET EtapaApagamento = 1, Etapa1Em = SYSUTCDATETIME() WHERE SaidaId = ${idCarlos}`))) === 0, "a etapa 1 com a data: grava");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET EtapaApagamento = 2 WHERE SaidaId = ${idCarlos}`))) === 547, "a etapa 2 sem a data dela: o banco recusa (547)");
  ok((await erroDe(() => q(`UPDATE SaidasDoRol SET EtapaApagamento = 3, Etapa2Em = SYSUTCDATETIME() WHERE SaidaId = ${idCarlos}`))) === 547, "a etapa 3 não existe (547)");

  // 10. a CartasTransito (o "processar" antigo) não vê nada disto (D2)
  ok((await escalar(`SELECT COUNT(*) FROM CartasTransito WHERE MembroId IN (${CARLOS}, ${LUCAS}, ${MARIA})`)) === 0, "nada vai para a CartasTransito (o processar antigo nunca vê)");
}

principal().then(() => fim("e2e-104 (a tabela das saídas do rol, migração 189)")).catch((e) => { console.error(e); ok(false, "o roteiro estourou", String(e && e.message)); fim("e2e-104"); });
