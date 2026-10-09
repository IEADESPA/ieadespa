// A camada de banco do consentimento do responsável (v7.7) com pool falso: as recusas que acontecem ANTES de qualquer gravação, o que é gravado (e o que NÃO vai para a
// auditoria: o IP), o efeito da revogação da IMAGEM (o arquivo da foto é apagado), o estado que a tela recebe e a retenção do IP. O pool entrega um conjunto de linhas por
// chamada, NA ORDEM em que o código consulta (a mesma ordem em que está escrito). O comportamento contra o SQL Server (trava de intervalo, gatilho de imutabilidade, CHECKs) é
// coberto pelo roteiro ponta a ponta contra o banco; aqui há um teste de ALINHAMENTO com o texto da migração 143 para o código e o esquema não se afastarem sem alguém notar.
const fs = require("fs");
const path = require("path");

jest.mock("../auditoria", () => ({ registrarAuditoria: jest.fn(async () => true), sha256: () => "" }));
jest.mock("../storage", () => ({ excluirFoto: jest.fn(async () => {}), urlComSas: (u) => u }));

const db = require("../menoresConsentimentoDb");
const mc = require("../menoresConsentimento");
const { registrarAuditoria } = require("../auditoria");
const storage = require("../storage");
const { criarPoolFalso } = require("./testUtils");

const HOJE = "2026-10-08";
const nascidoHa = (anos) => new Date(Date.UTC(2026 - anos, 9, 8));
const HASH = (f) => mc.textoDe(f).hash;
const IP = "177.8.9.10";
const CADEIA = '{"x-forwarded-for":"177.8.9.10:5555, 40.70.1.1:443"}';

const pessoa = (id, extra = {}) => ({ MembroId: id, Nome: id === 30 ? "Caio Souza" : id === 40 ? "Maria Souza" : `Pessoa ${id}`, DataNascimento: id === 30 ? nascidoHa(10) : nascidoHa(40), FotoUrl: null, CongregacaoNome: "Central", ExtensaoNome: null, ...extra });
const linhaBD = (extra = {}) => ({ ConsentimentoId: 5, MenorMembroId: 30, ResponsavelMembroId: 40, Finalidade: "IMAGEM", Concedido: 1, TextoVersao: 1, TextoHash: HASH("IMAGEM"), Forma: "CLICK_RESP", RegistradoEm: new Date("2026-10-01T12:00:00Z"), Referencia: null, ...extra });
const ativoBD = (resp = 40, extra = {}) => ({ MenorMembroId: 30, ResponsavelMembroId: resp, Vinculo: "MAE", Nome: resp === 40 ? "Maria Souza" : "João Souza", ...extra });
const escritas = (chamadas) => chamadas.filter((c) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(c.sql));
const insercao = (chamadas) => chamadas.find((c) => /INSERT INTO MinisterioMenoresConsentimentos/.test(c.sql));

beforeEach(() => { registrarAuditoria.mockClear(); storage.excluirFoto.mockClear(); });

const CONCEDE = { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", aceito: true, textoHash: HASH("IMAGEM"), ip: IP, cadeia: CADEIA, hoje: HOJE };

describe("conceder: o que é recusado ANTES de gravar", () => {
  test("caixa não marcada, hash velho, IP ausente e ids malformados: recusa sem NENHUMA consulta ao banco", async () => {
    const casos = [
      [{ aceito: false }, /caixa de aceite/], [{ aceito: "true" }, /caixa de aceite/], [{ textoHash: "0".repeat(64) }, /texto da autorização mudou/],
      [{ ip: null }, /origem da conexão/], [{ menorId: "0x10" }, /Informe o\(a\) menor/], [{ menorId: "1e1" }, /Informe o\(a\) menor/], [{ menorId: true }, /Informe/], [{ menorId: [30] }, /Informe/],
      [{ responsavelId: "0x28" }, /responsável cadastrado/], [{ responsavelId: true }, /responsável cadastrado/], [{ finalidade: "FOTO" }, /Escolha o que está sendo autorizado/]
    ];
    for (const [extra, msg] of casos) {
      const { pool, chamadas } = criarPoolFalso([]);
      const r = await db.conceder(pool, { ...CONCEDE, ...extra });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(msg);
      expect(chamadas).toHaveLength(0);
    }
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("o hash velho volta com termoMudou:true (a tela recarrega e a pessoa lê de novo)", async () => {
    const { pool } = criarPoolFalso([]);
    expect(await db.conceder(pool, { ...CONCEDE, textoHash: "0".repeat(64) })).toMatchObject({ sucesso: false, termoMudou: true });
  });
  test("quem NÃO é responsável ativo deste menor: 403 (proibido), igual para menor inexistente — e nada é gravado", async () => {
    // linhas vazias, ativos: só OUTRO responsável (41)
    let { pool, chamadas } = criarPoolFalso([[], [ativoBD(41)]]);
    const outro = await db.conceder(pool, CONCEDE);
    expect(outro).toEqual({ sucesso: false, proibido: true, mensagem: mc.MENSAGENS.NAO_E_RESPONSAVEL });
    expect(escritas(chamadas)).toHaveLength(0);
    // menor que não existe: sem linhas e sem responsáveis
    ({ pool, chamadas } = criarPoolFalso([[], []]));
    expect(await db.conceder(pool, CONCEDE)).toEqual(outro);
    expect(escritas(chamadas)).toHaveLength(0);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
  test("responsável já REVOGADO (não aparece mais entre os ativos): recusa — a autorização dele não vale mais", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], []]);
    expect((await db.conceder(pool, CONCEDE)).proibido).toBe(true);
    expect(escritas(chamadas)).toHaveLength(0);
  });
  test("adulto no lugar do menor: recusa com o motivo; menor SEM data de nascimento: recusa (idade desconhecida não se presume)", async () => {
    for (const [nasc, motivo] of [[nascidoHa(30), /18 anos ou mais/], [null, /data de nascimento/], [nascidoHa(18), /18 anos ou mais/]]) {
      const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30, { DataNascimento: nasc })], [pessoa(40)]]);
      const r = await db.conceder(pool, CONCEDE);
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(motivo);
      expect(escritas(chamadas)).toHaveLength(0);
    }
  });
  test("responsável que é menor de idade ou sem data de nascimento: recusa", async () => {
    for (const nasc of [nascidoHa(16), null]) {
      const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40, { DataNascimento: nasc })]]);
      const r = await db.conceder(pool, CONCEDE);
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/18 anos ou mais/);
      expect(escritas(chamadas)).toHaveLength(0);
    }
  });
  test("já concedido por este mesmo texto (e por responsável que continua ativo): recusa; o outro responsável também não repete", async () => {
    for (const ativos of [[ativoBD(40)], [ativoBD(40), ativoBD(41)]]) {
      for (const quem of [40, 41]) {
        if (quem === 41 && ativos.length === 1) continue;
        const { pool, chamadas } = criarPoolFalso([[linhaBD()], ativos, [pessoa(30)], [pessoa(quem)]]);
        const r = await db.conceder(pool, { ...CONCEDE, responsavelId: quem });
        expect(r).toEqual({ sucesso: false, mensagem: mc.mensagemJaConcedido() });
        expect(escritas(chamadas)).toHaveLength(0);
      }
    }
  });
});

