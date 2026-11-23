<!-- O alto das três abas dos blocos de recibo (rodada 17): o título "Blocos de recibo", o subtítulo de quem está vendo e da aba, à direita o nível
     ("Sede administrativa", "Área 2", o cadeado "Vila Nova") e o que cada aba põe ali (a ação da Geral, o seletor do bloco), o recado que a aba
     quiser logo abaixo e as abas.
     No celular o título está na barra do alto: ficam só as abas, em pílulas. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icone from "../../../comum/Icone.svelte";
  import { ir, escopo, nivelDaSessao, type AbaBlocos } from "../../estado.svelte";

  interface Props { aba: AbaBlocos; celular: boolean; acoes?: Snippet; abaixo?: Snippet }
  let { aba, celular, acoes, abaixo }: Props = $props();

  const nivel = nivelDaSessao();
  const ABAS: readonly { readonly chave: AbaBlocos; readonly rotulo: string; readonly sub: string }[] = [
    { chave: "blocos", rotulo: "Blocos", sub: "os blocos" },
    { chave: "folhas", rotulo: "Folhas do bloco", sub: "as folhas de um bloco" },
    { chave: "livro", rotulo: "Livro de entrada e saída", sub: "o livro de entrada e saída" }
  ];

  const e = $derived(escopo.tela);
  const subAba = $derived(ABAS.find((a) => a.chave === aba)?.sub ?? "");
  const subtitulo = $derived.by(() => {
    if (!e) return subAba;
    if (e.geral) return `Sede administrativa · as ${e.congregacoes} congregações · ${subAba}`;
    if (e.congregacao) return `Congregação ${e.congregacao} · ${subAba}`;
    const n = `${e.congregacoes} ${e.congregacoes === 1 ? "congregação" : "congregações"}`;
    return `${e.area ? e.area + " · " : ""}${n} · ${subAba}`;
  });
  const rotuloNivel = $derived(!e ? "" : e.geral ? "Sede administrativa" : e.congregacao ?? e.area ?? `${e.congregacoes} congregações`);
</script>

{#if celular}
  <nav class="abas-cel" aria-label="Partes dos blocos de recibo">
    {#each ABAS as a (a.chave)}
      <button type="button" class:ativa={a.chave === aba} aria-current={a.chave === aba ? "page" : undefined} onclick={() => ir({ tela: "blocos", aba: a.chave })}>{a.rotulo}</button>
    {/each}
  </nav>
{:else}
  <header class="cab-pag">
    <div class="textos">
      <h1>Blocos de recibo</h1>
      <p>{subtitulo}</p>
    </div>
    <div class="acoes">
      {#if rotuloNivel}
        <span class="nivel" class:local={nivel === "local"}><Icone nome={nivel === "local" ? "cadeado" : "mapa"} tam={nivel === "local" ? 15 : 17} traco={2} />{rotuloNivel}</span>
      {/if}
      {#if acoes}{@render acoes()}{/if}
    </div>
  </header>
  {#if abaixo}{@render abaixo()}{/if}
  <nav class="abas" aria-label="Partes dos blocos de recibo">
    {#each ABAS as a (a.chave)}
      <button type="button" class:ativa={a.chave === aba} aria-current={a.chave === aba ? "page" : undefined} onclick={() => ir({ tela: "blocos", aba: a.chave })}>{a.rotulo}</button>
    {/each}
  </nav>
{/if}

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* o título (22 px) e, à direita, o nível e o que a aba põe ali */
  .cab-pag { display: flex; align-items: center; gap: 16px; }
  .textos { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  h1 { font-size: 22px; font-weight: 700; color: var(--sv-titulo); line-height: 1.25; }
  .textos p { font-size: 14.5px; color: var(--sv-suave); }
  .acoes { display: flex; gap: 10px; align-items: center; flex: none; }
  .nivel {
    height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; flex: none;
  }
  .nivel :global(svg) { color: var(--sv-icone); }
  .nivel.local { height: 36px; gap: 7px; font-size: 13.5px; border-color: var(--sv-borda); background: transparent; }
  .nivel.local :global(svg) { color: var(--sv-suave); }

  /* as abas (o traço dourado embaixo da escolhida) */
  .abas { display: flex; gap: 24px; border-bottom: 1px solid var(--sv-borda); }
  .abas button { border: 0; background: transparent; padding: 0 2px 10px; font-size: 14.5px; font-weight: 500; color: var(--sv-suave); white-space: nowrap; }
  .abas button.ativa { font-weight: 700; color: var(--sv-titulo); box-shadow: inset 0 -3px 0 #FFB800; }
  .abas-cel { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-right: -14px; padding-right: 14px; flex: none; }
  .abas-cel::-webkit-scrollbar { display: none; }
  .abas-cel button {
    flex: none; height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
    font-size: 12.5px; font-weight: 600; color: var(--sv-texto); white-space: nowrap;
  }
  .abas-cel button.ativa { background: var(--fin-forte); border-color: var(--fin-forte); color: var(--fin-forte-texto); font-weight: 700; }
</style>
