<!-- Passo 4 da importação (r27): o resultado. Os quadros do que entrou, o aviso do arrolamento, onde as fichas ficaram HOJE (por área,
     quantas já completaram o arrolamento) e a trilha (quem importou, quando, as matrículas novas, as repetidas). Não se importa de novo:
     a tela fica só com o resultado. -->
<script lang="ts">
  import Botao from "../../comum/Botao.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import { numero, plural } from "../../comum/formato";
  import Quadros from "./Quadros.svelte";
  import Arrolamento from "./Arrolamento.svelte";
  import { baixarLista, diaMesHora, quandoCurto, type Importacao, type Quadro, type Retrato } from "./importar";

  interface Props { celular: boolean; importacao: Importacao; retrato: Retrato }
  let { celular, importacao, retrato }: Props = $props();

  const res = $derived(importacao.resumo?.resultado ?? null);
  const importadas = $derived(res ? res.importadas : retrato.porArea.reduce((s, a) => s + a.fichas, 0));
  const sem = $derived(retrato.porArea.filter((a) => a.semCongregacao).reduce((s, a) => s + a.fichas, 0));
  const areas = $derived(retrato.porArea.filter((a) => !a.semCongregacao));
  const pendentes = $derived(retrato.porArea.reduce((s, a) => s + Math.max(0, a.fichas - a.completas), 0));
  const novas = $derived(retrato.matriculasNovas);
  const faixa = $derived(novas.total === 0 || novas.de == null ? "nenhuma" : novas.total === 1 || novas.de === novas.ate ? `a ${numero(novas.de)}` : `da ${numero(novas.de)} à ${numero(novas.ate)}`);
  const quadros = $derived<Quadro[]>([
    { n: importadas, rotulo: "Fichas no sistema", sub: `importadas em ${diaMesHora(importacao.concluidaEm)}` },
    { n: retrato.quadros.comMatricula, rotulo: "Com a matrícula de antes", sub: "como no sistema pago" },
    { n: retrato.quadros.acertar, rotulo: "Com matrícula nova", sub: faixa },
    { n: retrato.quadros.repetidas, rotulo: "Em “Fichas repetidas”", sub: "para a secretaria juntar" },
    { n: sem, rotulo: "Sem congregação", sub: "para a Geral distribuir" }
  ]);
  const forte = $derived(pendentes === importadas
    ? `${importadas === 1 ? "A ficha está" : `As ${numero(importadas)} estão`} com a pendência “completar o arrolamento”, sem voto até completar.`
    : pendentes > 0
      ? `${numero(pendentes)} das ${numero(importadas)} ainda estão com a pendência “completar o arrolamento”, sem voto até completar.`
      : `As ${numero(importadas)} já completaram o arrolamento.`);
  const quando = $derived(quandoCurto(importacao.concluidaEm));

  let baixando = $state(false);
  let erroBaixar = $state("");
  async function baixar() {
    if (baixando) return;
    baixando = true;
    erroBaixar = await baixarLista(importacao.importacaoId);
    baixando = false;
  }
</script>

<Quadros {quadros} {celular} />
<Arrolamento {celular} {forte} />

