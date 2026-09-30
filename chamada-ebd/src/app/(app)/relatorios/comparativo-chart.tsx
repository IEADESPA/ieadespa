"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ComparativoChart({ dados }: { dados: { nome: string; pontos: number }[] }) {
  if (dados.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Sem dados suficientes para o gráfico ainda.</p>;
  }

  return (
    <div className="h-72 w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="nome"
            tick={{ fontSize: 11, fill: "#64748b" }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
            cursor={{ fill: "#f8fafc" }}
          />
          <Bar dataKey="pontos" fill="#cf8f1f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
