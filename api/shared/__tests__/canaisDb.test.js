// Testes da camada de banco dos canais (v7.3) com pool falso: as recusas que acontecem ANTES de qualquer
// gravação, os mapeamentos e a lógica de sucessão. A auditoria grava no banco de verdade: aqui só importa
// que a regra recusou/aceitou. O comportamento contra o banco de verdade é coberto pelo roteiro ponta a ponta.
jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
const db = require("../canaisDb");
const canais = require("../canais");
const { registrarAuditoria } = require("../auditoria");
const { criarPoolFalso } = require("./testUtils");

const ctx = () => ({
  congregacoes: new Map([[1, { id: 1, nome: "21 - Gênesis", nomeExibicao: "Gênesis", areaId: 10, ativa: true }]]),
  areas: new Map([[10, { id: 10, nome: "Área 1" }]]),
  departamentos: new Map([[2, { id: 2, sigla: "UMADESPA", nome: "União de Mocidade" }]]),
  congregacoesDaArea: () => [1]
});

const linhaCanal = (extra = {}) => ({
  CanalId: 5, Sigla: "INSTAGRAM_5", Nome: "Instagram da IEADESPA", Ativo: 1, Plataforma: "INSTAGRAM", Categoria: "INSTITUCIONAL", TemaFocado: null,
  Identificador: "@ieadespa", IdentificadorNormalizado: "ieadespa", VinculoInstitucional: "MARCA", DeclaracaoInstitucionalEm: "2026-09-01T10:00:00.000Z",
  Escopo: "CAMPO", CongregacaoId: null, AreaId: null, DepartamentoId: null, IncluiMenores: 0, PublicoNoSite: 1, Descricao: "Perfil oficial",
  CustodiaSecretaria: 1, UltimaTrocaCredencialEm: null, VigenteDesde: "2026-09-01", VigenteAte: null, DesativadoMotivo: null, RegistradoEm: "2026-09-01T10:00:00.000Z", ...extra
});

const dadosCanal = (extra = {}) => ({
  nome: "Instagram da IEADESPA", plataforma: "INSTAGRAM", categoria: "INSTITUCIONAL", identificador: "@ieadespa",
  vinculoInstitucional: "MARCA", declaracaoInstitucional: true, escopo: "CAMPO", ...extra
});

beforeEach(() => registrarAuditoria.mockClear());

describe("datas vindas do banco", () => {
  test("emMs aceita Date, ISO com Z e texto sem fuso (sempre UTC)", () => {
    expect(db.emMs(new Date("2026-10-01T12:00:00Z"))).toBe(Date.UTC(2026, 9, 1, 12));
    expect(db.emMs("2026-10-01T12:00:00.000Z")).toBe(Date.UTC(2026, 9, 1, 12));
    expect(db.emMs("2026-10-01T12:00:00")).toBe(Date.UTC(2026, 9, 1, 12));
    expect(db.emMs("2026-10-01 12:00:00")).toBe(Date.UTC(2026, 9, 1, 12));
    expect(db.emMs(null)).toBeNull();
    expect(db.emMs("lixo")).toBeNull();
  });
});

describe("mapeamento do canal", () => {
  test("canal completo: rótulos, link, escopo e uso no Abandono", () => {
    const c = db.mapearCanal(linhaCanal(), ctx());
    expect(c).toMatchObject({ canalId: 5, plataforma: "INSTAGRAM", rotuloPlataforma: "Instagram", rotuloCategoria: "Canal institucional", rotuloEscopo: "Todo o campo", link: "https://www.instagram.com/ieadespa/", contaParaAbandono: false, exigeCustodia: true, cadastroIncompleto: false, ativo: true });
  });
  test("canal legado (sem plataforma/identificador) é cadastro incompleto e segue valendo para contato", () => {
    const c = db.mapearCanal(linhaCanal({ Plataforma: null, Identificador: null, IdentificadorNormalizado: null, VinculoInstitucional: null, DeclaracaoInstitucionalEm: null }), ctx());
    expect(c.cadastroIncompleto).toBe(true);
    expect(c.contaParaAbandono).toBe(true);
    expect(c.rotuloPlataforma).toMatch(/não informada/);
    expect(c.link).toBeNull();
  });
  test("escopo de congregação e de departamento vira texto sem o prefixo numérico", () => {
    expect(db.mapearCanal(linhaCanal({ Escopo: "CONGREGACAO", CongregacaoId: 1 }), ctx()).rotuloEscopo).toBe("Congregação Gênesis");
    expect(db.mapearCanal(linhaCanal({ Escopo: "DEPARTAMENTO", DepartamentoId: 2 }), ctx()).rotuloEscopo).toBe("Departamento UMADESPA");
    expect(db.mapearCanal(linhaCanal({ Escopo: "AREA", AreaId: 10 }), ctx()).rotuloEscopo).toBe("Área Área 1");
  });
});

