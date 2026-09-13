/** Só o suficiente pra decidir se um evento tem página própria — cada
 * página que usa isso declara o resto dos campos que precisa. */
export interface EventoComPagina {
  slug: string;
  body: string | null;
  aceita_inscricao?: boolean;
}

/** Ganha página própria (`/evento/<slug>/`) quem tem texto (`body`) OU
 * aceita inscrição — este último precisa da página mesmo sem nenhum corpo
 * de texto, só pro formulário. Centralizado aqui porque a mesma decisão é
 * repetida em várias páginas (lista de eventos, busca, .ics). */
export const hasEventPage = (event: EventoComPagina) => Boolean(event.body || event.aceita_inscricao);

export const eventoHref = (event: EventoComPagina) => `/evento/${event.slug}/`;
