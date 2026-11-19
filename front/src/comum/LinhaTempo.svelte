<!-- A LINHA DO TEMPO da vida na igreja: o mais recente primeiro, o círculo com o ícone de cada tipo (o mais novo em dourado) e o fio ligando. -->
<script lang="ts">
  import Icone from "./Icone.svelte";
  import { mesAnoBr, dataBr, anoDe } from "./formato";

  import type { ItemTempo } from "./tipos";
  interface Props { eventos: readonly ItemTempo[]; max?: number }
  let { eventos, max = 0 }: Props = $props();
  const mostrar = $derived(max > 0 ? eventos.slice(0, max) : eventos);

  const ICONE_TIPO: Record<string, string> = {
    CREDENCIAL_EMITIDA: "cartao", CREDENCIAL_ENCERRADA: "cartao", TRANSFERENCIA: "seta", CONSAGRACAO_CONCLUIDA: "escudo", CONSAGRACAO_PROTOCOLO: "escudo",
    CARGO_INICIO: "livro", CARGO_FIM: "livro", CASAMENTO: "pessoas", APRESENTACAO: "crianca", BATISMO_AGUAS: "igreja", BATISMO_INSCRICAO: "igreja",
    BATISMO_ESPIRITO_SANTO: "coracao", CONVERSAO: "coracao", ADMISSAO: "pessoas", RITO_RECEBIMENTO: "pessoas", READMISSAO: "pessoas",
    CARTA_TRANSITO: "envelope", LICENCA_INICIO: "doc", LICENCA_FIM: "doc", DISCIPLINA_ABERTURA: "balanca", DISCIPLINA_CONCLUSAO: "balanca",
    SAIDA: "saida", FALECIMENTO: "pomba", ABANDONO_NOTIFICACAO: "balanca", ABANDONO_HOMOLOGACAO: "balanca"
  };
  const ICONE_CATEGORIA: Record<string, string> = { CREDENCIAL: "cartao", CONGREGACAO: "seta", MINISTERIO: "livro", FAMILIA: "pessoas", ESPIRITUAL: "coracao", ENTRADA: "pessoas", SAIDA: "saida", DISCIPLINA: "balanca", CARTAS: "envelope", LICENCA: "doc" };
  const icone = (e: ItemTempo) => ICONE_TIPO[e.tipo] ?? ICONE_CATEGORIA[e.categoria] ?? "relogio";
  // a data como o desenho: dia certo -> dd/mm/aaaa nos marcos de um dia; mês/ano no resto; aproximada -> só o ano
  const quando = (e: ItemTempo) => {
    if (!e.data) return "";
    if (e.aproximada) return anoDe(e.data);
    return ["CASAMENTO", "BATISMO_ESPIRITO_SANTO", "BATISMO_AGUAS", "CONSAGRACAO_CONCLUIDA"].includes(e.tipo) ? dataBr(e.data) : mesAnoBr(e.data);
  };
</script>

<ol class="tempo">
  {#each mostrar as e, i (i)}
    <li class:primeiro={i === 0}>
      <span class="bola"><Icone nome={icone(e)} tam={14} traco={2} /></span>
      <div class="txt">
        <div class="tit"><strong>{e.titulo}</strong>{#if quando(e)}<span class="data">{quando(e)}</span>{/if}</div>
        {#if e.detalhe}<div class="det">{e.detalhe}</div>{/if}
      </div>
    </li>
  {/each}
</ol>

<style>
  .tempo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  li { display: flex; gap: 12px; position: relative; padding-bottom: 12px; }
  li:last-child { padding-bottom: 0; }
  li:not(:last-child)::before { content: ""; position: absolute; left: 13px; top: 28px; bottom: 0; width: 2px; background: var(--sv-linha); }
  .bola { width: 28px; height: 28px; border-radius: 50%; background: var(--sv-mod-fundo); color: var(--sv-mod); display: flex; align-items: center; justify-content: center; flex: none; position: relative; z-index: 1; }
  .primeiro .bola { background: var(--sv-ouro); color: #0A2342; }
  .txt { min-width: 0; padding-top: 3px; }
  .tit { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  strong { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .data { font-size: 13px; color: var(--sv-suave); font-variant-numeric: tabular-nums; }
  .det { font-size: 13px; color: var(--sv-suave); }
</style>