describe("conceder: o que é gravado", () => {
  test("grava UMA linha de acréscimo com o IP e a cadeia do responsável, a versão e o hash vigentes; audita só ids e o hash (nunca o IP)", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 77 }]]);
    const r = await db.conceder(pool, CONCEDE);
    expect(r).toMatchObject({ sucesso: true, consentimentoId: 77 });
    expect(r.mensagem).toMatch(/Caio Souza/);
    const ins = insercao(chamadas);
    expect(ins.inputs).toMatchObject({ mn: 30, rs: 40, f: "IMAGEM", c: 1, ver: 1, h: HASH("IMAGEM"), forma: "CLICK_RESP", ip: IP, cad: CADEIA, ref: null, por: null });
    expect(escritas(chamadas)).toHaveLength(1);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ tabela: "MinisterioMenoresConsentimentos", registroId: 77, acao: "MENOR_CONSENTIMENTO_CONCEDIDO", usuarioId: 40, dadosDepois: { menorId: 30, finalidade: "IMAGEM", forma: "CLICK_RESP", textoVersao: 1, textoHash: HASH("IMAGEM") } });
    expect(JSON.stringify(aud)).not.toMatch(/177\.8|forwarded|Caio|Maria/);
  });
  test("a finalidade vai em maiúsculas e o hash enviado em qualquer caixa é aceito, mas o que se grava é o do texto VIGENTE", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 8 }]]);
    const r = await db.conceder(pool, { ...CONCEDE, finalidade: "saude_cracha", textoHash: ` ${HASH("SAUDE_CRACHA").toUpperCase()} ` });
    expect(r.sucesso).toBe(true);
    expect(insercao(chamadas).inputs).toMatchObject({ f: "SAUDE_CRACHA", h: HASH("SAUDE_CRACHA") });
  });
  test("a resposta traz o estado novo (CONCEDIDO, concedido por você, texto íntegro) — a tela não precisa reler", async () => {
    const { pool } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 77 }]]);
    const r = await db.conceder(pool, CONCEDE);
    expect(r.estado).toMatchObject({ finalidade: "IMAGEM", situacao: "CONCEDIDO", vigente: true, concedidoPorVoce: true, forma: "CLICK_RESP", integridade: { status: "OK" } });
  });
  test("o outro responsável pode autorizar de novo quando quem autorizou antes saiu (a autorização antiga não vale) — grava linha nova", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD({ ResponsavelMembroId: 40 })], [ativoBD(41)], [pessoa(30)], [pessoa(41)], [{ id: 9 }]]);
    const r = await db.conceder(pool, { ...CONCEDE, responsavelId: 41 });
    expect(r.sucesso).toBe(true);
    expect(insercao(chamadas).inputs).toMatchObject({ rs: 41 });
  });
  test("depois de revogada, a mesma pessoa pode autorizar de novo (linha nova); o texto antigo (hash diferente) também pode ser renovado", async () => {
    let { pool, chamadas } = criarPoolFalso([[linhaBD({ Concedido: 0 })], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 10 }]]);
    expect((await db.conceder(pool, CONCEDE)).sucesso).toBe(true);
    ({ pool, chamadas } = criarPoolFalso([[linhaBD({ TextoHash: "1".repeat(64), TextoVersao: 0 })], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 11 }]]));
    expect((await db.conceder(pool, CONCEDE)).sucesso).toBe(true);
    expect(insercao(chamadas)).toBeDefined();
  });
  test("corrida: o INSERT confere TUDO no mesmo comando (responsável ativo + última linha) e, se a condição já não vale, volta sem id → recusa sem erro", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: null }]]);
    const r = await db.conceder(pool, CONCEDE);
    expect(r).toEqual({ sucesso: false, mensagem: mc.MENSAGENS.CONCORRENCIA });
    expect(registrarAuditoria).not.toHaveBeenCalled();
    const ins = insercao(chamadas).sql;
    expect(ins).toMatch(/WITH \(UPDLOCK, HOLDLOCK\)/);
    expect(ins).toMatch(/FROM VoluntariadoResponsaveis WITH \(UPDLOCK, HOLDLOCK\) WHERE MenorMembroId = @mn AND ResponsavelMembroId = @rs AND RevogadoEm IS NULL/);
    expect(ins).toMatch(/AND NOT EXISTS \(SELECT 1 FROM MinisterioMenoresConsentimentos u WITH \(UPDLOCK, HOLDLOCK\)[\s\S]*u\.Concedido = 1 AND u\.TextoHash = @h/);
    expect(ins).toMatch(/ra\.RevogadoEm IS NULL/);
  });
});

