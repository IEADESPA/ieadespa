<!-- As caixas de recado do desenho: "info" (azul, com o ?), "alerta" (amarela, com o triângulo), "ok" (verde, com o ✓) e "erro". -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icone from "./Icone.svelte";

  interface Props { tom?: "info" | "alerta" | "ok" | "erro"; children: Snippet; acao?: Snippet }
  let { tom = "info", children, acao }: Props = $props();
  const icone = $derived(tom === "info" ? "ajudaQ" : tom === "ok" ? "check" : tom === "alerta" ? "alerta" : "alerta");
</script>

<div class="aviso {tom}" role={tom === "erro" ? "alert" : "note"}>
  <span class="ic"><Icone nome={icone} tam={18} traco={2} /></span>
  <div class="texto">{@render children()}</div>
  {#if acao}<div class="acao">{@render acao()}</div>{/if}
</div>

<style>
  .aviso { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; border: 1px solid; font-size: 14px; line-height: 1.45; }
  .ic { display: flex; padding-top: 1px; }
  .texto { flex: 1; min-width: 0; color: var(--sv-texto); }
  .texto :global(strong) { color: var(--sv-titulo); }
  .acao { flex: none; align-self: center; }
  .info { background: var(--sv-info-fundo); border-color: var(--sv-info-borda); }
  .info .ic { color: var(--sv-link); }
  .alerta { background: var(--sv-alerta-fundo); border-color: var(--sv-alerta-borda); }
  .alerta .ic { color: var(--sv-alerta-icone); }
  .ok { background: var(--sv-ok-caixa); border-color: var(--sv-ok-borda); }
  .ok .ic { color: var(--sv-ok); }
  .erro { background: var(--sv-atr-fundo); border-color: var(--sv-atr); }
  .erro .ic { color: var(--sv-atr); }
</style>
