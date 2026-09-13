/**
 * Autenticação de painel administrativo (Directus) — reaproveita a própria
 * conta do Directus, sem senha nenhuma guardada no código. Usado por
 * /painel-eventos/ e /painel-camisetas/ (Fase 22): mesmo mecanismo, cada um
 * com seu próprio token em sessionStorage e sua própria tela de login — mas
 * como os dois autenticam contra o mesmo Directus com cookie httpOnly, quem
 * já entrou num painel entra no outro sem digitar senha de novo (o
 * `/auth/refresh` abaixo pega a sessão do cookie compartilhado). Ver README
 * ("Aba dedicada de gestão de eventos" e Fase 22).
 */
const DEFAULT_TOKEN_KEY = "painel_eventos_token";
const DEFAULT_LOGIN_PATH = "/painel-eventos/entrar/";

/** Vai pro login, guardando a página atual pra voltar direto pra ela depois de entrar. */
export function irParaLogin(loginPath: string = DEFAULT_LOGIN_PATH): void {
  const voltar = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${loginPath}?voltar=${voltar}`;
}

/** Token em sessionStorage, ou renovado silenciosamente via cookie httpOnly. */
export async function obterTokenValido(directusUrl: string, tokenKey: string = DEFAULT_TOKEN_KEY): Promise<string | null> {
  const tokenAtual = sessionStorage.getItem(tokenKey);
  if (tokenAtual) return tokenAtual;

  try {
    const res = await fetch(`${directusUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "cookie" }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    sessionStorage.setItem(tokenKey, json.data.access_token);
    return json.data.access_token as string;
  } catch {
    return null;
  }
}

interface OpcoesPainel {
  tokenKey?: string;
  loginPath?: string;
}

/** Redireciona pro login se não houver sessão válida; senão devolve o token. */
export async function exigirAutenticacao(directusUrl: string, opcoes: OpcoesPainel = {}): Promise<string | null> {
  const token = await obterTokenValido(directusUrl, opcoes.tokenKey);
  if (!token) {
    irParaLogin(opcoes.loginPath);
    return null;
  }
  return token;
}

export function limparToken(tokenKey: string = DEFAULT_TOKEN_KEY): void {
  sessionStorage.removeItem(tokenKey);
}

export async function sair(directusUrl: string, opcoes: OpcoesPainel = {}): Promise<void> {
  try {
    await fetch(`${directusUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "cookie" }),
    });
  } catch {
    // segue o baile mesmo se o logout no servidor falhar — o token local já é limpo
  }
  limparToken(opcoes.tokenKey);
  irParaLogin(opcoes.loginPath);
}
