<!-- O aviso amarelo do arrolamento (r27): todo importado entra com a pendência "completar o arrolamento" e sem voto até completar.
     No notebook vem a segunda frase (o que não vem do sistema pago). -->
<script lang="ts">
  import Icone from "../../comum/Icone.svelte";

  interface Props { celular: boolean; forte: string }
  let { celular, forte }: Props = $props();
</script>

<div class="arrol" class:celular role="note">
  <Icone nome="alerta" tam={18} traco={2} />
  <p><strong>{forte}</strong>{#if !celular}{" "}A situação, o cargo e como a pessoa entrou não vêm do sistema pago: cada secretaria completa no dia a dia.{/if}</p>
</div>

<style>
  .arrol { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 12px; background: var(--sv-alerta-fundo); border: 1px solid var(--sv-alerta-borda); flex: none; color: var(--sv-alerta-icone); }
  p { flex: 1; min-width: 0; font-size: 13px; color: var(--sv-texto); line-height: 1.4; }
  strong { color: var(--sv-titulo); }
  .celular { padding: 8px 10px; }
  .celular p { font-size: 12.5px; }
</style>
