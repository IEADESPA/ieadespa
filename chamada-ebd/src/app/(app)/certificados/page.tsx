import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { EmitirCertificadoForm } from "./emitir-certificado-form";
import { RemoverCertificadoButton } from "./remover-certificado-button";

export default async function CertificadosPage() {
  const user = await requireFuncionalidade("certificados.emitir");

  const turmasWhere =
    user.role === "PROFESSOR"
      ? { professores: { some: { alunoId: user.id } } }
      : { congregacao: filtroCongregacaoPorEscopo(user) };

  const turmasDoEscopo = await prisma.turma.findMany({ where: turmasWhere, select: { id: true } });
  const turmaIds = turmasDoEscopo.map((t) => t.id);

  const [alunosDoEscopo, certificados] = await Promise.all([
    prisma.aluno.findMany({
      where: { turmaId: { in: turmaIds }, status: "ATIVO" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, matricula: true, turma: { select: { nome: true } } },
    }),
    prisma.certificadoEmitido.findMany({
      where: { aluno: { turmaId: { in: turmaIds } } },
      orderBy: { emitidoEm: "desc" },
      include: { aluno: true, emitidoPor: true },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Certificados</h1>
        <p className="text-sm text-slate-500">
          Emita um certificado para um aluno (conclusão de curso, trimestre, batismo etc.). Ele fica disponível para
          impressão e também aparece no painel do próprio aluno.
        </p>
      </div>

      <EmitirCertificadoForm
        alunos={alunosDoEscopo.map((a) => ({ id: a.id, label: `${a.nome} — matrícula ${a.matricula} (${a.turma.nome})` }))}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Aluno</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Emitido por</th>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {certificados.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.aluno.nome}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.titulo}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.emitidoPor.nome}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.emitidoEm.toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/certificados/${c.id}`} className="text-xs font-medium text-navy-600 hover:underline">
                      Ver / imprimir
                    </Link>
                    <RemoverCertificadoButton id={c.id} />
                  </div>
                </td>
              </tr>
            ))}
            {certificados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Nenhum certificado emitido ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
