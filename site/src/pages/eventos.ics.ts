import { siteConfig } from "@/config/site";
import {
  descricaoComParticipacao,
  fetchAgendaOficial,
  mesclarEventos,
  uidAgenda,
  type EventoSite,
} from "@/lib/agendaOficial";
import { fetchItems } from "@/lib/directus";
import { hasEventPage } from "@/lib/eventos";
import { buildIcs } from "@/lib/ics";

export async function GET() {
  const [eventosDirectus, agenda] = await Promise.all([
    fetchItems<EventoSite>("eventos"),
    fetchAgendaOficial(),
  ]);
  // Calendário oficial (sistema de governança) + eventos do Directus.
  const events = mesclarEventos(eventosDirectus, agenda);
  const ics = buildIcs(
    events
      .filter((event) => event.event_date)
      .map((event) => ({
        // UID estável: quem assina a agenda não recebe duplicata a cada build.
        // Evento oficial sem página própria → `agenda-<id>`; evento do Directus
        // (inclusive o que ganhou data oficial via slugSite) mantém `evento-<slug>`.
        uid:
          event.agendaId != null
            ? uidAgenda(event.agendaId)
            : `evento-${event.slug}@ieadespa.org.br`,
        title: event.title,
        // Com convidados autorizados, acrescenta a linha "Participação: ..." (v7.4).
        description: descricaoComParticipacao(event.description, event.convidados),
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
