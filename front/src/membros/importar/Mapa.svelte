<!-- O mapa das colunas (r27): cada coluna da planilha vai para um campo da ficha. As 11 colunas de sempre já vêm ligadas; a coluna "a mais"
     (fora das de sempre) fica em amarelo para a Geral escolher o campo, ou "não usar". No celular, só as 3 primeiras e as a mais
     ("+ N colunas já ligadas sozinhas"). -->
<script lang="ts">
  import Icone from "../../comum/Icone.svelte";
  import type { CampoColuna, ColunaArquivo } from "./importar";

  interface Props {
    lista: readonly ColunaArquivo[];
    campos: readonly CampoColuna[];
    /** a coluna a mais (amarela), fixa desde a leitura do arquivo */
    extras: readonly boolean[];
    escolha: (string | null)[];
    celular: boolean;
    desligado?: boolean;
  }
  let { lista, campos, extras, escolha = $bindable(), celular, desligado = false }: Props = $props();

  // o que o sistema faz com a coluna (as regras do importador: o prefixo "IEADESPA - " sai; ".: NAO INFORMADO :." fica vazio)
  function faz(i: number): { texto: string; extra: boolean } {
    const c = escolha[i] ?? null;
    if (extras[i]) return { texto: c ? "a mais: vai para a ficha" : "a mais: fica de fora", extra: true };
    if (!c) return { texto: "fica de fora", extra: false };
    if (c === "igreja") return { texto: "“IEADESPA - Nome” → Nome", extra: false };
    if (c === "estadoCivil") return { texto: "“NAO INFORMADO” fica vazio", extra: false };
    if (c === "cpf") return { texto: "aparece mascarado", extra: false };
    return { texto: "", extra: false };
  }
  const visiveis = $derived(lista.filter((_, i) => !celular || i < 3 || extras[i]));
  const escondidas = $derived(lista.length - visiveis.length);
  const valor = (i: number): string => escolha[i] ?? "";
  function trocar(i: number, v: string) { escolha[i] = v || null; }
</script>

{#snippet seletor(col: ColunaArquivo)}
  <span class="sel" class:extra={extras[col.indice]} class:nao={!escolha[col.indice]}>
    <select value={valor(col.indice)} disabled={desligado} aria-label="Campo da ficha para a coluna {col.coluna}"
      onchange={(e) => trocar(col.indice, (e.currentTarget as HTMLSelectElement).value)}>
      <option value="">Não usar</option>
      {#each campos as c (c.campo)}<option value={c.campo}>{c.rotulo}</option>{/each}
    </select>
    <Icone nome="setaBaixo" tam={13} traco={2.2} />
  </span>
{/snippet}

{#if celular}
  <div class="cel">
    {#each visiveis as col (col.indice)}
      <div class="lin-cel">
        <span class="mono">{col.coluna}</span>
        <span class="seta"><Icone nome="seta" tam={14} traco={2.2} /></span>
        {@render seletor(col)}
      </div>
    {/each}
  </div>
  {#if escondidas > 0}<p class="mais">+ {escondidas} {escondidas === 1 ? "coluna já ligada sozinha" : "colunas já ligadas sozinhas"}</p>{/if}
{:else}
  <div class="tab" role="table" aria-label="O mapa das colunas">
    <div class="cab" role="row"><span role="columnheader">Coluna da planilha</span><span aria-hidden="true"></span><span role="columnheader">Campo da ficha</span><span role="columnheader">O que o sistema faz</span></div>
    {#each lista as col (col.indice)}
      {@const f = faz(col.indice)}
      <div class="lin" role="row">
        <span class="mono" role="cell" title={col.coluna}>{col.coluna}</span>
        <span class="seta" aria-hidden="true"><Icone nome="seta" tam={14} traco={2.2} /></span>
        <span role="cell" class="cel-sel">{@render seletor(col)}</span>
        <span class="faz" class:extra={f.extra} role="cell">{f.texto}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .cab, .lin { display: grid; grid-template-columns: 124px 14px 168px minmax(0, 1fr); gap: 10px; padding: 0 14px; align-items: center; }
  .cab { height: 30px; font-size: 12px; font-weight: 700; color: var(--sv-suave); background: var(--sv-fundo); }
  .lin { min-height: 32px; border-top: 1px solid var(--sv-linha); font-size: 12.5px; color: var(--sv-texto); }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .seta { color: var(--sv-suave); display: flex; }
  .cel-sel { min-width: 0; display: flex; }
  .sel { position: relative; height: 28px; border: 1px solid var(--sv-campo-borda); border-radius: 7px; background: var(--sv-campo); display: flex; align-items: center; min-width: 0; flex: 1; color: var(--sv-suave); }
  .sel.extra { border-color: var(--sv-ouro); box-shadow: 0 0 0 1px var(--sv-ouro); }
  .sel select { appearance: none; -webkit-appearance: none; border: 0; background: transparent; height: 100%; width: 100%; padding: 0 26px 0 8px; font: inherit; font-size: 12.5px; color: var(--sv-texto); cursor: pointer; min-width: 0; text-overflow: ellipsis; }
  .sel.nao select { color: var(--sv-suave); }
  .sel select:disabled { cursor: default; }
  .sel :global(svg) { position: absolute; right: 8px; pointer-events: none; }
  .sel:focus-within { outline: 3px solid var(--sv-ouro); outline-offset: 2px; }
  .sel select:focus-visible { outline: none; }
  .sel option { color: var(--sv-texto); background: var(--sv-sup); }
  .faz { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sv-suave); }
  .faz.extra { color: var(--imp-ouro-texto); font-weight: 600; }
  .cel { display: flex; flex-direction: column; }
  .lin-cel { display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr); gap: 6px; align-items: center; min-height: 36px; }
  .lin-cel + .lin-cel { border-top: 1px solid var(--sv-linha); }
  .mais { font-size: 12px; color: var(--sv-suave); }
</style>
