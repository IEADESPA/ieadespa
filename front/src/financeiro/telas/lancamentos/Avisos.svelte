<!-- Os dois recados do mês que começa nas folhas marcadas "mês posterior" no mês anterior (r24-lancamento):
     - "comeco": a faixa amarela "Dezembro começa na 70.161, a 1ª folha marcada “mês posterior” em novembro. A 70.161 e a 70.162: nome e valor
       obrigatórios*" (na linha de lançar e no celular, solta; na planilha ela fica dentro da tabela);
     - "nota": a nota azul "A 70.161 e a 70.162 entraram em novembro e somam aqui, em dezembro, para todos os fins…". -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import { asFolhas, folhaTxt, mesVizinho, nomeDoMes, NomeDoMes } from "../../lancamentos";

  interface Props { tipo: "comeco" | "nota"; mes: string; marcadas: readonly number[]; celular?: boolean }
  let { tipo, mes, marcadas, celular = false }: Props = $props();

  const anterior = $derived(mesVizinho(mes, -1));
  const As = $derived(asFolhas(marcadas).replace(/^a /, "A ").replace(/^as /, "As "));
  const entraram = $derived(marcadas.length === 1 ? "entrou" : "entraram");
  const somam = $derived(marcadas.length === 1 ? "soma" : "somam");
</script>

{#if marcadas.length}
  {#if tipo === "comeco"}
    <div class="comeco" class:cel={celular}>
      <Icone nome="livro" tam={15} traco={2.2} />
      <span><strong>{NomeDoMes(mes)} começa na {folhaTxt(marcadas[0] ?? 0)}, a 1ª folha marcada “mês posterior” em {nomeDoMes(anterior)}.</strong>
        {As}: nome e valor obrigatórios<span class="obrig">*</span></span>
    </div>
  {:else}
    <div class="nota" class:cel={celular}>
      <Icone nome="seta" tam={16} traco={2.4} />
      <span><strong>{As} {entraram} em {nomeDoMes(anterior)} e {somam} aqui, em {nomeDoMes(mes)}, para todos os fins</strong>{#if celular}.{:else}: no
        total, no pré-repasse, no 60/40 e no relatório de {nomeDoMes(mes)}. Ao lançar, só existe “Este mês” ou “Mês posterior”.{/if}</span>
    </div>
  {/if}
{/if}

<style>
  .comeco { display: flex; align-items: center; gap: 9px; padding: 8px 14px; border-radius: 12px; background: #FFF4D1; font-size: 12.5px; color: var(--sv-texto); line-height: 1.35; }
  .comeco.cel { padding: 8px 10px; }
  .comeco > :global(svg) { color: #8A5A00; flex: none; }
  .comeco strong { color: var(--sv-titulo); }
  :global(html[data-tema="escuro"]) .comeco { background: #3A2E0B; }
  :global(html[data-tema="escuro"]) .comeco > :global(svg) { color: #FCD34D; }
  .obrig { color: #B91C1C; font-weight: 800; }
  :global(html[data-tema="escuro"]) .obrig { color: #FCA5A5; }
  .nota { display: flex; align-items: center; gap: 10px; padding: 7px 14px; border-radius: 12px; background: #F5F8FF; border: 1px solid #C9DAFB; font-size: 12.5px; color: var(--sv-texto); line-height: 1.4; }
  .nota.cel { padding: 8px 10px; }
  .nota > :global(svg) { color: #1D4ED8; flex: none; }
  .nota strong { color: var(--sv-titulo); }
  :global(html[data-tema="escuro"]) .nota { background: #0F2340; border-color: #2B4A7A; }
  :global(html[data-tema="escuro"]) .nota > :global(svg) { color: #93C5FD; }
</style>
