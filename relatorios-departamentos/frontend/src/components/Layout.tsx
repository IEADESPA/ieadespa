import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useDb } from "../state/db";
import { useConfirm } from "./ConfirmProvider";
import { useToast } from "./ToastProvider";
import { ehSecretarioOuPresidente, maiorNivelGeral, ROTULO_PERFIL } from "../domain/permissoes";

export function Layout() {
  const { usuario, sair } = useAuth();
  const { restaurarDemo } = useDb();
  const pedirConfirmacao = useConfirm();
  const { notificar } = useToast();
  const navigate = useNavigate();

  if (!usuario) return null;

  const papeis = [...new Set(usuario.vinculos.map((v) => v.perfil))];

  async function handleSair() {
    const ok = await pedirConfirmacao({
      titulo: "Sair do sistema",
      mensagem: "Você será desconectado. Deseja continuar?",
      textoConfirmar: "Sair",
    });
    if (ok) {
      sair();
      navigate("/login");
    }
  }

  async function handleRestaurarDemo() {
    const ok = await pedirConfirmacao({
      titulo: "Restaurar dados de demonstração",
      mensagem: "Isso descarta tudo o que foi preenchido neste navegador e volta aos dados de exemplo iniciais. Deseja continuar?",
      textoConfirmar: "Restaurar",
      perigoso: true,
    });
    if (ok) {
      restaurarDemo();
      notificar({ tipo: "info", titulo: "Dados de demonstração restaurados" });
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/painel" className="topbar-brand">
          <span className="topbar-brand-marca">IEADESPA</span>
          <span className="topbar-brand-sub">Relatórios de Departamentos</span>
        </Link>

        <nav className="topbar-nav">
          <Link to="/painel">Painel</Link>
          {maiorNivelGeral(usuario) >= 2 && <Link to="/consolidado">Consolidado</Link>}
          {ehSecretarioOuPresidente(usuario) && <Link to="/configuracoes">Configurações</Link>}
        </nav>

        <div className="topbar-user">
          <div className="topbar-user-info">
            <strong>{usuario.nome}</strong>
            <div className="chip-linha">
              {papeis.map((p) => (
                <span key={p} className="chip">
                  {ROTULO_PERFIL[p]}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={handleRestaurarDemo} title="Restaurar dados de demonstração">
            Restaurar demo
          </button>
          <button className="btn btn-outline" onClick={handleSair}>
            Sair
          </button>
        </div>
      </header>

      <main className="page-container">
        <Outlet />
      </main>
    </div>
  );
}
