/**
 * Aviso contra golpe (v7.13, pedido do responsável em 22/10/2026). Aparece, sempre igual, em toda tela do site onde se fala de
 * pagamento: formulário e confirmação de inscrição em evento com valor, página "Informar pagamento", Minha Conta → Meus eventos,
 * pedido de camiseta e "Meus pedidos de camiseta". Um texto só (esta constante) para nunca sair diferente de uma página para outra.
 * O componente `src/components/AvisoGolpe.astro` desenha o aviso; o teste `scripts/testes/pagamento-unidade.cjs` confere que as
 * páginas o usam. O pagamento continua só INFORMADO (sem pagamento online).
 */
export const AVISO_GOLPE_TITULO = "Cuidado com golpe";

export const AVISO_GOLPE =
  "A Igreja NÃO entra em contato com ninguém por mensagem, telefone ou e-mail pedindo pagamento ou Pix. Pague só pelos dados mostrados aqui no site e, se receber um pedido assim, desconfie e avise a Secretaria.";
