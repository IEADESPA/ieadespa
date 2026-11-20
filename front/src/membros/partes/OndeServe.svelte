<!-- "Onde serve" na ficha 360 (Ministérios e EBD): os ministérios em que a pessoa serve (migração 181), registrar e "deixou de servir" (nada se apaga: o
     encerrado fica embaixo, para a história). O catálogo é o dos departamentos que não são departamento (a faixa de idade fica à parte). -->
<script lang="ts">
  import { pedir, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Chip from "../../comum/Chip.svelte";
  import { departamentos, ehDepartamento } from "../estado.svelte";
  import type { Departamento } from "../tipos";

  interface Ministerio { id: number; departamentoId: number; nome: string; desde: string | null; encerradoEm: string | null; ativo: boolean }
  interface Props { membroId: number; podeEditar: boolean }
  let { membroId, podeEditar }: Props = $props();

  let lista = $state<Ministerio[] | null>(null);
  let erro = $state("");
  let catalogo = $state<readonly Departamento[]>([]);
  void departamentos().then((d) => (catalogo = d.filter((x) => !ehDepartamento(x))));
  let seq = 0;
  async function ler() {
    const meu = ++seq;
    erro = "";
    const r = await pedir<{ ministerios: Ministerio[] }>(`/pessoas/${membroId}/ministerios`);
    if (meu !== seq) return;
    if (r.ok) lista = r.dados.ministerios;
    else if (!r.cancelado) erro = r.mensagem;
  }
  $effect(() => { void membroId; void ler(); });

  const ativos = $derived((lista ?? []).filter((x) => x.ativo));
  const antigos = $derived((lista ?? []).filter((x) => !x.ativo));
  const livres = $derived(catalogo.filter((d) => !ativos.some((a) => a.departamentoId === d.departamentoId)));
  let escolhido = $state<number | null>(null);
  let desde = $state("");
  let enviando = $state(false);
  async function registrar() {
    if (enviando || escolhido === null) return;
    enviando = true;
    const r = await pedir<{ mensagem: string }>(`/pessoas/${membroId}/ministerios`, { metodo: "POST", corpo: { departamentoId: escolhido, desde: desde || null } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    escolhido = null; desde = "";
    ponte().avisar(r.dados.mensagem, "sucesso");
    void ler();
  }
  async function encerrar(m: Ministerio) {
    if (enviando || !window.confirm(`Registrar que deixou de servir em ${m.nome}?`)) return;
    enviando = true;
    const r = await pedir<{ mensagem: string }>(`/pessoas/${membroId}/ministerios/encerrar`, { metodo: "POST", corpo: { id: m.id } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    void ler();
  }
  const hoje = new Date().toISOString().slice(0, 10);
</script>

{#if erro}<Estado tipo="erro" texto={erro} ontentar={ler} />
{:else if !lista}<Estado tipo="carregando" linhas={2} />
{:else}
  {#if ativos.length}
    <ul class="mins">
      {#each ativos as m (m.id)}
        <li><span><strong>{m.nome}</strong><small>{m.desde ? `desde ${dataBr(m.desde)}` : "desde quando não foi informado"}</small></span>
          {#if podeEditar}<Botao tipo="texto" tam="pequeno" ocupado={enviando} onclick={() => encerrar(m)}>Deixou de servir</Botao>{/if}</li>
      {/each}
    </ul>
  {:else}<Estado tipo="vazio" texto="Não serve em nenhum ministério registrado." />{/if}
  {#if antigos.length}
    <p class="ja">Já serviu: {#each antigos as m, i (m.id)}<Chip tom="neutro">{m.nome}</Chip>{i < antigos.length - 1 ? " " : ""}{/each}</p>
  {/if}
  {#if podeEditar}
    {#if livres.length}
      <div class="novo">
        <div class="qual"><Escolha rotulo="Escolha o ministério" estilo="campo" larga valor={escolhido} opcoes={livres.map((d) => ({ valor: d.departamentoId, rotulo: d.nome }))} onescolher={(v) => (escolhido = v)} /></div>
        <label class="data"><span>Desde (opcional)</span><input type="date" max={hoje} bind:value={desde} /></label>
        <Botao tipo="linha" icone="mais" desligado={escolhido === null} ocupado={enviando} onclick={registrar}>Registrar</Botao>
      </div>
    {:else if !catalogo.length}<p class="ja">Nenhum ministério no catálogo: a Secretaria Geral cadastra em Estrutura › Departamentos (com o tipo de ministério ou secretaria).</p>{/if}
  {/if}
{/if}

<style>
  .mins { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .mins li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .mins span { display: flex; flex-direction: column; }
  .mins strong { color: var(--sv-titulo); }
  .mins small { color: var(--sv-suave); font-size: 13px; }
  .ja { margin: 6px 0 0; color: var(--sv-suave); font-size: 13.5px; }
  .novo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; margin-top: 10px; border-top: 1px solid var(--sv-linha); padding-top: 10px; }
  .qual { grid-column: 1 / -1; min-width: 0; }
  .data { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--sv-suave); }
  .data input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 10px; padding: 8px; font: inherit; color: var(--sv-texto); }
  @media (max-width: 700px) { .novo { grid-template-columns: 1fr; } }
</style>
