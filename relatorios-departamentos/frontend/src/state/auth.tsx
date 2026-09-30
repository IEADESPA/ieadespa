import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { USUARIOS } from "../domain/seed";
import type { Usuario } from "../domain/types";

const CHAVE_STORAGE = "relatorios-departamentos:sessao";

interface AuthContextValue {
  usuario: Usuario | null;
  entrar: (matricula: string, senha: string) => { ok: boolean; mensagem?: string };
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    try {
      const matriculaSalva = window.localStorage.getItem(CHAVE_STORAGE);
      return USUARIOS.find((u) => u.matricula === matriculaSalva) ?? null;
    } catch {
      return null;
    }
  });

  const entrar = useCallback((matricula: string, senha: string) => {
    const encontrado = USUARIOS.find((u) => u.matricula === matricula.trim());
    if (!encontrado) return { ok: false, mensagem: "Matrícula não encontrada." };
    if (encontrado.senha !== senha) return { ok: false, mensagem: "Senha incorreta." };
    setUsuario(encontrado);
    try {
      window.localStorage.setItem(CHAVE_STORAGE, encontrado.matricula);
    } catch {
      // segue apenas em memória se o navegador bloquear
    }
    return { ok: true };
  }, []);

  const sair = useCallback(() => {
    setUsuario(null);
    try {
      window.localStorage.removeItem(CHAVE_STORAGE);
    } catch {
      // nada a fazer
    }
  }, []);

  const value = useMemo(() => ({ usuario, entrar, sair }), [usuario, entrar, sair]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de um AuthProvider");
  return ctx;
}
