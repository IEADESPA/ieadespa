<!-- Blocos de recibo: o livro de entrada e saída (rodada 17, "r17-blocos-livro", opção 1). Em construção nesta parte do incremento 2. -->
<script lang="ts">
  import EmConstrucao from "../../../comum/EmConstrucao.svelte";
  import Cabecalho from "./Cabecalho.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();
</script>

<div class="pagina" class:cel={celular}>
  <Cabecalho aba="livro" {celular} />
  <EmConstrucao titulo="Livro de entrada e saída" texto="Esta parte dos blocos de recibo vem no próximo incremento." />
</div>

<style>
  .pagina { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina.cel { gap: 10px; }
</style>
