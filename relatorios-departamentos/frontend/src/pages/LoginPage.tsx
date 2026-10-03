import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useToast } from "../components/ToastProvider";
import { USUARIOS } from "../domain/seed";
import { ROTULO_PERFIL } from "../domain/permissoes";

const CONTAS_DEMONSTRACAO = [
  { matricula: "1001", legenda: "Líder Local — UCADESPA, UHADESPA e Família (Sede)" },
  { matricula: "1002", legenda: "Superintendente Local — EBD (Sede)" },
  { matricula: "2001", legenda: "Dirigente da Congregação — Sede" },
  { matricula: "3001", legenda: "Líder de Área — vários departamentos (Sede/Levi)" },
  { matricula: "3002", legenda: "Pastor de Área — Sede" },
  { matricula: "4001", legenda: "Líder Geral — UCADESPA (campo todo)" },
  { matricula: "4002", legenda: "Líder Geral — EBD, UHADESPA e Família (campo todo)" },
  { matricula: "9001", legenda: "Secretário(a) Geral" },
  { matricula: "9999", legenda: "Presidente do Campo" },
];

export function LoginPage() {
  const { entrar } = useAuth();
  const { notificar } = useToast();
  const navigate = useNavigate();
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = entrar(matricula, senha);
    setEnviando(false);
    if (!resultado.ok) {
      notificar({ tipo: "erro", titulo: "Não foi possível entrar", mensagem: resultado.mensagem });
      return;
    }
    notificar({ tipo: "sucesso", titulo: "Bem-vindo(a)!" });
    navigate("/painel");
  }

  function usarConta(matriculaConta: string) {
    setMatricula(matriculaConta);
    setSenha("demo123");
  }

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        background: "linear-gradient(160deg, var(--color-secondary) 0%, var(--color-secondary-light) 55%, var(--color-primary-dark) 140%)",
      }}
    >
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", maxWidth: 900, width: "100%" }}>
        <div className="card" style={{ flex: "1 1 340px", padding: "2rem" }}>
          <div style={{ marginBottom: "1.4rem" }}>
            <span style={{ color: "var(--color-primary-dark)", fontWeight: 800, letterSpacing: "0.04em" }}>IEADESPA</span>
            <h1 style={{ fontSize: "1.4rem", marginTop: "0.3rem" }}>Relatórios de Departamentos</h1>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>
              Entre com sua matrícula do rol de membros e sua senha.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="matricula">Matrícula</label>
              <input
                id="matricula"
                autoFocus
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="ex.: 1001"
              />
            </div>
            <div style={{ marginBottom: "1.4rem" }}>
              <label htmlFor="senha">Senha</label>
              <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={enviando} style={{ width: "100%", justifyContent: "center" }}>
              Entrar
            </button>
          </form>
        </div>

        <div className="card" style={{ flex: "1 1 340px", padding: "1.6rem" }}>
          <h3 style={{ fontSize: "0.95rem" }}>Contas de demonstração</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.82rem", marginTop: 0 }}>
            Protótipo local — clique em uma conta para testar aquele perfil de acesso. Senha de todas: <code>demo123</code>.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: 360, overflowY: "auto" }}>
            {CONTAS_DEMONSTRACAO.map((c) => {
              const usuario = USUARIOS.find((u) => u.matricula === c.matricula);
              const papeis = [...new Set(usuario?.vinculos.map((v) => v.perfil) ?? [])];
              return (
                <button
                  key={c.matricula}
                  type="button"
                  className="btn btn-outline"
                  style={{ justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start", gap: "0.2rem" }}
                  onClick={() => usarConta(c.matricula)}
                >
                  <span>
                    <strong>{c.matricula}</strong> — {usuario?.nome}
                  </span>
                  <span style={{ fontWeight: 400, fontSize: "0.76rem", color: "var(--color-text-muted)" }}>
                    {papeis.map((p) => ROTULO_PERFIL[p]).join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
