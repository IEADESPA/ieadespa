<!-- 9. A CAIXA DE SUGESTÕES (rodada 10, versão final, 4º passo): a trilha das 4 etapas no alto; cada sugestão com o antes riscado › o depois; "Aplicar"
     muda a ficha na hora; "Recusar" pede o motivo (o membro recebe); o que só a Geral muda aparece com o cadeado "encaminhada". -->
<script lang="ts">
  import { pedir } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Etapas from "../../comum/Etapas.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { escopo, lerContadores, ir } from "../estado.svelte";
  import { textoDoValor } from "../rotulos";
  import type { CampoSugestao, Sugestao } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const sessao = ponte().sessao();
  let lista = $state<Sugestao[] | null>(null);
  let erro = $state("");
  let recusando = $state<number | null>(null);
  let motivo = $state("");
  let ocupado = $state<number | null>(null);
  async function carregar() {
    erro = "";
    const r = await pedir<Sugestao[]>("/fila-aprovacoes");
    if (!r.ok) { erro = r.mensagem; return; }
    lista = Array.isArray(r.dados) ? r.dados : [];
  }
  void carregar();
  interface Linha { s: Sugestao; c: CampoSugestao }
  const linhas = $derived<Linha[]>((lista ?? []).flatMap((s) => s.campos.filter((c) => c.status === "PENDENTE").map((c) => ({ s, c }))));
  async function decidir(l: Linha, decisao: "APROVADO" | "REJEITADO") {
    if (decisao === "REJEITADO" && !motivo.trim()) { ponte().avisar("Escreva o motivo: o membro recebe a resposta.", "erro"); return; }
    ocupado = l.c.campoId;
    const r = await pedir<{ mensagem?: string }>(`/fila-aprovacoes/${l.s.solicitacaoId}/decidir`, { metodo: "POST", corpo: { decisoes: [{ campoId: l.c.campoId, decisao, ...(decisao === "REJEITADO" ? { motivo: motivo.trim() } : {}) }] } });
    ocupado = null;
    if (!r.ok) { ponte().avisar(r.mensagem, "erro"); if (r.status === 409) void carregar(); return; }
    ponte().avisar(decisao === "APROVADO" ? `${l.c.rotulo} de ${l.s.nome}: aplicado na ficha.` : "Recusada; o membro recebe o motivo.", "sucesso");
    recusando = null; motivo = "";
    void carregar();
    void lerContadores();
  }
  const congs = $derived(escopo.resumo?.congregacoes ?? []);
  const lugar = $derived(sessao.geral ? "Secretaria Geral" : congs.length === 1 && congs[0] ? `Secretaria de ${congs[0].nome}` : "Secretaria da área");
  const val = (l: Linha, v: string | null) => textoDoValor(l.c.nomeCampo, v);
</script>

<div class="sug" class:celular>
  {#if !celular}
    <Cabecalho titulo="Caixa de sugestões" sub="Quarto passo: {lugar} · aplicar muda a ficha na hora e fica registrado quem aplicou">
      {#snippet acoes()}{#if congs.length === 1 && congs[0]}<Escolha rotulo={congs[0].nome} icone="cadeado" estilo="trava" valor={null} opcoes={[]} onescolher={() => {}} />{/if}{/snippet}
    </Cabecalho>
  {:else}
    <h2 class="tit-cel">Caixa de sugestões</h2>
  {/if}
  <Etapas rotulo="O caminho da sugestão" passos={["O que posso mudar", "Mudo sozinho", "Sugiro o resto", "A secretaria confere"]} atual={3} />
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if lista === null}<div class="caixa pad"><Estado tipo="carregando" linhas={3} /></div>
  {:else if !linhas.length}<div class="caixa pad"><Estado tipo="vazio" texto="Nenhuma sugestão esperando a secretaria." /></div>
  {:else}
    <ul class="caixa">
      {#each linhas as l (l.c.campoId)}
        <li class="linha">
          <button type="button" class="quem" onclick={() => ir({ tela: "ficha", id: l.s.membroId, secao: "dados" })}>
            <Avatar nome={l.s.nome} tam={34} /><span><strong>{l.s.nome}</strong><small>{l.c.rotulo}</small></span>
          </button>
          <div class="mud">
            <div class="ad"><s>{val(l, l.c.valorAnterior) || "—"}</s><Icone nome="seta" tam={14} traco={2} /><strong>{val(l, l.c.valorProposto) || "—"}</strong></div>
          </div>
          <div class="acoes">
            {#if !l.c.podeAplicar}
              <span class="trava"><Icone nome="cadeado" tam={15} traco={2} />{l.c.motivoNaoAplica ?? "Só a Secretaria Geral muda"} · encaminhada</span>
              {#if l.c.podeRecusar}<Botao tipo="texto" onclick={() => { recusando = l.c.campoId; motivo = ""; }}>Recusar</Botao>{/if}
            {:else if recusando === l.c.campoId}
              <input class="motivo" placeholder="Motivo da recusa" aria-label="Motivo da recusa" bind:value={motivo} />
              <Botao tipo="linha" ocupado={ocupado === l.c.campoId} onclick={() => void decidir(l, "REJEITADO")}>Recusar</Botao>
              <Botao tipo="texto" onclick={() => (recusando = null)}>Desistir</Botao>
            {:else}
              <Botao tipo="linha" onclick={() => { recusando = l.c.campoId; motivo = ""; }}>Recusar</Botao>
              <Botao tipo="ouro" icone="check" ocupado={ocupado === l.c.campoId} onclick={() => void decidir(l, "APROVADO")}>Aplicar</Botao>
            {/if}
          </div>
          {#if recusando === l.c.campoId && !l.c.podeAplicar}
            <div class="recusa-geral"><input class="motivo" placeholder="Motivo da recusa" aria-label="Motivo da recusa" bind:value={motivo} /><Botao tipo="linha" ocupado={ocupado === l.c.campoId} onclick={() => void decidir(l, "REJEITADO")}>Recusar</Botao></div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <Aviso tom="info">Recusar avisa o membro com o motivo. O que só a Secretaria Geral muda (nome, CPF, nascimento, pai e mãe) segue para ela sozinho.</Aviso>
</div>

<style>
  .sug { display: flex; flex-direction: column; gap: 14px; }
  .tit-cel { font-size: 18px; font-weight: 800; color: var(--sv-titulo); }
  .caixa { list-style: none; margin: 0; padding: 0; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); overflow: hidden; }
  .pad { padding: 14px 18px; }
  .linha { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.9fr) auto; gap: 14px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--sv-linha); }
  .linha:first-child { border-top: 0; }
  .quem { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 0; min-width: 0; }
  .quem span { display: flex; flex-direction: column; min-width: 0; }
  .quem strong { font-size: 15px; color: var(--sv-titulo); }
  .quem small { font-size: 13px; color: var(--sv-suave); }
  .ad { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--sv-suave); }
  .ad s { font-size: 14px; }
  .ad strong { font-size: 15px; color: var(--sv-titulo); }
  .acoes { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  .trava { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--sv-suave); }
  .motivo { height: 44px; padding: 0 12px; border: 1.5px solid var(--sv-ouro); border-radius: 10px; background: var(--sv-campo); color: var(--sv-titulo); font: inherit; min-width: 180px; }
  .recusa-geral { grid-column: 1 / -1; display: flex; gap: 8px; justify-content: flex-end; }
  .celular .linha { grid-template-columns: 1fr; gap: 8px; padding: 12px 14px; }
  .celular .acoes { justify-content: flex-start; }
</style>
