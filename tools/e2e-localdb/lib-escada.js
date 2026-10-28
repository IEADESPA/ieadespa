// lib-escada.js — v8.2 (Escada ministerial): o cenário e os ajudantes dos roteiros e2e-51 a e2e-53, sobre a base "cenario-escada" (`bash rodar.sh preparar-escada`).
// Todas as pessoas são da "Central E2E" (o escopo do Dirigente local), menos o "foraEscopo" (Vila Nova). O nome conta a história de cada uma.
const L = require("./lib");
const { q, escalar } = L;
const { chamarRota } = require("./lib-afm");

const P = {
  candidato: 9201,      // membro → Auxiliar: precisa da matrícula de candidato e do CHM; conclui; histórico abre AUXILIAR
  auxiliar: 9202,       // Auxiliar desde 2024 → Missionário(a); depois tenta pular para Presbítero (queima de etapas)
  missionario: 9203,    // Missionário desde 2022, batismo no Espírito Santo → Diácono
  missionaria: 9204,    // Missionária: o teto das obreiras (não vai a Diácono nem por nomeação)
  nomeado: 9205,        // Diácono com o Básico e sem CHM → Presbítero só por nomeação direta; fica em nivelamento obrigatório
  presbitero: 9206,     // Presbítero com o Avançado concluído → Evangelista só por indicação do Presidente
  forasteiro: 9207,     // membro recebido de outra convenção → Pastor (dispensa degrau e interstício); entra na CLI por Ordenação
  disciplinado: 9208,   // Missionário com disciplina em curso: trava; o motivo só aparece ao nível geral
  legado: 9209,         // Diácono sem a data de entrada no cargo (linha LEGADO): trava até a Secretaria informar "no cargo desde"
  vetado: 9210,         // Auxiliar → Missionário(a): a AFM veta a indicação
  semSexo: 9211,        // Missionário sem o sexo no cadastro: trava; a Secretaria informa; depois o CHM é revogado no meio do processo
  menor: 9212,          // membro de 16 anos: não vai a Auxiliar
  inativo: 9213,        // Diácono com a matrícula inativa: nem a nomeação do Presidente passa
  foraEscopo: 9214,     // Auxiliar da Vila Nova: fora do escopo do Dirigente local
  lider: 9220,          // Dirigente da Central (consagracoes + pessoas no escopo da congregação)
  // v8.3 — a Comissão de Unção (Art. 75, IV, c: no mínimo 4 pastores titulares em atividade)
  pastor1: 9221, pastor2: 9222, pastor3: 9223, pastor4: 9224
};
const CENTRAL = "Central E2E";
// [nome, cargo, sexo, nascimento, admissão, dizimista, desde (linha aberta do histórico; null = sem data; undefined = sem linha)]
const DADOS = {
  [P.candidato]: ["Candidato Auxiliar E2E", null, "M", "1995-03-10", "2020-02-01", 1, undefined],
  [P.auxiliar]: ["Auxiliar Promovido E2E", "AUXILIAR", "M", "1990-01-01", "2010-01-01", 1, "2024-01-15"],
  [P.missionario]: ["Missionario Diacono E2E", "MISSIONARIO", "M", "1985-05-05", "2005-01-01", 1, "2022-01-10"],
  [P.missionaria]: ["Missionaria Teto E2E", "MISSIONARIO", "F", "1985-05-05", "2005-01-01", 1, "2015-01-10"],
  [P.nomeado]: ["Diacono Nomeado E2E", "DIACONO", "M", "1980-01-01", "2000-01-01", 1, "2018-01-01"],
  [P.presbitero]: ["Presbitero Evangelista E2E", "PRESBITERO", "M", "1975-01-01", "1995-01-01", 1, "2015-01-01"],
  [P.forasteiro]: ["Pastor de Outra Convencao E2E", null, "M", "1970-01-01", "2026-09-01", 1, undefined],
  [P.disciplinado]: ["Missionario Disciplinado E2E", "MISSIONARIO", "M", "1985-05-05", "2005-01-01", 1, "2015-01-10"],
  [P.legado]: ["Diacono Legado E2E", "DIACONO", "M", "1980-01-01", "2000-01-01", 1, null],
  [P.vetado]: ["Auxiliar Vetado E2E", "AUXILIAR", "M", "1990-01-01", "2010-01-01", 1, "2020-01-01"],
  [P.semSexo]: ["Missionario Sem Sexo E2E", "MISSIONARIO", null, "1985-05-05", "2005-01-01", 1, "2015-01-10"],
  [P.menor]: ["Membro Menor E2E", null, "M", null, "2020-01-01", 1, undefined],
  [P.inativo]: ["Diacono Inativo E2E", "DIACONO", "M", "1980-01-01", "2000-01-01", 1, "2015-01-01"],
  [P.foraEscopo]: ["Auxiliar Vila Nova E2E", "AUXILIAR", "M", "1990-01-01", "2010-01-01", 1, "2020-01-01"],
  [P.lider]: ["Dirigente Central E2E", "PASTOR", "M", "1970-01-01", "1990-01-01", 1, "2000-01-01"],
  [P.pastor1]: ["Pastor Comissao Um E2E", "PASTOR", "M", "1960-01-01", "1985-01-01", 1, "1995-01-01"],
  [P.pastor2]: ["Pastor Comissao Dois E2E", "PASTOR", "M", "1961-01-01", "1985-01-01", 1, "1996-01-01"],
  [P.pastor3]: ["Pastor Comissao Tres E2E", "PASTOR", "M", "1962-01-01", "1985-01-01", 1, "1997-01-01"],
  [P.pastor4]: ["Pastor Comissao Quatro E2E", "PASTOR", "M", "1963-01-01", "1985-01-01", 1, "1998-01-01"]
};
const COMISSAO = [P.pastor1, P.pastor2, P.pastor3, P.pastor4];
// [nível, concluído, CHM] — sem entrada: sem linha de matrícula (o oficial conta como ATIVA sem nível)
const AFM = {
  [P.auxiliar]: ["MEDIO", 0, 1], [P.missionario]: ["MEDIO", 0, 1], [P.missionaria]: ["MEDIO", 0, 1], [P.nomeado]: ["BASICO", 0, 0], [P.presbitero]: ["AVANCADO", 1, 1],
  [P.disciplinado]: ["MEDIO", 0, 1], [P.legado]: ["AVANCADO", 0, 1], [P.vetado]: ["MEDIO", 0, 1], [P.semSexo]: ["MEDIO", 0, 1], [P.inativo]: ["MEDIO", 0, 1],
  [P.foraEscopo]: ["MEDIO", 0, 1], [P.lider]: ["BACHAREL", 1, 1]
};
const TIPO = {
  AUXILIAR: "Consagração a Auxiliar", MISSIONARIO: "Consagração a Missionário(a)", DIACONO: "Separação ao Diaconato", PRESBITERO: "Consagração a Presbítero",
  EVANGELISTA: "Consagração a Evangelista", PASTOR: "Consagração a Pastor"
};
const PERM_SEC = ["consagracoes", "pessoas", "afm", "reunioes", "assembleia", "cli", "disciplina", "cei"];   // v8.3: "cei" (o parecer)
const SEC = () => L.GERAL(1002, PERM_SEC);
const LIDER = () => L.LIDER(P.lider, ["consagracoes", "pessoas"], [CENTRAL]);

