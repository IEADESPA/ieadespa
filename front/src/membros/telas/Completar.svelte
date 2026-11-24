<!-- COMPLETAR O ARROLAMENTO (rodada 28, aprovada em 23/11/2026): a secretaria escolhe a situação e como e quando a pessoa entrou (a função eclesiástica só
     aparece para ler: regra dele de 24/11/2026, só a Câmara de liderança e a academia a mudam); ao
     completar, a pessoa sai do grupo "arrolamento a completar" e, em comunhão, ganha o voto. Depois, vai direto para a próxima. A congregação, a área e a Geral
     completam, cada uma só no seu escopo (o servidor confere: api/Arrolamento). Toda ficha do arrolamento tem congregação e ela não muda aqui (G3, decisão
     dele de 24/11/2026: sem congregação não há importação; a de antes da regra volta com o porquê, sem o formulário).
     As regras da tela em ../arrolamento.ts; o servidor confere tudo de novo. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr, numero } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Cartao from "../../comum/Cartao.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import { ir, voltar } from "../estado.svelte";
  import type { RespostaFichaArrolamento } from "../tipos";
  import { FORMAS, SITUACOES, corDoDepartamento, depoisDe, diaPorExtenso, formInicial, hojeIso, lerRespostaFicha, montarEnvio, notaDaData, type CampoComErro, type FormCompletar, type Situacao } from "../arrolamento";

  interface Props { matricula: number | null; congregacaoId: number | null; celular: boolean; onnome: (n: string) => void }
  let { matricula, congregacaoId, celular, onnome }: Props = $props();

  const hoje = hojeIso();
  let resp = $state<RespostaFichaArrolamento | null>(null);
  let erro = $state("");
  let form = $state<FormCompletar>({ situacao: "EM_COMUNHAO", formaAdmissao: "", dataAdmissao: "" });
  let erroCampo = $state<{ campo: CampoComErro; mensagem: string } | null>(null);
  let enviando = $state(false);
  let entrada: HTMLInputElement | undefined = $state();

  const ficha = $derived(resp?.ficha ?? null);
  const membro = $derived(form.situacao !== "CONGREGADO");
  const depois = $derived(depoisDe(form.situacao));
  const nota = $derived(notaDaData(form.situacao, form.dataAdmissao));

  let seq = 0;
  async function abrir(q: Record<string, number | null>) {
    const meu = ++seq;
    erro = "";
    erroCampo = null;
    const r = await pedir<unknown>("/arrolamento/ficha" + qs(q));
    if (meu !== seq) return;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; resp = null; return; }
    const lida = lerRespostaFicha(r.dados);
    resp = lida;
    if (lida.ficha) {
      form = formInicial(lida.ficha);
      onnome(lida.ficha.nome);
    }
    document.querySelector(".conteudo")?.scrollTo?.({ top: 0 });
  }
  function primeira() {
    if (matricula) return abrir({ matricula });
    return abrir({ congregacaoId });
  }
  void primeira();

  function pular() { if (resp?.proxima) void abrir({ matricula: resp.proxima.matricula }); }
  function trocar<K extends keyof FormCompletar>(campo: K, valor: FormCompletar[K]) {
    form = { ...form, [campo]: valor };
    erroCampo = null;
  }

  async function completar() {
    if (!ficha || enviando) return;
    const envio = montarEnvio(form, ficha, hoje);
    if (!envio.ok) { erroCampo = { campo: envio.campo, mensagem: envio.mensagem }; return; }
    enviando = true;
    const r = await pedir<{ mensagem?: string; proxima: { matricula: number; nome: string } | null }>("/arrolamento/completar", { metodo: "POST", corpo: envio.corpo });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem ?? "Arrolamento completado.", "sucesso");
    if (r.dados.proxima) void abrir({ matricula: r.dados.proxima.matricula });
    else resp = { ficha: null, proxima: null, andamento: resp?.andamento ? { ...resp.andamento, completadas: resp.andamento.completadas + 1, faltam: Math.max(0, resp.andamento.faltam - 1) } : null };
  }

  const sub = $derived.by(() => {
    if (!ficha) return "";
    const lugar = ficha.congregacao ?? "Sem congregação";
    const a = resp?.andamento;
    return `${lugar}${a ? ` · ${numero(a.completadas)} de ${numero(a.vieram)} já completadas` : ""} · ${diaPorExtenso(hoje)}`;
  });
  const linhaQuem = $derived(ficha ? [`matrícula ${numero(ficha.matricula)}`, ficha.idade !== null ? `${ficha.idade} anos` : "", ficha.departamento ?? "", "veio do sistema pago"].filter(Boolean).join(" · ") : "");
  const erroDe = (c: CampoComErro): string => (erroCampo?.campo === c ? erroCampo.mensagem : "");
  function abrirCalendario() { try { entrada?.showPicker(); } catch { entrada?.focus(); } }
