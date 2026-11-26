<!-- Blocos de recibo (rodada 17, opção 1 de cada aba): "Blocos" (r17-blocos), "Folhas do bloco" (r17-blocos-folhas) e "Livro de entrada e saída"
     (r17-blocos-livro). Cada aba é uma peça em blocos/; o alto comum (título, nível e as abas) está em blocos/Cabecalho.svelte. -->
<script lang="ts">
  import type { AbaBlocos } from "../estado.svelte";
  import Lista from "./blocos/Lista.svelte";
  import Folhas from "./blocos/Folhas.svelte";
  import Livro from "./blocos/Livro.svelte";

  interface Props { aba: AbaBlocos; celular: boolean }
  let { aba, celular }: Props = $props();
</script>

{#if aba === "folhas"}
  <Folhas {celular} />
{:else if aba === "livro"}
  <Livro {celular} />
{:else}
  <Lista {celular} />
{/if}
