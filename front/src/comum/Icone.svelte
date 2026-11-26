<!-- Um ícone de traço da casca (as MESMAS formas do iconeSvg de app/modulos/casca.js, que a ponte entrega). Nome fora da lista não desenha nada. -->
<script lang="ts">
  import { ponte } from "./ponte";

  interface Props { nome: string; tam?: number; traco?: number }
  let { nome, tam = 20, traco = 1.8 }: Props = $props();
  const d = $derived(Object.prototype.hasOwnProperty.call(ponte().icones, nome) ? ponte().icones[nome] ?? "" : "");
</script>

{#if d}
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={traco} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path {d} /></svg>
{/if}

<style>
  svg { flex: none; display: block; }
</style>
