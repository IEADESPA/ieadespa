<!-- Lançar dízimos e ofertas (incremento 3; rodada 24, "r24-lancamento", opção 1, sem "marcada em novembro"; a área é o r20LancArea).
     - A congregação lança (o cadeado "A sua congregação"); a Tesouraria Geral lança por uma congregação de cada vez ("Lançando por · Trocar",
       o seletor comum da r20); a área acompanha ("Vendo · As 12 da área") e abre a planilha de uma congregação só para consultar.
     - Duas vistas: a Planilha (muitas folhas; "Salvar (Ctrl + S)" grava tudo de uma vez, tudo ou nada) e a Linha de lançar (poucas entradas;
       "Lançar (Enter)" grava a folha). No celular, a linha de lançar em cartão.
     - O "Dia do lançamento" vem com hoje e pode ser outro dia do mês de agora ou do anterior (enquanto o relatório dele não foi mandado), nunca
       depois de hoje: escolher um dia do mês anterior abre a planilha dele. O servidor confere tudo de novo.
     - O que se digitou e não se salvou não se perde sem aviso: trocar de congregação ou de mês pede para salvar ou descartar antes.
     A regra pura está em api/shared/finLancamentos.js; os textos e o pedido, em ../lancamentos.ts. -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { avisarFalha, pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import SeletorCongregacao from "../../comum/SeletorCongregacao.svelte";
  import type { CongregacaoDoSeletor } from "../../comum/tipos";
  import Vazio from "../partes/Vazio.svelte";
  import { barra, nivelDaSessao } from "../estado.svelte";
  import { hojeBrasilia } from "../blocos";
  import type { AreaLancamentos, DestinoFolha, HistoricoFolha, HistoricoLancamento, LinhaPlanilha, PlanilhaMes } from "../tipos";
  import {
    diaComSemana, folhaDaRecusa, lerArea, mesVizinho, lerCongregacoes, lerHistoricoLancamento, lerPlanilha, nomeDoMes, paraSalvar, rascunhoNovo, rascunhoVazio,
    salvarLinhas, totaisComRascunhos, type Rascunho
  } from "../lancamentos";
  import Tira from "./lancamentos/Tira.svelte";
  import Planilha from "./lancamentos/Planilha.svelte";
  import LinhaDeLancar from "./lancamentos/LinhaDeLancar.svelte";
  import Avisos from "./lancamentos/Avisos.svelte";
  import Totais from "./lancamentos/Totais.svelte";
  import FolhaLancada from "./lancamentos/FolhaLancada.svelte";
  import FolhaMarcada from "./blocos/FolhaMarcada.svelte";
  import Area from "./lancamentos/Area.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const nivel = nivelDaSessao();
  const mesDe = (d: string): string => `${d.slice(0, 7)}-01`;

  let congregacoes = $state.raw<readonly CongregacaoDoSeletor[]>([]);
  let atual = $state<number | null>(null);
  /** o mês pedido ("AAAA-MM"); null = o de agora */
  let mesPedido = $state<string | null>(null);
  let planilha = $state.raw<PlanilhaMes | null>(null);
  let area = $state.raw<AreaLancamentos | null>(null);
  let carregando = $state(true);
  let falhaCarga = $state("");
  let rascunhos = $state.raw<Readonly<Record<number, Rascunho>>>({});
  /** a última folha nova que aparece (a vazia, "a próxima folha") */
  let ate = $state<number | null>(null);
  let dia = $state("");
  let diaDesejado: string | null = null;
  let modo = $state<"planilha" | "linha">("planilha");
  let gravando = $state(false);
  let recusa = $state<{ folha: number | null; mensagem: string } | null>(null);
  let seletorAberto = $state(false);
  let trocaPendente = $state<(() => void) | null>(null);
  let clicada = $state.raw<LinhaPlanilha | null>(null);
  let historicoLanc = $state.raw<HistoricoLancamento | null>(null);
  let historicoFolha = $state.raw<HistoricoFolha | null>(null);
  let motivoDesfazer = $state("");
  let faltaDesfazer = $state("");
  let desfazendo = $state(false);
  let linhaDeLancar = $state<{ focar: () => void } | null>(null);
  let pedido = 0;

  const lancavel = $derived(planilha?.lancavel === true);
  const hoje = $derived(planilha?.hoje ?? hojeBrasilia());
  const mesAgora = $derived(mesDe(hoje));
  /** o primeiro dia que ainda se lança: o 1º do mês anterior, ou do mês de agora depois de mandado o relatório do anterior */
  const minimo = $derived(planilha?.mandouAnterior ? mesAgora : mesVizinho(mesAgora, -1));
  const mesSeguinte = $derived(planilha ? mesVizinho(planilha.mes, 1) : mesVizinho(mesAgora, 1));
  const congregacao = $derived(planilha?.congregacao ?? null);
  const marcadas = $derived(planilha?.marcadasNoAnterior ?? []);
  const limite = $derived.by(() => {
    const p = planilha?.proxima, t = planilha?.tira;
    if (!p) return 0;
    return t && t.numero === p.bloco ? t.ultimaFolha : p.folha + 49;
  });
  /** as folhas novas da planilha: da próxima até a vazia depois da última digitada */
  const novas = $derived.by((): number[] => {
    const p = planilha?.proxima;
    if (!p || !lancavel) return [];
    const digitadas = Object.values(rascunhos).filter((r) => r.como === "nova" && r.folha >= p.folha && !rascunhoVazio(r)).map((r) => r.folha);
    const fim = Math.min(limite, Math.max(ate ?? p.folha, (digitadas.length ? Math.max(...digitadas) : p.folha - 1) + 1));
    const lista: number[] = [];
    for (let f = p.folha; f <= fim; f++) lista.push(f);
    return lista;
  });
  /** as folhas que se digitam, na ordem da tela */
  const ordem = $derived.by((): { folha: number; como: Rascunho["como"] }[] => [
    ...(lancavel ? (planilha?.linhas ?? []).filter((l) => l.situacao === "preencher" || l.situacao === "pendente").map((l) => ({ folha: l.folha, como: (l.situacao === "preencher" ? "preencher" : "nova") as Rascunho["como"] })) : []),
    ...novas.map((f) => ({ folha: f, como: "nova" as const }))
  ]);
  /** a folha de agora na linha de lançar e no celular: a primeira que se digita */
  const folhaDaLinha = $derived(ordem[0] ?? null);
  const rascunhoDaLinha = $derived(folhaDaLinha ? (rascunhos[folhaDaLinha.folha] ?? rascunhoNovo(folhaDaLinha.folha, folhaDaLinha.como)) : null);
  const digitadas = $derived(Object.values(rascunhos).filter((r) => !rascunhoVazio(r)).length);

  const titulo = $derived(nivel === "area" ? (congregacao ? `Lançamentos de ${congregacao.nome}` : "Lançamentos da área") : "Lançar dízimos e ofertas");
  const subtitulo = $derived.by(() => {
    if (nivel === "area" && !congregacao) {
      const n = congregacoes.length;
      return `${congregacoes[0]?.area ? `${congregacoes[0].area} · ` : ""}${n} ${n === 1 ? "congregação" : "congregações"} · ${nomeDoMes(area?.mes ?? mesAgora)} de ${(area?.mes ?? mesAgora).slice(0, 4)}`;
    }
    if (!congregacao) return `${diaComSemana(hoje)} · escolha a congregação`;
    if (!lancavel) return `${nomeDoMes(planilha?.mes ?? mesAgora)} de ${(planilha?.mes ?? mesAgora).slice(0, 4)} · ${congregacao.nome} · ${nivel === "area" ? "a área acompanha" : "só consulta"}`;
    return `${diaComSemana(dia || hoje)} · ${congregacao.nome} · ${nivel === "geral" ? "fica registrado que a Geral lançou" : "a hora entra sozinha ao salvar"}`;
  });

  // a barra do alto: "Lançar" no celular (a área: "Lançamentos"); a área dentro de uma congregação volta para a lista
  $effect(() => {
    barra.tituloCelular = nivel === "area" ? "Lançamentos" : "Lançar";
    barra.passo = nivel === "area" && congregacao ? { rotulo: congregacao.nome, voltar: () => pedirTroca(() => { atual = null; mesPedido = null; void carregar(); }) } : null;
  });
  $effect(() => () => { barra.tituloCelular = null; barra.passo = null; });

  async function carregar(): Promise<void> {
    const n = ++pedido;
    carregando = true;
    falhaCarga = "";
    clicada = null;
    recusa = null;
    if (nivel === "area" && atual === null) {
      planilha = null;
      const r = await lerArea();
      if (n !== pedido) return;
      carregando = false;
      if (!r.ok) { falhaCarga = r.mensagem; avisarFalha(r); return; }
      area = r.dados;
      return;
    }
    if (nivel === "geral" && atual === null) { planilha = null; carregando = false; return; }
    const r = await lerPlanilha(atual, mesPedido);
    if (n !== pedido) return;
    carregando = false;
    if (!r.ok) { falhaCarga = r.mensagem; avisarFalha(r); return; }
    planilha = r.dados;
    if (r.dados.congregacao) atual = r.dados.congregacao.id;
    ate = r.dados.proxima?.folha ?? null;
    const desejado = diaDesejado;
    diaDesejado = null;
    dia = desejado && mesDe(desejado) === r.dados.mes ? desejado : (r.dados.diaPadrao ?? r.dados.hoje ?? hojeBrasilia());
  }

  onMount(() => {
    void (async () => {
      const r = await lerCongregacoes();
      if (r.ok) congregacoes = r.dados.congregacoes;
    })();
    void carregar();
  });

  /** trocar de congregação ou de mês com folhas digitadas e não salvas: pergunta antes */
  function pedirTroca(acao: () => void): void {
    if (digitadas) { trocaPendente = acao; return; }
    acao();
  }
  function descartarETrocar(): void {
    const acao = trocaPendente;
    trocaPendente = null;
    rascunhos = {};
    acao?.();
  }

  function escolherCongregacao(id: number | null): void {
    if (id === atual) return;
    pedirTroca(() => { atual = id; mesPedido = null; void carregar(); });
  }
  function trocarDia(d: string): void {
    if (!planilha || d < minimo || d > hoje) return;
    if (mesDe(d) === planilha.mes) { dia = d; return; }
    pedirTroca(() => { diaDesejado = d; mesPedido = d.slice(0, 7); void carregar(); });
  }

  function mudar(folha: number, como: Rascunho["como"], patch: Partial<Rascunho>): void {
    const base = rascunhos[folha] ?? rascunhoNovo(folha, como);
    rascunhos = { ...rascunhos, [folha]: { ...base, ...patch } };
    if (recusa?.folha === folha) recusa = null;
  }

  /** Enter numa linha: a próxima folha que se digita (a vazia do fim abre a seguinte) */
  async function proximaLinha(folha: number): Promise<void> {
    const i = ordem.findIndex((o) => o.folha === folha);
    let seguinte = i >= 0 ? ordem[i + 1]?.folha : undefined;
    if (seguinte === undefined) {
      if (folha + 1 > limite) return;
      ate = folha + 1;
      seguinte = folha + 1;
    }
    await tick();
    document.querySelector<HTMLElement>(`.lancamentos [data-quem="${seguinte}"]`)?.focus();
  }

  async function focarRecusa(): Promise<void> {
    await tick();
    const f = recusa?.folha;
    if (!f) return;
    const linha = document.querySelector<HTMLElement>(`.lancamentos [data-folha="${f}"]`);
    linha?.scrollIntoView({ block: "center" });
    (linha?.querySelector<HTMLElement>("input, select, button") ?? document.querySelector<HTMLElement>(`.lancamentos [data-quem="${f}"]`))?.focus();
  }

  /** grava as folhas digitadas (a planilha: todas de uma vez; a linha de lançar: só a de agora) */
  async function gravar(lista: readonly Rascunho[]): Promise<boolean> {
    if (gravando || !congregacao || !lancavel) return false;
    gravando = true;
    recusa = null;
    const r = await salvarLinhas(congregacao.id, dia, lista.map(paraSalvar));
    gravando = false;
    if (!r.ok) {
      if (r.status === 422 || r.status === 409) { recusa = { folha: folhaDaRecusa(r.corpo), mensagem: r.mensagem }; void focarRecusa(); }
      else avisarFalha(r);
      return false;
    }
    ponte().avisar(r.dados.mensagem, "sucesso");
    const salvas = new Set(r.dados.folhas);
    rascunhos = Object.fromEntries(Object.entries(rascunhos).filter(([f]) => !salvas.has(Number(f))));
    await carregar();
    return true;
  }
  async function salvarTudo(): Promise<void> {
    const lista = Object.values(rascunhos).filter((r) => !rascunhoVazio(r)).sort((a, b) => a.folha - b.folha);
    if (!lista.length) { recusa = { folha: null, mensagem: "Nada para salvar: digite as folhas primeiro." }; return; }
    if (await gravar(lista)) {
      await tick();
      const p = planilha?.proxima?.folha;
      if (p) document.querySelector<HTMLElement>(`.lancamentos [data-quem="${p}"]`)?.focus();
    }
  }
  async function lancarUma(): Promise<void> {
    if (!rascunhoDaLinha) return;
    if (await gravar([rascunhoDaLinha])) { await tick(); linhaDeLancar?.focar(); }
  }

  function teclas(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (lancavel && !celular) void (modo === "planilha" ? salvarTudo() : lancarUma());
    }
  }

  // a folha clicada: o histórico e o Corrigir (a lançada) ou o desfazer (a marcada), no quadro embaixo da planilha
  async function clicar(l: LinhaPlanilha): Promise<void> {
    if (clicada?.folha === l.folha) { clicada = null; return; }
    clicada = l; historicoLanc = null; historicoFolha = null; motivoDesfazer = ""; faltaDesfazer = "";
    if (l.situacao === "lancada") {
      const r = await lerHistoricoLancamento(l.folha);
      if (clicada?.folha === l.folha && r.ok) historicoLanc = r.dados;
    } else {
      const r = await pedir<HistoricoFolha>("/financeiro/blocos/historico" + qs({ folha: l.folha }));
      if (clicada?.folha === l.folha && r.ok) historicoFolha = r.dados;
    }
  }
  async function desfazer(): Promise<void> {
    const l = clicada;
    if (!l || desfazendo) return;
    if (!motivoDesfazer.trim()) { faltaDesfazer = "Escreva o motivo para desfazer."; return; }
    desfazendo = true;
    const r = await pedir<{ mensagem: string }>("/financeiro/blocos/desfazer-folha", { metodo: "POST", corpo: { folha: l.folha, motivo: motivoDesfazer.trim() } });
    desfazendo = false;
    if (!r.ok) { if (r.status === 422) faltaDesfazer = r.mensagem; else avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    await carregar();
  }
  async function corrigido(): Promise<void> {
    const f = clicada?.folha;
    await carregar();
    const l = planilha?.linhas?.find((x) => x.folha === f);
    if (l) await clicar(l);
  }
</script>

<svelte:window onkeydown={teclas} />

{#snippet seletor()}
  <SeletorCongregacao {nivel} rotulo={nivel === "area" ? "Vendo" : "Lançando por"} {congregacoes} {atual} {celular} bind:aberto={seletorAberto}
    semEscolha={nivel === "area" ? `As ${congregacoes.length} da ${celular && congregacoes[0]?.area ? congregacoes[0].area : "área"}` : "Escolha a congregação"} onescolher={escolherCongregacao} />
{/snippet}

{#snippet trocaComRascunho()}
  {#if trocaPendente}
    <div class="aviso-troca" role="alert">
      <Icone nome="alerta" tam={17} traco={2} />
      <p><strong>{digitadas === 1 ? "Há 1 folha digitada e não salva." : `Há ${digitadas} folhas digitadas e não salvas.`}</strong> Salve antes de trocar, ou descarte o que foi digitado.</p>
      <button type="button" class="texto" onclick={() => (trocaPendente = null)}>Continuar aqui</button>
      <button type="button" class="linha-botao" onclick={descartarETrocar}>Descartar e trocar</button>
    </div>
  {/if}
{/snippet}

{#snippet modos()}
  <div class="seg" role="group" aria-label="Como lançar">
    <button type="button" class:ativo={modo === "planilha"} aria-pressed={modo === "planilha"} onclick={() => (modo = "planilha")}>Planilha</button>
    <button type="button" class:ativo={modo === "linha"} aria-pressed={modo === "linha"} onclick={() => { modo = "linha"; void tick().then(() => linhaDeLancar?.focar()); }}>Linha de lançar</button>
  </div>
{/snippet}

{#snippet recusaSnip()}
  {#if recusa}
    <div class="recusa" role="alert"><Icone nome="alerta" tam={17} traco={2} /><p>{recusa.mensagem}</p></div>
  {/if}
{/snippet}

{#snippet folhaClicada()}
  {#if clicada && clicada.situacao === "lancada"}
    {#key clicada.folha}
      <FolhaLancada {celular} linha={clicada} historico={historicoLanc} pode={lancavel} oncorrigido={() => void corrigido()} />
    {/key}
  {:else if clicada && clicada.situacao === "excecao"}
    <FolhaMarcada {celular} blocoNumero={clicada.bloco} folha={clicada.folha} posicao={clicada.folha - clicada.bloco * 50}
      destino={(clicada.destino ?? "").toLowerCase() as DestinoFolha} historico={historicoFolha} pode={nivel === "geral"}
      trava="Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela." nota={nivel === "geral" ? "desfazer pede o motivo" : "só a Tesouraria Geral desfaz"}
      gravando={desfazendo} falta={faltaDesfazer} bind:motivo={motivoDesfazer} ondesfazer={() => void desfazer()} oneditar={() => (faltaDesfazer = "")} />
  {/if}
{/snippet}

<div class="lancamentos" class:cel={celular}>
  {#if celular}
    {#if nivel !== "local"}{@render seletor()}{/if}
    {#if !seletorAberto}
      {@render trocaComRascunho()}
      {#if carregando && !planilha && !area}<Estado tipo="carregando" linhas={4} />
      {:else if falhaCarga}<Estado tipo="erro" texto={falhaCarga} ontentar={() => void carregar()} />
      {:else if nivel === "area" && !congregacao && area}<Area {celular} {area} onver={escolherCongregacao} />
      {:else if !congregacao}<Vazio titulo="Escolha a congregação" texto="A Tesouraria Geral lança por uma congregação de cada vez. Fica registrado que a Geral lançou." {celular} />
      {:else if planilha}
        <Avisos tipo="comeco" mes={planilha.mes} {marcadas} celular />
        {@render recusaSnip()}
        <LinhaDeLancar bind:this={linhaDeLancar} {celular} {planilha} r={rascunhoDaLinha} {lancavel} {gravando} erro="" {mesSeguinte}
          onmudar={(patch) => folhaDaLinha && mudar(folhaDaLinha.folha, folhaDaLinha.como, patch)} onlancar={() => void lancarUma()} />
      {/if}
    {/if}
  {:else}
    <header class="cab-pag">
      <div class="textos"><h1>{titulo}</h1><p>{subtitulo}</p></div>
      <div class="acoes">
        {@render seletor()}
        {#if congregacao && lancavel}
          {@render modos()}
          {#if modo === "planilha"}
            <button type="button" class="ouro" disabled={gravando} aria-busy={gravando} onclick={() => void salvarTudo()}>Salvar (Ctrl + S)</button>
          {/if}
        {/if}
      </div>
    </header>
    {@render trocaComRascunho()}

    {#if carregando && !planilha && !area}<Estado tipo="carregando" linhas={6} />
    {:else if falhaCarga}<Estado tipo="erro" texto={falhaCarga} ontentar={() => void carregar()} />
    {:else if nivel === "area" && !congregacao && area}<Area {celular} {area} onver={escolherCongregacao} />
    {:else if !congregacao}<Vazio titulo="Escolha a congregação" texto="A Tesouraria Geral lança por uma congregação de cada vez: escolha em “Lançando por”. Fica registrado que a Geral lançou." />
    {:else if planilha}
      {#if modo === "linha" && lancavel}
        <Avisos tipo="comeco" mes={planilha.mes} {marcadas} />
        <LinhaDeLancar bind:this={linhaDeLancar} {celular} {planilha} r={rascunhoDaLinha} {lancavel} {gravando} erro={recusa?.mensagem ?? ""} {mesSeguinte}
          onmudar={(patch) => folhaDaLinha && mudar(folhaDaLinha.folha, folhaDaLinha.como, patch)} onlancar={() => void lancarUma()} />
        <Avisos tipo="nota" mes={planilha.mes} {marcadas} />
      {:else}
        <Tira tira={planilha.tira ?? null} dia={dia || hoje} {hoje} {minimo} desligado={!lancavel} ondia={trocarDia} />
        {@render recusaSnip()}
        <Planilha {planilha} {rascunhos} {novas} {lancavel} erroFolha={recusa?.folha ?? null} clicada={clicada?.folha ?? null} {mesSeguinte}
          onmudar={mudar} onenter={(f) => void proximaLinha(f)} onclicar={(l) => void clicar(l)} />
        {@render folhaClicada()}
        <Avisos tipo="nota" mes={planilha.mes} {marcadas} />
        {#if planilha.totais}<Totais totais={totaisComRascunhos(planilha.totais, Object.values(rascunhos))} mes={planilha.mes} {marcadas} />{/if}
      {/if}
    {/if}
  {/if}
</div>

<style>
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .lancamentos { display: flex; flex-direction: column; gap: 12px; }
  .cab-pag { display: flex; align-items: center; gap: 14px; }
  .textos { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  h1 { font-size: 22px; font-weight: 700; color: var(--sv-titulo); line-height: 1.25; }
  .textos p { font-size: 13.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acoes { display: flex; gap: 10px; align-items: center; flex: none; }
  /* "Planilha | Linha de lançar" (o segModo do desenho) */
  .seg { display: flex; padding: 3px; gap: 3px; border-radius: 10px; background: #E8ECF2; border: 1px solid var(--sv-borda); }
  :global(html[data-tema="escuro"]) .seg { background: #0A1F3D; }
  .seg button { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font-size: 13.5px; font-weight: 700; color: var(--sv-texto); white-space: nowrap; }
  .seg button.ativo { background: #0A2342; color: #FFFFFF; }
  :global(html[data-tema="escuro"]) .seg button.ativo { background: #FFB800; color: #0A2342; }
  /* o botão dourado do desenho (m8Ouro): 40 px, 16 px de cada lado, a letra 14 */
  .ouro { height: 40px; padding: 0 16px; border: 0; border-radius: 10px; background: #FFB800; color: #0A2342; font-size: 14px; font-weight: 700; white-space: nowrap; }
  .ouro:disabled { opacity: .6; cursor: default; }
  .recusa, .aviso-troca { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.4; }
  .recusa { background: var(--sv-atr-fundo); color: var(--sv-atr); font-weight: 600; }
  .recusa :global(svg) { flex: none; }
  .aviso-troca { background: #FFF8E1; border: 1px solid #F2D27A; color: var(--sv-texto); }
  :global(html[data-tema="escuro"]) .aviso-troca { background: #2A2410; border-color: #5C4A12; }
  .aviso-troca > :global(svg) { color: #7A5800; flex: none; }
  .aviso-troca p { flex: 1; min-width: 0; }
  .aviso-troca strong { color: var(--sv-titulo); }
  .texto { border: 0; background: transparent; color: var(--sv-link); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
  .linha-botao { height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: var(--sv-sup); color: var(--sv-titulo); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
  .cel .aviso-troca { flex-wrap: wrap; }
</style>
