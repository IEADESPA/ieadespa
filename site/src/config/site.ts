import { DIRECTUS_ADMIN_URL } from "@/lib/directus";

export const siteConfig = {
  /** Nome curto exibido no cabeçalho e rodapé. */
  name: "IEADESPA",
  /** Nome oficial completo, usado em textos institucionais e SEO. */
  fullName: "Igreja Evangélica Assembleia de Deus Ministério do Seta em Parauapebas/PA",
  tagline: "Um lugar de fé, família e esperança",
  title: "IEADESPA — Assembleia de Deus Ministério do Seta em Parauapebas/PA",
  description:
    "Site oficial da IEADESPA, Igreja Evangélica Assembleia de Deus Ministério do Seta, em Parauapebas/PA. Confira horários de culto, ministérios, eventos, mensagens e como chegar.",
  siteUrl: "https://www.ieadespa.org.br",
  authorName: "IEADESPA",
  email: "seta@ieadespa.org",
  /** Mesmo CNPJ usado como chave Pix em /doacoes/ — centralizado aqui pra
   * também aparecer em /transparencia/, sem duplicar o literal. */
  cnpj: "10.743.586/0001-38",
  /** Código de verificação do Google Search Console (Configurações → Propriedade →
   * Verificação → método "Tag HTML"). Vazio por padrão — preencher só depois de
   * criar a propriedade gratuita em search.google.com/search-console, sem precisar
   * de deploy nenhum além de colar o código aqui. */
  googleSiteVerification: "",
  /**
   * Fase 24 — chave de Maps Embed API/Maps JavaScript API, restrita por
   * referenciador HTTP só a ieadespa.org.br/www.ieadespa.org.br e às duas
   * APIs (ver README). Não é segredo crítico — é usada no navegador do
   * visitante por natureza — mas a restrição de domínio é o que impede
   * outro site de usar a mesma chave e gastar a cota da igreja.
   */
  googleMapsEmbedKey: "AIzaSyD399wNWdUa2favTGgXwbAo70fNUhugU-8",
  language: "pt-BR",
  dateLocale: "pt-BR",
  locale: "pt_BR",
  socialImage: "/og-image.png",
  /**
   * Frase de destaque, resumo, texto completo do "Sobre", endereço e
   * horários de culto NÃO ficam mais aqui — são editáveis em Directus →
   * Configurações do Site (coleção singleton "configuracoes"). Ver
   * src/lib/directus.ts (fetchConfiguracoes).
   */
  /**
   * Envia direto para o Directus (coleção "contato_mensagens" — ver
   * `fetch()` em src/pages/contato.astro). `enabled: false` desativa o
   * controle. Não há newsletter por e-mail: avisos e novidades vão na
   * coleção "noticias" (páginas /noticias/), sem depender de um provedor de
   * envio de e-mail em massa.
   */
  contact: {
    enabled: true,
    responseTime: "Normalmente respondemos em até dois dias úteis.",
  },
  /** Só entram aqui redes que a igreja realmente usa — não deixe link de rede que não existe ainda. */
  socials: [
    { label: "Instagram", href: "https://instagram.com/adseta.parauapebas" },
    { label: "YouTube", href: "https://www.youtube.com/channel/UCt-reZ0YGpGsmDwr5mkxPHQ" },
    { label: "RSS", href: "/rss.xml" },
  ],
  /** URL fixa do YouTube: mostra o vídeo ao vivo automaticamente se houver
   * uma transmissão rolando, ou a página do canal caso contrário — sem
   * precisar de nenhuma checagem programática. */
  youtubeLiveUrl: "https://www.youtube.com/channel/UCt-reZ0YGpGsmDwr5mkxPHQ/live",
};

/** Navegação do cabeçalho. Adicione ou remova itens livremente; o cabeçalho os renderiza em ordem. */
export const navigation = [
  { label: "Início", href: "/" },
  { label: "Sobre", href: "/sobre/" },
  { label: "Crenças", href: "/crencas/" },
  { label: "Nossa História", href: "/historia/" },
  { label: "Notícias", href: "/noticias/" },
  { label: "Órgãos", href: "/orgaos/" },
  { label: "Congregações", href: "/congregacoes/" },
  { label: "Eventos", href: "/eventos/" },
  { label: "Mensagens", href: "/mensagens/" },
  { label: "Contato", href: "/contato/" },
];

/**
 * Navegação secundária exibida no rodapé, agrupada por assunto (Fase 11) em
 * vez de uma lista única — à medida que a Fase 5 adicionar mais páginas, o
 * grupo certo cresce sem virar uma parede de links sem hierarquia nenhuma.
 * Adicione um item ao grupo existente que fizer mais sentido; só crie um
 * grupo novo se nenhum dos três já cobrir o assunto.
 */
export const footerNavigation = [
  {
    label: "Participe",
    items: [
      { label: "Doações", href: "/doacoes/" },
      { label: "Kids", href: "/kids/" },
      { label: "Assista ao vivo", href: "/ao-vivo/" },
      { label: "Galeria", href: "/galeria/" },
      { label: "Camisetas e uniformes", href: "/camisetas/" },
      { label: "Enquetes", href: "/enquetes/" },
      { label: "Minha conta", href: "/minha-conta/" },
    ],
  },
  {
    label: "Institucional",
    items: [
      { label: "Dúvidas frequentes", href: "/duvidas-frequentes/" },
      { label: "Transparência", href: "/transparencia/" },
      { label: "Pregadores", href: "/pregadores/" },
      { label: "Privacidade", href: "/privacidade/" },
    ],
  },
  {
    label: "Equipe",
    items: [
      { label: "Painel de conteúdo", href: DIRECTUS_ADMIN_URL },
      { label: "Gestão de eventos", href: "/painel-eventos/" },
      { label: "Gestão de camisetas", href: "/painel-camisetas/" },
    ],
  },
];
