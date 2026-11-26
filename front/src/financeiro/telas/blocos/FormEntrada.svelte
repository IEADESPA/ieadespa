<!-- "Registrar entrada" (rodada 17, "r17-blocos-livro"; a devolução completa ou parcial da rodada 30, "r30-blocos-devolver"): o bloco volta para a
     Tesouraria Geral. Qualquer folha do bloco puxa o rastreio: a caixa diz a quem ele foi entregue e as contas (as com destino e as sem destino).
     "A devolução" já vem em "Completa", o normal; "Parcial" abre a "Primeira folha em branco", que o sistema já traz (a seguinte à última com
     destino) e dá para mudar, e a linha embaixo diz o que vai acontecer antes de gravar: dela ao fim, as folhas voltam a ficar livres e o bloco
     fica na Tesouraria Geral, para outra entrega só com elas. Quem recebe é quem está entrando; quem trouxe é alguém da lista do rastreio ou outra
     pessoa, escrita. Sem o bloco, as escolhas ficam apagadas. No celular, o cartão tem o X e "Recebido por" vira a linha embaixo do botão. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../../comum/api";
  import { numero } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import { caixaDaEntrada, linhaDaVolta, livresDaParcial, posicao, rotuloDaPessoa, soNumeros } from "../../blocos";
  import type { Rastreio } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";

  interface Props {
    celular: boolean;
    /** gravou: a mensagem do servidor */
    onfeito: (mensagem: string) => void;
    /** o X do celular */
    onfechar?: () => void;
  }
  let { celular, onfeito, onfechar }: Props = $props();

  const quemEntra = ponte().sessao().nome;

  let folhaDigitada = $state("");
  const folhaAtual = $derived(soNumeros(folhaDigitada));
  // a resposta do rastreio vale só para o número que a pessoa digitou: trocou o número, a do anterior sai de cena (a caixa some e o botão espera)
  // até a do novo chegar; clicar antes devolveria o bloco do número anterior (portão da parte 2, I1)
  let lido = $state.raw<{ folha: string; rastreio: Rastreio | null; erro: string } | null>(null);
  const rastreio = $derived(lido && lido.folha === folhaAtual ? lido.rastreio : null);
  const erroRastreio = $derived(lido && lido.folha === folhaAtual ? lido.erro : "");
  let como = $state<"completa" | "parcial">("completa");
  let brancoDigitado = $state("");
  let quem = $state("");
  let outroNome = $state("");
  let falta = $state("");
  let gravando = $state(false);

  // o rastreio vem sozinho quando a pessoa para de digitar (só os algarismos: "68.001" é a folha 68001)
  let seqRastreio = 0;
  $effect(() => {
    const folha = folhaAtual;
    const meu = ++seqRastreio;
    if (!folha) { lido = null; return; }
    const t = setTimeout(async () => {
      const r = await pedir<Rastreio>("/financeiro/blocos/rastreio" + qs({ folha }));
      if (meu !== seqRastreio) return;
      quem = ""; outroNome = ""; falta = ""; como = "completa";
      if (!r.ok) { lido = { folha, rastreio: null, erro: r.cancelado ? "" : r.mensagem }; brancoDigitado = ""; return; }
      const novo: Rastreio = { bloco: r.dados.bloco, contagem: r.dados.contagem, pessoas: r.dados.pessoas, primeiraEmBranco: r.dados.primeiraEmBranco ?? null,
        inexistentes: r.dados.inexistentes ?? [], volta: r.dados.volta ?? null };
      lido = { folha, rastreio: novo, erro: "" };
      brancoDigitado = novo.primeiraEmBranco ? numero(novo.primeiraEmBranco) : "";
    }, 400);
    return () => clearTimeout(t);
  });
  const caixa = $derived(rastreio ? caixaDaEntrada(rastreio) : null);
  const podeVoltar = $derived(!!caixa && !caixa.erro);

  // a parcial: a primeira em branco digitada e o que volta a ficar livre (dela ao fim do bloco, sem as inexistentes do fim; as do meio são ditas,
  // como na confirmação do servidor). A digitada que é inexistente não tem linha: o servidor recusa e diz por quê
  const branco = $derived(Number(soNumeros(brancoDigitado)) || 0);
  const parcial = $derived.by(() => {
    if (!rastreio || !podeVoltar || como !== "parcial" || !branco) return null;
    const b = rastreio.bloco, de = b.faixa?.primeiraFolha ?? b.primeiraFolha, inexistentes = rastreio.inexistentes ?? [];
    if (branco < de || branco > b.ultimaFolha || inexistentes.includes(branco)) return null;
    return { linha: linhaDaVolta(livresDaParcial(branco, b.ultimaFolha, inexistentes)), usadas: branco - de, congregacao: b.congregacao?.nome ?? "" };
  });
  const posicaoDigitada = $derived(rastreio && branco >= rastreio.bloco.primeiraFolha && branco <= rastreio.bloco.ultimaFolha ? posicao(branco, rastreio.bloco.primeiraFolha) : 0);

  function limpar(): void {
    folhaDigitada = ""; lido = null; como = "completa"; brancoDigitado = ""; quem = ""; outroNome = ""; falta = "";
  }

  async function registrar(): Promise<void> {
    if (gravando || !rastreio || !podeVoltar) return;
    // o bloco da caixa tem de ser o do número no campo; a folha digitada vai junto, e o servidor confere de novo
    const b = rastreio.bloco, folha = Number(folhaAtual);
    if (folha < b.primeiraFolha || folha > b.ultimaFolha) return;
    let pessoa: { membroId: number } | { nome: string };
    if (quem === "outra") {
      if (!outroNome.trim()) { falta = "Escreva o nome de quem trouxe o bloco."; return; }
      pessoa = { nome: outroNome.trim() };
    } else {
      const p = quem.startsWith("p") ? rastreio.pessoas[Number(quem.slice(1))] : undefined;
      if (!p) { falta = "Escolha quem trouxe o bloco."; return; }
      pessoa = p.membroId ? { membroId: p.membroId } : { nome: p.nome };
    }
    if (como === "parcial" && !branco) { falta = "Informe a primeira folha em branco do bloco."; return; }
    falta = "";
    gravando = true;
    const corpo = como === "parcial" ? { primeiraFolha: b.primeiraFolha, folha, pessoa, parcial: true, primeiraEmBranco: branco }
      : { primeiraFolha: b.primeiraFolha, folha, pessoa, parcial: false };
    const r = await pedir<{ mensagem: string }>("/financeiro/blocos/devolver", { metodo: "POST", corpo });
    gravando = false;
    if (!r.ok) { avisarFalha(r); return; }
    limpar();
    onfeito(r.dados.mensagem);
  }
