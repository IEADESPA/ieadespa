<!-- Passo 2 da importação (r27): os números, antes de gravar nada. Os quadros (cada pessoa conta numa caixa só), o aviso do arrolamento, a
     matrícula a acertar (quem veio primeiro na planilha fica com o número; o outro recebe a próxima do sistema), as possíveis repetidas e o
     "Confirmar: uma vez só". No celular, como no desenho: os quadros, o aviso e o confirmar. -->
<script lang="ts">
  import Botao from "../../comum/Botao.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { numero, plural } from "../../comum/formato";
  import Quadros from "./Quadros.svelte";
  import Arrolamento from "./Arrolamento.svelte";
  import { baixarLista, lerLista, porQue, repetidaDe, type FiltroLista, type ItemLista, type Previa, type Quadro } from "./importar";

  interface Props {
    celular: boolean;
    previa: Previa;
    /** a importação gravando (os lotes): o texto do andamento */
    andamento: string;
    ocupado: boolean;
    erro: string;
    onconfirmar: () => void;
  }
  let { celular, previa, andamento, ocupado, erro, onconfirmar }: Props = $props();

  const r = $derived(previa.resumo);
  const quadros = $derived<Quadro[]>([
    { n: r.total, rotulo: "Pessoas no arquivo", sub: r.vazias ? `${numero(r.vazias)} ${plural(r.vazias, "linha vazia de fora", "linhas vazias de fora")}` : "nenhuma linha vazia" },
    { n: r.quadros.comMatricula, rotulo: "Fichas novas", sub: "a matrícula de antes" },
    { n: r.quadros.acertar, rotulo: "Matrícula a acertar", sub: "recebem a próxima" },
    { n: r.quadros.repetidas, rotulo: "Possíveis repetidas", sub: "para “Fichas repetidas”" },
    { n: r.semCongregacao, rotulo: "Sem congregação", sub: "“IEADESPA - GERAL”" }
  ]);

  // as listas da prévia (sem CPF nem contato), lidas aos poucos: 100 por página
  interface Carga { itens: ItemLista[]; total: number; pagina: number; carregando: boolean; erro: string; aberta: boolean }
  const nova = (): Carga => ({ itens: [], total: 0, pagina: 0, carregando: false, erro: "", aberta: false });
  const listas = $state<Record<FiltroLista, Carga>>({ acertar: nova(), repetidas: nova(), problemas: nova() });
  async function carregar(f: FiltroLista) {
    const c = listas[f];
    if (c.carregando) return;
    c.carregando = true;
    c.erro = "";
    const res = await lerLista(previa.importacaoId, f, c.pagina + 1);
    c.carregando = false;
    if (!res.ok) { c.erro = res.mensagem || "Não deu para ler a lista agora."; return; }
    c.itens = [...c.itens, ...res.dados.itens];
    c.total = res.dados.total;
    c.pagina = res.dados.pagina;
  }
  function abrir(f: FiltroLista) {
    const c = listas[f];
    c.aberta = !c.aberta;
    if (c.aberta && !c.pagina) void carregar(f);
  }
  // a tabela da matrícula a acertar já abre com as 4 primeiras (como no desenho)
  $effect(() => { if (!celular && r.quadros.acertar > 0 && !listas.acertar.pagina && !listas.acertar.carregando) void carregar("acertar"); });
  const acertarVisiveis = $derived(listas.acertar.aberta ? listas.acertar.itens : listas.acertar.itens.slice(0, 4));

  let baixando = $state(false);
  let erroBaixar = $state("");
  async function baixar() {
    if (baixando) return;
    baixando = true;
    erroBaixar = await baixarLista(previa.importacaoId);
    baixando = false;
  }

  let conferi = $state(false);
</script>

