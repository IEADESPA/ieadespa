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
});
