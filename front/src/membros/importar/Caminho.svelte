<!-- O caminho da importação (r27): os 4 passos. No notebook, 4 caixas lado a lado (a de agora em dourado); no celular, as bolinhas ligadas
     por um traço e "Passo X de 4: ...". A bola tem sempre o número: verde (feito), dourada (agora) ou só o contorno (depois).
     `voltar`: o passo feito que se pode abrir de novo (só o 1, enquanto nada foi gravado). -->
<script lang="ts">
  interface Props { agora: 1 | 2 | 3 | 4; celular: boolean; onvoltar?: (() => void) | null }
  let { agora, celular, onvoltar = null }: Props = $props();

  const PASSOS = [["Arquivo e colunas", "a planilha do sistema pago"], ["Os números", "antes de gravar nada"], ["Confirmar", "uma vez só"], ["O resultado", "e a trilha"]] as const;
  const estado = (i: number): "ok" | "agora" | "depois" => (i + 1 < agora ? "ok" : i + 1 === agora ? "agora" : "depois");
  const atual = $derived(PASSOS[agora - 1] ?? PASSOS[0]);
</script>

{#if celular}
  <div class="cel">
    <ol class="bolas" aria-hidden="true">
      {#each PASSOS as _, i (i)}
        {#if i}<li class="traco" class:feito={estado(i) !== "depois"}></li>{/if}
        <li class="bola p22 {estado(i)}">{i + 1}</li>
      {/each}
    </ol>
    <p class="onde"><strong>Passo {agora} de 4:</strong> {atual[0]} · {atual[1]}</p>
  </div>
{:else}
  <ol class="caixas" aria-label="Os passos da importação">
    {#each PASSOS as p, i (i)}
      {@const e = estado(i)}
      <li class="caixa {e}" aria-current={e === "agora" ? "step" : undefined}>
        {#if e === "ok" && i === 0 && onvoltar}
          <button type="button" class="abrir" onclick={onvoltar} aria-label="Voltar ao passo 1: {p[0]}">
            <span class="bola p22 ok">1</span><span class="txt"><span class="t">{p[0]}</span><span class="s">{p[1]}</span></span>
          </button>
        {:else}
          <span class="bola p22 {e}">{i + 1}</span><span class="txt"><span class="t">{p[0]}</span><span class="s">{p[1]}</span></span>
        {/if}
      </li>
    {/each}
  </ol>
{/if}

<style>
  .caixas { list-style: none; margin: 0; padding: 0; display: flex; align-items: stretch; gap: 6px; flex: none; }
  .caixa { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 6px 8px; border-radius: 12px; background: var(--sv-sup); border: 1px solid var(--sv-borda); }
  .caixa.agora { background: var(--imp-agora-fundo); border-color: var(--sv-ouro); }
  .abrir { all: unset; display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; cursor: pointer; border-radius: 8px; }
  .abrir:focus-visible { outline: 3px solid var(--sv-ouro); outline-offset: 2px; }
  @media (hover: hover) { .abrir:hover .t { text-decoration: underline; } }
  .txt { min-width: 0; line-height: 1.2; display: flex; flex-direction: column; }
  .t { font-size: 12.5px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s { font-size: 11.5px; color: var(--sv-suave); }
  .bola { flex: none; display: flex; align-items: center; justify-content: center; font-weight: 800; border-radius: 50%; }
  .p22 { width: 22px; height: 22px; font-size: 12px; }
  .bola.ok { background: var(--imp-verde); color: var(--imp-verde-texto); }
  .bola.agora { background: var(--sv-ouro); color: #0A2342; }
  .bola.depois { border: 1.5px solid var(--sv-campo-borda); color: var(--sv-suave); }
  .cel { display: flex; flex-direction: column; gap: 6px; flex: none; }
  .bolas { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 4px; }
  .traco { flex: 1; height: 2px; background: var(--sv-borda); }
  .traco.feito { background: var(--imp-verde); }
  .onde { font-size: 12.5px; color: var(--sv-texto); line-height: 1.35; }
  .onde strong { color: var(--sv-titulo); }
</style>
