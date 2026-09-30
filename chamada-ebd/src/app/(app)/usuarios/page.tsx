import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { papeisQueEuPossoConceder } from "@/lib/papeis";
import { ConcederPapelForm } from "./conceder-papel-form";
import { AlterarStatusUsuarioButton } from "./alterar-status-button";
import { RemoverAtribuicaoButton } from "./remover-atribuicao-button";
import { VincularProfessorForm } from "./vincular-professor-form";

export default async function UsuariosPage() {
  const user = await requireFuncionalidade("usuarios.gerenciar");

  const pessoasComPapelWhere =
    user.nivel === "GLOBAL"
      ? {}
      : user.nivel === "CAMPO"
        ? {
            atribuicoes: {
              some: {
                OR: [
                  { campoId: user.campoId ?? "__none__" },
                  { area: { campoId: user.campoId ?? "__none__" } },
                  { congregacao: { area: { campoId: user.campoId ?? "__none__" } } },
                ],
              },
            },
          }
        : user.nivel === "AREA"
          ? {
              atribuicoes: {
                some: {
                  OR: [
                    { areaId: user.areaId ?? "__none__" },
                    { congregacao: { areaId: user.areaId ?? "__none__" } },
                  ],
                },
              },
            }
          : { atribuicoes: { some: { congregacaoId: user.congregacaoId ?? "__none__" } } };

  const [pessoas, campos, areas, alunosDoEscopo, turmas, papeisConcediveis] = await Promise.all([
    prisma.aluno.findMany({
      where: { ...pessoasComPapelWhere, atribuicoes: { some: {} } },
      orderBy: { nome: "asc" },
      include: {
        atribuicoes: {
          include: { papel: true, campo: true, area: true, congregacao: true },
        },
      },
    }),
    prisma.campo.findMany({ orderBy: { nome: "asc" } }),
    prisma.area.findMany({ orderBy: { nome: "asc" }, include: { campo: true } }),
    prisma.aluno.findMany({
      where: { congregacao: filtroCongregacaoPorEscopo(user), status: "ATIVO" },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, matricula: true, senhaHash: true, turma: { select: { nome: true } } },
    }),
    prisma.turma.findMany({
      where: { congregacao: filtroCongregacaoPorEscopo(user) },
      orderBy: { nome: "asc" },
      include: { congregacao: true },
    }),
    papeisQueEuPossoConceder(user.ordem),
  ]);

  const professores = pessoas.filter((p) => p.atribuicoes.some((a) => !a.papel.escopoAmplo));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Papéis e acesso</h1>
        <p className="text-sm text-slate-500">
          Todo mundo que usa o sistema já é um aluno matriculado. Aqui você concede papéis administrativos a quem já
          existe — uma pessoa pode acumular mais de um (ex: Coordenador de Área + Admin) e troca entre eles depois de
          entrar.
        </p>
      </div>

      <ConcederPapelForm
        papeisConcediveis={papeisConcediveis.map((p) => ({ id: p.id, nome: p.nome, nivel: p.nivel }))}
        alunos={alunosDoEscopo.map((a) => ({
          id: a.id,
          label: `${a.nome} — matrícula ${a.matricula} (${a.turma.nome})`,
          temSenha: !!a.senhaHash,
        }))}
        campos={campos.map((c) => ({ id: c.id, nome: c.nome }))}
        areas={areas.map((a) => ({ id: a.id, nome: `${a.nome} (${a.campo.nome})` }))}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Matrícula</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Papéis (painéis)</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 align-top">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.matricula}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{p.nome}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {p.atribuicoes.map((a) => {
                      let sufixo = "";
                      if (a.papel.nivel === "CAMPO" && a.campo) sufixo = ` — ${a.campo.nome}`;
                      if (a.papel.nivel === "AREA" && a.area) sufixo = ` — ${a.area.nome}`;
                      if (a.papel.nivel === "CONGREGACAO" && a.congregacao) sufixo = ` — ${a.congregacao.nome}`;
                      return (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700"
                        >
                          {a.papel.nome}
                          {sufixo}
                          <RemoverAtribuicaoButton atribuicaoId={a.id} />
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <AlterarStatusUsuarioButton alunoId={p.id} status={p.status} />
                </td>
              </tr>
            ))}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Ninguém no seu escopo tem papel administrativo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Vincular professor a turma</h2>
        <p className="text-sm text-slate-500">
          Um professor pode lecionar em mais de uma turma. Vincule aqui o acesso dele.
        </p>
        <div className="mt-3">
          <VincularProfessorForm
            professores={professores.map((p) => ({ id: p.id, nome: p.nome }))}
            turmas={turmas.map((t) => ({ id: t.id, nome: `${t.nome} — ${t.congregacao.nome}` }))}
          />
        </div>
      </div>
    </div>
  );
}
