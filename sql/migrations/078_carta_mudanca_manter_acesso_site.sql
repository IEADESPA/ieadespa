-- ============================================================
-- Migração 078 — Carta de Mudança: opção de manter acesso ao site (vC.3)
-- Quando o próprio membro confirma a Carta de Mudança (Reg. Art. 131 §3º,
-- II), a minimização de 30 dias (Reg. Art. 132 §2º, ver api/GestaoCartas)
-- zera o e-mail dele em MembroReferencia — o que, sem alternativa, também
-- cortaria de vez o acesso dele a qualquer conta que já tivesse no site
-- institucional (Minha Conta, e-mail + código, independente deste sistema).
-- ManterAcessoSite registra a escolha do próprio membro no momento da
-- confirmação: se true, api/SolicitarCarta garante uma conta no site pra
-- aquele e-mail antes da minimização rodar — só o e-mail (dado essencial
-- da conta do site), nada mais é copiado pra lá.
--
-- Idempotente: seguro para reexecutar sem apagar dados.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.CartasTransito') AND name = N'ManterAcessoSite')
    ALTER TABLE dbo.CartasTransito ADD ManterAcessoSite BIT NULL;
GO
