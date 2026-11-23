<!-- Blocos de recibo: as folhas de um bloco (rodada 17, "r17-blocos-folhas", opção 1). O formulário primeiro: clicar numa folha livre leva o número
     ao formulário (ninguém digita bloco nem folha); a pessoa só escolhe o que aconteceu (cancelada, arrancada, extraviada) e escreve a observação.
     Embaixo, os quadradinhos das 50 folhas com a legenda e a nota: normalmente é automático (a folha lançada sai da planilha); esta tela é a exceção.
     A Geral e a área escolhem o bloco no alto ("Bloco 1.401 · Vila Nova ▾"); a congregação vê o bloco em uso dela. No celular as primeiras folhas
     com destino viram uma linha e aparecem só as que importam. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import Aviso from "../../../comum/Aviso.svelte";
  import Estado from "../../../comum/Estado.svelte";
  import { escopo, nivelDaSessao } from "../../estado.svelte";
  import { NOME_DESTINO, posicao, recolhidasNoCelular, plural } from "../../blocos";
  import type { DestinoFolha, ExcecaoFolha, PaginaFolhas } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";
  import Cabecalho from "./Cabecalho.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const nivel = nivelDaSessao();
  const EXCECOES: readonly { readonly chave: ExcecaoFolha; readonly rotulo: string }[] = [
    { chave: "cancelada", rotulo: "Cancelada" }, { chave: "arrancada", rotulo: "Arrancada" }, { chave: "extraviada", rotulo: "Extraviada" }
  ];

  let dados = $state.raw<PaginaFolhas | null>(null);
  let erro = $state("");
  let carregando = $state(true);
  let escolhida = $state<number | null>(null);
  let oQueAconteceu = $state<ExcecaoFolha | null>(null);
  let observacao = $state("");
  let falta = $state("");
  let gravando = $state(false);

  let seq = 0;
  async function ler(blocoId: number | null): Promise<void> {
    const meu = ++seq;
    carregando = true;
    const r = await pedir<PaginaFolhas>("/financeiro/blocos/folhas" + qs({ bloco: blocoId }));
    if (meu !== seq) return;   // outro bloco foi escolhido antes desta resposta chegar
    carregando = false;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    erro = "";
    if (r.dados.bloco?.id !== dados?.bloco?.id) limpar();
    dados = r.dados;
    escopo.tela = r.dados.escopo;
  }
  void ler(null);

  function limpar() { escolhida = null; oQueAconteceu = null; observacao = ""; falta = ""; }

  const bloco = $derived(dados?.bloco ?? null);
  /** o bloco ainda está com a congregação: as folhas livres recebem a exceção */
  const aberto = $derived(!!bloco && bloco.situacao !== "fechado" && bloco.situacao !== "na-geral");
  const destinoDe = $derived(new Map<number, { destino: DestinoFolha; observacao: string | null }>((dados?.folhas ?? []).map((f) => [f.folha, f])));
  /** cada folha do bloco, da 1ª à última */
  const folhas = $derived.by(() => {
    if (!bloco) return [];
    return Array.from({ length: bloco.ultimaFolha - bloco.primeiraFolha + 1 }, (_, i) => {
      const n = bloco.primeiraFolha + i, d = destinoDe.get(n);
      return { n, pos: i + 1, destino: d?.destino ?? null, observacao: d?.observacao ?? null };
    });
  });
  const comDestino = $derived(folhas.filter((f) => f.destino !== null).length);
  const temExtraviada = $derived(folhas.some((f) => f.destino === "extraviada"));
  const recolhidas = $derived(celular ? recolhidasNoCelular(folhas.map((f) => f.destino)) : 0);
  const visiveis = $derived(folhas.slice(recolhidas));
  const exemplo = $derived(escolhida ?? folhas.find((f) => f.destino === null)?.n ?? bloco?.ultimaFolha ?? null);
  const textoFolha = (n: number) => (bloco ? `${numero(n)} · ${posicao(n, bloco.primeiraFolha)}ª` : "");

  function rotuloFolha(f: { n: number; pos: number; destino: DestinoFolha | null }): string {
    return `Folha ${numero(f.n)}, ${f.pos}ª: ${NOME_DESTINO[f.destino ?? "livre"]}${f.n === escolhida ? ", a que você clicou" : ""}`;
  }

  function escolherFolha(n: number) { escolhida = n; falta = ""; }

  async function registrar() {
    if (gravando || !bloco) return;
    if (escolhida === null) { falta = "Escolha a folha: clique numa folha livre."; return; }
    if (!oQueAconteceu) { falta = "Escolha o que aconteceu com a folha: cancelada, arrancada ou extraviada."; return; }
    if (!observacao.trim()) { falta = "Escreva a observação: o que aconteceu com a folha."; return; }
    falta = "";
    gravando = true;
    const r = await pedir<{ mensagem: string }>("/financeiro/blocos/folha", { metodo: "POST", corpo: { folha: escolhida, oQueAconteceu, observacao: observacao.trim() } });
    gravando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    limpar();
    await ler(bloco.id);
  }

  const vazio = $derived(nivel === "local" ? "Nenhum bloco com a sua congregação agora. Bloco novo: peça à Tesouraria Geral." : "Nenhum bloco saiu para as congregações ainda.");
  const entregues = $derived((dados?.opcoes ?? []).filter((o) => o.situacao !== "fechado"));
  const devolvidos = $derived((dados?.opcoes ?? []).filter((o) => o.situacao === "fechado"));
