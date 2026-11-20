-- ============================================================
-- Migração 181 — ONDE A PESSOA SERVE (FASE 10, v10.1b, as sobras de Membros, 19/11/2026)
--
-- O desenho aprovado do cadastro (rodada 8, opção 3) pergunta "Serve em algum ministério? (opcional)", e a ficha 360 tem "Onde serve" em Ministérios e EBD.
-- A regra do responsável (13/11/2026): um DEPARTAMENTO por pessoa, pela idade, separado das secretarias e dos ministérios onde ela serve. O catálogo dos
-- ministérios é o mesmo dos departamentos (Departamentos), com o Tipo diferente de DEPARTAMENTO (as secretarias adjuntas e os ministérios que a Secretaria
-- Geral cadastra) — nada de catálogo novo.
--
-- O que nasce aqui:
--  - MembrosMinisterios: em que ministério a pessoa serve, desde quando, e quando deixou de servir (nada se apaga: encerrar guarda a data). Um registro
--    em aberto por pessoa e ministério (o índice único filtrado). Não é escala nem voluntariado: estar aqui não põe ninguém numa escala nem dispensa o termo
--    de adesão do voluntariado (Regimento Art. 133 §8º), que continuam pelo caminho deles.
-- Quem registrou e quem encerrou ficam sem chave estrangeira: é registro histórico.
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.MembrosMinisterios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MembrosMinisterios (
        MembroMinisterioId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MembrosMinisterios PRIMARY KEY,
        MembroId            INT NOT NULL CONSTRAINT FK_MembrosMinisterios_Membro REFERENCES dbo.MembroReferencia(MembroId),
        DepartamentoId      INT NOT NULL CONSTRAINT FK_MembrosMinisterios_Departamento REFERENCES dbo.Departamentos(DepartamentoId),
        Desde               DATE NULL,
        RegistradoEm        DATETIME2(0) NOT NULL CONSTRAINT DF_MembrosMinisterios_Em DEFAULT SYSUTCDATETIME(),
        RegistradoPor       INT NULL,
        EncerradoEm         DATETIME2(0) NULL,
        EncerradoPor        INT NULL
    );
END
GO

-- um registro em aberto por pessoa e ministério (registrar de novo não duplica)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_MembrosMinisterios_Aberto' AND object_id = OBJECT_ID(N'dbo.MembrosMinisterios'))
    CREATE UNIQUE INDEX UX_MembrosMinisterios_Aberto ON dbo.MembrosMinisterios (MembroId, DepartamentoId) WHERE EncerradoEm IS NULL;
GO
