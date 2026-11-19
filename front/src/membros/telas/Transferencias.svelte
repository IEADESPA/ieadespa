<!-- 8b. A CAIXA DE TRANSFERÊNCIAS (rodada 8, "caixa de pedidos"): chegando, saindo e concluídos; quem aceita vê "Recusar" e "Aceitar" na linha. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { haQuanto, dataBr } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, lerContadores, cuidaDoCadastro, escopo, textoEscopo, type AbaTransferencias } from "../estado.svelte";
  import type { PaginaTransferencias, Transferencia } from "../tipos";

  interface Props { aba: AbaTransferencias; celular: boolean }
  let { aba, celular }: Props = $props();

  const caixas = $state<Record<AbaTransferencias, { itens: Transferencia[]; total: number; lido: boolean; erro: string }>>({
    chegando: { itens: [], total: 0, lido: false, erro: "" }, saindo: { itens: [], total: 0, lido: false, erro: "" }, concluidos: { itens: [], total: 0, lido: false, erro: "" }
  });
  let recusando = $state<number | null>(null);
  let motivo = $state("");
  let ocupado = $state<number | null>(null);

  async function ler(c: AbaTransferencias) {
    const r = await pedir<PaginaTransferencias>("/transferencias" + qs({ caixa: c, porPagina: 50 }));
    if (!r.ok) { caixas[c].erro = r.mensagem; return; }
    caixas[c] = { itens: [...r.dados.itens], total: r.dados.total, lido: true, erro: "" };
  }
  function lerTudo() { void ler("chegando"); void ler("saindo"); void ler("concluidos"); }
  lerTudo();

  async function decidir(t: Transferencia, acao: "aceitar" | "recusar") {
    if (acao === "recusar" && !motivo.trim()) { ponte().avisar("Escreva o motivo da recusa: a pessoa e a origem recebem.", "erro"); return; }
    if (ocupado !== null) return;   // uma decisão por vez
    ocupado = t.transferenciaId;
    const r = await pedir<{ mensagem?: string }>(`/transferencias/${t.transferenciaId}/${acao}`, { metodo: "POST", corpo: acao === "recusar" ? { motivo: motivo.trim() } : {} });
    if (!r.ok) { ocupado = null; avisarFalha(r); return; }
    ponte().avisar(acao === "aceitar" ? `${t.pessoaNome} agora é de ${t.destinoNome}.` : "Pedido recusado; a origem foi avisada.", "sucesso");
    recusando = null; motivo = "";
    await Promise.all([ler("chegando"), ler("saindo"), ler("concluidos")]);
    ocupado = null;   // os botões só voltam depois de a lista ser lida de novo
    void lerContadores();
  }
  const pedidoPor = (t: Transferencia) => t.pedidoComo === "PROPRIO" ? "pedido pelo próprio membro" : t.pedidoComo === "GERAL" ? "pedido pela Secretaria Geral" : `pedido pela secretaria de ${t.origemNome}`;
  const lado = (nome: string, area: string | null) => (area ? `${nome} (${area})` : nome);
  const lista = $derived(caixas[aba].itens);
  const entreAreas = $derived(lista.filter((t) => t.regra === "ENTRE_AREAS").length);
  const ABAS: readonly { chave: AbaTransferencias; rotulo: string }[] = [{ chave: "chegando", rotulo: "Chegando" }, { chave: "saindo", rotulo: "Saindo" }, { chave: "concluidos", rotulo: "Concluídos" }];
</script>

