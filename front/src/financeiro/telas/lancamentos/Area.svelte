<!-- A área acompanha os lançamentos (r24-lancamento, a vista da área = o r20LancArea): quem lança é cada congregação (ou a Tesouraria Geral por
     ela); a área vê o último lançamento, o lançado no mês, o bloco e a folha em que cada uma está e o que precisa de atenção. "Ver" abre a
     planilha da congregação, só para consultar.
     A coluna "Entrega" (o jeito do repasse: parcial, mensal, a obra liberada) é do incremento 5: até lá, "—" (a resposta 6 de 26/11/2026, sem
     repasse inventado). -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import type { AreaLancamentos, CongregacaoDaArea } from "../../tipos";
  import { emReais, folhaTxt, nomeDoMes, quandoCurto } from "../../lancamentos";

  interface Props { celular: boolean; area: AreaLancamentos; onver: (id: number) => void }
  let { celular, area, onver }: Props = $props();

  const precisam = $derived(area.congregacoes.filter((c) => c.precisa.length));
  const emDia = $derived(area.congregacoes.filter((c) => !c.precisa.length));
  let filtro = $state<"meu" | "tudo" | null>(null);
  const agora = $derived(filtro ?? (precisam.length ? "meu" : "tudo"));
  const lista = $derived(agora === "meu" ? precisam : area.congregacoes);
  let todasEmDia = $state(false);

  const blocoAgora = (c: CongregacaoDaArea): string => (c.agora ? `${folhaTxt(c.agora.bloco)} · na ${folhaTxt(c.agora.folha)}` : "—");
</script>

