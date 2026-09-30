import type { StatusRelatorio } from "../domain/types";

const ROTULOS: Record<StatusRelatorio, string> = {
  rascunho: "Rascunho",
  enviado: "Aguardando área",
  aprovado_area: "Aguardando geral",
  aprovado_geral: "Fechado",
};

export function StatusBadge({ status, atrasado }: { status: StatusRelatorio; atrasado?: boolean }) {
  return (
    <span style={{ display: "inline-flex", gap: "0.4rem" }}>
      <span className={`badge badge-${status}`}>{ROTULOS[status]}</span>
      {atrasado && <span className="badge badge-atrasado">Atrasado</span>}
    </span>
  );
}
