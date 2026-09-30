import type { NextAuthConfig } from "next-auth";

// Configuração "segura para Edge" — não importa Prisma nem bcrypt, apenas o
// necessário para o middleware decidir se a sessão existe e redirecionar.
// A autenticação de fato (Credentials + banco) fica em `auth.ts`, usado nas
// rotas de API e nos Server Components (runtime Node.js).
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
};