async function montarCenario() {
  const central = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = @n", { n: CENTRAL });
  const vila = await escalar("SELECT CongregacaoId FROM Congregacoes WHERE Nome = N'Vila Nova E2E'");
  for (const [id, [nome, cargo, sexo, nasc, adm, diz, desde]] of Object.entries(DADOS)) {
    const m = Number(id);
    await q(`IF NOT EXISTS (SELECT 1 FROM MembroReferencia WHERE MembroId = @m)
             INSERT INTO MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, DizimistaFiel, Email, CargoMinisterial, Sexo, EstadoCivil, FotoUrl)
             VALUES (@m, @n, @c, 'ATIVO', 'EM_COMUNHAO', @nasc, @adm, @diz, @e, @cg, @sx, 'CASADO', N'https://e2e.local/foto.jpg')`,   // v8.3: a foto da indicação (Art. 74, II)
      { m, n: nome, c: m === P.foraEscopo ? vila : central, nasc: m === P.menor ? null : nasc, adm, diz, e: `escada${m}@e2e.local`, cg: cargo, sx: sexo });
    if (desde !== undefined && cargo) {
      await q("IF NOT EXISTS (SELECT 1 FROM CargosMinisteriaisHistorico WHERE MembroId = @m AND Ate IS NULL) INSERT INTO CargosMinisteriaisHistorico (MembroId, Cargo, Desde, Origem) VALUES (@m, @c, @d, 'LEGADO')",
        { m, c: cargo, d: desde });
    }
    if (AFM[m]) {
      const [nivel, concluido, chm] = AFM[m];
      await q(`IF NOT EXISTS (SELECT 1 FROM Matriculas_AFM WHERE MembroId = @m)
               INSERT INTO Matriculas_AFM (MembroId, NivelAtual, StatusMatricula, Origem, DataMatricula, NivelEscolaridade, NivelConcluido, CertificadoHabilitacao, CHMEm)
               VALUES (@m, @cg, 'ATIVA', 'AUTOMATICA', '2024-01-01', @n, @c, @chm, CASE WHEN @chm = 1 THEN '2026-01-10' END)`,
        { m, cg: DADOS[m][1], n: nivel, c: concluido, chm });
    }
  }
  // o menor faz 16 anos este ano (a data de nascimento entra depois do INSERT para não cair no padrão do cenário)
  const ano = Number(L.hojeBr().slice(0, 4));
  await q("UPDATE MembroReferencia SET DataNascimento = @d WHERE MembroId = @m", { d: `${ano - 16}-01-01`, m: P.menor });
  // batismo no Espírito Santo (marco do perfil) de quem vai a Diácono
  for (const m of [P.missionario, P.missionaria, P.disciplinado, P.semSexo]) {
    await q("IF NOT EXISTS (SELECT 1 FROM MarcosMembro WHERE MembroId = @m AND Tipo = 'BATISMO_ESPIRITO_SANTO') INSERT INTO MarcosMembro (MembroId, Tipo, Descricao, DataMarco) VALUES (@m, 'BATISMO_ESPIRITO_SANTO', N'Batismo no Espírito Santo', '2010-01-01')", { m });
  }
  // disciplina em curso
  await q("IF NOT EXISTS (SELECT 1 FROM ProcessosDisciplinares WHERE MembroId = @m) INSERT INTO ProcessosDisciplinares (MembroId, DataAbertura, Status) VALUES (@m, '2026-10-01', 'EM_ANDAMENTO')", { m: P.disciplinado });
  // matrícula inativa (desmatriculado por reprovação)
  await q("UPDATE Matriculas_AFM SET StatusMatricula = 'INATIVA' WHERE MembroId = @m", { m: P.inativo });
  // o Dirigente é Líder da Central com consagracoes + pessoas (a sessão de teste já leva as permissões; a linha existe para o escopo das telas)
  return { central, vila };
}

