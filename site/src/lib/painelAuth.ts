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

const chaveRefresh = (tokenKey: string) => `${tokenKey}_refresh`;

/**
 * Guarda a sessão devolvida pelo `/auth/login` em modo "json" (06/10/2026): o token de
 * acesso (vale 15 min) E o token de renovação (vale dias). Antes o login era em modo
 * "cookie" — mas o Directus mora em outro domínio (azurewebsites.net) e o navegador não
 * manda esse cookie numa chamada entre sites, então a renovação silenciosa nunca
 * funcionava: passados 15 minutos, toda gravação falhava e a pessoa tinha que sair e
 * entrar de novo (relato do incidente das camisetas).
 */
export function guardarSessao(tokenKey: string, accessToken: string, refreshToken: string | null | undefined): void {
  sessionStorage.setItem(tokenKey, accessToken);
  if (refreshToken) sessionStorage.setItem(chaveRefresh(tokenKey), refreshToken);
}

/** Pede um par novo de tokens ao Directus pelo token de renovação (modo json); cai para o cookie se não houver. */
async function renovarPeloDirectus(directusUrl: string, tokenKey: string): Promise<string | null> {
  const refreshToken = sessionStorage.getItem(chaveRefresh(tokenKey));
  try {
    const res = await fetch(`${directusUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken, mode: "json" } : { mode: "cookie" }),
    });
    if (!res.ok) {
      if (refreshToken) sessionStorage.removeItem(chaveRefresh(tokenKey)); // renovação gasta/vencida: não insistir
      return null;
    }
    const json = await res.json();
    guardarSessao(tokenKey, json.data.access_token, json.data.refresh_token);
    return json.data.access_token as string;
  } catch {
    return null;
  }
}

/** Token em sessionStorage, ou renovado silenciosamente (token de renovação; cookie como reserva). */
export async function obterTokenValido(directusUrl: string, tokenKey: string = DEFAULT_TOKEN_KEY): Promise<string | null> {
  const tokenAtual = sessionStorage.getItem(tokenKey);
  if (tokenAtual) return tokenAtual;
  return renovarPeloDirectus(directusUrl, tokenKey);
}

/**
 * Renova o token de acesso pelo cookie httpOnly (ignorando o que está em sessionStorage).
 * O token de acesso do Directus vale 15 minutos; a sessão (cookie) dura dias. Até
 * 06/10/2026 o painel só pegava o token do sessionStorage e, vencido, toda gravação
 * falhava em silêncio — a pessoa tinha que sair e entrar de novo (relato do incidente
 * das camisetas).
 */
export async function renovarToken(directusUrl: string, tokenKey: string = DEFAULT_TOKEN_KEY): Promise<string | null> {
  sessionStorage.removeItem(tokenKey);
  return renovarPeloDirectus(directusUrl, tokenKey);
}

interface OpcoesPainel {
  tokenKey?: string;
  loginPath?: string;
}

/**
 * `fetch` com a sessão do painel: põe o token atual, e num 401 renova pelo cookie e
 * repete UMA vez; se nem assim entrar, manda para o login (guardando a página para voltar).
 * Use isto para toda chamada ao Directus feita pelos painéis.
 */
export async function fetchComSessao(directusUrl: string, opcoes: OpcoesPainel, input: string, init: RequestInit = {}): Promise<Response> {
  const chamar = async (token: string) => {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
  let token = await obterTokenValido(directusUrl, opcoes.tokenKey);
  if (!token) {
    irParaLogin(opcoes.loginPath);
    throw new Error("sem sessão");
  }
  let res = await chamar(token);
  if (res.status !== 401) return res;
  token = await renovarToken(directusUrl, opcoes.tokenKey);
  if (!token) {
    irParaLogin(opcoes.loginPath);
    throw new Error("sessão expirada");
  }
  res = await chamar(token);
  if (res.status === 401) {
    irParaLogin(opcoes.loginPath);
    throw new Error("sessão expirada");
  }
  return res;
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
  sessionStorage.removeItem(chaveRefresh(tokenKey));
}

export async function sair(directusUrl: string, opcoes: OpcoesPainel = {}): Promise<void> {
  const refreshToken = sessionStorage.getItem(chaveRefresh(opcoes.tokenKey ?? DEFAULT_TOKEN_KEY));
  try {
    await fetch(`${directusUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken, mode: "json" } : { mode: "cookie" }),
    });
  } catch {
    // segue o baile mesmo se o logout no servidor falhar — o token local já é limpo
  }
  limparToken(opcoes.tokenKey);
  irParaLogin(opcoes.loginPath);
}
