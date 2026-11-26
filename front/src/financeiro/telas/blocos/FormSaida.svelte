<!-- "Registrar saída" (rodada 30, "r30-blocos-saida"): a Tesouraria Geral entrega um bloco a uma congregação. Qualquer folha do bloco puxa o bloco (o
     rastreio): a caixa verde-água diz de onde ele veio e que está na Tesouraria Geral; a vermelha, por que não pode sair. O bloco que voltou em parte
     sai só com as folhas livres, pela primeira livre. A congregação (só as ativas), quem recebe (a liderança dela ou outra pessoa, escrita), o
     "Levado pela área" (o bloco nunca fica com a área) e a data, que já vem com hoje; quem registra é quem está entrando. O que o sistema confere
     antes de gravar aparece embaixo de cada campo, em vermelho. No celular, o cartão tem o X e os rótulos curtos; "Entregue por" vira a linha
     embaixo do botão. O servidor confere tudo de novo. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import { caixaDaSaida, erroDaDataDaSaida, fraseDoLevado, hojeBrasilia, rotuloDaPessoa, soNumeros } from "../../blocos";
  import type { CongregacaoSaida, LiderancaSaida, Rastreio } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";

  interface Props {
    celular: boolean;
    /** a folha que já vem digitada (o bloco que voltou em parte, da aba Folhas) */
    inicial?: number;
    /** gravou: a mensagem do servidor */
    onfeito: (mensagem: string) => void;
    /** o X do celular */
    onfechar?: () => void;
  }
  let { celular, inicial, onfeito, onfechar }: Props = $props();

  const quem = ponte().sessao().nome;

  // ---- o bloco: qualquer folha dele puxa o rastreio quando a pessoa para de digitar ----
  // svelte-ignore state_referenced_locally
  let folhaDigitada = $state(inicial ? numero(inicial) : "");
  const folhaAtual = $derived(soNumeros(folhaDigitada));
  // a resposta do rastreio vale só para o número que a pessoa digitou: trocou o número, a do anterior sai de cena (a caixa some e o botão espera)
  // até a do novo chegar; clicar antes gravaria o bloco do número anterior (portão da parte 2, I1)
  let lido = $state.raw<{ folha: string; rastreio: Rastreio | null; erro: string } | null>(null);
  const rastreio = $derived(lido && lido.folha === folhaAtual ? lido.rastreio : null);
  const erroRastreio = $derived(lido && lido.folha === folhaAtual ? lido.erro : "");
  const esperando = $derived(!!folhaAtual && lido?.folha !== folhaAtual);
  let seqRastreio = 0;
  $effect(() => {
    const folha = folhaAtual;
    const meu = ++seqRastreio;
    if (!folha) { lido = null; return; }
    const t = setTimeout(async () => {
      const r = await pedir<Rastreio>("/financeiro/blocos/rastreio" + qs({ folha }));
      if (meu !== seqRastreio) return;
      if (!r.ok) { lido = { folha, rastreio: null, erro: r.cancelado ? "" : r.mensagem }; return; }
      lido = { folha, erro: "", rastreio: { bloco: r.dados.bloco, contagem: r.dados.contagem, pessoas: r.dados.pessoas, volta: r.dados.volta ?? null } };
    }, 400);
    return () => clearTimeout(t);
  });
  const caixa = $derived(rastreio ? caixaDaSaida(rastreio, celular) : null);

  // ---- a congregação (só as ativas) e quem recebe ----
  let congregacoes = $state.raw<readonly CongregacaoSaida[]>([]);
  let congId = $state("");
  let lideranca = $state.raw<LiderancaSaida | null>(null);
  let pessoa = $state("");
  let outroNome = $state("");
  let levado = $state(false);
  let data = $state(hojeBrasilia());
  let gravando = $state(false);
  let erros = $state({ folha: "", cong: "", pessoa: "", data: "" });

  async function lerCongregacoes(): Promise<void> {
    const r = await pedir<{ congregacoes: readonly CongregacaoSaida[] }>("/financeiro/blocos/para-saida");
    if (r.ok) congregacoes = r.dados.congregacoes; else avisarFalha(r);
  }
  void lerCongregacoes();

  const congregacao = $derived(congregacoes.find((c) => String(c.id) === congId) ?? null);
  let seqLideranca = 0;
  async function escolherCongregacao(): Promise<void> {
    const meu = ++seqLideranca;
    lideranca = null; pessoa = ""; outroNome = ""; erros.cong = "";
    if (!congId) return;
    const r = await pedir<LiderancaSaida>("/financeiro/blocos/para-saida" + qs({ congregacaoId: congId }));
    if (meu !== seqLideranca) return;
    if (r.ok) lideranca = { congregacao: r.dados.congregacao, pessoas: r.dados.pessoas }; else avisarFalha(r);
  }

  function limpar(): void {
    folhaDigitada = ""; lido = null;
    congId = ""; lideranca = null; pessoa = ""; outroNome = ""; levado = false; data = hojeBrasilia();
    erros = { folha: "", cong: "", pessoa: "", data: "" };
    seqLideranca++;
  }

  async function registrar(): Promise<void> {
    if (gravando || esperando) return;
    const e = { folha: "", cong: "", pessoa: "", data: "" };
    if (!folhaAtual) e.folha = "Informe a primeira folha do bloco.";
    if (!congId) e.cong = "Escolha a congregação.";
    let quemRecebe: { membroId: number } | { nome: string } | null = null;
    if (pessoa === "outra") {
      if (outroNome.trim()) quemRecebe = { nome: outroNome.trim() }; else e.pessoa = "Escreva o nome de quem recebeu o bloco.";
    } else {
      const p = pessoa.startsWith("p") ? lideranca?.pessoas[Number(pessoa.slice(1))] : undefined;
      if (p) quemRecebe = p.membroId ? { membroId: p.membroId } : { nome: p.nome }; else e.pessoa = "Escolha quem recebeu o bloco.";
    }
    e.data = erroDaDataDaSaida(data, rastreio, celular);
    erros = e;
    // a caixa vermelha já diz por que o bloco não sai; sem o bloco ainda (a pessoa digitando), espera
    if (e.folha || e.cong || e.pessoa || e.data || !rastreio || !caixa || caixa.erro || !quemRecebe) return;
    // o bloco da caixa tem de ser o do número no campo; a folha digitada vai junto, e o servidor confere de novo
    const b = rastreio.bloco, folha = Number(folhaAtual);
    if (folha < b.primeiraFolha || folha > b.ultimaFolha) return;
    gravando = true;
    const r = await pedir<{ mensagem: string }>("/financeiro/blocos/entregar", { metodo: "POST", corpo: {
      primeiraFolha: b.parcial && b.faixa ? b.faixa.primeiraFolha : b.primeiraFolha, folha, congregacaoId: Number(congId), pessoa: quemRecebe, levadoPelaArea: levado, data
    } });
    gravando = false;
    if (!r.ok) { avisarFalha(r); return; }
    limpar();
    onfeito(r.dados.mensagem);
  }