describe("registro de canal — recusas antes de gravar", () => {
  test("dado inválido não toca no banco", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ declaracaoInstitucional: false }), { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Estatuto Art\. 12/);
    expect(chamadas).toHaveLength(0);
  });

  test("referência de escopo que não existe", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ escopo: "CONGREGACAO", congregacaoId: 99 }), { membroId: 1 });
    expect(r.mensagem).toMatch(/Congregação não encontrada/);
    expect(chamadas).toHaveLength(0);
  });

  test("número que é contato pessoal de um membro é recusado (Art. 12) — a mensagem cita a matrícula, não o número", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ MembroId: 7, Telefone: "(94) 98888-1111" }]]);
    const r = await db.criarCanal(pool, ctx(), dadosCanal({ plataforma: "WHATSAPP", identificador: "94 98888-1111" }), { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/contato pessoal do membro de matrícula 7/);
    expect(r.mensagem).not.toMatch(/98888/);
    expect(chamadas).toHaveLength(1);
  });

  test("e-mail pessoal idem; e-mail institucional passa para a checagem de duplicidade", async () => {
    const pessoal = criarPoolFalso([[{ MembroId: 8, Email: "Fulano@Gmail.com" }]]);
    expect((await db.criarCanal(pessoal.pool, ctx(), dadosCanal({ plataforma: "EMAIL", identificador: "fulano@gmail.com" }), { membroId: 1 })).mensagem).toMatch(/e-mail está cadastrado como contato pessoal/);
    // perfil de rede social não tem contato pessoal para comparar: vai direto à checagem de duplicidade
    const dup = criarPoolFalso([[{ CanalId: 3, Nome: "Outro perfil" }]]);
    const r = await db.criarCanal(dup.pool, ctx(), dadosCanal(), { membroId: 1 });
    expect(r.mensagem).toMatch(/Já existe um canal ativo com este identificador: “Outro perfil”/);
  });

  test("atualizar canal inexistente; completar legado exige a declaração", async () => {
    const sem = criarPoolFalso([[]]);
    expect((await db.atualizarCanal(sem.pool, ctx(), 5, { nome: "Novo nome" }, { membroId: 1 })).mensagem).toMatch(/não encontrado/);
    const legado = criarPoolFalso([[linhaCanal({ Plataforma: null, Identificador: null, VinculoInstitucional: null, DeclaracaoInstitucionalEm: null })]]);
    const r = await db.atualizarCanal(legado.pool, ctx(), 5, { plataforma: "EMAIL", identificador: "sec@ieadespa.org", vinculoInstitucional: "ESTRUTURA" }, { membroId: 1 });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/Confirme que a conta/);
  });

  test("desativar: motivo obrigatório, não repete e não desativa com ocorrência aberta", async () => {
    expect((await db.desativarCanal(criarPoolFalso([[linhaCanal({ Ativo: 0 })]]).pool, ctx(), 5, "Motivo qualquer", { membroId: 1 })).mensagem).toMatch(/já está desativado/);
    expect((await db.desativarCanal(criarPoolFalso([[linhaCanal()]]).pool, ctx(), 5, "x", { membroId: 1 })).mensagem).toMatch(/motivo da desativação/);
    const aberta = await db.desativarCanal(criarPoolFalso([[linhaCanal()], [{ n: 2 }]]).pool, ctx(), 5, "Encerrado pela congregação", { membroId: 1 });
    expect(aberta.mensagem).toMatch(/2 ocorrência\(s\) aberta\(s\)/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("administradores e termo", () => {
  test("recusas: canal, papel, matrícula, situação do membro e idade", async () => {
    expect((await db.designarAdministrador(criarPoolFalso([[]]).pool, ctx(), { canalId: 5, membroId: 1 })).mensagem).toMatch(/Canal não encontrado/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal({ Ativo: 0 })]]).pool, ctx(), { canalId: 5, membroId: 1 })).mensagem).toMatch(/desativado/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()]]).pool, ctx(), { canalId: 5, membroId: 1, papel: "DONO" })).mensagem).toMatch(/Papel inválido/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()]]).pool, ctx(), { canalId: 5, membroId: "x" })).mensagem).toMatch(/matrícula/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()], []]).pool, ctx(), { canalId: 5, membroId: 9 })).mensagem).toMatch(/Matrícula não encontrada/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()], [{ MembroId: 9, Nome: "Fulano", Status: "INATIVO", DataNascimento: "1980-01-01" }]]).pool, ctx(), { canalId: 5, membroId: 9 })).mensagem).toMatch(/situação ATIVO/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()], [{ MembroId: 9, Nome: "Jovem", Status: "ATIVO", DataNascimento: new Date(Date.now() - 15 * 365 * 86400000) }]]).pool, ctx(), { canalId: 5, membroId: 9 })).mensagem).toMatch(/18 anos/);
    expect((await db.designarAdministrador(criarPoolFalso([[linhaCanal()], [{ MembroId: 9, Nome: "Fulano", Status: "ATIVO", DataNascimento: "1980-01-01" }], [{ AdminId: 4 }]]).pool, ctx(), { canalId: 5, membroId: 9 })).mensagem).toMatch(/já é administrador/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  test("encerrar: motivo obrigatório e não repete", async () => {
    expect((await db.encerrarAdministrador(criarPoolFalso([[]]).pool, ctx(), { adminId: 1, motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/não encontrada/);
    expect((await db.encerrarAdministrador(criarPoolFalso([[{ AdminId: 1, CanalId: 5, MembroId: 9, Papel: "ADMINISTRADOR", EncerradoEm: "2026-09-01" }]]).pool, ctx(), { adminId: 1, motivo: "Motivo suficiente", por: 1 })).mensagem).toMatch(/já foi encerrada/);
    expect((await db.encerrarAdministrador(criarPoolFalso([[{ AdminId: 1, CanalId: 5, MembroId: 9, Papel: "ADMINISTRADOR", EncerradoEm: null }]]).pool, ctx(), { adminId: 1, motivo: "x", por: 1 })).mensagem).toMatch(/motivo do encerramento/);
  });

  test("aceitar o termo exige a designação (ou 'todos') e só vale para a PRÓPRIA matrícula", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.aceitarTermo(pool, { membroId: 9 })).mensagem).toMatch(/Informe a designação/);
    expect(chamadas).toHaveLength(0);
    // nada pendente + a designação não é dele
    expect((await db.aceitarTermo(criarPoolFalso([[], []]).pool, { membroId: 9, adminId: 4 })).mensagem).toMatch(/não encontrada para a sua matrícula/);
    // nada pendente + já aceitou
    expect((await db.aceitarTermo(criarPoolFalso([[], [{ AdminId: 4, TermoVersaoAceita: canais.TERMO_VERSAO }]]).pool, { membroId: 9, adminId: 4 })).mensagem).toMatch(/já aceitou/);
    expect((await db.aceitarTermo(criarPoolFalso([[]]).pool, { membroId: 9, todos: true })).mensagem).toMatch(/Não há termo pendente/);
  });

  test("aceitar grava versão e hash do texto aceito e audita", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ AdminId: 4, CanalId: 5 }], []]);
    const r = await db.aceitarTermo(pool, { membroId: 9, adminId: 4 });
    expect(r).toMatchObject({ sucesso: true, aceitos: 1 });
    expect(chamadas[1].inputs).toMatchObject({ v: canais.TERMO_VERSAO, h: canais.TERMO_HASH });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "TERMO_ACEITO", registroId: 4 }));
  });
});

