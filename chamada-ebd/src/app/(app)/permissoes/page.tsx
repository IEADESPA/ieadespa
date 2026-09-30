import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { PAPEL_ADMIN } from "@/lib/papeis-sistema";
import { NIVEL_LABELS } from "@/lib/papeis-sistema";
import { TogglePermissao } from "./toggle-permissao";
import { RemoverExcecaoButton } from "./remover-excecao-button";
import { AlterarStatusPapelButton } from "./alterar-status-papel-button";
import { CriarPapelForm } from "./criar-papel-form";
import { definirExcecaoAluno } from "./actions";

export default async function PermissoesPage() {
  await requireRole(PAPEL_ADMIN);

  const [funcionalidades, permissoesPapel, excecoes, alunos, papeis] = await Promise.all([
    prisma.funcionalidade.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] }),
    prisma.permissaoPapel.findMany(),
    prisma.permissaoExcecao.findMany({ include: { aluno: true, funcionalidade: true } }),
    prisma.aluno.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, matricula: true } }),
    prisma.papel.findMany({ orderBy: { ordem: "asc" } }),
  ]);

  const mapaPapel = new Map(permissoesPapel.map((p) => [`${p.papelId}:${p.funcionalidadeId}`, p.permitido]));
  const categorias = [...new Set(funcionalidades.map((f) => f.categoria))];
  const papeisAtivos = papeis.filter((p) => p.status === "ATIVO");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Permissões</h1>
        <p className="text-sm text-slate-500">
          Ligue ou desligue cada funcionalidade por papel. Essa matriz vale para todo mundo com aquele papel — para
          liberar ou bloquear algo pontual para UMA pessoa, use as exceções mais abaixo.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="sticky left-0 bg-white px-4 py-2">Funcionalidade</th>
              {papeisAtivos.map((papel) => (
                <th key={papel.id} className="px-3 py-2 text-center font-medium">
                  {papel.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorias.map((categoria) => (
              <Fragment key={categoria}>
                <tr className="bg-slate-50">
                  <td colSpan={papeisAtivos.length + 1} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {categoria}
                  </td>
                </tr>
                {funcionalidades
                  .filter((f) => f.categoria === categoria)
                  .map((f) => (
                    <tr key={f.id} className="border-b border-slate-50">
                      <td className="sticky left-0 bg-white px-4 py-2.5 font-medium text-slate-800">{f.nome}</td>
                      {papeisAtivos.map((papel) => (
                        <td key={papel.id} className="px-3 py-2.5 text-center">
                          {papel.chave === PAPEL_ADMIN ? (
                            <span className="text-xs text-slate-300" title="Admin sempre tem acesso total">
                              —
                            </span>
                          ) : (
                            <div className="flex justify-center">
                              <TogglePermissao
                                papelId={papel.id}
                                funcionalidadeId={f.id}
                                permitido={mapaPapel.get(`${papel.id}:${f.id}`) ?? false}
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Papéis</h2>
        <p className="text-sm text-slate-500">
          Os 7 papéis nativos não podem ser removidos. Crie quantos papéis customizados precisar — eles entram
          automaticamente na matriz acima e no seletor da tela de Papéis e acesso.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Nível</th>
                <th className="px-4 py-2">Ordem</th>
                <th className="px-4 py-2">Origem</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {papeis.map((papel) => (
                <tr key={papel.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{papel.nome}</td>
                  <td className="px-4 py-2.5 text-slate-600">{NIVEL_LABELS[papel.nivel]}</td>
                  <td className="px-4 py-2.5 text-slate-600">{papel.ordem}</td>
                  <td className="px-4 py-2.5 text-slate-500">{papel.sistema ? "Nativo" : "Customizado"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        papel.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {papel.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!papel.sistema && <AlterarStatusPapelButton papelId={papel.id} status={papel.status} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3">
          <CriarPapelForm />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Exceções por aluno</h2>
        <p className="text-sm text-slate-500">
          Libera ou revoga uma funcionalidade específica para UMA pessoa, independente do papel dela.
        </p>

        <form action={definirExcecaoAluno} className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">Aluno</label>
            <select name="alunoId" required defaultValue="" className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="" disabled>
                Selecione...
              </option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} (matrícula {a.matricula})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Funcionalidade</label>
            <select name="funcionalidadeId" required defaultValue="" className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="" disabled>
                Selecione...
              </option>
              {funcionalidades.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Ação</label>
            <select name="permitido" required defaultValue="liberar" className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              <option value="liberar">Liberar (mesmo sem o papel ter)</option>
              <option value="revogar">Revogar (mesmo se o papel tiver)</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-navy-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-700"
          >
            Salvar exceção
          </button>
        </form>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Aluno</th>
                <th className="px-4 py-2">Funcionalidade</th>
                <th className="px-4 py-2">Ação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {excecoes.map((e) => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-slate-700">{e.aluno.nome}</td>
                  <td className="px-4 py-2 text-slate-600">{e.funcionalidade.nome}</td>
                  <td className="px-4 py-2">
                    <span className={e.permitido ? "text-green-700" : "text-red-600"}>
                      {e.permitido ? "Liberado" : "Revogado"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RemoverExcecaoButton id={e.id} />
                  </td>
                </tr>
              ))}
              {excecoes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    Nenhuma exceção configurada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
