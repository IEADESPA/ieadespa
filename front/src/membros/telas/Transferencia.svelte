<!-- 8c. ACOMPANHAR UM PEDIDO (rodada 8, "acompanhar como entrega"): os passos (feito, esperando, concluído) e o que já aconteceu; quem pode decidir,
     decide aqui; quem pediu pode cancelar enquanto espera. -->
<script lang="ts">
  import { pedir, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr, haQuanto } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, lerContadores } from "../estado.svelte";
  import type { Transferencia as T } from "../tipos";

  interface Props { id: number; celular: boolean; onnome: (n: string) => void }
  let { id, celular, onnome }: Props = $props();

  let t = $state<T | null>(null);
  let erro = $state("");
  let motivo = $state("");
  let ocupado = $state(false);
  async function carregar() {
    erro = "";
    const r = await pedir<{ transferencia: T }>(`/transferencias/${id}`);
    if (!r.ok) { if (t) avisarFalha(r); else erro = r.mensagem; return; }
    t = r.dados.transferencia;
    onnome(t.pessoaNome);
  }
  void carregar();
  async function agir(acao: "aceitar" | "recusar" | "cancelar") {
    if (!t || ocupado) return;
    if (acao === "recusar" && !motivo.trim()) { ponte().avisar("Escreva o motivo da recusa.", "erro"); return; }
    ocupado = true;
    const r = await pedir<{ mensagem?: string }>(`/transferencias/${t.transferenciaId}/${acao}`, { metodo: "POST", corpo: acao === "recusar" ? { motivo: motivo.trim() } : {} });
    if (!r.ok) { ocupado = false; avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem ?? "Feito.", "sucesso");
    void lerContadores();
    await carregar();
    ocupado = false;
  }
  const passos = $derived.by(() => {
    if (!t) return [];
    const esperando = t.situacao === "PENDENTE";
    const fim = t.situacao === "CONCLUIDA" ? "Concluída" : t.situacao === "RECUSADA" ? "Recusada" : t.situacao === "CANCELADA" ? "Cancelada" : "Concluída";
    return [
      { titulo: "Pedido feito", sub: `${dataBr(t.pedidoEm)} · ${t.pedidoComo === "PROPRIO" ? "pela própria pessoa" : t.pedidoPorNome ?? "pela secretaria"}`, estado: "feito" as const },
      { titulo: `Esperando ${t.destinoNome}`, sub: esperando ? (t.diasParado ? `parado há ${t.diasParado} dias` : haQuanto(t.pedidoEm)) : "decidido", estado: esperando ? "agora" as const : "feito" as const },
      { titulo: fim, sub: t.situacao === "CANCELADA" ? `${dataBr(t.canceladoEm ?? null)} · o pedido foi cancelado` : t.decididoEm ? `${dataBr(t.decididoEm)}${t.motivoRecusa ? ` · ${t.motivoRecusa}` : ""}` : "a ficha muda de congregação", estado: esperando ? "depois" as const : t.situacao === "CONCLUIDA" ? "feito" as const : "parou" as const }
    ];
  });
</script>

<div class="acomp" class:celular>
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if !t}<Estado tipo="carregando" linhas={4} />
  {:else}
    {#if !celular}<Cabecalho titulo="Pedido de transferência" sub={t.regra === "ENTRE_AREAS" ? "Entre áreas: o destino (ou a Geral) aceita ou recusa" : "Na mesma área ou pela Geral: entra na hora"} />{/if}
    <section class="cartao">
      <div class="cab">
        <Avatar nome={t.pessoaNome} tam={48} />
        <div class="quem"><strong>{t.pessoaNome}</strong><small>{t.origemNome}{t.origemAreaNome ? ` (${t.origemAreaNome})` : ""} → {t.destinoNome}{t.destinoAreaNome ? ` (${t.destinoAreaNome})` : ""}</small></div>
        {#if t.situacao === "PENDENTE"}<Chip tom="pendente">Esperando {t.destinoNome}</Chip>{:else if t.situacao === "CONCLUIDA"}<Chip tom="ok">Concluída</Chip>{:else}<Chip tom="atrasado">{t.situacao === "RECUSADA" ? "Recusada" : "Cancelada"}</Chip>{/if}
      </div>
      <ol class="passos">
        {#each passos as p (p.titulo)}
          <li class={p.estado}><span class="bola">{#if p.estado === "feito"}<Icone nome="check" tam={15} traco={2.6} />{:else if p.estado === "parou"}<Icone nome="fechar" tam={14} traco={2.6} />{/if}</span><div><strong>{p.titulo}</strong><small>{p.sub}</small></div></li>
        {/each}
      </ol>
      {#if t.motivo}<p class="motivo-p">Motivo do pedido: {t.motivo}</p>{/if}
      {#if t.podeDecidir}
        <div class="acoes">
          <input class="motivo" placeholder="Motivo, se for recusar" aria-label="Motivo da recusa" bind:value={motivo} />
          <Botao tipo="linha" ocupado={ocupado} onclick={() => void agir("recusar")}>Recusar</Botao>
          <Botao tipo="ouro" icone="check" ocupado={ocupado} onclick={() => void agir("aceitar")}>Aceitar</Botao>
        </div>
      {:else if t.podeCancelar}
        <div class="acoes"><Botao tipo="perigo" ocupado={ocupado} onclick={() => void agir("cancelar")}>Cancelar o pedido</Botao></div>
      {/if}
    </section>
    <Aviso tom="info">Até o aceite, a pessoa continua na congregação de onde sai. Quando entra, o dízimo vai junto e a mudança aparece na linha do tempo da ficha.</Aviso>
    <div><Botao tipo="texto" onclick={() => ir({ tela: "ficha", id: t!.membroId, secao: "resumo" })}>Abrir a ficha de {t.pessoaNome}</Botao></div>
  {/if}
</div>

<style>
  .acomp { display: flex; flex-direction: column; gap: 14px; max-width: 900px; }
  .cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; }
  .cab { display: flex; align-items: center; gap: 12px; }
  .quem { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .quem strong { font-size: 19px; font-weight: 800; color: var(--sv-titulo); }
  .quem small { font-size: 13.5px; color: var(--sv-suave); }
  .passos { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; }
  .passos li { flex: 1; display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--sv-linha); min-width: 0; }
  .passos li.agora { background: var(--sv-ouro-tinta); box-shadow: inset 0 0 0 2px var(--sv-ouro); }
  .bola { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; border: 1.5px solid var(--sv-campo-borda); }
  .feito .bola { background: var(--sv-ok); border-color: var(--sv-ok); color: var(--sv-sup); }
  .agora .bola { background: var(--sv-ouro); border-color: var(--sv-ouro); }
  .parou .bola { background: var(--sv-atr); border-color: var(--sv-atr); color: var(--sv-sup); }
  .passos div { display: flex; flex-direction: column; min-width: 0; }
  .passos strong { font-size: 14.5px; color: var(--sv-titulo); }
  .passos small { font-size: 12.5px; color: var(--sv-suave); }
  .motivo-p { font-size: 14px; color: var(--sv-texto); }
  .acoes { display: flex; gap: 8px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
  .motivo { height: 44px; padding: 0 12px; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); color: var(--sv-titulo); font: inherit; min-width: 220px; flex: 1; max-width: 340px; }
  .celular .passos { flex-direction: column; }
</style>
