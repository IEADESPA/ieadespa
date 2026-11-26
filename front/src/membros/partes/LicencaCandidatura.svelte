<!-- A LICENÇA POR CANDIDATURA POLÍTICA dentro da ficha (Cargos e funções; era uma aba do perfil antigo — Regimento Art. 157 §2º): o obreiro candidato entra em
     licença 90 dias antes do pleito; o retorno é decisão da Diretoria (só a Secretaria Geral registra). Usa a rota que já existia (licencas-candidatura). -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Chip from "../../comum/Chip.svelte";

  interface Licenca { licencaId: number; dataPleito: string; dataInicioLicenca: string | null; status: string; dataRetornoDecidida: string | null; observacaoRetorno: string | null }
  interface Props { membroId: number; podeEditar: boolean; geral: boolean; onmudou: () => void }
  let { membroId, podeEditar, geral, onmudou }: Props = $props();

  let lista = $state<Licenca[] | null>(null);
  let erro = $state("");
  async function ler() {
    erro = "";
    const r = await pedir<Licenca[]>("/licencas-candidatura" + qs({ membroId }));
    if (r.ok) lista = Array.isArray(r.dados) ? r.dados : [];
    else if (!r.cancelado) erro = r.mensagem;
  }
  $effect(() => { void membroId; void ler(); });
  const aberta = $derived((lista ?? []).find((l) => l.status === "EM_LICENCA") ?? null);

  let novo = $state(false);
  let dataPleito = $state("");
  let enviando = $state(false);
  async function registrar() {
    if (enviando || !dataPleito) return;
    if (!window.confirm("Registrar a licença? A pessoa sai das funções, dos assentos e da liderança até a Diretoria decidir o retorno.")) return;
    enviando = true;
    const r = await pedir<{ mensagem: string }>("/licencas-candidatura", { metodo: "POST", corpo: { membroId, dataPleito } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem.replace(/^✅\s*/, ""), "sucesso");
    novo = false; dataPleito = "";
    void ler();
    onmudou();
  }
  let obs = $state("");
  async function retorno(retornou: boolean) {
    if (enviando || !aberta) return;
    enviando = true;
    const r = await pedir<{ mensagem: string }>(`/licencas-candidatura/${aberta.licencaId}`, { metodo: "POST", corpo: { retornou, observacao: obs.trim() || undefined } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(retornou ? "Retorno registrado." : "Registrado: não retornou.", "sucesso");
    obs = "";
    void ler();
    onmudou();
  }
  const ROT: Record<string, string> = { EM_LICENCA: "em licença", RETORNOU: "retornou", NAO_RETORNOU: "não retornou" };
</script>

{#if erro}<Estado tipo="erro" texto={erro} ontentar={ler} />
{:else if lista === null}<Estado tipo="carregando" linhas={2} />
{:else}
  {#if lista.length}
    <ul class="lic">
      {#each lista as l (l.licencaId)}
        <li><span><strong>Pleito em {dataBr(l.dataPleito)}</strong><small>{l.dataInicioLicenca ? `licença desde ${dataBr(l.dataInicioLicenca)}` : ""}{l.dataRetornoDecidida ? ` · decidido em ${dataBr(l.dataRetornoDecidida)}` : ""}{l.observacaoRetorno ? ` · ${l.observacaoRetorno}` : ""}</small></span>
          <Chip tom={l.status === "EM_LICENCA" ? "pendente" : l.status === "RETORNOU" ? "ok" : "neutro"}>{ROT[l.status] ?? l.status}</Chip></li>
      {/each}
    </ul>
  {:else}<p class="nada">Nenhuma licença por candidatura.</p>{/if}
  {#if aberta && geral}
    <div class="form">
      <label class="campo"><span>A Diretoria decidiu o retorno (observação opcional)</span><input type="text" maxlength="300" bind:value={obs} /></label>
      <div class="botoes"><Botao tipo="linha" ocupado={enviando} onclick={() => retorno(false)}>Não retornou</Botao><Botao tipo="ouro" icone="check" ocupado={enviando} onclick={() => retorno(true)}>Retornou</Botao></div>
    </div>
  {:else if aberta}<p class="nada">O retorno é decisão da Diretoria: a Secretaria Geral registra.</p>
  {:else if podeEditar}
    {#if novo}
      <div class="form">
        <label class="campo"><span>Data do pleito (a licença começa 90 dias antes)</span><input type="date" bind:value={dataPleito} /></label>
        <div class="botoes"><Botao tipo="texto" onclick={() => (novo = false)}>Cancelar</Botao><Botao tipo="ouro" ocupado={enviando} desligado={!dataPleito} onclick={registrar}>Registrar a licença</Botao></div>
      </div>
    {:else}<Botao tipo="linha" icone="mais" onclick={() => (novo = true)}>Licença por candidatura</Botao>{/if}
  {/if}
{/if}

<style>
  .lic { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .lic li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .lic span { display: flex; flex-direction: column; }
  .lic strong { color: var(--sv-titulo); }
  .lic small { color: var(--sv-suave); font-size: 13px; }
  .nada { margin: 0 0 8px; font-size: 13.5px; color: var(--sv-suave); }
  .form { display: flex; flex-direction: column; gap: 8px; }
  .campo { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--sv-suave); }
  .campo input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 14.5px; color: var(--sv-texto); }
  .botoes { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
