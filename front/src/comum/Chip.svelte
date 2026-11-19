<!-- A etiqueta arredondada (situação, cargo, departamento): as cores do desenho por tom. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  import type { TomChip } from "./tipos";
  interface Props { tom?: TomChip; children: Snippet }
  let { tom = "neutro", children }: Props = $props();
</script>

<span class="chip {tom}">{@render children()}</span>

<style>
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 12px; white-space: nowrap; line-height: 1.35; }
  .ok { background: var(--sv-ok-fundo); color: var(--sv-ok); }
  .pendente { background: var(--sv-pend-fundo); color: var(--sv-pend); }
  .atrasado { background: var(--sv-atr-fundo); color: var(--sv-atr); }
  .info { background: var(--sv-mod-fundo); color: var(--sv-mod); }
  .neutro { background: var(--sv-linha); color: var(--sv-texto); }
  .ouro { background: var(--sv-ouro); color: #0A2342; }
</style>
