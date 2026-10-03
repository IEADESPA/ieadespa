import { fetchAgendaOficial } from "@/lib/agendaOficial";

/**
 * Versão da agenda oficial que este build do site mostra (hash de 16 hex que o
 * sistema calcula sobre o que o site exibe; "indisponivel" quando a agenda não
 * carregou no build). O sincronizador (.github/workflows/site-agenda-sync.yml)
 * compara este valor com `GET /api/agenda-publica/versao` do sistema e só
 * dispara um novo deploy quando mudam — sem rebuild à toa a cada 20 minutos.
 */
export async function GET() {
  const agenda = await fetchAgendaOficial();
  return new Response(JSON.stringify({ versao: agenda.versao }), {
    headers: { "Content-Type": "application/json" },
  });
}
