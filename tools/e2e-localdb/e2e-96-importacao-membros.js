// e2e-96-importacao-membros.js — A IMPORTAÇÃO DOS MEMBROS DO SISTEMA PAGO (FASE 10, v10.1e, passo 9 de Membros; migração 185; 22/11/2026), contra o SQL Server
// de verdade. Só dados de mentira. As regras do responsável (18/11 e 22/11/2026): só a Secretaria Geral; UMA VEZ SÓ; colunas extras aceitas; a matrícula
// repetida ou zerada entra com a próxima do sistema e a pendência NUMERO; a possível repetida, a pendência REPETIDA; "IEADESPA - GERAL" sem congregação; todo
// importado em "Arrolamento a completar" (sem voto) com a pendência ARROLAMENTO.
// O caminho inteiro pela rota: a prévia (e a que substitui a anterior), a lista e o CSV sem dado pessoal, a confirmação (428 sem fator recente), o que mudou no
// banco DEPOIS da prévia (a matrícula usada por outro cadastro, o CPF gravado em outra ficha), os lotes (um de 4 e o resto disputado por DOIS processos ao mesmo
// tempo: a trava faz um esperar o outro e ninguém entra duas vezes), as pendências, os dados pessoais das linhas apagados no fim, a cadeia da trilha e o "uma
// vez só". Roda sobre a base cenario-185 (`bash rodar.sh preparar-185` e depois `BASE=cenario-185 bash rodar.sh roteiro e2e-96-importacao-membros.js`).
process.env.AUTH_SECRET = "segredo-da-importacao-de-membros-" + "x".repeat(24);
const { spawn } = require("child_process");
const crypto = require("crypto");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;

