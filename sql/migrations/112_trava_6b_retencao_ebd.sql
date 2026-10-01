-- ============================================================
-- Migração 112 — Trava de Revisão 6-B: retenção LGPD da FASE 6
--
-- A EBD guarda dado de quem NÃO é membro — o aluno não-membro (v6.8: nome,
-- contato, nascimento, responsável) e o visitante da chamada (v6.2: nome e
-- contato) — e nada dizia por quanto tempo. A regra passa a existir em dois
-- lugares, como o resto do catálogo de retenção:
--   * aqui, em PoliticasRetencao (catálogo informativo, mostrado na aba
--     Proteção de Dados — mesmo espírito da migração 012);
--   * e de fato aplicada pela rotina diária da EBD
--     (api/EbdFechamentoAutomatico → shared/ebdLgpd.js::aplicarRetencaoEbd),
--     que ANONIMIZA (não apaga: a contagem da chamada e da caderneta continua
--     batendo).
-- Formação/certificado (v6.9) entra como retenção indeterminada, com a razão.
--
-- Idempotente: só insere a categoria que ainda não existe.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Visitantes da EBD (nome e contato)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Visitantes da EBD (nome e contato)',
        N'LGPD Art. 7º, IX (legítimo interesse — acolher e acompanhar quem visitou a classe). Após 12 meses nome e contato são anonimizados pela rotina diária da EBD; a visita continua contando na chamada. O Encarregado anonimiza antes, a pedido.',
        365
    );
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Alunos não-membros da EBD')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Alunos não-membros da EBD',
        N'LGPD Art. 7º, IX e Art. 14 (criança: com o nome do responsável). Mantidos enquanto a matrícula estiver ativa; 24 meses depois de encerrada, nome, contato, nascimento e responsável são anonimizados pela rotina diária da EBD. O Encarregado anonimiza antes, a pedido.',
        730
    );
GO

IF NOT EXISTS (SELECT 1 FROM dbo.PoliticasRetencao WHERE Categoria = N'Formação e certificados (trilhas)')
    INSERT INTO dbo.PoliticasRetencao (Categoria, BaseLegal, DiasRetencao)
    VALUES (
        N'Formação e certificados (trilhas)',
        N'LGPD Art. 11, II, "a" e Art. 7º, IX — prova da formação exigida pelos fluxos (consagração, liderança, escala) e verificável por terceiros pelo código impresso; retenção indeterminada enquanto o certificado puder ser apresentado. A verificação pública mostra só o que está impresso no papel.',
        NULL
    );
GO
