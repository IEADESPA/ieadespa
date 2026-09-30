import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { temPermissao } from "@/lib/permissoes";
import { signOut } from "@/lib/auth";
import { PainelSwitcher } from "@/components/painel-switcher";

const NAV_ADMIN_GRUPOS = [
  {
    titulo: "Principal",
    itens: [
      { href: "/dashboard", label: "Painel", chave: null },
      { href: "/chamada", label: "Chamada", chave: "chamada.lancar" },
      { href: "/licoes", label: "Lições", chave: "licoes.gerenciar" },
      { href: "/atividades", label: "Atividades", chave: "atividades.gerenciar" },
      { href: "/relatorios", label: "Relatórios", chave: "relatorios.ver" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/alunos", label: "Alunos", chave: "alunos.gerenciar" },
      { href: "/turmas", label: "Turmas", chave: "turmas.gerenciar" },
      { href: "/congregacoes", label: "Congregações", chave: "congregacoes.gerenciar" },
      { href: "/areas", label: "Áreas", chave: "areas.gerenciar" },
      { href: "/campos", label: "Campos", chave: "campos.gerenciar" },
    ],
  },
  {
    titulo: "Revistas & Financeiro",
    itens: [
      { href: "/revistas", label: "Revistas", chave: "pedidos_revista.gerenciar" },
      { href: "/financeiro", label: "Financeiro", chave: "financeiro.gerenciar" },
    ],
  },
  {
    titulo: "Reconhecimento",
    itens: [
      { href: "/conquistas", label: "Conquistas", chave: "conquistas.gerenciar" },
      { href: "/certificados", label: "Certificados", chave: "certificados.emitir" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/usuarios", label: "Papéis e acesso", chave: "usuarios.gerenciar" },
      { href: "/permissoes", label: "Permissões", chave: "permissoes.gerenciar" },
    ],
  },
] as const;

const NAV_ALUNO = [
  { href: "/meu-painel", label: "Meu painel" },
  { href: "/meu-painel/atividades", label: "Minhas atividades" },
  { href: "/meu-painel/presenca", label: "Minha presença" },
  { href: "/meu-painel/ranking", label: "Ranking da turma" },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const temPainelAdmin = user.role !== null;
  const painelAtivo = user.paineis.find((p) => p.chave === user.painelAtivoChave);

  const gruposAdmin = NAV_ADMIN_GRUPOS.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter((item) => !item.chave || temPermissao(user.permissoes, item.chave)),
  })).filter((grupo) => grupo.itens.length > 0);

  return (
    <div className="flex min-h-screen flex-1 bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col bg-navy-900 print:hidden">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-sm font-semibold tracking-wide text-white">
            Chamada <span className="text-gold-400">EBD</span>
          </p>
          <p className="mt-0.5 text-xs text-white/50">Matrícula {user.matricula}</p>
        </div>

        {user.paineis.length > 0 && (
          <div className="px-3 pt-3">
            <PainelSwitcher paineis={user.paineis} painelAtivoChave={user.painelAtivoChave} />
          </div>
        )}

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {temPainelAdmin && (
            <div>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {painelAtivo?.label}
              </p>
              <div className="space-y-3">
                {gruposAdmin.map((grupo) => (
                  <div key={grupo.titulo}>
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/30">
                      {grupo.titulo}
                    </p>
                    <div className="space-y-0.5">
                      {grupo.itens.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/30">
              Meu painel de aluno
            </p>
            <div className="space-y-0.5">
              {NAV_ALUNO.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <p className="truncate px-1 text-xs text-white/60">{user.name}</p>
          <p className="truncate px-1 text-[11px] text-white/35">Matrícula {user.matricula}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
