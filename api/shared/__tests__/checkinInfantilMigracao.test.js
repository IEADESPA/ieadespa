// Contrato da migração 145 (check-in infantil) no TEXTO: o que a prova no SQL Server de verdade (tools/e2e-localdb, e2e-18 a e2e-22) achou e a migração passou a garantir.
// O comportamento do banco (índice recusando, gatilho barrando) é provado nos roteiros ponta a ponta; aqui fica a trava que reprova se alguém tirar a garantia do arquivo.
const fs = require("fs");
const path = require("path");

const SQL = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "145_checkin_infantil.sql"), "utf8");
const norm = (s) => s.replace(/\s+/g, " ").replace(/\(\s/g, "(").replace(/\s\)/g, ")").trim();
const SEM_COMENTARIOS = SQL.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
const TEXTO = norm(SEM_COMENTARIOS);

describe("migração 145: garantias que a prova no banco real exigiu", () => {
  test("o mesmo visitante (nome e nascimento) não tem dois registros abertos no mesmo serviço (índice único filtrado, criado só se não existir)", () => {
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM sys\.indexes WHERE name = N'UX_CheckinReg_VisitanteEmSala' AND object_id = OBJECT_ID\(N'dbo\.CheckinInfantilRegistros'\)\) CREATE UNIQUE INDEX UX_CheckinReg_VisitanteEmSala ON dbo\.CheckinInfantilRegistros \(ServicoId, VisitanteNome, VisitanteNascimento\) WHERE MenorMembroId IS NULL AND Situacao <> 'RETIRADA'/);
  });
  test("a criança membro só está numa sala por vez e o voluntário só está numa sala por serviço (os dois outros índices únicos continuam)", () => {
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CheckinReg_MenorEmSala ON dbo\.CheckinInfantilRegistros \(MenorMembroId\) WHERE MenorMembroId IS NOT NULL AND Situacao <> 'RETIRADA'/);
    expect(TEXTO).toMatch(/CREATE UNIQUE INDEX UX_CheckinVol_UmaSala ON dbo\.CheckinInfantilVoluntarios \(ServicoId, MembroId\) WHERE SaiuEm IS NULL/);
  });
  // Achado na prova no banco real (e2e-19): o gatilho dispara também quando o UPDATE não alcança linha nenhuma (inserted e deleted vazios). "inserted vazio" NÃO é "DELETE": tratar assim
  // derrubava com "não se apaga" a retirada que perde a corrida, o destravar de quem não está travado, o apagar da saúde sem nada a apagar e a retenção diária sem nada a fazer.
  test("o gatilho do registro só barra DELETE quando há linha em 'deleted' (UPDATE que não casa com nenhuma linha passa)", () => {
    const gatilho = TEXTO.slice(TEXTO.indexOf("TR_CheckinRegistros_Protegido"), TEXTO.indexOf("TR_CheckinEventos_Imutavel"));
    expect(gatilho.length).toBeGreaterThan(200);
    expect(gatilho).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\) BEGIN IF EXISTS \(SELECT 1 FROM deleted\) BEGIN RAISERROR\(N''O registro de check-in infantil é prova de custódia: não se apaga\.'', 16, 1\); ROLLBACK TRANSACTION; END RETURN; END/);
    expect(gatilho).not.toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\) BEGIN RAISERROR/);
  });
  test("o gatilho deixa a anonimização tirar as três matrículas (criança, quem trouxe, quem retirou) e só ela; trocar por outra matrícula continua proibido", () => {
    const gatilho = TEXTO.slice(TEXTO.indexOf("TR_CheckinRegistros_Protegido"), TEXTO.indexOf("TR_CheckinEventos_Imutavel"));
    for (const col of ["MenorMembroId", "TrouxeMembroId", "RetiradoMembroId"]) {
      expect(gatilho).toContain(`(ISNULL(i.${col}, -1) <> ISNULL(d.${col}, -1) AND NOT (i.AnonimizadoEm IS NOT NULL AND i.${col} IS NULL))`);
    }
  });
  test("o CHECK da saúde exige a origem (num CHECK, 'desconhecido' passa) e o texto antigo é trocado ao reaplicar", () => {
    expect(TEXTO).toMatch(/SaudeTexto IS NOT NULL AND SaudeOrigem IS NOT NULL AND SaudeOrigem = 'CADASTRO'/);
    expect(TEXTO).toMatch(/definition NOT LIKE N'%SaudeOrigem\] IS NOT NULL%'/);
  });
  // ---- Revisão adversarial da v7.10 (a migração ainda não foi para produção: as mudanças entraram neste mesmo arquivo, e quem aplicou a versão anterior recebe o que falta) ----
  test("a baixa administrativa: RetiradoTipo = 'BAIXA_ADM' cabe na coluna (NVARCHAR(12)), o CHECK do tipo a aceita e o do estado só a aceita COM o motivo (ou anonimizada)", () => {
    expect("BAIXA_ADM".length).toBeLessThanOrEqual(12);                                    // o 'ADMINISTRATIVA' da primeira ideia (14) estourava a coluna: "String or binary data would be truncated"
    expect(TEXTO).toMatch(/RetiradoTipo NVARCHAR\(12\) NULL CONSTRAINT CK_CheckinReg_RetTipo CHECK \(RetiradoTipo IS NULL OR RetiradoTipo IN \('RESPONSAVEL','AUTORIZADO','TROUXE','OUTRO','BAIXA_ADM'\)\)/);
    expect(TEXTO).toMatch(/AND \(RetiradoMembroId IS NOT NULL OR RetiradoNome IS NOT NULL OR AnonimizadoEm IS NOT NULL OR \(RetiradoTipo = 'BAIXA_ADM' AND BaixaMotivo IS NOT NULL\)\)/);
    expect(TEXTO).toMatch(/DivergenciaPedidoMotivo NVARCHAR\(300\) NULL, BaixaMotivo NVARCHAR\(300\) NULL/);
  });
  test("quem já aplicou a versão anterior recebe as colunas e as regras CHECK novas (idempotente): colunas em lotes SEPARADOS dos CHECK que as usam", () => {
    for (const col of ["DivergenciaPedidoMotivo", "BaixaMotivo"]) expect(TEXTO).toContain(`IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CheckinInfantilRegistros') AND name = N'${col}') ALTER TABLE dbo.CheckinInfantilRegistros ADD ${col} NVARCHAR(300) NULL;`);
    expect(TEXTO).toMatch(/CK_CheckinReg_RetTipo' AND parent_object_id = OBJECT_ID\(N'dbo\.CheckinInfantilRegistros'\) AND definition NOT LIKE N'%BAIXA_ADM%'\) BEGIN ALTER TABLE dbo\.CheckinInfantilRegistros DROP CONSTRAINT CK_CheckinReg_RetTipo;/);
    expect(TEXTO).toMatch(/CK_CheckinReg_Estado' AND parent_object_id = OBJECT_ID\(N'dbo\.CheckinInfantilRegistros'\) AND definition NOT LIKE N'%BAIXA_ADM%'\) BEGIN ALTER TABLE dbo\.CheckinInfantilRegistros DROP CONSTRAINT CK_CheckinReg_Estado;/);
    expect(TEXTO).toMatch(/CK_CheckinEv_Tipo' AND parent_object_id = OBJECT_ID\(N'dbo\.CheckinInfantilEventos'\) AND definition NOT LIKE N'%SALA_ENCERRADA%'\) BEGIN ALTER TABLE dbo\.CheckinInfantilEventos DROP CONSTRAINT CK_CheckinEv_Tipo;/);
    // o lote da coluna termina em GO antes do CHECK que a usa (um CHECK com coluna que ainda não existe no lote não compila)
    const lotes = SQL.split(/^\s*GO\s*$/gim);
    const doLote = (trecho) => lotes.findIndex((l) => l.includes(trecho));
    expect(doLote("ADD BaixaMotivo NVARCHAR(300) NULL;")).toBeGreaterThanOrEqual(0);
    expect(doLote("ADD BaixaMotivo NVARCHAR(300) NULL;")).toBeLessThan(doLote("ADD CONSTRAINT CK_CheckinReg_Estado CHECK ("));
  });
  test("o gatilho do registro protege, depois da retirada, quem decidiu, quando e os três motivos; e o carimbo 'anonimizado' só vale se nome, telefone, nascimento, saúde e textos livres saíram de verdade", () => {
    const gatilho = TEXTO.slice(TEXTO.indexOf("TR_CheckinRegistros_Protegido"), TEXTO.indexOf("TR_CheckinEventos_Imutavel"));
    for (const col of ["DivergenciaDecididaPorId", "DivergenciaDecididaEm", "DivergenciaPedidaEm", "DivergenciaMotivo", "DivergenciaPedidoMotivo", "BaixaMotivo"]) expect(gatilho).toContain(`i.${col}`);
    for (const col of ["DivergenciaMotivo", "DivergenciaPedidoMotivo", "BaixaMotivo"]) expect(gatilho).toContain(`(ISNULL(i.${col}, N'''') <> ISNULL(d.${col}, N'''') AND NOT (i.AnonimizadoEm IS NOT NULL AND i.${col} IS NULL))`);
    expect(gatilho).toMatch(/OR \(i\.AnonimizadoEm IS NOT NULL AND \(i\.TrouxeNome IS NOT NULL OR i\.RetiradoNome IS NOT NULL OR i\.TrouxeContato IS NOT NULL OR i\.VisitanteNascimento IS NOT NULL OR i\.SaudeTexto IS NOT NULL OR i\.DivergenciaMotivo IS NOT NULL OR i\.DivergenciaPedidoMotivo IS NOT NULL OR i\.BaixaMotivo IS NOT NULL OR \(i\.VisitanteNome IS NOT NULL AND i\.VisitanteNome <> N''\(anonimizado\)''\)\)\)/);
  });
  test("os nomes indicados só para a visita também têm gatilho: não se apagam e só a anonimização (nome nulo) os altera", () => {
    const g = TEXTO.slice(TEXTO.indexOf("TR_CheckinAutorizadosVisita_Protegido"), TEXTO.indexOf("5) Saúde da criança membro"));
    expect(g).toContain("AFTER UPDATE, DELETE AS");
    expect(g).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\) BEGIN IF EXISTS \(SELECT 1 FROM deleted\) BEGIN RAISERROR\(N''Os autorizados só desta visita são registro de custódia: não se apagam\.''/);
    expect(g).toMatch(/i\.RegistroId <> d\.RegistroId OR i\.Parentesco <> d\.Parentesco OR \(i\.Nome IS NOT NULL AND ISNULL\(i\.Nome, N''''\) <> ISNULL\(d\.Nome, N''''\)\)/);
  });
  test("o aviso obrigatório das autorizações sem efeito existe (o destinatário não desliga)", () => {
    expect(TEXTO).toMatch(/Chave = N'CHECKIN_AUTORIZADOS_DEPENDENTES'\) INSERT INTO dbo\.NotificacaoRegras \(Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria\) VALUES \(N'CHECKIN_AUTORIZADOS_DEPENDENTES', N'[^']+', N'MENORES', NULL, NULL, 1, 1, 1\)/);
  });
  test("Trava 7-B: TODA regra de aviso da 145 é obrigatória e sai por e-mail E pelo celular (o sino sozinho não avisa a tempo)", () => {
    const regras = [...TEXTO.matchAll(/INSERT INTO dbo\.NotificacaoRegras \(([^)]*)\) VALUES \(N'([A-Z_]+)', N'[^']+', N'MENORES', NULL, NULL, ([^)]*)\)/g)];
    expect(regras.length).toBeGreaterThanOrEqual(10);
    for (const [, colunas, chave, valores] of regras) {
      expect([chave, colunas]).toEqual([chave, "Chave, Titulo, Categoria, PermissaoAlvo, NivelAlvo, CanalEmail, CanalPush, Obrigatoria"]);
      expect([chave, valores]).toEqual([chave, "1, 1, 1"]);
    }
  });
  test("o texto da base legal da retenção cabe na coluna (NVARCHAR(300)): um UPDATE maior que isso derruba a migração inteira", () => {
    const m = /SET BaseLegal = N'([^]*?)'\s+WHERE Categoria = N'Check-in infantil/.exec(SEM_COMENTARIOS);
    expect(m).not.toBeNull();
    expect(m[1].length).toBeLessThanOrEqual(300);
  });
  test("nenhuma aspa se perdeu dentro dos blocos EXEC (um 'N' solto, sem aspas, é o defeito que um script de edição já criou)", () => {
    expect(SQL).not.toMatch(/ISNULL\([^()]*, N\)/);
    // dentro de cada EXEC(N'...'), as aspas simples estão em número par
    const blocos = SQL.match(/EXEC\(N'[^]*?'\);/g) || [];
    expect(blocos.length).toBeGreaterThanOrEqual(5);
    for (const b of blocos) expect(((b.match(/'/g) || []).length) % 2).toBe(0);
  });
});
