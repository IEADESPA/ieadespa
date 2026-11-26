<!-- A folha lançada que a pessoa clicou na planilha: o quadro "A folha que você clicou" da r30 (a folha, como está e o que se faz), com o
     "Corrigir" da resposta 1 de 26/11/2026 (a regra da r27: a linha muda, o motivo é obrigatório e a trilha guarda o antes, o depois, o motivo,
     quem e quando; nada se apaga) e, embaixo, o histórico da linha. A correção alcança o tipo, a forma, o valor, a voluntária e quem deu; o dia
     e o "Referente a" não mudam. Ponto de encaixe: com a nota já conferida pelo Conselho (auditoria, 2ª leva), "Corrigir" vira "Pedir correção".
     Sem desenho próprio: usa as peças da r30 (o quadro, o campo do motivo, o histórico). -->
<script lang="ts">
  import { avisarFalha } from "../../../comum/api";
  import { dataBr } from "../../../comum/formato";
  import { ponte } from "../../../comum/ponte";
  import Icone from "../../../comum/Icone.svelte";
  import Quadro from "../../partes/Quadro.svelte";
  import type { FormaLancamento, HistoricoLancamento, LadoCorrecao, LinhaPlanilha, TipoLancamento } from "../../tipos";
  import { NOME_FORMA, NOME_TIPO, corrigirLinha, folhaTxt, horaCurta, nomeDoMes, quemDeu, reais, soValor, type Pessoa } from "../../lancamentos";
  import QuemDeu from "./QuemDeu.svelte";

  interface Props {
    celular: boolean;
    linha: LinhaPlanilha;
    historico: HistoricoLancamento | null;
    /** quem lança, no mês que ainda se lança: corrige */
    pode: boolean;
    oncorrigido: () => void;
  }
  let { celular, linha: l, historico, pode, oncorrigido }: Props = $props();

  let corrigindo = $state(false);
  let tipo = $state<TipoLancamento | null>(null);
  let forma = $state<FormaLancamento | null>(null);
  let valor = $state("");
  let voluntaria = $state("");
  let pessoa = $state<Pessoa>(null);
  let motivo = $state("");
  let falta = $state("");
  let gravando = $state(false);

  const resumo = $derived(`${quemDeu(l)} · ${l.tipo ? NOME_TIPO[l.tipo] : "—"} · ${l.forma ? NOME_FORMA[l.forma] : "—"} · R$ ${reais(l.valor)}${l.voluntaria ? ` + ${reais(l.voluntaria)}` : ""}`);

  function abrir(): void {
    tipo = l.tipo ?? null; forma = l.forma ?? null; valor = l.valor ? reais(l.valor) : ""; voluntaria = l.voluntaria ? reais(l.voluntaria) : "";
    pessoa = l.membroId && l.membro ? { membroId: l.membroId, nome: l.membro } : l.nome ? { digitado: l.nome } : null;
    motivo = ""; falta = ""; corrigindo = true;
  }

  async function salvar(): Promise<void> {
    if (gravando) return;
    if (!motivo.trim()) { falta = "Escreva o motivo da correção."; return; }
    falta = "";
    gravando = true;
    const p = pessoa;
    const r = await corrigirLinha({
      folha: l.folha, motivo: motivo.trim(),
      ...(tipo ? { tipo } : {}), ...(forma ? { forma } : {}), ...(valor.trim() ? { valor: valor.trim() } : {}),
      ...(tipo === "DIZIMO" && voluntaria.trim() ? { voluntaria: voluntaria.trim() } : {}),
      ...(p ? { pessoa: "membroId" in p ? { membroId: p.membroId } : { nome: p.digitado } } : {})
    });
    gravando = false;
    if (!r.ok) { if (r.status === 422) falta = r.mensagem; else avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    corrigindo = false;
    oncorrigido();
  }

  /** o que mudou numa correção, por extenso: "valor 320,00 → 350,00" */
  function mudou(a: LadoCorrecao, d: LadoCorrecao): string {
    const p: string[] = [];
    if (a.tipo !== d.tipo) p.push(`tipo ${a.tipo ? NOME_TIPO[a.tipo] : "—"} → ${d.tipo ? NOME_TIPO[d.tipo] : "—"}`);
    if (a.forma !== d.forma) p.push(`forma ${a.forma ? NOME_FORMA[a.forma] : "—"} → ${d.forma ? NOME_FORMA[d.forma] : "—"}`);
    if (a.valor !== d.valor) p.push(`valor ${reais(a.valor)} → ${reais(d.valor)}`);
    if (a.voluntaria !== d.voluntaria) p.push(`voluntária ${a.voluntaria ? reais(a.voluntaria) : "—"} → ${d.voluntaria ? reais(d.voluntaria) : "—"}`);
    if (a.membroId !== d.membroId || a.quem !== d.quem) p.push(`quem deu ${a.quem ?? "—"} → ${d.quem ?? "—"}`);
    return p.join("; ");
  }
</script>

<Quadro titulo={celular ? `Folha ${folhaTxt(l.folha)}` : "A folha que você clicou"} nota={pode ? "corrigir pede o motivo" : "só consulta"} {celular}>
  <div class="topo" class:cel={celular}>
    {#if !celular}
      <div class="campo"><span class="rot">Folha (bloco {folhaTxt(l.bloco)})</span><span class="auto"><Icone nome="livro" tam={15} traco={2} />{folhaTxt(l.folha)}</span></div>
    {/if}
    <div class="campo largo"><span class="rot">Lançada</span><span class="resumo">{resumo}</span></div>
    {#if pode && !corrigindo}
      <button type="button" class="linha-botao" onclick={abrir}><Icone nome="lapis" tam={17} traco={2} />Corrigir</button>
    {/if}
  </div>

  {#if corrigindo}
    <div class="form" class:cel={celular}>
      <label class="campo"><span class="rot">Tipo</span>
        <select bind:value={tipo} onchange={() => { if (tipo !== "DIZIMO") voluntaria = ""; }}>
          <option value="DIZIMO">Dízimo</option><option value="OFERTA_CULTO">Oferta de culto</option><option value="OFERTA_VOLUNTARIA">Oferta voluntária</option>
        </select></label>
      <label class="campo"><span class="rot">Forma</span>
        <select bind:value={forma}><option value="PIX">Pix</option><option value="ESPECIE">Espécie</option></select></label>
      <label class="campo"><span class="rot">Valor</span>
        <input value={valor} inputmode="decimal" autocomplete="off" oninput={(e) => { const el = e.currentTarget as HTMLInputElement; valor = soValor(el.value); el.value = valor; }} /></label>
      <label class="campo"><span class="rot">+ Voluntária</span>
        <input value={voluntaria} inputmode="decimal" autocomplete="off" disabled={tipo !== "DIZIMO"} placeholder="—"
          oninput={(e) => { const el = e.currentTarget as HTMLInputElement; voluntaria = soValor(el.value); el.value = voluntaria; }} /></label>
      <div class="campo quem"><span class="rot">Quem deu</span><QuemDeu {pessoa} folha={l.folha} onpessoa={(p) => (pessoa = p)} /></div>
      <label class="campo motivo"><span class="rot">Motivo da correção<span class="obrig">*</span>{#if !celular}&nbsp;<span class="nota-campo">· fica no histórico</span>{/if}</span>
        <input bind:value={motivo} maxlength="300" autocomplete="off" placeholder="por que o lançamento está errado" oninput={() => (falta = "")} /></label>
      <div class="botoes">
        <button type="button" class="texto" onclick={() => (corrigindo = false)}>Cancelar</button>
        <button type="button" class="ouro" disabled={gravando} aria-busy={gravando} onclick={() => void salvar()}><Icone nome="check" tam={16} traco={2.4} />Salvar a correção</button>
      </div>
    </div>
    {#if falta}<p class="falta" role="alert">{falta}</p>{/if}
  {/if}

  {#if historico}
    <div class="historico">
      <span class="tit">O histórico da linha</span>
      <div class="item"><strong class="hora">{horaCurta(historico.lancamento.registradoEm)}</strong>
        <span>{historico.lancamento.registradoPor ?? "—"}{historico.lancamento.pelaGeral ? " (pela Tesouraria Geral)" : ""} lançou no dia {dataBr(historico.lancamento.dia)}{historico.lancamento.referente === "MES_POSTERIOR" ? `, referente ao mês posterior (soma em ${nomeDoMes(historico.lancamento.mesSoma)})` : ""}.</span></div>
      {#if historico.lancamento.preenchidoEm}
        <div class="item"><strong class="hora">{horaCurta(historico.lancamento.preenchidoEm)}</strong><span>{historico.lancamento.preenchidoPor ?? "—"} escreveu o nome e o valor.</span></div>
      {/if}
      {#each historico.correcoes as c, i (i)}
        <div class="item"><strong class="hora">{horaCurta(c.em)}</strong><span>{c.por ?? "—"} corrigiu {mudou(c.antes, c.depois)}: “{c.motivo}”</span></div>
      {/each}
    </div>
  {/if}
</Quadro>

<style>
  button { font: inherit; cursor: pointer; }
  .topo { display: flex; gap: 12px; align-items: flex-end; }
  .campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .largo { flex: 1; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; }
  .obrig { color: var(--sv-atr); }
  .nota-campo { font-weight: 400; color: var(--sv-suave); }
  .auto { min-height: 40px; border-radius: 9px; border: 1px dashed var(--sv-campo-borda); display: flex; align-items: center; gap: 8px; padding: 0 11px; font-size: 13.5px; color: var(--sv-texto); white-space: nowrap; }
  .auto :global(svg) { color: var(--sv-suave); }
  .resumo { min-height: 40px; display: flex; align-items: center; font-size: 13.5px; color: var(--sv-texto); }
  .cel .resumo { min-height: 0; }
  .form { display: grid; grid-template-columns: 1.1fr .8fr .8fr .8fr 1.6fr; gap: 10px; align-items: end; }
  .form .motivo { grid-column: 1 / 4; }
  .form .botoes { grid-column: 4 / 6; display: flex; gap: 8px; justify-content: flex-end; }
  .form.cel { grid-template-columns: 1fr 1fr; }
  .form.cel .quem, .form.cel .motivo, .form.cel .botoes { grid-column: 1 / -1; }
  select, .form input { min-height: 40px; border-radius: 9px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); padding: 0 10px; font: inherit; font-size: 13.5px; color: var(--sv-titulo); width: 100%; }
  .form input:focus, select:focus { outline: none; border-color: var(--sv-mod); }
  .form input:disabled { opacity: .6; }
  .quem :global(.caixa) { height: 40px; border-width: 1px; border-radius: 9px; }
  .linha-botao, .ouro, .texto { height: 40px; padding: 0 14px; border-radius: 10px; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; }
  .linha-botao { border: 1px solid var(--sv-campo-borda); background: transparent; color: var(--sv-titulo); }
  .linha-botao :global(svg) { color: var(--sv-icone); }
  .ouro { border: 0; background: #FFB800; color: #0A2342; font-weight: 700; }
  .ouro:disabled { opacity: .6; cursor: default; }
  .texto { border: 0; background: transparent; color: var(--sv-link); }
  .falta { font-size: 13px; font-weight: 600; color: var(--sv-atr); }
  .historico { display: flex; flex-direction: column; gap: 3px; padding-top: 8px; border-top: 1px solid var(--sv-linha); }
  .tit { font-size: 12px; font-weight: 700; color: var(--sv-suave); }
  .item { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.4; color: var(--sv-texto); }
  .item > span { min-width: 0; }
  .hora { flex: none; width: 92px; white-space: nowrap; color: var(--sv-titulo); }
</style>
