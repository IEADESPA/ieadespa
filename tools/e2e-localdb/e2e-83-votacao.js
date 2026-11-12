// e2e-83-votacao.js — migração 173 (FASE 10, 12/11/2026, decisão do responsável e do Presidente): a votação vinculante sabe o que aprova. Antes, a apuração
// olhava só a opção MAIS VOTADA, qualquer que fosse: um "Não" vencendo com folga saía "Aprovado". Agora: PROPOSTA (cada opção aprova, rejeita ou é voto em branco,
// que não conta; aprovada quando quem aprova atinge o quórum sobre os válidos) e ESCOLHA (ganha a mais votada, sem quórum; empate = a mesa decide). Handlers e
// banco REAIS sobre a base "cenario-173" (`bash rodar.sh preparar-173`); monta o próprio cenário (pessoas 9901+ num público próprio).
const { spawnSync } = require("child_process");
const L = require("./lib");
const { ok, fim, q, escalar, obterPool, path } = L;
const { chamarRota } = require("./lib-afm");

console.error = () => { };
const GERAL = () => L.GERAL(1002, ["reunioes", "assembleia"]);
const rota = (metodo, { binding = {}, corpo, token = GERAL() } = {}) => chamarRota("GestaoEnquetes/index.js", { metodo, binding, corpo, token });
const PESSOAS = Array.from({ length: 20 }, (_, i) => 9901 + i);

async function criar(titulo, opcoes, extra = {}) {
  const r = await rota("POST", { corpo: { titulo, visibilidade: "SECRETA", publicoTipo: "LISTA_CUSTOM", publicoMembroIds: PESSOAS, vinculante: true,
    perguntas: [{ titulo: `${titulo}?`, tipo: "OPCOES", opcoes }], ...extra } });
  return r;
}
// votos: [quantos votam na opção 0, na opção 1, ...] — cada voto de uma pessoa diferente
async function votarEEncerrar(enquete, votos) {
  const pergunta = enquete.perguntas[0];
  let pessoa = 0;
  for (const [i, n] of votos.entries()) {
    for (let k = 0; k < n; k++) {
      const membroId = PESSOAS[pessoa++];
      const r = await chamarRota("GestaoEnquetes/index.js", { metodo: "POST", binding: { id: String(enquete.enqueteId), acao: "votar" }, token: L.PIN(membroId),
        corpo: { respostas: [{ perguntaId: pergunta.perguntaId, opcaoId: pergunta.opcoes[i].opcaoId }] } });
      if (!(r.body && r.body.sucesso)) throw new Error(`voto recusado: ${JSON.stringify(r.body)}`);
    }
  }
  return rota("POST", { binding: { id: String(enquete.enqueteId), acao: "encerrar" } });
}
const linha = (id) => L.um("SELECT TipoApuracao, ResultadoAprovado, OpcaoVencedoraId, ResultadoEmpate, ApuradaEm, QuorumTipo FROM Enquetes WHERE EnqueteId = @id", { id });
const papeisNoBanco = async (id) => (await q(`SELECT o.Papel FROM OpcoesEnquete o JOIN PerguntasEnquete p ON p.PerguntaId = o.PerguntaId WHERE p.EnqueteId = @id ORDER BY o.OpcaoId`, { id })).map((x) => x.Papel);