describe("ocorrências — recusas e leitura", () => {
  const bruta = (extra = {}) => ({ OcorrenciaId: 1, CanalId: 5, Status: "ABERTA", RelatadaEm: "2026-10-01T12:00:00.000Z", PrazoRemocaoEm: "2026-10-02T12:00:00.000Z", AdvertenciaEm: null, ...extra });

  test("abrir: valida o conteúdo, o canal e se está ativo", async () => {
    const base = { canalId: 5, categoria: "OUTRO", descricao: "Conteúdo irregular postado no grupo" };
    expect((await db.abrirOcorrencia(criarPoolFalso([]).pool, ctx(), { ...base, descricao: "curto" }, { membroId: 1 })).mensagem).toMatch(/Descreva o conteúdo/);
    expect((await db.abrirOcorrencia(criarPoolFalso([[]]).pool, ctx(), base, { membroId: 1 })).mensagem).toMatch(/Canal não encontrado/);
    expect((await db.abrirOcorrencia(criarPoolFalso([[linhaCanal({ Ativo: 0 })]]).pool, ctx(), base, { membroId: 1 })).mensagem).toMatch(/desativado/);
  });

  test("remover: não existe, já encerrada, prova inválida", async () => {
    expect((await db.registrarRemocao(criarPoolFalso([[]]).pool, { ocorrenciaId: 1, dados: {}, membroId: 1 })).mensagem).toMatch(/não encontrada/);
    expect((await db.registrarRemocao(criarPoolFalso([[bruta({ Status: "REMOVIDA" })]]).pool, { ocorrenciaId: 1, dados: {}, membroId: 1 })).mensagem).toMatch(/já foi encerrada/);
    const r = await db.registrarRemocao(criarPoolFalso([[bruta()]]).pool, { ocorrenciaId: 1, dados: { provaRemocao: "curto" }, membroId: 1, agoraMs: Date.UTC(2026, 9, 1, 15) });
    expect(r.mensagem).toMatch(/Descreva a remoção/);
  });

  test("remover dentro e fora do prazo — o resultado diz qual", async () => {
    const dentro = await db.registrarRemocao(criarPoolFalso([[bruta()], []]).pool, { ocorrenciaId: 1, dados: { provaRemocao: "Mensagem removida e membro orientado" }, membroId: 1, agoraMs: Date.UTC(2026, 9, 1, 15) });
    expect(dentro).toMatchObject({ sucesso: true, dentroDoPrazo: true, horasAteRemover: 3 });
    const fora = await db.registrarRemocao(criarPoolFalso([[bruta()], []]).pool, { ocorrenciaId: 1, dados: { provaRemocao: "Mensagem removida e membro orientado" }, membroId: 1, agoraMs: Date.UTC(2026, 9, 3, 12) });
    expect(fora).toMatchObject({ sucesso: true, dentroDoPrazo: false });
    expect(fora.mensagem).toMatch(/FORA do prazo/);
  });

  test("improcedente e advertência: regras de preenchimento", async () => {
    expect((await db.marcarImprocedente(criarPoolFalso([[bruta()]]).pool, { ocorrenciaId: 1, motivo: "curto", membroId: 1 })).mensagem).toMatch(/não é irregular/);
    expect((await db.marcarImprocedente(criarPoolFalso([[bruta({ Status: "REMOVIDA" })]]).pool, { ocorrenciaId: 1, motivo: "Conteúdo normal, sem irregularidade", membroId: 1 })).mensagem).toMatch(/já foi encerrada/);
    expect((await db.registrarAdvertencia(criarPoolFalso([[bruta({ AdvertenciaEm: "2026-10-01" })]]).pool, { ocorrenciaId: 1, observacao: "Membro advertido", membroId: 1 })).mensagem).toMatch(/já foi registrada/);
    expect((await db.registrarAdvertencia(criarPoolFalso([[bruta({ Status: "IMPROCEDENTE" })]]).pool, { ocorrenciaId: 1, observacao: "Membro advertido", membroId: 1 })).mensagem).toMatch(/improcedente/);
    expect((await db.registrarAdvertencia(criarPoolFalso([[bruta()]]).pool, { ocorrenciaId: 1, observacao: "x", membroId: 1 })).mensagem).toMatch(/Descreva como/);
  });

  test("a leitura esconde quem avisou, calcula a fase e traz a orientação só enquanto aberta", () => {
    const linha = { OcorrenciaId: 1, CanalId: 5, CanalNome: "Grupo", Categoria: "PROPAGANDA_POLITICA", Descricao: "Santinho no grupo", RelatadaEm: "2026-10-01T12:00:00.000Z", PrazoRemocaoEm: "2026-10-02T12:00:00.000Z", Status: "ABERTA", RelatadaPorMembroId: 9, RelatadaPorNome: "Quem avisou" };
    const semAutor = db.mapearOcorrencia(linha, Date.UTC(2026, 9, 1, 14), { verAutor: false });
    expect(semAutor).not.toHaveProperty("relatadaPorNome");
    expect(semAutor).not.toHaveProperty("relatadaPorMembroId");
    expect(semAutor).toMatchObject({ fase: "NO_PRAZO", gravidade: "ALTA", sugerirAdvertencia: true, horasRestantes: 22 });
    expect(semAutor.orientacao.length).toBeGreaterThan(2);
    expect(semAutor.temaRedirecionamento).toMatchObject({ tema: "CIDADANIA_POLITICA" });
    expect(db.mapearOcorrencia(linha, Date.UTC(2026, 9, 1, 14), { verAutor: true })).toMatchObject({ relatadaPorNome: "Quem avisou", relatadaPorMembroId: 9 });
    const vencida = db.mapearOcorrencia(linha, Date.UTC(2026, 9, 3, 12), { verAutor: false });
    expect(vencida).toMatchObject({ fase: "VENCIDA", igrejaCorresponsavel: true, horasVencida: 24 });
    const removida = db.mapearOcorrencia({ ...linha, Status: "REMOVIDA", RemovidaEm: "2026-10-01T15:00:00.000Z", ProvaRemocao: "ok", RemovidaPorNome: "Adm" }, Date.UTC(2026, 9, 5), { verAutor: false });
    expect(removida).toMatchObject({ fase: "REMOVIDA_NO_PRAZO", dentroDoPrazo: true, horasAteRemover: 3 });
    expect(removida).not.toHaveProperty("orientacao");
  });
});

