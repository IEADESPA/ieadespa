/**
 * "Informar o pagamento" (v7.13) — o formulário que aparece na página "Informar pagamento" do evento
 * (código + telefone), na Minha Conta (inscrições e pedidos de camiseta) e em "Meus pedidos de
 * camiseta" (telefone). A pessoa diz a data, o meio, o valor e o nome de quem pagou; a equipe confere
 * no extrato e confirma. Nunca marca como pago. A regra de verdade (datas, valor, nome) mora no
 * servidor (`api/src/lib/pagamentoInformado.js`); aqui só o desenho do formulário, a leitura dos
 * campos e o texto do aviso já informado.
 */

export interface PagamentoInformado {
  data: string | null;
  meio: string | null;
  meioRotulo?: string | null;
  valor: number | null;
  nome: string | null;
  em: string;
}

export const MEIOS_PAGAMENTO: { valor: string; rotulo: string }[] = [
  { valor: "PIX", rotulo: "Pix" },
  { valor: "TRANSFERENCIA", rotulo: "Transferência" },
  { valor: "DINHEIRO", rotulo: "Dinheiro" },
  { valor: "OUTRO", rotulo: "Outro" },
];

const escapar = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Hoje no fuso de Brasília (UTC-3), AAAA-MM-DD — o máximo do campo de data. */
export function hojeBrasilia(agora: number = Date.now()): string {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatarReais(valor: number | null | undefined): string {
  return `R$ ${Number(valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarDiaIso(dia: string | null | undefined): string {
  if (!dia) return "";
  const [a, m, d] = String(dia).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function formatarMomento(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Você informou: R$ 50,00 por Pix em 20/10/2026, pago por Maria (informado em 21/10/2026 10:30)." — ou null quando não há aviso. */
export function textoPagamentoInformado(aviso: PagamentoInformado | null | undefined, prefixo = "Você informou"): string | null {
  if (!aviso || !aviso.em) return null;
  const meio = aviso.meioRotulo || MEIOS_PAGAMENTO.find((m) => m.valor === aviso.meio)?.rotulo || aviso.meio || "";
  const partes = [`${prefixo}: ${formatarReais(aviso.valor)}`];
  if (meio) partes.push(`por ${meio}`);
  if (aviso.data) partes.push(`em ${formatarDiaIso(aviso.data)}`);
  let texto = partes.join(" ");
  if (aviso.nome) texto += `, pago por ${aviso.nome}`;
  return `${texto} (informado em ${formatarMomento(aviso.em)}).`;
}

/** O HTML do formulário (o `prefixo` separa os ids quando há vários formulários na mesma página). */
export function formularioPagamentoHtml(prefixo: string, sugestao: { valor?: number | null; nome?: string | null } = {}, agora: number = Date.now()): string {
  const id = (s: string) => `${escapar(prefixo)}-${s}`;
  const valor = sugestao.valor != null && Number(sugestao.valor) > 0 ? Number(sugestao.valor).toFixed(2) : "";
  return `
    <div class="grid gap-3 informar-pagamento-form" data-informar-pagamento-form>
      <div class="grid gap-1">
        <label class="text-sm font-semibold" for="${id("data")}">Data do pagamento</label>
        <input id="${id("data")}" type="date" class="field" max="${hojeBrasilia(agora)}" required data-pag-data />
      </div>
      <div class="grid gap-1">
        <label class="text-sm font-semibold" for="${id("meio")}">Como pagou</label>
        <select id="${id("meio")}" class="field" required data-pag-meio>
          <option value="">Selecione…</option>
          ${MEIOS_PAGAMENTO.map((m) => `<option value="${m.valor}">${m.rotulo}</option>`).join("")}
        </select>
      </div>
      <div class="grid gap-1">
        <label class="text-sm font-semibold" for="${id("valor")}">Valor pago (R$)</label>
        <input id="${id("valor")}" type="text" inputmode="decimal" class="field" required placeholder="50,00" value="${escapar(valor.replace(".", ","))}" data-pag-valor />
      </div>
      <div class="grid gap-1">
        <label class="text-sm font-semibold" for="${id("nome")}">Nome de quem pagou</label>
        <input id="${id("nome")}" type="text" class="field" maxlength="120" required autocomplete="name" value="${escapar(sugestao.nome ?? "")}" data-pag-nome />
        <p class="text-xs text-muted-foreground">Como aparece no extrato (pode ser outra pessoa que pagou por você).</p>
      </div>
      <p class="text-xs text-muted-foreground">Não precisa mandar comprovante: a equipe confere no extrato e confirma. Se informar de novo, vale o último aviso.</p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="btn btn-solid" data-pag-enviar>Informar pagamento</button>
        <p class="text-sm" role="status" aria-live="polite" data-pag-status></p>
      </div>
    </div>`;
}

/** Lê o formulário. Só o mínimo (campos preenchidos); o servidor confere o resto e responde em português. */
export function lerFormularioPagamento(raiz: ParentNode): { ok: true; pagamento: { data: string; meio: string; valor: string; nome: string } } | { ok: false; erro: string } {
  const valorDe = (sel: string) => ((raiz.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "").trim();
  const pagamento = { data: valorDe("[data-pag-data]"), meio: valorDe("[data-pag-meio]"), valor: valorDe("[data-pag-valor]"), nome: valorDe("[data-pag-nome]") };
  if (!pagamento.data) return { ok: false, erro: "Informe a data do pagamento." };
  if (!pagamento.meio) return { ok: false, erro: "Escolha como pagou." };
  if (!pagamento.valor) return { ok: false, erro: "Informe o valor pago." };
  if (!pagamento.nome) return { ok: false, erro: "Informe o nome de quem pagou." };
  return { ok: true, pagamento };
}

/**
 * Liga o botão do formulário: lê, envia para `url` com `corpoBase` (a prova de quem é: código+telefone, token da conta ou telefone do pedido) e mostra o resultado.
 * `aoInformar` recebe o aviso gravado (para a página atualizar o texto "Você informou…").
 */
export function ligarFormularioPagamento(raiz: HTMLElement, url: string, corpoBase: Record<string, unknown>, aoInformar?: (aviso: PagamentoInformado) => void) {
  const botao = raiz.querySelector<HTMLButtonElement>("[data-pag-enviar]");
  const status = raiz.querySelector<HTMLElement>("[data-pag-status]");
  botao?.addEventListener("click", async () => {
    const lido = lerFormularioPagamento(raiz);
    if (!lido.ok) {
      if (status) status.textContent = lido.erro;
      return;
    }
    botao.disabled = true;
    if (status) status.textContent = "Enviando…";
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpoBase, pagamento: lido.pagamento }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        if (status) status.textContent = json?.erro || "Não foi possível informar agora. Tente de novo em instantes.";
        return;
      }
      if (status) status.textContent = "✅ Pagamento informado. A equipe vai conferir no extrato e confirmar.";
      if (aoInformar && json.informado) aoInformar(json.informado);
    } catch {
      if (status) status.textContent = "Sem conexão. Tente de novo em instantes.";
    } finally {
      botao.disabled = false;
    }
  });
}
