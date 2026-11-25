<!-- Blocos de recibo: as folhas de um bloco (rodada 17, "r17-blocos-folhas", opção 1, com os acertos da rodada 30, "r30-blocos-folhas"). O formulário
     primeiro: clicar numa folha livre leva o número ao formulário (ninguém digita bloco nem folha); a pessoa só escolhe o que aconteceu (cancelada,
     arrancada, extraviada ou inexistente, cada uma com a frase de quando usar) e escreve a observação. Embaixo, os quadradinhos das 50 folhas com a
     legenda sempre completa e a nota: normalmente é automático (a folha lançada sai da planilha); esta tela é a exceção. O seletor de bloco em todos
     os níveis ("Bloco 1.401 · Vila Nova ▾"; na congregação, "Bloco 1.401 · em uso"), no celular logo abaixo das abas. O bloco devolvido fica só para
     consulta; o que voltou em parte e está com a Geral mostra as livres prontas para sair. No celular a grade começa na 36ª: as de antes, todas com
     destino, viram uma linha. A folha com histórico também se clica ("r30-blocos-desfazer"): a marcada abre o cartão dela (a Tesouraria Geral
     desfaz, com o motivo; a área e a congregação veem o cadeado) e a que já foi marcada e desfeita vai ao formulário com o histórico embaixo (no
     celular, primeiro o cartão com "Marcar o que aconteceu"). A lançada sem histórico não abre nada (resposta dele de 24/11/2026). -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import Aviso from "../../../comum/Aviso.svelte";
  import Estado from "../../../comum/Estado.svelte";
  import { escopo, ir, nivelDaSessao } from "../../estado.svelte";
  import { NOME_DESTINO, EXCECOES, posicao, recolhidasNoCelular, plural, diaMes, partesDaContagem, textoFaixa, tituloDoSeletor } from "../../blocos";
  import type { DestinoFolha, ExcecaoFolha, Faixa, HistoricoFolha, PaginaFolhas } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";
  import Vazio from "../../partes/Vazio.svelte";
  import { vazioDasFolhas } from "../../vazios";
  import Cabecalho from "./Cabecalho.svelte";
  import SeletorBloco from "./SeletorBloco.svelte";
  import FolhaMarcada from "./FolhaMarcada.svelte";
  import Historico from "./Historico.svelte";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const nivel = nivelDaSessao();
  const local = nivel === "local";
  /** a legenda: sempre todas as situações, na mesma ordem (a r30); no celular, os nomes curtos */
  const LEGENDA: readonly { readonly chave: DestinoFolha | "livre" | "escolhida"; readonly nome: string; readonly curto: string }[] = [
    { chave: "lancada", nome: "lançada na planilha", curto: "lançada" }, { chave: "cancelada", nome: "cancelada", curto: "cancelada" },
    { chave: "arrancada", nome: "arrancada", curto: "arrancada" }, { chave: "extraviada", nome: "extraviada", curto: "extraviada" },
    { chave: "inexistente", nome: "inexistente", curto: "inexistente" }, { chave: "livre", nome: "livre", curto: "livre" },
    { chave: "escolhida", nome: "a que você clicou", curto: "clicada" }
  ];

  let dados = $state.raw<PaginaFolhas | null>(null);
  let erro = $state("");
  let carregando = $state(true);
  let escolhida = $state<number | null>(null);
  let oQueAconteceu = $state<ExcecaoFolha | null>(null);
  let observacao = $state("");
  let falta = $state("");
  let gravando = $state(false);
  /** o histórico da folha clicada (null = sem histórico, ou ainda lendo) */
  let historico = $state.raw<HistoricoFolha | null>(null);
  let motivo = $state("");
  /** no celular, a folha livre com histórico: o formulário só abre ao tocar em "Marcar o que aconteceu" */
  let marcando = $state(false);

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

  function limpar() { escolhida = null; oQueAconteceu = null; observacao = ""; falta = ""; historico = null; motivo = ""; marcando = false; }

  let seqHist = 0;
  async function lerHistorico(n: number): Promise<void> {
    const meu = ++seqHist;
    const r = await pedir<HistoricoFolha>("/financeiro/blocos/historico" + qs({ folha: n }));
    if (meu !== seqHist || escolhida !== n) return;   // outra folha foi clicada antes desta resposta chegar
    if (!r.ok) { historico = null; if (!r.cancelado) avisarFalha(r); return; }
    historico = r.dados;
  }

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
  /** a faixa que se marca: a da entrega em curso (as folhas de uma entrega anterior ficam só para consulta) */
  const faixa = $derived<Faixa | null>(bloco ? (bloco.faixa ?? { primeiraFolha: bloco.primeiraFolha, ultimaFolha: bloco.ultimaFolha }) : null);
  const marcavel = (f: { n: number; destino: DestinoFolha | null }) => aberto && f.destino === null && !!faixa && f.n >= faixa.primeiraFolha && f.n <= faixa.ultimaFolha;
  const comHistorico = $derived(new Set(dados?.comHistorico ?? []));
  /** a folha se clica: a livre da entrega em curso (o formulário) e a que tem histórico (o cartão dela, ou o formulário com o histórico) */
  const clicavel = (f: { n: number; destino: DestinoFolha | null }) => marcavel(f) || comHistorico.has(f.n);
  /** a folha clicada, com o destino de agora */
  const sel = $derived(escolhida === null ? null : (folhas.find((f) => f.n === escolhida) ?? null));
  /** o que aparece no lugar do formulário: o formulário, o cartão da folha marcada, ou (no celular) o cartão da livre com histórico */
  const modo = $derived.by((): "formulario" | "marcada" | "livreComHistorico" => {
    if (!sel || marcavel(sel)) return sel && celular && comHistorico.has(sel.n) && !marcando ? "livreComHistorico" : "formulario";
    return "marcada";
  });
  /** a exceção (não a lançada) da entrega em curso: a Tesouraria Geral desfaz; a área e a congregação veem o cadeado */
  const excecaoEmCurso = $derived(!!sel && sel.destino !== null && sel.destino !== "lancada" && aberto && !!faixa && sel.n >= faixa.primeiraFolha && sel.n <= faixa.ultimaFolha);
  const podeDesfazer = $derived(nivel === "geral" && excecaoEmCurso);
  const trava = $derived(
    excecaoEmCurso ? (celular ? "Marcou errado? Só a Tesouraria Geral desfaz, com o motivo." : "Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela.")
      : sel?.destino === "lancada" ? "A folha lançada se corrige pelo lançamento." : "Só para consulta: a folha já voltou com o bloco."
  );
  const notaMarcada = $derived(podeDesfazer ? "desfazer pede o motivo" : excecaoEmCurso ? "só a Tesouraria Geral desfaz" : "só consulta");
  /** a conta do quadro das folhas (a r30): "38 com destino · 12 livres"; no devolvido, "completo: 49 lançadas, 1 arrancada" */
  const notaGrade = $derived.by(() => {
    if (!bloco) return "";
    const todas = `${numero(bloco.primeiraFolha)} a ${numero(bloco.ultimaFolha)}`;
    const livres = plural(bloco.livres, "livre", "livres");
    if (bloco.situacao === "fechado") {
      if (bloco.parcial) return `${todas} · parcial: ${numero(comDestino)} com destino`;
      const conta = (d: DestinoFolha) => folhas.filter((f) => f.destino === d).length;
      const partes = partesDaContagem({ lancadas: conta("lancada"), canceladas: conta("cancelada"), arrancadas: conta("arrancada"), extraviadas: conta("extraviada"), inexistentes: conta("inexistente"), livres: 0 });
      return `${todas} · completo${partes.length ? ": " + partes.join(", ") : ""}`;
    }
    if (bloco.situacao === "na-geral") return `${todas} · parcial: ${numero(comDestino)} com destino · ${livres}`;
    return `${todas} · ${numero(comDestino)} com destino · ${livres}`;
  });
  const recolhidas = $derived(celular ? recolhidasNoCelular(folhas.map((f) => f.destino)) : 0);
  const visiveis = $derived(folhas.slice(recolhidas));
  /** no celular, a linha das primeiras folhas (no bloco que voltou em parte, de quem usou) */
  const resumoCel = $derived(recolhidas ? `1ª a ${recolhidas}ª: todas com destino${bloco?.situacao === "na-geral" && bloco.volta ? ` (${bloco.volta.congregacao})` : ""}` : "");
  /** o bloco que voltou em parte e está com a Geral sai de novo pelo livro, já com a primeira folha livre */
  function irSaida() { if (faixa) ir({ tela: "blocos", aba: "livro", saida: faixa.primeiraFolha }); }
  const exemplo = $derived(escolhida ?? folhas.find((f) => f.destino === null)?.n ?? bloco?.ultimaFolha ?? null);
  const textoFolha = (n: number) => (bloco ? `${numero(n)} · ${posicao(n, bloco.primeiraFolha)}ª` : "");

  function rotuloFolha(f: { n: number; pos: number; destino: DestinoFolha | null }): string {
    return `Folha ${numero(f.n)}, ${f.pos}ª: ${NOME_DESTINO[f.destino ?? "livre"]}${f.n === escolhida ? ", a que você clicou" : ""}`;
  }

  function escolherFolha(n: number) {
    if (n === escolhida) return;
    escolhida = n; falta = ""; motivo = ""; marcando = false; historico = null;
    if (comHistorico.has(n)) void lerHistorico(n);
  }

  async function desfazer() {
    if (gravando || !bloco || escolhida === null) return;
    if (!motivo.trim()) { falta = "Escreva o motivo para desfazer."; return; }
    falta = "";
    gravando = true;
    const n = escolhida;
    const r = await pedir<{ mensagem: string }>("/financeiro/blocos/desfazer-folha", { metodo: "POST", corpo: { folha: n, motivo: motivo.trim() } });
    gravando = false;
    if (!r.ok) { avisarFalha(r); return; }
    // no celular, o aviso curto (a r30): "A folha 70.086 voltou a ficar livre."
    ponte().avisar(celular ? r.dados.mensagem.replace(/^(.*?\.)\s.*$/s, "$1") : r.dados.mensagem, "sucesso");
    motivo = "";
    await ler(bloco.id);
    if (escolhida === n) await lerHistorico(n);
  }

  async function registrar() {
    if (gravando || !bloco) return;
    if (escolhida === null) { falta = "Escolha a folha: clique numa folha livre."; return; }
    if (!oQueAconteceu) { falta = "Escolha o que aconteceu: cancelada, arrancada, extraviada ou inexistente."; return; }
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

  // sem bloco (r30-blocos-vazios): o texto de cada nível; a Geral tem o caminho para o livro, onde se registra a saída
  const vazio = $derived(vazioDasFolhas(nivel, dados?.escopo ?? null));
</script>

{#snippet seletor()}
  {#if bloco && dados && dados.opcoes.length}
    <SeletorBloco opcoes={dados.opcoes} escolhido={bloco.id} {local} titulo={tituloDoSeletor(dados.escopo)} {celular} onescolher={(id) => void ler(id)} />
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

{#snippet quandoUsar()}
  <ul class="quando" aria-label="Quando usar cada uma">
    {#each EXCECOES as x (x.chave)}<li><strong>{x.rotulo}:</strong> {x.quando}</li>{/each}
  </ul>
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
      <button type="button" class="folha {f.destino ?? 'livre'}" class:escolhida={f.n === escolhida && f.destino === null} class:anel={f.n === escolhida && f.destino !== null}
        disabled={!clicavel(f)} aria-pressed={clicavel(f) ? f.n === escolhida : undefined} aria-label={rotuloFolha(f)}
        title={f.observacao ? `${NOME_DESTINO[f.destino ?? "livre"]}: ${f.observacao}` : undefined} onclick={() => escolherFolha(f.n)}>
        <strong>{numero(f.n)}</strong><span>{f.pos}ª</span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet legenda()}
  <div class="legenda">
    {#each LEGENDA as l (l.chave)}<span><i class={l.chave}></i>{celular ? l.curto : l.nome}</span>{/each}
  </div>
{/snippet}

{#snippet cartaoFechado()}
  {#if bloco}
    <div class="cartao-info">
      <Icone nome="cadeado" tam={17} traco={2} />
      <p><strong>O bloco {numero(bloco.numero)} voltou {bloco.parcial ? "parcial" : "completo"} à Tesouraria Geral em {diaMes(bloco.devolvidoEm)}.</strong> As folhas dele não mudam mais: ficam só para
        consulta.{celular ? "" : " Clique numa folha para ver o histórico dela."}</p>
    </div>
  {/if}
{/snippet}

{#snippet irAoLivro()}
  <button type="button" class="linha-botao" onclick={() => ir({ tela: "blocos", aba: "livro" })}><Icone nome="seta" tam={17} traco={2} />Ir ao livro de entrada e saída</button>
{/snippet}

{#snippet cartaoEstoque()}
  {#if bloco && faixa}
    <div class="cartao-info estoque">
      <p>
        <strong>O bloco {numero(bloco.numero)} voltou parcial{bloco.volta ? ` em ${diaMes(bloco.volta.data)}` : ""} e está na Tesouraria Geral.</strong>
        {#if celular}
          As {numero(bloco.livres)} livres ({textoFaixa(faixa)}) podem sair de novo.
        {:else if bloco.volta}
          As {numero(bloco.volta.usadas)} usadas ficam no histórico, com quem usou ({bloco.volta.congregacao}); as {numero(bloco.livres)} livres ({textoFaixa(faixa)}) estão prontas para outra entrega.
        {:else}
          As {numero(bloco.livres)} livres ({textoFaixa(faixa)}) estão prontas para outra entrega.
        {/if}
      </p>
      <button type="button" class="linha-botao" onclick={irSaida}><Icone nome="seta" tam={17} traco={2} />Registrar saída</button>
    </div>
  {/if}
{/snippet}

{#snippet folhaMarcada()}
  {#if bloco && sel}
    <FolhaMarcada {celular} blocoNumero={bloco.numero} folha={sel.n} posicao={sel.pos} destino={sel.destino} {historico} pode={podeDesfazer} {trava}
      nota={notaMarcada} {gravando} {falta} bind:motivo ondesfazer={() => void desfazer()} oneditar={() => (falta = "")}
      onmarcar={modo === "livreComHistorico" ? () => (marcando = true) : undefined} />
  {/if}
{/snippet}

<div class="pagina folhas-bloco" class:cel={celular}>
  {#if celular}
    <Cabecalho aba="folhas" {celular} />
    {@render seletor()}
  {:else}
    <Cabecalho aba="folhas" {celular} acoes={seletor} />
  {/if}

  {#if erro && !dados}
    <Estado tipo="erro" texto={erro} ontentar={() => void ler(bloco?.id ?? null)} />
  {:else if !dados}
    <Estado tipo="carregando" linhas={5} />
  {:else if !bloco}
    <Vazio titulo={vazio.titulo} texto={vazio.texto} {celular} acao={nivel === "geral" ? irAoLivro : undefined} />
  {:else if celular}
    {#if resumoCel}<p class="resumo"><Icone nome="check" tam={14} traco={2.4} />{resumoCel}</p>{/if}
    {@render grade()}
    {@render legenda()}
    {#if bloco.situacao === "fechado"}
      {@render cartaoFechado()}
    {:else if bloco.situacao === "na-geral"}
      {@render cartaoEstoque()}
    {/if}
    {#if modo !== "formulario"}
      {@render folhaMarcada()}
    {:else if aberto}
      <Quadro titulo={escolhida !== null ? `Folha ${numero(escolhida)} · a ${posicao(escolhida, bloco.primeiraFolha)}ª` : "Toque numa folha livre"} celular>
        {@render escolhas()}
        {@render quandoUsar()}
        {@render campoObservacao()}
        {@render faltando()}
        <div class="fim">{@render botaoRegistrar()}</div>
        {#if historico}<Historico {historico} {celular} />{/if}
      </Quadro>
    {/if}
  {:else}
    {#if bloco.situacao === "fechado"}
      {@render cartaoFechado()}
    {:else if bloco.situacao === "na-geral"}
      {@render cartaoEstoque()}
    {/if}
    {#if modo === "marcada"}
      {@render folhaMarcada()}
    {:else if aberto}
    <Quadro titulo="A folha que você clicou" nota="só escolha o que aconteceu">
        <div class="formulario">
          <div class="campo">
            <span class="rot">Folha (bloco {numero(bloco.numero)})</span>
            <span class="auto" class:vazio={escolhida === null} aria-live="polite"><Icone nome="livro" tam={15} traco={2} />{escolhida !== null ? textoFolha(escolhida) : "clique numa folha livre"}</span>
          </div>
          {@render escolhas()}
          {@render campoObservacao()}
          {@render botaoRegistrar()}
        </div>
        {@render quandoUsar()}
        {@render faltando()}
        {#if historico}<Historico {historico} {celular} />{/if}
    </Quadro>
    {/if}
    <Quadro titulo={`As ${numero(folhas.length)} folhas do bloco ${numero(bloco.numero)}`} nota={notaGrade}>
      {@render grade()}
      {@render legenda()}
    </Quadro>
    {#if aberto && exemplo !== null && modo === "formulario" && !historico}
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

  /* as cores das folhas (aprovadas na r17 e na r30): lançada verde, cancelada vermelha, arrancada amarela, extraviada roxa com a borda tracejada,
     livre como o campo, a clicada dourada. A inexistente (decisão dele de 24/11/2026, sem desenho ainda) é cinza listrada: nunca parece livre
     (que é lisa, com a borda) nem a extraviada (que é tracejada). */
  .folhas-bloco {
    --f-lancada: #DCFCE7; --f-lancada-texto: #166534; --f-cancelada: #FEE2E2; --f-cancelada-texto: #991B1B;
    --f-arrancada: #FEF3C7; --f-arrancada-texto: #7A4A00; --f-extraviada: #EDE9FE; --f-extraviada-texto: #5B21B6; --f-extraviada-borda: #7C3AED;
    --f-inexistente: #E2E8F0; --f-inexistente-texto: #334155; --f-inexistente-risca: rgba(51, 65, 85, .16);
  }
  :global(html[data-tema="escuro"]) .folhas-bloco {
    --f-lancada: #14532D; --f-lancada-texto: #86EFAC; --f-cancelada: #4C1717; --f-cancelada-texto: #FCA5A5; --f-arrancada: #3D2A05; --f-arrancada-texto: #FCD34D;
    --f-extraviada: #2E1A5C; --f-extraviada-texto: #D8CCFF; --f-extraviada-borda: #A78BFA;
    --f-inexistente: #1E293B; --f-inexistente-texto: #CBD5E1; --f-inexistente-risca: rgba(203, 213, 225, .14);
  }

  /* o cartão no lugar do formulário: o bloco devolvido (só consulta, com o cadeado) e o que voltou em parte e está com a Geral (com "Registrar saída") */
  .cartao-info {
    display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--sv-borda); background: var(--sv-sup);
    font-size: 13px; line-height: 1.45; color: var(--sv-texto); flex: none;
  }
  .cartao-info :global(svg) { color: var(--sv-suave); flex: none; }
  .cartao-info p { flex: 1; min-width: 0; }
  .cartao-info strong { color: var(--sv-titulo); }
  .cartao-info.estoque { align-items: center; gap: 14px; }
  .cel .cartao-info { padding: 10px 12px; }
  .cel .cartao-info.estoque { flex-direction: column; align-items: flex-start; gap: 8px; }
  .linha-botao {
    height: 42px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: transparent; color: var(--sv-titulo); display: inline-flex;
    align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; flex: none; transition: background-color .15s ease;
  }
  .linha-botao :global(svg) { color: var(--sv-icone); }
  @media (hover: hover) { .linha-botao:hover { background: var(--sv-linha); } }

  /* o formulário: a folha, o que aconteceu, a observação e o botão numa linha */
  /* as medidas da r30 (r30FormFolha): a folha, o que aconteceu (agora com quatro escolhas), a observação e o botão */
  .formulario { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 2.5fr) minmax(0, 1.3fr) auto; gap: 12px; align-items: end; }
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
    height: 30px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
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
  /* a frase de cada tipo (decisão dele de 24/11/2026), à vista antes de escolher */
  .quando { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 3px 16px; font-size: 12px; line-height: 1.35; color: var(--sv-suave); }
  .quando strong { font-weight: 600; color: var(--sv-texto); }
  .cel .quando { flex-direction: column; gap: 2px; font-size: 11.5px; }
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
  /* a borda tracejada de 1,5 px por fora da caixa de 46 (o desenho não usa box-sizing) */
  .folha.extraviada { background: var(--f-extraviada); color: var(--f-extraviada-texto); border: 1.5px dashed var(--f-extraviada-borda); height: 49px; }
  .cel .folha.extraviada { height: 51px; }
  .folha.inexistente {
    background-color: var(--f-inexistente); color: var(--f-inexistente-texto);
    background-image: repeating-linear-gradient(135deg, transparent 0 5px, var(--f-inexistente-risca) 5px 8px);
  }
  .folha.livre { background: var(--sv-campo); color: var(--sv-suave); border: 1px solid var(--sv-campo-borda); height: 48px; }
  .cel .folha.livre { height: 50px; }
  .folha.livre.escolhida { height: 46px; }
  .cel .folha.livre.escolhida { height: 48px; }
  .folha.escolhida { background: #FFB800; color: #0A2342; border: 0; box-shadow: 0 0 0 3px #0A2342 inset; }
  /* a folha marcada que foi clicada (r30-blocos-desfazer): guarda a cor dela, com o anel por fora */
  .folha.anel { box-shadow: 0 0 0 3px #0A2342; }
  :global(html[data-tema="escuro"]) .folha.anel { box-shadow: 0 0 0 3px #FFB800; }
  .folha:focus-visible { outline: 2px solid var(--sv-mod); outline-offset: 2px; }

  .legenda { display: flex; gap: 6px 14px; flex-wrap: wrap; font-size: 12px; color: var(--sv-texto); }
  .cel .legenda { gap: 5px 11px; font-size: 11.5px; }
  .legenda span { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
  .legenda i { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--sv-borda); flex: none; }
  .legenda i.lancada { background: var(--f-lancada); }
  .legenda i.cancelada { background: var(--f-cancelada); }
  .legenda i.arrancada { background: var(--f-arrancada); }
  .legenda i.extraviada { background: var(--f-extraviada); border: 1.5px dashed var(--f-extraviada-borda); }
  .legenda i.inexistente { background-color: var(--f-inexistente); background-image: repeating-linear-gradient(135deg, transparent 0 3px, var(--f-inexistente-risca) 3px 5px); }
  .legenda i.livre { background: var(--sv-campo); }
  .legenda i.escolhida { background: #FFB800; }

  .nota :global(.aviso) { padding: 10px 12px; font-size: 13px; line-height: 1.45; }
  /* no celular, a linha das primeiras folhas, com o visto verde */
  .resumo { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--sv-texto); flex: none; }
  .resumo :global(svg) { color: var(--sv-ok); }
</style>