describe("credenciais, conferência e transmissão — recusas", () => {
  test("resolver troca: existe, ainda aberta, observação sem senha", async () => {
    expect((await db.resolverTroca(criarPoolFalso([[]]).pool, { trocaId: 1, observacao: "Troca feita", por: 1 })).mensagem).toMatch(/não encontrada/);
    expect((await db.resolverTroca(criarPoolFalso([[{ TrocaId: 1, CanalId: 5, ResolvidaEm: "2026-09-01" }]]).pool, { trocaId: 1, observacao: "Troca feita", por: 1 })).mensagem).toMatch(/já foi resolvida/);
    const r = await db.resolverTroca(criarPoolFalso([[{ TrocaId: 1, CanalId: 5, ResolvidaEm: null }]]).pool, { trocaId: 1, observacao: "x", por: 1 });
    expect(r.mensagem).toMatch(/NUNCA escreva a senha/);
  });

  test("pendência manual: canal, ativo e motivo", async () => {
    expect((await db.gerarTrocaManual(criarPoolFalso([[]]).pool, ctx(), { canalId: 5, motivo: "ROTINA", por: 1 })).mensagem).toMatch(/não encontrado/);
    expect((await db.gerarTrocaManual(criarPoolFalso([[linhaCanal()]]).pool, ctx(), { canalId: 5, motivo: "SUCESSAO_LIDERANCA", por: 1 })).mensagem).toMatch(/Motivo inválido/);
  });

  test("conferência: itens faltando, observação na irregular, canal desativado", async () => {
    const faltando = await db.registrarConferencia(criarPoolFalso([[linhaCanal()]]).pool, ctx(), { canalId: 5, itens: { NEUTRALIDADE: true }, por: 1 });
    expect(faltando).toMatchObject({ sucesso: false, faltando: ["POSTURA", "CUSTODIA"] });
    const semObs = await db.registrarConferencia(criarPoolFalso([[linhaCanal()]]).pool, ctx(), { canalId: 5, itens: { NEUTRALIDADE: false, POSTURA: true, CUSTODIA: true }, por: 1 });
    expect(semObs.mensagem).toMatch(/observação obrigatória/);
    expect((await db.registrarConferencia(criarPoolFalso([[linhaCanal({ Ativo: 0 })]]).pool, ctx(), { canalId: 5, itens: {}, por: 1 })).mensagem).toMatch(/desativado/);
  });

  test("transmissão: valida antes de gravar e confere a congregação", async () => {
    const { pool, chamadas } = criarPoolFalso([]);
    expect((await db.salvarTransmissao(pool, ctx(), { congregacaoId: 1, transmite: true, areaCegaSituacao: "DEFINIDA" }, { por: 1 })).mensagem).toMatch(/Descreva onde fica a Área Cega/);
    expect((await db.salvarTransmissao(pool, ctx(), { congregacaoId: 99, transmite: false }, { por: 1 })).mensagem).toMatch(/Congregação não encontrada/);
    expect(chamadas).toHaveLength(0);
  });
});

