<!-- O título da página (25 px, sem barra colorida ao lado), a linha de baixo e, à direita, as ações. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props { titulo: string; sub?: string; acoes?: Snippet; abaixo?: Snippet }
  let { titulo, sub, acoes, abaixo }: Props = $props();
</script>

<header class="cab">
  <div class="textos">
    <h1>{titulo}</h1>
    {#if sub}<p>{sub}</p>{/if}
    {#if abaixo}{@render abaixo()}{/if}
  </div>
  {#if acoes}<div class="acoes">{@render acoes()}</div>{/if}
</header>

<style>
  .cab { display: flex; align-items: center; gap: 16px; }
  .textos { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  h1 { font-size: 25px; font-weight: 700; color: var(--sv-titulo); line-height: 1.25; overflow-wrap: anywhere; }
  p { font-size: 14.5px; color: var(--sv-suave); }
  .acoes { display: flex; gap: 10px; align-items: center; flex: none; }
  @media (max-width: 640px) {
    .cab { flex-wrap: wrap; }
    h1 { font-size: 21px; }
    p { font-size: 13.5px; }
    .acoes { width: 100%; }
  }
</style>
