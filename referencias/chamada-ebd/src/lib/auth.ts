import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

declare module "next-auth" {
  interface User {
    id: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        matricula: { label: "Matrícula", type: "text" },
        senha: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const matricula = (credentials?.matricula as string | undefined)?.trim();
        const senha = credentials?.senha as string | undefined;
        if (!matricula) return null;

        const aluno = await prisma.aluno.findUnique({ where: { matricula } });
        if (!aluno || aluno.status !== "ATIVO") return null;

        if (aluno.senhaHash) {
          // Tem senha cadastrada (alguém com papel acima de aluno comum) — obrigatória.
          if (!senha) return null;
          const ok = await bcrypt.compare(senha, aluno.senhaHash);
          if (!ok) return null;
        }
        // Aluno "puro" sem senha cadastrada: a matrícula sozinha já autentica.

        return { id: aluno.id, name: aluno.nome };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
  },
});
