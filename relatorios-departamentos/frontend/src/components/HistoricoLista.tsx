import type { EventoHistorico } from "../domain/types";
import { ROTULO_PERFIL } from "../domain/permissoes";

export function HistoricoLista({ historico }: { historico: EventoHistorico[] }) {
  const ordenado = [...historico].sort((a, b) => b.ts - a.ts);
  return (
    <div className="card" style={{ padding: "0.9rem 1.1rem" }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {ordenado.map((evento, i) => (
          <li key={i} style={{ fontSize: "0.85rem", borderBottom: i < ordenado.length - 1 ? "1px solid var(--color-border)" : "none", paddingBottom: "0.5rem" }}>
            <div>
              <strong>{evento.usuarioNome}</strong>{" "}
              <span style={{ color: "var(--color-text-muted)" }}>({ROTULO_PERFIL[evento.papel]})</span> — {evento.acao}
            </div>
            {evento.detalhe && <div style={{ color: "var(--color-text-muted)", marginTop: "0.15rem" }}>"{evento.detalhe}"</div>}
            <div style={{ color: "var(--color-text-muted)", fontSize: "0.76rem", marginTop: "0.15rem" }}>
              {new Date(evento.ts).toLocaleString("pt-BR")}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
