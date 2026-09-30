import Link from "next/link";

export type TurmaChamadaInfo = {
  id: string;
  nome: string;
  congregacaoNome: string;
  totalAlunos: number;
  feita: boolean;
  presentes: number;
  totalPresencas: number;
  licaoAberta: boolean;
};

export function TurmaCard({ t }: { t: TurmaChamadaInfo }) {
  return (
    <Link
      href={`/chamada/${t.id}`}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md"
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${t.feita ? "bg-green-500" : "bg-navy-800"}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-900 group-hover:text-navy-800">{t.nome}</p>
          <p className="text-sm text-slate-500">{t.congregacaoNome}</p>
        </div>
        {t.feita && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
            ✓ feita
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{t.totalAlunos} aluno(s)</span>
        {t.feita && (
          <span className="font-medium text-navy-700">
            {t.presentes}/{t.totalPresencas} presentes
          </span>
        )}
      </div>
      {!t.licaoAberta && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">Sem lição aberta</p>
      )}
    </Link>
  );
}
