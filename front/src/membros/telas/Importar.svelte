<!-- IMPORTAR OS MEMBROS DO SISTEMA PAGO (a tela r27, aprovada em 22/11/2026): só a Secretaria Geral, uma vez só (não há tela de diferenças nem
     importar de novo). 1. o arquivo e o mapa das colunas; 2. os números, antes de gravar nada; 3. confirmar (a confirmação reforçada da casca)
     e os lotes; 4. o resultado e a trilha. A tela abre no passo de agora: feita -> o resultado; começada e não terminada -> continuar; com a
     prévia guardada -> os números; sem nada -> o arquivo. G2 (decisão dele de 24/11/2026): feita e com linhas que faltaram, o resultado oferece
     UMA importação só delas (o resto); a prévia e o andamento do resto vêm na frente do resultado, e o passo do arquivo fica no modo do resto. -->
<script lang="ts">
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Botao from "../../comum/Botao.svelte";
  import { numero, plural } from "../../comum/formato";
  import { ponte } from "../../comum/ponte";
  import Caminho from "../importar/Caminho.svelte";
  import PassoArquivo from "../importar/PassoArquivo.svelte";
  import PassoNumeros from "../importar/PassoNumeros.svelte";
  import PassoResultado from "../importar/PassoResultado.svelte";
  import { avisarFalha } from "../../comum/api";
  import {
    AVISO_ARQUIVO_RESTO, confirmar, descartar, descartarParada, diaEHora, fraseDaPreviaDoResto, fraseDescartadaPeloPrazo, fraseDoPrazo, guardaDe, importarLote, lerEstado,
    linhasRecusadas, perguntaDeixarDeFora, PERGUNTA_DESCARTAR, PERGUNTA_DESCARTAR_PARADA, podeDeixarDeFora, quandoLongo, resumoDaTela,
    type ArquivoLido, type EstadoImportacao, type LinhaRecusada, type MapaDaTela, type Previa
  } from "../importar/importar";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const geral = ponte().sessao().geral;
  let est = $state<EstadoImportacao | null>(null);
  let erro = $state("");
  let passo = $state<1 | 2 | 3 | 4>(1);
  let arquivo = $state<ArquivoLido | null>(null);
  let previa = $state<Previa | null>(null);
  let mapa = $state<MapaDaTela | null>(null);
  let importando = $state(false);
  let andamento = $state("");
  let erroImp = $state("");
  // A6 (revisão de 24/11/2026): parou com 5 linhas seguidas que o sistema não conseguiu gravar; a Secretaria Geral pode deixá-las de fora e continuar
  let podeDeixar = $state(false);
  // as linhas que ficariam de fora (a linha e o nome), para a Geral ver antes de confirmar (menor 10 da revisão de 24/11/2026)
  let recusadas = $state<LinhaRecusada[]>([]);
  let descartando = $state(false);
  // G2: a importação só das linhas que faltaram (o passo do arquivo e a prévia vão com resto: true)
  let modoResto = $state(false);
  const agora = quandoLongo(new Date());
  // os prazos da guarda dos dados (do servidor; sem eles, 7 e 90 dias)
  const guarda = $derived(guardaDe(est?.guarda));
  // G2 (decisão dele de 24/11/2026): a importação parada tem 7 dias, contados do último lote; a tela diz quantos faltam e o que acontece depois
  const prazoTexto = $derived(fraseDoPrazo(est?.prazo, est?.importadas, est?.importacao?.restoDe != null));
  // a parada sem ninguém importado que a rotina descartou no fim do prazo: o passo do arquivo diz qual foi e quando
  const descartadaTexto = $derived(fraseDescartadaPeloPrazo(est?.descartadaPeloPrazo));
  // a prévia do resto: quantas das que faltaram foram achadas no arquivo
  const previaRestoTexto = $derived(previa ? fraseDaPreviaDoResto(previa.resumo.resto) : "");

  async function carregar() {
    erro = "";
    const r = await lerEstado();
    if (!r.ok) { erro = r.mensagem; return; }
    est = r.dados;
    const imp = r.dados.importacao;
    // (G2: a prévia e o andamento do resto vêm na frente do resultado da importação de antes; na importação de sempre, feita não tem nenhum dos dois)
    if (r.dados.emAndamento) passo = 3;
    else if (imp && imp.situacao === "PREVIA" && resumoDaTela(imp.resumo)) {
      if (!previa || previa.importacaoId !== imp.importacaoId) previa = { importacaoId: imp.importacaoId, resumo: imp.resumo };
      passo = 2;
    } else if (r.dados.feita) passo = 4;
    else passo = 1;
    modoResto = imp?.restoDe != null;
  }
  if (geral) void carregar();

  // os lotes (até 200 fichas cada) até concluir; parou no meio (a internet caiu), a tela mostra "continuar" e nada se repete
  async function rodarLotes(id: number, total: number, deixarDeFora = false) {
    importando = true;
    erroImp = "";
    podeDeixar = false;
    recusadas = [];
    let feitas = 0;
    let parado = 0;
    let deixar = deixarDeFora;   // só a primeira chamada leva a confirmação; as seguintes seguem como sempre
    andamento = `Trazendo as fichas: 0 de ${numero(total)}…`;
    try {
      for (;;) {
        const l = await importarLote(id, deixar);
        deixar = false;
        if (!l.ok) {
          podeDeixar = podeDeixarDeFora(l.corpo);
          recusadas = podeDeixar ? linhasRecusadas(l.corpo) : [];
          erroImp = podeDeixar ? l.mensagem : `${l.mensagem || "A importação parou no meio."} O que já entrou fica: continue de onde parou.`;
          return;
        }
        feitas += l.dados.importadas;
        andamento = `Trazendo as fichas: ${numero(Math.min(feitas, total))} de ${numero(total)}…`;
        if (l.dados.concluida) break;
        parado = l.dados.importadas > 0 ? 0 : parado + 1;
        if (parado >= 3) { erroImp = "A importação não andou nas últimas tentativas. Espere um pouco e continue."; return; }
      }
      andamento = "";
      await carregar();
    } finally {
      importando = false;
      if (erroImp) { andamento = ""; await carregar(); }
    }
  }
  async function confirmarEImportar() {
    if (!previa || importando) return;
    importando = true;
    erroImp = "";
    const c = await confirmar(previa.importacaoId);
    if (!c.ok) {
      importando = false;
      // a casca já avisou (a confirmação reforçada cancelada, a falta de rede): a tela só não segue
      if (!c.jaAvisado && !c.cancelado) erroImp = c.mensagem;
      return;
    }
    passo = 3;
    await rodarLotes(previa.importacaoId, c.dados.restantes);
  }
  // o "Descartar" (respostas dele de 23/11/2026): a prévia sai na hora, com os dados pessoais da planilha; a tela volta ao arquivo
  async function descartarPrevia() {
    if (!previa || importando || descartando || !window.confirm(PERGUNTA_DESCARTAR)) return;
    descartando = true;
    erroImp = "";
    const r = await descartar(previa.importacaoId);
    descartando = false;
    if (!r.ok) {
      // a prévia mudou (outra aba, ou a rotina já apagou): a tela relê o estado e mostra onde está
      avisarFalha(r);
      await carregar();
      return;
    }
    previa = null;
    arquivo = null;
    mapa = null;
    ponte().avisar("Prévia descartada: a planilha saiu do sistema.", "sucesso");
    await carregar();
  }
  // G2: a parada sem ninguém importado pode ser descartada (a planilha sai na hora, com os dados pessoais); a tela volta ao arquivo
  async function descartarImportacaoParada() {
    const imp = est?.importacao;
    if (!imp || importando || descartando || !window.confirm(PERGUNTA_DESCARTAR_PARADA)) return;
    descartando = true;
    erroImp = "";
    const r = await descartarParada(imp.importacaoId);
    descartando = false;
    if (!r.ok) {
      // a confirmação reforçada cancelada não é erro; o resto (outra aba, o prazo que já a encerrou) vira aviso e a tela relê onde está
      avisarFalha(r);
      await carregar();
      return;
    }
    previa = null;
    arquivo = null;
    mapa = null;
    podeDeixar = false;
    recusadas = [];
    ponte().avisar("Importação descartada: a planilha saiu do sistema.", "sucesso");
    await carregar();
  }
  // G2: do resultado para o arquivo, no modo do resto (a planilha escolhida de novo)
  function importarResto() {
    if (!est?.resto?.possivel || importando) return;
    previa = null;
    arquivo = null;
    mapa = null;
    modoResto = true;
    passo = 1;
  }
  function voltarAoResultado() {
    modoResto = false;
    void carregar();
  }
  function continuar() {
    const imp = est?.importacao;
    if (!imp || importando) return;
    void rodarLotes(imp.importacaoId, est?.restantes ?? 0);
  }
  function deixarDeForaEContinuar() {
    const imp = est?.importacao;
    if (!imp || importando || !window.confirm(perguntaDeixarDeFora(recusadas.length))) return;
    void rodarLotes(imp.importacaoId, est?.restantes ?? 0, true);
  }

  const sub = $derived(
    passo === 1 ? (modoResto ? `só as linhas que faltaram · uma vez só · ${agora}` : `só a Secretaria Geral · uma vez só · ${agora}`)
      : passo === 4 && est?.importacao ? `feita em ${diaEHora(est.importacao.concluidaEm)}${est.retrato?.confirmadaPor ? `, por ${est.retrato.confirmadaPor}` : ""}`
        : passo === 3 && (est?.emAndamento || !importando) ? `a importação começou e não terminou · ${agora}`
          : `os números, antes de gravar nada · ${agora}`
  );
