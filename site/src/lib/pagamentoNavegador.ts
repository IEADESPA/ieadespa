/**
 * "Como pagar" no navegador (09/11/2026): desenha o QR Code Pix, liga os botões de copiar e, depois da inscrição, mostra o valor a
 * pagar com um Pix Copia e Cola que já abre com o valor certo. Usado pelo componente `ComoPagar.astro`.
 *
 * Roda em `astro:page-load` (a carga inicial E cada troca de página do ClientRouter — um script de módulo roda uma vez só por carga
 * de verdade) e é idempotente: cada elemento é ligado uma vez só. A página de inscrição (script inline, sem import) chama
 * `window.ieadespaPagamento.mostrarValor(alvo, total)`.
 */
import { buildPixPayload, valorPix } from "@/lib/pix";
import { chaveParaPix, dadosDoCodigoPix, formatarTelefone, linkWhatsApp, pagamentoDaCampanha, rotuloTipoChave, temFormaDePagamento } from "@/lib/pagamentoEvento";

interface CodigoPix {
  chave: string;
  nome: string;
  cidade: string;
}

declare global {
  interface Window {
    qrcode?: (tipo: number, correcao: string) => { addData(d: string): void; make(): void; createImgTag(cell: number, margin: number, alt: string): string };
    ieadespaPagamento?: { mostrarValor(alvo: HTMLElement, total: number, depois?: string): void };
  }
}

const BIBLIOTECA_QR = "/vendor/qrcode-generator-2.0.4.min.js";
let carregandoQr: Promise<void> | null = null;

/** A biblioteca do QR (a mesma do crachá e do check-in). Na troca de página ela pode não estar carregada: busca uma vez só. */
export function bibliotecaQr(): Promise<void> {
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

const DEPOIS_INSCRICAO = "Depois de pagar, informe o pagamento com o código da inscrição (link logo acima): a equipe confere no extrato.";

/** Depois da inscrição (ou do pedido): o valor a pagar e, com Pix, o código que já abre com esse valor. Sem valor (cortesia, cupom de 100%), some. */
function mostrarValor(alvo: HTMLElement, total: number, depoisTexto: string = DEPOIS_INSCRICAO) {
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
  depois.textContent = depoisTexto;
  alvo.appendChild(depois);
  alvo.hidden = false;
}

const elemento = (tag: string, texto?: string, classe?: string) => {
  const e = document.createElement(tag);
  if (texto != null) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
};

/**
 * "Meus pedidos" e "Minha Conta" (09/11/2026): dentro do pedido que ainda deve, como pagar o que falta — o "como pagar" da campanha (ou
 * do evento vinculado), com um Pix Copia e Cola de exatamente o que falta e o QR só quando a pessoa pede. `bruto` é o que a API devolve
 * (`comoPagar: { campanha, evento }`, JSON cru do Directus); tudo é montado com textContent e os links só com dígitos.
 */
export function preencherComoPagarPedido(alvo: HTMLElement, bruto: { campanha?: unknown; evento?: unknown } | null | undefined, falta: number, cidade: string) {
  alvo.textContent = "";
  if (!(falta > 0) || !valorPix(falta)) {
    alvo.hidden = true;
    return;
  }
  const pagamento = pagamentoDaCampanha(bruto?.campanha, bruto?.evento);
  alvo.appendChild(elemento("p", `Como pagar o que falta (${reais(falta)})`, "font-semibold"));
  if (!temFormaDePagamento(pagamento)) {
    alvo.appendChild(elemento("p", "A forma de pagamento ainda não foi publicada aqui. Não pague a ninguém que entrar em contato pedindo.", "text-sm mt-1"));
    alvo.hidden = false;
    return;
  }
  if (pagamento.pix) {
    alvo.appendChild(elemento("p", `Pix — chave (${rotuloTipoChave(pagamento.pix.tipo)}): ${pagamento.pix.chave}`, "text-sm mt-1"));
    alvo.appendChild(elemento("p", `Antes de confirmar, confira no app do banco se o recebedor é ${pagamento.pix.nome}.`, "text-sm"));
    const codigo = dadosDoCodigoPix(pagamento, cidade);
    const chave = chaveParaPix(pagamento.pix.tipo, pagamento.pix.chave);
    const botoes = elemento("div", undefined, "flex flex-wrap gap-2 mt-2");
    if (codigo) {
      const payload = buildPixPayload({ ...codigo, valor: falta });
      const copiar = elemento("button", `Copiar código Pix de ${reais(falta)} (Copia e Cola)`, "btn btn-outline") as HTMLButtonElement;
      copiar.type = "button";
      copiar.dataset.copiar = payload;
      ligarCopiar(copiar);
      botoes.appendChild(copiar);
      const verQr = elemento("button", "Mostrar o QR Code", "btn btn-outline") as HTMLButtonElement;
      verQr.type = "button";
      const qr = elemento("div", undefined, "como-pagar-qr mt-2");
      qr.hidden = true;
      verQr.addEventListener("click", () => {
        qr.hidden = false;
        verQr.hidden = true;
        void desenharQr(qr, payload, `QR Code Pix de ${reais(falta)}`);
      });
      botoes.appendChild(verQr);
      alvo.appendChild(botoes);
      alvo.appendChild(qr);
    } else if (chave) {
      const copiar = elemento("button", "Copiar a chave", "btn btn-outline") as HTMLButtonElement;
      copiar.type = "button";
      copiar.dataset.copiar = chave;
      ligarCopiar(copiar);
      botoes.appendChild(copiar);
      alvo.appendChild(botoes);
    }
  }
  if (pagamento.dinheiro) {
    const p = elemento("p", undefined, "text-sm mt-2");
    p.appendChild(document.createTextNode(`Em dinheiro: fale com ${pagamento.dinheiro.contato}`));
    const tel = pagamento.dinheiro.telefone;
    if (tel) {
      p.appendChild(document.createTextNode(" pelo telefone "));
      const a = elemento("a", formatarTelefone(tel), "text-accent underline") as HTMLAnchorElement;
      a.href = `tel:+55${tel.replace(/\D/g, "")}`;
      p.appendChild(a);
      const zap = linkWhatsApp(tel);
      if (zap) {
        p.appendChild(document.createTextNode(" ("));
        const w = elemento("a", "WhatsApp", "text-accent underline") as HTMLAnchorElement;
        w.href = zap;
        w.target = "_blank";
        w.rel = "noopener noreferrer";
        p.appendChild(w);
        p.appendChild(document.createTextNode(")"));
      }
    }
    p.appendChild(document.createTextNode("."));
    alvo.appendChild(p);
    if (pagamento.dinheiro.onde) alvo.appendChild(elemento("p", pagamento.dinheiro.onde, "text-sm"));
  }
  if (pagamento.observacao) alvo.appendChild(elemento("p", pagamento.observacao, "text-sm mt-1"));
  alvo.appendChild(elemento("p", "Depois de pagar, use \"Informar pagamento\" aqui embaixo: a equipe confere no extrato.", "text-sm mt-2"));
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
