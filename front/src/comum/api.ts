// Os pedidos ao servidor. Cada chamada devolve um Resultado: ou os dados (ok: true), ou a mensagem que a tela mostra (ok: false).
// Nunca lança para a tela: a falta de rede, a resposta que não é JSON e a recusa viram mensagem (a casca já avisa 401/403/5xx).
import { ponte } from "./ponte";

export type Resultado<T> =
  | { readonly ok: true; readonly dados: T; readonly status: number }
  | { readonly ok: false; readonly mensagem: string; readonly status: number; readonly corpo: unknown; readonly cancelado: boolean };

const SEM_REDE = "Não deu para falar com o servidor agora. Confira a internet e tente de novo.";

function mensagemDe(corpo: unknown, status: number): string {
  if (corpo && typeof corpo === "object" && "mensagem" in corpo) {
    const m = (corpo as { mensagem: unknown }).mensagem;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  if (status === 403) return "Você não tem permissão para ver ou fazer isto.";
  if (status === 404) return "Não encontrado.";
  if (status === 409) return "Esta ficha mudou enquanto a tela estava aberta. Veja o valor de agora.";
  if (status === 429) return "Muitos pedidos seguidos. Espere um minuto e tente de novo.";
  if (status >= 500) return "O servidor teve um problema agora. Tente de novo em instantes.";
  return "Não deu certo. Tente de novo.";
}

export interface OpcoesPedido {
  readonly metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly corpo?: unknown;
  readonly sinal?: AbortSignal;
}

/** GET/POST em /api/...; `corpo` vira JSON. A resposta com { sucesso: false } também é recusa. */
export async function pedir<T>(caminho: string, opcoes: OpcoesPedido = {}): Promise<Resultado<T>> {
  const p = ponte();
  const init: RequestInit = { method: opcoes.metodo ?? "GET" };
  if (opcoes.sinal) init.signal = opcoes.sinal;
  if (opcoes.corpo !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opcoes.corpo);
  }
  let res: Response;
  try {
    res = await p.pedir(p.apiBase + caminho, init);
  } catch (e) {
    const cancelado = e instanceof DOMException && e.name === "AbortError";
    // a sessão vencida (a casca já voltou para a entrada) também cai aqui: a tela só mostra a mensagem
    return { ok: false, mensagem: cancelado ? "" : SEM_REDE, status: 0, corpo: null, cancelado };
  }
  let corpo: unknown = null;
  try { corpo = await res.json(); } catch { corpo = null; }
  const recusou = !res.ok || (corpo !== null && typeof corpo === "object" && !Array.isArray(corpo) && (corpo as { sucesso?: unknown }).sucesso === false);
  if (recusou) return { ok: false, mensagem: mensagemDe(corpo, res.status), status: res.status, corpo, cancelado: false };
  return { ok: true, dados: corpo as T, status: res.status };
}

/** monta a query string só com o que tem valor */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && v !== false) u.set(k, String(v));
  const s = u.toString();
  return s ? "?" + s : "";
}
