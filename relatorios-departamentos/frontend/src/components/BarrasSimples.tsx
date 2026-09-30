interface Barra {
  rotulo: string;
  valor: number;
  cor?: string;
}

export function BarrasSimples({ titulo, barras, altura = 140 }: { titulo: string; barras: Barra[]; altura?: number }) {
  const maximo = Math.max(1, ...barras.map((b) => b.valor));
  return (
    <div className="card" style={{ padding: "1.1rem 1.2rem" }}>
      <h3 style={{ fontSize: "0.92rem", marginBottom: "0.9rem" }}>{titulo}</h3>
      {barras.every((b) => b.valor === 0) ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Sem dados fechados neste recorte ainda.</p>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem", height: altura, paddingTop: "1.4rem" }}>
          {barras.map((b) => (
            <div key={b.rotulo} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-secondary)", marginBottom: "0.3rem" }}>{b.valor}</span>
              <div
                style={{
                  width: "100%",
                  maxWidth: 46,
                  height: `${Math.max(4, (b.valor / maximo) * 100)}%`,
                  background: b.cor ?? "var(--color-primary)",
                  borderRadius: "4px 4px 0 0",
                }}
              />
              <span style={{ fontSize: "0.74rem", color: "var(--color-text-muted)", marginTop: "0.4rem", textAlign: "center" }}>{b.rotulo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
