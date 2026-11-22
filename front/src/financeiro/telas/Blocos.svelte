<!-- Blocos de recibo: os blocos (rodada 17, "r17-blocos", opção 1). As abas "Folhas do bloco" e "Livro de entrada e saída" vêm no próximo incremento.
     A procura pelo número do bloco ou de uma folha, as pílulas (todos, em uso, esperando, fechado), a lista em páginas de 40 e, à direita, o lote da
     gráfica (Geral e área) ou "Seus blocos" (a congregação). O número do bloco sai da primeira folha (70.051 → 1.401): ninguém digita.
     No celular: as abas e as pílulas no alto, a lista em linhas e "Próxima página". -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { dataBr, numero } from "../../comum/formato";
  import Icone from "../../comum/Icone.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import EmConstrucao from "../../comum/EmConstrucao.svelte";
  import type { TomChip } from "../../comum/tipos";
  import { ir, escopo, nivelDaSessao, type AbaBlocos } from "../estado.svelte";
  import type { Bloco, FiltroBlocos, PaginaBlocos, SituacaoBloco } from "../tipos";

  interface Props { aba: AbaBlocos; celular: boolean }
  let { aba, celular }: Props = $props();

  const nivel = nivelDaSessao();
  const ABAS: readonly { readonly chave: AbaBlocos; readonly rotulo: string }[] = [
    { chave: "blocos", rotulo: "Blocos" }, { chave: "folhas", rotulo: "Folhas do bloco" }, { chave: "livro", rotulo: "Livro de entrada e saída" }
  ];
  // no celular o desenho mostra três pílulas (sem "Fechado"; "Todos" traz os fechados também)
  const FILTROS: readonly { readonly chave: FiltroBlocos; readonly rotulo: string }[] = [
    { chave: "todos", rotulo: "Todos" }, { chave: "em-uso", rotulo: "Em uso" }, { chave: "esperando", rotulo: "Esperando" }, { chave: "fechado", rotulo: "Fechado" }
  ];
  const filtrosDaTela = $derived(celular ? FILTROS.slice(0, 3) : FILTROS);

  let filtro = $state<FiltroBlocos>("todos");
  let procura = $state("");
  let procuraValendo = $state("");
  let pagina = $state(1);
  let dados = $state<PaginaBlocos | null>(null);
  let erro = $state("");
  let carregando = $state(true);
  let avisoLote = $state(false);

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
    dados = r.dados;
    escopo.tela = r.dados.escopo;
  }
  $effect(() => { if (aba === "blocos") void ler(filtro, procuraValendo, pagina); });

  function escolherFiltro(f: FiltroBlocos) { filtro = f; pagina = 1; }
  function irPagina(n: number) { if (dados && n >= 1 && n <= paginas) pagina = n; }

  const paginas = $derived(dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1);
  const de = $derived(dados && dados.total ? (dados.pagina - 1) * dados.porPagina + 1 : 0);
  const ate = $derived(dados ? Math.min(dados.total, dados.pagina * dados.porPagina) : 0);
  // até 5 números de página em volta da atual
  const numerosPagina = $derived.by(() => {
    const ini = Math.max(1, Math.min(pagina - 2, paginas - 4));
    return Array.from({ length: Math.min(5, paginas) }, (_, i) => ini + i);
  });

  const e = $derived(escopo.tela);
  const subtitulo = $derived.by(() => {
    if (!e) return "os blocos";
    if (e.geral) return `Sede administrativa · as ${e.congregacoes} congregações · os blocos`;
    if (e.congregacao) return `Congregação ${e.congregacao} · os blocos`;
    const n = `${e.congregacoes} ${e.congregacoes === 1 ? "congregação" : "congregações"}`;
    return `${e.area ? e.area + " · " : ""}${n} · os blocos`;
  });
  const rotuloNivel = $derived(!e ? "" : e.geral ? "Sede administrativa" : e.congregacao ?? e.area ?? `${e.congregacoes} congregações`);

  const ROTULO: Record<SituacaoBloco, string> = { "na-geral": "Na Geral", esperando: "Esperando", "em-uso": "Em uso", fechado: "Fechado" };
  const TOM: Record<SituacaoBloco, TomChip> = { "na-geral": "neutro", esperando: "pendente", "em-uso": "ok", fechado: "ok" };
  const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;
  const diaMes = (iso: string | null) => dataBr(iso).slice(0, 5);
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

