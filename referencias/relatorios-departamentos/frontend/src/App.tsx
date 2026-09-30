import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { RelatorioPage } from "./pages/RelatorioPage";
import { ConsolidadoPage } from "./pages/ConsolidadoPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";

function RotasProtegidas() {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/painel" element={<HomePage />} />
        <Route path="/consolidado" element={<ConsolidadoPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
        <Route path="/relatorio/:tipoDepartamentoId/:congregacaoId/:ano/:mes" element={<RelatorioPage />} />
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const { usuario } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to="/painel" replace /> : <LoginPage />} />
      <Route path="/*" element={<RotasProtegidas />} />
    </Routes>
  );
}
