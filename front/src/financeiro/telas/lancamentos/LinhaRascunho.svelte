<!-- Uma folha que se digita na planilha (r24-lancamento, opção 1): a folha livre, a que ficou para trás sem destino ("pendente") e a que veio
     marcada "mês posterior" do mês anterior ("preencher": o nome e o valor obrigatórios, o "Referente a" já decidido e sem "marcada em
     novembro", a resposta 5 de 26/11/2026). A linha em que a pessoa está fica amarela, com o traço dourado à esquerda (a ativa do desenho);
     as outras parecem texto.
     - Tipo: Dízimo, Oferta de culto, Oferta voluntária (teclas D, C, V) e, na folha nova, a folha que não foi usada (cancelada, arrancada,
       inexistente: a decisão 4 corrigida de 26/11/2026), que pede o motivo no lugar de quem deu.
     - Forma: Pix ou Espécie (P, E). A voluntária junto só com o dízimo. "Mês posterior": sem nome e sem valor.
     - Enter vai para a próxima folha (no "Quem deu" com a lista aberta, Enter escolhe o marcado). -->
<script lang="ts">
  import type { FormaLancamento, TipoLancamento } from "../../tipos";
  import { MARCAS_DA_PLANILHA, NOME_MARCA, ehMarca, folhaTxt, nomeDoMes, soValor, type Pessoa, type Rascunho } from "../../lancamentos";
  import QuemDeu from "./QuemDeu.svelte";

  interface Props {
    r: Rascunho;
    /** o mês seguinte ao da planilha (onde entra a folha marcada "mês posterior") */
    mesSeguinte: string;
    /** a última linha, ainda vazia: "a próxima folha (Enter)" */
    proxima: boolean;
    erro: boolean;
    desligado: boolean;
    onmudar: (patch: Partial<Rascunho>) => void;
    onenter: () => void;
  }
  let { r, mesSeguinte, proxima, erro, desligado, onmudar, onenter }: Props = $props();

  const TECLA_TIPO: Record<string, TipoLancamento> = { d: "DIZIMO", c: "OFERTA_CULTO", v: "OFERTA_VOLUNTARIA" };
  const TECLA_FORMA: Record<string, FormaLancamento> = { p: "PIX", e: "ESPECIE" };

  const marca = $derived(ehMarca(r.tipo));
  const posterior = $derived(r.como === "nova" && r.referente === "MES_POSTERIOR");
  const semValor = $derived(marca || posterior);

  function teclaTipo(e: KeyboardEvent): void {
    const t = TECLA_TIPO[e.key.toLowerCase()];
    if (t && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); onmudar({ tipo: t, ...(t !== "DIZIMO" ? { voluntaria: "" } : {}) }); }
  }
  function teclaForma(e: KeyboardEvent): void {
    const f = TECLA_FORMA[e.key.toLowerCase()];
    if (f && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); onmudar({ forma: f }); }
  }
  function escolheuTipo(v: string): void {
    if (!v) { onmudar({ tipo: null }); return; }
    if (ehMarca(v as Rascunho["tipo"])) { onmudar({ tipo: v as Rascunho["tipo"], forma: null, valor: "", voluntaria: "", pessoa: null, referente: "ESTE_MES" }); return; }
    onmudar({ tipo: v as TipoLancamento, motivo: "", ...(v !== "DIZIMO" ? { voluntaria: "" } : {}) });
  }
  // Enter num campo (não num botão, que se aperta) vai para a próxima folha; o "Quem deu" já cuidou do dele
  function teclas(e: KeyboardEvent): void {
    if (e.key !== "Enter" || e.defaultPrevented || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    onenter();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="linha" class:preencher={r.como === "preencher"} class:erro class:vazia={proxima} onkeydown={teclas} data-folha={r.folha} role="row" tabindex="-1">
  <span class="folha" role="cell">
    {#if r.como === "preencher"}
      <strong>{folhaTxt(r.folha)}<span class="obrig">*</span></strong><span class="sub">nome e valor</span>
    {:else}{folhaTxt(r.folha)}{/if}
  </span>

  <span class="quem" role="cell">
    {#if marca}
      <span class="chip">{NOME_MARCA[String(r.tipo).toUpperCase()]}</span>
      <input class="motivo" value={r.motivo} maxlength="300" placeholder="motivo (o que aconteceu)" aria-label={`Motivo da folha ${folhaTxt(r.folha)}`}
        data-quem={r.folha} disabled={desligado} oninput={(e) => onmudar({ motivo: (e.currentTarget as HTMLInputElement).value })} />
    {:else if posterior}
      <span class="sem">sem nome e sem valor · entra em {nomeDoMes(mesSeguinte)}</span>
      <button type="button" class="tirar" data-quem={r.folha} onclick={() => onmudar({ referente: "ESTE_MES" })}>voltar a “Este mês”</button>
    {:else}
      <QuemDeu pessoa={r.pessoa} folha={r.folha} plano placeholder={proxima ? "a próxima folha (Enter)" : ""} {desligado}
        onpessoa={(p: Pessoa) => onmudar({ pessoa: p })} {onenter} />
    {/if}
  </span>

  <span role="cell">
    {#if posterior}<span class="tra">—</span>{:else}
      <select class="sel" value={r.tipo ?? ""} disabled={desligado} aria-label={`Tipo da folha ${folhaTxt(r.folha)}`} onkeydown={teclaTipo}
        onchange={(e) => escolheuTipo((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">{proxima ? "" : "—"}</option>
        <option value="DIZIMO">Dízimo</option>
        <option value="OFERTA_CULTO">Oferta de culto</option>
        <option value="OFERTA_VOLUNTARIA">Oferta voluntária</option>
        {#if r.como === "nova"}
          <optgroup label="A folha não foi usada">
            {#each MARCAS_DA_PLANILHA as m (m.chave)}<option value={m.chave}>{m.rotulo}</option>{/each}
          </optgroup>
        {/if}
      </select>
    {/if}
  </span>

  <span role="cell">
    {#if semValor}<span class="tra">—</span>{:else}
      <select class="sel" value={r.forma ?? ""} disabled={desligado} aria-label={`Forma da folha ${folhaTxt(r.folha)}`} onkeydown={teclaForma}
        onchange={(e) => onmudar({ forma: ((e.currentTarget as HTMLSelectElement).value || null) as FormaLancamento | null })}>
        <option value="">{proxima ? "" : "—"}</option>
        <option value="PIX">Pix</option>
        <option value="ESPECIE">Espécie</option>
      </select>
    {/if}
  </span>

  <span class="dir" role="cell">
    {#if semValor}<span class="tra">—</span>{:else}
      <input class="valor" value={r.valor} inputmode="decimal" autocomplete="off" disabled={desligado} aria-label={`Valor da folha ${folhaTxt(r.folha)}`}
        oninput={(e) => { const el = e.currentTarget as HTMLInputElement; const v = soValor(el.value); el.value = v; onmudar({ valor: v }); }} />
    {/if}
  </span>

  <span role="cell">
    {#if semValor || (r.tipo !== null && r.tipo !== "DIZIMO")}<span class="tra">—</span>{:else}
      <input class="vol" value={r.voluntaria} inputmode="decimal" autocomplete="off" disabled={desligado} placeholder={proxima ? "" : "—"} aria-label={`Oferta voluntária junto, folha ${folhaTxt(r.folha)}`}
        oninput={(e) => { const el = e.currentTarget as HTMLInputElement; const v = soValor(el.value); el.value = v; onmudar({ voluntaria: v }); }} />
    {/if}
  </span>

  <span role="cell">
    {#if r.como === "nova" && !marca}
      <span class="pilulas" role="group" aria-label={`Referente a, folha ${folhaTxt(r.folha)}`}>
        <button type="button" class:ativa={r.referente === "ESTE_MES"} aria-pressed={r.referente === "ESTE_MES"} disabled={desligado}
          onclick={() => onmudar({ referente: "ESTE_MES" })}>Este mês</button>
        <button type="button" class:ativa={r.referente === "MES_POSTERIOR"} aria-pressed={r.referente === "MES_POSTERIOR"} disabled={desligado}
          onclick={() => onmudar({ referente: "MES_POSTERIOR", tipo: null, forma: null, valor: "", voluntaria: "", pessoa: null, motivo: "" })}>Mês posterior</button>
      </span>
    {:else}<span class="tra">—</span>{/if}
  </span>
</div>

<style>
  .linha {
    position: relative; display: grid; grid-template-columns: var(--cols-lanc); gap: 10px; padding: 0 14px; min-height: 28px; align-items: center;
    border-top: 1px solid var(--sv-linha); font-size: 13.5px; color: var(--sv-texto); outline: none;
  }
  /* a linha em que a pessoa está (a ativa do desenho): amarela, com o traço dourado */
  /* as alturas do desenho (r24): a linha com 27 px e o fio (28), a ativa com 40 e o fio (41), a próxima folha com 29 e o fio (30) */
  .linha:focus-within { min-height: 41px; background: #FFFBEC; box-shadow: inset 3px 0 0 #FFB800; }
  :global(html[data-tema="escuro"]) .linha:focus-within { background: #2A220C; }
  .linha.erro { background: var(--sv-atr-fundo); box-shadow: inset 3px 0 0 var(--sv-atr); }
  .linha.vazia:not(:focus-within) { color: var(--sv-suave); font-size: 13px; min-height: 30px; }
  .folha { display: flex; flex-direction: column; line-height: 1.15; color: var(--sv-suave); font-variant-numeric: tabular-nums; }
  .linha:focus-within .folha, .preencher .folha { color: var(--sv-titulo); }
  .folha strong { color: var(--sv-titulo); }
  .obrig { color: #B91C1C; font-weight: 800; }
  :global(html[data-tema="escuro"]) .obrig { color: #FCA5A5; }
  .sub { font-size: 10.5px; color: var(--sv-suave); }
  .quem { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .chip { display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 12px; background: var(--sv-pend-fundo); color: var(--sv-pend); white-space: nowrap; flex: none; }
  .sem { font-size: 12.5px; color: var(--sv-suave); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tirar { border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 700; color: var(--sv-link); cursor: pointer; white-space: nowrap; padding: 0; }
  .tra { color: var(--sv-suave); }
  input, select { font: inherit; color: var(--sv-titulo); min-width: 0; }
  /* fora da linha ativa, os campos parecem texto; na ativa, o valor e o motivo ganham a caixa */
  .sel { appearance: none; border: 0; background: transparent; padding: 0; width: 100%; cursor: pointer; font-size: 13.5px; color: var(--sv-texto); text-overflow: ellipsis; }
  .sel:focus-visible { outline: 2px solid var(--fin-forte); outline-offset: 2px; border-radius: 4px; }
  .valor, .vol, .motivo { width: 100%; height: 26px; border: 2px solid transparent; border-radius: 7px; background: transparent; padding: 0 8px; outline: none; }
  .linha:focus-within .valor, .linha:focus-within .vol, .linha:focus-within .motivo { height: 30px; }
  .valor { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vol { font-variant-numeric: tabular-nums; color: #166534; font-weight: 700; }
  :global(html[data-tema="escuro"]) .vol { color: #86EFAC; }
  .motivo { flex: 1; font-size: 13px; }
  .linha:focus-within .valor, .linha:focus-within .motivo { border-color: var(--sv-campo-borda); background: var(--sv-campo); }
  .valor:focus, .vol:focus, .motivo:focus { border-color: var(--fin-forte) !important; background: var(--sv-campo); }
  .vol::placeholder { color: var(--sv-suave); font-weight: 400; }
  .dir { display: flex; }
  .pilulas { display: inline-flex; gap: 4px; }
  .pilulas button {
    height: 24px; padding: 0 9px; border-radius: 12px; border: 1px solid var(--sv-borda); background: transparent; font: inherit; font-size: 12px; font-weight: 700;
    color: var(--sv-texto); white-space: nowrap; cursor: pointer;
  }
  .pilulas button.ativa { background: #0A2342; border-color: #0A2342; color: #FFFFFF; }
  :global(html[data-tema="escuro"]) .pilulas button.ativa { background: #FFB800; border-color: #FFB800; color: #0A2342; }
  .pilulas button:focus-visible { outline: 2px solid var(--fin-forte); outline-offset: 1px; }
</style>