{#snippet abas()}
  {#if celular}
    <nav class="abas-cel" aria-label="Partes dos blocos de recibo">
      {#each ABAS as a (a.chave)}
        <button type="button" class:ativa={a.chave === aba} aria-current={a.chave === aba ? "page" : undefined} onclick={() => ir({ tela: "blocos", aba: a.chave })}>{a.rotulo}</button>
      {/each}
    </nav>
  {:else}
    <nav class="abas" aria-label="Partes dos blocos de recibo">
      {#each ABAS as a (a.chave)}
        <button type="button" class:ativa={a.chave === aba} aria-current={a.chave === aba ? "page" : undefined} onclick={() => ir({ tela: "blocos", aba: a.chave })}>{a.rotulo}</button>
      {/each}
    </nav>
  {/if}
{/snippet}

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
    <div class="rodape">
      <span>{textoPaginas}</span>
      <nav class="paginas" aria-label="Páginas">
        <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onclick={() => irPagina(pagina - 1)}>‹</button>
        {#each numerosPagina as n (n)}
          <button type="button" class:atual={n === pagina} aria-current={n === pagina ? "page" : undefined} onclick={() => irPagina(n)}>{n}</button>
        {/each}
        <button type="button" aria-label="Próxima página" disabled={pagina >= paginas} onclick={() => irPagina(pagina + 1)}>›</button>
      </nav>
    </div>
  {/if}
{/snippet}

{#snippet numeros(itens: readonly (readonly [number, string])[])}
  <div class="numeros">
    {#each itens as [n, rot] (rot)}<div class="numero"><span>{rot}</span><strong>{numero(n)}</strong></div>{/each}
  </div>
{/snippet}

{#snippet lado()}
  {#if dados?.resumo.tipo === "seus"}
    <Aviso><strong>Toda folha precisa de destino:</strong> lançada, cancelada ou arrancada, lançada junto na planilha. Bloco novo: peça à Tesouraria Geral.</Aviso>
    <section class="quadro">
      <h2>Seus blocos</h2>
      {@render numeros([[dados.resumo.emUsoOuEsperando, "em uso / esperando"], [dados.resumo.folhasLivres, "folhas livres"]])}
    </section>
  {:else if dados}
    <section class="quadro">
      <h2>Lote da gráfica{lote ? ` (série ${lote.serie})` : ""}</h2>
      {#if lote}
        {@render numeros([[lote.blocos, `blocos de ${lote.folhasPorBloco}`], [lote.folhas, "folhas"]])}
        <p>{textoLote}</p>
      {:else}
        <p>Nenhum lote da gráfica cadastrado ainda.</p>
      {/if}
    </section>
    <Aviso><strong>Bloco só fica com a Tesouraria Geral ou com a congregação.</strong> A área é só intermediária.</Aviso>
  {/if}
{/snippet}

{#if celular}
  <div class="pagina cel">
    {@render abas()}
    {#if aba === "blocos"}
      {@render pilulas()}
      {@render lista()}
    {:else}
      <EmConstrucao titulo={aba === "folhas" ? "Folhas do bloco" : "Livro de entrada e saída"} texto="Esta parte dos blocos de recibo vem no próximo incremento." />
    {/if}
  </div>
{:else}
  <div class="pagina">
    <header class="cab-pag">
      <div class="textos">
        <h1>Blocos de recibo</h1>
        <p>{subtitulo}</p>
      </div>
      <div class="acoes">
        {#if rotuloNivel}
          <span class="nivel" class:local={nivel === "local"}><Icone nome={nivel === "local" ? "cadeado" : "mapa"} tam={nivel === "local" ? 15 : 17} traco={2} />{rotuloNivel}</span>
        {/if}
        {#if nivel === "geral"}
          <button type="button" class="forte" aria-expanded={avisoLote} onclick={() => (avisoLote = !avisoLote)}><Icone nome="mais" tam={16} traco={2.2} />Cadastrar lote da gráfica</button>
        {/if}
      </div>
    </header>
    {#if avisoLote}
      <Aviso tom="alerta"><strong>O cadastro do lote da gráfica vem no próximo incremento,</strong> junto com as folhas do bloco e o livro de entrada e saída.</Aviso>
    {/if}
    {@render abas()}
    {#if aba === "blocos"}
      <div class="filtros">
        <label class="busca">
          <Icone nome="busca" tam={18} traco={1.8} />
          <span class="sv-escondido">Procurar pelo número do bloco ou de uma folha</span>
          <input type="search" inputmode="numeric" autocomplete="off" placeholder="Nº do bloco ou de uma folha" maxlength="12" bind:value={procura} />
        </label>
        {@render pilulas()}
      </div>
      <div class="dois">
        <div class="esq">{@render lista()}</div>
        <div class="dir">{@render lado()}</div>
      </div>
    {:else}
      <EmConstrucao titulo={aba === "folhas" ? "Folhas do bloco" : "Livro de entrada e saída"} texto="Esta parte dos blocos de recibo vem no próximo incremento." />
    {/if}
  </div>
{/if}

<style>
  .pagina { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina.cel { gap: 10px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* o título (22 px) e, à direita, o nível e a ação da Geral */
  .cab-pag { display: flex; align-items: center; gap: 16px; }
  .textos { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  h1 { font-size: 22px; font-weight: 700; color: var(--sv-titulo); line-height: 1.25; }
  .textos p { font-size: 14.5px; color: var(--sv-suave); }
  .acoes { display: flex; gap: 10px; align-items: center; flex: none; }
  .nivel {
    height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; flex: none;
  }
  .nivel :global(svg) { color: var(--sv-icone); }
  .nivel.local { height: 36px; gap: 7px; font-size: 13.5px; border-color: var(--sv-borda); background: transparent; }
  .nivel.local :global(svg) { color: var(--sv-suave); }
  .forte {
    height: 36px; padding: 0 14px; border-radius: 9px; border: 0; background: var(--fin-forte); color: var(--fin-forte-texto); display: inline-flex; align-items: center; gap: 7px;
    font-size: 13.5px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .forte:active { transform: scale(.97); }
  @media (hover: hover) { .forte:hover { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }

  /* as abas (o traço dourado embaixo da escolhida) */
  .abas { display: flex; gap: 24px; border-bottom: 1px solid var(--sv-borda); }
  .abas button { border: 0; background: transparent; padding: 0 2px 10px; font-size: 14.5px; font-weight: 500; color: var(--sv-suave); white-space: nowrap; }
  .abas button.ativa { font-weight: 700; color: var(--sv-titulo); box-shadow: inset 0 -3px 0 #FFB800; }
  .abas-cel { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-right: -14px; padding-right: 14px; flex: none; }
  .abas-cel::-webkit-scrollbar { display: none; }
  .abas-cel button {
    flex: none; height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
    font-size: 12.5px; font-weight: 600; color: var(--sv-texto); white-space: nowrap;
  }
  .abas-cel button.ativa { background: var(--fin-forte); border-color: var(--fin-forte); color: var(--fin-forte-texto); font-weight: 700; }

  /* a procura e as pílulas */
  .filtros { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .busca {
    width: 276px; height: 40px; flex: none; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); display: flex; align-items: center; gap: 8px;
    padding: 0 12px; color: var(--sv-suave);
  }
  .busca:focus-within { border-color: var(--sv-mod); }
  .busca input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 14px; color: var(--sv-texto); outline: none; padding: 0; height: 100%; }
  .busca input::placeholder { color: var(--sv-suave); opacity: 1; }
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
  .rodape { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12.5px; color: var(--sv-suave); }
  .rodape > span { white-space: nowrap; }
  .paginas { display: flex; gap: 5px; }
  .paginas button {
    min-width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--sv-borda); background: transparent; color: var(--sv-texto); font-size: 12.5px;
    display: flex; align-items: center; justify-content: center; padding: 0 4px;
  }
  .paginas button.atual { background: var(--fin-forte); border-color: var(--fin-forte); color: var(--fin-forte-texto); font-weight: 700; }
  .paginas button:disabled { cursor: default; opacity: .7; }

  /* o quadro da direita */
  .quadro { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .quadro h2 { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .quadro p { font-size: 12.5px; color: var(--sv-texto); line-height: 1.35; }
  .numeros { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .numero { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 1px; }
  .numero span { font-size: 12px; color: var(--sv-suave); }
  .numero strong { font-size: 18px; font-weight: 800; color: var(--sv-titulo); font-variant-numeric: tabular-nums; }
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
