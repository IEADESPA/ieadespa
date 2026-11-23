<!-- O quadro branco das telas do Financeiro (o "m9Cartao" do desenho da rodada 17): o título de 15 px, a nota à direita e o conteúdo, com 14 × 16 px
     de folga. No celular a nota some (o desenho tira as notas dos quadros). O comum/Cartao tem outras medidas (o título de 16 px). -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props { titulo: string; nota?: string; celular?: boolean; rotulo?: string; children: Snippet }
  let { titulo, nota, celular = false, rotulo, children }: Props = $props();
</script>

<section class="quadro" aria-label={rotulo}>
  <div class="topo">
    <h2>{titulo}</h2>
    {#if nota && !celular}<span class="nota">{nota}</span>{/if}
  </div>
  {@render children()}
</section>

<style>
  .quadro { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .topo { display: flex; align-items: baseline; gap: 8px; }
  h2 { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .nota { font-size: 12px; color: var(--sv-suave); white-space: nowrap; }
</style>
