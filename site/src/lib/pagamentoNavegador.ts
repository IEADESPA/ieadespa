/**
 * "Como pagar" no navegador (09/11/2026): desenha o QR Code Pix, liga os botões de copiar e, depois da inscrição, mostra o valor a
 * pagar com um Pix Copia e Cola que já abre com o valor certo. Usado pelo componente `ComoPagar.astro`.
 *
 * Roda em `astro:page-load` (a carga inicial E cada troca de página do ClientRouter — um script de módulo roda uma vez só por carga
 * de verdade) e é idempotente: cada elemento é ligado uma vez só. A página de inscrição (script inline, sem import) chama
 * `window.ieadespaPagamento.mostrarValor(alvo, total)`.
 */
import { buildPixPayload, valorPix } from "@/lib/pix";

interface CodigoPix {
  chave: string;
  nome: string;
  cidade: string;
}

declare global {
  interface Window {
    qrcode?: (tipo: number, correcao: string) => { addData(d: string): void; make(): void; createImgTag(cell: number, margin: number, alt: string): string };
    ieadespaPagamento?: { mostrarValor(alvo: HTMLElement, total: number): void };
  }
}

const BIBLIOTECA_QR = "/vendor/qrcode-generator-2.0.4.min.js";
let carregandoQr: Promise<void> | null = null;

/** A biblioteca do QR (a mesma do crachá e do check-in). Na troca de página ela pode não estar carregada: busca uma vez só. */
function bibliotecaQr(): Promise<void> {
  if (window.qrcode) return Promise.resolve();
  if (!carregandoQr) {
    carregandoQr = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = BIBLIOTECA_QR;
      s.onload = () => ok();
      s.onerror = () => {
        carregandoQr = null;
        falha(new Error("qr"));
      };
      document.head.appendChild(s);
    });
  }
  return carregandoQr;
}

async function desenharQr(el: HTMLElement, payload: string, descricao: string) {
  try {
    await bibliotecaQr();
    if (!window.qrcode) return;
    const qr = window.qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    el.innerHTML = qr.createImgTag(5, 8, descricao);
  } catch {
    el.hidden = true; // sem o QR, fica o Copia e Cola e a chave
  }
}

function ligarCopiar(botao: HTMLButtonElement) {
  if (botao.dataset.copiarLigado) return;
  botao.dataset.copiarLigado = "1";
  botao.addEventListener("click", async () => {
    const original = botao.dataset.copiarRotulo || botao.textContent || "";
    botao.dataset.copiarRotulo = original;
    try {
      await navigator.clipboard.writeText(botao.dataset.copiar ?? "");
      botao.textContent = "✅ Copiado!";
    } catch {
      botao.textContent = "Não deu para copiar: selecione e copie à mão";
    }
    setTimeout(() => {
      botao.textContent = original;
    }, 2500);
  });
}

function codigoDaPagina(): CodigoPix | null {
  const raiz = document.querySelector<HTMLElement>("[data-como-pagar]");
  const bruto = raiz?.dataset.pixCodigo;
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto) as Partial<CodigoPix>;
    return typeof c.chave === "string" && typeof c.nome === "string" && typeof c.cidade === "string" ? { chave: c.chave, nome: c.nome, cidade: c.cidade } : null;
  } catch {
    return null;
  }
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Depois da inscrição: o valor a pagar e, com Pix, o código que já abre com esse valor. Sem valor (cortesia, cupom de 100%), some. */
function mostrarValor(alvo: HTMLElement, total: number) {
  alvo.textContent = "";
  if (!(total > 0) || !valorPix(total)) {
    alvo.hidden = true;
    return;
  }
  const titulo = document.createElement("p");
  titulo.className = "font-semibold";
  titulo.textContent = `Valor a pagar: ${reais(total)}`;
  alvo.appendChild(titulo);

  const codigo = codigoDaPagina();
  const temDinheiro = Boolean(document.querySelector("[data-como-pagar-dinheiro]"));
  if (codigo) {
    const payload = buildPixPayload({ ...codigo, valor: total });
    const texto = document.createElement("p");
    texto.className = "text-sm mt-1";
    texto.textContent = "Pague pelo Pix com o QR Code ou o Copia e Cola abaixo: o app do banco já abre com esse valor. Confira o nome do recebedor antes de confirmar.";
    alvo.appendChild(texto);
    const qr = document.createElement("div");
    qr.className = "como-pagar-qr mt-2";
    qr.setAttribute("aria-hidden", "true");
    alvo.appendChild(qr);
    void desenharQr(qr, payload, `QR Code Pix de ${reais(total)}`);
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn btn-outline mt-2";
    botao.dataset.copiar = payload;
    botao.textContent = `Copiar código Pix de ${reais(total)} (Copia e Cola)`;
    alvo.appendChild(botao);
    ligarCopiar(botao);
  } else {
    const texto = document.createElement("p");
    texto.className = "text-sm mt-1";
    texto.textContent = temDinheiro ? "Veja em \"Como pagar\", nesta página, com quem acertar o pagamento." : "A forma de pagamento ainda não foi publicada nesta página. Não pague a ninguém que entrar em contato pedindo.";
    alvo.appendChild(texto);
  }
  const depois = document.createElement("p");
  depois.className = "text-sm mt-2";
  depois.textContent = "Depois de pagar, informe o pagamento com o código da inscrição (link logo acima): a equipe confere no extrato.";
  alvo.appendChild(depois);
  alvo.hidden = false;
}

function iniciar() {
  for (const el of document.querySelectorAll<HTMLElement>("[data-pix-qrcode]")) {
    if (el.dataset.qrLigado || !el.dataset.pixPayload) continue;
    el.dataset.qrLigado = "1";
    void desenharQr(el, el.dataset.pixPayload, "QR Code Pix. Se preferir, use o botão de copiar o código Pix logo abaixo.");
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-copiar]")) ligarCopiar(b);
  window.ieadespaPagamento = { mostrarValor };
}

export function instalarComoPagar() {
  document.addEventListener("astro:page-load", iniciar);
  if (document.readyState !== "loading") iniciar(); // se o evento já passou antes deste módulo carregar
}
