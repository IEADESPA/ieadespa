<!-- A planilha do mês (r24-lancamento, opção 1, a vista "Planilha"): cada folha do bloco é uma linha, na ordem do papel.
     - No alto, quando o mês começa nas folhas marcadas "mês posterior" no mês anterior, a faixa amarela "Dezembro começa na 70.161…".
     - A folha que veio marcada espera o nome e o valor (obrigatórios); a que somou no mês anterior vem com a tarja "referente ao mês
       anterior" (ninguém digita); a lançada e a marcada (cancelada, arrancada, inexistente, extraviada) se leem e se clicam (o histórico, o
       Corrigir e o desfazer ficam no quadro "A folha que você clicou", embaixo); as novas se digitam, até "a próxima folha (Enter)".
     - Sem "marcada em novembro" e sem o fundo azul (a resposta 5 de 26/11/2026): a coluna "Referente a" fica com "—". -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import type { LinhaPlanilha, PlanilhaMes } from "../../tipos";
  import { NOME_FORMA, NOME_MARCA, NOME_TIPO, asFolhas, folhaTxt, mesVizinho, nomeDoMes, NomeDoMes, reais, rascunhoNovo, type Rascunho } from "../../lancamentos";
  import LinhaRascunho from "./LinhaRascunho.svelte";

  interface Props {
    planilha: PlanilhaMes;
    rascunhos: Readonly<Record<number, Rascunho>>;
    /** as folhas novas que aparecem depois das linhas do servidor (a última, vazia, é "a próxima folha") */
    novas: readonly number[];
    lancavel: boolean;
    erroFolha: number | null;
    clicada: number | null;
    mesSeguinte: string;
    onmudar: (folha: number, como: Rascunho["como"], patch: Partial<Rascunho>) => void;
    onenter: (folha: number) => void;
    onclicar: (l: LinhaPlanilha) => void;
  }
  let { planilha, rascunhos, novas, lancavel, erroFolha, clicada, mesSeguinte, onmudar, onenter, onclicar }: Props = $props();

  const linhas = $derived(planilha.linhas ?? []);
  const marcadas = $derived(planilha.marcadasNoAnterior ?? []);
  const anterior = $derived(mesVizinho(planilha.mes, -1));
  const ultimaNova = $derived(novas.length ? novas[novas.length - 1] : null);
  const rasc = (folha: number, como: Rascunho["como"]): Rascunho => rascunhos[folha] ?? rascunhoNovo(folha, como);
</script>

