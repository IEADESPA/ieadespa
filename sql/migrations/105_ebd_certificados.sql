-- ============================================================
-- Migração 105 — v6.5: Certificados + página imprimível
--
-- Fecha a FASE 6 (EBD) com a versão mais simples do capítulo: uma única
-- tabela, sem motor novo. Segue o mesmo par "PDF de verdade (pdfkit,
-- servidor) + página imprimível (window.print(), navegador)" já usado em
-- CartasTransito/vB.6 (`api/CartaPdf` + `app/script.js::imprimirCarta`) e
-- em ApresentacoesCrianca/vB.12 (`api/ApresentacaoCriancaPdf`) — nenhuma
-- lib nova (jsPDF é do `site/`, cliente; aqui é pdfkit, servidor, mesmo
-- shared/pdfInstitucional.js dos dois exemplos acima).
--
-- Decisão de escopo (o item do checklist é 1 linha só, então é chamada de
-- projeto, documentada aqui e no README): "emissão de certificados" é
-- deliberadamente GENÉRICA, não amarrada só à EBD — quem emite escolhe um
-- MembroId + um Título/Motivo livre (o caso geral: qualquer motivo vira
-- certificado, ex: "Conclusão do Curso de Obreiros", "Participação no
-- Seminário X"). `ConquistaId` é um vínculo OPCIONAL de conveniência com o
-- motor de conquistas do v6.4 (`CatalogoConquistas`) — pré-preenche
-- título/descrição a partir de uma conquista que o Membro já desbloqueou
-- (ex: "Trimestre Perfeito"), mas nunca é obrigatório: um certificado por
-- qualquer outro motivo não passa pelo motor de conquistas. Essa é a mesma
-- razão de `shared/protocolo.js`/`shared/estatuto.js` serem primitivas
-- reaproveitáveis por módulos que nem existem ainda — aqui, um futuro
-- módulo fora da EBD também pode emitir certificado pela mesma tabela,
-- sem precisar de nenhuma mudança de schema.
--
-- Sem lifecycle de rascunho (SOLICITADA/CONFIRMADA/EMITIDA como em
-- CartasTransito): emitir um certificado JÁ é o evento real (não existe
-- "certificado pendente"), então o protocolo institucional único
-- (shared/protocolo.js, tipo 'CERT') é gerado no INSERT, não sob demanda
-- no primeiro PDF — aqui a emissão em si é o "primeiro PDF" conceitual,
-- não uma tela solicitando algo que ainda pode ser cancelado antes de
-- existir de verdade.
--
-- Permissão: "ebd_gestao" (v6.1) — mesma permissão que fecha o resto da
-- FASE 6 (turmas, chamada, lições/atividades). Não é autoatendimento (o
-- próprio Membro não emite certificado pra si), mas é self-service pra
-- CONSULTA/download/impressão do que já foi emitido em seu nome, mesmo
-- espírito de CartaPdf (só a própria matrícula baixa o próprio PDF).
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF OBJECT_ID(N'dbo.CertificadosEmitidos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CertificadosEmitidos (
        CertificadoId       INT IDENTITY PRIMARY KEY,
        MembroId            INT NOT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Titulo              NVARCHAR(150) NOT NULL,
        Descricao           NVARCHAR(600) NULL,       -- motivo/texto livre do certificado
        ConquistaId         INT NULL REFERENCES dbo.CatalogoConquistas(ConquistaId), -- vínculo OPCIONAL com v6.4 (atalho de conveniência, nunca obrigatório)
        EmitidoPorMembroId  INT NULL REFERENCES dbo.MembroReferencia(MembroId),
        Protocolo           NVARCHAR(30) NOT NULL,
        DataEmissao         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CertificadosEmitidos_Membro ON dbo.CertificadosEmitidos (MembroId, DataEmissao DESC);
END
GO
