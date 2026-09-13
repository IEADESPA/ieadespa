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

export async function GET() {
  const events = await fetchItems<Evento>("eventos");
  const ics = buildIcs(
    events
      .filter((event) => event.event_date)
      .map((event) => ({
        uid: `evento-${event.slug}@ieadespa.org.br`,
        title: event.title,
        description: event.description,
        location: event.location ?? undefined,
        date: event.event_date as string,
        endDate: event.end_date,
        time: event.time,
        url: hasEventPage(event) ? `${siteConfig.siteUrl}/evento/${event.slug}/` : undefined,
      })),
    `Eventos — ${siteConfig.name}`,
  );

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="eventos-ieadespa.ics"',
    },
  });
}
