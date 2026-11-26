<!-- Blocos de recibo: os blocos (rodada 17, "r17-blocos", opção 1). A procura pelo número do bloco ou de uma folha, as pílulas (todos, em uso,
     esperando, fechado), a lista em páginas de 40 e, à direita, o lote da gráfica (Geral e área) ou "Seus blocos" (a congregação). O número do bloco
     sai da primeira folha (70.051 → 1.401): ninguém digita. No celular: as abas, a procura e as pílulas no alto (a procura veio da r30, "o desenho
     mais novo vale", 26/11), a lista em linhas e "Próxima página". O botão do lote é dourado, como na r30. -->
<script lang="ts">
  import { pedir, qs } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import Icone from "../../../comum/Icone.svelte";
  import Chip from "../../../comum/Chip.svelte";
  import Aviso from "../../../comum/Aviso.svelte";
  import Estado from "../../../comum/Estado.svelte";
  import type { TomChip } from "../../../comum/tipos";
  import { escopo, nivelDaSessao } from "../../estado.svelte";
  import { plural, diaMes } from "../../blocos";
  import type { Bloco, FiltroBlocos, PaginaBlocos, SituacaoBloco } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";
  import Numeros from "../../partes/Numeros.svelte";
  import Paginas from "../../partes/Paginas.svelte";
  import Vazio from "../../partes/Vazio.svelte";
  import { vazioDaProcura, vazioDaSituacao, vazioDosBlocos, vazioSemBloco } from "../../vazios";
  import Cabecalho from "./Cabecalho.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const nivel = nivelDaSessao();
  // no celular o desenho mostra três pílulas (sem "Fechado"; "Todos" traz os fechados também)
  const FILTROS: readonly { readonly chave: FiltroBlocos; readonly rotulo: string }[] = [
    { chave: "todos", rotulo: "Todos" }, { chave: "em-uso", rotulo: "Em uso" }, { chave: "esperando", rotulo: "Esperando" }, { chave: "fechado", rotulo: "Fechado" }
  ];
  const filtrosDaTela = $derived(celular ? FILTROS.slice(0, 3) : FILTROS);

  let filtro = $state<FiltroBlocos>("todos");
  let procura = $state("");
  let procuraValendo = $state("");
  let pagina = $state(1);
  let dados = $state.raw<PaginaBlocos | null>(null);
  let erro = $state("");
  let carregando = $state(true);
  let avisoLote = $state(false);
  /** a pílula e a procura com que a página que está na tela foi lida (a lista vazia diz o porquê) */
  let lidoCom = $state<{ filtro: FiltroBlocos; procura: string }>({ filtro: "todos", procura: "" });

  // a procura espera a pessoa parar de digitar
  $effect(() => {
    const v = procura;
    const t = setTimeout(() => { if (v !== procuraValendo) { procuraValendo = v; pagina = 1; } }, 300);
    return () => clearTimeout(t);
  });

  let seq = 0;
  async function ler(f: FiltroBlocos, p: string, pg: number): Promise<void> {
    const meu = ++seq;
    carregando = true;
    const r = await pedir<PaginaBlocos>("/financeiro/blocos" + qs({ situacao: f === "todos" ? null : f, procura: p.trim() || null, pagina: pg > 1 ? pg : null }));
    if (meu !== seq) return;   // outra leitura (outra pílula, outra página) chegou antes
    carregando = false;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    erro = "";
    // a página passou do fim (a lista encolheu entre duas leituras): volta para a última que existe, que o efeito pede de novo
    if (pg > 1 && !r.dados.blocos.length && r.dados.total) { pagina = Math.ceil(r.dados.total / r.dados.porPagina); return; }
    dados = r.dados;
    lidoCom = { filtro: f, procura: p.trim() };
    escopo.tela = r.dados.escopo;
  }
  $effect(() => { void ler(filtro, procuraValendo, pagina); });

  // as listas vazias, no lugar da lista e das páginas. Da r30 ("r30-blocos-vazios"): a procura sem resultado e a Geral antes do primeiro lote, só
  // em "Todos" (com uma pílula, o bloco pode existir em outra situação). Sem desenho, os textos de 26/11 ("para conferir"): a pílula sem bloco
  // (com ou sem a procura) e a área ou a congregação sem bloco
  const vazio = $derived.by(() => {
    if (!dados || dados.total) return null;
    if (lidoCom.filtro !== "todos") return vazioDaSituacao(lidoCom.procura);
    if (lidoCom.procura) return vazioDaProcura(lidoCom.procura);
    return nivel === "geral" ? vazioDosBlocos(celular) : vazioSemBloco(nivel);
  });

  function escolherFiltro(f: FiltroBlocos) { filtro = f; pagina = 1; }
  function irPagina(n: number) { if (dados && n >= 1 && n <= paginas) pagina = n; }

  const paginas = $derived(dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1);
  const de = $derived(dados && dados.total ? (dados.pagina - 1) * dados.porPagina + 1 : 0);
  const ate = $derived(dados ? Math.min(dados.total, dados.pagina * dados.porPagina) : 0);

  const ROTULO: Record<SituacaoBloco, string> = { "na-geral": "Na Geral", esperando: "Esperando", "em-uso": "Em uso", fechado: "Fechado" };
  const TOM: Record<SituacaoBloco, TomChip> = { "na-geral": "neutro", esperando: "pendente", "em-uso": "ok", fechado: "ok" };
  function uso(b: Bloco): string {
    if (b.situacao === "em-uso") return `${plural(b.usadas, "usada", "usadas")} · ${plural(b.livres, "livre", "livres")}`;
    if (b.situacao === "esperando") return "entregue, não aberto";
    if (b.situacao === "fechado") return `devolvido ${diaMes(b.devolvidoEm)}`.trim();
    return b.chegouEm ? `chegou da gráfica ${diaMes(b.chegouEm)}` : "ainda na gráfica";
  }
  const ondeEsta = (b: Bloco) => b.congregacao?.nome ?? "Tesouraria Geral";
  const folhas = (b: Bloco) => `${numero(b.primeiraFolha)} a ${numero(b.ultimaFolha)}`;

  const textoPaginas = $derived.by(() => {
    if (!dados) return "";
    if (celular) return dados.total ? `${numero(de)} a ${numero(ate)} de ${numero(dados.total)}` : "nenhum bloco";
    if (dados.total > dados.porPagina) return `${numero(de)} a ${numero(ate)} de ${numero(dados.total)} blocos · ${dados.porPagina} por página`;
    return plural(dados.total, "bloco", "blocos");
  });

  const lote = $derived(dados?.resumo.tipo === "lote" ? dados.resumo.lote : null);
  const textoLote = $derived.by(() => {
    if (!lote) return "";
    const base = `Primeira folha ${numero(lote.primeiraFolha)} → o sistema numera os ${numero(lote.blocos)} blocos.`;
    if (lote.folhasFaltam <= 0) return `${base} Chegaram as ${numero(lote.folhas)} folhas.`;
    if (lote.folhasChegaram <= 0) return `${base} Ainda não chegou nenhuma folha; faltam ${numero(lote.folhas)}.`;
    return `${base} Chegaram ${numero(lote.folhasChegaram)} folhas (${plural(lote.blocosChegaram, "bloco", "blocos")}); faltam ${numero(lote.folhasFaltam)}.`;
  });
</script>

{#snippet pilulas()}
  <div class="pilulas" role="group" aria-label="Situação dos blocos">
    {#each filtrosDaTela as f (f.chave)}
      <button type="button" class:ativa={f.chave === filtro} aria-pressed={f.chave === filtro} onclick={() => escolherFiltro(f.chave)}>{f.rotulo}</button>
    {/each}
  </div>
{/snippet}

{#snippet lista()}
  {#if erro && !dados}
    <Estado tipo="erro" texto={erro} ontentar={() => void ler(filtro, procuraValendo, pagina)} />
  {:else if !dados}
    <Estado tipo="carregando" linhas={5} />
  {:else if vazio}
    <Vazio titulo={vazio.titulo} texto={vazio.texto} {celular} />
    {#if erro}<Estado tipo="erro" texto={erro} ontentar={() => void ler(filtro, procuraValendo, pagina)} />{/if}
  {:else if celular}
    {#if dados.blocos.length}
      <ul class="lista-cel" aria-busy={carregando}>
        {#each dados.blocos as b (b.id)}
          <li>
            <div class="txt">
              <strong>Bloco {numero(b.numero)} · {folhas(b)}</strong>
              <span>{ondeEsta(b)} · {uso(b)}</span>
            </div>
            <Chip tom={TOM[b.situacao]}>{ROTULO[b.situacao]}</Chip>
          </li>
        {/each}
      </ul>
    {:else}
      <Estado tipo="vazio" texto="Nenhum bloco com essa procura." />
    {/if}
    <div class="rodape-cel">
      <span>{textoPaginas}</span>
      {#if pagina < paginas}<button type="button" class="link" onclick={() => irPagina(pagina + 1)}>Próxima página ›</button>
      {:else if pagina > 1}<button type="button" class="link" onclick={() => irPagina(pagina - 1)}>‹ Página anterior</button>{/if}
    </div>
  {:else}
    <div class="tabela" role="table" aria-label="Blocos de recibo" aria-busy={carregando}>
      <div class="linha cab" role="row">
        <span role="columnheader">Bloco</span><span role="columnheader">Folhas</span><span role="columnheader">Congregação</span><span role="columnheader">Situação</span><span role="columnheader">Uso</span>
      </div>
      {#each dados.blocos as b (b.id)}
        <div class="linha" role="row">
          <span role="cell" class="num">{numero(b.numero)}</span>
          <span role="cell" class="folhas">{folhas(b)}</span>
          <span role="cell">{ondeEsta(b)}</span>
          <span role="cell"><Chip tom={TOM[b.situacao]}>{ROTULO[b.situacao]}</Chip></span>
          <span role="cell" title={uso(b)}>{uso(b)}</span>
        </div>
      {:else}
        <div class="vazio"><Estado tipo="vazio" texto="Nenhum bloco com essa procura." /></div>
      {/each}
    </div>
    {#if erro}<Estado tipo="erro" texto={erro} ontentar={() => void ler(filtro, procuraValendo, pagina)} />{/if}
    <Paginas texto={textoPaginas} {pagina} {paginas} onir={irPagina} />
  {/if}
{/snippet}

{#snippet lado()}
  {#if dados?.resumo.tipo === "seus"}
    <Aviso><strong>Toda folha precisa de destino:</strong> lançada, cancelada ou arrancada, lançada junto na planilha. Bloco novo: peça à Tesouraria Geral.</Aviso>
    <Quadro titulo="Seus blocos">
      <Numeros itens={[[dados.resumo.emUsoOuEsperando, "em uso / esperando"], [dados.resumo.folhasLivres, "folhas livres"]]} />
    </Quadro>
  {:else if dados}
    <Quadro titulo={`Lote da gráfica${lote ? ` (série ${lote.serie})` : ""}`}>
      {#if lote}
        <Numeros itens={[[lote.blocos, `blocos de ${lote.folhasPorBloco}`], [lote.folhas, "folhas"]]} />
        <p class="lote">{textoLote}</p>
      {:else}
        <p class="lote sem">Nenhum lote da gráfica cadastrado ainda.{nivel === "geral" ? " Use o botão “Cadastrar lote da gráfica”, no alto." : ""}</p>
      {/if}
    </Quadro>
    <Aviso><strong>Bloco só fica com a Tesouraria Geral ou com a congregação.</strong> A área é só intermediária.</Aviso>
  {/if}
{/snippet}

{#snippet acaoGeral()}
  {#if nivel === "geral"}
    <button type="button" class="ouro" aria-expanded={avisoLote} onclick={() => (avisoLote = !avisoLote)}><Icone nome="mais" tam={18} traco={2.2} />Cadastrar lote da gráfica</button>
  {/if}
{/snippet}

{#snippet recadoLote()}
  {#if avisoLote}
    <Aviso tom="alerta"><strong>O cadastro do lote da gráfica ainda vai ser construído.</strong></Aviso>
  {/if}
{/snippet}

{#snippet busca()}
  <label class="busca">
    <Icone nome="busca" tam={celular ? 16 : 18} traco={celular ? 2 : 1.8} />
    <span class="sv-escondido">Procurar pelo número do bloco ou de uma folha</span>
    <input type="search" inputmode="numeric" autocomplete="off" placeholder="Nº do bloco ou de uma folha" maxlength="12" bind:value={procura} />
  </label>
{/snippet}

{#if celular}
  <div class="pagina cel">
    <Cabecalho aba="blocos" {celular} />
    {@render busca()}
    {@render pilulas()}
    {@render lista()}
  </div>
{:else}
  <div class="pagina">
    <Cabecalho aba="blocos" {celular} acoes={acaoGeral} abaixo={recadoLote} />
    <div class="filtros">
      {@render busca()}
      {@render pilulas()}
    </div>
    <div class="dois">
      <div class="esq">{@render lista()}</div>
      <div class="dir">{@render lado()}</div>
    </div>
  </div>
{/if}

<style>
  .pagina { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina.cel { gap: 10px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* o botão do lote: o "m8Ouro" da r30 (40 px, dourado, o ícone de 18) */
  .ouro {
    height: 40px; padding: 0 16px; border-radius: 10px; border: 0; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .ouro:active { transform: scale(.97); }
  @media (hover: hover) { .ouro:hover { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }

  /* a procura e as pílulas */
  .filtros { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .busca {
    width: 276px; height: 40px; flex: none; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); display: flex; align-items: center; gap: 8px;
    padding: 0 12px; color: var(--sv-suave);
  }
  .busca:focus-within { border-color: var(--sv-mod); }
  .busca input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 14px; color: var(--sv-texto); outline: none; padding: 0; height: 100%; }
  .busca input::placeholder { color: var(--sv-suave); opacity: 1; }
  .cel .busca { width: auto; }   /* no celular, a largura inteira (r30) */
  .cel .busca input { font-size: 13.5px; }
  .pilulas { display: flex; gap: 8px; align-items: center; }
  .pilulas button {
    height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
    font-size: 13px; font-weight: 600; color: var(--sv-texto); white-space: nowrap; flex: none; transition: background-color .15s ease;
  }
  .pilulas button.ativa { background: var(--sv-escolha); border-color: var(--sv-escolha); color: var(--sv-escolha-texto); }

  /* as duas colunas: a lista e o quadro */
  .dois { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .esq { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .dir { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

  .tabela { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); overflow: hidden; }
  .linha {
    display: grid; grid-template-columns: 0.6fr 1.25fr 1.45fr 0.9fr 1.45fr; gap: 10px; padding: 0 16px; min-height: 44px; align-items: center;
    border-top: 1px solid var(--sv-linha); font-size: 13.5px; color: var(--sv-texto);
  }
  .linha > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .linha.cab { height: 38px; min-height: 38px; border-top: 0; font-size: 12.5px; font-weight: 700; color: var(--sv-suave); background: var(--sv-fundo); }
  .num { font-weight: 600; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
  /* "70.051 a 70.100" tem formato fixo e enche a coluna no notebook de 1280 px (no desenho cabe no limite; a Inter local mede 1 px a mais):
     sem corte, usa o vão de 10 px até a congregação */
  .linha > span.folhas { overflow: visible; text-overflow: clip; }
  .vazio { padding: 6px 16px; border-top: 1px solid var(--sv-linha); }

  .lote { font-size: 12.5px; color: var(--sv-texto); line-height: 1.35; }
  .lote.sem { font-size: 13px; line-height: 1.45; }   /* sem lote, a frase da r30 ("r30-blocos-vazios") */
  .dir :global(.aviso) { padding: 10px 12px; font-size: 13px; line-height: 1.4; }

  /* o celular: a lista em linhas */
  .lista-cel { list-style: none; margin: 0; padding: 0 12px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .lista-cel li { display: flex; align-items: center; gap: 10px; min-height: 52px; }
  .lista-cel li + li { border-top: 1px solid var(--sv-linha); }
  .lista-cel .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lista-cel strong { font-size: 14px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .lista-cel .txt span { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rodape-cel { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--sv-suave); min-height: 32px; }
  .link { border: 0; background: transparent; padding: 6px 0; font-size: 12.5px; font-weight: 700; color: var(--sv-link); }
</style>
