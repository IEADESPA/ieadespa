// e2e-96-importacao-membros.js — A IMPORTAÇÃO DOS MEMBROS DO SISTEMA PAGO (FASE 10, v10.1e, passo 9 de Membros; migração 185; 22/11/2026), contra o SQL Server
// de verdade. Só dados de mentira. As regras do responsável (18/11 e 22/11/2026): só a Secretaria Geral; UMA VEZ SÓ; colunas extras aceitas (e o mapa escolhido
// na tela, 23/11); a matrícula que JÁ É de uma ficha do sistema fica de fora (as regras da rodada 28); a repetida no arquivo ou zerada entra com a próxima do
// sistema e a pendência NUMERO; a possível repetida, a pendência REPETIDA; "IEADESPA - GERAL" sem congregação; todo importado em "Arrolamento a completar" (sem
// voto) com a pendência ARROLAMENTO. E o que a tela r27 lê: os quadros, a matrícula a acertar (quem ficou com o número e o número previsto) e o retrato do fim.
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
  `960001;Rui Lima;IEADESPA - ${C.VN}`,                                           // 6  a matrícula já é de "Rui Barbosa Lima": fica de fora
  `960002;Sara Nova;IEADESPA - ${C.VN}`,                                          // 7  a matrícula já é de outra pessoa: fica de fora
  `960108;Tito Novo;IEADESPA - ${C.VN};;;;;;;;${CPF_A}`,                          // 8  o CPF já está na ficha 960003
  `960109;;IEADESPA - ${C.VN}`,                                                   // 9  sem nome: não entra
  `960110;Uma Fechada;IEADESPA - ${C.FE}`,                                        // 10 congregação desativada: não entra
  "960111;Vera Extra;IEADESPA - Lugar Nenhum E2E96",                              // 11 congregação que não existe: não entra
  `;Wagner Vazio;IEADESPA - ${C.VN}`,                                             // 12 sem matrícula
  `960113;Xavier Dados Ruins;IEADESPA - ${C.VN};X;31/02/1990;NOIVO;x@;123;;;12345678900`,  // 13 valores estragados; a matrícula vai ser usada depois da prévia
  `960114;tito  antigo;IEADESPA - ${C.VN};MASCULINO;20/05/1980`,                 // 14 o mesmo nome e nascimento da ficha 960003 (sem maiúscula, espaço a mais)
  `960115;Ana Importada;IEADESPA - ${C.MS};FEMININO;14/03/1990`                   // 15 o mesmo nome e nascimento da linha 2
].join("\r\n");
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");

