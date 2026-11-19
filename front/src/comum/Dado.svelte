<!-- Uma linha "rótulo | valor" dos cartões da ficha (o valor em negrito; a nota e a ação à direita). -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props { rotulo: string; valor?: string | null; nota?: string; vazio?: string; children?: Snippet; acao?: Snippet; sub?: string }
  let { rotulo, valor = null, nota, vazio = "—", children, acao, sub }: Props = $props();
</script>

<div class="dado">
  <span class="rot">{rotulo}</span>
  <div class="val">
    {#if children}{@render children()}{:else}<strong class:nada={!valor}>{valor || vazio}</strong>{#if nota}<span class="nota">{nota}</span>{/if}{/if}
    {#if sub}<span class="sub">{sub}</span>{/if}
  </div>
  {#if acao}<div class="acao">{@render acao()}</div>{/if}
</div>

<style>
  .dado { display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 8px 0; border-top: 1px solid var(--sv-linha); }
  .rot { width: 140px; flex: none; font-size: 14px; color: var(--sv-suave); }
  .val { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  strong { font-size: 15px; font-weight: 700; color: var(--sv-titulo); overflow-wrap: anywhere; }
  .nada { font-weight: 500; color: var(--sv-suave); }
  .nota { font-size: 12.5px; color: var(--sv-suave); }
  .sub { font-size: 12.5px; color: var(--sv-suave); }
  .acao { flex: none; }
  @media (max-width: 640px) { .rot { width: 110px; font-size: 13.5px; } }
</style>
