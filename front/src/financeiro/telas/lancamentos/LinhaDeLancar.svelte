<!-- A linha de lançar (r24-lancamento, opção 1, "poucas entradas") e o cartão do celular: uma folha por vez, na ordem do bloco, e embaixo a
     sequência do mês.
     - Notebook: "Folha (sozinha)", 1. Valor, 2. Tipo (D, C, V), 3. Forma (P, E), 4. Quem deu, 5. + Voluntária, 6. Referente a (na folha que
       veio marcada, travado no mês da planilha; nas novas, só "Este mês" e "Mês posterior") e "Lançar (Enter)".
     - Celular: o cartão amarelo com a folha, o valor e quem deu; o tipo e a forma se escolhem em botões no próprio cartão (o desenho só mostra o
       cartão já escolhido, "Dízimo · Espécie": a escolha fica explícita, nada vem marcado sozinho).
     - Sem "marcada em novembro" (a resposta 5 de 26/11/2026): nada sob a folha, o 6º passo travado diz só o mês.
     - A folha que não foi usada (cancelada, arrancada, inexistente) também se marca aqui, com o motivo: "Folha não usada" abre as três. -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import type { FormaLancamento, LinhaPlanilha, PlanilhaMes, TipoLancamento } from "../../tipos";
  import { MARCAS_DA_PLANILHA, NOME_FORMA, NOME_MARCA, NOME_TIPO, ehMarca, folhaTxt, nomeDoMes, NomeDoMes, reais, soValor, type MarcaDaPlanilha, type Rascunho } from "../../lancamentos";
  import QuemDeu from "./QuemDeu.svelte";

  interface Props {
    celular: boolean;
    planilha: PlanilhaMes;
    /** a folha de agora (null: nada a lançar, o mês só se consulta) */
    r: Rascunho | null;
    lancavel: boolean;
    gravando: boolean;
    erro: string;
    mesSeguinte: string;
    onmudar: (patch: Partial<Rascunho>) => void;
    onlancar: () => void;
  }
  let { celular, planilha, r, lancavel, gravando, erro, mesSeguinte, onmudar, onlancar }: Props = $props();

  const TIPOS: readonly { readonly chave: TipoLancamento; readonly tecla: string }[] = [
    { chave: "DIZIMO", tecla: "D" }, { chave: "OFERTA_CULTO", tecla: "C" }, { chave: "OFERTA_VOLUNTARIA", tecla: "V" }
  ];
  const FORMAS: readonly { readonly chave: FormaLancamento; readonly tecla: string }[] = [{ chave: "PIX", tecla: "P" }, { chave: "ESPECIE", tecla: "E" }];
  const TECLA: Record<string, Partial<Rascunho>> = { d: { tipo: "DIZIMO" }, c: { tipo: "OFERTA_CULTO" }, v: { tipo: "OFERTA_VOLUNTARIA" }, p: { forma: "PIX" }, e: { forma: "ESPECIE" } };

  let campoValor = $state<HTMLInputElement | null>(null);
  let naoUsada = $state(false);
  const marca = $derived(r ? ehMarca(r.tipo) : false);
  const posterior = $derived(!!r && r.como === "nova" && r.referente === "MES_POSTERIOR");
  const outras = $derived((planilha.linhas ?? []).filter((l) => l.folha !== r?.folha));
  /** no celular, com a folha que veio marcada no cartão: só as que vieram do mês anterior (as marcadas e as da tarja), e depois o recado "Depois,
      as de dezembro" (o desenho) */
  const marcadas = $derived(planilha.marcadasNoAnterior ?? []);
  const outrasCel = $derived(r?.como === "preencher" ? outras.filter((l) => marcadas.includes(l.folha) || l.situacao === "anterior") : outras);
  /** o resumo do escolhido no cartão do celular: "Dízimo · Espécie" */
  const resumo = $derived(r ? [r.tipo && !ehMarca(r.tipo) ? NOME_TIPO[r.tipo as TipoLancamento] : "", r.forma ? NOME_FORMA[r.forma] : ""].filter(Boolean).join(" · ") : "");
  const primeira = $derived(planilha.linhas?.[0]?.folha ?? r?.folha ?? null);

  export function focar(): void { campoValor?.focus(); }
  $effect(() => { if (r && ehMarca(r.tipo)) naoUsada = true; });

  function tipo(t: TipoLancamento): void { onmudar({ tipo: t, motivo: "", ...(t !== "DIZIMO" ? { voluntaria: "" } : {}) }); }
  function marcar(m: MarcaDaPlanilha): void { onmudar({ tipo: m, forma: null, valor: "", voluntaria: "", pessoa: null, referente: "ESTE_MES" }); }
  function referente(v: Rascunho["referente"]): void {
    onmudar(v === "MES_POSTERIOR" ? { referente: v, tipo: null, forma: null, valor: "", voluntaria: "", pessoa: null, motivo: "" } : { referente: v });
  }
  // as teclas do desenho (D, C, V, P, E) valem fora dos campos de texto e no campo do valor (que só aceita algarismos); Enter lança
  function teclas(e: KeyboardEvent): void {
    if (!r || !lancavel || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target as HTMLElement;
    const texto = alvo.tagName === "INPUT" && !alvo.classList.contains("valor");
    if (e.key === "Enter") { if (alvo.tagName !== "BUTTON") { e.preventDefault(); onlancar(); } return; }
    const t = TECLA[e.key.toLowerCase()];
    if (t && !texto && !marca && !posterior) { e.preventDefault(); if (t.tipo) tipo(t.tipo as TipoLancamento); else onmudar(t); }
  }
</script>

{#snippet pilulasReferente(alt: number, mudar: boolean)}
  <span class="pil-ref" role="group" aria-label="Referente a">
    {#each [["ESTE_MES", "Este mês"], ["MES_POSTERIOR", "Mês posterior"]] as [k, t] (k)}
      {#if mudar && r}
        <button type="button" style:height="{alt}px" class:ativa={r.referente === k} aria-pressed={r.referente === k} disabled={!lancavel}
          onclick={() => referente(k as Rascunho["referente"])}>{t}</button>
      {:else}<span class="pil" style:height="{alt}px" class:ativa={k === "ESTE_MES"}>{t}</span>{/if}
    {/each}
  </span>
{/snippet}

{#snippet botoesTipo()}
  <span class="botoes">
    {#each TIPOS as t (t.chave)}
      <button type="button" class="op" class:ativa={r?.tipo === t.chave} aria-pressed={r?.tipo === t.chave} disabled={!lancavel || posterior} onclick={() => tipo(t.chave)}>
        {#if !celular}<span class="tecla">{t.tecla}</span>{/if}{NOME_TIPO[t.chave]}</button>
    {/each}
    {#if r?.como === "nova"}
      <button type="button" class="nao-usada" aria-expanded={naoUsada} disabled={!lancavel || posterior} onclick={() => (naoUsada = !naoUsada)}>Folha não usada<Icone nome="setaBaixo" tam={13} traco={2.4} /></button>
    {/if}
  </span>
  {#if naoUsada && r?.como === "nova"}
    <span class="botoes marcas">
      {#each MARCAS_DA_PLANILHA as m (m.chave)}
        <button type="button" class="op marca" class:ativa={r?.tipo === m.chave} aria-pressed={r?.tipo === m.chave} disabled={!lancavel} title={m.quando} onclick={() => marcar(m.chave)}>{m.rotulo}</button>
      {/each}
    </span>
  {/if}
{/snippet}

{#snippet botoesForma()}
  <span class="botoes">
    {#each FORMAS as f (f.chave)}
      <button type="button" class="op" class:ativa={r?.forma === f.chave} aria-pressed={r?.forma === f.chave} disabled={!lancavel || marca || posterior} onclick={() => onmudar({ forma: f.chave })}>
        {#if !celular}<span class="tecla">{f.tecla}</span>{/if}{NOME_FORMA[f.chave]}</button>
    {/each}
  </span>
{/snippet}

{#snippet campoValorSnip(grande: boolean)}
  <span class="caixa-valor" class:grande>
    <span class="rs">R$</span>
    <input bind:this={campoValor} class="valor" value={r?.valor ?? ""} inputmode="decimal" autocomplete="off" placeholder="0,00" disabled={!lancavel || marca || posterior}
      aria-label="Valor" oninput={(e) => { const el = e.currentTarget as HTMLInputElement; const v = soValor(el.value); el.value = v; onmudar({ valor: v }); }} />
  </span>
{/snippet}

{#snippet quemOuMotivo(grande: boolean)}
  {#if r && marca}
    <input class="motivo" class:grande value={r.motivo} maxlength="300" placeholder="o que aconteceu com a folha" aria-label="Motivo" disabled={!lancavel}
      oninput={(e) => onmudar({ motivo: (e.currentTarget as HTMLInputElement).value })} />
  {:else if r && posterior}
    <span class="sem" class:grande>sem nome e sem valor · entra em {nomeDoMes(mesSeguinte)}</span>
  {:else if r}
    {#key r.folha}<QuemDeu pessoa={r.pessoa} folha={r.folha} {grande} duasLinhas={celular} {resumo} desligado={!lancavel} onpessoa={(p) => onmudar({ pessoa: p })} onenter={onlancar} />{/key}
  {/if}
{/snippet}

{#snippet tarja(l: LinhaPlanilha, curto: boolean)}
  {#if l.situacao === "anterior"}<span class="ref ant"><Icone nome="voltar" tam={12} traco={2.4} />referente ao mês anterior</span>
  {:else}<span class="ref pos"><Icone nome="seta" tam={12} traco={2.4} />{curto ? "mês posterior" : "referente ao mês posterior"}</span>{/if}
{/snippet}

{#if celular}
  <!-- o cartão do celular -->
  {#if r && lancavel}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="cartao" onkeydown={teclas}>
      <div class="cab-cartao">Folha <strong>{folhaTxt(r.folha)}</strong>{#if marca}<span class="chip">{NOME_MARCA[String(r.tipo).toUpperCase()]}</span>{/if}</div>
      <div class="grupo"><span class="rot">Valor<span class="obrig">*</span></span>{@render campoValorSnip(true)}</div>
      <div class="grupo"><span class="rot">Tipo</span>{@render botoesTipo()}</div>
      {#if !marca && !posterior}<div class="grupo"><span class="rot">Forma</span>{@render botoesForma()}</div>{/if}
      <div class="grupo"><span class="rot">{marca ? "Motivo" : "Quem deu"}<span class="obrig">*</span></span>{@render quemOuMotivo(true)}</div>
      {#if r.como === "nova" && !marca}<div class="grupo"><span class="rot">Referente a</span>{@render pilulasReferente(32, true)}</div>{/if}
      {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
      <button type="button" class="ouro largo" disabled={gravando} aria-busy={gravando} onclick={onlancar}><Icone nome="check" tam={17} traco={2.4} />{marca ? `Marcar a ${folhaTxt(r.folha)}` : `Lançar a ${folhaTxt(r.folha)}`}</button>
    </div>
  {/if}
  {#if outrasCel.length}
    <div class="lista-cel">
      {#each outrasCel as l (l.folha)}
        <div class="item-cel">
          <div class="txt">
            {#if l.situacao === "lancada"}
              <strong>{folhaTxt(l.folha)} · {l.membro ?? l.nome ?? (l.tipo === "OFERTA_CULTO" ? "Oferta de culto (sem nome)" : "—")}</strong>
              <span>{l.tipo ? NOME_TIPO[l.tipo] : "—"}{l.voluntaria ? " + voluntária" : ""} · {l.forma ? NOME_FORMA[l.forma] : "—"}</span>
            {:else if l.situacao === "excecao"}
              <strong>{folhaTxt(l.folha)} <span class="chip">{NOME_MARCA[l.destino ?? ""] ?? "Marcada"}</span></strong><span>{l.observacao ?? ""}</span>
            {:else if l.situacao === "anterior" || l.situacao === "posterior" || l.situacao === "depois"}
              <strong>{folhaTxt(l.folha)} {@render tarja(l, true)}</strong>
              <span>{l.situacao === "anterior" ? `veio sozinha · nada a digitar · ${l.mesSoma ? `somou em ${nomeDoMes(l.mesSoma)}` : "somou antes"}` : `sem nome e sem valor · soma em ${nomeDoMes(l.mesSoma ?? mesSeguinte)}`}</span>
            {:else}
              <strong>{folhaTxt(l.folha)}</strong><span>{l.situacao === "preencher" ? "falta o nome e o valor" : "sem destino ainda"}</span>
            {/if}
          </div>
          {#if l.situacao === "lancada"}<strong class="v">{reais(l.valor)}{#if l.voluntaria}<span class="vol">{" + "}{reais(l.voluntaria)}</span>{/if}</strong>
          {:else if l.situacao === "anterior"}<Icone nome="cadeado" tam={15} traco={2} />{/if}
        </div>
      {/each}
    </div>
  {/if}
  {#if r && lancavel && r.como === "preencher"}
    <div class="depois">
      <span>Depois, as de {nomeDoMes(planilha.mes)}. Na próxima folha nova, <strong>Referente a:</strong></span>
      {@render pilulasReferente(32, false)}
    </div>
  {/if}
{:else}
  <!-- a linha de lançar do notebook -->
  {#if r && lancavel}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="comp" onkeydown={teclas}>
      <div class="fila">
        <div class="grupo l150"><span class="rot">Folha (sozinha)</span><span class="sozinha"><strong>{folhaTxt(r.folha)}</strong></span></div>
        <div class="grupo l150"><span class="rot">1. Valor<span class="obrig">*</span></span>{@render campoValorSnip(false)}</div>
        <div class="grupo esc"><span class="rot">2. Tipo</span>{@render botoesTipo()}</div>
        <div class="grupo esc"><span class="rot">3. Forma</span>{@render botoesForma()}</div>
      </div>
      <div class="fila">
        <div class="grupo quem"><span class="rot">{marca ? "4. Motivo" : "4. Quem deu"}<span class="obrig">*</span>{#if !marca}&nbsp;<span class="nota-rot">· procura no cadastro</span>{/if}</span>{@render quemOuMotivo(true)}</div>
        {#if !marca}
          <div class="grupo l160"><span class="rot">5. + Voluntária <span class="nota-rot">· se houver</span></span>
            <span class="caixa-valor"><span class="rs">R$</span><input class="valor vol" value={r.voluntaria} inputmode="decimal" autocomplete="off" placeholder="0,00"
              disabled={!lancavel || posterior || (r.tipo !== null && r.tipo !== "DIZIMO")} aria-label="Oferta voluntária junto"
              oninput={(e) => { const el = e.currentTarget as HTMLInputElement; const v = soValor(el.value); el.value = v; onmudar({ voluntaria: v }); }} /></span></div>
        {/if}
        <div class="grupo ref6"><span class="rot">6. Referente a</span>
          {#if r.como === "preencher" || marca}<span class="travado"><Icone nome="cadeado" tam={13} traco={2} />{marca ? "—" : nomeDoMes(planilha.mes)}</span>
          {:else}{@render pilulasReferente(34, true)}{/if}
        </div>
        <button type="button" class="ouro" disabled={gravando} aria-busy={gravando} onclick={onlancar}><Icone nome="check" tam={18} traco={2.2} />{marca ? "Marcar (Enter)" : "Lançar (Enter)"}</button>
      </div>
      {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
    </div>
  {/if}
  <section class="seq">
    <div class="topo-seq"><h2>{NomeDoMes(planilha.mes)}{primeira ? `, a partir da ${folhaTxt(primeira)}` : ""}</h2>{#if planilha.tira}<span class="nota">a sequência contínua do bloco {folhaTxt(planilha.tira.numero)}</span>{/if}</div>
    <div class="grade cab"><span>Folha</span><span>Quem deu</span><span>Tipo e forma</span><span>Referente a</span><span class="dir">Valor</span></div>
    <div class="itens">
    {#each outras as l (l.folha)}
      <div class="grade item" class:ant={l.situacao === "anterior"} class:pos={l.situacao === "posterior" || l.situacao === "depois"}>
        <span class="n">{folhaTxt(l.folha)}</span>
        {#if l.situacao === "lancada"}
          <span class="nome">{l.membro ?? l.nome ?? (l.tipo === "OFERTA_CULTO" ? "Oferta de culto (sem nome)" : "—")}</span>
          <span class="corta">{l.tipo ? (l.voluntaria ? "Dízimo + voluntária" : NOME_TIPO[l.tipo]) : "—"} · {l.forma ? NOME_FORMA[l.forma] : "—"}</span>
          <span class="tra">—</span>
          <span class="dir v">{reais(l.valor)}{#if l.voluntaria}<span class="vol">{" + "}{reais(l.voluntaria)}</span>{/if}</span>
        {:else if l.situacao === "excecao"}
          <span><span class="chip">{NOME_MARCA[l.destino ?? ""] ?? "Marcada"}</span></span><span>—</span><span></span><span class="dir tra">—</span>
        {:else if l.situacao === "anterior" || l.situacao === "posterior" || l.situacao === "depois"}
          <span class="largo">{@render tarja(l, false)}<em>{l.situacao === "anterior" ? "veio sozinha · nada a digitar" : "sem nome e sem valor"}</em></span>
          <span class="tra">{l.mesSoma ? `${l.situacao === "anterior" ? "somou" : "soma"} em ${nomeDoMes(l.mesSoma)}` : "somou antes"}</span>
          <span class="dir tra">—</span>
        {:else}
          <span class="largo"><em>{l.situacao === "preencher" ? "veio marcada do mês anterior: falta o nome e o valor" : "sem destino ainda"}</em></span><span class="tra">—</span><span class="dir tra">—</span>
        {/if}
      </div>
    {/each}
    </div>
    {#if lancavel}<div class="rodape">Nas folhas novas, o 6º passo tem só {@render pilulasReferente(24, false)}</div>{/if}
  </section>
{/if}

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  button:disabled { cursor: default; opacity: .55; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; }
  .nota-rot { font-weight: 400; color: var(--sv-suave); }
  .obrig { color: #B91C1C; font-weight: 800; }
  :global(html[data-tema="escuro"]) .obrig { color: #FCA5A5; }
  .grupo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .botoes { display: flex; gap: 6px; flex-wrap: wrap; }
  /* as escolhas do desenho (r18Escolha "junto"): 34 px, 10 px de cada lado, a letra 13; a tecla é só a letra, mais clara */
  .op {
    height: 34px; padding: 0 10px; border-radius: 17px; border: 1px solid var(--sv-borda); background: var(--sv-sup); display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; font-weight: 600; color: var(--sv-texto); white-space: nowrap;
  }
  .op.ativa { background: #0A2342; border-color: #0A2342; color: #FFFFFF; font-weight: 700; }
  :global(html[data-tema="escuro"]) .op.ativa { background: #FFB800; border-color: #FFB800; color: #0A2342; }
  .op.marca { padding: 0 12px; }
  .op.marca.ativa { background: var(--sv-pend-fundo); border-color: var(--sv-pend); color: var(--sv-pend); }
  .tecla { font-size: 11px; font-weight: 800; opacity: .75; }
  .nao-usada { border: 0; background: transparent; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; color: var(--sv-link); padding: 0 4px; }
  .caixa-valor { height: 44px; border: 2px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); display: flex; align-items: center; gap: 5px; padding: 0 12px; }
  .caixa-valor:focus-within { border-color: var(--fin-forte); }
  .caixa-valor.grande { height: 42px; }
  .rs { font-size: 17px; font-weight: 700; color: var(--sv-titulo); }
  .valor { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; padding: 0; font: inherit; font-size: 17px; font-weight: 700; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
  .valor::placeholder { color: var(--sv-suave); font-weight: 500; }
  .valor.vol { font-size: 14px; font-weight: 600; }
  .caixa-valor:has(.vol) { height: 42px; border-width: 1px; }
  .caixa-valor:has(.vol) .rs { font-size: 14px; font-weight: 500; color: var(--sv-suave); }
  .motivo { height: 42px; border: 2px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); padding: 0 12px; font: inherit; font-size: 14px; color: var(--sv-titulo); outline: none; width: 100%; }
  .motivo:focus { border-color: var(--fin-forte); }
  .sem { min-height: 42px; display: flex; align-items: center; font-size: 13px; font-style: italic; color: var(--sv-suave); }
  .chip { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 11px; background: var(--sv-pend-fundo); color: var(--sv-pend); white-space: nowrap; }
  .erro { font-size: 13px; font-weight: 600; color: var(--sv-atr); }
  .ouro {
    height: 42px; padding: 0 16px; border: 0; border-radius: 10px; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; flex: none;
  }
  .pil-ref { display: inline-flex; gap: 4px; }
  .pil-ref button, .pil { padding: 0 11px; border-radius: 17px; border: 1px solid var(--sv-borda); background: transparent; display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--sv-texto); white-space: nowrap; }
  .pil-ref .ativa { background: #0A2342; border-color: #0A2342; color: #FFFFFF; }
  :global(html[data-tema="escuro"]) .pil-ref .ativa { background: #FFB800; border-color: #FFB800; color: #0A2342; }
  .ref { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 12px; font-weight: 700; white-space: nowrap; flex: none; }
  .ref.ant { background: #EFE7FD; color: #6D28D9; }
  .ref.pos { background: #E3ECFD; color: #1D4ED8; }
  :global(html[data-tema="escuro"]) .ref.ant { background: #2A1D4A; color: #C4B5FD; }
  :global(html[data-tema="escuro"]) .ref.pos { background: #13294A; color: #93C5FD; }
  .vol { color: #166534; font-weight: 500; }
  :global(html[data-tema="escuro"]) .vol { color: #86EFAC; }
  .tra { color: var(--sv-suave); }

  /* o notebook: o cartão da folha de agora */
  .comp { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 12px 16px; display: flex; flex-direction: column; gap: 11px; }
  .fila { display: flex; gap: 14px; align-items: flex-end; }
  .comp .grupo { gap: 4px; }
  .comp .grupo.esc { gap: 8px; padding-bottom: 5px; }
  .l150 { width: 150px; flex: none; }
  .l160 { width: 160px; flex: none; }
  .quem { flex: 1; }
  .ref6 { flex: none; }
  .sozinha { height: 44px; border: 1px dashed var(--sv-campo-borda); border-radius: 10px; display: flex; flex-direction: column; justify-content: center; padding: 0 12px; }
  .sozinha strong { font-size: 15px; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
  .travado { height: 42px; border: 1px dashed var(--sv-campo-borda); border-radius: 10px; display: flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 13px; color: var(--sv-suave); white-space: nowrap; }
  .marcas { margin-top: -2px; }

  /* o notebook: a sequência do mês */
  .seq { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 9px 16px; display: flex; flex-direction: column; gap: 4px; }
  .topo-seq { display: flex; align-items: baseline; gap: 10px; }
  .topo-seq h2 { flex: 1; font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .nota { font-size: 12.5px; color: var(--sv-suave); }
  .grade { display: grid; grid-template-columns: 64px minmax(0, 1.5fr) minmax(0, 1fr) 190px 120px; gap: 12px; align-items: center; }
  .grade.cab { font-size: 12px; font-weight: 700; color: var(--sv-suave); }
  .itens { display: flex; flex-direction: column; }
  .grade.item { min-height: 26px; border-top: 1px solid var(--sv-linha); font-size: 13px; color: var(--sv-texto); }
  .grade.item.ant { background: #FAF7FF; }
  .grade.item.pos { background: #F5F8FF; }
  :global(html[data-tema="escuro"]) .grade.item.ant { background: #1E1638; }
  :global(html[data-tema="escuro"]) .grade.item.pos { background: #0F2340; }
  .grade .n { color: var(--sv-suave); font-variant-numeric: tabular-nums; padding-left: 4px; }
  .grade .nome { font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grade .corta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grade .largo { grid-column: 2 / 4; display: flex; align-items: center; gap: 9px; min-width: 0; }
  .grade .largo em { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grade .v { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dir { text-align: right; }
  .rodape { display: flex; align-items: center; gap: 10px; padding-top: 4px; font-size: 12.5px; color: var(--sv-texto); }

  /* o celular */
  .cartao { background: #FFFBEC; border: 1.5px solid #F2C94C; border-radius: 14px; padding: 10px 13px; display: flex; flex-direction: column; gap: 7px; }
  :global(html[data-tema="escuro"]) .cartao { background: #2A220C; border-color: #8A6A14; }
  .cab-cartao { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--sv-suave); }
  .cab-cartao strong { font-size: 15px; color: var(--sv-titulo); }
  .cartao .grupo { gap: 4px; }
  .cartao .op { height: 34px; padding: 0 12px; }
  .ouro.largo { width: 100%; height: 42px; }
  .lista-cel { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 0 12px; }
  .item-cel { display: flex; align-items: center; gap: 10px; min-height: 46px; border-top: 1px solid var(--sv-linha); color: var(--sv-suave); }
  .item-cel:first-child { border-top: 0; }
  .item-cel .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; line-height: 1.25; }
  .item-cel .txt strong { font-size: 13.5px; color: var(--sv-titulo); display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-cel .txt span { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-cel .v { font-size: 13px; color: var(--sv-titulo); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .depois { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 9px 13px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--sv-suave); }
  .depois strong { color: var(--sv-titulo); }
</style>
