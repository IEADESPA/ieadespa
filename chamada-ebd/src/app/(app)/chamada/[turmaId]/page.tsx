import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { redirect } from "next/navigation";
import { ChamadaForm } from "./chamada-form";

function domingoAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - diaSemana);
  return domingo.toISOString().slice(0, 10);
}

export default async function ChamadaTurmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ turmaId: string }>;
  searchParams: Promise<{ data?: string }>;
}) {
  const { turmaId } = await params;
  const { data } = await searchParams;
  const user = await requireFuncionalidade("chamada.lancar");

  const turma = await prisma.turma.findUnique({
    where: { id: turmaId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!turma) redirect("/chamada");

  const acessoDireto = podeGerenciarCongregacao(
    user,
    turma.congregacaoId,
    turma.congregacao.areaId,
    turma.congregacao.area.campoId
  );
  if (!acessoDireto) {
    const leciona =
      user.role === "PROFESSOR" &&
      (await prisma.turmaProfessor.findUnique({
        where: { turmaId_alunoId: { turmaId, alunoId: user.id } },
      }));
    if (!leciona) redirect("/chamada");
  }

  const dataSelecionada = data ?? domingoAtual();

  const licaoAberta = await prisma.licao.findFirst({
    where: { congregacaoId: turma.congregacaoId, status: "ABERTA" },
  });

  const [alunos, chamadaExistente] = await Promise.all([
    prisma.aluno.findMany({
      where: { turmaId, status: "ATIVO" },
      orderBy: { nome: "asc" },
    }),
    prisma.chamada.findUnique({
      where: { turmaId_data: { turmaId, data: new Date(`${dataSelecionada}T12:00:00`) } },
      include: { presencas: true },
    }),
  ]);

  const presencaPorAluno = new Map(
    (chamadaExistente?.presencas ?? []).map((p) => [p.alunoId, p])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{turma.nome}</h1>
        <p className="text-sm text-slate-500">{turma.congregacao.nome}</p>
      </div>

      {licaoAberta ? (
        <p className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-800">
          Lição aberta: <strong>Lição {licaoAberta.numero} — {licaoAberta.titulo}</strong> ({licaoAberta.trimestre}º/{licaoAberta.ano})
        </p>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Nenhuma lição aberta para esta congregação.</p>
          <p className="mt-0.5 text-red-700">
            A chamada só pode ser lançada com uma lição aberta.{" "}
            {temPermissao(user.permissoes, "licoes.gerenciar") ? (
              <Link href="/licoes" className="font-medium underline">
                Abrir a lição agora
              </Link>
            ) : (
              "Peça ao superintendente ou secretário para abrir a lição."
            )}
          </p>
        </div>
      )}

      <ChamadaForm
        turmaId={turmaId}
        dataSelecionada={dataSelecionada}
        alunos={alunos.map((a) => ({
          id: a.id,
          nome: a.nome,
          presente: presencaPorAluno.get(a.id)?.presente ?? false,
          trouxeBiblia: presencaPorAluno.get(a.id)?.trouxeBiblia ?? false,
          trouxeRevista: presencaPorAluno.get(a.id)?.trouxeRevista ?? false,
        }))}
        chamada={
          chamadaExistente
            ? {
                visitantes: chamadaExistente.visitantes,
                oferta: chamadaExistente.oferta,
                inicioPontual: chamadaExistente.inicioPontual,
                observacoes: chamadaExistente.observacoes ?? "",
              }
            : null
        }
      />
    </div>
  );
}
