/**
 * Como pagar a inscrição de um evento (09/11/2026, pedido do responsável): a página do evento avisava "a Igreja não entra em contato
 * pedindo Pix — pague só pelos dados mostrados aqui no site", mas não mostrava dado nenhum. Cada evento passa a ter, no campo JSON
 * `eventos.pagamento_config` (Directus), a chave Pix e/ou o contato de quem recebe em dinheiro, preenchidos na aba "Pagamento" do
 * painel de eventos. Este arquivo é a regra pura (sem rede), usada pela página do evento, pela "Informar pagamento", pelo painel
 * e pelo teste `scripts/testes/pagamento-evento-unidade.cjs`.
 *
 * O campo é lido pelo público (como o resto do evento): só entra o que é para todo mundo ver. Lido sempre por `normalizarPagamento`,
 * que nunca quebra a montagem do site — qualquer coisa fora do formato vira "sem esse dado".
 */

export type TipoChavePix = "cnpj" | "cpf" | "email" | "celular" | "aleatoria";

export interface PixEvento {
  tipo: TipoChavePix;
  /** A chave como a pessoa digitou (só para mostrar). */
  chave: string;
  /** O nome que o app do banco mostra para quem vai pagar — a pessoa confere antes de confirmar. */
  nome: string;
}

export interface DinheiroEvento {
  /** Quem recebe em dinheiro. */
  contato: string;
  /** Telefone/WhatsApp, só dígitos com DDD (10 ou 11), ou vazio. */
  telefone: string;
  /** Onde e quando (ex.: "Secretaria da sede, terça a sexta, 8h às 12h"), ou vazio. */
  onde: string;
}

export interface PagamentoEvento {
  pix: PixEvento | null;
  dinheiro: DinheiroEvento | null;
  /** Um recado curto (ex.: "Pague até 20/11; depois, informe o pagamento aqui no site"), ou vazio. */
  observacao: string;
}

export const TIPOS_CHAVE_PIX: { valor: TipoChavePix; rotulo: string }[] = [
  { valor: "cnpj", rotulo: "CNPJ" },
  { valor: "cpf", rotulo: "CPF" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "celular", rotulo: "Celular" },
  { valor: "aleatoria", rotulo: "Chave aleatória" },
];

export const LIMITES_PAGAMENTO = { chave: 77, nome: 60, contato: 80, onde: 160, observacao: 300 } as const;

const VAZIO: PagamentoEvento = { pix: null, dinheiro: null, observacao: "" };