describe("revogar", () => {
  test("ids malformados, finalidade fora da lista: recusa sem consultar; revogar NÃO exige caixa, hash nem IP", async () => {
    for (const extra of [{ menorId: "0x10" }, { menorId: [30] }, { responsavelId: true }, { finalidade: "OUTRA" }]) {
      const { pool, chamadas } = criarPoolFalso([]);
      expect((await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", hoje: HOJE, ...extra })).sucesso).toBe(false);
      expect(chamadas).toHaveLength(0);
    }
  });
  test("quem não é responsável ativo (ou já foi revogado): 403 sem gravar nem apagar foto", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], [ativoBD(41)]]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: false, proibido: true });
    expect(escritas(chamadas)).toHaveLength(0);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("o menor já fez 18 anos: o responsável não decide mais por ele (nada é gravado, nenhuma foto é apagada)", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], [ativoBD(40)], [pessoa(30, { DataNascimento: nascidoHa(19), FotoUrl: "https://armazem/fotos-membros/membro-30" })]]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", hoje: HOJE });
    expect(r.sucesso).toBe(false);
    expect(r.mensagem).toMatch(/18 anos ou mais/);
    expect(escritas(chamadas)).toHaveLength(0);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("revogar a IMAGEM grava a linha de revogação E apaga a foto: referência zerada, blob excluído, auditoria sem texto livre e sem IP", async () => {
    const foto = "https://armazem/fotos-membros/membro-30";
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], [ativoBD(40)], [pessoa(30, { FotoUrl: foto })], [{ id: 78 }], []]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", ip: IP, cadeia: CADEIA, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, consentimentoId: 78, fotoApagada: true });
    expect(r.mensagem).toMatch(/A foto de Caio Souza foi apagada e a imagem deixa de ser usada/);
    expect(insercao(chamadas).inputs).toMatchObject({ mn: 30, rs: 40, f: "IMAGEM", c: 0, forma: "CLICK_RESP", ip: IP, cad: CADEIA, por: null });
    const apagou = chamadas.find((c) => /UPDATE MembroReferencia SET FotoUrl = NULL WHERE MembroId = @id/.test(c.sql));
    expect(apagou.inputs).toEqual({ id: 30 });
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
    expect(r.estado).toMatchObject({ situacao: "REVOGADO", vigente: false });
    const acoes = registrarAuditoria.mock.calls.map((c) => c[0]);
    expect(acoes.map((a) => a.acao)).toEqual(["MENOR_CONSENTIMENTO_REVOGADO", "Excluiu a foto (consentimento de imagem revogado)"]);
    expect(acoes[0]).toMatchObject({ registroId: 78, usuarioId: 40, dadosDepois: { menorId: 30, finalidade: "IMAGEM", forma: "CLICK_RESP", fotoApagada: true } });
    expect(JSON.stringify(acoes)).not.toMatch(/177\.8|forwarded|armazem|membro-30/);
  });
  test("qualquer responsável ativo revoga, não só quem concedeu", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD({ ResponsavelMembroId: 40 })], [ativoBD(40), ativoBD(41)], [pessoa(30)], [{ id: 79 }], []]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 41, finalidade: "IMAGEM", ip: IP, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(insercao(chamadas).inputs).toMatchObject({ rs: 41, c: 0 });
  });
  test("sem foto guardada, a revogação ainda grava, mas não finge que apagou (fotoApagada:false) e não audita exclusão; o blob órfão é limpo de qualquer forma", async () => {
    const { pool } = criarPoolFalso([[linhaBD()], [ativoBD(40)], [pessoa(30, { FotoUrl: null })], [{ id: 80 }], []]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", ip: IP, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, fotoApagada: false });
    expect(r.mensagem).toMatch(/A imagem de Caio Souza deixa de ser usada/);
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
  });
  test("revogar a SAÚDE no crachá não toca na foto", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD({ Finalidade: "SAUDE_CRACHA", TextoHash: HASH("SAUDE_CRACHA") })], [ativoBD(40)], [pessoa(30, { FotoUrl: "https://armazem/fotos-membros/membro-30" })], [{ id: 81 }]]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "SAUDE_CRACHA", ip: IP, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, fotoApagada: false });
    expect(r.mensagem).toMatch(/informação de saúde de Caio Souza deixa de ser usada no crachá/);
    expect(chamadas.some((c) => /UPDATE MembroReferencia/.test(c.sql))).toBe(false);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("sem IP nenhum a revogação NÃO fica bloqueada: grava com o marcador 'indisponivel'", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], [ativoBD(40)], [pessoa(30)], [{ id: 82 }], []]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", ip: null, hoje: HOJE });
    expect(r.sucesso).toBe(true);
    expect(insercao(chamadas).inputs.ip).toBe("indisponivel");
  });
  test("já revogada: não grava de novo, mas para IMAGEM ainda limpa a foto que tenha sobrado (idempotente)", async () => {
    let { pool, chamadas } = criarPoolFalso([[linhaBD({ Concedido: 0 })], [ativoBD(40)], [pessoa(30, { FotoUrl: "https://armazem/fotos-membros/membro-30" })], []]);
    let r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, jaRevogada: true, fotoApagada: true });
    expect(insercao(chamadas)).toBeUndefined();
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
    storage.excluirFoto.mockClear();
    ({ pool, chamadas } = criarPoolFalso([[linhaBD({ Finalidade: "SAUDE_CRACHA", Concedido: 0 })], [ativoBD(40)], [pessoa(30)]]));
    r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "SAUDE_CRACHA", hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, jaRevogada: true, fotoApagada: false });
    expect(escritas(chamadas)).toHaveLength(0);
    expect(storage.excluirFoto).not.toHaveBeenCalled();
  });
  test("revogar o que NUNCA foi dado também grava (a pessoa pediu: fica registrado e a foto antiga é apagada)", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30, { FotoUrl: "https://armazem/fotos-membros/membro-30" })], [{ id: 83 }], []]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", ip: IP, hoje: HOJE });
    expect(r).toMatchObject({ sucesso: true, fotoApagada: true });
    expect(insercao(chamadas).inputs.c).toBe(0);
  });
  test("corrida na revogação: a condição do INSERT recusa (sem id) e nada é apagado", async () => {
    const { pool, chamadas } = criarPoolFalso([[linhaBD()], [ativoBD(40)], [pessoa(30, { FotoUrl: "https://armazem/fotos-membros/membro-30" })], [{ id: null }]]);
    const r = await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", ip: IP, hoje: HOJE });
    expect(r).toEqual({ sucesso: false, mensagem: mc.MENSAGENS.CONCORRENCIA });
    expect(storage.excluirFoto).not.toHaveBeenCalled();
    expect(insercao(chamadas).sql).toMatch(/u\.Concedido = 0 AND u\.ConsentimentoId = \(SELECT MAX\(x\.ConsentimentoId\)/);
  });
});

