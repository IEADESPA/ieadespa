<!-- Blocos de recibo: o livro de entrada e saída (rodada 17, "r17-blocos-livro", opção 1; a saída, a devolução e o celular da rodada 30,
     "r30-blocos-saida" e "r30-blocos-devolver"). A Tesouraria Geral tem os botões "Registrar entrada" e "Registrar saída" (o do formulário aberto
     é o dourado); a entrada (a devolução, completa ou parcial) está em FormEntrada.svelte e a saída em FormSaida.svelte. À direita, o livro em
     páginas (5 no notebook, 3 no celular). A área e a congregação veem o aviso, os blocos delas agora e o livro das suas congregações. No celular a
     Geral vê os dois botões e o livro; o formulário abre ao tocar, no lugar deles, com o X; depois de registrar, fecha e o livro volta. -->
<script lang="ts">
  import { pedir, qs } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import Aviso from "../../../comum/Aviso.svelte";
  import Estado from "../../../comum/Estado.svelte";
  import { escopo, nav, nivelDaSessao } from "../../estado.svelte";
  import { confirmacaoNoCelular, diaMes, linhaDoLivro } from "../../blocos";
  import type { PaginaLivro } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";
  import Numeros from "../../partes/Numeros.svelte";
  import Paginas from "../../partes/Paginas.svelte";
  import Vazio from "../../partes/Vazio.svelte";
  import { vazioDoLivro } from "../../vazios";
  import Cabecalho from "./Cabecalho.svelte";
  import FormEntrada from "./FormEntrada.svelte";
  import FormSaida from "./FormSaida.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const nivel = nivelDaSessao();

  // ---- o livro ----
  let pagina = $state(1);
  let dados = $state.raw<PaginaLivro | null>(null);
  let erro = $state("");
  let carregando = $state(true);
  const porPagina = $derived(celular ? 3 : 5);

  let seq = 0;
  async function ler(pg: number, pp: number): Promise<void> {
    const meu = ++seq;
    carregando = true;
    const r = await pedir<PaginaLivro>("/financeiro/blocos/livro" + qs({ pagina: pg > 1 ? pg : null, porPagina: pp }));
    if (meu !== seq) return;   // outra página foi pedida antes desta resposta chegar
    carregando = false;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    erro = "";
    dados = r.dados;
    escopo.tela = r.dados.escopo;
  }
  $effect(() => { void ler(pagina, porPagina); });

  const paginas = $derived(dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1);
  const textoPaginas = $derived.by(() => {
    if (!dados || !dados.total) return "nenhum registro";
    const de = (dados.pagina - 1) * dados.porPagina + 1, ate = Math.min(dados.total, dados.pagina * dados.porPagina);
    return `${numero(de)} a ${numero(ate)} de ${numero(dados.total)} ${dados.total === 1 ? "registro" : "registros"}`;
  });

  // ---- os botões da Geral: no notebook um formulário fica sempre aberto (a entrada, de começo); no celular, nenhum até tocar, e o formulário
  // fica no lugar dos botões e do livro. Da aba Folhas (o bloco que voltou em parte), a saída já abre com a primeira folha livre ----
  type Form = "entrada" | "saida";
  const inicialSaida = nivel === "geral" && nav.rota.tela === "blocos" && nav.rota.saida ? nav.rota.saida : undefined;
  let noNotebook = $state<Form>(inicialSaida ? "saida" : "entrada");
  let noCelular = $state<Form | null>(inicialSaida ? "saida" : null);
  /** o botão dourado: o do formulário aberto (no celular, o do último aberto) */
  let dourado = $state<Form>(inicialSaida ? "saida" : "entrada");
  const mostrar = $derived(celular ? noCelular : noNotebook);
  function abrir(qual: Form) {
    if (celular) noCelular = qual; else noNotebook = qual;
    dourado = qual;
  }
  /** gravou (a saída ou a entrada): a confirmação (no celular, a da parcial mais curta), o formulário do celular fecha e o livro volta à 1ª página */
  async function feito(mensagem: string) {
    ponte().avisar(celular ? confirmacaoNoCelular(mensagem) : mensagem, "sucesso");
    noCelular = null;
    if (pagina === 1) await ler(1, porPagina); else pagina = 1;
  }
</script>

