<!-- Escolha de uma opção entre poucas, em chips lado a lado (ex.: "Como entrou: Batismo | Carta de mudança | ..."). Teclado: setas trocam. -->
<script lang="ts" generics="V extends string | number">
  interface Props { rotulo: string; opcoes: readonly { readonly valor: V; readonly rotulo: string }[]; valor: V | null; onescolher: (v: V) => void; pequenas?: boolean }
  let { rotulo, opcoes, valor, onescolher, pequenas = false }: Props = $props();

  function teclado(ev: KeyboardEvent, i: number) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    ev.preventDefault();
    const prox = opcoes[(i + (ev.key === "ArrowRight" ? 1 : opcoes.length - 1)) % opcoes.length];
    if (prox) onescolher(prox.valor);
    const pai = (ev.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => pai?.querySelector<HTMLElement>("[aria-checked='true']")?.focus());
  }
</script>

<div class="opcoes" class:pequenas role="radiogroup" aria-label={rotulo}>
  {#each opcoes as o, i (o.valor)}
    <button type="button" role="radio" aria-checked={o.valor === valor} tabindex={o.valor === valor || (valor === null && i === 0) ? 0 : -1}
      onclick={() => onescolher(o.valor)} onkeydown={(ev) => teclado(ev, i)}>{o.rotulo}</button>
  {/each}
</div>

<style>
  .opcoes { display: flex; flex-wrap: wrap; gap: 6px; }
  button {
    height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--sv-borda); background: var(--sv-sup); color: var(--sv-titulo);
    font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background-color .15s ease, transform .12s ease; -webkit-tap-highlight-color: transparent;
  }
  button:active { transform: scale(.97); }
  button[aria-checked="true"] { background: var(--sv-escolha); color: var(--sv-escolha-texto); border-color: var(--sv-escolha); }
  .pequenas button { height: 30px; font-size: 13px; padding: 0 10px; }
</style>
