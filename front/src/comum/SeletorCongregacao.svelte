<!-- O seletor "Trocar de congregação", a peça comum (rodada 20, "r20-seletor", versão final; a resposta 7 de 26/11/2026). Área primeiro, depois a
     congregação: procurar uma área mostra as congregações dela; pode-se procurar a congregação direto; as que precisam aparecem primeiro.
     - A Tesouraria Geral: as áreas à esquerda, o resultado à direita. A área: procura só nas suas (com as recentes). A congregação: o cadeado
       "A sua congregação", sem trocar (o painel só explica).
     - O painel abre por cima da tela, embaixo do botão; no celular, cobre a tela ("Trocar de congregação" na barra do alto).
     - Teclado: ↑ ↓ escolhe, Enter abre, Esc fecha.
     A situação de cada congregação vem de quem chama (o servidor). A "Sede administrativa" do desenho (só o que é da Geral) entra com a tela
     que precisar dela: o Lançamentos lança por uma congregação. Quem troca é a pessoa: o servidor confere o escopo de novo. -->
<script lang="ts">
  import Icone from "./Icone.svelte";
  import { sobreposta } from "./tela.svelte";
  import { partesRealce, semAcento } from "./formato";
  import type { CongregacaoDoSeletor, TomSituacao } from "./tipos";

  interface Props {
    nivel: "geral" | "area" | "local";
    /** o rótulo pequeno do botão: "Lançando por", "Vendo" */
    rotulo: string;
    congregacoes: readonly CongregacaoDoSeletor[];
    /** a congregação escolhida agora (null = nenhuma: na área, "todas") */
    atual: number | null;
    /** o que o botão mostra sem congregação escolhida ("Escolha a congregação", "As 12 da área") */
    semEscolha: string;
    celular: boolean;
    /** o painel aberto (a tela esconde o resto no celular) */
    aberto?: boolean;
    onescolher: (id: number | null) => void;
  }
  let { nivel, rotulo, congregacoes, atual, semEscolha, celular, aberto = $bindable(false), onescolher }: Props = $props();

  const VISIVEIS = 6;
  const ORDEM: Record<TomSituacao, number> = { atraso: 0, pend: 1, ok: 2 };
  const CHAVE_RECENTES = "ieadespa.seletor.recentes";
  const SEM_AREA = "Sem área";

  let termo = $state("");
  let areaEscolhida = $state<string | null>(null);
  let destaque = $state(0);
  let todas = $state(false);
  let campo = $state<HTMLInputElement | null>(null);
  let recentes = $state<number[]>([]);

  const tom = (c: CongregacaoDoSeletor): TomSituacao => c.situacao?.tom ?? "ok";
  const precisa = (c: CongregacaoDoSeletor): boolean => tom(c) !== "ok";
  const porPrecisa = (a: CongregacaoDoSeletor, b: CongregacaoDoSeletor): number => ORDEM[tom(a)] - ORDEM[tom(b)] || a.nome.localeCompare(b.nome, "pt-BR");
  const areaDe = (c: CongregacaoDoSeletor): string => c.area ?? SEM_AREA;

  const atualC = $derived(congregacoes.find((c) => c.id === atual) ?? null);
  const nomeBotao = $derived(atualC ? atualC.nome : semEscolha);
  /** as áreas na ordem natural ("Área 2" antes de "Área 10"), com quantas congregações e quantas precisam */
  const areas = $derived.by(() => {
    const m = new Map<string, CongregacaoDoSeletor[]>();
    for (const c of congregacoes) { const a = areaDe(c); m.set(a, [...(m.get(a) ?? []), c]); }
    return [...m.entries()].map(([nome, lista]) => ({ nome, lista })).sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR", { numeric: true }));
  });
  const minhaArea = $derived(nivel === "area" ? (congregacoes[0]?.area ?? SEM_AREA) : null);

  const t = $derived(semAcento(termo.trim()));
  /** procurar uma área mostra as congregações dela (só a Geral escolhe área) */
  const areaProcurada = $derived(nivel === "geral" && t ? (areas.find((a) => semAcento(a.nome).startsWith(t)) ?? null) : null);
  const procurandoCongregacao = $derived(!!t && !areaProcurada);
  const areaAgora = $derived(areaProcurada?.nome ?? areaEscolhida);

  const encontradas = $derived(procurandoCongregacao ? congregacoes.filter((c) => semAcento(c.nome).includes(t)).sort(porPrecisa) : []);
  const daArea = $derived((areaAgora ? congregacoes.filter((c) => areaDe(c) === areaAgora) : [...congregacoes]).sort(porPrecisa));
  const lista = $derived(procurandoCongregacao ? encontradas : daArea);
  const mostradas = $derived(procurandoCongregacao || todas ? lista : lista.slice(0, VISIVEIS));
  const resto = $derived(lista.slice(mostradas.length));
  const listaRecentes = $derived(nivel === "area" && procurandoCongregacao
    ? recentes.map((id) => congregacoes.find((c) => c.id === id)).filter((c): c is CongregacaoDoSeletor => !!c && !encontradas.includes(c)).slice(0, 3) : []);
  const escolhiveis = $derived([...mostradas, ...listaRecentes]);

  const n = (k: number, um: string, varios: string): string => `${k} ${k === 1 ? um : varios}`;
  const cabecalho = $derived.by(() => {
    if (procurandoCongregacao) {
      const emAreas = new Set(encontradas.map(areaDe)).size;
      const quantas = encontradas.length ? n(encontradas.length, "congregação", "congregações") : "Nenhuma congregação";
      if (nivel === "area") return `${quantas} com “${termo.trim()}” na ${minhaArea}`;
      return `${quantas} com “${termo.trim()}”${encontradas.length ? `, em ${n(emAreas, "área", "áreas")}` : ""}`;
    }
    const onde = nivel === "area" ? minhaArea : areaAgora ?? "A Igreja toda";
    return `${onde} · ${n(daArea.length, "congregação", "congregações")} · as que precisam primeiro`;
  });
  const trilha = $derived.by((): { rotulo: string; ir?: () => void }[] => {
    const raiz = nivel === "area" ? { rotulo: minhaArea ?? "", ir: limpar } : { rotulo: "Igreja toda", ir: () => { termo = ""; areaEscolhida = null; } };
    if (procurandoCongregacao) return [raiz, { rotulo: `procura: “${termo.trim()}”` }];
    if (nivel === "geral" && areaAgora) return [raiz, { rotulo: areaAgora }];
    return [{ rotulo: raiz.rotulo }];
  });
  const rodape = $derived(nivel === "area" ? `procura só nas ${n(congregacoes.length, "congregação", "congregações")} da ${minhaArea}` : `procura nas áreas e nas ${n(congregacoes.length, "congregação", "congregações")}`);

  function lerRecentes(): number[] {
    try { const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]"); return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, 5) : []; } catch { return []; }
  }
  function guardarRecente(id: number): void {
    recentes = [id, ...recentes.filter((x) => x !== id)].slice(0, 5);
    try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(recentes)); } catch { /* sem o armazenamento do navegador, só não guarda */ }
  }

  function limpar(): void { termo = ""; todas = false; destaque = 0; }
  function abrir(): void {
    limpar();
    areaEscolhida = nivel === "geral" ? (atualC ? areaDe(atualC) : null) : null;
    recentes = lerRecentes();
    aberto = true;
    if (celular) cobrir();
    queueMicrotask(() => campo?.focus());
  }
  function fechar(): void {
    aberto = false;
    descobrir();
  }
  /** no celular o painel cobre a tela: "Trocar de congregação" na barra do alto, e o voltar dela fecha */
  function cobrir(): void { sobreposta.titulo = "Trocar de congregação"; sobreposta.fechar = fechar; }
  function descobrir(): void { sobreposta.titulo = null; sobreposta.fechar = null; }
  function escolher(c: CongregacaoDoSeletor): void {
    fechar();
    if (c.id === atual) return;
    guardarRecente(c.id);
    onescolher(c.id);
  }
  function escolherArea(nome: string): void { termo = ""; todas = false; areaEscolhida = nome; destaque = 0; campo?.focus(); }

  function teclas(e: KeyboardEvent): void {
    if (e.key === "Escape") { e.preventDefault(); fechar(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const total = escolhiveis.length;
      if (total) destaque = (destaque + (e.key === "ArrowDown" ? 1 : total - 1)) % total;
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const c = escolhiveis[Math.min(destaque, escolhiveis.length - 1)];
      if (c) escolher(c);
    }
  }
  $effect(() => { void t; destaque = 0; });
  // a barra do celular volta ao normal quando a peça sai da tela
  $effect(() => () => { if (aberto) descobrir(); });
  // o celular virou notebook (ou o contrário) com o painel aberto: a barra segue
  $effect(() => { if (aberto) { if (celular) cobrir(); else descobrir(); } });
</script>

{#snippet ponto(s: TomSituacao)}<span class="ponto {s}"></span>{/snippet}

{#snippet realce(texto: string, busca: string)}{#each partesRealce(texto, busca) as x, i (i)}{#if x.marca}<u>{x.t}</u>{:else}{x.t}{/if}{/each}{/snippet}

{#snippet linhaCongregacao(c: CongregacaoDoSeletor, i: number, comArea: boolean)}
  {@const marcada = i === destaque && (procurandoCongregacao || c.id === atual || destaque > 0)}
  <button type="button" class="cong" class:ativa={c.id === atual} class:marcada onclick={() => escolher(c)} onmouseenter={() => (destaque = i)}>
    <span class="ic-igreja"><Icone nome="igreja" tam={16} traco={2} /></span>
    <span class="textos">
      <span class="nome">{@render realce(c.nome, procurandoCongregacao ? termo : "")}{#if comArea}<span class="area"> · {areaDe(c)}</span>{/if}</span>
      <span class="sit">{@render ponto(tom(c))}{c.situacao?.texto ?? "em dia"}</span>
    </span>
    {#if procurandoCongregacao && i === destaque}<kbd>Enter</kbd>{:else if c.id === atual}<span class="agora">agora</span>{/if}
  </button>
{/snippet}

{#snippet botao()}
  {#if nivel === "local"}
    <button type="button" class="troca local" class:cel={celular} aria-haspopup="dialog" aria-expanded={aberto} onclick={() => (aberto ? fechar() : abrir())}>
      <span class="cad"><Icone nome="cadeado" tam={16} traco={2} /></span>
      <span class="rot"><span class="peq">A sua congregação</span><strong>{nomeBotao}</strong></span>
    </button>
  {:else}
    <button type="button" class="troca" class:cel={celular} aria-haspopup="dialog" aria-expanded={aberto} onclick={() => (aberto ? fechar() : abrir())}>
      <span class="tile"><Icone nome="igreja" tam={17} traco={2} /></span>
      <span class="rot"><span class="peq">{rotulo}</span><strong>{nomeBotao}</strong></span>
      <span class="trocar">Trocar<Icone nome="setaBaixo" tam={14} traco={2.4} /></span>
    </button>
  {/if}
{/snippet}

{#snippet conteudo()}
  {#if nivel === "local"}
    <div class="so-sua">
      {#if atualC}
        <div class="cong ativa fixa">
          <span class="ic-igreja"><Icone nome="igreja" tam={16} traco={2} /></span>
          <span class="textos"><span class="nome">{atualC.nome}</span><span class="sit">{@render ponto(tom(atualC))}a sua congregação</span></span>
          <span class="agora">agora</span>
        </div>
      {/if}
      <div class="nota">
        <Icone nome="ajudaQ" tam={17} traco={2} />
        <p><strong>Você vê só a sua congregação.</strong>
          {#if celular}A Tesouraria Geral pode lançar por ela; fica registrado.{:else}A Tesouraria Geral pode escolher {atualC?.nome ?? "a sua congregação"} e lançar por ela; fica registrado quem lançou. Fornecedores, contas e centros de custo são da Igreja inteira.{/if}</p>
      </div>
    </div>
  {:else}
    <div class="topo">
      <nav class="trilha" aria-label="Onde está a procura">
        {#each trilha as p, i (i)}
          {#if i < trilha.length - 1 && p.ir}<button type="button" class="elo" onclick={p.ir}>{p.rotulo}</button><Icone nome="seta" tam={13} traco={2} />
          {:else}<strong>{p.rotulo}</strong>{/if}
        {/each}
      </nav>
      {#if !celular}<button type="button" class="fechar" aria-label="Fechar" onclick={fechar}><Icone nome="fechar" tam={17} traco={2.2} /></button>{/if}
    </div>
    <label class="procura" class:digitado={!!termo}>
      <Icone nome="busca" tam={18} traco={2} />
      <input bind:this={campo} bind:value={termo} onkeydown={teclas} type="search" autocomplete="off" spellcheck="false" maxlength="60"
        placeholder={nivel === "area" ? "Procurar congregação…" : "Procurar área ou congregação…"} aria-label="Procurar área ou congregação" />
    </label>
    {#if celular && nivel === "geral" && !procurandoCongregacao}
      <div class="pilulas" role="group" aria-label="Áreas">
        {#each areas as a (a.nome)}<button type="button" class:ativa={a.nome === areaAgora} onclick={() => escolherArea(a.nome)}>{a.nome}</button>{/each}
      </div>
    {/if}
    <div class="corpo" class:duas={nivel === "geral" && !celular}>
      {#if nivel === "geral" && !celular}
        <div class="areas" role="group" aria-label="Áreas">
          {#each areas as a (a.nome)}
            {@const com = a.lista.filter((c) => semAcento(c.nome).includes(t)).length}
            <button type="button" class="area-item" class:ativa={!procurandoCongregacao && a.nome === areaAgora} onclick={() => escolherArea(a.nome)}>
              <span class="textos">
                <span class="nome">{@render realce(a.nome, areaProcurada && a.nome === areaProcurada.nome ? termo : "")}</span>
                <span class="sub">{procurandoCongregacao ? (com ? `${com} com “${termo.trim()}”` : `nenhuma com “${termo.trim()}”`)
                  : `${n(a.lista.length, "congregação", "congregações")} · ${a.lista.filter(precisa).length} ${a.lista.filter(precisa).length === 1 ? "precisa" : "precisam"}`}</span>
              </span>
              <Icone nome="seta" tam={15} traco={2.2} />
            </button>
          {/each}
        </div>
      {/if}
      <div class="lista" class:cartao={celular}>
        <span class="cab">{cabecalho}</span>
        {#each mostradas as c, i (c.id)}{@render linhaCongregacao(c, i, procurandoCongregacao && nivel === "geral")}{/each}
        {#if resto.length}
          <button type="button" class="mais" onclick={() => (todas = true)}>e mais {resto.length}{resto.every((c) => !precisa(c)) ? " em dia" : ""} ›</button>
        {/if}
        {#if listaRecentes.length}
          <span class="cab recentes">Recentes</span>
          {#each listaRecentes as c, j (c.id)}{@render linhaCongregacao(c, mostradas.length + j, false)}{/each}
        {/if}
      </div>
    </div>
    <div class="pe">
      {#if !celular}<span class="teclas"><span><kbd>↑ ↓</kbd> escolhe</span><span><kbd>Enter</kbd> abre</span><span><kbd>Esc</kbd> fecha</span></span>{/if}
      <span class="rodape">{rodape}</span>
    </div>
  {/if}
{/snippet}

{#if celular && aberto}
  <section class="folha-cel" aria-label="Trocar de congregação">{@render conteudo()}</section>
{:else}
  <div class="seletor" class:cel={celular}>
    {@render botao()}
    {#if aberto && !celular}
      <button type="button" class="veu" aria-label="Fechar" tabindex="-1" onclick={fechar}></button>
      <div class="painel" class:largo={nivel === "geral"} class:estreito={nivel === "local"} role="dialog" aria-label="Trocar de congregação" tabindex="-1" onkeydown={teclas}>
        {@render conteudo()}
      </div>
    {/if}
  </div>
{/if}

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .seletor { position: relative; flex: none; }
  .seletor.cel { width: 100%; }

  /* o botão (r18Troca): o cadeado da congregação; o "Trocar" da Geral e da área */
  .troca { height: 44px; padding: 0 6px 0 7px; border-radius: 11px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); display: flex; align-items: center; gap: 9px; text-align: left; color: inherit; }
  .troca.cel { width: 100%; }
  .troca.local { padding: 0 14px 0 11px; border-color: var(--sv-borda); background: transparent; }
  .tile { width: 30px; height: 30px; border-radius: 8px; background: var(--sv-mod-fundo); color: var(--sv-mod); display: flex; align-items: center; justify-content: center; flex: none; }
  .cad { color: var(--sv-suave); display: flex; }
  .rot { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
  .peq { font-size: 11.5px; color: var(--sv-suave); white-space: nowrap; }
  .rot strong { font-size: 14px; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trocar { margin-left: 4px; height: 32px; padding: 0 10px; border-radius: 8px; background: var(--sv-mod-fundo); color: var(--sv-mod); display: flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 700; flex: none; }
  .troca.cel .trocar { margin-left: auto; }

  /* o véu e o painel por cima da tela, embaixo do botão */
  .veu { position: fixed; inset: 0; border: 0; padding: 0; background: rgba(6, 22, 41, 0.5); z-index: 50; cursor: default; }
  :global(html[data-tema="escuro"]) .veu { background: rgba(6, 22, 41, 0.62); }
  .painel {
    position: absolute; right: 0; top: calc(100% + 10px); z-index: 51; width: 470px; max-width: calc(100vw - 40px); background: var(--sv-sup); border: 1px solid var(--sv-borda);
    border-radius: 16px; box-shadow: 0 24px 60px rgba(6, 22, 41, 0.4); padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; outline: none;
  }
  .painel.largo { width: 720px; }
  .painel.estreito { width: 440px; }
  .folha-cel { display: flex; flex-direction: column; gap: 10px; }

  .topo { display: flex; align-items: center; gap: 10px; }
  .trilha { display: flex; align-items: center; gap: 6px; font-size: 13px; flex: 1; min-width: 0; color: var(--sv-suave); }
  .trilha strong { color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .elo { border: 0; background: none; padding: 0; color: var(--sv-link); font-weight: 600; font-size: 13px; white-space: nowrap; }
  .fechar { width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--sv-borda); background: transparent; color: var(--sv-icone); display: flex; align-items: center; justify-content: center; flex: none; }

  .procura { height: 42px; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); display: flex; align-items: center; gap: 8px; padding: 0 12px; color: var(--sv-suave); }
  .procura.digitado, .procura:focus-within { border: 2px solid var(--sv-mod); padding: 0 11px; }
  .procura input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 14px; font-weight: 600; color: var(--sv-titulo); }
  .procura input::placeholder { font-weight: 400; color: var(--sv-suave); }
  .procura input::-webkit-search-cancel-button { display: none; }

  .pilulas { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-right: -14px; padding-right: 14px; flex: none; }
  .pilulas button { flex: none; height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sv-borda); background: var(--sv-sup); font-size: 12.5px; font-weight: 700; color: var(--sv-texto); white-space: nowrap; }
  .pilulas button.ativa { background: var(--sv-mod); border-color: var(--sv-mod); color: var(--sv-sup); }

  .corpo { display: flex; flex-direction: column; }
  .corpo.duas { display: grid; grid-template-columns: 238px minmax(0, 1fr); gap: 12px; }
  .areas { display: flex; flex-direction: column; gap: 2px; padding-right: 10px; border-right: 1px solid var(--sv-linha); }
  .area-item { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; text-align: left; color: var(--sv-suave); }
  .area-item.ativa { background: var(--sv-mod-fundo); box-shadow: inset 3px 0 0 var(--sv-mod); color: var(--sv-mod); }
  .area-item .textos { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .area-item .nome { font-size: 13.5px; font-weight: 700; color: var(--sv-titulo); }
  .area-item .sub { font-size: 11.5px; color: var(--sv-suave); }

  .lista { display: flex; flex-direction: column; min-width: 0; }
  .lista.cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 8px 6px; }
  .cab { font-size: 12.5px; font-weight: 700; color: var(--sv-suave); padding: 0 10px 4px; }
  .cab.recentes { padding-top: 8px; }
  .cong { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent; text-align: left; color: var(--sv-suave); width: 100%; }
  .cong.ativa, .cong.marcada { background: var(--sv-mod-fundo); }
  .cong.ativa { box-shadow: inset 3px 0 0 var(--sv-mod); color: var(--sv-mod); }
  .cong.fixa { cursor: default; }
  .cong .textos { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .cong .nome { font-size: 13.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cong.ativa .nome { font-weight: 700; }
  .cong .area { font-weight: 400; color: var(--sv-suave); }
  .sit { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--sv-suave); }
  .ic-igreja { display: flex; }
  .ponto { width: 9px; height: 9px; border-radius: 5px; flex: none; background: var(--sv-ok); }
  .ponto.pend { background: #B45309; }
  .ponto.atraso { background: #B91C1C; }
  :global(html[data-tema="escuro"]) .ponto.pend { background: #FCD34D; }
  :global(html[data-tema="escuro"]) .ponto.atraso { background: #FCA5A5; }
  .agora { font-size: 11.5px; font-weight: 700; color: var(--sv-mod); flex: none; }
  kbd { font: inherit; font-size: 11.5px; font-weight: 600; color: var(--sv-titulo); padding: 1px 6px; border-radius: 5px; border: 1px solid var(--sv-campo-borda); background: var(--sv-sup); flex: none; }
  .mais { align-self: flex-start; border: 0; background: none; padding: 4px 10px; font-size: 12.5px; font-weight: 700; color: var(--sv-link); }

  .pe { display: flex; align-items: center; gap: 16px; padding-top: 12px; border-top: 1px solid var(--sv-linha); font-size: 12.5px; color: var(--sv-suave); }
  .teclas { display: flex; gap: 14px; flex: none; }
  .teclas span { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .rodape { flex: 1; text-align: right; line-height: 1.35; }
  .folha-cel .pe { padding-top: 0; border-top: 0; }
  .folha-cel .rodape { text-align: left; font-size: 12px; }

  /* a congregação: a sua, com o recado */
  .so-sua { display: flex; flex-direction: column; gap: 10px; }
  .nota { display: flex; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--sv-info-fundo); border: 1px solid var(--sv-info-borda); color: var(--sv-link); }
  .nota p { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--sv-texto); }
  .nota strong { color: var(--sv-titulo); }
</style>