const PERM = ["pessoas"];
const fator = () => ({ via: "CHAVE", em: Date.now() });
const C = { VN: "Vila Nova E2E96", MS: "Monte Sião E2E96", FE: "Fechada E2E96" };
const tok = {
  geral: () => L.sessao(9601, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  geralSemFator: () => L.sessao(9601, { via: "SENHA", nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: PERM }),
  local: () => L.sessao(9602, { via: "SENHA", fator: fator(), nivel: "CONGREGACAO", escopoCongregacoes: [C.VN], permissoes: PERM }),
  semPessoas: () => L.sessao(9603, { via: "SENHA", fator: fator(), nivel: "GLOBAL", escopoCongregacoes: "TODAS", permissoes: ["reunioes"] })
};
// CPF de mentira com os dígitos certos (não é de ninguém)
function cpfDe(base9) {
  const b = String(base9).padStart(9, "0");
  const dv = (s) => { let t = 0; for (let i = 0; i < s.length; i++) t += Number(s[i]) * (s.length + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(b); return b + d1 + dv(b + d1);
}
const CPF_A = cpfDe(960000001), CPF_B = cpfDe(960000002);
const CAB = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF;COR FAVORITA";
const ARQUIVO = [CAB,
  `960101;Ana Importada;IEADESPA - ${C.VN};FEMININO;14/03/1990;CASADA;ana.e2e96@example.org;(91) 98888-7777;Mae Ficticia;Pai Ficticio;${CPF_B};azul`,  // 2
  "0;Bia Zerada;IEADESPA - GERAL;FEMININO",                                       // 3  matrícula 0, sem congregação
  `960103;Caio Souza;IEADESPA - ${C.MS};MASCULINO`,                               // 4
  `960103;Caio Mendes Souza;IEADESPA - ${C.MS}`,                                  // 5  repetida no arquivo, parece a mesma pessoa da 4
  `960001;Rui Lima;IEADESPA - ${C.VN}`,                                           // 6  a matrícula já é de "Rui Barbosa Lima" (parece a mesma)
  `960002;Sara Nova;IEADESPA - ${C.VN}`,                                          // 7  a matrícula já é de outra pessoa
  `960108;Tito Novo;IEADESPA - ${C.VN};;;;;;;;${CPF_A}`,                          // 8  o CPF já está na ficha 960003
  `960109;;IEADESPA - ${C.VN}`,                                                   // 9  sem nome: não entra
  `960110;Uma Fechada;IEADESPA - ${C.FE}`,                                        // 10 congregação desativada: não entra
  "960111;Vera Extra;IEADESPA - Lugar Nenhum E2E96",                              // 11 congregação que não existe: não entra
  `;Wagner Vazio;IEADESPA - ${C.VN}`,                                             // 12 sem matrícula
  `960113;Xavier Dados Ruins;IEADESPA - ${C.VN};X;31/02/1990;NOIVO;x@;123;;;12345678900`  // 13 valores estragados; a matrícula vai ser usada depois da prévia
].join("\r\n");
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  const R = (token, { metodo = "GET", acao = "", corpo, query } = {}) =>
    chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {}, query: query || {} });

  console.log("== a migração 185 ==");
  ok(await escalar("SELECT COUNT(*) FROM sys.tables WHERE name IN ('ImportacoesMembros', 'ImportacoesMembrosLinhas')") === 2, "as duas tabelas");
  ok(await escalar("SELECT COUNT(*) FROM sys.indexes WHERE name IN ('UX_ImportacoesMembros_Andamento', 'UX_ImportacoesMembros_Previa') AND has_filter = 1 AND is_unique = 1") === 2,
    "os índices únicos filtrados (uma prévia e uma em andamento por vez)");
  ok(await escalar("SELECT COUNT(*) FROM SituacoesMembro WHERE Sigla = N'ARROLAMENTO'") === 1, "a situação ARROLAMENTO uma vez só (a migração rodou duas vezes)");

  console.log("== o cenário ==");
  const area = (await q("INSERT INTO Areas (Nome) VALUES (N'Área E2E96'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id"))[0].id;
  const cong = {};
  for (const [k, nome] of [["VN", C.VN], ["MS", C.MS], ["FE", C.FE]]) cong[k] = (await q("INSERT INTO Congregacoes (Nome, AreaId) VALUES (@n, @a); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id", { n: nome, a: area }))[0].id;
  await q("UPDATE Congregacoes SET Ativa = 0 WHERE CongregacaoId = @c", { c: cong.FE });
  const ficha = (id, nome, cpf = null) => q(`INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, Cpf)
    VALUES (@id, @n, @c, N'ATIVO', N'EM_COMUNHAO', '1980-05-20', @cpf)`, { id, n: nome, c: cong.VN, cpf });
  await ficha(960001, "Rui Barbosa Lima");
  await ficha(960002, "Outra Pessoa Antiga");
  await ficha(960003, "Tito Antigo", CPF_A);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda");

  console.log("== quem pode ==");
  ok((await R(null)).status === 401, "sem sessão: 401");
  ok((await R(tok.local())).status === 403, "a liderança local: 403 (só a Secretaria Geral)");
  ok((await R(tok.semPessoas())).status === 403, "sem a permissão de pessoas: 403");
  const e0 = await R(tok.geral());
  ok(e0.status === 200 && e0.body.feita === false && e0.body.emAndamento === false && e0.body.importacao === null, "o estado: nada feito", e0.body);

  console.log("== a prévia ==");
  ok((await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: {} })).status === 400, "sem o texto: 400");
  const soCab = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: CAB } });
  ok(soCab.status === 400 && /só tem o cabeçalho/.test(soCab.body.mensagem), "só o cabeçalho: 400 com o motivo", soCab.body);
  const semMat = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: "NOME;IGREJA\r\nAna;IEADESPA - GERAL" } });
  ok(semMat.status === 400 && /matrícula/.test(semMat.body.mensagem), "sem a coluna de matrícula: 400", semMat.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "o arquivo que não serve não grava nada");

  const p1 = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros<script>.csv", texto: ARQUIVO } });
  const s1 = p1.body.resumo || {};
  ok(p1.status === 200 && p1.body.sucesso === true && Number.isInteger(p1.body.importacaoId), "a prévia é aceita", p1.body);
  ok(s1.total === 12 && s1.novas === 9 && s1.problemas === 3, "12 linhas: 9 entram, 3 não entram", s1);
  ok(s1.numeroNovo === 5 && s1.possivelRepetida === 3 && s1.semCongregacao === 1, "5 com número novo, 3 possíveis repetidas, 1 sem congregação", s1);
  ok(JSON.stringify(s1.colunas || s1).includes("COR FAVORITA"), "a coluna extra desconhecida é aceita e mostrada", s1.colunas);
  ok(!/Ana Importada|Xavier|example\.org|98888|Mae Ficticia/.test(JSON.stringify(s1)) && !JSON.stringify(s1).includes(CPF_B), "o resumo não tem dado pessoal");
  const id1 = p1.body.importacaoId;
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: id1 }) === 12, "as 12 linhas gravadas na prévia");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 960100 AND 960199") === 0, "na prévia ninguém entra ainda");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE ImportacaoId = @i AND NomeArquivo = N'membrosscript.csv'", { i: id1 }) === 1, "o nome do arquivo sem os sinais < >");
  const linhaDe = async (id, n) => (await q("SELECT * FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = @l", { i: id, l: n }))[0];
  const l5 = await linhaDe(id1, 5), l6 = await linhaDe(id1, 6), l8 = await linhaDe(id1, 8), l3 = await linhaDe(id1, 3);
  ok(l5.NumeroNovo === true && l5.MotivoNumero === "REPETIDA_NO_ARQUIVO" && l5.RepetidaLinha === 4, "a linha 5: matrícula repetida no arquivo, possível repetida da 4", l5);
  ok(l6.NumeroNovo === true && l6.MotivoNumero === "DE_OUTRA_FICHA" && l6.RepetidaMembro === 960001, "a linha 6: a matrícula já é de outra ficha, que parece a mesma pessoa", l6);
  ok(l8.Cpf === null && l8.RepetidaMembro === 960003 && l8.NumeroNovo === false, "a linha 8: o CPF já é da ficha 960003 — entra sem ele, como possível repetida", l8);
  ok(l3.MotivoNumero === "ZERO" && l3.CongregacaoId === null, "a linha 3: matrícula 0 e 'IEADESPA - GERAL' sem congregação", l3);

  console.log("== a lista para conferir e o CSV ==");
  const lp = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1, filtro: "problemas" } });
  ok(lp.status === 200 && lp.body.total === 3 && lp.body.itens.map((i) => i.linha).join(",") === "9,10,11", "os 3 que não entram", lp.body);
  const la = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1, filtro: "avisos" } });
  ok(la.status === 200 && la.body.total >= 6, "os que entram com aviso", la.body.total);
  const lt = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1 } });
  const txtLista = JSON.stringify(lt.body);
  ok(lt.body.total === 12 && !txtLista.includes(CPF_B) && !txtLista.includes(CPF_A) && !/example\.org|98888/.test(txtLista), "a lista inteira: nunca o CPF nem o contato");
  const cv = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: id1 } });
  ok(cv.status === 200 && /text\/csv/.test(cv.headers["Content-Type"]) && String(cv.body).startsWith("﻿Linha;") && !String(cv.body).includes(CPF_B), "o CSV para o Excel, sem CPF", cv.status);
  ok((await R(tok.local(), { acao: "lista", query: { importacaoId: id1 } })).status === 403, "a liderança local não vê a lista");

  console.log("== a nova prévia substitui a anterior ==");
  const p2 = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros.csv", texto: ARQUIVO } });
  const id2 = p2.body.importacaoId;
  ok(p2.status === 200 && id2 !== id1, "a segunda prévia", p2.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE ImportacaoId = @i AND Situacao = N'DESCARTADA'", { i: id1 }) === 1
    && await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: id1 }) === 0, "a anterior descartada, com as linhas (e os dados pessoais) apagadas");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'PREVIA'") === 1, "uma prévia aberta só");

  console.log("== a confirmação ==");
  const cAntiga = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id1 } });
  ok(cAntiga.status === 409 && /não é mais a atual/.test(cAntiga.body.mensagem), "confirmar a prévia antiga: 409", cAntiga.body);
  const cSem = await R(tok.geralSemFator(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id2 } });
  ok(cSem.status === 428 && cSem.body.precisaFator === true, "sem a confirmação recente de quem é: 428", cSem.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE ImportacaoId = @i AND Situacao = N'PREVIA'", { i: id2 }) === 1, "o 428 não mexe em nada");
  const c1 = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id2 } });
  ok(c1.status === 200 && c1.body.restantes === 9, "confirmada: 9 a importar", c1.body);
  const c2 = await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id2 } });
  ok(c2.status === 200 && c2.body.jaConfirmada === true && c2.body.restantes === 9, "confirmar de novo (o duplo clique): a mesma, sem erro", c2.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'FORA'", { i: id2 }) === 3, "as 3 com problema ficam de fora");
  const pAnd = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQUIVO } });
  ok(pAnd.status === 409 && /em andamento/.test(pAnd.body.mensagem), "outra prévia com a importação em andamento: 409", pAnd.body);
  ok((await R(tok.geral(), { metodo: "POST", acao: "descartar", corpo: { importacaoId: id2 } })).status === 409, "descartar depois de confirmada: 409 (daqui não volta)");
  const e1 = await R(tok.geral());
  ok(e1.body.emAndamento === true && e1.body.restantes === 9, "o estado: em andamento, 9 faltando", e1.body);

  console.log("== o que mudou no banco DEPOIS da prévia ==");
  await ficha(960113, "Zelia Cadastrada Depois");                 // alguém cadastrou com a matrícula da linha 13
  await ficha(960050, "Dona do CPF Depois", CPF_B);               // e outro gravou o CPF da linha 2
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");

  console.log("== o primeiro lote (4) ==");
  const db = require(path.join(L.API, "shared/importacaoMembrosDb"));
  const { getPool } = require(path.join(L.API, "shared/db"));
  const b1 = await db.importarLote(await getPool(), { membroId: 9601 }, id2, { tamanho: 4 });
  ok(b1.sucesso === true && b1.importadas === 4 && b1.restantes === 5 && b1.concluida === false, "4 importadas, 5 faltando", b1);
  const ana = (await q("SELECT MembroId, Cpf, SituacaoMembro, CongregacaoId, Email FROM MembroReferencia WHERE MembroId = 960101"))[0];
  ok(ana && ana.Cpf === null && ana.SituacaoMembro === "ARROLAMENTO" && ana.CongregacaoId === cong.VN && ana.Email === "ana.e2e96@example.org",
    "a linha 2 entrou com a matrícula do arquivo, SEM o CPF (gravado em outra ficha depois da prévia), em ARROLAMENTO", ana);
  const xav = (await q("SELECT MatriculaFinal, NumeroNovo, MotivoNumero FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = 13", { i: id2 }))[0];
  ok(xav.MatriculaFinal && xav.MatriculaFinal !== 960113 && xav.NumeroNovo === true && xav.MotivoNumero === "DE_OUTRA_FICHA",
    "a linha 13: a matrícula foi usada depois da prévia — entrou com a próxima do sistema (NUMERO)", xav);
  ok(await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 960113") === "Zelia Cadastrada Depois", "a ficha de quem usou a matrícula ficou como estava");

  console.log("== o resto, disputado por DOIS processos ao mesmo tempo ==");
  const corrida = await disparar([{ lotes: id2 }, { lotes: id2 }]);
  ok(corrida.every((r) => r.ok && r.concluida === true), "os dois terminam com a importação concluída", corrida);
  ok(corrida.reduce((s, r) => s + (r.importadas || 0), 0) === 5, "os dois juntos importaram 5 (ninguém entrou duas vezes)", corrida.map((r) => r.importadas));

  console.log("== o resultado ==");
  const linhas = await q("SELECT Linha, Estado, MatriculaFinal, NumeroNovo, RepetidaLinha, RepetidaMembro FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: id2 });
  const finais = linhas.filter((l) => l.Estado === "IMPORTADA").map((l) => l.MatriculaFinal);
  ok(finais.length === 9 && new Set(finais).size === 9, "9 fichas, cada uma com a sua matrícula", finais);
  const fin = (n) => linhas.find((l) => l.Linha === n).MatriculaFinal;
  ok(fin(2) === 960101 && fin(4) === 960103 && fin(8) === 960108, "as matrículas do arquivo que serviam ficaram (960101, 960103, 960108)");
  const novos = [3, 5, 6, 7, 12, 13].map(fin);
  ok(novos.every((m) => m > 0 && ![0, 960001, 960002, 960003, 960050, 960101, 960103, 960108, 960113].includes(m)), "as de número novo receberam a próxima do sistema", novos);
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (" + finais.join(",") + ") AND SituacaoMembro = N'ARROLAMENTO'") === 9,
    "todo importado em 'Arrolamento a completar'");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId IN (" + finais.join(",") + ") AND SituacaoMembro = N'EM_COMUNHAO'") === 0,
    "nenhum importado EM_COMUNHAO (sem voto até completar)");
  ok(await escalar("SELECT CongregacaoId FROM MembroReferencia WHERE MembroId = @m", { m: fin(3) }) === null, "a 'IEADESPA - GERAL' sem congregação");
  const xavF = (await q("SELECT Sexo, DataNascimento, EstadoCivil, Email, Telefone, Cpf FROM MembroReferencia WHERE MembroId = @m", { m: fin(13) }))[0];
  ok(xavF.Sexo === null && xavF.DataNascimento === null && xavF.EstadoCivil === null && xavF.Email === null && xavF.Telefone === null && xavF.Cpf === null,
    "os valores estragados ficaram de fora (a pessoa entrou sem eles)", xavF);

  const pend = await q("SELECT MembroId, Tipo, OutroMembroId, Origem, Situacao FROM FichasPendencias WHERE MembroId IN (" + finais.join(",") + ")");
  const deTipo = (t) => pend.filter((p) => p.Tipo === t);
  ok(deTipo("ARROLAMENTO").length === 9 && deTipo("ARROLAMENTO").every((p) => p.Origem === "IMPORTACAO" && p.Situacao === "ABERTA"), "9 pendências ARROLAMENTO, abertas", deTipo("ARROLAMENTO").length);
  ok(deTipo("NUMERO").length === 6 && new Set(deTipo("NUMERO").map((p) => p.MembroId)).size === 6 && deTipo("NUMERO").every((p) => novos.includes(p.MembroId)),
    "6 pendências NUMERO (as 5 da prévia e a da matrícula usada depois)", deTipo("NUMERO").map((p) => p.MembroId));
  const rep = deTipo("REPETIDA").map((p) => `${p.MembroId}>${p.OutroMembroId}`).sort();
  const repEsperado = [`960101>960050`, `960108>960003`, `${fin(6)}>960001`, `${fin(5)}>960103`].sort();
  ok(JSON.stringify(rep) === JSON.stringify(repEsperado), "4 pendências REPETIDA: o CPF de depois, o CPF de antes, a matrícula de outra ficha e a repetida no arquivo", { rep, repEsperado });

  const imp = (await q("SELECT Situacao, ConcluidaEm, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: id2 }))[0];
  const res = JSON.parse(imp.Resumo).resultado || {};
  ok(imp.Situacao === "CONCLUIDA" && imp.ConcluidaEm, "a importação concluída");
  ok(res.importadas === 9 && res.fora === 3 && res.numeroNovo === 6 && res.possivelRepetida === 4 && res.semCongregacao === 1, "o resultado final", res);
  ok(await escalar(`SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND (Cpf IS NOT NULL OR Email IS NOT NULL OR Telefone IS NOT NULL OR NomeMae IS NOT NULL
    OR NomePai IS NOT NULL OR DataNascimento IS NOT NULL OR IgrejaArquivo IS NOT NULL OR CongregacaoId IS NOT NULL OR Sexo IS NOT NULL)`, { i: id2 }) === 0,
    "no fim, os dados pessoais das linhas apagados (fica a lista para conferir)");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Nome IS NOT NULL", { i: id2 }) === 11, "o nome fica para a lista (a linha sem nome não tinha)");

  console.log("== a trilha ==");
  const trilha = await q("SELECT AuditId, Tabela, RegistroId, Acao, UsuarioId, DadosAntes, DadosDepois, HashRegistro FROM AuditLog WHERE AuditId > @a AND Tabela = N'MembroReferencia' ORDER BY AuditId", { a: auditAntes });
  const imps = trilha.filter((t) => t.Acao === "Importou pessoa do sistema pago");
  ok(imps.length === 9 && new Set(imps.map((t) => t.RegistroId)).size === 9, "9 registros 'Importou pessoa do sistema pago'", imps.length);
  ok(!trilha.some((t) => String(t.DadosDepois || "").includes(CPF_B) || String(t.DadosDepois || "").includes(CPF_A)), "a trilha sem o CPF inteiro");
  // a cadeia de hashes: cada registro da tabela confere com o anterior da MESMA tabela
  let cadeiaOk = true;
  for (const t of trilha) {
    const ant = await escalar("SELECT TOP 1 HashRegistro FROM AuditLog WHERE Tabela = N'MembroReferencia' AND AuditId < @a ORDER BY AuditId DESC", { a: t.AuditId });
    const payload = JSON.stringify({ tabela: t.Tabela, registroId: t.RegistroId, acao: t.Acao, usuarioId: t.UsuarioId || null, dadosAntes: t.DadosAntes, dadosDepois: t.DadosDepois });
    if (sha256(payload + (ant || "")) !== t.HashRegistro) cadeiaOk = false;
  }
  ok(cadeiaOk, "a cadeia de hashes da trilha confere");
  ok(await escalar("SELECT COUNT(*) FROM AuditLog WHERE Tabela = N'ImportacoesMembros' AND RegistroId = @i AND Acao LIKE N'Concluiu%'", { i: id2 }) === 1, "a conclusão na trilha");

  console.log("== uma vez só ==");
  const e2 = await R(tok.geral());
  ok(e2.body.feita === true && e2.body.emAndamento === false && e2.body.importacao.situacao === "CONCLUIDA", "o estado: feita", e2.body);
  const p3 = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQUIVO } });
  ok(p3.status === 409 && /uma vez só/.test(p3.body.mensagem), "outra prévia depois de concluída: 409 'é uma vez só'", p3.body);
  ok((await R(tok.geral(), { metodo: "POST", acao: "confirmar", corpo: { importacaoId: id2 } })).status === 409, "confirmar de novo: 409");
  const b9 = await R(tok.geral(), { metodo: "POST", acao: "lote", corpo: { importacaoId: id2 } });
  ok(b9.status === 200 && b9.body.concluida === true && b9.body.importadas === 0, "mais um lote (a tela que chamou de novo): nada entra", b9.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao IN (N'PREVIA', N'IMPORTANDO')") === 0, "nada aberto");

  fim("e2e-96 (a importação dos membros)");
}