const digitos = (texto: string) => texto.replace(/\D/g, "");
/** Caracteres de controle e invisíveis (inclusive os que invertem o texto), montados pelo número — escritos à mão no código eles se perdem. */
const INVISIVEIS = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`,
  "g",
);
/** Texto de uma linha só: sem caractere de controle nem invisível, espaços juntados, cortado no limite. */
function linha(valor: unknown, limite: number): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(INVISIVEIS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALEATORIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Celular brasileiro com DDD: 11 dígitos começando pelo 9 depois do DDD (aceita com +55 ou 55 na frente). */
function celularDigitos(texto: string): string | null {
  let d = digitos(texto);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  return /^[1-9][0-9]9\d{8}$/.test(d) ? d : null;
}

/** A chave no formato que vai no código Pix (BR Code), ou `null` se não confere com o tipo. */
export function chaveParaPix(tipo: TipoChavePix, chave: string): string | null {
  const texto = linha(chave, 120);
  if (!texto) return null;
  if (tipo === "cpf") return cpfValido(digitos(texto)) ? digitos(texto) : null;
  if (tipo === "cnpj") return cnpjValido(digitos(texto)) ? digitos(texto) : null;
  if (tipo === "email") {
    const e = texto.toLowerCase();
    return EMAIL.test(e) && e.length <= LIMITES_PAGAMENTO.chave ? e : null;
  }
  if (tipo === "celular") {
    const c = celularDigitos(texto);
    return c ? `+55${c}` : null;
  }
  if (tipo === "aleatoria") {
    const a = texto.toLowerCase();
    return ALEATORIA.test(a) ? a : null;
  }
  return null;
}

/** O que o painel recusa antes de gravar (texto para a pessoa), ou `null` quando pode gravar. */
export function problemaPagamento(p: { pix: { tipo: string; chave: string; nome: string } | null; dinheiro: { contato: string; telefone: string; onde: string } | null }): string | null {
  if (p.pix) {
    const tipo = TIPOS_CHAVE_PIX.find((t) => t.valor === p.pix?.tipo);
    if (!tipo) return "Escolha o tipo da chave Pix.";
    if (!linha(p.pix.chave, 120)) return "Digite a chave Pix.";
    if (!chaveParaPix(tipo.valor, p.pix.chave)) {
      if (tipo.valor === "cpf") return "Esse CPF não confere (confira os números).";
      if (tipo.valor === "cnpj") return "Esse CNPJ não confere (confira os números).";
      if (tipo.valor === "email") return "Esse e-mail não parece certo.";
      if (tipo.valor === "celular") return "O celular precisa ter o DDD e o 9 na frente, por exemplo (94) 99123-4567.";
      return "A chave aleatória tem o formato 123e4567-e89b-12d3-a456-426614174000 (copie do app do banco).";
    }
    if (!linha(p.pix.nome, LIMITES_PAGAMENTO.nome)) return "Digite o nome que aparece no banco para essa chave (quem vai pagar confere esse nome).";
  }
  if (p.dinheiro) {
    if (!linha(p.dinheiro.contato, LIMITES_PAGAMENTO.contato)) return "Digite o nome de quem recebe em dinheiro.";
    const tel = digitos(p.dinheiro.telefone || "");
    if (tel && !telefoneDigitos(p.dinheiro.telefone)) return "O telefone precisa ter o DDD, por exemplo (94) 99123-4567.";
    if (!tel && !linha(p.dinheiro.onde, LIMITES_PAGAMENTO.onde)) return "Para o dinheiro, informe o telefone de quem recebe ou onde e quando entregar.";
  }
  return null; // nada preenchido também vale: o evento não mostra forma de pagamento (é o caso do evento sem valor)
}

/** Telefone só com os dígitos do Brasil (DDD + número), ou "". */
function telefoneDigitos(texto: unknown): string {
  if (typeof texto !== "string") return "";
  let d = digitos(texto);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return /^[1-9][0-9]\d{8,9}$/.test(d) ? d : "";
}

/** Lê o campo do Directus (qualquer coisa) e devolve só o que está certo. Nunca lança. */
export function normalizarPagamento(bruto: unknown): PagamentoEvento {
  let obj: unknown = bruto;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return { ...VAZIO };
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ...VAZIO };
  const o = obj as Record<string, unknown>;

  let pix: PixEvento | null = null;
  const px = o.pix && typeof o.pix === "object" && !Array.isArray(o.pix) ? (o.pix as Record<string, unknown>) : null;
  if (px) {
    const tipo = TIPOS_CHAVE_PIX.find((t) => t.valor === px.tipo)?.valor;
    const chave = linha(px.chave, 120);
    const nome = linha(px.nome, LIMITES_PAGAMENTO.nome);
    if (tipo && chave && nome && chaveParaPix(tipo, chave)) pix = { tipo, chave, nome };
  }

  let dinheiro: DinheiroEvento | null = null;
  const dn = o.dinheiro && typeof o.dinheiro === "object" && !Array.isArray(o.dinheiro) ? (o.dinheiro as Record<string, unknown>) : null;
  if (dn) {
    const contato = linha(dn.contato, LIMITES_PAGAMENTO.contato);
    const telefone = telefoneDigitos(dn.telefone);
    const onde = linha(dn.onde, LIMITES_PAGAMENTO.onde);
    if (contato && (telefone || onde)) dinheiro = { contato, telefone, onde };
  }

  return { pix, dinheiro, observacao: linha(o.observacao, LIMITES_PAGAMENTO.observacao) };
}

export const temFormaDePagamento = (p: PagamentoEvento) => Boolean(p.pix || p.dinheiro);

/** "(94) 99123-4567" a partir dos dígitos com DDD. */
export function formatarTelefone(d: string): string {
  if (/^\d{11}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (/^\d{10}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Link do WhatsApp (só para celular: 11 dígitos), ou `null`. */
export const linkWhatsApp = (d: string): string | null => (/^\d{2}9\d{8}$/.test(d) ? `https://wa.me/55${d}` : null);

export const rotuloTipoChave = (tipo: TipoChavePix) => TIPOS_CHAVE_PIX.find((t) => t.valor === tipo)?.rotulo ?? "";

/** Os dados do código Pix (o mesmo da página de doações: nome e cidade do recebedor), ou `null` sem Pix. */
export function dadosDoCodigoPix(p: PagamentoEvento, cidade: string): { chave: string; nome: string; cidade: string } | null {
  if (!p.pix) return null;
  const chave = chaveParaPix(p.pix.tipo, p.pix.chave);
  return chave ? { chave, nome: p.pix.nome, cidade: cidade || "BRASIL" } : null;
}