describe("sucessão de liderança", () => {
  test("a primeira execução só registra o estado conhecido: nenhuma pendência", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ EscopoTipo: "CONGREGACAO", EscopoId: 1, MembroId: 5 }, { EscopoTipo: "CONGREGACAO", EscopoId: 1, MembroId: 6 }], [], []]);
    const r = await db.sincronizarSucessoes(pool, { hoje: "2026-10-01" });
    expect(r).toEqual({ verificados: 1, iniciados: 1, mudancas: 0, pendenciasGeradas: 0 });
    expect(chamadas[2].inputs).toMatchObject({ t: "CONGREGACAO", i: 1, a: "5,6" });
  });

  test("sem mudança não faz nada além de ler", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ EscopoTipo: "AREA", EscopoId: 10, MembroId: 5 }], [{ EscopoTipo: "AREA", EscopoId: 10, Assinatura: "5" }]]);
    const r = await db.sincronizarSucessoes(pool, { hoje: "2026-10-01" });
    expect(r).toMatchObject({ iniciados: 0, mudancas: 0, pendenciasGeradas: 0 });
    expect(chamadas).toHaveLength(2);
  });

  test("a saída é detectada, o estado é atualizado e auditado — mesmo sem canal para abrir pendência", async () => {
    // lê líderes (ninguém mais), lê estado (o dirigente 5 estava), atualiza, canais do escopo (nenhum), canais onde 5 era administrador (nenhum)
    const { pool, chamadas } = criarPoolFalso([[], [{ EscopoTipo: "CONGREGACAO", EscopoId: 1, Assinatura: "5" }], [], [], []]);
    const r = await db.sincronizarSucessoes(pool, { hoje: "2026-10-01", por: 3 });
    expect(r).toEqual({ verificados: 1, iniciados: 0, mudancas: 1, pendenciasGeradas: 0 });
    expect(chamadas[2].inputs).toMatchObject({ a: "" });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "LIDERANCA_SUCESSAO_DETECTADA", registroId: 1, dadosDepois: expect.objectContaining({ sairam: [5], entraram: [] }) }));
  });

  test("quem ENTRA não abre pendência (só atualiza o estado)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ EscopoTipo: "CONGREGACAO", EscopoId: 1, MembroId: 5 }, { EscopoTipo: "CONGREGACAO", EscopoId: 1, MembroId: 6 }], [{ EscopoTipo: "CONGREGACAO", EscopoId: 1, Assinatura: "5" }], []]);
    const r = await db.sincronizarSucessoes(pool, { hoje: "2026-10-01" });
    expect(r).toMatchObject({ mudancas: 1, pendenciasGeradas: 0 });
    expect(chamadas).toHaveLength(3);
  });
});