{#snippet confirmar()}
  <section class="cartao" class:justo={celular}>
    <div class="topo"><h2>Confirmar: uma vez só</h2></div>
    <label class="marcar">
      <input type="checkbox" bind:checked={conferi} disabled={ocupado} />
      <span>{celular ? "Conferi os números. É uma vez só: o que mudar depois se corrige à mão, na ficha." : "Conferi os números. Sei que a importação é uma vez só: depois de confirmar, não se importa de novo, e o que mudar se corrige à mão, na ficha."}</span>
    </label>
    <Botao tipo="ouro" icone="check" largo desligado={!conferi || r.novas === 0} {ocupado} onclick={onconfirmar}>Confirmar e trazer as {numero(r.novas)} {plural(r.novas, "ficha", "fichas")}</Botao>
    {#if andamento}<p class="andamento" role="status">{andamento}</p>{/if}
    {#if erro}<Aviso tom="erro">{erro}</Aviso>{/if}
  </section>
{/snippet}

{#snippet fora()}
  {#if r.problemas > 0}
    <Aviso tom="alerta">
      <strong>{numero(r.problemas)} {plural(r.problemas, "linha fica de fora.", "linhas ficam de fora.")}</strong>
      {#if r.jaExistem > 0}{" "}{r.jaExistem === 1 ? "Uma tem a matrícula" : `${numero(r.jaExistem)} têm a matrícula`} de uma ficha que já está no sistema: essa ficha se completa à mão.{/if}
      {" "}O motivo de cada uma está na lista para baixar, sem CPF.
      {#snippet acao()}<Botao tipo="texto" tam="pequeno" ocupado={baixando} onclick={baixar}>Baixar a lista</Botao>{/snippet}
    </Aviso>
  {/if}
  {#each r.avisosGerais as a (a.codigo)}<Aviso tom="alerta">{a.texto}</Aviso>{/each}
  {#if erroBaixar}<Aviso tom="erro">{erroBaixar}</Aviso>{/if}
{/snippet}

<Quadros {quadros} sel={2} {celular} />
<Arrolamento {celular} forte="Todos entram com a pendência “completar o arrolamento” e sem voto até completar." />
{@render fora()}

{#if celular}
  {@render confirmar()}
{:else}
  <div class="dois">
    <section class="cartao sem-pad">
      <div class="topo-tab">
        <h2>Matrícula a acertar ({numero(r.quadros.acertar)})</h2>
        <span>quem veio primeiro na planilha fica com o número; o outro recebe a próxima do sistema (a maior + 1)</span>
      </div>
      {#if r.quadros.acertar === 0}
        <p class="nenhuma">Nenhuma: todas as matrículas do arquivo servem.</p>
      {:else if listas.acertar.erro && !listas.acertar.itens.length}
        <div class="pad"><Estado tipo="erro" texto={listas.acertar.erro} ontentar={() => carregar("acertar")} /></div>
      {:else if !listas.acertar.itens.length}
        <div class="pad"><Estado tipo="carregando" linhas={4} /></div>
      {:else}
        <div class="tab" role="table" aria-label="Matrícula a acertar">
          <div class="cab" role="row"><span role="columnheader">Pessoa</span><span role="columnheader">Por quê</span><span role="columnheader">Recebe</span></div>
          {#each acertarVisiveis as i (i.linha)}
            <div class="lin" role="row">
              <span class="pessoa" role="cell"><strong>{i.nome}</strong><small>linha {numero(i.linha)}</small></span>
              <span class="porque" role="cell">{porQue(i)}</span>
              <span role="cell"><strong class="recebe sv-num" title={i.detalhe.prevista ? "o número previsto: a próxima matrícula do sistema na hora de gravar" : undefined}>{i.detalhe.recebe ? `nº ${numero(i.detalhe.recebe)}` : "—"}</strong></span>
            </div>
          {/each}
        </div>
      {/if}
      {#if r.quadros.acertar > 0}
        <div class="rodape">
          {#if listas.acertar.aberta && listas.acertar.itens.length < listas.acertar.total}
            <Botao tipo="texto" tam="pequeno" ocupado={listas.acertar.carregando} onclick={() => carregar("acertar")}>Mostrar mais</Botao>
          {:else if r.quadros.acertar > 4}
            <button type="button" class="link suave" aria-expanded={listas.acertar.aberta} onclick={() => (listas.acertar.aberta = !listas.acertar.aberta)}>{listas.acertar.aberta ? "Mostrar só as 4 primeiras" : `+ ${numero(r.quadros.acertar - 4)} ${plural(r.quadros.acertar - 4, "outra", "outras")}`}</button>
          {/if}
          <span class="esp"></span>
          <button type="button" class="link" disabled={baixando} onclick={baixar}>Baixar a lista, sem CPF ›</button>
        </div>
      {/if}
    </section>
    <div class="col">
      <section class="cartao">
        <div class="topo"><h2>Possíveis repetidas ({numero(r.quadros.repetidas)})</h2></div>
        <p class="texto">O mesmo CPF, ou o mesmo nome e nascimento, de uma ficha que já está no sistema ou de outra linha do arquivo. Entram marcadas e vão para <strong>Fichas repetidas</strong>, onde a secretaria junta: fica a matrícula mais antiga.</p>
        {#if r.quadros.repetidas > 0}
          <button type="button" class="link esq" aria-expanded={listas.repetidas.aberta} onclick={() => abrir("repetidas")}>{listas.repetidas.aberta ? "Esconder a lista" : `Ver as ${numero(r.quadros.repetidas)} ›`}</button>
          {#if listas.repetidas.aberta}
            {#if listas.repetidas.erro && !listas.repetidas.itens.length}<Estado tipo="erro" texto={listas.repetidas.erro} ontentar={() => carregar("repetidas")} />
            {:else if !listas.repetidas.itens.length}<Estado tipo="carregando" linhas={3} />
            {:else}
              <ul class="rep">
                {#each listas.repetidas.itens as i (i.linha)}
                  <li><strong>{i.nome}</strong><small>linha {numero(i.linha)} · pode ser {repetidaDe(i) || "outra ficha"}</small></li>
                {/each}
              </ul>
              {#if listas.repetidas.itens.length < listas.repetidas.total}
                <Botao tipo="texto" tam="pequeno" ocupado={listas.repetidas.carregando} onclick={() => carregar("repetidas")}>Mostrar mais</Botao>
              {/if}
            {/if}
          {/if}
        {/if}
      </section>
      {@render confirmar()}
    </div>
  </div>
{/if}

<style>
  .dois { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 11px 14px; display: flex; flex-direction: column; gap: 9px; min-width: 0; }
  .cartao.justo { padding: 10px 12px; gap: 8px; }
  .cartao.sem-pad { padding: 0; gap: 0; overflow: hidden; }
  .topo { display: flex; align-items: center; gap: 8px; min-height: 24px; }
  h2 { font-size: 15px; font-weight: 700; color: var(--sv-titulo); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .topo-tab { display: flex; flex-direction: column; gap: 1px; padding: 10px 14px 8px; }
  .topo-tab span { font-size: 12px; color: var(--sv-suave); }
  .pad { padding: 4px 14px 12px; }
  .nenhuma { padding: 4px 14px 12px; font-size: 13px; color: var(--sv-suave); }
  .cab, .lin { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.5fr) 92px; gap: 10px; padding: 0 14px; align-items: center; }
  .cab { height: 30px; font-size: 12px; font-weight: 700; color: var(--sv-suave); background: var(--sv-fundo); }
  .lin { min-height: 44px; padding-top: 4px; padding-bottom: 4px; border-top: 1px solid var(--sv-linha); font-size: 13px; color: var(--sv-texto); }
  .pessoa { min-width: 0; line-height: 1.25; display: flex; flex-direction: column; }
  .pessoa strong { color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pessoa small { font-size: 11.5px; color: var(--sv-suave); }
  .porque { min-width: 0; line-height: 1.3; }
  .recebe { color: var(--sv-titulo); white-space: nowrap; }
  .rodape { display: flex; align-items: center; gap: 8px; padding: 0 14px; min-height: 34px; border-top: 1px solid var(--sv-linha); font-size: 12.5px; }
  .esp { flex: 1; }
  .link { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 700; color: var(--sv-link); border-radius: 6px; }
  .link.suave { font-weight: 400; color: var(--sv-suave); }
  .link.esq { align-self: flex-start; }
  .link:focus-visible { outline: 3px solid var(--sv-ouro); outline-offset: 2px; }
  .link:disabled { opacity: .55; cursor: default; }
  @media (hover: hover) { .link:hover { text-decoration: underline; } }
  .texto { font-size: 12.5px; color: var(--sv-texto); line-height: 1.45; }
  .texto strong { color: var(--sv-titulo); }
  .rep { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; }
  .rep li { display: flex; flex-direction: column; padding: 6px 0; line-height: 1.3; }
  .rep li + li { border-top: 1px solid var(--sv-linha); }
  .rep strong { font-size: 13px; color: var(--sv-titulo); }
  .rep small { font-size: 11.5px; color: var(--sv-suave); }
  .marcar { display: flex; align-items: flex-start; gap: 9px; font-size: 12.5px; color: var(--sv-texto); line-height: 1.4; cursor: pointer; }
  .marcar input { appearance: none; -webkit-appearance: none; width: 18px; height: 18px; flex: none; margin: 1px 0 0; border-radius: 5px; border: 1.5px solid var(--sv-campo-borda); background: var(--sv-campo); display: grid; place-content: center; cursor: pointer; }
  .marcar input:checked { background: var(--sv-escolha); border-color: var(--sv-escolha); }
  .marcar input:checked::after { content: ""; width: 5px; height: 9px; border: solid var(--sv-escolha-texto); border-width: 0 2.5px 2.5px 0; transform: translateY(-1px) rotate(45deg); }
  .marcar input:focus-visible { outline: 3px solid var(--sv-ouro); outline-offset: 2px; }
  .andamento { font-size: 12.5px; color: var(--sv-texto); }
</style>