{#if celular}
  <ul class="lista-cel">
    {#each areas as a (a.area ?? "")}
      <li><span><strong>{a.area ?? "Sem área"}</strong><small>{numero(a.congregacoes)} {plural(a.congregacoes, "congregação", "congregações")} · {numero(a.completas)} {plural(a.completas, "completa", "completas")}</small></span><b class="sv-num">{numero(a.fichas)}</b></li>
    {/each}
    {#if sem}<li><span><strong>Sem congregação</strong><small class="ouro">a Geral escolhe</small></span><b class="sv-num">{numero(sem)}</b></li>{/if}
  </ul>
{:else}
  <div class="dois">
    <div class="tab" role="table" aria-label="Onde as fichas ficaram">
      <div class="cab" role="row"><span role="columnheader">Onde ficaram</span><span role="columnheader">Congregações</span><span role="columnheader">Fichas</span><span role="columnheader">Arrolamento</span></div>
      {#each areas as a (a.area ?? "")}
        <div class="lin" role="row">
          <span class="nome" role="cell">{a.area ?? "Sem área"}</span>
          <span role="cell" class="sv-num">{numero(a.congregacoes)}</span>
          <span role="cell" class="sv-num">{numero(a.fichas)}</span>
          <span role="cell" class="suave">{numero(a.completas)} {plural(a.completas, "completo", "completos")}</span>
        </div>
      {/each}
      {#if sem}
        <div class="lin" role="row">
          <span class="nome" role="cell">Sem congregação</span><span role="cell">—</span><span role="cell" class="sv-num">{numero(sem)}</span>
          <span role="cell" class="ouro">a Geral escolhe</span>
        </div>
      {/if}
    </div>
    <section class="cartao">
      <div class="topo"><h2>A trilha</h2></div>
      <ul class="trilha">
        <li><b>{quando}</b><span>{#if retrato.confirmadaPor}<strong>{retrato.confirmadaPor}</strong> (Secretaria Geral) importou{:else}A Secretaria Geral importou{/if} {numero(importadas)} {plural(importadas, "ficha", "fichas")} do sistema pago</span></li>
        {#if novas.total > 0}<li><b>{quando}</b><span>{numero(novas.total)} {plural(novas.total, "matrícula nova", "matrículas novas")}: {faixa}</span></li>{/if}
        {#if retrato.quadros.repetidas > 0}<li><b>{quando}</b><span>{numero(retrato.quadros.repetidas)} {plural(retrato.quadros.repetidas, "ficha foi", "fichas foram")} para “Fichas repetidas”</span></li>{/if}
        {#if res && res.fora > 0}<li><b>{quando}</b><span>{numero(res.fora)} {plural(res.fora, "linha ficou", "linhas ficaram")} de fora</span></li>{/if}
      </ul>
      <Botao tipo="linha" icone="doc" largo ocupado={baixando} onclick={baixar}>Baixar a lista do que aconteceu (sem CPF)</Botao>
      {#if erroBaixar}<Aviso tom="erro">{erroBaixar}</Aviso>{/if}
      <p class="nota">Não se importa de novo: esta tela fica só com o resultado.</p>
    </section>
  </div>
{/if}

<style>
  .dois { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .tab { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; overflow: hidden; min-width: 0; }
  .cab, .lin { display: grid; grid-template-columns: minmax(0, 1.3fr) 104px 76px minmax(0, 1fr); gap: 10px; padding: 0 16px; align-items: center; }
  .cab { height: 38px; font-size: 12.5px; font-weight: 700; color: var(--sv-suave); background: var(--sv-fundo); }
  .lin { min-height: 44px; border-top: 1px solid var(--sv-linha); font-size: 13.5px; color: var(--sv-texto); }
  .lin > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nome { font-weight: 600; color: var(--sv-titulo); }
  .suave { color: var(--sv-suave); }
  .ouro { color: var(--imp-ouro-texto); font-weight: 600; }
  .cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 11px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .topo { display: flex; align-items: center; min-height: 24px; }
  h2 { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .trilha { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .trilha li { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 10px; align-items: baseline; padding: 5px 0; font-size: 12.5px; line-height: 1.35; }
  .trilha li + li { border-top: 1px solid var(--sv-linha); }
  .trilha b { color: var(--sv-titulo); white-space: nowrap; }
  .trilha span { min-width: 0; color: var(--sv-texto); }
  .trilha strong { color: var(--sv-titulo); }
  .nota { font-size: 12px; color: var(--sv-suave); line-height: 1.4; }
  .lista-cel { list-style: none; margin: 0; padding: 0 12px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; }
  .lista-cel li { display: flex; align-items: center; gap: 10px; min-height: 52px; }
  .lista-cel li + li { border-top: 1px solid var(--sv-linha); }
  .lista-cel span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lista-cel strong { font-size: 14px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lista-cel small { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lista-cel small.ouro { color: var(--imp-ouro-texto); }
  .lista-cel b { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
</style>
