<!-- O histórico da folha (rodada 30, "r30-blocos-desfazer"): quem marcou, quem desfez, quando e por quê, na ordem; nada se apaga. A hora à
     esquerda ("12/11 09h40"), o nome com o papel entre parênteses e o que a pessoa escreveu entre aspas. Embaixo do cartão da folha marcada e do
     formulário da folha que já foi marcada e desfeita. -->
<script lang="ts">
  import { NOME_CURTO, horaDoHistorico, comPonto } from "../../blocos";
  import type { HistoricoFolha } from "../../tipos";

  interface Props { historico: HistoricoFolha; celular: boolean }
  let { historico, celular }: Props = $props();
</script>

<div class="historico" class:cel={celular}>
  <span class="tit">O histórico da folha</span>
  {#each historico.itens as x}
    <div class="item">
      <strong class="hora">{horaDoHistorico(x.quando)}</strong>
      {#if x.tipo === "marcou"}
        <span>{x.nome} ({x.papel}) marcou como <strong>{NOME_CURTO[x.destino ?? "livre"]}</strong>: “{comPonto(x.texto)}”</span>
      {:else}
        <span>{x.nome} ({x.papel}) desfez: “{comPonto(x.texto)}” Voltou a ficar livre.</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .historico { display: flex; flex-direction: column; gap: 3px; padding-top: 8px; border-top: 1px solid var(--sv-linha); min-width: 0; }
  .cel { padding-top: 6px; }
  .tit { font-size: 12px; font-weight: 700; color: var(--sv-suave); }
  .item { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.4; color: var(--sv-texto); }
  .item > span { min-width: 0; }
  .item strong { color: var(--sv-titulo); }
  .hora { flex: none; width: 92px; white-space: nowrap; }
  .cel .hora { width: 74px; }
</style>