{#snippet filtros()}
  <div class="filtros" role="group" aria-label="O que mostrar">
    <button type="button" class:ativa={agora === "meu"} aria-pressed={agora === "meu"} onclick={() => (filtro = "meu")}>Só o que eu preciso resolver ({precisam.length})</button>
    <button type="button" class:ativa={agora === "tudo"} aria-pressed={agora === "tudo"} onclick={() => (filtro = "tudo")}>Tudo da área ({area.congregacoes.length})</button>
  </div>
{/snippet}

{#if celular}
  {@render filtros()}
  {#each agora === "meu" ? precisam : area.congregacoes.filter((c) => c.precisa.length) as c (c.id)}
    <button type="button" class="celula" onclick={() => onver(c.id)}>
      <span class="l1"><strong>{c.nome}</strong><span class="ver">Ver</span></span>
      <span class="l2">{c.precisa.join(" · ")} · último lançamento {quandoCurto(c.ultimoLancamento)}</span>
      <span class="l3">Ver o lançamento ›</span>
    </button>
  {/each}
  {#if emDia.length}
    <section class="em-dia">
      <h2>Em dia: {emDia.length} de {area.congregacoes.length}</h2>
      <div class="etiquetas">
        {#each todasEmDia ? emDia : emDia.slice(0, 3) as c (c.id)}
          <button type="button" class="etq" onclick={() => onver(c.id)}><Icone nome="check" tam={13} traco={2.6} />{c.nome}</button>
        {/each}
        {#if !todasEmDia && emDia.length > 3}<button type="button" class="mais" onclick={() => (todasEmDia = true)}>e mais {emDia.length - 3} ›</button>{/if}
      </div>
    </section>
  {/if}
{:else}
  <div class="nota-area">
    <Icone nome="ajudaQ" tam={17} traco={2} />
    <p><strong>Quem lança é cada congregação</strong> (ou a Tesouraria Geral por ela), a qualquer hora. A área acompanha: o último lançamento, a folha em que cada uma está e o que precisa de atenção.</p>
  </div>
  {@render filtros()}
  <div class="tab" role="table" aria-label="Os lançamentos das congregações da área">
    <div class="fila cab" role="row">
      <span role="columnheader">Congregação</span><span role="columnheader">Entrega</span><span role="columnheader">Último lançamento</span>
      <span role="columnheader">Lançado no mês</span><span role="columnheader">Bloco e folha agora</span><span role="columnheader">O que precisa</span>
    </div>
    {#each lista as c (c.id)}
      <button type="button" class="fila" onclick={() => onver(c.id)}>
        <span class="nome">{c.nome}</span>
        <span class="tra">—</span>
        <span>{quandoCurto(c.ultimoLancamento)}</span>
        <strong>{emReais(c.lancadoNoMes)}</strong>
        <span>{blocoAgora(c)}</span>
        {#if c.precisa.length}<span class="precisa"><span class="ver">Ver</span><span class="corta">{c.precisa.join(" · ")}</span></span>
        {:else}<span class="tra">tudo certo</span>{/if}
      </button>
    {:else}
      <p class="vazio">{agora === "meu" ? "Nada precisa de você agora." : "Nenhuma congregação na área."}</p>
    {/each}
  </div>
  <div class="numeros">
    <div class="num"><span>lançaram em {nomeDoMes(area.mes)}</span><strong>{area.resumo.lancaram} de {area.resumo.congregacoes}</strong></div>
    <div class="num"><span>lançado na área</span><strong>{emReais(area.resumo.total)}</strong></div>
    <div class="num"><span>precisam de você</span><strong>{area.resumo.precisam}</strong></div>
  </div>
{/if}

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .nota-area { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--sv-info-fundo); border: 1px solid var(--sv-info-borda); font-size: 13px; line-height: 1.4; color: var(--sv-texto); }
  .nota-area :global(svg) { color: var(--sv-link); flex: none; margin-top: 1px; }
  .nota-area strong { color: var(--sv-titulo); }
  .filtros { display: flex; gap: 8px; flex-wrap: wrap; }
  .filtros button { height: 32px; padding: 0 14px; border-radius: 16px; border: 1px solid var(--sv-borda); background: var(--sv-sup); font-size: 13px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; }
  .filtros button.ativa { background: #0A2342; border-color: #0A2342; color: #FFFFFF; }
  :global(html[data-tema="escuro"]) .filtros button.ativa { background: #FFB800; border-color: #FFB800; color: #0A2342; }
  .tab { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; overflow: hidden; }
  .fila {
    display: grid; grid-template-columns: 1.25fr .8fr 1.05fr 1fr 1fr 1.45fr; gap: 10px; padding: 0 16px; min-height: 44px; align-items: center; width: 100%; border: 0;
    border-top: 1px solid var(--sv-linha); background: transparent; text-align: left; font-size: 13.5px; color: var(--sv-texto);
  }
  .fila > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila.cab { min-height: 38px; border-top: 0; background: var(--sv-fundo); font-size: 12.5px; font-weight: 700; color: var(--sv-suave); }
  button.fila:hover { background: var(--sv-fundo); }
  button.fila:focus-visible { outline: 2px solid var(--fin-forte); outline-offset: -2px; }
  .nome { font-weight: 600; color: var(--sv-titulo); }
  .fila strong { color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
  .tra { color: var(--sv-suave); }
  .precisa { display: flex; align-items: center; gap: 8px; }
  .corta { overflow: hidden; text-overflow: ellipsis; }
  .ver { display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 12px; background: var(--sv-pend-fundo); color: var(--sv-pend); flex: none; }
  .vazio { padding: 14px 16px; border-top: 1px solid var(--sv-linha); font-size: 13.5px; color: var(--sv-suave); }
  .numeros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .num { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 1px; }
  .num span { font-size: 12px; color: var(--sv-suave); }
  .num strong { font-size: 18px; font-weight: 800; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
  /* o celular: as que precisam em cartões e as em dia em etiquetas */
  .celula { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; text-align: left; width: 100%; }
  .l1 { display: flex; align-items: center; gap: 8px; }
  .l1 strong { flex: 1; font-size: 14px; color: var(--sv-titulo); }
  .l2 { font-size: 12.5px; color: var(--sv-texto); }
  .l3 { font-size: 12.5px; font-weight: 700; color: var(--sv-link); }
  .em-dia { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .em-dia h2 { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .etiquetas { display: flex; gap: 6px; flex-wrap: wrap; }
  .etq { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--sv-borda); background: transparent; font-size: 12.5px; color: var(--sv-texto); white-space: nowrap; }
  .etq :global(svg) { color: #166534; }
  :global(html[data-tema="escuro"]) .etq :global(svg) { color: #86EFAC; }
  .mais { display: inline-flex; align-items: center; height: 28px; padding: 0 8px; border: 0; background: transparent; font-size: 12.5px; font-weight: 700; color: var(--sv-link); }
</style>