describe("o que o site pode mostrar", () => {
  test("só canal ativo, público, completo e que não seja grupo focado — e nada interno", async () => {
    const linhas = [
      linhaCanal({ CanalId: 1, Nome: "Instagram", PublicoNoSite: 1 }),
      linhaCanal({ CanalId: 2, Nome: "Privado", PublicoNoSite: 0 }),
      linhaCanal({ CanalId: 3, Nome: "Legado", PublicoNoSite: 1, Plataforma: null, Identificador: null }),
      linhaCanal({ CanalId: 4, Nome: "Focado", PublicoNoSite: 1, Plataforma: "WHATSAPP_GRUPO", Categoria: "GRUPO_FOCADO", TemaFocado: "CIDADANIA_POLITICA", Identificador: "Grupo", IdentificadorNormalizado: "grupo" }),
      linhaCanal({ CanalId: 5, Nome: "E-mail", PublicoNoSite: 1, Plataforma: "EMAIL", Identificador: "sec@ieadespa.org", IdentificadorNormalizado: "sec@ieadespa.org", Escopo: "CONGREGACAO", CongregacaoId: 1 }),
      linhaCanal({ CanalId: 6, Nome: "Do campo (E-mail)", PublicoNoSite: 1, Plataforma: "EMAIL", Identificador: "geral@ieadespa.org", IdentificadorNormalizado: "geral@ieadespa.org" })
    ];
    const { pool } = criarPoolFalso([linhas]);
    const pub = await db.canaisPublicos(pool, ctx());
    expect(pub.map(c => c.nome)).toEqual(["Do campo (E-mail)", "Instagram", "E-mail"]); // campo (em ordem alfabética) antes de congregação
    expect(pub[2]).toMatchObject({ id: 5, link: "mailto:sec@ieadespa.org", rotuloEscopo: "Congregação Gênesis", congregacaoNome: "Gênesis" });
    const chaves = new Set(pub.flatMap(c => Object.keys(c)));
    expect([...chaves].sort()).toEqual(["areaNome", "categoria", "congregacaoNome", "departamentoNome", "descricao", "escopo", "id", "identificador", "link", "nome", "plataforma", "rotuloEscopo", "rotuloPlataforma"]);
  });

  test("lista para contato: só o que vale como tentativa individual", async () => {
    const { pool } = criarPoolFalso([[
      linhaCanal({ CanalId: 1, Nome: "E-mail", Plataforma: "EMAIL", Identificador: "a@b.org", IdentificadorNormalizado: "a@b.org" }),
      linhaCanal({ CanalId: 2, Nome: "Instagram" }),
      linhaCanal({ CanalId: 3, Nome: "Legado", Plataforma: null, Identificador: null, VinculoInstitucional: null })
    ]]);
    const lista = await db.listarParaContato(pool, ctx());
    expect(lista.map(c => c.canalId)).toEqual([1, 3]);
    expect(lista[1].cadastroIncompleto).toBe(true);
  });
});

