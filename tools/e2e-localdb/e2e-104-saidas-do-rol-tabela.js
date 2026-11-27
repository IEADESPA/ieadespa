// e2e-104-saidas-do-rol-tabela.js — a tabela das saídas do rol com a carta nova (FASE 10, Membros, missão B, migração 189), contra o SQL Server de verdade.
// Só dados de mentira. O que se prova é o banco segurando sozinho as regras da tabela, mesmo que uma rota erre:
//  - uma saída aberta por pessoa (o clique duplo não cria duas); quem voltou pode sair de novo; a volta não vem antes da saída;
//  - quem pede por si é a própria pessoa; o filho que sai junto aponta a saída de quem pediu;
//  - o protocolo e o código curto não se repetem; o código só tem os símbolos do papel (sem I, O, 0, 1 nem minúscula); a impressão é hex minúsculo;
//  - a carta viva tem o conteúdo em JSON; a apagada não tem conteúdo nem destino e tem a data; a etapa do apagamento leva a data dela;
//  - a impressão digital calculada na rota (shared/saidaMembro.js) confere depois da ida e volta do conteúdo pelo banco (com acento);
//  - a situação e o tratamento da carta (as respostas dele de 26/11) saem da ficha e dos processos de verdade (shared/saidaRolDb.js).
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

  // 10b. a leitura da ficha para a fotografia (shared/saidaRolDb.js), num pedido só, contra o esquema de verdade
  await q(`UPDATE MembroReferencia SET Sexo = N'M', DataNascimento = '1978-04-02', DataAdmissao = '2009-03-12', FormaAdmissao = N'BATISMO', DataBatismo = '2009-03-12',
             EstadoCivil = N'CASADO', CargoMinisterial = N'DIACONO' WHERE MembroId = ${MARIA}`);
  const papel = await escalar(`SELECT TOP 1 PapelId FROM Papeis WHERE Nome = N'Dirigente de Congregação'`);
  // (a Lideranca tem uma linha por pessoa; o histórico do cargo ministerial, um aberto por pessoa)
  await q(`INSERT INTO Lideranca (MembroId, Tipo, Escopo, PapelId, EscopoTipo, EscopoId, AtivoAte) VALUES (${MARIA}, N'Dirigente', N'congregação', @p, N'CONGREGACAO', @c, NULL);
           INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Ate, Origem) VALUES
             (${MARIA}, N'AUXILIAR', '2014-04-16', '2017-12-09', N'CADASTRO'), (${MARIA}, N'DIACONO', '2017-12-10', NULL, N'CADASTRO')`,
  { p: papel, c: c1.CongregacaoId });
  const fontes = await require(L.path.join(L.API, "shared/saidaRolDb.js")).lerFontesDaCarta(await obterPool(), L.sql, MARIA, "2026-11-25");
  ok(fontes && fontes.membro.nome === "Maria Balcão E2E104" && fontes.membro.sexo === "M" && fontes.membro.dataAdmissao === "2009-03-12", "a leitura traz a ficha", fontes && fontes.membro);
  ok(fontes.cargos.length === 1 && fontes.cargos[0].ativo && fontes.cargos[0].grau === 1 && /^Dirigente de Congregação \(.+\)$/.test(fontes.cargos[0].nome),
    "o cargo com o nome do papel, a congregação do escopo, o grau e vigente", fontes.cargos);
  ok(fontes.consagracoes.map((x) => x.nome).join(",") === "Auxiliar,Diácono", "as consagrações com o rótulo", fontes.consagracoes);
  ok(fontes.disciplina === null && fontes.espiritoSanto === null && fontes.localBatismo === null, "sem disciplina, sem marco e sem turma de batismo: nada inventado");
  const conteudo = saida.montarConteudoDaCarta(fontes, { dia: "2026-11-25", destino: "Belém - PA", protocolo: "CARTA-2026-9999", codigo: "K7P4M2", pedido: { como: "PROPRIO" } });
  ok(conteudo.curto.cargos.length === 1 && /^Dirigente/.test(conteudo.curto.cargos[0].nome) && conteudo.curto.funcao.nome === "Diácono", "a fotografia sai da leitura de verdade", conteudo.curto);

  // 10c. a situação e o tratamento na carta (as respostas dele de 26/11), da ficha e dos processos de verdade: a Débora, adulta, sem o sexo na ficha
  const carta = async () => {
    const f = await require(L.path.join(L.API, "shared/saidaRolDb.js")).lerFontesDaCarta(await obterPool(), L.sql, DEBORA, "2026-11-25");
    return saida.montarConteudoDaCarta(f, { dia: "2026-11-25", destino: "Belém - PA", protocolo: "CARTA-2026-9998", codigo: "K7P4M2", pedido: { como: "PROPRIO" } });
  };
  const textoDa = async () => { const c = await carta(); return c.pendente ? `pendente:${c.pendente}` : `${c.tratamento} | ${c.situacao.texto}`; };
  const caso = async (esperado, rotulo) => { const t = await textoDa(); ok(t === esperado, rotulo, t); };
  await q(`UPDATE MembroReferencia SET SituacaoMembro = N'SEM_COMUNHAO', DataAfastamento = '2025-08-17', DataNascimento = '1985-02-01' WHERE MembroId = ${DEBORA}`);
  await caso("o(a) irmão(ã) | em Observação (sem comunhão desde 17/08/2025)", "sem comunhão sem processo: desde a data do afastamento da ficha; sem o sexo, as duas formas");
  await q(`UPDATE MembroReferencia SET DataAfastamento = NULL, Sexo = N'F' WHERE MembroId = ${DEBORA}`);
  await caso("a irmã | em Observação (sem comunhão)", "sem a data do afastamento: só \"sem comunhão\", sem data inventada");
  const proc = await escalar(`INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) OUTPUT INSERTED.ProcessoId VALUES (${DEBORA}, '2026-11-01', 'EM_ANDAMENTO')`);
  await caso("a irmã | em Observação (processo em andamento)", "o processo em andamento: em Observação (processo em andamento), sem o motivo");
  await q(`UPDATE ProcessosDisciplinares SET Status = 'AFASTAMENTO_CAUTELAR' WHERE ProcessoId = ${proc}`);
  await caso("a irmã | em Observação (processo em andamento)", "o afastamento cautelar: também processo em andamento");
  await q(`UPDATE ProcessosDisciplinares SET Status = 'JULGADO', Resultado = 'SANCAO', DataConclusao = '2026-11-10',
             PenalidadeId = (SELECT PenalidadeId FROM TiposPenalidade WHERE Codigo = 'DISCIPLINA_RIGOROSA') WHERE ProcessoId = ${proc}`);
  await caso("a irmã | em Observação (em disciplina, sem data para terminar)", "a Disciplina Rigorosa (vale até a prova, sem prazo): sem data para terminar");
  await q(`UPDATE ProcessosDisciplinares SET DataTerminoPrevisao = '2027-05-10',
             PenalidadeId = (SELECT PenalidadeId FROM TiposPenalidade WHERE Codigo = 'SUSPENSAO_TEMPORARIA') WHERE ProcessoId = ${proc}`);
  await caso("a irmã | em Observação (em disciplina por 6 meses, até 10/05/2027)", "a suspensão com prazo: por quanto tempo e até quando");
  await q(`UPDATE ProcessosDisciplinares SET Resultado = 'EXCLUSAO', PenalidadeId = NULL, DataTerminoPrevisao = NULL WHERE ProcessoId = ${proc}`);
  await caso("pendente:EXCLUSAO", "a exclusão que ainda vale: a carta não a escreve (recusa)");
  await q(`UPDATE MembroReferencia SET DataAdmissao = '2026-11-20' WHERE MembroId = ${DEBORA}`);
  await caso("a irmã | em Observação (sem comunhão)", "readmitida depois da exclusão (Trava 8-A): a exclusão antiga não conta");
  await q(`UPDATE MembroReferencia SET SituacaoMembro = N'CONGREGADO' WHERE MembroId = ${DEBORA}`);
  await caso("a irmã | em Paz", "a adulta congregada: a irmã, em Paz");
  await q(`UPDATE MembroReferencia SET SituacaoMembro = N'ARROLAMENTO' WHERE MembroId = ${DEBORA}`);
  const arrol = await carta();
  ok(!arrol.pendente && arrol.tratamento === "a irmã" && arrol.situacao.codigo === "ARROLAMENTO" && arrol.situacao.frase === saida.FRASE_ARROLAMENTO,
    "a adulta em arrolamento: a irmã, com a frase do cadastro em atualização", arrol.situacao);
  await q(`UPDATE MembroReferencia SET SituacaoMembro = N'SITUACAO_INVENTADA_E2E' WHERE MembroId = ${DEBORA}`);
  await caso("pendente:SITUACAO_DESCONHECIDA", "a situação que a carta não conhece: recusa");

  // 10. a CartasTransito (o "processar" antigo) não vê nada disto (D2)
  ok((await escalar(`SELECT COUNT(*) FROM CartasTransito WHERE MembroId IN (${CARLOS}, ${LUCAS}, ${MARIA})`)) === 0, "nada vai para a CartasTransito (o processar antigo nunca vê)");
}

principal().then(() => fim("e2e-104 (a tabela das saídas do rol, migração 189)")).catch((e) => { console.error(e); ok(false, "o roteiro estourou", String(e && e.message)); fim("e2e-104"); });