describe("registrarManual (a ficha assinada, pela Secretaria)", () => {
  const FICHA = { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 12, pasta azul", por: 5, hoje: HOJE };
  const dentro = () => ({ podeMembro: jest.fn(() => true) });

  test("quem registra não é o responsável nem o menor, e os campos são estritos: recusa sem consultar o banco", async () => {
    for (const [extra, proibido] of [[{ por: 40 }, true], [{ por: 30 }, true], [{ concedido: "true" }, false], [{ referencia: "<b>" }, false], [{ referencia: "" }, false], [{ menorId: "0x10" }, false], [{ responsavelId: [40] }, false], [{ finalidade: "X" }, false]]) {
      const { pool, chamadas } = criarPoolFalso([]);
      const r = await db.registrarManual(pool, { ...FICHA, ...extra, autorizacao: dentro() });
      expect(r.sucesso).toBe(false);
      expect(!!r.proibido).toBe(proibido);
      expect(chamadas).toHaveLength(0);
    }
  });
  test("fora do escopo, sem a regra de escopo ou menor inexistente: a MESMA recusa (403), sem gravar", async () => {
    let { pool, chamadas } = criarPoolFalso([[pessoa(30)]]);
    const fora = await db.registrarManual(pool, { ...FICHA, autorizacao: { podeMembro: () => false } });
    expect(fora).toEqual({ sucesso: false, proibido: true, mensagem: mc.MENSAGENS.FORA_DO_ESCOPO });
    expect(escritas(chamadas)).toHaveLength(0);
    ({ pool } = criarPoolFalso([[pessoa(30)]]));
    expect(await db.registrarManual(pool, { ...FICHA })).toEqual(fora);                                        // sem `autorizacao`: fecha
    ({ pool } = criarPoolFalso([[pessoa(30)]]));
    expect(await db.registrarManual(pool, { ...FICHA, autorizacao: { podeMembro: "sim" } })).toEqual(fora);
    ({ pool } = criarPoolFalso([[]]));
    expect(await db.registrarManual(pool, { ...FICHA, autorizacao: dentro() })).toEqual(fora);               // menor que não existe
  });
  test("a regra de escopo recebe a congregação E a extensão da pessoa do menor", async () => {
    const aut = dentro();
    const { pool } = criarPoolFalso([[pessoa(30, { CongregacaoNome: "Vila Nova", ExtensaoNome: "Tenda Norte" })], [], [ativoBD(40)], [{ id: 1 }]]);
    await db.registrarManual(pool, { ...FICHA, autorizacao: aut });
    expect(aut.podeMembro).toHaveBeenCalledWith("Vila Nova", "Tenda Norte");
  });
  test("o responsável da ficha precisa ser ATIVO deste menor (cadastrado pela Secretaria); senão 422 com a orientação", async () => {
    const { pool, chamadas } = criarPoolFalso([[pessoa(30)], [], [ativoBD(41)]]);
    const r = await db.registrarManual(pool, { ...FICHA, autorizacao: dentro() });
    expect(r.sucesso).toBe(false);
    expect(r.proibido).toBeUndefined();
    expect(r.mensagem).toMatch(/Cadastre o responsável/);
    expect(escritas(chamadas)).toHaveLength(0);
  });
  test("conceder por ficha exige menor de idade CONHECIDA; adulto e sem data de nascimento são recusados", async () => {
    for (const nasc of [nascidoHa(25), null]) {
      const { pool, chamadas } = criarPoolFalso([[pessoa(30, { DataNascimento: nasc })]]);
      const r = await db.registrarManual(pool, { ...FICHA, autorizacao: dentro() });
      expect(r.sucesso).toBe(false);
      expect(escritas(chamadas)).toHaveLength(0);
    }
  });
  test("a ficha que concede grava FICHA_FISICA com a referência e quem registrou, SEM IP; audita tamanho da referência, não o texto", async () => {
    const { pool, chamadas } = criarPoolFalso([[pessoa(30)], [], [ativoBD(40)], [{ id: 90 }]]);
    const r = await db.registrarManual(pool, { ...FICHA, autorizacao: dentro() });
    expect(r).toMatchObject({ sucesso: true, consentimentoId: 90, fotoApagada: false });
    expect(r.mensagem).toMatch(/passa a valer/);
    expect(insercao(chamadas).inputs).toMatchObject({ mn: 30, rs: 40, f: "IMAGEM", c: 1, forma: "FICHA_FISICA", ip: null, cad: null, ref: "Ficha 12, pasta azul", por: 5, h: HASH("IMAGEM"), ver: 1 });
    expect(r.estado).toMatchObject({ situacao: "CONCEDIDO", vigente: true, forma: "FICHA_FISICA", integridade: { status: "DOCUMENTO_EXTERNO" }, concedidoPorMembroId: 40, referencia: "Ficha 12, pasta azul" });
    const aud = registrarAuditoria.mock.calls[0][0];
    expect(aud).toMatchObject({ acao: "MENOR_CONSENTIMENTO_FICHA", usuarioId: 5, dadosDepois: { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referenciaTamanho: "Ficha 12, pasta azul".length } });
    expect(JSON.stringify(aud)).not.toMatch(/pasta azul/);
  });
  test("a ficha que REVOGA a imagem também apaga a foto do menor", async () => {
    const { pool, chamadas } = criarPoolFalso([[pessoa(30, { FotoUrl: "https://armazem/fotos-membros/membro-30" })], [linhaBD()], [ativoBD(40)], [{ id: 91 }], []]);
    const r = await db.registrarManual(pool, { ...FICHA, concedido: false, autorizacao: dentro() });
    expect(r).toMatchObject({ sucesso: true, fotoApagada: true });
    expect(insercao(chamadas).inputs).toMatchObject({ c: 0, forma: "FICHA_FISICA", por: 5 });
    expect(storage.excluirFoto).toHaveBeenCalledWith(30);
    expect(r.mensagem).toMatch(/revogada e a foto foi apagada/);
  });
  test("a ficha que concede o que já está concedido por este texto é recusada; a que revoga o já revogado não grava de novo", async () => {
    let { pool, chamadas } = criarPoolFalso([[pessoa(30)], [linhaBD()], [ativoBD(40)]]);
    expect(await db.registrarManual(pool, { ...FICHA, autorizacao: dentro() })).toEqual({ sucesso: false, mensagem: mc.mensagemJaConcedido() });
    expect(escritas(chamadas)).toHaveLength(0);
    ({ pool, chamadas } = criarPoolFalso([[pessoa(30)], [linhaBD({ Concedido: 0 })], [ativoBD(40)], []]));
    const r = await db.registrarManual(pool, { ...FICHA, concedido: false, autorizacao: dentro() });
    expect(r).toMatchObject({ sucesso: true, jaRevogada: true });
    expect(insercao(chamadas)).toBeUndefined();
  });
});

describe("o que a tela lê: estadoDoMenor", () => {
  test("visão do RESPONSÁVEL: os dois estados e quem são os responsáveis (nome e vínculo), sem matrícula de ninguém e sem a data de nascimento", async () => {
    const { pool } = criarPoolFalso([[pessoa(30)], [linhaBD()], [ativoBD(40), ativoBD(41)]]);
    const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE, visitanteId: 40 });
    expect(r.sucesso).toBe(true);
    expect(r.menor).toEqual({ membroId: 30, nome: "Caio Souza", idade: 10, aindaMenor: true });
    expect(Object.keys(r.estados)).toEqual(["IMAGEM", "SAUDE_CRACHA"]);
    expect(r.estados.IMAGEM).toMatchObject({ situacao: "CONCEDIDO", vigente: true, concedidoPorVoce: true, rotuloFinalidade: mc.FINALIDADES.IMAGEM });
    expect(r.estados.SAUDE_CRACHA).toMatchObject({ situacao: "NUNCA_DADO", vigente: false, podeConceder: true, concedidoPorVoce: false });
    expect(r.estados.IMAGEM.concedidoPorMembroId).toBeUndefined();
    expect(r.responsaveis).toEqual([{ nome: "Maria Souza", vinculo: "MAE", rotuloVinculo: "Mãe" }, { nome: "João Souza", vinculo: "MAE", rotuloVinculo: "Mãe" }]);
    expect(JSON.stringify(r)).not.toMatch(/DataNascimento|2016|"membroId":4|FotoUrl|Central/);
  });
  test("visão da SECRETARIA: também a matrícula dos responsáveis, de quem concedeu e a referência da ficha", async () => {
    const { pool } = criarPoolFalso([[pessoa(30)], [linhaBD({ Forma: "FICHA_FISICA", Referencia: "Ficha 12" })], [ativoBD(40)]]);
    const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE, paraGestao: true });
    expect(r.menor).toMatchObject({ congregacaoNome: "Central" });
    expect(r.responsaveis).toEqual([{ membroId: 40, nome: "Maria Souza", vinculo: "MAE", rotuloVinculo: "Mãe" }]);
    expect(r.estados.IMAGEM).toMatchObject({ concedidoPorMembroId: 40, referencia: "Ficha 12", integridade: { status: "DOCUMENTO_EXTERNO" } });
  });
  test("menor sem responsável ativo: SEM_RESPONSAVEL_ATIVO nos dois; quem concedeu e saiu: a autorização não vale", async () => {
    const { pool } = criarPoolFalso([[pessoa(30)], [linhaBD()], []]);
    const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE });
    expect(r.estados.IMAGEM).toMatchObject({ situacao: "SEM_RESPONSAVEL_ATIVO", vigente: false, quemAutorizouSaiu: true });
    expect(r.estados.SAUDE_CRACHA.situacao).toBe("SEM_RESPONSAVEL_ATIVO");
    expect(r.responsaveis).toEqual([]);
  });
  test("a última linha de cada finalidade manda (SAÚDE revogada, IMAGEM concedida)", async () => {
    const { pool } = criarPoolFalso([[pessoa(30)], [linhaBD(), linhaBD({ ConsentimentoId: 6, Finalidade: "SAUDE_CRACHA", Concedido: 0, TextoHash: HASH("SAUDE_CRACHA") })], [ativoBD(40)]]);
    const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE });
    expect(r.estados.IMAGEM.situacao).toBe("CONCEDIDO");
    expect(r.estados.SAUDE_CRACHA.situacao).toBe("REVOGADO");
  });
  test("quem já tem 18 anos (ou não tem data de nascimento) não tem consentimento de responsável: sem estados, com o motivo", async () => {
    for (const [nasc, motivo] of [[nascidoHa(30), /18 anos ou mais/], [null, /data de nascimento/]]) {
      const { pool, chamadas } = criarPoolFalso([[pessoa(30, { DataNascimento: nasc })]]);
      const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE });
      expect(r).toMatchObject({ sucesso: true, estados: null, responsaveis: [] });
      expect(r.mensagem).toMatch(motivo);
      expect(chamadas).toHaveLength(1);
    }
  });
  test("menor que não existe: recusa; a linha já lida pela rota é reaproveitada (sem reler o cadastro)", async () => {
    let { pool } = criarPoolFalso([[]]);
    expect(await db.estadoDoMenor(pool, 30, { hoje: HOJE })).toEqual({ sucesso: false, mensagem: mc.MENSAGENS.MENOR_NAO_ACHADO });
    let chamadas;
    ({ pool, chamadas } = criarPoolFalso([[], [ativoBD(40)]]));
    const r = await db.estadoDoMenor(pool, 30, { hoje: HOJE, menor: pessoa(30) });
    expect(r.sucesso).toBe(true);
    expect(chamadas).toHaveLength(2);
  });
});

