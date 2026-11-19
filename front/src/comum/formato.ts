// Datas, números e nomes no padrão brasileiro (datas dd/mm/aaaa, milhar com ponto, vírgula decimal).

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const RX_DATA = /^(\d{4})-(\d{2})-(\d{2})/;
const RX_MES = /^(\d{4})-(\d{2})/;

/** "2026-11-19" ou ISO -> "19/11/2026"; vazio ou inválido -> "" */
export function dataBr(iso: string | null | undefined): string {
  const m = iso ? RX_DATA.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
/** "2023-03-10" -> "03/2023" */
export function mesAnoBr(iso: string | null | undefined): string {
  const m = iso ? RX_MES.exec(iso) : null;
  return m ? `${m[2]}/${m[1]}` : "";
}
export function anoDe(iso: string | null | undefined): string {
  const m = iso ? RX_MES.exec(iso) : null;
  return m ? (m[1] ?? "") : "";
}
/** "2026-11" -> "nov" */
export function mesCurto(aaaamm: string): string {
  const m = RX_MES.exec(aaaamm);
  return m ? MESES[Number(m[2]) - 1] ?? "" : "";
}
/** "2026-11" -> "novembro" */
export function mesLongo(aaaamm: string): string {
  const m = RX_MES.exec(aaaamm);
  return m ? MESES_LONGOS[Number(m[2]) - 1] ?? "" : "";
}
export function numero(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0";
}
export function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}
export function plural(n: number, um: string, varios: string): string { return n === 1 ? um : varios; }

/** idade completa em anos numa data (fuso do aparelho) */
export function idade(nascimento: string | null | undefined, hoje: Date = new Date()): number | null {
  const m = nascimento ? RX_DATA.exec(nascimento) : null;
  if (!m) return null;
  const a = Number(m[1]), me = Number(m[2]), d = Number(m[3]);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < me || (hoje.getMonth() + 1 === me && hoje.getDate() < d)) anos--;
  return anos >= 0 && anos < 130 ? anos : null;
}
export function iniciais(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  const primeira = p[0]?.[0] ?? "";
  const ultima = p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}
export function primeiroNome(nome: string | null | undefined): string { return String(nome ?? "").trim().split(/\s+/)[0] ?? ""; }

/** "(91) 98877-7777" -> "(91) 9****-7777" */
export function telefoneMascarado(t: string | null | undefined): string {
  const d = String(t ?? "").replace(/\D/g, "");
  if (d.length < 8) return String(t ?? "");
  return `(${d.slice(0, 2)}) ${d.length > 10 ? d.slice(2, 3) : ""}****-${d.slice(-4)}`;
}

/** "hoje", "ontem", "há 3 dias" a partir de uma data ISO */
export function haQuanto(iso: string | null | undefined, hoje: Date = new Date()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const dias = Math.floor((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export interface PedacoRealce { readonly t: string; readonly marca: boolean }
/** os pedaços de um texto que batem com a busca, para o realce (sem diferença de acento nem de maiúscula) */
export function partesRealce(texto: string, busca: string): PedacoRealce[] {
  const q = semAcento(busca.trim());
  if (!q) return [{ t: texto, marca: false }];
  const alvo = semAcento(texto);
  const saida: PedacoRealce[] = [];
  let i = 0;
  for (;;) {
    const j = alvo.indexOf(q, i);
    if (j < 0) break;
    if (j > i) saida.push({ t: texto.slice(i, j), marca: false });
    saida.push({ t: texto.slice(j, j + q.length), marca: true });
    i = j + q.length;
  }
  if (i < texto.length) saida.push({ t: texto.slice(i), marca: false });
  return saida;
}
// tira os acentos sem mudar o tamanho do texto (cada letra acentuada vira uma letra só), para o realce cair no lugar certo
export function semAcento(s: string): string {
  let r = "";
  for (const ch of s) {
    const base = ch.normalize("NFD").charAt(0);
    r += (ch.length === 1 ? base : ch).toLowerCase();
  }
  return r;
}