</script>

{#snippet seletor()}
  {#if nivel !== "local" && bloco && dados}
    <label class="seletor">
      <Icone nome="livro" tam={17} traco={2} />
      <span class="sv-escondido">Bloco</span>
      <select value={String(bloco.id)} onchange={(e) => void ler(Number((e.currentTarget as HTMLSelectElement).value))}>
        {#if entregues.length}
          <optgroup label="Com as congregações">
            {#each entregues as o (o.id)}<option value={String(o.id)}>Bloco {numero(o.numero)} · {o.congregacao}</option>{/each}
          </optgroup>
        {/if}
        {#if devolvidos.length}
          <optgroup label="Devolvidos">
            {#each devolvidos as o (o.id)}<option value={String(o.id)}>Bloco {numero(o.numero)} · {o.congregacao}</option>{/each}
          </optgroup>
        {/if}
      </select>
      <span class="seta" aria-hidden="true">▾</span>
    </label>
  {/if}
{/snippet}

{#snippet escolhas()}
  <div class="escolhas">
    <span class="rot" id="fin-o-que-aconteceu">O que aconteceu</span>
    <div class="chips" role="group" aria-labelledby="fin-o-que-aconteceu">
      {#each EXCECOES as x (x.chave)}
        <button type="button" class:ativa={oQueAconteceu === x.chave} aria-pressed={oQueAconteceu === x.chave} onclick={() => { oQueAconteceu = x.chave; falta = ""; }}>{x.rotulo}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet campoObservacao()}
  <label class="campo">
    <span class="rot">Observação</span>
    <input type="text" maxlength="300" autocomplete="off" placeholder="o que aconteceu com a folha" bind:value={observacao} oninput={() => (falta = "")} />
  </label>
{/snippet}

{#snippet botaoRegistrar()}
  <button type="button" class="ouro" disabled={gravando} aria-busy={gravando} onclick={() => void registrar()}><Icone nome="check" tam={18} traco={2.2} />Registrar</button>
{/snippet}

{#snippet faltando()}
  {#if falta}<p class="falta" role="alert">{falta}</p>{/if}
{/snippet}

{#snippet grade()}
  <div class="grade" role="group" aria-label={bloco ? `As folhas do bloco ${numero(bloco.numero)}` : "As folhas do bloco"} aria-busy={carregando}>
    {#each visiveis as f (f.n)}
      <button type="button" class="folha {f.destino ?? 'livre'}" class:escolhida={f.n === escolhida} disabled={!aberto || f.destino !== null}
        aria-pressed={f.destino === null ? f.n === escolhida : undefined} aria-label={rotuloFolha(f)}
        title={f.observacao ? `${NOME_DESTINO[f.destino ?? "livre"]}: ${f.observacao}` : undefined} onclick={() => escolherFolha(f.n)}>
        <strong>{numero(f.n)}</strong><span>{f.pos}ª</span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet legenda()}
  <div class="legenda">
    <span><i class="lancada"></i>lançada na planilha</span>
    <span><i class="cancelada"></i>cancelada</span>
    <span><i class="arrancada"></i>arrancada</span>
    {#if temExtraviada}<span><i class="extraviada"></i>extraviada</span>{/if}
    <span><i class="livre"></i>livre</span>
    <span><i class="escolhida"></i>a que você clicou</span>
  </div>
{/snippet}

{#snippet fechado()}
  {#if bloco}<p class="fechado">O bloco {numero(bloco.numero)} já foi devolvido à Tesouraria Geral: as folhas dele não mudam mais.</p>{/if}
{/snippet}

<div class="pagina folhas-bloco" class:cel={celular}>
  {#if celular}
    <Cabecalho aba="folhas" {celular} />
  {:else}
    <Cabecalho aba="folhas" {celular} acoes={seletor} />
  {/if}

  {#if erro && !dados}
    <Estado tipo="erro" texto={erro} ontentar={() => void ler(bloco?.id ?? null)} />
  {:else if !dados}
    <Estado tipo="carregando" linhas={5} />
  {:else if !bloco}
    <Estado tipo="vazio" texto={vazio} />
  {:else if celular}
    <span class="linha-cel">
      <strong>Bloco {numero(bloco.numero)}</strong> · {#if recolhidas}1ª a {recolhidas}ª: todas com destino ✓{:else}folhas {numero(bloco.primeiraFolha)} a {numero(bloco.ultimaFolha)}{/if}
    </span>
    {@render grade()}
    <Quadro titulo={escolhida !== null ? `Folha ${numero(escolhida)} · a ${posicao(escolhida, bloco.primeiraFolha)}ª` : aberto ? "Toque numa folha livre" : `Bloco ${numero(bloco.numero)}`} celular>
      {#if aberto}
        {@render escolhas()}
        {@render campoObservacao()}
        {@render faltando()}
        <div class="fim">{@render botaoRegistrar()}</div>
      {:else}
        {@render fechado()}
      {/if}
    </Quadro>
  {:else}
    <Quadro titulo="A folha que você clicou" nota="só escolha o que aconteceu">
      {#if aberto}
        <div class="formulario">
          <div class="campo">
            <span class="rot">Folha (bloco {numero(bloco.numero)})</span>
            <span class="auto" class:vazio={escolhida === null} aria-live="polite"><Icone nome="livro" tam={15} traco={2} />{escolhida !== null ? textoFolha(escolhida) : "clique numa folha livre"}</span>
          </div>
          {@render escolhas()}
          {@render campoObservacao()}
          {@render botaoRegistrar()}
        </div>
        {@render faltando()}
      {:else}
        {@render fechado()}
      {/if}
    </Quadro>
    <Quadro titulo={`As ${numero(folhas.length)} folhas do bloco ${numero(bloco.numero)}`}
      nota={`${numero(bloco.primeiraFolha)} a ${numero(bloco.ultimaFolha)} · ${numero(comDestino)} com destino · ${plural(folhas.length - comDestino, "livre", "livres")}`}>
      {@render grade()}
      {@render legenda()}
    </Quadro>
    {#if exemplo !== null}
      <div class="nota">
        <Aviso><strong>Normalmente é automático:</strong> a folha lançada na planilha sai daqui sozinha. Esta tela é só para a exceção. Ninguém digita número: clique na folha e o sistema sabe a posição ({numero(exemplo)} = {posicao(exemplo, bloco.primeiraFolha)}ª do bloco {numero(bloco.primeiraFolha)} a {numero(bloco.ultimaFolha)}).</Aviso>
      </div>
    {/if}
  {/if}
</div>

<style>
  .pagina { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .pagina.cel { gap: 10px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* as cores das folhas (o desenho): lançada verde, cancelada vermelha, arrancada amarela, livre como campo, a clicada dourada.
     Extraviada não tem cor no desenho: usa o azul das notas (já aprovado), para nunca parecer livre. */
  .folhas-bloco {
    --f-lancada: #DCFCE7; --f-lancada-texto: #166534; --f-cancelada: #FEE2E2; --f-cancelada-texto: #991B1B;
    --f-arrancada: #FEF3C7; --f-arrancada-texto: #7A4A00; --f-extraviada: var(--sv-info-fundo); --f-extraviada-texto: var(--sv-link);
  }
  :global(html[data-tema="escuro"]) .folhas-bloco {
    --f-lancada: #14532D; --f-lancada-texto: #86EFAC; --f-cancelada: #4C1717; --f-cancelada-texto: #FCA5A5; --f-arrancada: #3D2A05; --f-arrancada-texto: #FCD34D;
  }

  /* o seletor do bloco, no alto (como o botão de linha do desenho: "Bloco 1.401 · Vila Nova ▾") */
  .seletor {
    position: relative; height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); color: var(--sv-titulo); display: inline-flex;
    align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; flex: none; cursor: pointer;
  }
  .seletor :global(svg) { color: var(--sv-icone); }
  .seletor:focus-within { border-color: var(--sv-mod); }
  .seletor select {
    appearance: none; border: 0; background: transparent; color: inherit; font: inherit; padding: 0; margin: 0; outline: none; cursor: pointer;
    field-sizing: content; max-width: 260px; text-overflow: ellipsis;
  }
  .seletor select option, .seletor select optgroup { color: var(--sv-texto); background: var(--sv-sup); }
  .seta { font-size: 11px; margin-left: -2px; }

  /* o formulário: a folha, o que aconteceu, a observação e o botão numa linha */
  .formulario { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.1fr) minmax(0, 1.4fr) auto; gap: 12px; align-items: end; }
  .campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* o desenho não usa box-sizing: a caixa de 38 px com a borda dá 40 (e a folha livre de 46, com a borda, 48; no celular 50) */
  .auto, .campo input {
    min-height: 40px; border-radius: 9px; display: flex; align-items: center; gap: 8px; padding: 0 11px; font-size: 13.5px; color: var(--sv-texto);
  }
  .auto { border: 1px dashed var(--sv-campo-borda); background: transparent; white-space: nowrap; overflow: hidden; }
  .auto :global(svg) { color: var(--sv-suave); }
  .auto.vazio { color: var(--sv-suave); }
  .campo input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); font-family: inherit; width: 100%; outline: none; }
  .campo input::placeholder { color: var(--sv-suave); opacity: 1; }
  .campo input:focus { border-color: var(--sv-mod); }
  .escolhas { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button {
    height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
    font-size: 13px; font-weight: 600; color: var(--sv-texto); white-space: nowrap; transition: background-color .15s ease;
  }
  .chips button.ativa { background: var(--sv-escolha); border-color: var(--sv-escolha); color: var(--sv-escolha-texto); }
  .ouro {
    height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .ouro:active:not(:disabled) { transform: scale(.97); }
  .ouro:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) { .ouro:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }
  .falta { font-size: 12.5px; font-weight: 600; color: var(--sv-atr); }
  .fechado { font-size: 13px; color: var(--sv-texto); line-height: 1.4; }
  .fim { display: flex; justify-content: flex-end; }

  /* os quadradinhos das folhas: 10 por linha no notebook, 5 no celular */
  .grade { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; }
  .cel .grade { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
  .folha {
    height: 46px; border-radius: 10px; border: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;
    transition: transform .12s ease;
  }
  .cel .folha { height: 48px; }
  .folha strong { font-size: 14.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cel .folha strong { font-size: 13.5px; }
  .folha span { font-size: 10.5px; font-weight: 600; }
  .folha:disabled { cursor: default; }
  .folha:active:not(:disabled) { transform: scale(.96); }
  .folha.lancada { background: var(--f-lancada); color: var(--f-lancada-texto); }
  .folha.cancelada { background: var(--f-cancelada); color: var(--f-cancelada-texto); }
  .folha.arrancada { background: var(--f-arrancada); color: var(--f-arrancada-texto); }
  .folha.extraviada { background: var(--f-extraviada); color: var(--f-extraviada-texto); }
  .folha.livre { background: var(--sv-campo); color: var(--sv-suave); border: 1px solid var(--sv-campo-borda); height: 48px; }
  .cel .folha.livre { height: 50px; }
  .folha.livre.escolhida { height: 46px; }
  .cel .folha.livre.escolhida { height: 48px; }
  .folha.escolhida { background: #FFB800; color: #0A2342; border: 0; box-shadow: 0 0 0 3px #0A2342 inset; }
  .folha:focus-visible { outline: 2px solid var(--sv-mod); outline-offset: 2px; }

  .legenda { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--sv-texto); }
  .legenda span { display: flex; align-items: center; gap: 5px; }
  .legenda i { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--sv-borda); }
  .legenda i.lancada { background: var(--f-lancada); }
  .legenda i.cancelada { background: var(--f-cancelada); }
  .legenda i.arrancada { background: var(--f-arrancada); }
  .legenda i.extraviada { background: var(--f-extraviada); }
  .legenda i.livre { background: var(--sv-campo); }
  .legenda i.escolhida { background: #FFB800; }

  .nota :global(.aviso) { padding: 10px 12px; font-size: 13px; line-height: 1.45; }
  .linha-cel { font-size: 12.5px; color: var(--sv-texto); }
  .linha-cel strong { color: var(--sv-titulo); }
</style>
