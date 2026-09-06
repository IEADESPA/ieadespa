-- ============================================================
-- Migração 029 — Medidas Cautelares de Proteção Patrimonial (v2.6, Art. 45).
--
-- Só a parte que o sistema consegue de fato registrar/executar: a decisão
-- em si (sempre registrada) e a suspensão do próprio acesso ao sistema
-- (SuspenderAcessoSistema — a única das 3 restrições do §1º que este
-- sistema controla). Contas bancárias e chaves físicas (SuspensaoContas
-- Bancarias/SuspensaoChavesFisicas) ficam só como registro histórico da
-- decisão, não uma ação automática — o sistema não tem como mexer em banco
-- nem em fechadura.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.MedidasCautelares') AND type = N'U')
BEGIN
    CREATE TABLE dbo.MedidasCautelares (
        MedidaId                  INT IDENTITY PRIMARY KEY,
        MembroId                  INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Motivo                    NVARCHAR(1000) NOT NULL,
        SuspenderAcessoSistema    BIT NOT NULL DEFAULT 0,
        SuspensaoContasBancarias  BIT NOT NULL DEFAULT 0,
        SuspensaoChavesFisicas    BIT NOT NULL DEFAULT 0,
        DataAplicacao             DATE NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        DataConclusaoRelatorio    DATE NULL,
        AplicadoPor               INT NULL REFERENCES dbo.MembroReferencia(MembroId)
    );
END
GO
