/**
 * A lógica da aba "Pagamento" dos painéis (09/11/2026) — o formulário é `src/components/PainelPagamento.astro`. Preenche com o que está
 * gravado, liga o botão da chave Pix da Igreja, confere (`problemaPagamento`) e grava SÓ o campo `pagamento_config` do registro
 * (o "Salvar" dos dados não manda esse campo: um não apaga o outro). Sem o campo no Directus (o esquema ainda não foi aplicado), avisa e
 * não grava — a página pública continua dizendo que a forma de pagamento ainda não foi publicada.
 */
import { normalizarPagamento, problemaPagamento, temFormaDePagamento } from "@/lib/pagamentoEvento";

export const SEM_CAMPO_PAGAMENTO = "O Directus ainda não tem o campo da forma de pagamento: fale com o administrador.";

interface Opcoes {
  directusUrl: string;
  token: string;
  colecao: "eventos" | "camiseta_grupos";
  id: number;
  /** O registro como o Directus devolveu (com `*`): se não tiver `pagamento_config`, o campo ainda não existe. */
  registro: Record<string, unknown>;
  /** Tem valor a pagar? (mostra o alerta quando não há forma de pagamento) */
  temValor: () => boolean;
  /** Camiseta: o `pagamento_config` do evento vinculado, que vale quando a campanha não tem o seu. */
  herdado?: unknown;
  /** O `fetch` a usar (o painel de camisetas renova a sessão sozinho). */
  pedir?: (url: string, init: RequestInit) => Promise<Response>;
}

const texto = (o: unknown, chave: string) => {
  const v = o && typeof o === "object" ? (o as Record<string, unknown>)[chave] : null;
  return typeof v === "string" ? v : "";
};

export function ligarPainelPagamento(op: Opcoes) {
  const form = document.querySelector<HTMLFormElement>("[data-pagamento-form]");
  if (!form) return;
  const status = form.querySelector<HTMLElement>("[data-pagamento-status]");
  const alerta = form.querySelector<HTMLElement>("[data-pagamento-alerta]");
  const herdadoEl = form.querySelector<HTMLElement>("[data-pagamento-herdado]");
  const campo = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const fPixTipo = campo<HTMLSelectElement>("f-pix-tipo");
  const fPixChave = campo<HTMLInputElement>("f-pix-chave");
  const fPixNome = campo<HTMLInputElement>("f-pix-nome");
  const fDinContato = campo<HTMLInputElement>("f-din-contato");
  const fDinTelefone = campo<HTMLInputElement>("f-din-telefone");
  const fDinOnde = campo<HTMLInputElement>("f-din-onde");
  const fPagObs = campo<HTMLInputElement>("f-pag-obs");
  const pedir = op.pedir ?? ((url: string, init: RequestInit) => fetch(url, init));
  const disponivel = Object.prototype.hasOwnProperty.call(op.registro, "pagamento_config");
  let atual: unknown = op.registro.pagamento_config ?? null;
  const dizer = (t: string) => {
    if (status) status.textContent = t;
  };

  const herdadoVale = () => !temFormaDePagamento(normalizarPagamento(atual)) && temFormaDePagamento(normalizarPagamento(op.herdado));
  const atualizarAvisos = () => {
    const proprio = temFormaDePagamento(normalizarPagamento(atual));
    if (herdadoEl) {
      herdadoEl.hidden = !herdadoVale();
      herdadoEl.textContent = herdadoVale() ? "ℹ️ Hoje vale o \"como pagar\" do evento vinculado (esta campanha não tem um próprio)." : "";
    }
    if (alerta) alerta.hidden = !(op.temValor() && !proprio && !herdadoVale());
  };

  const o = atual && typeof atual === "object" ? (atual as Record<string, unknown>) : {};
  const pix = o.pix && typeof o.pix === "object" ? o.pix : null;
  const din = o.dinheiro && typeof o.dinheiro === "object" ? o.dinheiro : null;
  fPixTipo.value = texto(pix, "tipo");
  if (fPixTipo.value !== texto(pix, "tipo")) fPixTipo.value = "";
  fPixChave.value = texto(pix, "chave");
  fPixNome.value = texto(pix, "nome");
  fDinContato.value = texto(din, "contato");
  fDinTelefone.value = texto(din, "telefone");
  fDinOnde.value = texto(din, "onde");
  fPagObs.value = texto(o, "observacao");
  atualizarAvisos();
  form.hidden = false;
  if (!disponivel) dizer(SEM_CAMPO_PAGAMENTO);

  form.querySelector("[data-pix-igreja]")?.addEventListener("click", () => {
    fPixTipo.value = "cnpj";
    fPixChave.value = form.dataset.igrejaCnpj ?? "";
    fPixNome.value = form.dataset.igrejaNome ?? "";
    dizer("Chave da Igreja preenchida. Confira o nome e clique em Salvar.");
  });

  let ocupado = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ocupado) return;
    if (!disponivel) {
      dizer(SEM_CAMPO_PAGAMENTO);
      return;
    }
    const dados = {
      pix: fPixTipo.value ? { tipo: fPixTipo.value, chave: fPixChave.value.trim(), nome: fPixNome.value.trim() } : null,
      dinheiro:
        fDinContato.value.trim() || fDinTelefone.value.trim() || fDinOnde.value.trim()
          ? { contato: fDinContato.value.trim(), telefone: fDinTelefone.value.trim(), onde: fDinOnde.value.trim() }
          : null,
      observacao: fPagObs.value.trim(),
    };
    const problema = problemaPagamento(dados);
    if (problema) {
      dizer(problema);
      return;
    }
    const valor = dados.pix || dados.dinheiro || dados.observacao ? dados : null;
    ocupado = true;
    dizer("Salvando…");
    try {
      const res = await pedir(`${op.directusUrl}/items/${op.colecao}/${op.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${op.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pagamento_config: valor }),
      });
      if (!res.ok) throw new Error("salvar");
      atual = valor;
      atualizarAvisos();
      dizer(
        valor
          ? "✅ Forma de pagamento salva. O site atualiza sozinho em até uns 15 minutos."
          : herdadoVale()
            ? "✅ Apagada. Vale o \"como pagar\" do evento vinculado."
            : "✅ Apagada. A página vai avisar que a forma de pagamento ainda não foi publicada.",
      );
    } catch {
      dizer("Não foi possível salvar agora. Tente de novo em instantes.");
    } finally {
      ocupado = false;
    }
  });
}
