<!-- IMPORTAR OS MEMBROS DO SISTEMA PAGO (a tela r27, aprovada em 22/11/2026): só a Secretaria Geral, uma vez só (não há tela de diferenças nem
     importar de novo). 1. o arquivo e o mapa das colunas; 2. os números, antes de gravar nada; 3. confirmar (a confirmação reforçada da casca)
     e os lotes; 4. o resultado e a trilha. A tela abre no passo de agora: feita -> o resultado; começada e não terminada -> continuar; com a
     prévia guardada -> os números; sem nada -> o arquivo. -->
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
    confirmar, descartar, diaEHora, guardaDe, importarLote, lerEstado, PERGUNTA_DEIXAR_DE_FORA, PERGUNTA_DESCARTAR, podeDeixarDeFora, quandoLongo, resumoDaTela,
    type ArquivoLido, type EstadoImportacao, type MapaDaTela, type Previa
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
  let descartando = $state(false);
  const agora = quandoLongo(new Date());
  // os prazos da guarda dos dados (do servidor; sem eles, 7 e 90 dias)
  const guarda = $derived(guardaDe(est?.guarda));

  async function carregar() {
    erro = "";
    const r = await lerEstado();
    if (!r.ok) { erro = r.mensagem; return; }
    est = r.dados;
    const imp = r.dados.importacao;
    if (r.dados.feita) passo = 4;
    else if (r.dados.emAndamento) passo = 3;
    else if (imp && imp.situacao === "PREVIA" && resumoDaTela(imp.resumo)) {
      if (!previa || previa.importacaoId !== imp.importacaoId) previa = { importacaoId: imp.importacaoId, resumo: imp.resumo };
      passo = 2;
    } else passo = 1;
  }
  if (geral) void carregar();

  // os lotes (até 200 fichas cada) até concluir; parou no meio (a internet caiu), a tela mostra "continuar" e nada se repete
  async function rodarLotes(id: number, total: number, deixarDeFora = false) {
    importando = true;
    erroImp = "";
    podeDeixar = false;
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
  function continuar() {
    const imp = est?.importacao;
    if (!imp || importando) return;
    void rodarLotes(imp.importacaoId, est?.restantes ?? 0);
  }
  function deixarDeForaEContinuar() {
    const imp = est?.importacao;
    if (!imp || importando || !window.confirm(PERGUNTA_DEIXAR_DE_FORA)) return;
    void rodarLotes(imp.importacaoId, est?.restantes ?? 0, true);
  }

  const sub = $derived(
    passo === 1 ? `só a Secretaria Geral · uma vez só · ${agora}`
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
      <PassoArquivo {celular} campos={est.campos} bind:arquivo bind:previa bind:mapa onconferir={() => (passo = 2)} />
    {:else if previa && (passo === 2 || (passo === 3 && importando && !est.emAndamento))}
      <PassoNumeros {celular} {previa} {andamento} ocupado={importando} erro={erroImp} onconfirmar={confirmarEImportar} {guarda} {descartando} ondescartar={descartarPrevia} />
    {:else if passo === 3}
      <section class="continuar">
        <h2>A importação começou e não terminou</h2>
        <p>{#if est.restantes}Faltam {numero(est.restantes)} {plural(est.restantes, "ficha", "fichas")}.{" "}{/if}Continue de onde parou: o que já entrou não se repete.</p>
        <Botao tipo="ouro" icone="seta" largo={celular} ocupado={importando} onclick={continuar}>Continuar a importação</Botao>
        {#if andamento}<p role="status">{andamento}</p>{/if}
        {#if erroImp}<Aviso tom="erro">{erroImp}</Aviso>{/if}
        {#if podeDeixar && !importando}<Botao tipo="linha" largo={celular} onclick={deixarDeForaEContinuar}>Deixar essas linhas de fora e continuar</Botao>{/if}
      </section>
    {:else if passo === 4 && est.importacao && est.retrato}
      <PassoResultado {celular} importacao={est.importacao} retrato={est.retrato} {guarda} />
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
</style>