{#snippet rascunho(folha: number, como: Rascunho["como"])}
  <LinhaRascunho r={rasc(folha, como)} {mesSeguinte} proxima={folha === ultimaNova} erro={erroFolha === folha} desligado={!lancavel}
    onmudar={(patch) => onmudar(folha, como, patch)} onenter={() => onenter(folha)} />
{/snippet}

{#snippet quem(l: LinhaPlanilha)}
  {#if l.membro}<span class="nome">{l.membro}</span>{#if l.membroId}<span class="num">nº {folhaTxt(l.membroId)}</span>{/if}
  {:else if l.nome}<span class="nome">{l.nome}</span><span class="digitado">nome digitado</span>
  {:else}<span class="nome sem">{l.tipo === "OFERTA_CULTO" ? "Oferta de culto (sem nome)" : "—"}</span>{/if}
{/snippet}

<div class="planilha" role="table" aria-label={`A planilha de ${nomeDoMes(planilha.mes)}`}>
  <div class="cab" role="row">
    <span role="columnheader">Folha</span><span role="columnheader">Quem deu · procura no cadastro de membros</span><span role="columnheader">Tipo</span>
    <span role="columnheader">Forma</span><span class="dir" role="columnheader">Valor</span><span role="columnheader">+ Voluntária</span><span role="columnheader">Referente a</span>
  </div>

  {#if marcadas.length}
    <div class="comeco" role="row">
      <Icone nome="livro" tam={15} traco={2.2} />
      <span><strong>{NomeDoMes(planilha.mes)} começa na {folhaTxt(marcadas[0] ?? 0)}, a 1ª folha marcada “mês posterior” em {nomeDoMes(anterior)}.</strong>
        {asFolhas(marcadas).replace(/^a /, "A ").replace(/^as /, "As ")}: nome e valor obrigatórios<span class="obrig">*</span></span>
    </div>
  {/if}

  {#each linhas as l (l.folha)}
    {#if (l.situacao === "preencher" || l.situacao === "pendente") && lancavel}
      {@render rascunho(l.folha, l.situacao === "preencher" ? "preencher" : "nova")}
    {:else if l.situacao === "anterior"}
      <div class="linha tarja ant" role="row">
        <span class="n" role="cell">{folhaTxt(l.folha)}</span>
        <span class="largo" role="cell">
          <span class="ref ant"><Icone nome="voltar" tam={12} traco={2.4} />referente ao mês anterior</span>
          <em>veio sozinha · nada a digitar · {l.mesSoma ? `somou em ${nomeDoMes(l.mesSoma)}` : "somou antes"}</em>
        </span>
        <span class="rel" role="cell">{#if l.mesSoma}<Icone nome="cadeado" tam={12} traco={2} />relatório de {nomeDoMes(l.mesSoma)}{:else}—{/if}</span>
      </div>
    {:else if l.situacao === "posterior" || l.situacao === "depois"}
      <!-- na planilha de um mês que passou: a folha marcada "mês posterior" (só a linha, sem nome e sem valor) e a lançada depois -->
      <div class="linha tarja pos" role="row">
        <span class="n" role="cell">{folhaTxt(l.folha)}</span>
        <span class="largo" role="cell">
          <span class="ref pos"><Icone nome="seta" tam={12} traco={2.4} />referente ao mês posterior</span>
          <em>{l.situacao === "posterior" ? "sem nome e sem valor · " : "lançada depois · "}soma em {nomeDoMes(l.mesSoma ?? mesSeguinte)}</em>
        </span>
        <span class="rel" role="cell">—</span>
      </div>
    {:else if l.situacao === "excecao"}
      <button type="button" class="linha lida" class:clicada={clicada === l.folha} class:erro={erroFolha === l.folha} data-folha={l.folha} onclick={() => onclicar(l)}>
        <span class="n">{folhaTxt(l.folha)}</span>
        <span class="quem"><span class="chip">{NOME_MARCA[l.destino ?? ""] ?? "Marcada"}</span>{#if l.observacao}<span class="motivo">motivo: {l.observacao}</span>{/if}</span>
        <span>—</span><span>—</span><span class="dir">—</span><span>—</span><span>—</span>
      </button>
    {:else if l.situacao === "lancada"}
      <button type="button" class="linha lida" class:clicada={clicada === l.folha} class:erro={erroFolha === l.folha} data-folha={l.folha} onclick={() => onclicar(l)}>
        <span class="n">{folhaTxt(l.folha)}</span>
        <span class="quem">{@render quem(l)}</span>
        <span class="corta">{l.tipo ? NOME_TIPO[l.tipo] : "—"}</span>
        <span>{l.forma ? NOME_FORMA[l.forma] : "—"}</span>
        <span class="dir valor">{reais(l.valor)}</span>
        <span>{#if l.voluntaria}<span class="vol">+ {reais(l.voluntaria)}</span>{:else}<span class="tra">—</span>{/if}</span>
        <span class="tra">—</span>
      </button>
    {:else}
      <!-- a folha que espera e não se digita aqui (a planilha só de consulta) -->
      <div class="linha" role="row">
        <span class="n" role="cell">{folhaTxt(l.folha)}</span>
        <span class="largo sem" role="cell">{l.situacao === "preencher" ? "veio marcada do mês anterior: falta o nome e o valor" : "sem destino ainda"}</span>
        <span class="rel" role="cell">—</span>
      </div>
    {/if}
  {/each}

  {#if lancavel}
    {#each novas as f (f)}{@render rascunho(f, "nova")}{/each}
  {:else if !linhas.length}
    <div class="linha" role="row"><span class="largo sem total" role="cell">Nada lançado em {nomeDoMes(planilha.mes)}.</span></div>
  {/if}
</div>

<style>
  .planilha {
    --cols-lanc: 70px minmax(0, 1.9fr) minmax(0, 1fr) minmax(0, .62fr) 84px 96px 168px;
    background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; overflow: hidden;
  }
  .cab { display: grid; grid-template-columns: var(--cols-lanc); gap: 10px; padding: 0 14px; min-height: 32px; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--sv-suave); background: var(--sv-fundo); line-height: 1.2; }
  .dir { text-align: right; justify-content: flex-end; }
  .comeco { display: flex; align-items: center; gap: 9px; padding: 0 14px; min-height: 30px; border-top: 1px solid var(--sv-linha); background: #FFF4D1; font-size: 12.5px; color: var(--sv-texto); }
  .comeco > :global(svg) { color: #8A5A00; flex: none; }
  .comeco > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .comeco strong { color: var(--sv-titulo); }
  :global(html[data-tema="escuro"]) .comeco { background: #3A2E0B; }
  :global(html[data-tema="escuro"]) .comeco > :global(svg) { color: #FCD34D; }
  .obrig { color: #B91C1C; font-weight: 800; }
  :global(html[data-tema="escuro"]) .obrig { color: #FCA5A5; }

  .linha {
    display: grid; grid-template-columns: var(--cols-lanc); gap: 10px; padding: 0 14px; min-height: 30px; align-items: center; border: 0;
    border-top: 1px solid var(--sv-linha); font: inherit; font-size: 13.5px; color: var(--sv-texto); text-align: left; width: 100%; background: transparent;
  }
  button.linha { cursor: pointer; }
  button.linha:hover { background: var(--sv-fundo); }
  button.linha:focus-visible { outline: 2px solid var(--fin-forte); outline-offset: -2px; }
  .linha.clicada { box-shadow: inset 3px 0 0 var(--fin-forte); background: var(--sv-mod-fundo); }
  .linha.erro { background: var(--sv-atr-fundo); box-shadow: inset 3px 0 0 var(--sv-atr); }
  .n { color: var(--sv-suave); font-variant-numeric: tabular-nums; }
  .quem { display: flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; overflow: hidden; }
  .nome { font-weight: 600; color: var(--sv-titulo); overflow: hidden; text-overflow: ellipsis; }
  .nome.sem { font-weight: 500; color: var(--sv-texto); }
  .num { font-size: 11.5px; color: var(--sv-suave); flex: none; }
  .digitado { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 8px; border: 1px dashed var(--sv-campo-borda); color: var(--sv-suave); flex: none; }
  .corta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .valor { font-weight: 600; font-variant-numeric: tabular-nums; }
  .vol { font-weight: 700; color: #166534; font-variant-numeric: tabular-nums; }
  :global(html[data-tema="escuro"]) .vol { color: #86EFAC; }
  .tra { color: var(--sv-suave); }
  .chip { display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 12px; background: var(--sv-pend-fundo); color: var(--sv-pend); flex: none; }
  .motivo { font-size: 12.5px; color: var(--sv-texto); overflow: hidden; text-overflow: ellipsis; }
  /* as tarjas: o mês anterior (roxo) e o mês posterior (azul), como o mural */
  .tarja.ant { background: #FAF7FF; }
  .tarja.pos { background: #F5F8FF; }
  :global(html[data-tema="escuro"]) .tarja.ant { background: #1E1638; }
  :global(html[data-tema="escuro"]) .tarja.pos { background: #0F2340; }
  .largo { grid-column: 2 / 7; display: flex; align-items: center; gap: 10px; min-width: 0; }
  .largo em { font-size: 12.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .largo.sem { font-size: 12.5px; color: var(--sv-suave); font-style: italic; }
  .largo.total { grid-column: 1 / -1; }
  .ref { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 12px; font-weight: 700; white-space: nowrap; flex: none; }
  .ref.ant { background: #EFE7FD; color: #6D28D9; }
  .ref.pos { background: #E3ECFD; color: #1D4ED8; }
  :global(html[data-tema="escuro"]) .ref.ant { background: #2A1D4A; color: #C4B5FD; }
  :global(html[data-tema="escuro"]) .ref.pos { background: #13294A; color: #93C5FD; }
  .rel { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--sv-suave); white-space: nowrap; }
</style>
