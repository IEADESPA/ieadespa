<!-- Os números lado a lado do desenho (o "r16aNum" da rodada 16): cada um num quadrinho, o rótulo pequeno em cima e o número grande embaixo. -->
<script lang="ts">
  import { numero } from "../../comum/formato";

  interface Props { itens: readonly (readonly [number, string])[] }
  let { itens }: Props = $props();
</script>

<div class="numeros" style:--colunas={itens.length}>
  {#each itens as [n, rot] (rot)}<div class="numero"><span>{rot}</span><strong>{numero(n)}</strong></div>{/each}
</div>

<style>
  .numeros { display: grid; grid-template-columns: repeat(var(--colunas), 1fr); gap: 10px; }
  .numero { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .numero span { font-size: 12px; color: var(--sv-suave); }
  .numero strong { font-size: 18px; font-weight: 800; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
</style>
