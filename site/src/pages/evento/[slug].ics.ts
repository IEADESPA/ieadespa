import { siteConfig } from "@/config/site";
import { fetchItems } from "@/lib/directus";
import { hasEventPage } from "@/lib/eventos";
import { buildIcs } from "@/lib/ics";

interface Evento {
  slug: string;
  title: string;
  event_date: string | null;
  end_date: string | null;
  time: string | null;
  location: string | null;
  description: string;
  body: string | null;
  aceita_inscricao?: boolean;
}

export async function getStaticPaths() {
  const events = await fetchItems<Evento>("eventos");
  // slug é opcional no Directus — sem essa checagem, um evento com data mas
  // sem slug ainda definido quebraria o build inteiro (bug real encontrado
  // na Fase 24.5, corrigido aqui e em todo lugar que gera rota por slug).
  return events.filter((event) => event.slug && event.event_date).map((event) => ({ params: { slug: event.slug }, props: { event } }));
}

interface Props {
  event: Evento;
}

export async function GET({ props }: { props: Props }) {
  const { event } = props;
  const ics = buildIcs(
    [
      {
        uid: `evento-${event.slug}@ieadespa.org.br`,
        title: event.title,
        description: event.description,
        location: event.location ?? undefined,
        date: event.event_date as string,
        endDate: event.end_date,
        time: event.time,
        url: hasEventPage(event) ? `${siteConfig.siteUrl}/evento/${event.slug}/` : undefined,
      },
    ],
    event.title,
  );

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
    },
  });
}