</script>

<div class="imp" class:celular>
  {#if !geral}
    {#if !celular}<Cabecalho titulo="Importar os membros do sistema pago" sub="só a Secretaria Geral · uma vez só" />{/if}
    <Aviso tom="info">Esta tela é só da Secretaria Geral: ela traz, uma vez só, os membros do sistema pago.</Aviso>
  {:else if erro}
    <Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if !est}
    <div class="caixa"><Estado tipo="carregando" linhas={4} /></div>
  {:else}
    {#if !celular}<Cabecalho titulo="Importar os membros do sistema pago" {sub} />{/if}
    <Caminho agora={passo} {celular} onvoltar={passo === 2 && !importando ? () => (passo = 1) : null} />
    {#if passo === 1}
      {#if descartadaTexto}<Aviso tom="info">{descartadaTexto}</Aviso>{/if}
      {#if modoResto}
        <Aviso tom="info">{AVISO_ARQUIVO_RESTO}
          {#snippet acao()}{#if !previa}<Botao tipo="texto" tam="pequeno" onclick={voltarAoResultado}>Voltar ao resultado</Botao>{/if}{/snippet}
        </Aviso>
      {/if}
      <PassoArquivo {celular} campos={est.campos} resto={modoResto} bind:arquivo bind:previa bind:mapa onconferir={() => (passo = 2)} />
    {:else if previa && (passo === 2 || (passo === 3 && importando && !est.emAndamento))}
      {#if previaRestoTexto}<Aviso tom="info">{previaRestoTexto}</Aviso>{/if}
      <PassoNumeros {celular} {previa} {andamento} ocupado={importando} erro={erroImp} onconfirmar={confirmarEImportar} {guarda} {descartando} ondescartar={descartarPrevia} />
    {:else if passo === 3}
      <section class="continuar">
        <h2>A importação começou e não terminou</h2>
        <p>{#if est.restantes}Faltam {numero(est.restantes)} {plural(est.restantes, "ficha", "fichas")}.{" "}{/if}Continue de onde parou: o que já entrou não se repete.</p>
        {#if prazoTexto}<p class="prazo">{prazoTexto}</p>{/if}
        <Botao tipo="ouro" icone="seta" largo={celular} ocupado={importando} onclick={continuar}>Continuar a importação</Botao>
        {#if andamento}<p role="status">{andamento}</p>{/if}
        {#if erroImp}<Aviso tom="erro">{erroImp}</Aviso>{/if}
        {#if podeDeixar && !importando}
          {#if recusadas.length}
            <div class="recusadas">
              <strong>As linhas que ficam de fora, se você continuar:</strong>
              <ul>{#each recusadas as r (r.linha)}<li><span class="sv-num">Linha {numero(r.linha)}</span>{r.nome ? ` · ${r.nome}` : ""}</li>{/each}</ul>
            </div>
          {/if}
          <Botao tipo="linha" largo={celular} onclick={deixarDeForaEContinuar}>Deixar essas linhas de fora e continuar</Botao>
        {/if}
        {#if est.importadas === 0 && !importando}
          <Botao tipo="linha" largo={celular} ocupado={descartando} onclick={descartarImportacaoParada}>Descartar a importação</Botao>
        {/if}
      </section>
    {:else if passo === 4 && est.importacao && est.retrato}
      <PassoResultado {celular} importacao={est.importacao} retrato={est.retrato} {guarda} resto={est.resto ?? null} descartadaResto={descartadaTexto} onresto={importarResto} />
    {/if}
  {/if}
</div>

<style>
  .imp {
    display: flex; flex-direction: column; gap: 12px;
    --imp-verde: #166534; --imp-verde-texto: #FFFFFF; --imp-ouro-texto: #8A5A00; --imp-agora-fundo: #FFF4D1;
    --imp-etq-verde-fundo: #DDF3EF; --imp-etq-verde: #0F766E;
  }
  :global(html[data-tema="escuro"]) .imp {
    --imp-verde: #86EFAC; --imp-verde-texto: #0B1F3A; --imp-ouro-texto: #FCD34D; --imp-agora-fundo: #3A2E0B;
    --imp-etq-verde-fundo: #0F3D3A; --imp-etq-verde: #5EEAD4;
  }
  .imp.celular { gap: 10px; }
  .caixa { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 14px 16px; }
  .continuar { background: var(--sv-sup); border: 1px solid var(--sv-ouro); box-shadow: 0 0 0 1px var(--sv-ouro); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .continuar h2 { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .continuar p { font-size: 13px; color: var(--sv-texto); line-height: 1.45; }
  .continuar .prazo { color: var(--imp-ouro-texto); font-weight: 600; }
  .recusadas { font-size: 13px; color: var(--sv-texto); line-height: 1.45; display: flex; flex-direction: column; gap: 4px; }
  .recusadas ul { margin: 0; padding-left: 18px; }
  .recusadas strong { color: var(--sv-titulo); font-weight: 600; }
</style>
