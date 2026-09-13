/** Gera arquivos .ics (padrão iCalendar, RFC 5545) — sem biblioteca externa. */

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** Data no formato "AAAA-MM-DD". */
  date: string;
  /** Último dia (inclusive) para eventos de vários dias — opcional. */
  endDate?: string | null;
  /** Horário livre tipo "19h30". Sem horário, o evento vira "dia inteiro". */
  time?: string | null;
  url?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Escapa vírgula, ponto-e-vírgula e quebra de linha conforme o padrão iCalendar. */
const escapeIcs = (value: string) => value.replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** "19h30" -> {hour: 19, minute: 30}. Retorna null se não bater com o padrão esperado. */
function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})h(\d{2})?$/i.exec(time.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2] ?? "0") };
}

/** Formata um evento (com horário) em UTC, convertendo de America/Sao_Paulo (UTC-3, sem horário de verão). */
function formatDateTimeUtc(date: string, hour: number, minute: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`;
}

function formatDateOnly(date: string, offsetDays = 0): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function eventLines(event: IcsEvent): string[] {
  const time = event.time ? parseTime(event.time) : null;
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `SUMMARY:${escapeIcs(event.title)}`];

  if (time) {
    lines.push(`DTSTART:${formatDateTimeUtc(event.date, time.hour, time.minute)}`);
    lines.push(`DTEND:${formatDateTimeUtc(event.date, time.hour + 2, time.minute)}`);
  } else if (event.endDate && event.endDate !== event.date) {
    // DTEND de dia inteiro é exclusivo no padrão iCalendar — por isso +1.
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(event.endDate, 1)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(event.date, 1)}`);
  }

  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(events: IcsEvent[], calendarName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IEADESPA//Site//PT-BR",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