describe("fatos para o motor de notificações", () => {
  test("termo pendente avisa o próprio designado, com a versão na chave", async () => {
    const { pool } = criarPoolFalso([[{ AdminId: 4, MembroId: 9, Nome: "Fulano", Email: "f@x.org", CanalNome: "Grupo" }]]);
    const f = await db.detectarTermosPendentes(pool);
    expect(f).toEqual([expect.objectContaining({ referenciaId: 4 * 1000 + canais.TERMO_VERSAO, destinatarios: [{ membroId: 9, nome: "Fulano", email: "f@x.org" }] })]);
    expect(f[0].fatoGerador).toMatch(/Grupo/);
  });

  test("troca de credencial: um aviso na abertura e outro quando o prazo vence", async () => {
    const { pool } = criarPoolFalso([[
      { TrocaId: 10, Motivo: "SUCESSAO_LIDERANCA", PrazoEm: "2026-10-05", CanalNome: "Instagram", Plataforma: "INSTAGRAM" },
      { TrocaId: 11, Motivo: "SAIDA_ADMINISTRADOR", PrazoEm: "2026-09-25", CanalNome: "Grupo", Plataforma: "WHATSAPP_GRUPO" }
    ]]);
    const f = await db.detectarTrocasCredencial(pool, { hoje: "2026-10-01" });
    expect(f.map(x => x.referenciaId)).toEqual([20, 22, 23]);
    expect(f[0].fatoGerador).toMatch(/senha/);
    expect(f[2].fatoGerador).toMatch(/PRAZO VENCIDO/);
    expect(f[1].fatoGerador).toMatch(/administradores do grupo/);
  });
});