describe("Meu Painel do responsável: menoresDoResponsavel", () => {
  const linhaDoCadastro = (id, nasc) => ({ MenorMembroId: id, Vinculo: "MAE", Nome: `Menor ${id}`, DataNascimento: nasc, AdesaoId: null, Forma: null, DataAceite: null, AdesaoResponsavelNome: null, SuspensaSemResponsavel: 0 });
  test("só os que AINDA são menores (quem fez 18 anos sai), cada um com os dois estados", async () => {
    const { pool } = criarPoolFalso([
      [linhaDoCadastro(30, nascidoHa(10)), linhaDoCadastro(31, nascidoHa(19)), linhaDoCadastro(32, nascidoHa(5))],
      [linhaBD(), linhaBD({ ConsentimentoId: 6, MenorMembroId: 32, Concedido: 0 })],
      [ativoBD(40), { ...ativoBD(40), MenorMembroId: 32 }]
    ]);
    const lista = await db.menoresDoResponsavel(pool, 40, { hoje: HOJE });
    expect(lista.map((m) => m.menorId)).toEqual([30, 32]);
    expect(lista[0]).toMatchObject({ nome: "Menor 30", idade: 10, vinculo: "MAE", rotuloVinculo: "Mãe" });
    expect(lista[0].estados.IMAGEM).toMatchObject({ situacao: "CONCEDIDO", concedidoPorVoce: true });
    expect(lista[1].estados.IMAGEM.situacao).toBe("REVOGADO");
    expect(lista[1].estados.SAUDE_CRACHA.situacao).toBe("NUNCA_DADO");
    expect(JSON.stringify(lista)).not.toMatch(/DataNascimento|2016/);
  });
  test("sem nenhum menor: lista vazia, e não consulta consentimentos à toa", async () => {
    const { pool, chamadas } = criarPoolFalso([[]]);
    expect(await db.menoresDoResponsavel(pool, 40, { hoje: HOJE })).toEqual([]);
    expect(chamadas).toHaveLength(1);
  });
});