(async () => {
  await obterPool();
  console.log("== cenário ==");
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Central E2E'");
  for (const id of PESSOAS) await q("INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro) VALUES (@id, @n, @c, 'ATIVO', 'EM_COMUNHAO')", { id, n: `Votante E2E ${id}`, c: central });
  ok(await escalar("SELECT COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Enquetes') AND name IN ('TipoApuracao','OpcaoVencedoraId','ResultadoEmpate','ApuradaEm')") === 4, "as colunas novas da 173 existem em Enquetes");

  console.log("== proposta: o Não vencendo NÃO aprova (o defeito) ==");
  let c = await criar("Aprovar as contas de 2025", ["Sim", "Não", "Em branco"], { tipoApuracao: "PROPOSTA", papeis: ["APROVA", "REJEITA", "BRANCO"], quorumTipo: "MAIORIA_SIMPLES" });
  ok(c.status === 201 && c.body.sucesso, "a proposta é criada com os papéis", JSON.stringify(c.body).slice(0, 200));
  let e = c.body.enquete;
  ok(JSON.stringify(await papeisNoBanco(e.enqueteId)) === JSON.stringify(["APROVA", "REJEITA", "BRANCO"]), "os papéis ficam gravados nas opções");
  let fim1 = await votarEEncerrar(e, [3, 9, 2]);
  ok(fim1.body && fim1.body.sucesso && fim1.body.resultadoAprovado === false, "3 Sim, 9 Não e 2 em branco: NÃO aprovada (antes saía aprovada)", JSON.stringify(fim1.body));
  let l = await linha(e.enqueteId);
  ok(l.TipoApuracao === "PROPOSTA" && l.ResultadoAprovado === false && l.ApuradaEm, "no banco: proposta, não aprovada, apurada pela regra nova", JSON.stringify(l));

  console.log("== proposta: o voto em branco não conta ==");
  c = await criar("Reformar o templo da Sede", ["Sim", "Não", "Em branco"], { tipoApuracao: "PROPOSTA", papeis: ["APROVA", "REJEITA", "BRANCO"], quorumTipo: "MAIORIA_SIMPLES" });
  fim1 = await votarEEncerrar(c.body.enquete, [5, 4, 6]);
  ok(fim1.body.resultadoAprovado === true, "5 Sim, 4 Não e 6 em branco: aprovada (o branco fica fora)", JSON.stringify(fim1.body));
  const lista = await rota("GET");
  const naLista = Array.isArray(lista.body) && lista.body.find((x) => x.enqueteId === c.body.enquete.enqueteId);
  ok(naLista && naLista.tipoApuracao === "PROPOSTA" && naLista.perguntas[0].opcoes.every((o) => o.papel), "a lista mostra o tipo e o papel de cada opção (para a tela montar o placar)", naLista ? JSON.stringify(naLista.perguntas[0].opcoes) : "");

  console.log("== escolha: a mais votada ganha, sem maioria ==");
  c = await criar("Eleger o 2º tesoureiro", ["Irmão João", "Irmão Pedro", "Irmã Ana", "Irmão Davi"], { tipoApuracao: "ESCOLHA" });
  ok(c.body.sucesso && (await linha(c.body.enquete.enqueteId)).QuorumTipo === null, "a escolha nasce sem quórum");
  fim1 = await votarEEncerrar(c.body.enquete, [4, 3, 3, 2]);
  l = await linha(c.body.enquete.enqueteId);
  ok(fim1.body.resultadoAprovado === true && l.OpcaoVencedoraId === c.body.enquete.perguntas[0].opcoes[0].opcaoId && l.ResultadoEmpate === false,
    "4 de 12 votos (33%) bastam: o Irmão João é o escolhido", JSON.stringify(l));

  console.log("== escolha: empate no primeiro lugar ==");
  c = await criar("Tema do ano", ["Tema A", "Tema B", "Tema C"], { tipoApuracao: "ESCOLHA" });
  fim1 = await votarEEncerrar(c.body.enquete, [3, 3, 1]);
  l = await linha(c.body.enquete.enqueteId);
  ok(fim1.body.resultadoAprovado === false && l.ResultadoEmpate === true && l.OpcaoVencedoraId === null, "3 a 3: empate, sem escolhida (a mesa decide)", JSON.stringify(l));

  console.log("== o que é recusado ==");
  let r = await criar("Proposta torta", ["Sim", "Aprovo", "Não"], { tipoApuracao: "PROPOSTA", papeis: ["APROVA", "APROVA", "REJEITA"], quorumTipo: "MAIORIA_SIMPLES" });
  ok(!r.body.sucesso && /exatamente uma/.test(r.body.mensagem), "duas opções que aprovam: recusada", r.body.mensagem);
  r = await criar("Proposta sem quórum", ["Sim", "Não"], { tipoApuracao: "PROPOSTA", papeis: ["APROVA", "REJEITA"] });
  ok(!r.body.sucesso && /quórum/.test(r.body.mensagem), "proposta sem quórum: recusada", r.body.mensagem);
  r = await criar("Tipo inventado", ["A", "B"], { tipoApuracao: "QUALQUER" });
  ok(r.status === 400 && !r.body.sucesso, "tipo de votação inventado: 400", r.body.mensagem);

  console.log("== sem o tipo (cliente antigo): deduz pelos textos ==");
  r = await criar("Aprovar o orçamento", ["Sim", "Não"], { quorumTipo: "DOIS_TERCOS" });
  l = await linha(r.body.enquete.enqueteId);
  ok(r.body.sucesso && l.TipoApuracao === "PROPOSTA" && JSON.stringify(await papeisNoBanco(r.body.enquete.enqueteId)) === '["APROVA","REJEITA"]', "Sim/Não sem tipo vira proposta, com os papéis pelo texto", JSON.stringify(l));
  r = await criar("Escolher a cor do departamento", ["Lilás", "Azul"], { quorumTipo: "MAIORIA_SIMPLES" });
  ok(r.body.sucesso && (await linha(r.body.enquete.enqueteId)).TipoApuracao === "ESCOLHA", "nomes sem tipo viram escolha");

  console.log("== a votação antiga (antes da 173): a migração classifica e não muda o resultado ==");
  const antiga = await escalar(`INSERT INTO Enquetes (Titulo, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, Status, ResultadoAprovado, CriadoPor)
    OUTPUT INSERTED.EnqueteId VALUES (N'Votação antiga E2E', 'SECRETA', 'TODOS_ATIVOS', 1, 'MAIORIA_SIMPLES', 'ENCERRADA', 1, 1002)`);
  const pa = await escalar(`INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) OUTPUT INSERTED.PerguntaId VALUES (@e, 1, N'Aprova?', 'OPCOES')`, { e: antiga });
  for (const t of ["SIM", "não", "Abstenção"]) await q(`INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@p, @t)`, { p: pa, t });
  const nomes = await escalar(`INSERT INTO Enquetes (Titulo, Visibilidade, PublicoTipo, Vinculante, QuorumTipo, Status, CriadoPor)
    OUTPUT INSERTED.EnqueteId VALUES (N'Eleição antiga E2E', 'SECRETA', 'TODOS_ATIVOS', 1, 'MAIORIA_SIMPLES', 'ABERTA', 1002)`);
  const pn = await escalar(`INSERT INTO PerguntasEnquete (EnqueteId, Ordem, Titulo, Tipo) OUTPUT INSERTED.PerguntaId VALUES (@e, 1, N'Quem?', 'OPCOES')`, { e: nomes });
  for (const t of ["Irmão Lucas", "Irmã Marta"]) await q(`INSERT INTO OpcoesEnquete (PerguntaId, Texto) VALUES (@p, @t)`, { p: pn, t });
  const mig = spawnSync(process.execPath, ["-r", path.join(__dirname, "shim-mssql.js"), path.join(__dirname, "aplicar-migracao.js"), "173", "1"], { encoding: "utf8", env: process.env });
  ok(/aplicada /.test(mig.stdout || ""), "a 173 roda de novo sobre o banco com dados (idempotente)", (mig.stdout || "").slice(-200) + (mig.stderr || "").slice(-200));
  l = await linha(antiga);
  ok(l.TipoApuracao === "PROPOSTA" && JSON.stringify(await papeisNoBanco(antiga)) === '["APROVA","REJEITA","BRANCO"]', "a antiga com SIM/não/Abstenção vira proposta, sem acento nem maiúscula atrapalhar", JSON.stringify(l));
  ok(l.ResultadoAprovado === true && !l.ApuradaEm, "o resultado já gravado da antiga NÃO muda (fica para conferir) e ela segue marcada como apurada pela regra antiga");
  ok((await linha(nomes)).TipoApuracao === "ESCOLHA" && (await papeisNoBanco(nomes)).every((x) => x === null), "a antiga com nomes vira escolha, sem papéis");
  fim("e2e-83 votação vinculante (migração 173)");
})().catch((e) => { console.log("ERRO", e.message); fim("e2e-83 (abortado)"); });
