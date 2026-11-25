// Testes da retenção que executa (vB.8) — o ponto que mais importa: o
// prazo vem de PoliticasRetencao (nunca mais hardcoded), e cair pro
// fallback de 30 dias nunca destrava um prazo MAIOR sozinho quando a
// política está ausente/inativa.
const { criarPoolFalso } = require("./testUtils");
jest.mock("../storage", () => ({ excluirDocumento: jest.fn(async () => true) }));
const storage = require("../storage");
const { diasMinimizacaoExMembro, prazoMinimizacaoExMembro, minimizarNaTransacao, excluirDocumentos, DIAS_MINIMIZACAO_PADRAO } = require("../minimizacaoLgpd");
// A minimização roda dentro da transação de quem chama (GestaoCartas "processar"): aqui o "executor" é o pool falso.
const minimizarNoPool = (pool, membroId, opcoes) => minimizarNaTransacao({ executor: pool, transacao: null }, membroId, opcoes);

describe("diasMinimizacaoExMembro", () => {
  test("usa o DiasRetencao da política quando ela existe e está ativa", async () => {
    const { pool } = criarPoolFalso([[{ DiasRetencao: 45 }]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(45);
  });

  test("cai pro padrão (30) quando a política não existe/está inativa", async () => {
    const { pool } = criarPoolFalso([[]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(DIAS_MINIMIZACAO_PADRAO);
  });

  test("cai pro padrão também se a política existe mas DiasRetencao é NULL (indeterminado)", async () => {
    const { pool } = criarPoolFalso([[{ DiasRetencao: null }]]);
    const dias = await diasMinimizacaoExMembro(pool);
    expect(dias).toBe(DIAS_MINIMIZACAO_PADRAO);
  });
});

describe("minimizarCamposExMembro", () => {
  test("encerra vínculos (Assentos/Lideranca/Cargo e, desde a Trava 6-B, professor e aluno da EBD) antes de zerar os campos operacionais", async () => {
    const { pool, chamadas } = criarPoolFalso(Array.from({ length: 21 }, () => []));
    await minimizarNoPool(pool, 42, { dataSaida: "2026-01-01", motivo: "Carta de Mudança" });
    // 9 de encerrarVinculos (Trava 8-A: a 1ª fecha os processos de cargo em andamento e a 2ª revoga o CHM; a 6ª, v8.2, fecha o histórico de cargos; a 9ª, v7.6,
    // derruba as sessões abertas) + o UPDATE final + (v8.2) o histórico de cargos apagado + (v8.4) a credencial cancelada + (v8.3) os documentos da indicação
    // apagados + (Trava 8-A) o diploma, o CHM, o parecer do CEI e os processos de consagração eliminados (Art. 132 §2º, II) + (v8.5) os marcos
    // + (Trava 8-B) na vacância, o Corpo Docente da AFM e a matrícula da AFM, os cursos e as turmas abertas; no fim, a educação continuada e o histórico escolar
    // + (v9.4) a 12ª encerra o envio missionário (Missões) + a 13ª cancela as delegações da pessoa (shared/delegacoes.js)
    expect(chamadas).toHaveLength(21);
    expect(chamadas[0].sql).toMatch(/UPDATE c SET Status = N'REPROVADO', MotivoEncerramento = @motivo/);
    expect(chamadas[0].inputs.motivo).toBe("SAIDA_DO_ROL");
    expect(chamadas[1].sql).toMatch(/Natureza = N'CHM'/);
    expect(chamadas[5].sql).toMatch(/UPDATE CargosMinisteriaisHistorico SET Ate/);
    expect(chamadas[6].sql).toMatch(/UPDATE EbdTurmaProfessores SET Ativo = 0/);
    expect(chamadas[7].sql).toMatch(/UPDATE EbdAlunos SET Ativo = 0/); // saiu da igreja: a matrícula de aluno também se encerra
    // Trava 9-A — a 11ª encerra o Encarregado da Extensão e o dirigente de entidade vinculada
    expect(chamadas[10].sql).toMatch(/UPDATE ExtensaoEncarregados SET Ate/);
    expect(chamadas[10].sql).toMatch(/UPDATE EntidadeDirigentes SET Status = N'ENCERRADO'/);
    expect(chamadas[11].sql).toMatch(/UPDATE EnviosMissionarios SET Status = N'ENCERRADO'/);   // v9.4 — o envio missionário ativo se encerra; o pedido em andamento é retirado
    expect(chamadas[11].sql).toMatch(/Status = N'DESISTIDO'/);
    expect(chamadas[12].sql).toMatch(/UPDATE DelegacoesAcesso SET Status = 'CANCELADA'/);
    expect(chamadas[12].inputs.membroId).toBe(42);
    expect(chamadas[13].sql).toMatch(/UPDATE SessoesAtivas SET Encerrada = 1/);
    expect(chamadas[13].inputs.membroId).toBe(42);
    expect(chamadas[14].sql).toMatch(/Telefone = NULL, Email = NULL, Endereco = NULL/);
    expect(chamadas[14].sql).toMatch(/Sexo = NULL/);
    expect(chamadas[14].sql).not.toMatch(/Nome\s*=\s*NULL/); // nunca apaga o Registro Histórico Mínimo
    expect(chamadas[14].inputs.id).toBe(42);
    expect(chamadas[15].sql).toMatch(/DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @id/);
    expect(chamadas[16].sql).toMatch(/UPDATE CredenciaisEclesiasticas SET Situacao = N'CANCELADA'/);
    expect(chamadas[16].inputs.m).toBe(42);
    expect(chamadas[17].sql).toMatch(/DELETE a OUTPUT DELETED\.Url FROM AnexosGenericos a/);
    expect(chamadas[17].sql).toMatch(/N'Consagracoes'/);
    expect(chamadas[18].sql).toMatch(/DELETE FROM CertificadosEmitidos WHERE MembroId = @id AND Natureza IN \(N'CHM', N'DIPLOMA'\)/);
    expect(chamadas[18].sql).toMatch(/DELETE p FROM PareceresCEIConsagracao/);
    expect(chamadas[18].sql).toMatch(/DELETE FROM Consagracoes WHERE MembroId = @id/);
    expect(chamadas[19].sql).toMatch(/DELETE FROM MarcosMembro WHERE MembroId = @id/);   // v8.5: os registros de conversão (Art. 132 §2º, II)
    // Trava 8-B — a vacância: o Corpo Docente é função (sai sempre); quem deixa a igreja fica com a matrícula da AFM inativa e os cursos e turmas abertas cancelados
    expect(chamadas[8].sql).toMatch(/UPDATE AFMCorpoDocente SET DataFim/);
    expect(chamadas[9].sql).toMatch(/UPDATE a SET StatusMatricula = N'INATIVA'/);
    expect(chamadas[9].sql).toMatch(/UPDATE AFMCursoMatriculas SET Situacao = N'CANCELADA'/);
    // e a minimização elimina a educação continuada e o histórico escolar, com os documentos verificáveis (Art. 132 §2º, II: só o Registro Histórico Mínimo fica)
    expect(chamadas[20].sql).toMatch(/DELETE FROM AFMReciclagemResultados WHERE MembroId = @id/);
    expect(chamadas[20].sql).toMatch(/Natureza IN \(N'DIPLOMA_AFM', N'HISTORICO', N'DECLARACAO'\)/);
    expect(chamadas[20].sql).toMatch(/DELETE FROM AFMCursoMatriculas WHERE MembroId = @id/);
  });
});

// E4 (revisão de fora, 25/11/2026): quem processa precisa saber qual prazo valeu — o da política ou o padrão (política inativa ou sem prazo).
describe("prazoMinimizacaoExMembro", () => {
  test("com a política ativa e com prazo: o prazo dela, e não é o padrão", async () => {
    const { pool } = criarPoolFalso([[{ DiasRetencao: 45 }]]);
    expect(await prazoMinimizacaoExMembro(pool)).toEqual({ dias: 45, padrao: false });
  });
  test("sem a política ativa, ou sem prazo: o padrão de 30 dias, e diz que é o padrão", async () => {
    expect(await prazoMinimizacaoExMembro(criarPoolFalso([[]]).pool)).toEqual({ dias: DIAS_MINIMIZACAO_PADRAO, padrao: true });
    expect(await prazoMinimizacaoExMembro(criarPoolFalso([[{ DiasRetencao: null }]]).pool)).toEqual({ dias: DIAS_MINIMIZACAO_PADRAO, padrao: true });
  });
});

describe("os documentos da indicação: fora do banco na transação, fora do armazenamento só depois", () => {
  test("a minimização devolve os endereços e não apaga arquivo nenhum; excluirDocumentos apaga cada um, sem parar no que já não existe", async () => {
    storage.excluirDocumento.mockClear();
    const recordsets = Array.from({ length: 21 }, () => []);
    recordsets[17] = [{ Url: "https://armazem/doc-1" }, { Url: "https://armazem/doc-2" }];   // o DELETE ... OUTPUT DELETED.Url dos anexos da indicação
    const { pool } = criarPoolFalso(recordsets);
    const urls = await minimizarNoPool(pool, 42, { dataSaida: "2026-01-01", motivo: "Carta de Mudança" });
    expect(urls).toEqual(["https://armazem/doc-1", "https://armazem/doc-2"]);
    expect(storage.excluirDocumento).not.toHaveBeenCalled();
    storage.excluirDocumento.mockImplementationOnce(async () => { throw new Error("o arquivo já não existe"); });
    await excluirDocumentos(urls);
    expect(storage.excluirDocumento.mock.calls.map((c) => c[0])).toEqual(["https://armazem/doc-1", "https://armazem/doc-2"]);
  });
  // E3 (revisão de fora, 25/11/2026): o arquivo que o armazenamento não apagou não some calado — volta para quem chamou registrar.
  test("excluirDocumentos devolve os endereços que o armazenamento não apagou (falha ou exceção); os apagados não entram", async () => {
    storage.excluirDocumento.mockReset();
    storage.excluirDocumento.mockImplementationOnce(async () => true).mockImplementationOnce(async () => false).mockImplementationOnce(async () => { throw new Error("fora do ar"); });
    expect(await excluirDocumentos(["https://armazem/doc-1", "https://armazem/doc-2", "https://armazem/doc-3"])).toEqual(["https://armazem/doc-2", "https://armazem/doc-3"]);
    expect(await excluirDocumentos([])).toEqual([]);
    storage.excluirDocumento.mockImplementation(async () => true);
  });
});