</script>

{#snippet quem()}
  {#if ficha}
    <div class="quem">
      <Avatar nome={ficha.nome} tam={celular ? 32 : 36} cor={corDoDepartamento(ficha.departamento)} />
      <span class="quem-t"><strong>{ficha.nome}</strong><small>{linhaQuem}</small></span>
      {#if !celular}<Chip tom="pendente">arrolamento a completar</Chip>{/if}
    </div>
  {/if}
{/snippet}

{#snippet situacao()}
  <div class="grupo">
    <span class="rot" id="rot-sit">Situação<span class="obr" aria-hidden="true">*</span></span>
    <div class="ops" class:col={celular} role="radiogroup" aria-labelledby="rot-sit">
      {#each SITUACOES as s (s.valor)}
        <button type="button" class="op" class:sel={form.situacao === s.valor} role="radio" aria-checked={form.situacao === s.valor} onclick={() => trocar("situacao", s.valor as Situacao)}>
          <span class="radio" class:on={form.situacao === s.valor} aria-hidden="true"></span>
          <span class="op-t"><strong>{s.rotulo}</strong><small>{s.sub}</small></span>
        </button>
      {/each}
    </div>
    {#if erroDe("situacao")}<small class="erro">{erroDe("situacao")}</small>{/if}
  </div>
{/snippet}

{#snippet entradaCampos()}
  {#if membro}
    <div class="dois" class:col={celular}>
      <div class="grupo">
        <span class="rot">Como entrou<span class="obr" aria-hidden="true">*</span></span>
        <Escolha rotulo="Escolha" estilo="campo" larga valor={form.formaAdmissao || null} opcoes={FORMAS} onescolher={(v) => trocar("formaAdmissao", v ?? "")} />
        {#if erroDe("forma")}<small class="erro">{erroDe("forma")}</small>{/if}
      </div>
      <div class="grupo">
        <label class="rot" for="quando">Quando entrou<span class="obr" aria-hidden="true">*</span></label>
        <div class="data" class:invalida={!!erroDe("data")}>
          <button type="button" class="cal" aria-label="Abrir o calendário" tabindex="-1" onclick={abrirCalendario}><Icone nome="calendario" tam={16} traco={2} /></button>
          <input id="quando" bind:this={entrada} type="date" min="1900-01-01" max={hoje} value={form.dataAdmissao} required aria-invalid={erroDe("data") ? true : undefined}
            oninput={(e) => trocar("dataAdmissao", (e.currentTarget as HTMLInputElement).value)} />
        </div>
        {#if erroDe("data")}<small class="erro">{erroDe("data")}</small>{/if}
      </div>
    </div>
  {/if}
{/snippet}

<!-- a função eclesiástica: só para ler, quando a ficha já tem (regra dele de 24/11/2026: só a Câmara de liderança e a academia mudam; o arrolamento não grava) -->
{#snippet funcao()}
  {#if ficha?.funcao}
    <div class="grupo">
      <span class="rot">Função eclesiástica <span class="dica">· só a Câmara de liderança e a academia mudam</span></span>
      <p class="so-ler">{ficha.funcao}</p>
    </div>
  {/if}
{/snippet}

{#snippet muda()}
  <div class="muda">
    <div class="lado"><small>Antes</small><Chip tom="pendente">arrolamento a completar</Chip><small>sem voto</small></div>
    <span class="seta"><Icone nome="seta" tam={18} traco={2.2} /></span>
    <div class="lado"><small>Depois</small><Chip tom={depois.tom}>{depois.rotulo}</Chip><small class:voto={form.situacao === "EM_COMUNHAO"}>{depois.voto}</small></div>
  </div>
{/snippet}

{#snippet botao()}
  <Botao tipo="ouro" icone="check" largo tam={celular ? "grande" : "normal"} ocupado={enviando} onclick={completar}>Completar e ir para a próxima</Botao>
{/snippet}

<div class="completar" class:celular>
  {#if !celular}
    <Cabecalho titulo="Completar o arrolamento" {sub}>
      {#snippet acoes()}
        {#if ficha}<Botao tipo="linha" icone="seta" desligado={!resp?.proxima || enviando} onclick={pular}>Pular esta</Botao>{/if}
      {/snippet}
    </Cabecalho>
  {/if}

  {#if erro}
    <Estado tipo="erro" texto={erro} ontentar={() => void primeira()} />
    <div><Botao tipo="linha" icone="voltar" onclick={() => voltar({ tela: "painel" })}>Voltar</Botao></div>
  {:else if !resp}
    <Estado tipo="carregando" linhas={5} />
  {:else if !ficha}
    <Cartao>
      <div class="fim">
        <span class="fim-ic"><Icone nome="check" tam={22} traco={2.4} /></span>
        <div><strong>Não falta nenhuma ficha aqui.</strong><p>Todas as que vieram do sistema pago já foram completadas.</p></div>
      </div>
      <div><Botao tipo="ouro" onclick={() => ir({ tela: "painel" }, true)}>Voltar ao painel</Botao></div>
    </Cartao>
  {:else if celular}
    {@render quem()}
    {@render situacao()}
    {@render entradaCampos()}
    {@render funcao()}
    {@render muda()}
    {@render botao()}
  {:else}
    {@render quem()}
    <div class="colunas">
      <Cartao titulo="O que falta" nota="o sistema pago não trouxe">
        <div class="form">
          {@render situacao()}
          {@render entradaCampos()}
          {@render funcao()}
        </div>
      </Cartao>
      <div class="dir">
        <Cartao titulo="Ao completar">
          <div class="ao">
            {@render muda()}
            {#if nota}<p class="nota">{nota}</p>{/if}
            {@render botao()}
            {#if resp.proxima}<p class="prox">A próxima: {resp.proxima.nome} (nº {numero(resp.proxima.matricula)})</p>{/if}
          </div>
        </Cartao>
        <Cartao titulo="O que veio do sistema pago">
          <dl class="fatos">
            <div><dt>Nome</dt><dd>{ficha.nome}</dd></div>
            <div><dt>Matrícula</dt><dd class="sv-num">{numero(ficha.matricula)}</dd></div>
            <div><dt>Nascimento</dt><dd class:nada={!ficha.nascimento}>{dataBr(ficha.nascimento) || "não veio"}</dd></div>
            <div><dt>Congregação</dt><dd class:nada={!ficha.congregacao}>{ficha.congregacao ?? "não veio"}</dd></div>
            <div><dt>Departamento</dt><dd class:nada={!ficha.departamento}>{ficha.departamento ?? "não veio"}</dd></div>
          </dl>
        </Cartao>
      </div>
    </div>
  {/if}
</div>

<style>
  .completar { display: flex; flex-direction: column; gap: 14px; }
  .celular.completar { gap: 12px; }
  .quem { display: flex; align-items: center; gap: 10px; min-height: 62px; padding: 4px 16px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .celular .quem { min-height: 56px; padding: 4px 12px; }
  .quem-t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .quem-t strong { font-size: 15px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .quem-t small { font-size: 12.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .colunas { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .dir { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .form { display: flex; flex-direction: column; gap: 14px; }
  .grupo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .rot { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); margin-left: 1px; }
  .dica { font-size: 12.5px; font-weight: 400; color: var(--sv-suave); }
  .so-ler { margin: 0; font-size: 14px; color: var(--sv-titulo); }
  .erro { font-size: 12.5px; color: var(--sv-atr); font-weight: 600; }
  .ops { display: flex; gap: 8px; }
  .ops.col { flex-direction: column; }
  .op { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 9px; padding: 9px 12px; border-radius: 11px; border: 1px solid var(--sv-borda); background: var(--sv-sup); text-align: left; cursor: pointer; }
  .op.sel { border: 2px solid var(--sv-ouro); background: #FFF8E1; padding: 8px 11px; }
  :global(html[data-tema="escuro"]) .op.sel { background: #3A2E0B; }
  .radio { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--sv-campo-borda); flex: none; margin-top: 1px; box-sizing: border-box; }
  .radio.on { border: 5px solid var(--sv-titulo); }
  :global(html[data-tema="escuro"]) .radio.on { border-color: var(--sv-ouro); }
  .op-t { min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .op-t strong { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .op-t small { font-size: 12.5px; color: var(--sv-suave); }
  .dois { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dois.col { grid-template-columns: 1fr; gap: 14px; }
  .data { display: flex; align-items: center; height: 46px; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); }
  .data:focus-within { border-color: var(--sv-ouro); box-shadow: 0 0 0 3px rgba(255, 184, 0, .35); }
  .data.invalida { border-color: var(--sv-atr); }
  .cal { border: 0; background: transparent; color: var(--sv-suave); padding: 0 4px 0 14px; height: 100%; display: flex; align-items: center; cursor: pointer; }
  .data input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; color: var(--sv-titulo); font: inherit; font-size: 16px; padding: 0 14px 0 6px; color-scheme: light; }
  :global(html[data-tema="escuro"]) .data input { color-scheme: dark; }
  .data input:focus { outline: none; }
  .data input::-webkit-calendar-picker-indicator { display: none; }
  .muda { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lado { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; line-height: 1.3; }
  .lado small { font-size: 12.5px; color: var(--sv-suave); }
  .lado small.voto { font-weight: 700; color: #166534; }
  :global(html[data-tema="escuro"]) .lado small.voto { color: #86EFAC; }
  .seta { color: var(--sv-suave); display: flex; }
  /* no celular, o antes e o depois numa linha só, como no desenho */
  .celular .muda { flex-wrap: nowrap; gap: 6px; }
  .celular .muda :global(.chip) { font-size: 11.5px; padding: 3px 8px; }
  .ao { display: flex; flex-direction: column; gap: 10px; }
  .nota { font-size: 13px; color: var(--sv-suave); line-height: 1.4; }
  .prox { font-size: 13px; color: var(--sv-suave); }
  .fatos { display: flex; flex-direction: column; margin: 0; }
  .fatos div { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 10px; align-items: center; min-height: 30px; border-top: 1px solid var(--sv-linha); font-size: 13.5px; }
  .fatos div:first-child { border-top: 0; }
  .fatos dt { color: var(--sv-suave); }
  .fatos dd { margin: 0; color: var(--sv-titulo); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fatos dd.nada { font-weight: 400; color: var(--sv-suave); }
  .fim { display: flex; gap: 12px; align-items: flex-start; }
  .fim-ic { width: 40px; height: 40px; border-radius: 12px; background: var(--sv-ok-fundo); color: var(--sv-ok); display: flex; align-items: center; justify-content: center; flex: none; }
  .fim strong { font-size: 15.5px; color: var(--sv-titulo); }
  .fim p { font-size: 13.5px; color: var(--sv-suave); margin-top: 2px; }
  @media (max-width: 1100px) { .colunas { grid-template-columns: 1fr; } }
</style>