</script>

{#snippet fechar()}
  <button type="button" class="fechar" aria-label="Fechar" onclick={() => onfechar?.()}><Icone nome="fechar" tam={18} traco={2.2} /></button>
{/snippet}

{#snippet erro(texto: string)}
  {#if texto}<span class="erro-campo" role="alert">{texto}</span>{/if}
{/snippet}

<div class="form-saida" class:cel={celular}>
  <Quadro titulo="Registrar saída" nota="o bloco vai para uma congregação" {celular} extra={celular && onfechar ? fechar : undefined}>
    <label class="campo">
      <span class="rot">Primeira folha do bloco<span class="obr" aria-hidden="true">*</span></span>
      <span class="caixa" class:invalido={!!erros.folha}><Icone nome="busca" tam={15} traco={2} /><input type="text" inputmode="numeric" autocomplete="off" maxlength="12" required
        placeholder="o número impresso na 1ª folha" bind:value={folhaDigitada} oninput={() => (erros.folha = "")} aria-invalid={erros.folha ? true : undefined} /></span>
      {@render erro(erros.folha)}
    </label>
    {#if caixa}
      <div class="caixa-bloco" class:erro={caixa.erro} aria-live="polite">{#if caixa.negrito}<strong>{caixa.negrito}</strong>{/if}{caixa.texto}</div>
    {:else if erroRastreio}
      <div class="caixa-bloco erro" aria-live="polite">{erroRastreio}</div>
    {/if}
    <div class="par">
      <label class="campo">
        <span class="rot">Congregação<span class="obr" aria-hidden="true">*</span>{#if !celular}&nbsp;<span class="nota-campo">· só as ativas</span>{/if}</span>
        <span class="caixa" class:invalido={!!erros.cong}>
          <select bind:value={congId} onchange={() => void escolherCongregacao()} aria-invalid={erros.cong ? true : undefined}>
            <option value="">Escolha</option>
            {#each congregacoes as c (c.id)}<option value={String(c.id)}>{c.nome}</option>{/each}
          </select>
          <span class="seta" aria-hidden="true">▾</span>
        </span>
        {@render erro(erros.cong)}
      </label>
      <label class="campo">
        <span class="rot">{celular ? "Data" : "Data da entrega"}<span class="obr" aria-hidden="true">*</span></span>
        <span class="caixa data" class:invalido={!!erros.data}><Icone nome="calendario" tam={15} traco={2} /><input type="date" required max={hojeBrasilia()} bind:value={data}
          oninput={() => (erros.data = "")} aria-invalid={erros.data ? true : undefined} /></span>
        {@render erro(erros.data)}
      </label>
    </div>
    <label class="campo">
      <span class="rot">Entregue a<span class="obr" aria-hidden="true">*</span>{#if !celular}&nbsp;<span class="nota-campo">· a liderança dela ou outra pessoa</span>{/if}</span>
      <span class="caixa" class:invalido={!!erros.pessoa}>
        <select bind:value={pessoa} disabled={!lideranca} onchange={() => (erros.pessoa = "")} aria-invalid={erros.pessoa ? true : undefined}>
          <option value="">{lideranca ? "Escolha quem recebe o bloco" : "primeiro, a congregação"}</option>
          {#if lideranca}
            {#each lideranca.pessoas as p, i (i)}<option value={`p${i}`}>{rotuloDaPessoa(p, lideranca.congregacao.nome)}</option>{/each}
            <option value="outra">Outra pessoa (escrever o nome)</option>
          {/if}
        </select>
        <span class="seta" aria-hidden="true">▾</span>
      </span>
      {#if pessoa !== "outra"}{@render erro(erros.pessoa)}{/if}
    </label>
    {#if pessoa === "outra"}
      <label class="campo">
        <span class="rot">Nome de quem recebeu</span>
        <span class="caixa" class:invalido={!!erros.pessoa}><input type="text" autocomplete="off" maxlength="200" bind:value={outroNome} oninput={() => (erros.pessoa = "")} /></span>
        {@render erro(erros.pessoa)}
      </label>
    {/if}
    <button type="button" role="switch" aria-checked={levado} class="levado" class:ligado={levado} onclick={() => (levado = !levado)}>
      <span class="chave" aria-hidden="true"><span class="bola"></span></span>
      <span class="txt"><strong>Levado pela área</strong> <span>{fraseDoLevado(congregacao, levado, celular)}</span></span>
    </button>
    {#if !celular}
      <div class="campo">
        <span class="rot">Entregue por</span>
        <span class="caixa auto"><Icone nome="cadeado" tam={15} traco={2} />{quem} · Tesouraria Geral (quem está entrando)</span>
      </div>
    {/if}
    <div class="fim">
      <button type="button" class="ouro" disabled={gravando || esperando} aria-busy={gravando} onclick={() => void registrar()}><Icone nome="check" tam={18} traco={2.2} />Registrar a saída</button>
    </div>
    {#if celular}<span class="por">Entregue por {quem} (quem está entrando).</span>{/if}
  </Quadro>
</div>

<style>
  .form-saida { display: contents; --verm: #B91C1C; --caixa-erro: #FDE4E4; }
  :global(html[data-tema="escuro"]) .form-saida { --verm: #FCA5A5; --caixa-erro: #3A1414; }
  .form-saida :global(.quadro) { gap: 9px; }
  .form-saida.cel :global(.quadro) { gap: 8px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .fechar { width: 28px; height: 28px; margin: -4px -4px -4px 0; border: 0; background: transparent; color: var(--sv-suave); display: flex; align-items: center; justify-content: center; border-radius: 8px; flex: none; align-self: center; }

  /* os campos (as medidas da r17: a caixa de 38 + a borda) */
  .campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .obr { color: var(--verm); }
  .nota-campo { font-weight: 400; color: var(--sv-suave); }
  .caixa {
    position: relative; min-height: 40px; border: 1px solid var(--sv-campo-borda); border-radius: 9px; background: var(--sv-campo); display: flex; align-items: center; gap: 8px;
    padding: 0 11px; font-size: 13.5px; color: var(--sv-texto); min-width: 0;
  }
  .caixa :global(svg) { color: var(--sv-suave); flex: none; }
  .caixa:focus-within { border-color: var(--sv-mod); }
  .caixa.invalido { border: 1.5px solid var(--verm); padding: 0 10.5px; }
  .caixa.auto { border-style: dashed; background: transparent; white-space: nowrap; overflow: hidden; }
  .caixa input, .caixa select {
    flex: 1; min-width: 0; height: 38px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--sv-texto); outline: none; padding: 0; margin: 0;
  }
  .caixa input::placeholder { color: var(--sv-suave); opacity: 1; }
  .caixa select { appearance: none; cursor: pointer; padding-right: 18px; text-overflow: ellipsis; }
  .caixa select:disabled { color: var(--sv-suave); cursor: default; }
  .caixa select option { color: var(--sv-texto); background: var(--sv-sup); }
  .caixa .seta { position: absolute; right: 12px; font-size: 11px; color: var(--sv-texto); pointer-events: none; }
  /* a escolha apagada não tem a seta (o desenho: "primeiro, a congregação") */
  .caixa:has(select:disabled) .seta { display: none; }
  /* a data: o ícone à esquerda, como no desenho; o calendário do navegador abre ao tocar em qualquer parte do campo */
  .caixa.data input { position: relative; }
  .caixa.data input::-webkit-calendar-picker-indicator { position: absolute; inset: 0; width: auto; height: auto; opacity: 0; cursor: pointer; }
  .erro-campo { font-size: 12px; font-weight: 600; line-height: 1.35; color: var(--verm); }
  .par { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 10px; align-items: start; }
  .cel .par { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 8px; }

  /* a caixa do bloco: verde-água (veio sozinho) ou vermelha (não pode sair) */
  .caixa-bloco { padding: 10px 12px; border-radius: 11px; background: var(--sv-mod-fundo); font-size: 12.5px; line-height: 1.45; color: var(--sv-texto); }
  .caixa-bloco strong { color: var(--sv-titulo); }
  .caixa-bloco.erro { padding: 9px 12px; background: var(--caixa-erro); border: 1px solid var(--verm); }

  /* "Levado pela área": a chave e a frase */
  .levado {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: transparent; text-align: left;
    color: var(--sv-texto); width: 100%;
  }
  .cel .levado { padding: 7px 10px; }
  .levado.ligado { border-color: var(--sv-mod); background: var(--sv-mod-fundo); }
  .chave { width: 40px; height: 24px; border-radius: 12px; flex: none; position: relative; background: var(--sv-campo-borda); transition: background-color .15s ease; }
  .bola { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 9px; background: #FFFFFF; transition: transform .15s ease; }
  .ligado .chave { background: var(--sv-mod); }
  .ligado .bola { transform: translateX(16px); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .txt strong { font-size: 13.5px; font-weight: 600; color: var(--sv-titulo); }
  .txt span { font-size: 12px; color: var(--sv-suave); }

  .fim { display: flex; justify-content: flex-end; }
  .ouro {
    height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .cel .fim { display: block; }
  .cel .ouro { width: 100%; height: 44px; justify-content: center; }
  .ouro:active:not(:disabled) { transform: scale(.97); }
  .ouro:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) { .ouro:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }
  .por { font-size: 12px; line-height: 1.35; color: var(--sv-suave); }
</style>
