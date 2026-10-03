/**
 * Temas das mensagens do site. Toda mensagem pertence a exatamente um destes,
 * então mantenha a lista curta. Renomeie ou substitua os itens aqui e depois
 * atualize o campo `category` no frontmatter de cada mensagem para que
 * corresponda; o build falha em caso de divergência.
 *
 * A ordem importa: é a ordem usada na página de temas e na barra lateral da
 * página inicial.
 */
export const categories = [
  "Fé e Doutrina",
  "Família",
  "Jovens",
  "Discipulado",
  "Louvor e Adoração",
  "Testemunhos",
  "Notícias e Avisos",
] as const;

export type Category = (typeof categories)[number];

export const categorySlug = (category: string) =>
  category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "e")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/** Uma linha por tema, exibida na página de arquivo e nas listagens. */
export const categoryDescriptions: Record<Category, string> = {
  "Fé e Doutrina": "Ensinos bíblicos, fundamentos da fé e estudos sobre a Palavra de Deus.",
  Família: "Mensagens sobre casamento, criação dos filhos e vida em família à luz da Bíblia.",
  Jovens: "Conteúdo voltado aos jovens da igreja: identidade, propósito e vida cristã.",
  Discipulado: "Crescimento espiritual, formação de discípulos e vida de oração.",
  "Louvor e Adoração": "Reflexões sobre adoração, música e a vida de louvor do crente.",
  Testemunhos: "Histórias reais de transformação e da fidelidade de Deus na vida da igreja.",
  "Notícias e Avisos": "Comunicados oficiais, avisos e notícias publicados pela secretaria.",
};