</script>

{#snippet fechar()}
  <button type="button" class="fechar" aria-label="Fechar" onclick={() => onfechar?.()}><Icone nome="fechar" tam={18} traco={2.2} /></button>
{/snippet}

{#snippet chips()}
  <div class="escolhas" class:apagado={!podeVoltar}>
    <span class="rot" id="fin-a-devolucao">A devolução</span>
    <div class="chips" role="group" aria-labelledby="fin-a-devolucao">
      <button type="button" class:ativa={como === "completa"} aria-pressed={como === "completa"} disabled={!podeVoltar} onclick={() => { como = "completa"; falta = ""; }}>Completa</button>
      <button type="button" class:ativa={como === "parcial"} aria-pressed={como === "parcial"} disabled={!podeVoltar} onclick={() => { como = "parcial"; falta = ""; }}>Parcial</button>
    </div>
  </div>
{/snippet}

{#snippet campoBranco()}
  <label class="campo">
    <span class="rot">Primeira folha em branco<span class="obr" aria-hidden="true">*</span></span>
    <!-- a posição logo depois do número ("64.436 · 36ª", o desenho): o campo tem a largura do que foi digitado -->
    <span class="caixa"><input class="encolhe" type="text" inputmode="numeric" autocomplete="off" maxlength="12" size={Math.max(2, brancoDigitado.length)}
      bind:value={brancoDigitado} oninput={() => (falta = "")} />{#if posicaoDigitada}<span class="pos">· {posicaoDigitada}ª</span>{/if}</span>
  </label>
{/snippet}

{#snippet volta()}
  {#if parcial}
    <div class="volta" aria-live="polite"><strong>{parcial.linha}</strong>
      {#if celular}O bloco fica na Tesouraria Geral, para outra entrega.{:else}O bloco fica na Tesouraria Geral, para outra entrega só com elas; as {numero(parcial.usadas)} usadas ficam no histórico{parcial.congregacao ? `, com ${parcial.congregacao}` : ""}.{/if}</div>
  {/if}
{/snippet}

<div class="form-entrada" class:cel={celular}>
  <Quadro titulo="Registrar entrada" nota="o bloco volta para a Tesouraria Geral" {celular} extra={celular && onfechar ? fechar : undefined}>
    <label class="campo">
      <span class="rot">Primeira folha do bloco<span class="obr" aria-hidden="true">*</span></span>
      <span class="caixa"><Icone nome="busca" tam={15} traco={2} /><input type="text" inputmode="numeric" autocomplete="off" maxlength="12" required
        placeholder="o número impresso na 1ª folha" bind:value={folhaDigitada} /></span>
    </label>
    {#if caixa}
      <div class="caixa-bloco" class:erro={caixa.erro} aria-live="polite">{#if caixa.negrito}<strong>{caixa.negrito}</strong>{/if}{caixa.texto}</div>
    {:else if erroRastreio}
      <div class="caixa-bloco erro" aria-live="polite">{erroRastreio}</div>
    {/if}
    {#if como === "parcial" && podeVoltar}
      {#if celular}
        {@render chips()}{@render campoBranco()}{@render volta()}
      {:else}
        <div class="par">{@render chips()}{@render campoBranco()}</div>
        {@render volta()}
      {/if}
    {:else}
      {@render chips()}
    {/if}
    {#if !celular}
      <div class="campo">
        <span class="rot">Recebido por</span>
        <span class="caixa auto"><Icone nome="cadeado" tam={15} traco={2} />{quemEntra} · Tesouraria Geral (quem está entrando)</span>
      </div>
    {/if}
    <label class="campo" class:apagado={!podeVoltar}>
      <span class="rot">Devolvido por</span>
      <span class="caixa">
        <select bind:value={quem} disabled={!podeVoltar} onchange={() => (falta = "")}>
          <option value="">{podeVoltar ? "Escolha quem trouxe o bloco" : "primeiro, a folha do bloco"}</option>
          {#if rastreio && podeVoltar}
            {#each rastreio.pessoas as p, i (i)}<option value={`p${i}`}>{rotuloDaPessoa(p, rastreio.bloco.congregacao?.nome ?? null)}</option>{/each}
            <option value="outra">Outra pessoa (escrever o nome)</option>
          {/if}
        </select>
        <span class="seta" aria-hidden="true">▾</span>
      </span>
    </label>
    {#if quem === "outra"}
      <label class="campo">
        <span class="rot">Nome de quem trouxe</span>
        <span class="caixa"><input type="text" autocomplete="off" maxlength="200" bind:value={outroNome} oninput={() => (falta = "")} /></span>
      </label>
    {/if}
    {#if falta}<p class="falta" role="alert">{falta}</p>{/if}
    <div class="fim">
      <button type="button" class="ouro" disabled={!podeVoltar || gravando} aria-busy={gravando} onclick={() => void registrar()}><Icone nome="check" tam={18} traco={2.2} />Registrar a entrada</button>
    </div>
    {#if celular}<span class="por">Recebido por {quemEntra} (quem está entrando).</span>{/if}
  </Quadro>
</div>

<style>
  .form-entrada { display: contents; --verm: #B91C1C; --caixa-erro: #FDE4E4; }
  :global(html[data-tema="escuro"]) .form-entrada { --verm: #FCA5A5; --caixa-erro: #3A1414; }
  .form-entrada :global(.quadro) { gap: 9px; }
  .form-entrada.cel :global(.quadro) { gap: 8px; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .fechar { width: 28px; height: 28px; margin: -4px -4px -4px 0; border: 0; background: transparent; color: var(--sv-suave); display: flex; align-items: center; justify-content: center; border-radius: 8px; flex: none; align-self: center; }

  /* os campos (as medidas da r17: a caixa de 38 + a borda) */
  .campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .obr { color: var(--verm); }
  .caixa {
    position: relative; min-height: 40px; border: 1px solid var(--sv-campo-borda); border-radius: 9px; background: var(--sv-campo); display: flex; align-items: center; gap: 8px;
    padding: 0 11px; font-size: 13.5px; color: var(--sv-texto); min-width: 0;
  }
  .caixa :global(svg) { color: var(--sv-suave); flex: none; }
  .caixa:focus-within { border-color: var(--sv-mod); }
  .caixa.auto { border-style: dashed; background: transparent; white-space: nowrap; overflow: hidden; }
  .caixa input, .caixa select {
    flex: 1; min-width: 0; height: 38px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--sv-texto); outline: none; padding: 0; margin: 0;
  }
  .caixa input::placeholder { color: var(--sv-suave); opacity: 1; }
  .caixa select { appearance: none; cursor: pointer; padding-right: 18px; text-overflow: ellipsis; }
  .caixa select:disabled { color: var(--sv-suave); cursor: default; }
  .caixa select option { color: var(--sv-texto); background: var(--sv-sup); }
  .caixa .seta { position: absolute; right: 12px; font-size: 11px; color: var(--sv-texto); pointer-events: none; }
  /* sem o bloco, a escolha apagada não tem a seta (o desenho: "primeiro, a folha do bloco") */
  .caixa:has(select:disabled) .seta { display: none; }
  /* width: auto contra a largura de 100% que a casca dá a todo campo de texto */
  .caixa input.encolhe { flex: 0 1 auto; width: auto; field-sizing: content; min-width: 2ch; }
  .pos { flex: none; margin-left: -4px; color: var(--sv-texto); white-space: nowrap; }
  .apagado { opacity: .5; }
  .par { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: end; }

  /* a caixa do bloco: verde-água (veio sozinho) ou vermelha (não pode voltar) */
  .caixa-bloco { padding: 10px 12px; border-radius: 11px; background: var(--sv-mod-fundo); font-size: 12.5px; line-height: 1.45; color: var(--sv-texto); }
  .caixa-bloco strong { color: var(--sv-titulo); }
  .caixa-bloco.erro { padding: 9px 12px; background: var(--caixa-erro); border: 1px solid var(--verm); }

  /* "A devolução": as duas escolhas (os botões de escolha das folhas, aprovados) */
  .escolhas { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button {
    height: 30px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sv-borda); background: transparent; display: flex; align-items: center;
    font-size: 13px; font-weight: 600; color: var(--sv-texto); white-space: nowrap; transition: background-color .15s ease;
  }
  .chips button.ativa { background: var(--sv-escolha); border-color: var(--sv-escolha); color: var(--sv-escolha-texto); }
  .chips button:disabled { cursor: default; }
  .volta { border-left: 3px solid var(--sv-ok); padding: 1px 0 1px 9px; font-size: 12.5px; line-height: 1.4; color: var(--sv-texto); }
  .volta strong { color: var(--sv-titulo); }

  .falta { font-size: 12.5px; font-weight: 600; color: var(--sv-atr); }
  .fim { display: flex; justify-content: flex-end; }
  .ouro {
    height: 38px; padding: 0 16px; border-radius: 10px; border: 0; background: #FFB800; color: #0A2342; display: inline-flex; align-items: center; gap: 8px;
    font-size: 14px; font-weight: 700; white-space: nowrap; transition: transform .12s ease, box-shadow .15s ease;
  }
  .cel .fim { display: block; }
  .cel .ouro { width: 100%; height: 44px; justify-content: center; }
  .ouro:active:not(:disabled) { transform: scale(.97); }
  /* sem o bloco, o botão apagado do desenho (cinza), não o dourado transparente */
  .ouro:disabled { background: var(--sv-linha); color: var(--sv-suave); cursor: default; }
  .ouro[aria-busy="true"]:disabled { background: #FFB800; color: #0A2342; opacity: .6; }
  @media (hover: hover) { .ouro:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }
  .por { font-size: 12px; line-height: 1.35; color: var(--sv-suave); }
</style>
