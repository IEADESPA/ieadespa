<!-- As ETAPAS em círculos ligados por linha (o cadastro, a trilha das sugestões): a feita com o ✓ verde, a atual dourada com o número, as próximas vazias. -->
<script lang="ts">
  import Icone from "./Icone.svelte";

  interface Props { passos: readonly string[]; atual: number; rotulo?: string; onir?: (i: number) => void }
  let { passos, atual, rotulo = "Etapas", onir }: Props = $props();
</script>

<ol class="etapas" aria-label={rotulo}>
  {#each passos as p, i (p)}
    {@const feita = i < atual}
    {@const agora = i === atual}
    <li class:feita class:agora aria-current={agora ? "step" : undefined}>
      {#if onir && feita}
        <button type="button" class="circ" aria-label="Voltar para {p}" onclick={() => onir(i)}><Icone nome="check" tam={16} traco={2.6} /></button>
      {:else}
        <span class="circ">{#if feita}<Icone nome="check" tam={16} traco={2.6} />{:else}{i + 1}{/if}</span>
      {/if}
      <span class="nome">{p}</span>
      {#if i < passos.length - 1}<span class="fio" aria-hidden="true"></span>{/if}
    </li>
  {/each}
</ol>

<style>
  .etapas { display: flex; align-items: center; gap: 0; margin: 0; padding: 0; list-style: none; }
  li { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  li:last-child { flex: none; }
  .circ {
    width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex: none;
    font-size: 13px; font-weight: 800; border: 1.5px solid var(--sv-campo-borda); color: var(--sv-suave); background: var(--sv-sup); padding: 0;
  }
  button.circ { cursor: pointer; }
  .feita .circ { background: var(--sv-ok); border-color: var(--sv-ok); color: var(--sv-sup); }
  .agora .circ { background: var(--sv-ouro); border-color: var(--sv-ouro); color: #0A2342; }
  .nome { font-size: 14px; color: var(--sv-texto); white-space: nowrap; }
  .agora .nome { font-weight: 700; color: var(--sv-titulo); }
  .fio { flex: 1; height: 2px; min-width: 16px; margin: 0 6px; background: var(--sv-borda); }
  .feita .fio { background: var(--sv-ok); }
  @media (max-width: 640px) {
    .nome { display: none; }
    .agora .nome { display: inline; }
  }
</style>
