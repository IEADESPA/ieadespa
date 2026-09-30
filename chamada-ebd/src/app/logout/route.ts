import { signOut } from "@/lib/auth";

// Route Handler dedicado: só aqui é permitido mexer em cookies para encerrar
// a sessão. Usado quando o servidor precisa forçar saída (ex: o login salvo
// no navegador aponta para um usuário que não existe mais no banco) a partir
// de um Server Component, onde chamar signOut() diretamente não é permitido.
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
