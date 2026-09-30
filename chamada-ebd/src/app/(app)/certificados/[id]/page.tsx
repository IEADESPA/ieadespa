import { prisma } from "@/lib/prisma";
import { requireUser, podeGerenciarCongregacao } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { redirect } from "next/navigation";
import { ImprimirButton } from "./imprimir-button";

export default async function CertificadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const certificado = await prisma.certificadoEmitido.findUnique({
    where: { id },
    include: {
      aluno: { include: { congregacao: { include: { area: { include: { campo: true } } } }, turma: true } },
      emitidoPor: true,
    },
  });
  if (!certificado) redirect("/certificados");

  const ehODono = certificado.alunoId === user.id;
  const temAcessoAdmin =
    temPermissao(user.permissoes, "certificados.emitir") &&
    podeGerenciarCongregacao(
      user,
      certificado.aluno.congregacaoId,
      certificado.aluno.congregacao.areaId,
      certificado.aluno.congregacao.area.campoId
    );
  if (!ehODono && !temAcessoAdmin) redirect("/dashboard?erro=acesso-negado");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-end print:hidden">
        <ImprimirButton />
      </div>

      <div className="rounded-2xl border-8 border-double border-gold-400 bg-white p-12 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy-600">Escola Bíblica Dominical</p>
        <p className="mt-1 text-xs text-slate-400">{certificado.aluno.congregacao.area.campo.nome}</p>

        <h1 className="mt-8 text-2xl font-semibold text-navy-900">Certificado</h1>
        <p className="mt-6 text-sm text-slate-600">Certificamos que</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900" style={{ fontFamily: "Georgia, serif" }}>
          {certificado.aluno.nome}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          da turma <strong>{certificado.aluno.turma.nome}</strong> — {certificado.aluno.congregacao.nome}
        </p>

        <p className="mx-auto mt-6 max-w-xl text-base text-slate-800">{certificado.titulo}</p>
        {certificado.descricao && <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{certificado.descricao}</p>}

        <div className="mt-12 flex items-center justify-center gap-16 text-xs text-slate-500">
          <div>
            <p className="border-t border-slate-300 pt-1">{certificado.emitidoPor.nome}</p>
            <p>Responsável</p>
          </div>
          <div>
            <p className="border-t border-slate-300 pt-1">{certificado.emitidoEm.toLocaleDateString("pt-BR")}</p>
            <p>Data de emissão</p>
          </div>
        </div>
      </div>
    </div>
  );
}
