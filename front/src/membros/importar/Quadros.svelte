<!-- Os quadros dos números (r27): 5 caixas lado a lado no notebook; no celular, 2 por linha com a primeira ocupando as duas.
     `sel`: a caixa marcada em azul (a do cartão aberto embaixo); -1 = nenhuma. -->
<script lang="ts">
  import { numero } from "../../comum/formato";
  import type { Quadro } from "./importar";

  interface Props { quadros: readonly Quadro[]; sel?: number; celular: boolean }
  let { quadros, sel = -1, celular }: Props = $props();
</script>

<ul class="quadros" class:celular>
  {#each quadros as q, i (q.rotulo)}
    <li class="q" class:sel={i === sel}>
      <span class="rot">{q.rotulo}</span>
      <strong class="n sv-num">{numero(q.n)}</strong>
      <span class="sub">{q.sub}</span>
    </li>
  {/each}
</ul>

<style>
  .quadros { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; flex: none; }
  .q { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 9px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .q.sel { background: var(--sv-mod-fundo); border-color: var(--sv-mod); box-shadow: 0 0 0 1px var(--sv-mod); }
  .rot, .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sv-suave); }
  .rot { font-size: 12px; }
  .sub { font-size: 11.5px; }
  .n { font-size: 22px; font-weight: 800; color: var(--sv-titulo); line-height: 1.2; }
  .celular { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .celular .q { padding: 6px 10px; }
  .celular .q:first-child { grid-column: span 2; }
  .celular .n { font-size: 18px; }
</style>
