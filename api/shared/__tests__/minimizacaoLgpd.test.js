// Testes da retenção que executa (vB.8) — o ponto que mais importa: o
// prazo vem de PoliticasRetencao (nunca mais hardcoded), e cair pro
// fallback de 30 dias nunca destrava um prazo MAIOR sozinho quando a
// política está ausente/inativa.
const { criarPoolFalso } = require("./testUtils");
const { diasMinimizacaoExMembro, minimizarCamposExMembro, DIAS_MINIMIZACAO_PADRAO } = require("../minimizacaoLgpd");

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
    const { pool, chamadas } = criarPoolFalso([[], [], [], [], [], [], [], [], [], [], []]);
    await minimizarCamposExMembro(pool, 42, { dataSaida: "2026-01-01", motivo: "Carta de Mudança" });
    // 7 de encerrarVinculos (a 4ª, v8.2, fecha o histórico de cargos; a 7ª, v7.6, derruba as sessões abertas) + o UPDATE final + (v8.2) o histórico de cargos apagado
    // + (v8.3) o texto e as marcas do parecer do CEI apagados + os documentos da indicação apagados
    expect(chamadas).toHaveLength(11);
    expect(chamadas[3].sql).toMatch(/UPDATE CargosMinisteriaisHistorico SET Ate/);
    expect(chamadas[4].sql).toMatch(/UPDATE EbdTurmaProfessores SET Ativo = 0/);
    expect(chamadas[5].sql).toMatch(/UPDATE EbdAlunos SET Ativo = 0/); // saiu da igreja: a matrícula de aluno também se encerra
    expect(chamadas[6].sql).toMatch(/UPDATE SessoesAtivas SET Encerrada = 1/);
    expect(chamadas[6].inputs.membroId).toBe(42);
    expect(chamadas[7].sql).toMatch(/Telefone = NULL, Email = NULL, Endereco = NULL/);
    expect(chamadas[7].sql).toMatch(/Sexo = NULL/);
    expect(chamadas[7].sql).not.toMatch(/Nome\s*=\s*NULL/); // nunca apaga o Registro Histórico Mínimo
    expect(chamadas[7].inputs.id).toBe(42);
    expect(chamadas[8].sql).toMatch(/DELETE FROM CargosMinisteriaisHistorico WHERE MembroId = @id/);
    expect(chamadas[9].sql).toMatch(/Fundamentacao = NULL, ExcecaoPastorNaoCasado = NULL/);
    expect(chamadas[9].sql).toMatch(/Recasado = NULL/);
    expect(chamadas[9].sql).not.toMatch(/Resultado\s*=/);   // o resultado e a data do parecer ficam como registro
    expect(chamadas[10].sql).toMatch(/DELETE a OUTPUT DELETED\.Url FROM AnexosGenericos a/);
    expect(chamadas[10].sql).toMatch(/N'Consagracoes'/);
  });
});
