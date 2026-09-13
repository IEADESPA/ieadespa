/**
 * Fase 26 — "Minha Conta" do público em geral: login sem senha (e-mail +
 * código), independente do Directus e do Portal do Membro (decisão do
 * usuário: os dois sistemas ficam separados por enquanto — ver README).
 * O token guardado aqui é opaco pro navegador (assinado no servidor, ver
 * `api/src/lib/contaToken.js`); localStorage (não sessionStorage) porque,
 * diferente do painel administrativo, aqui a expectativa é continuar
 * logado entre visitas, não só durante a sessão do navegador.
 */
const TOKEN_KEY = "conta_token";
const EMAIL_KEY = "conta_email";

export function contaSalvar(token: string, email: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}

export function contaToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function contaEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

export function contaSair(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}