describe("consentimentoVigente: a peça que as outras telas consultam", () => {
  const vig = (linhas, extra = {}) => { const { pool } = criarPoolFalso([linhas]); return db.consentimentoVigente(pool, 30, "IMAGEM", { hoje: HOJE, ...extra }); };
  test("vale quando a última linha concede, o responsável que concedeu segue ativo e a pessoa tem menos de 18 anos", async () => {
    expect(await vig([{ Concedido: 1, DataNascimento: nascidoHa(10), ResponsavelAtivo: 1 }])).toBe(true);
  });
  test("não vale: revogada, responsável que concedeu saiu, sem nenhuma linha, adulto, idade desconhecida", async () => {
    expect(await vig([{ Concedido: 0, DataNascimento: nascidoHa(10), ResponsavelAtivo: 1 }])).toBe(false);
    expect(await vig([{ Concedido: 1, DataNascimento: nascidoHa(10), ResponsavelAtivo: 0 }])).toBe(false);
    expect(await vig([])).toBe(false);
    expect(await vig([{ Concedido: 1, DataNascimento: nascidoHa(18), ResponsavelAtivo: 1 }])).toBe(false);
    expect(await vig([{ Concedido: 1, DataNascimento: null, ResponsavelAtivo: 1 }])).toBe(false);
  });
  test("a consulta olha a ÚLTIMA linha do par (menor, finalidade), numa só ida ao banco", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Concedido: 1, DataNascimento: nascidoHa(10), ResponsavelAtivo: 1 }]]);
    await db.consentimentoVigente(pool, "30", "SAUDE_CRACHA", { hoje: HOJE });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].inputs).toEqual({ mn: 30, f: "SAUDE_CRACHA" });
    expect(chamadas[0].sql).toMatch(/ORDER BY c\.ConsentimentoId DESC/);
    expect(chamadas[0].sql).toMatch(/r\.RevogadoEm IS NULL/);
  });
  test("id ou finalidade inválidos: falso, sem consultar o banco", async () => {
    for (const [id, f] of [["0x10", "IMAGEM"], [true, "IMAGEM"], [[30], "IMAGEM"], [0, "IMAGEM"], [30, "OUTRA"], [30, undefined]]) {
      const { pool, chamadas } = criarPoolFalso([]);
      expect(await db.consentimentoVigente(pool, id, f, { hoje: HOJE })).toBe(false);
      expect(chamadas).toHaveLength(0);
    }
  });
});

