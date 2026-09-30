import { prisma } from "@/lib/prisma";
import { requireFuncionalidade } from "@/lib/rbac";
import { TurmaCard, type TurmaChamadaInfo } from "./turma-card";
import { PickerHierarquico, type GrupoArea } from "./picker-hierarquico";

function domingoAtual() {
  const hoje = new Date();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay());
  domingo.setHours(12, 0, 0, 0);
  return domingo;
}

export default async function ChamadaPage() {
  const user = await requireFuncionalidade("chamada.lancar");

  const turmasWhere =
    user.role === "PROFESSOR"
      ? { professores: { some: { alunoId: user.id } }, status: "ATIVO" as const }
      : user.role === "ADMIN"
        ? { status: "ATIVO" as const }
        : user.role === "COORDENADOR_CAMPO"
          ? { status: "ATIVO" as const, congregacao: { area: { campoId: user.campoId ?? "__none__" } } }
          : user.role === "COORDENADOR_AREA"
            ? { status: "ATIVO" as const, congregacao: { areaId: user.areaId ?? "__none__" } }
            : { status: "ATIVO" as const, congregacaoId: user.congregacaoId ?? "__none__" };

  const data = domingoAtual();

  const turmas = await prisma.turma.findMany({
    where: turmasWhere,
    orderBy: { nome: "asc" },
    include: {
      congregacao: { include: { area: { include: { campo: true } } } },
      _count: { select: { alunos: true } },
      chamadas: { where: { data }, select: { id: true, presencas: { select: { presente: true } } } },
    },
  });

  const congregacoesComLicaoAberta = new Set(
    (await prisma.licao.findMany({ where: { status: "ABERTA" }, select: { congregacaoId: true } })).map(
      (l) => l.congregacaoId
    )
  );

  const paraCartao = (t: (typeof turmas)[number]): TurmaChamadaInfo => {
    const chamadaHoje = t.chamadas[0];
    return {
      id: t.id,
      nome: t.nome,
      congregacaoNome: t.congregacao.nome,
      totalAlunos: t._count.alunos,
      feita: !!chamadaHoje,
      presentes: chamadaHoje?.presencas.filter((p) => p.presente).length ?? 0,
      totalPresencas: chamadaHoje?.presencas.length ?? 0,
      licaoAberta: congregacoesComLicaoAberta.has(t.congregacaoId),
    };
  };

  const congregacoesDistintas = new Set(turmas.map((t) => t.congregacaoId));
  const usarVisaoHierarquica = congregacoesDistintas.size > 1;
  const camposDistintos = new Set(turmas.map((t) => t.congregacao.area.campoId));

  let grupos: GrupoArea[] = [];
  if (usarVisaoHierarquica) {
    const mapaAreas = new Map<string, GrupoArea>();
    for (const t of turmas) {
      const area = t.congregacao.area;
      const areaLabel = campoDistintosMaiorQueUm(camposDistintos) ? `${area.nome} — ${area.campo.nome}` : area.nome;
      if (!mapaAreas.has(area.id)) {
        mapaAreas.set(area.id, { areaId: area.id, areaLabel, congregacoes: [] });
      }
      const grupoArea = mapaAreas.get(area.id)!;
      let grupoCong = grupoArea.congregacoes.find((c) => c.congregacaoId === t.congregacaoId);
      if (!grupoCong) {
        grupoCong = { congregacaoId: t.congregacaoId, congregacaoNome: t.congregacao.nome, turmas: [] };
        grupoArea.congregacoes.push(grupoCong);
      }
      grupoCong.turmas.push(paraCartao(t));
    }
    grupos = [...mapaAreas.values()].sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Lançar chamada</h1>
        <p className="text-sm text-slate-500">
          Domingo, {data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.
          {usarVisaoHierarquica
            ? " Busque ou expanda a área/congregação para escolher a turma."
            : " Escolha a turma para registrar a chamada."}
        </p>
      </div>

      {usarVisaoHierarquica ? (
        <PickerHierarquico grupos={grupos} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {turmas.map((t) => (
            <TurmaCard key={t.id} t={paraCartao(t)} />
          ))}
          {turmas.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma turma disponível para lançar chamada.</p>
          )}
        </div>
      )}
    </div>
  );
}

function campoDistintosMaiorQueUm(campos: Set<string>) {
  return campos.size > 1;
}