<div class="tr" class:celular>
  {#if !celular}
    <Cabecalho titulo="Transferências" sub={textoEscopo(escopo.resumo)}>
      {#snippet acoes()}{#if cuidaDoCadastro()}<Botao tipo="ouro" icone="mais" onclick={() => ir({ tela: "transferir", membroId: null })}>Pedir transferência</Botao>{/if}{/snippet}
    </Cabecalho>
  {:else if cuidaDoCadastro()}
    <Botao tipo="ouro" icone="mais" largo onclick={() => ir({ tela: "transferir", membroId: null })}>Pedir transferência</Botao>
  {/if}
  <div class="abas" role="tablist" aria-label="Caixas de transferência">
    {#each ABAS as a (a.chave)}
      <button type="button" role="tab" aria-selected={aba === a.chave} onclick={() => ir({ tela: "transferencias", aba: a.chave }, true)}>
        {a.rotulo}{#if a.chave !== "concluidos" && caixas[a.chave].lido} ({caixas[a.chave].total}){/if}
      </button>
    {/each}
  </div>
  {#if caixas[aba].erro}<Estado tipo="erro" texto={caixas[aba].erro} ontentar={() => { caixas[aba].erro = ""; void ler(aba); }} />
  {:else if !caixas[aba].lido}<div class="caixa pad"><Estado tipo="carregando" linhas={3} /></div>
  {:else if !lista.length}<div class="caixa pad"><Estado tipo="vazio" texto={aba === "chegando" ? "Nenhum pedido chegando." : aba === "saindo" ? "Nenhum pedido saindo." : "Nenhum pedido concluído ainda."} /></div>
  {:else}
    <ul class="caixa">
      {#each lista as t (t.transferenciaId)}
        <li class="linha">
          <button type="button" class="quem" onclick={() => ir({ tela: "transferencia", id: t.transferenciaId })}>
            <Avatar nome={t.pessoaNome} tam={36} />
            <span><strong>{t.pessoaNome}</strong><small class="sv-num">{t.membroId} · {pedidoPor(t)}</small></span>
          </button>
          <span class="rota">{lado(t.origemNome, t.origemAreaNome)} → {t.destinoNome}</span>
          <span class="quando">{aba === "concluidos" ? dataBr(t.decididoEm ?? t.canceladoEm ?? null) : haQuanto(t.pedidoEm)}</span>
          <div class="acoes">
            {#if t.podeDecidir}
              {#if recusando === t.transferenciaId}
                <input class="motivo" placeholder="Motivo da recusa" aria-label="Motivo da recusa" bind:value={motivo} />
                <Botao tipo="linha" ocupado={ocupado === t.transferenciaId} onclick={() => void decidir(t, "recusar")}>Recusar</Botao>
                <Botao tipo="texto" onclick={() => { recusando = null; motivo = ""; }}>Desistir</Botao>
              {:else}
                <Botao tipo="linha" desligado={ocupado !== null} onclick={() => { recusando = t.transferenciaId; motivo = ""; }}>Recusar</Botao>
                <Botao tipo="ouro" icone="check" ocupado={ocupado === t.transferenciaId} onclick={() => void decidir(t, "aceitar")}>Aceitar</Botao>
              {/if}
            {:else if t.situacao === "CONCLUIDA"}<Chip tom="ok">Concluída</Chip>
            {:else if t.situacao === "RECUSADA"}<Chip tom="atrasado">Recusada</Chip>
            {:else if t.situacao === "CANCELADA"}<Chip tom="neutro">Cancelada</Chip>
            {:else}<Chip tom="pendente">Esperando {t.destinoNome}</Chip>{/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if aba === "chegando" && entreAreas}
      <Aviso tom="info">{entreAreas === 1 ? "Este vem" : `Os ${entreAreas} vêm`} de <strong>outra área</strong>: {entreAreas === 1 ? "espera" : "esperam"} você aceitar ou recusar. Os da mesma área e os da Secretaria Geral entram sozinhos.</Aviso>
    {/if}
  {/if}
</div>

<style>
  .tr { display: flex; flex-direction: column; gap: 14px; }
  .abas { display: flex; gap: 22px; border-bottom: 1px solid var(--sv-borda); }
  .abas button { height: 40px; border: 0; background: transparent; cursor: pointer; font-size: 15px; font-weight: 600; color: var(--sv-suave); border-bottom: 3px solid transparent; padding: 0 2px; }
  .abas button[aria-selected="true"] { color: var(--sv-titulo); font-weight: 700; border-bottom-color: var(--sv-ouro); }
  .caixa { list-style: none; margin: 0; padding: 0; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .pad { padding: 14px 18px; }
  .linha { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.2fr) 110px auto; gap: 14px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--sv-linha); }
  .linha:first-child { border-top: 0; }
  .quem { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; cursor: pointer; min-width: 0; padding: 0; }
  .quem span { display: flex; flex-direction: column; min-width: 0; }
  .quem strong { font-size: 15px; color: var(--sv-titulo); }
  .quem small { font-size: 13px; color: var(--sv-suave); }
  .rota { font-size: 14.5px; color: var(--sv-texto); }
  .quando { font-size: 13.5px; color: var(--sv-suave); }
  .acoes { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  .motivo { height: 44px; padding: 0 12px; border: 1.5px solid var(--sv-ouro); border-radius: 10px; background: var(--sv-campo); color: var(--sv-titulo); font: inherit; min-width: 180px; }
  .celular .abas { gap: 14px; overflow-x: auto; }
  .celular .linha { grid-template-columns: 1fr; gap: 8px; padding: 12px 14px; }
  .celular .acoes { justify-content: flex-start; }
</style>