describe("retenção do IP (LGPD art. 16)", () => {
  test("anonimiza só o aceite DIGITAL antigo: IP vira 'anonimizado', a cadeia some; a linha em si (versão, hash, data) não é tocada; padrão de 1825 dias", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [{ total: 3 }]]);
    const r = await db.anonimizarIpsVencidos(pool, { hoje: HOJE });
    expect(r).toEqual({ anonimizados: 3, retencaoDias: 1825 });
    const up = chamadas.find((c) => /UPDATE c SET/.test(c.sql));
    expect(up.inputs).toEqual({ hoje: HOJE, dias: 1825 });
    expect(up.sql).toMatch(/SET EnderecoIp = N'anonimizado', CadeiaCabecalhos = NULL\s+FROM MinisterioMenoresConsentimentos c/);
    expect(up.sql).toMatch(/c\.Forma = 'CLICK_RESP'/);
    expect(up.sql).toMatch(/c\.RegistradoEm < DATEADD\(DAY, -@dias, @hoje\)/);
    expect(registrarAuditoria).toHaveBeenCalledWith({ tabela: "MinisterioMenoresConsentimentos", registroId: 0, acao: "IP_ANONIMIZADO", usuarioId: null, dadosDepois: { quantidade: 3, retencaoDias: 1825, referencia: HOJE } });
  });
  test("o prazo vem de Catálogos → Prazos (VOLUNTARIADO_IP_RETENCAO_DIAS); sem nada a anonimizar, não audita", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ Dias: 365 }], [{ total: 0 }]]);
    expect(await db.anonimizarIpsVencidos(pool, { hoje: HOJE })).toEqual({ anonimizados: 0, retencaoDias: 365 });
    expect(chamadas[0].inputs.sigla).toBe("VOLUNTARIADO_IP_RETENCAO_DIAS");
    expect(chamadas[1].inputs.dias).toBe(365);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("direito de acesso do titular (Meus Dados)", () => {
  test("o que a pessoa autorizou COMO RESPONSÁVEL (com o IP dela) e o que foi autorizado SOBRE ela quando era menor (sem o IP do responsável e sem o nome de quem registrou)", async () => {
    const { pool } = criarPoolFalso([
      [{ Finalidade: "IMAGEM", Concedido: 1, TextoVersao: 1, TextoHash: HASH("IMAGEM"), Forma: "CLICK_RESP", RegistradoEm: new Date("2026-10-01T12:00:00Z"), EnderecoIp: IP, CadeiaCabecalhos: CADEIA, Referencia: null, RegistradoPorMembroId: null, Menor: "Caio Souza" },
       { Finalidade: "SAUDE_CRACHA", Concedido: 0, TextoVersao: 1, TextoHash: HASH("SAUDE_CRACHA"), Forma: "FICHA_FISICA", RegistradoEm: new Date("2026-09-01T12:00:00Z"), EnderecoIp: null, CadeiaCabecalhos: null, Referencia: "Ficha 3", RegistradoPorMembroId: 5, Menor: "Caio Souza" }],
      [{ Finalidade: "IMAGEM", Concedido: 1, TextoVersao: 1, TextoHash: HASH("IMAGEM"), Forma: "CLICK_RESP", RegistradoEm: new Date("2016-10-01T12:00:00Z"), Referencia: null, RegistradoPorMembroId: null, Responsavel: "Maria Souza" }]
    ]);
    const d = await db.dadosDoTitular(pool, 40);
    expect(d.comoResponsavel).toHaveLength(2);
    expect(d.comoResponsavel[0]).toMatchObject({ menor: "Caio Souza", finalidade: mc.FINALIDADES.IMAGEM, situacao: "Autorizou", enderecoIp: IP, cadeiaCabecalhos: CADEIA, registradaPelaSecretaria: false, textoHash: HASH("IMAGEM") });
    expect(d.comoResponsavel[1]).toMatchObject({ situacao: "Revogou", forma: mc.FORMAS.FICHA_FISICA, referencia: "Ficha 3", registradaPelaSecretaria: true, enderecoIp: null });
    expect(d.comoMenor).toHaveLength(1);
    expect(d.comoMenor[0]).toMatchObject({ responsavel: "Maria Souza", situacao: "Autorizou" });
    expect(d.comoMenor[0].enderecoIp).toBeUndefined();
    expect(d.comoMenor[0].cadeiaCabecalhos).toBeUndefined();
    expect(JSON.stringify(d.comoMenor)).not.toMatch(/177\.8|forwarded/);
    expect(JSON.stringify(d)).not.toMatch(/RegistradoPorMembroId|"registradoPor"/);
    expect(d.aviso).toMatch(/Encarregado de Dados/);
  });
  test("quem não tem nada recebe listas vazias (e o aviso)", async () => {
    const { pool, chamadas } = criarPoolFalso([[], []]);
    const d = await db.dadosDoTitular(pool, 99);
    expect(d).toMatchObject({ comoResponsavel: [], comoMenor: [] });
    expect(chamadas.every((c) => c.inputs.m === 99)).toBe(true);
  });
});

