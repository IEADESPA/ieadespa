<!-- O seletor de bloco das folhas (rodada 30, "r30-blocos-folhas"): em todos os níveis, no notebook à direita do título e no celular logo abaixo das
     abas, na largura toda. Fechado: "Bloco 1.401 · Vila Nova ▾" (na congregação, "Bloco 1.401 · em uso"). Aberto: a lista ("Os blocos de Vila Nova"),
     cada bloco com a linha de baixo (quantas com destino e livres, quando chegou, ou "só consulta" no devolvido) e o escolhido marcado. A Geral pode
     ter muitos blocos: a lista rola. Esc e o clique fora fecham. -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import { linhaDaOpcao, textoDoSeletor } from "../../blocos";
  import type { OpcaoBloco } from "../../tipos";

  interface Props {
    opcoes: readonly OpcaoBloco[];
    escolhido: number;
    /** a congregação: o seletor diz a situação do bloco, sem o nome dela */
    local: boolean;
    titulo: string;
    celular: boolean;
    onescolher: (id: number) => void;
  }
  let { opcoes, escolhido, local, titulo, celular, onescolher }: Props = $props();

  let aberto = $state(false);
  let raiz = $state<HTMLElement | null>(null);
  let botao = $state<HTMLButtonElement | null>(null);
  const atual = $derived(opcoes.find((o) => o.id === escolhido) ?? null);

  function fora(e: MouseEvent) { if (aberto && raiz && !raiz.contains(e.target as Node)) aberto = false; }
  function tecla(e: KeyboardEvent) { if (aberto && e.key === "Escape") { aberto = false; botao?.focus(); } }
  function escolher(id: number) {
    aberto = false;
    botao?.focus();
    if (id !== escolhido) onescolher(id);
  }
</script>

<svelte:document onclick={fora} onkeydown={tecla} />

<div class="seletor" class:cel={celular} bind:this={raiz}>
  <button type="button" class="botao" aria-haspopup="listbox" aria-expanded={aberto} bind:this={botao} onclick={() => (aberto = !aberto)}>
    <Icone nome="livro" tam={celular ? 17 : 15} traco={2} />
    <span class="txt">{atual ? textoDoSeletor(atual, local) : "Bloco"}</span>
    <Icone nome="setaBaixo" tam={celular ? 16 : 15} traco={2.2} />
  </button>
  {#if aberto}
    <div class="lista" role="listbox" aria-label={titulo}>
      <span class="cab" aria-hidden="true">{titulo}</span>
      {#each opcoes as o (o.id)}
        {@const l = linhaDaOpcao(o, local)}
        <button type="button" role="option" aria-selected={o.id === escolhido} class:atual={o.id === escolhido} onclick={() => escolher(o.id)}>
          <span class="linhas"><strong>{l.titulo}</strong><span>{l.detalhe}</span></span>
          {#if o.id === escolhido}<Icone nome="check" tam={16} traco={2.4} />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .seletor { position: relative; display: flex; flex: none; min-width: 0; --sel-escolhido: #EEF4FF; }
  :global(html[data-tema="escuro"]) .seletor { --sel-escolhido: #13294A; }

  /* fechado: o botão de linha do desenho (40 + a borda = 42 px); no celular, o campo na largura toda (44 + a borda) */
  .botao {
    height: 42px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: transparent; color: var(--sv-titulo); display: inline-flex;
    align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; min-width: 0; transition: background-color .15s ease;
  }
  .botao :global(svg) { color: var(--sv-icone); }
  .botao :global(svg:last-child) { color: var(--sv-suave); }
  .botao[aria-expanded="true"] { border-color: var(--sv-mod); }
  @media (hover: hover) { .botao:hover { background: var(--sv-linha); } }
  .txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
  .cel { display: flex; width: 100%; }
  .cel .botao { width: 100%; height: 46px; padding: 0 12px; gap: 9px; background: var(--sv-campo); }
  .cel .txt { flex: 1; text-align: left; max-width: none; }

  /* aberto: a lista embaixo (344 px à direita no notebook, como no desenho; a largura toda no celular) */
  .lista {
    position: absolute; top: 46px; right: 0; width: 344px; max-height: min(420px, 60vh); overflow-y: auto; overscroll-behavior: contain; z-index: 5;
    background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; box-shadow: 0 12px 32px rgba(0, 0, 0, .18); padding: 6px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .cel .lista { top: 50px; left: 0; right: 0; width: auto; }
  .cab { font-size: 12px; font-weight: 700; color: var(--sv-suave); padding: 6px 10px 4px; }
  .lista button {
    display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; text-align: left; flex: none;
  }
  .cel .lista button { min-height: 50px; }
  .lista button.atual { background: var(--sel-escolhido); }
  @media (hover: hover) { .lista button:not(.atual):hover { background: var(--sv-linha); } }
  .lista button:focus-visible { outline: 2px solid var(--sv-mod); outline-offset: -2px; }
  .lista button :global(svg) { color: var(--sv-link); }
  .linhas { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .linhas strong { font-size: 13.5px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .linhas span { font-size: 12px; color: var(--sv-suave); }
</style>
