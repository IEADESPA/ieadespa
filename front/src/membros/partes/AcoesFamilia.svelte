<!-- As ações da FAMÍLIA dentro da ficha 360 (as que eram as abas do perfil antigo): ligar um parente do cadastro (vínculo familiar) e registrar o casamento.
     Usam as rotas que já existiam (vinculos-familiares, casamentos), no escopo de quem edita; desligar e apagar pedem confirmação. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import BuscaPessoa from "./BuscaPessoa.svelte";

  // parte: "vinculo" (ligar um parente, no cartão dos parentes) ou "casamento" (no cartão do casamento)
  interface Props { membroId: number; podeEditar: boolean; parte: "vinculo" | "casamento"; onmudou: () => void }
  let { membroId, podeEditar, parte, onmudou }: Props = $props();

  // ---- vínculos ----
  let tipos = $state<{ tipoVinculoId: number; nome: string }[]>([]);
  void pedir<{ tipoVinculoId: number; nome: string; ativo?: boolean }[] | { itens: { tipoVinculoId: number; nome: string; ativo?: boolean }[] }>("/catalogos/tiposVinculoFamiliar").then((r) => {
    if (!r.ok) return;
    const lista = Array.isArray(r.dados) ? r.dados : r.dados.itens ?? [];
    tipos = lista.filter((t) => t.ativo !== false);
  });
  let parente = $state<{ membroId: number; nome: string } | null>(null);
  let tipoId = $state<number | null>(null);
  let enviando = $state(false);
  async function ligar() {
    if (enviando || !parente || tipoId === null) return;
    enviando = true;
    const r = await pedir<{ mensagem?: string }>("/vinculos-familiares", { metodo: "POST", corpo: { membroId, membroParenteId: parente.membroId, tipoVinculoId: tipoId } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(`${parente.nome} ligado(a) à ficha.`, "sucesso");
    parente = null; tipoId = null;
    onmudou();
  }

  // ---- casamentos ----
  interface Casamento { casamentoId: number; membroId: number; membroConjugeId: number | null; nomeMembroConjuge: string | null; nomeConjuge: string | null; celebrante: string | null;
    modalidade: string; dataCasamento: string; dataHabilitacaoCivil: string | null; registradoCartorio: boolean | null }
  let casamentos = $state<Casamento[] | null>(null);
  let erroCas = $state("");
  async function lerCasamentos() {
    erroCas = "";
    const r = await pedir<Casamento[]>("/casamentos" + qs({ membroId }));
    if (r.ok) casamentos = Array.isArray(r.dados) ? r.dados : [];
    else if (!r.cancelado) erroCas = r.mensagem;
  }
  $effect(() => { void membroId; if (parte === "casamento") void lerCasamentos(); });
  let novo = $state(false);
  let conjuge = $state<{ membroId: number; nome: string } | null>(null);
  let nomeConjuge = $state("");
  let modalidade = $state<"CIVIL_E_RELIGIOSO" | "SOMENTE_RELIGIOSO">("CIVIL_E_RELIGIOSO");
  let dataCasamento = $state("");
  let dataHabilitacao = $state("");
  let celebrante = $state("");
  async function registrarCasamento() {
    if (enviando || !dataCasamento || (!conjuge && nomeConjuge.trim().length < 3)) return;
    enviando = true;
    const corpo: Record<string, unknown> = { membroId, modalidade, dataCasamento, celebrante: celebrante.trim() || null, dataHabilitacaoCivil: dataHabilitacao || null };
    if (conjuge) corpo.membroConjugeId = conjuge.membroId; else corpo.nomeConjuge = nomeConjuge.trim();
    const r = await pedir<{ mensagem?: string }>("/casamentos", { metodo: "POST", corpo });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar("Casamento registrado.", "sucesso");
    novo = false; conjuge = null; nomeConjuge = ""; dataCasamento = ""; dataHabilitacao = ""; celebrante = "";
    void lerCasamentos();
    onmudou();
  }
  async function apagarCasamento(c: Casamento) {
    if (enviando || !window.confirm(`Apagar o registro do casamento de ${dataBr(c.dataCasamento)}? (Só se foi lançado errado.)`)) return;
    enviando = true;
    const r = await pedir<{ mensagem?: string }>(`/casamentos/${c.casamentoId}`, { metodo: "DELETE" });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar("Registro apagado.", "sucesso");
    void lerCasamentos();
    onmudou();
  }
  const hoje = new Date().toISOString().slice(0, 10);
</script>

{#if parte === "vinculo" && podeEditar}
  <div class="acao">
    <h4 class="sub">Ligar um parente do cadastro</h4>
    {#if parente}
      <p class="escolhido"><strong>{parente.nome}</strong> <span class="sv-num">({parente.membroId})</span> <button type="button" class="link" onclick={() => (parente = null)}>trocar</button></p>
      <Escolha rotulo="Qual é o vínculo" estilo="campo" larga valor={tipoId} opcoes={tipos.map((t) => ({ valor: t.tipoVinculoId, rotulo: t.nome }))} onescolher={(v) => (tipoId = v)} />
      <div class="botoes"><Botao tipo="texto" onclick={() => { parente = null; tipoId = null; }}>Cancelar</Botao><Botao tipo="linha" icone="mais" desligado={tipoId === null} ocupado={enviando} onclick={ligar}>Ligar à ficha</Botao></div>
    {:else}<BuscaPessoa rotulo="Procure o parente" excluir={membroId} onescolher={(p) => (parente = p)} />{/if}
  </div>
{/if}

{#if parte === "casamento"}
<div class="acao">
  <h4 class="sub">Casamentos registrados</h4>
  {#if erroCas}<Estado tipo="erro" texto={erroCas} ontentar={lerCasamentos} />
  {:else if casamentos === null}<Estado tipo="carregando" linhas={2} />
  {:else if !casamentos.length}<p class="nada">Nenhum casamento registrado.</p>
  {:else}
    <ul class="cas">
      {#each casamentos as c (c.casamentoId)}
        <li><span><strong>{c.nomeMembroConjuge ?? c.nomeConjuge ?? "cônjuge"}</strong><small>{dataBr(c.dataCasamento)} · {c.modalidade === "SOMENTE_RELIGIOSO" ? "só religioso" : "civil e religioso"}{c.celebrante ? ` · ${c.celebrante}` : ""}</small></span>
          {#if podeEditar}<Botao tipo="texto" tam="pequeno" ocupado={enviando} onclick={() => apagarCasamento(c)}>Apagar</Botao>{/if}</li>
      {/each}
    </ul>
  {/if}
  {#if podeEditar}
    {#if novo}
      <div class="form">
        {#if conjuge}<p class="escolhido">Cônjuge: <strong>{conjuge.nome}</strong> <button type="button" class="link" onclick={() => (conjuge = null)}>trocar</button></p>
        {:else}
          <BuscaPessoa rotulo="Cônjuge (se for do cadastro)" excluir={membroId} onescolher={(p) => (conjuge = p)} />
          <label class="campo"><span>ou o nome do cônjuge (de fora)</span><input type="text" maxlength="200" bind:value={nomeConjuge} /></label>
        {/if}
        <span class="rot">Modalidade</span>
        <Opcoes rotulo="Modalidade" valor={modalidade} onescolher={(v) => (modalidade = v)} opcoes={[{ valor: "CIVIL_E_RELIGIOSO", rotulo: "Civil e religioso" }, { valor: "SOMENTE_RELIGIOSO", rotulo: "Só religioso" }]} />
        <div class="duas">
          <label class="campo"><span>Data do casamento *</span><input type="date" max={hoje} bind:value={dataCasamento} /></label>
          <label class="campo"><span>Habilitação civil (opcional)</span><input type="date" max={hoje} bind:value={dataHabilitacao} /></label>
        </div>
        <label class="campo"><span>Quem celebrou (opcional)</span><input type="text" maxlength="200" bind:value={celebrante} /></label>
        <div class="botoes"><Botao tipo="texto" onclick={() => (novo = false)}>Cancelar</Botao><Botao tipo="ouro" icone="check" ocupado={enviando} desligado={!dataCasamento || (!conjuge && nomeConjuge.trim().length < 3)} onclick={registrarCasamento}>Registrar o casamento</Botao></div>
      </div>
    {:else}<Botao tipo="linha" icone="mais" onclick={() => (novo = true)}>Registrar casamento</Botao>{/if}
  {/if}
</div>
{/if}

<style>
  .acao { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--sv-linha); padding-top: 10px; margin-top: 6px; }
  .sub { margin: 0; font-size: 13px; color: var(--sv-suave); font-weight: 700; }
  .escolhido { margin: 0; font-size: 14px; }
  .link { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--sv-link); font-weight: 700; cursor: pointer; }
  .botoes { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .nada { margin: 0; font-size: 13.5px; color: var(--sv-suave); }
  .cas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .cas li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .cas span { display: flex; flex-direction: column; }
  .cas strong { color: var(--sv-titulo); }
  .cas small { color: var(--sv-suave); font-size: 13px; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .rot { font-size: 13px; color: var(--sv-suave); }
  .campo { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--sv-suave); }
  .campo input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 14.5px; color: var(--sv-texto); }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 700px) { .duas { grid-template-columns: 1fr; } }
</style>
