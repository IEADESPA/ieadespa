<!-- A faixa do bloco no alto da planilha (r24-lancamento, opção 1): o bloco, os 50 quadradinhos com a cor de cada folha (o mês anterior, o "mês
     posterior", o mês da planilha, a próxima, as livres), a legenda que o servidor escreve, na ordem do papel, e o "Dia do lançamento" (hoje, ou
     outro dia do mês de agora ou do anterior, nunca depois de hoje). -->
<script lang="ts">
  import Icone from "../../../comum/Icone.svelte";
  import type { TiraBloco } from "../../tipos";
  import { diaComSemana, folhaTxt } from "../../lancamentos";

  interface Props {
    tira: TiraBloco | null;
    dia: string;
    hoje: string;
    /** o primeiro dia que ainda se lança (o 1º do mês anterior, ou do mês de agora depois de mandado o relatório) */
    minimo: string;
    desligado: boolean;
    ondia: (d: string) => void;
  }
  let { tira, dia, hoje, minimo, desligado, ondia }: Props = $props();
</script>

<section class="tira" aria-label="O bloco e o dia do lançamento">
  {#if tira}
    <Icone nome="livro" tam={18} traco={2} />
    <div class="bloco"><strong>Bloco {folhaTxt(tira.numero)}</strong><span>{folhaTxt(tira.primeiraFolha)} a {folhaTxt(tira.ultimaFolha)}</span></div>
    <div class="faixa">
      <span class="quadros" aria-hidden="true">{#each tira.posicoes as e, i (i)}<span class="q {e}"></span>{/each}</span>
      <div class="legenda">{#each tira.legenda as l (l.estado)}<span><span class="q {l.estado}"></span>{l.texto}</span>{/each}</div>
    </div>
  {/if}
  <span class="esp"></span>
  <label class="dia">
    <span class="rot">Dia do lançamento</span>
    <span class="caixa" class:desligado>
      <Icone nome="calendario" tam={15} traco={2} />{diaComSemana(dia)}{#if dia === hoje}<span class="hoje">hoje</span>{/if}
      <input type="date" value={dia} min={minimo} max={hoje} disabled={desligado} aria-label="Dia do lançamento"
        onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) ondia(v); }} />
    </span>
  </label>
</section>

<style>
  .tira { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 8px 14px; display: flex; align-items: center; gap: 14px; color: var(--sv-icone); }
  .bloco { display: flex; flex-direction: column; gap: 1px; flex: none; }
  .bloco strong { font-size: 13.5px; color: var(--sv-titulo); }
  .bloco span { font-size: 12px; color: var(--sv-suave); }
  .faixa { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .quadros { display: flex; gap: 2px; }
  .quadros .q { width: 9px; height: 16px; border-radius: 2px; flex: none; }
  .legenda { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--sv-texto); }
  .legenda > span { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
  .legenda .q { width: 10px; height: 10px; border-radius: 2px; }
  /* as cores do desenho: o mês anterior (verde-claro), o "mês posterior" (azul), o mês da planilha (a cor do módulo), a próxima (ouro) */
  .q.antes { background: #A7D8CF; }
  .q.posterior { background: #1D4ED8; }
  .q.mes { background: var(--fin-forte); }
  .q.depois { background: #C9DAFB; }
  .q.proxima { background: #FFB800; }
  .q.livre { background: transparent; box-shadow: inset 0 0 0 1px var(--sv-campo-borda); }
  :global(html[data-tema="escuro"]) .q.antes { background: #1F4D48; }
  :global(html[data-tema="escuro"]) .q.posterior { background: #93C5FD; }
  .esp { flex: 1; }
  .dia { display: flex; flex-direction: column; gap: 3px; flex: none; width: 206px; }
  .rot { font-size: 12px; font-weight: 600; color: var(--sv-titulo); }
  .caixa { position: relative; height: 34px; border: 1px solid var(--sv-campo-borda); border-radius: 9px; background: var(--sv-campo); display: flex; align-items: center; gap: 7px; padding: 0 10px; font-size: 13.5px; font-weight: 600; color: var(--sv-titulo); }
  .caixa :global(svg) { color: var(--sv-icone); }
  .caixa:focus-within { border-color: var(--sv-mod); box-shadow: 0 0 0 1px var(--sv-mod); }
  .caixa.desligado { opacity: 0.7; }
  .hoje { margin-left: auto; font-size: 11.5px; font-weight: 500; color: var(--sv-suave); }
  /* o campo de data do navegador fica por cima, invisível: o clique abre o calendário dele */
  .caixa input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .caixa input:disabled { cursor: default; }
</style>