describe("alinhamento com o esquema da migração 143 (o código e o banco não se afastam sem alguém notar)", () => {
  const sqlMigracao = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "143_ministerio_menores.sql"), "utf8");
  const bloco = sqlMigracao.slice(sqlMigracao.indexOf("CREATE TABLE dbo.MinisterioMenoresConsentimentos"), sqlMigracao.indexOf("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MenoresConsent_Menor'"));
  const colunas = [...bloco.matchAll(/^\s{8}(\w+)\s+(?:INT|NVARCHAR|BIT|DATETIME2)/gm)].map((m) => m[1]);

  test("as colunas, as finalidades e as formas da migração são as que o código usa", () => {
    expect(colunas).toEqual(["ConsentimentoId", "MenorMembroId", "ResponsavelMembroId", "Finalidade", "Concedido", "TextoVersao", "TextoHash", "Forma", "RegistradoEm", "EnderecoIp", "CadeiaCabecalhos", "Referencia", "RegistradoPorMembroId"]);
    const lista = (campo) => [...bloco.match(new RegExp(`${campo} IN \\(([^)]*)\\)`))[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(lista("Finalidade")).toEqual(mc.CODIGOS_FINALIDADE);
    expect(lista("Forma")).toEqual(Object.keys(mc.FORMAS));
  });
  test("o INSERT e as leituras só citam colunas que existem; a anonimização só toca as duas colunas que o gatilho admite", async () => {
    const { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [pessoa(40)], [{ id: 1 }]]);
    await db.conceder(pool, CONCEDE);
    const ins = insercao(chamadas).sql;
    const colsInsert = ins.match(/INSERT INTO MinisterioMenoresConsentimentos \(([^)]*)\)/)[1].split(",").map((s) => s.trim());
    expect(colsInsert.length).toBe(11);
    for (const c of colsInsert) expect(colunas).toContain(c);
    const { pool: p2, chamadas: c2 } = criarPoolFalso([[pessoa(30)], [], [ativoBD(40)]]);
    await db.estadoDoMenor(p2, 30, { hoje: HOJE });
    for (const c of ["ConsentimentoId", "MenorMembroId", "ResponsavelMembroId", "Finalidade", "Concedido", "TextoVersao", "TextoHash", "Forma", "RegistradoEm", "Referencia"]) expect(colunas).toContain(c);
    expect(c2.some((c) => /FROM MinisterioMenoresConsentimentos c\s+WHERE c\.MenorMembroId IN/.test(c.sql))).toBe(true);
    // O gatilho TR_MenoresConsent_Imutavel só admite IP virando 'anonimizado' e cabeçalhos virando nulos.
    expect(sqlMigracao).toMatch(/i\.EnderecoIp = N''anonimizado'' AND d\.EnderecoIp IS NOT NULL/);
    expect(sqlMigracao).toMatch(/i\.CadeiaCabecalhos IS NOT NULL/);
  });
  test("CHECKs da migração: clique exige IP e ninguém que registre; ficha exige referência e quem registra ≠ responsável — o código grava exatamente assim", async () => {
    expect(sqlMigracao).toMatch(/Forma <> 'CLICK_RESP' OR \(EnderecoIp IS NOT NULL AND RegistradoPorMembroId IS NULL\)/);
    expect(sqlMigracao).toMatch(/Forma <> 'FICHA_FISICA' OR \(Referencia IS NOT NULL AND RegistradoPorMembroId IS NOT NULL AND RegistradoPorMembroId <> ResponsavelMembroId\)/);
    let { pool, chamadas } = criarPoolFalso([[], [ativoBD(40)], [pessoa(30)], [{ id: 1 }], []]);
    await db.revogar(pool, { menorId: 30, responsavelId: 40, finalidade: "SAUDE_CRACHA", ip: null, hoje: HOJE });
    expect(insercao(chamadas).inputs).toMatchObject({ forma: "CLICK_RESP", por: null });
    expect(insercao(chamadas).inputs.ip).toBeTruthy();                        // revogar sem IP usa o marcador: o CHECK do clique exige valor
    ({ pool, chamadas } = criarPoolFalso([[pessoa(30)], [], [ativoBD(40)], [{ id: 1 }]]));
    await db.registrarManual(pool, { menorId: 30, responsavelId: 40, finalidade: "IMAGEM", concedido: true, referencia: "Ficha 1", por: 5, autorizacao: { podeMembro: () => true }, hoje: HOJE });
    const { forma, ref, por, rs } = insercao(chamadas).inputs;
    expect(forma).toBe("FICHA_FISICA");
    expect(ref).toBeTruthy();
    expect(por).toBeTruthy();
    expect(por).not.toBe(rs);
  });
});