const req = (assunto, membroId, modalidade, token) => chamarRota("RequisitosEscada/index.js", { token: token || SEC(), query: { membroId, assunto, modalidade } });
// v8.3 — o processo protocolado já ganha a cópia dos documentos pessoais (Art. 74, II), como a tela faz em "Documentos"; `documento: false` para provar a falta dele.
async function anexarDocumento(consagracaoId) {
  await q(`INSERT INTO AnexosGenericos (Tabela, RegistroId, NomeArquivo, Url, MimeType, EnviadoPorMembroId)
           SELECT N'Consagracoes', Numero, N'rg-e2e.pdf', N'https://e2e.local/rg.pdf', N'application/pdf', 1002 FROM Consagracoes WHERE ConsagracaoId = @id`, { id: consagracaoId });
}
async function protocolar(corpo, token, { documento = true } = {}) {
  const r = await chamarRota("CriarConsagracao/index.js", { metodo: "POST", token: token || SEC(), corpo });
  if (documento && r.status === 201 && r.body && r.body.consagracao) await anexarDocumento(r.body.consagracao.consagracaoId);
  return r;
}
const evoluir = (consagracaoId, acao, token) => chamarRota("EvoluirConsagracao/index.js", { metodo: "POST", binding: { consagracaoId }, token: token || SEC(), corpo: { acao } });
// `token`: undefined = a Secretaria; null = sem sessão nenhuma (para provar o 401)
const tk = (token) => (token === undefined ? SEC() : token || undefined);
const esteira = (acao, corpo, token, metodo = "POST", query) => chamarRota("EsteiraConsagracao/index.js", { metodo, binding: { acao }, token: tk(token), corpo, query });
const cerimonias = (acao, corpo, token, metodo = "POST", query) => chamarRota("CerimoniasConsagracao/index.js", { metodo, binding: acao ? { acao } : {}, token: tk(token), corpo, query });
const diasAtras = (n) => require(L.path.join(L.API, "shared/afm.js")).somarDias(L.hojeBr(), -n);
const PARECER_APTO = {
  resultado: "APTO", fundamentacao: "Vida, testemunho e doutrina examinados pelo CEI (e2e).",
  sabatina: { vidaPregressa: true, regularidadeFinanceira: true, alinhamentoDoutrinario: true },
  escrutinio: { fundamento: "TEMPO_IGNORANCIA", documental: true, recasado: false }, excecaoPastorNaoCasado: "Dom de celibato reconhecido pela Convenção (e2e)."
};
const parecer = (consagracaoId, extra = {}, token) => esteira("parecer", { consagracaoId, sabatinaEm: L.hojeBr(), ...PARECER_APTO, ...extra }, token);
// A reunião da CLI (encerrada, hoje) em que se homologa Presbítero, Evangelista e Pastor.
async function reuniaoCLI() {
  const ja = await escalar("SELECT TOP 1 s.SessaoId FROM Sessoes s JOIN Orgaos o ON o.OrgaoId = s.OrgaoId WHERE o.Sigla = 'CLI' AND s.Descricao = N'Homologação E2E' AND s.Status = 'ENCERRADA'");
  if (ja) return ja;
  return escalar(`INSERT INTO Sessoes (OrgaoId, Descricao, DataSessao, TipoSessao, Status) OUTPUT INSERTED.SessaoId
                  SELECT OrgaoId, N'Homologação E2E', @d, 'EXTRAORDINARIA', 'ENCERRADA' FROM Orgaos WHERE Sigla = 'CLI'`, { d: L.hojeBr() });
}
async function homologar(ids, token) {
  return esteira("homologar", { ids: [].concat(ids), sessaoId: await reuniaoCLI(), ato: "Validação da lista dos aptos (e2e)", data: L.hojeBr() }, token);
}
const pagarTaxa = (consagracaoId, extra = {}, token) => esteira("taxa", { consagracaoId, pagoEm: diasAtras(60), valor: 70, forma: "PIX", ...extra }, token);
// Uma cerimônia de hoje, com a Comissão de Unção completa; devolve o id.
async function novaCerimonia(token, extra = {}) {
  const r = await cerimonias("criar", { dataCerimonia: L.hojeBr(), local: "Templo Sede E2E", ocasiao: "AGO", valorTaxa: 70, ...extra }, token);
  if (r.status !== 201) throw new Error(`cerimônia não criada: ${JSON.stringify(r.body)}`);
  const c = await cerimonias("comissao", { cerimoniaId: r.body.cerimoniaId, membroIds: COMISSAO }, token);
  if (c.status !== 200) throw new Error(`comissão não salva: ${JSON.stringify(c.body)}`);
  return r.body.cerimoniaId;
}
const statusDe = (id) => escalar("SELECT Status FROM Consagracoes WHERE ConsagracaoId = @id", { id });
// A esteira inteira da v8.3 até o fim: envia ao CEI (se ainda protocolado), parecer APTO, homologação, taxa e cerimônia com a pessoa presente (ou ausente). Devolve, no
// formato da resposta antiga ({status, body:{sucesso, novoStatus, nivelamento, mensagem, requisitos}}), o que a cerimônia disse desta pessoa — ou a primeira etapa que travou.
async function concluir(consagracaoId, token, { presente = true } = {}) {
  const tk = token || SEC();
  let r;
  if ((await statusDe(consagracaoId)) === "PROTOCOLADO") {
    r = await evoluir(consagracaoId, "AVANCAR", tk);
    if (!r.body || !r.body.sucesso) return r;
  }
  if ((await statusDe(consagracaoId)) === "EM_ANALISE_CONSELHO") {
    r = await parecer(consagracaoId, {}, tk);
    if (!r.body || !r.body.sucesso) return r;
  }
  if ((await statusDe(consagracaoId)) === "AGUARDANDO_PLENARIO") {
    r = await homologar(consagracaoId, tk);
    if (!r.body || !r.body.sucesso) {
      const primeiro = (r.body && r.body.resultados && r.body.resultados[0]) || {};
      return { status: r.status, body: { sucesso: false, mensagem: primeiro.mensagem || (r.body && r.body.mensagem), requisitos: primeiro.requisitos } };
    }
  }
  if (!(await escalar("SELECT TaxaPagaEm FROM Consagracoes WHERE ConsagracaoId = @id", { id: consagracaoId }))) {
    r = await pagarTaxa(consagracaoId, {}, tk);
    if (!r.body || !r.body.sucesso) return r;
  }
  const cerimoniaId = await novaCerimonia(tk);
  r = await cerimonias("incluir", { cerimoniaId, ids: [consagracaoId] }, tk);
  if (!r.body || !r.body.sucesso) return r;
  r = await cerimonias("registrar", { cerimoniaId, presentes: presente ? [consagracaoId] : [] }, tk);
  if (!r.body || !r.body.sucesso) return r;
  const x = (r.body.resultados || []).find((y) => String(y.consagracaoId).toLowerCase() === String(consagracaoId).toLowerCase()) || {};
  return { status: r.status, body: { sucesso: x.resultado === "CONSAGRADO", novoStatus: x.resultado === "CONSAGRADO" ? "CONCLUIDO" : x.resultado, nivelamento: !!x.nivelamento,
    mensagem: x.motivo, requisitos: x.requisitos, resultado: x.resultado, certificadoId: x.certificadoId, cerimoniaId, registro: r.body } };
}
const afmGet = (acao, token) => chamarRota("GestaoAFM/index.js", { binding: { acao }, token: token || SEC() });
const afmPost = (acao, corpo, token) => chamarRota("GestaoAFM/index.js", { metodo: "POST", binding: { acao }, token: token || SEC(), corpo });
// GestaoPessoas regrava a linha inteira: lê como a tela lê (GET) e manda de volta com as mudanças
async function pessoa(membroId, token) {
  const r = await chamarRota("GestaoPessoas/index.js", { token: token || SEC() });
  return (r.body || []).find((p) => Number(p.membroId) === Number(membroId)) || null;
}
async function salvarPessoa(membroId, mudancas, token) {
  const atual = (await pessoa(membroId, SEC())) || {};
  const { cargoDesde, funcao, congregacao, extensao, capacidade, menorDeIdade, fotoUrl, processoDisciplinarAtivo, ...campos } = atual;
  return chamarRota("GestaoPessoas/index.js", { metodo: "POST", token: token || SEC(), corpo: { ...campos, ...mudancas } });
}
const historico = (m) => q("SELECT Cargo, CONVERT(varchar(10), Desde, 120) AS Desde, CONVERT(varchar(10), Ate, 120) AS Ate, Origem, ConsagracaoId FROM CargosMinisteriaisHistorico WHERE MembroId = @m ORDER BY HistoricoId", { m });
const item = (r, chave) => ((r && r.body && r.body.requisitos && r.body.requisitos.itens) || []).find((i) => i.chave === chave) || {};

module.exports = {
  P, TIPO, CENTRAL, PERM_SEC, SEC, LIDER, COMISSAO, montarCenario, req, protocolar, anexarDocumento, evoluir, concluir, afmGet, afmPost, pessoa, salvarPessoa, historico, item,
  chamarRota, esteira, cerimonias, parecer, PARECER_APTO, reuniaoCLI, homologar, pagarTaxa, novaCerimonia, statusDe, diasAtras
};