async function principal() {
  const { chamarRota } = require("./lib-afm");
  await obterPool();
  // E2E96_GRAVAR=<arquivo>: grava as respostas da rota (para as fotos da tela com o contrato de verdade; só dados de mentira)
  const gravadas = [];
  const R = async (token, { metodo = "GET", acao = "", corpo, query } = {}) => {
    const res = await chamarRota("ImportacaoMembros/index.js", { metodo, token, binding: { acao }, corpo: corpo || {}, query: query || {} });
    if (process.env.E2E96_GRAVAR) gravadas.push({ metodo, acao, query: query || {}, colunas: corpo && corpo.colunas ? true : false, status: res.status, body: res.body });
    return res;
  };

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
  // quem importa (o nome vai para o retrato do resultado)
  await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = 9601) INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro)
    VALUES (9601, N'Secretaria Geral E2E96', @c, N'ATIVO', N'EM_COMUNHAO')`, { c: cong.VN });
  const nomeDe9601 = await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 9601");
  const fichasAntes = JSON.stringify(await q("SELECT MembroId, Nome, CongregacaoId, SituacaoMembro, Cpf FROM MembroReferencia WHERE MembroId IN (960001, 960002) ORDER BY MembroId"));
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "nenhuma importação ainda");

  console.log("== quem pode ==");
  ok((await R(null)).status === 401, "sem sessão: 401");
  ok((await R(tok.local())).status === 403, "a liderança local: 403 (só a Secretaria Geral)");
  ok((await R(tok.semPessoas())).status === 403, "sem a permissão de pessoas: 403");
  const e0 = await R(tok.geral());
  ok(e0.status === 200 && e0.body.feita === false && e0.body.emAndamento === false && e0.body.importacao === null && e0.body.retrato === null, "o estado: nada feito", e0.body);
  ok(Array.isArray(e0.body.campos) && e0.body.campos.filter((c) => c.padrao).length === 11 && e0.body.campos.some((c) => c.campo === "escolaridade" && !c.padrao),
    "o catálogo do mapa das colunas: as 11 de sempre e as a mais", e0.body.campos);

  console.log("== a prévia ==");
  ok((await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: {} })).status === 400, "sem o texto: 400");
  const soCab = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: CAB } });
  ok(soCab.status === 400 && /só tem o cabeçalho/.test(soCab.body.mensagem), "só o cabeçalho: 400 com o motivo", soCab.body);
  const semMat = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: "NOME;IGREJA\r\nAna;IEADESPA - GERAL" } });
  ok(semMat.status === 400 && /matrícula/.test(semMat.body.mensagem), "sem a coluna de matrícula: 400", semMat.body);
  ok(semMat.body.colunas && JSON.stringify(semMat.body.colunas.lista) === JSON.stringify([{ indice: 0, coluna: "NOME", campo: "nome" }, { indice: 1, coluna: "IGREJA", campo: "igreja" }]) && !semMat.body.linhas,
    "o mapa volta junto (só os nomes do cabeçalho): a tela mostra e a Geral liga a coluna que falta", semMat.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros") === 0, "o arquivo que não serve não grava nada");

  const p1 = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros<script>.csv", texto: ARQUIVO } });
  const s1 = p1.body.resumo || {};
  ok(p1.status === 200 && p1.body.sucesso === true && Number.isInteger(p1.body.importacaoId), "a prévia é aceita", p1.body);
  ok(s1.total === 14 && s1.novas === 9 && s1.problemas === 5 && s1.jaExistem === 2, "14 linhas: 9 entram; 5 não entram, 2 delas porque a matrícula já existe", s1);
  ok(s1.numeroNovo === 3 && s1.possivelRepetida === 4 && s1.semCongregacao === 1, "3 com número novo, 4 possíveis repetidas, 1 sem congregação", s1);
  ok(JSON.stringify(s1.quadros) === JSON.stringify({ comMatricula: 3, acertar: 3, repetidas: 3 }), "os quadros da tela: cada uma numa caixa só (3 + 3 + 3 = 9)", s1.quadros);
  ok(s1.vazias === 0 && s1.totalColunas === 12 && s1.primeiraMatriculaNova === 960116 && s1.congregacoesReconhecidas === 2, "as vazias, as colunas, a primeira matrícula nova", s1);
  ok(JSON.stringify(s1.colunas || s1).includes("COR FAVORITA"), "a coluna extra desconhecida é aceita e mostrada", s1.colunas);
  ok(s1.colunas.lista.length === 12 && s1.colunas.lista[11].campo === null && s1.colunas.lista[10].campo === "cpf" && s1.colunas.escolhidas === false,
    "o mapa das colunas na ordem do cabeçalho (a COR FAVORITA sem campo)", s1.colunas.lista);
  ok(!/Ana Importada|Xavier|example\.org|98888|Mae Ficticia/.test(JSON.stringify(s1)) && !JSON.stringify(s1).includes(CPF_B), "o resumo não tem dado pessoal");
  const id1 = p1.body.importacaoId;
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i", { i: id1 }) === 14, "as 14 linhas gravadas na prévia");
  ok(await escalar("SELECT COUNT(*) FROM MembroReferencia WHERE MembroId BETWEEN 960100 AND 960199") === 0, "na prévia ninguém entra ainda");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE ImportacaoId = @i AND NomeArquivo = N'membrosscript.csv'", { i: id1 }) === 1, "o nome do arquivo sem os sinais < >");
  const linhaDe = async (id, n) => (await q("SELECT * FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = @l", { i: id, l: n }))[0];
  const l5 = await linhaDe(id1, 5), l6 = await linhaDe(id1, 6), l8 = await linhaDe(id1, 8), l3 = await linhaDe(id1, 3);
  ok(l5.NumeroNovo === true && l5.MotivoNumero === "REPETIDA_NO_ARQUIVO" && l5.RepetidaLinha === 4, "a linha 5: matrícula repetida no arquivo, possível repetida da 4", l5);
  ok(l6.Acao === "PROBLEMA" && l6.Problemas === "MATRICULA_JA_EXISTE" && l6.NumeroNovo === false && l6.RepetidaMembro === null,
    "a linha 6: a matrícula já é de uma ficha do sistema — fica de fora (mesmo parecendo a mesma pessoa)", l6);
  const l7 = await linhaDe(id1, 7);
  ok(l7.Acao === "PROBLEMA" && l7.Problemas === "MATRICULA_JA_EXISTE", "a linha 7: a matrícula já é de outra pessoa — fica de fora", l7);
  ok(l8.Cpf === null && l8.RepetidaMembro === 960003 && l8.NumeroNovo === false, "a linha 8: o CPF já é da ficha 960003 — entra sem ele, como possível repetida", l8);
  ok(l3.MotivoNumero === "ZERO" && l3.CongregacaoId === null, "a linha 3: matrícula 0 e 'IEADESPA - GERAL' sem congregação", l3);

  console.log("== a lista para conferir e o CSV ==");
  const lp = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1, filtro: "problemas" } });
  ok(lp.status === 200 && lp.body.total === 5 && lp.body.itens.map((i) => i.linha).join(",") === "6,7,9,10,11", "os 5 que não entram", lp.body);
  ok(/já é de uma ficha do sistema: fica de fora/.test(lp.body.itens[0].motivos.join(" ")), "o motivo da linha 6 na lista", lp.body.itens[0]);
  const lac = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(id1), filtro: "acertar" } });
  const porLinha = (lista, n) => lista.body.itens.find((i) => i.linha === n) || {};
  ok(lac.status === 200 && lac.body.total === 3 && lac.body.itens.map((i) => i.linha).join(",") === "3,5,12", "a matrícula a acertar: as linhas 3, 5 e 12", lac.body);
  ok(JSON.stringify(porLinha(lac, 3).detalhe) === JSON.stringify({ motivoNumero: "ZERO", semCongregacao: true, dono: null, repetidaDe: null, recebe: 960116, prevista: true }),
    "a linha 3: matrícula 0, sem congregação, recebe a 960.116 (prevista)", porLinha(lac, 3));
  ok(porLinha(lac, 5).detalhe.dono && porLinha(lac, 5).detalhe.dono.linha === 4 && porLinha(lac, 5).detalhe.dono.nome === "Caio Souza" && porLinha(lac, 5).detalhe.dono.sexo === "M" && porLinha(lac, 5).detalhe.recebe === 960117
    && porLinha(lac, 5).detalhe.repetidaDe.linha === 4, "a linha 5: a 960103 ficou com o Caio Souza (linha 4, masculino: a tela diz do Caio), que veio antes; recebe a 960.117", porLinha(lac, 5));
  ok(porLinha(lac, 12).detalhe.motivoNumero === "VAZIA" && porLinha(lac, 12).detalhe.recebe === 960118, "a linha 12: sem matrícula, recebe a 960.118", porLinha(lac, 12));
  const lrp = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(id1), filtro: "repetidas" } });
  ok(lrp.status === 200 && lrp.body.total === 3 && lrp.body.itens.map((i) => i.linha).join(",") === "8,14,15" && porLinha(lrp, 8).detalhe.repetidaDe.matricula === 960003 && porLinha(lrp, 8).detalhe.repetidaDe.nome === "Tito Antigo",
    "as possíveis repetidas do quadro: a 8 (o CPF da ficha 960003), a 14 e a 15 (o mesmo nome e nascimento)", lrp.body);
  const la = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1, filtro: "avisos" } });
  ok(la.status === 200 && la.body.total === 7 && la.body.itens.map((i) => i.linha).join(",") === "3,5,8,12,13,14,15", "os 7 que entram com aviso", la.body.total);
  const lt = await R(tok.geral(), { acao: "lista", query: { importacaoId: id1 } });
  const txtLista = JSON.stringify(lt.body);
  ok(lt.body.total === 14 && !txtLista.includes(CPF_B) && !txtLista.includes(CPF_A) && !/example\.org|98888/.test(txtLista), "a lista inteira: nunca o CPF nem o contato");
  const cv = await R(tok.geral(), { acao: "lista.csv", query: { importacaoId: id1 } });
  ok(cv.status === 200 && /text\/csv/.test(cv.headers["Content-Type"]) && String(cv.body).startsWith("﻿Linha;") && !String(cv.body).includes(CPF_B), "o CSV para o Excel, sem CPF", cv.status);
  ok((await R(tok.local(), { acao: "lista", query: { importacaoId: id1 } })).status === 403, "a liderança local não vê a lista");

  ok(porLinha(lrp, 14).detalhe.repetidaDe.matricula === 960003 && porLinha(lrp, 14).motivos.some((m) => /mesmo nome e nascimento de uma ficha/.test(m))
    && porLinha(lrp, 15).detalhe.repetidaDe.linha === 2 && porLinha(lrp, 15).detalhe.repetidaDe.nome === "Ana Importada",
    "o mesmo nome e nascimento: a 14 da ficha 960003 (sem maiúscula, espaço a mais) e a 15 da linha 2", [porLinha(lrp, 14), porLinha(lrp, 15)]);

  console.log("== o mapa das colunas escolhido na tela ==");
  const escolha = ["matricula", "nome", "igreja", "sexo", "nascimento", "estadoCivil", "email", "celular", "mae", "pai", null, null];   // o CPF: "não usar"
  const pe = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { nomeArquivo: "membros.csv", texto: ARQUIVO, colunas: escolha } });
  ok(pe.status === 200 && pe.body.resumo.colunas.escolhidas === true && pe.body.resumo.possivelRepetida === 3, "sem o CPF, a linha 8 não é mais possível repetida", pe.body.resumo);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Cpf IS NOT NULL", { i: pe.body.importacaoId }) === 0, "a coluna 'não usar' não entra");
  const pRuim = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQUIVO, colunas: ["matricula", "nome", "nome"] } });
  ok(pRuim.status === 400 && /não bate com este arquivo/.test(pRuim.body.mensagem), "o mapa que não bate com o arquivo: 400", pRuim.body);
  const pDobra = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQUIVO, colunas: escolha.map((c, i) => (i === 11 ? "nome" : c)) } });
  ok(pDobra.status === 400 && /mesmo campo/.test(pDobra.body.mensagem), "duas colunas no mesmo campo: 400", pDobra.body);
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembros WHERE Situacao = N'PREVIA' AND ImportacaoId = @i", { i: pe.body.importacaoId }) === 1, "o mapa recusado não mexe na prévia aberta");

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
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Estado = N'FORA'", { i: id2 }) === 5, "as 5 ficam de fora (3 com problema e as 2 que já existem)");
  const pAnd = await R(tok.geral(), { metodo: "POST", acao: "previa", corpo: { texto: ARQUIVO } });
  ok(pAnd.status === 409 && /em andamento/.test(pAnd.body.mensagem), "outra prévia com a importação em andamento: 409", pAnd.body);
  ok((await R(tok.geral(), { metodo: "POST", acao: "descartar", corpo: { importacaoId: id2 } })).status === 409, "descartar depois de confirmada: 409 (daqui não volta)");
  const e1 = await R(tok.geral());
  ok(e1.body.emAndamento === true && e1.body.restantes === 9 && e1.body.retrato === null, "o estado: em andamento, 9 faltando", e1.body);

  console.log("== o que mudou no banco DEPOIS da prévia ==");
  await ficha(960113, "Zelia Cadastrada Depois");                 // alguém cadastrou com a matrícula da linha 13
  await ficha(960050, "Dona do CPF Depois", CPF_B);               // e outro gravou o CPF da linha 2
  const auditAntes = await escalar("SELECT ISNULL(MAX(AuditId), 0) FROM AuditLog");

  console.log("== o primeiro lote (4) ==");
  const db = require(path.join(L.API, "shared/importacaoMembrosDb"));
  const { getPool } = require(path.join(L.API, "shared/db"));
  const b1 = await db.importarLote(await getPool(), { membroId: 9601 }, id2, { tamanho: 4 });
  ok(b1.sucesso === true && b1.importadas === 3 && b1.restantes === 6 && b1.concluida === false, "das 4 do lote, 3 importadas (a 13 foi para o fim da fila), 6 faltando", b1);
  const ana = (await q("SELECT MembroId, Cpf, SituacaoMembro, CongregacaoId, Email FROM MembroReferencia WHERE MembroId = 960101"))[0];
  ok(ana && ana.Cpf === null && ana.SituacaoMembro === "ARROLAMENTO" && ana.CongregacaoId === cong.VN && ana.Email === "ana.e2e96@example.org",
    "a linha 2 entrou com a matrícula do arquivo, SEM o CPF (gravado em outra ficha depois da prévia), em ARROLAMENTO", ana);
  const xav0 = (await q("SELECT Estado, MatriculaFinal, NumeroNovo, MotivoNumero FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Linha = 13", { i: id2 }))[0];
  ok(xav0.Estado === "PENDENTE" && xav0.MatriculaFinal === null && xav0.NumeroNovo === true && xav0.MotivoNumero === "DE_OUTRA_FICHA",
    "a linha 13: a matrícula foi usada depois da prévia — virou de número novo e foi para o fim da fila (não toma a 960.114, que é da linha 14)", xav0);
  ok(await escalar("SELECT Nome FROM MembroReferencia WHERE MembroId = 960113") === "Zelia Cadastrada Depois", "a ficha de quem usou a matrícula ficou como estava");

  console.log("== o resto, disputado por DOIS processos ao mesmo tempo ==");
  const corrida = await disparar([{ lotes: id2 }, { lotes: id2 }]);
  ok(corrida.every((r) => r.ok && r.concluida === true), "os dois terminam com a importação concluída", corrida);
  ok(corrida.reduce((s, r) => s + (r.importadas || 0), 0) === 6, "os dois juntos importaram 6 (ninguém entrou duas vezes)", corrida.map((r) => r.importadas));

  console.log("== o resultado ==");
  const linhas = await q("SELECT Linha, Estado, MatriculaFinal, NumeroNovo, RepetidaLinha, RepetidaMembro FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i ORDER BY Linha", { i: id2 });
  const finais = linhas.filter((l) => l.Estado === "IMPORTADA").map((l) => l.MatriculaFinal);
  ok(finais.length === 9 && new Set(finais).size === 9, "9 fichas, cada uma com a sua matrícula", finais);
  const fin = (n) => linhas.find((l) => l.Linha === n).MatriculaFinal;
  ok(fin(2) === 960101 && fin(4) === 960103 && fin(8) === 960108 && fin(14) === 960114 && fin(15) === 960115,
    "as matrículas do arquivo que serviam ficaram (960101, 960103, 960108, 960114, 960115)");
  ok([3, 5, 12, 13].map(fin).join(",") === "960116,960117,960118,960119",
    "as de número novo, na ordem das linhas, a partir da maior + 1 — as 3 como a prévia previu e a 13 (a matrícula usada depois) por último");
  ok(fin(6) === null && fin(7) === null && linhas.filter((l) => [6, 7].includes(l.Linha)).every((l) => l.Estado === "FORA"), "as linhas 6 e 7 (a matrícula já existia) ficaram de fora");
  ok(JSON.stringify(await q("SELECT MembroId, Nome, CongregacaoId, SituacaoMembro, Cpf FROM MembroReferencia WHERE MembroId IN (960001, 960002) ORDER BY MembroId")) === fichasAntes,
    "as fichas 960001 e 960002 continuam como estavam");
  ok(await escalar("SELECT COUNT(*) FROM FichasPendencias WHERE MembroId IN (960001, 960002) OR OutroMembroId IN (960001, 960002)") === 0,
    "nenhuma pendência aberta contra elas (nem REPETIDA)");
  const novos = [3, 5, 12, 13].map(fin);
  ok(novos.every((m) => m > 0 && ![0, 960001, 960002, 960003, 960050, 960101, 960103, 960108, 960113, 960114, 960115].includes(m)), "as de número novo receberam a próxima do sistema", novos);
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
  ok(deTipo("NUMERO").length === 4 && new Set(deTipo("NUMERO").map((p) => p.MembroId)).size === 4 && deTipo("NUMERO").every((p) => novos.includes(p.MembroId)),
    "4 pendências NUMERO (as 3 da prévia e a da matrícula usada depois)", deTipo("NUMERO").map((p) => p.MembroId));
  const rep = deTipo("REPETIDA").map((p) => `${p.MembroId}>${p.OutroMembroId}`).sort();
  const repEsperado = [`960101>960050`, `960108>960003`, `${fin(5)}>960103`, `960114>960003`, `960115>960101`].sort();
  ok(JSON.stringify(rep) === JSON.stringify(repEsperado), "5 pendências REPETIDA: o CPF de depois, o CPF de antes, a repetida no arquivo e as 2 do mesmo nome e nascimento (a ficha e a linha)", { rep, repEsperado });

  const imp = (await q("SELECT Situacao, ConcluidaEm, Resumo FROM ImportacoesMembros WHERE ImportacaoId = @i", { i: id2 }))[0];
  const res = JSON.parse(imp.Resumo).resultado || {};
  ok(imp.Situacao === "CONCLUIDA" && imp.ConcluidaEm, "a importação concluída");
  ok(res.importadas === 9 && res.fora === 5 && res.numeroNovo === 4 && res.possivelRepetida === 5 && res.semCongregacao === 1, "o resultado final", res);
  const eF = await R(tok.geral());
  const ret = eF.body.retrato || {};
  ok(ret.confirmadaPor === nomeDe9601 && ret.matriculasNovas.total === 4 && ret.matriculasNovas.de === Math.min(...novos) && ret.matriculasNovas.ate === Math.max(...novos),
    "o retrato: quem importou e a faixa das matrículas novas", ret);
  ok(JSON.stringify(ret.porArea) === JSON.stringify([{ area: "Área E2E96", semCongregacao: false, congregacoes: 2, fichas: 8, completas: 0 },
    { area: null, semCongregacao: true, congregacoes: 0, fichas: 1, completas: 0 }]), "o retrato: as fichas por área (8 na Área E2E96, em 2 congregações) e 1 sem congregação", ret.porArea);
  ok(JSON.stringify(ret.quadros) === JSON.stringify({ comMatricula: 1, acertar: 4, repetidas: 4 }), "o retrato: os quadros do resultado (1 + 4 + 4 = 9)", ret.quadros);
  const laF = await R(tok.geral(), { acao: "lista", query: { importacaoId: String(id2), filtro: "acertar" } });
  ok(laF.body.itens.every((i) => i.detalhe.prevista === false && i.detalhe.recebe === i.matriculaFinal) && laF.body.total === 4,
    "depois de importada, a lista mostra o número de verdade (as 4, com a da matrícula usada depois)", laF.body.itens.map((i) => i.detalhe));
  ok(await escalar(`SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND (Cpf IS NOT NULL OR Email IS NOT NULL OR Telefone IS NOT NULL OR NomeMae IS NOT NULL
    OR NomePai IS NOT NULL OR DataNascimento IS NOT NULL OR IgrejaArquivo IS NOT NULL OR CongregacaoId IS NOT NULL OR Sexo IS NOT NULL)`, { i: id2 }) === 0,
    "no fim, os dados pessoais das linhas apagados (fica a lista para conferir)");
  ok(await escalar("SELECT COUNT(*) FROM ImportacoesMembrosLinhas WHERE ImportacaoId = @i AND Nome IS NOT NULL", { i: id2 }) === 13, "o nome fica para a lista (a linha sem nome não tinha)");

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

  if (process.env.E2E96_GRAVAR) require("fs").writeFileSync(process.env.E2E96_GRAVAR, JSON.stringify(gravadas, null, 1));
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
