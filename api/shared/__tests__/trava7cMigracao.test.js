// O texto da migração 154 (Trava de Revisão 7-C): idempotente, os gatilhos no molde que já pagou o preço, o CHECK do motivo ampliado sem tirar nenhum valor, os limites das
// colunas. A prova contra o banco de verdade está em tools/e2e-localdb/e2e-40 a e2e-42 (a 154 aplicada duas vezes: `bash rodar.sh preparar-7c`).
const fs = require("fs");
const path = require("path");
const TEXTO = fs.readFileSync(path.join(__dirname, "..", "..", "..", "sql", "migrations", "154_trava_7c_costuras.sql"), "utf8");
const lotes = TEXTO.split(/^\s*GO\s*$/gim).map((t) => t.trim()).filter(Boolean);

describe("migração 154", () => {
  test("a regra nova de aviso só entra se não existe, obrigatória e com o título no limite da coluna", () => {
    expect(TEXTO).toMatch(/IF NOT EXISTS \(SELECT 1 FROM dbo\.NotificacaoRegras WHERE Chave = N'CUIDADO_RISCO_CRIANCA'\)/);
    const titulo = TEXTO.match(/VALUES \(N'CUIDADO_RISCO_CRIANCA', N'([^']+)'/)[1];
    expect(titulo.length).toBeLessThanOrEqual(150);
    expect(TEXTO).toMatch(/N'CUIDADO_RISCO_CRIANCA', N'[^']+', N'CUIDADO', NULL, NULL, 1, 1, 1\)/);
  });
  test("o motivo AFASTADO entra no CHECK sem tirar nenhum dos de antes, e só se ainda não entrou", () => {
    expect(TEXTO).toMatch(/WHERE name = N'CK_SegurancaEquipe_Motivo' AND definition NOT LIKE N'%AFASTADO%'\)\s+ALTER TABLE dbo\.SegurancaEquipe DROP CONSTRAINT CK_SegurancaEquipe_Motivo/);
    for (const v of ["MANUAL", "SAIU_DA_CONGREGACAO", "DESLIGADO", "PRAZO", "EXCLUSAO_LGPD", "AFASTADO"]) expect(TEXTO).toMatch(new RegExp(`N'${v}'`));
  });
  test("a coluna nova só se cria se não existe; a política de retenção cabe na coluna (60) e a base legal em 300", () => {
    expect(TEXTO).toMatch(/IF COL_LENGTH\(N'dbo\.SegurancaPlanos', N'AnonimizadoEm'\) IS NULL\s+ALTER TABLE dbo\.SegurancaPlanos ADD AnonimizadoEm DATETIME2 NULL/);
    const cat = TEXTO.match(/WHERE Categoria = N'([^']+)'\)\s+INSERT INTO dbo\.PoliticasRetencao/)[1];
    expect(cat.length).toBeLessThanOrEqual(60);
    const base = TEXTO.match(/VALUES \(N'Plano de emergência — contatos das versões antigas', N'([^']+)', 1825\)/)[1];
    expect(base.length).toBeLessThanOrEqual(300);
  });
  test("os gatilhos: CREATE OR ALTER; o do plano trata o UPDATE que não alcança linha e só aceita a anonimização com a marca, numa versão substituída", () => {
    const plano = lotes.find((l) => l.includes("TRIGGER dbo.TR_SegurancaPlanos_Imutavel"));
    expect(plano).toMatch(/CREATE OR ALTER TRIGGER/);
    expect(plano).toMatch(/IF NOT EXISTS \(SELECT 1 FROM inserted\)\s+BEGIN\s+IF EXISTS \(SELECT 1 FROM deleted\)/);
    expect(plano).toMatch(/SESSION_CONTEXT\(N''seguranca_purga''\) AS INT\), 0\) <> 1/);
    expect(plano).toMatch(/x\.Versao > i\.Versao/);
    const cons = lotes.find((l) => l.includes("TRIGGER dbo.TR_ComunicacaoConsentimentos_Imutavel"));
    expect(cons).toMatch(/CREATE OR ALTER TRIGGER/);
    expect(cons).toMatch(/SESSION_CONTEXT\(N''comunicacao_purga''\) AS INT\), 0\) <> 1/);
    expect(cons).toMatch(/ISNULL\(i\.EnderecoIp, N''''\) <> N''anonimizado''/);
    expect(cons).toMatch(/RAISERROR\(N''O histórico de consentimento só sai pela exclusão LGPD\.''/);
  });
});