// ---- os processos filhos da corrida (cada um com a sua conexão; a ponte do shim é uma conexão só, então Promise.all não prova corrida)
async function filho() {
  const spec = JSON.parse(process.argv[3]);
  await obterPool();
  const espera = spec.t0 - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  let saida;
  try {
    const { chamarRota } = require("./lib-afm");
    let importadas = 0, concluida = false, voltas = 0, ultimo = null;
    while (!concluida && voltas++ < 20) {
      const r = await chamarRota("ImportacaoMembros/index.js", { metodo: "POST", token: tok.geral(), binding: { acao: "lote" }, corpo: { importacaoId: spec.lotes } });
      ultimo = { status: r.status, body: r.body };
      if (r.status !== 200) break;
      importadas += r.body.importadas || 0;
      concluida = r.body.concluida === true;
    }
    saida = { ok: concluida, importadas, concluida, ultimo };
  } catch (e) { saida = { ok: false, erro: e && e.message }; }
  process.stdout.write("@@RESULTADO@@" + JSON.stringify(saida) + "\n");
  L.shimEncerrar();
}
function disparar(specs) {
  const t0 = Date.now() + 7000 + specs.length * 800;
  return Promise.all(specs.map((s, i) => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), __filename, "filho", JSON.stringify({ n: i, t0, ...s })], { env: process.env });
    let saida = ""; p.stdout.on("data", (d) => { saida += d; });
    p.on("exit", () => { const m = saida.split("\n").find((l) => l.startsWith("@@RESULTADO@@")); resolve(m ? JSON.parse(m.slice(13)) : { ok: false, erro: "sem resultado" }); });
  })));
}

if (process.argv[2] === "filho") filho(); else principal().catch((e) => { console.error(e); process.exitCode = 1; L.shimEncerrar(); });
