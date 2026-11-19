<!-- A carteirinha de UMA pessoa, dentro da ficha (o botão "Carteirinha" do cabeçalho leva aqui): o modelo pelo tipo dela, as últimas impressões, a
     segunda via pedida e, se não puder imprimir, por quê. Daqui a secretaria imprime só a desta pessoa ou pede a segunda via. -->
<script lang="ts">
  import { pedir, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Chip from "../../comum/Chip.svelte";
  import type { CarteirinhaDaFicha, Material, RespostaImpressao } from "./tipos";

  interface Props { membroId: number }
  let { membroId }: Props = $props();

  let c = $state<CarteirinhaDaFicha | null>(null);
  let erro = $state("");
  let seq = 0;
  async function ler() {
    const meu = ++seq;
    erro = "";
    const r = await pedir<{ carteirinha: CarteirinhaDaFicha }>(`/carteirinhas/ficha/${membroId}`);
    if (meu !== seq) return;
    if (r.ok) c = r.dados.carteirinha;
    else if (!r.cancelado) erro = r.mensagem;
  }
  $effect(() => { void membroId; void ler(); });

  const MOTIVO: Record<string, string> = { NOVA: "nova", MUDOU: "mudou de tipo", SEGUNDA_VIA: "segunda via", REIMPRESSAO: "impressa de novo" };
  let modo = $state<"" | "imprimir" | "segunda">("");
  let material = $state<Material>("PVC");
  let frenteVerso = $state(true);
  let motivo = $state("");
  let enviando = $state(false);
  async function imprimir() {
    if (enviando) return;
    enviando = true;
    const r = await pedir<RespostaImpressao>("/carteirinhas/imprimir", { metodo: "POST", corpo: { membroIds: [membroId], material, frenteVerso } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    modo = "";
    const { imprimirCartoes } = await import("./imprimir");
    await imprimirCartoes({ cartoes: r.dados.cartoes, modelos: r.dados.modelos, material: r.dados.material, frenteVerso: r.dados.frenteVerso });
    ponte().avisar("Carteirinha registrada como impressa.", "sucesso");
    void ler();
  }
  async function segundaVia() {
    if (enviando) return;
    enviando = true;
    const r = await pedir<{ mensagem: string }>("/carteirinhas/segunda-via", { metodo: "POST", corpo: { membroId, motivo } });
    enviando = false;
    if (!r.ok) { avisarFalha(r); return; }
    modo = "";
    motivo = "";
    ponte().avisar(r.dados.mensagem, "sucesso");
    void ler();
  }
</script>

{#if erro}<Estado tipo="erro" texto={erro} ontentar={ler} />
{:else if !c}<Estado tipo="carregando" linhas={3} />
{:else}
  <div class="naficha">
    <div class="linha"><span>Modelo pelo tipo da pessoa</span><Chip tom="info">{c.tipoRotulo}</Chip></div>
    {#if c.impressoes.length}
      <ul class="imps">
        {#each c.impressoes as i, k (k)}<li><strong class="sv-num">{dataBr(i.em)}</strong><span>{i.material === "PVC" ? "PVC" : "papel"} · {MOTIVO[i.motivo] ?? i.motivo} · modelo {i.modelo}</span></li>{/each}
      </ul>
    {:else}<p class="nada">Ainda não tem carteirinha física impressa.</p>{/if}
    {#if c.pedido}<Aviso tom="info"><strong>Segunda via pedida</strong> em {dataBr(c.pedido.em)}: {c.pedido.motivo}. Está na lista para imprimir da congregação.</Aviso>{/if}
    {#if c.porQueNao}<Aviso tom="alerta">{c.porQueNao}</Aviso>{:else if c.precisaDeNova && !c.pedido}<Aviso tom="info">Precisa de uma carteirinha nova: já está na lista para imprimir.</Aviso>{/if}
    <p class="dig">A digital, com o mesmo QR, a pessoa vê em Minha vida › Minha carteirinha.</p>

    {#if modo === "imprimir"}
      <div class="form">
        <Opcoes rotulo="Material" valor={material} onescolher={(v) => (material = v)} opcoes={[{ valor: "PAPEL", rotulo: "Papel" }, { valor: "PVC", rotulo: "PVC" }]} />
        <Opcoes rotulo="Impressão" valor={frenteVerso ? "fv" : "f"} onescolher={(v) => (frenteVerso = v === "fv")} opcoes={[{ valor: "f", rotulo: "Só frente" }, { valor: "fv", rotulo: "Frente e verso" }]} />
        <div class="botoes"><Botao tipo="texto" onclick={() => (modo = "")}>Cancelar</Botao><Botao tipo="ouro" icone="check" ocupado={enviando} onclick={imprimir}>Imprimir a desta pessoa</Botao></div>
      </div>
    {:else if modo === "segunda"}
      <div class="form">
        <Campo rotulo="Por que a segunda via" valor={motivo} oninput={(v) => (motivo = v)} dica="ex.: perdeu, estragou" />
        <div class="botoes"><Botao tipo="texto" onclick={() => (modo = "")}>Cancelar</Botao><Botao tipo="ouro" ocupado={enviando} desligado={motivo.trim().length < 3} onclick={segundaVia}>Pedir a segunda via</Botao></div>
      </div>
    {:else}
      <div class="botoes esq">
        {#if c.podeImprimir}<Botao tipo="linha" icone="impressora" onclick={() => (modo = "imprimir")}>Imprimir agora</Botao>{/if}
        {#if c.podePedirSegundaVia}<Botao tipo="texto" onclick={() => (modo = "segunda")}>Pedir segunda via</Botao>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .naficha { display: flex; flex-direction: column; gap: 10px; }
  .linha { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--sv-suave); font-size: 14px; }
  .imps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .imps li { display: flex; gap: 10px; font-size: 14px; }
  .imps strong { color: var(--sv-titulo); min-width: 86px; }
  .imps span { color: var(--sv-suave); }
  .nada, .dig { margin: 0; color: var(--sv-suave); font-size: 13.5px; }
  .form { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--sv-linha); padding-top: 10px; }
  .botoes { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .botoes.esq { justify-content: flex-start; }
</style>