{#snippet botoes()}
  <div class="botoes">
    <button type="button" class={dourado === "entrada" ? "ouro" : "linha-botao"} aria-pressed={mostrar === "entrada"} onclick={() => abrir("entrada")}><Icone nome="voltar" tam={dourado === "entrada" ? 18 : 17} traco={dourado === "entrada" ? 2.2 : 2} />Registrar entrada</button>
    <button type="button" class={dourado === "saida" ? "ouro" : "linha-botao"} aria-pressed={mostrar === "saida"} onclick={() => abrir("saida")}><Icone nome="seta" tam={dourado === "saida" ? 18 : 17} traco={dourado === "saida" ? 2.2 : 2} />Registrar saída</button>
  </div>
{/snippet}

{#snippet saida()}
  <FormSaida {celular} inicial={inicialSaida} onfeito={(m) => void feito(m)} onfechar={() => (noCelular = null)} />
{/snippet}

{#snippet entrada()}
  <FormEntrada {celular} onfeito={(m) => void feito(m)} onfechar={() => (noCelular = null)} />
{/snippet}

{#snippet livro()}
  <Quadro titulo="O livro" nota="entradas, saídas e cadastros" {celular}>
    {#if erro && !dados}
      <Estado tipo="erro" texto={erro} ontentar={() => void ler(pagina, porPagina)} />
    {:else if !dados}
      <Estado tipo="carregando" linhas={porPagina} />
    {:else}
      {#if dados.registros.length}
        <ul class="registros" aria-busy={carregando}>
          {#each dados.registros as r (r.id)}
            {@const l = linhaDoLivro(r, nivel)}
            <li><span class="dia">{diaMes(r.data)}</span><div class="txt"><strong>{l.titulo}</strong><span>{l.detalhe}</span></div></li>
          {/each}
        </ul>
      {:else}
        <!-- o livro vazio (r30-blocos-vazios): o texto de cada nível, sem as páginas -->
        {@const v = vazioDoLivro(nivel, dados.escopo)}
        <Vazio dentro {celular} titulo={v.titulo} texto={v.texto} />
      {/if}
      {#if erro}<Estado tipo="erro" texto={erro} ontentar={() => void ler(pagina, porPagina)} />{/if}
      {#if dados.total}<Paginas texto={textoPaginas} {pagina} {paginas} quantos={celular ? 3 : 5} onir={(n) => (pagina = n)} />{/if}
    {/if}
  </Quadro>
{/snippet}

{#snippet aviso()}
  {#if nivel === "area"}
    <Aviso><strong>Entrada e saída de blocos quem registra é a Tesouraria Geral.</strong> A área é só intermediária: o bloco nunca fica com a área.</Aviso>
  {:else}
    <Aviso><strong>Entrada e saída de blocos quem registra é a Tesouraria Geral.</strong> Para pedir um bloco novo, fale com a Tesouraria Geral; a entrega fica registrada aqui.</Aviso>
  {/if}
{/snippet}

{#snippet agora()}
  {@render aviso()}
  {#if nivel === "area"}
    <Quadro titulo="Blocos da área agora">
      <Numeros itens={[[dados?.agora?.emUso ?? 0, "em uso"], [dados?.agora?.esperando ?? 0, "esperando"], [dados?.agora?.aDevolver ?? 0, "a devolver"]]} />
    </Quadro>
  {:else}
    <Quadro titulo="Seus blocos agora">
      <!-- o bloco com todas as folhas usadas ainda está com a congregação: conta como em uso, como na aba "Blocos" -->
      <Numeros itens={[[(dados?.agora?.emUso ?? 0) + (dados?.agora?.aDevolver ?? 0), "em uso"], [dados?.agora?.esperando ?? 0, "esperando"]]} />
    </Quadro>
  {/if}
{/snippet}

<div class="pagina" class:cel={celular}>
  <Cabecalho aba="livro" {celular} />
  {#if celular}
    {#if nivel !== "geral"}
      {@render aviso()}
      {@render livro()}
    {:else if mostrar === "entrada"}
      {@render entrada()}
    {:else if mostrar === "saida"}
      {@render saida()}
    {:else}
      {@render botoes()}
      {@render livro()}
    {/if}
  {:else}
    <div class="dois">
      <div class="col">
        {#if nivel === "geral"}
          {@render botoes()}
          {#if mostrar === "entrada"}{@render entrada()}{:else if mostrar === "saida"}{@render saida()}{/if}
        {:else}
          {@render agora()}
        {/if}
      </div>
      <div class="col">{@render livro()}</div>
    </div>
  {/if}
</div>

<style>
  .pagina { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina.cel { gap: 10px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .dois { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 14px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina :global(.aviso) { padding: 10px 12px; font-size: 13px; line-height: 1.45; }

  /* os botões: a entrada dourada (40 px) e a saída de linha (o desenho não usa box-sizing: 40 + a borda = 42) */
  .botoes { display: flex; gap: 10px; }
  .cel .botoes { flex-direction: column; }
  .ouro {
    height: 40px; padding: 0 16px; border-radius: 10px; border: 0; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .ouro:active:not(:disabled) { transform: scale(.97); }
  .ouro:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) { .ouro:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }
  .linha-botao {
    height: 42px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: transparent; color: var(--sv-titulo); display: inline-flex;
    align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; transition: background-color .15s ease;
  }
  .linha-botao :global(svg) { color: var(--sv-icone); }
  @media (hover: hover) { .linha-botao:hover { background: var(--sv-linha); } }
  .linha-botao[aria-pressed="true"] { border-color: var(--sv-mod); }

  /* o livro: a data à esquerda, o que aconteceu e quem registrou */
  .registros { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }   /* o vão do quadro do desenho entre as linhas */
  .registros li { display: flex; gap: 10px; padding: 6px 0; }
  .registros li + li { border-top: 1px solid var(--sv-linha); }
  .dia { width: 42px; flex: none; font-size: 12px; color: var(--sv-suave); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .txt strong { font-size: 13px; font-weight: 600; color: var(--sv-titulo); }
  .txt span { font-size: 11.5px; color: var(--sv-suave); }
</style>
