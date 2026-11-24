<!-- O quadro branco das telas do Financeiro (o "m9Cartao" do desenho da rodada 17): o título de 15 px, a nota à direita e o conteúdo, com 14 × 16 px
     de folga. No celular a nota some (o desenho tira as notas dos quadros). O comum/Cartao tem outras medidas (o título de 16 px). O `extra` fica à
     direita do título, também no celular (a etiqueta da folha clicada, na r30). -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props { titulo: string; nota?: string; celular?: boolean; rotulo?: string; extra?: Snippet; children: Snippet }
  let { titulo, nota, celular = false, rotulo, extra, children }: Props = $props();
</script>

<section class="quadro" class:cel={celular} aria-label={rotulo}>
  <div class="topo">
    <h2>{titulo}</h2>
    {#if nota && !celular}<span class="nota">{nota}</span>{/if}
    {#if extra}{@render extra()}{/if}
  </div>
  {@render children()}
</section>

<style>
  .quadro { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  /* no celular, a folga dos cartões do desenho (11 × 12 px) */
  .quadro.cel { padding: 11px 12px; }
  .topo { display: flex; align-items: baseline; gap: 8px; }
  h2 { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .nota { font-size: 12px; color: var(--sv-suave); white-space: nowrap; }
</style>
