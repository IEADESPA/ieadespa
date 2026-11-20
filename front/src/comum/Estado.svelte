<!-- Os três estados de uma parte da tela que espera o servidor (aprovados na rodada 7): carregando (o esqueleto), vazio e erro (com "tentar de novo"). -->
<script lang="ts">
  import Botao from "./Botao.svelte";
  import Icone from "./Icone.svelte";

  interface Props { tipo: "carregando" | "vazio" | "erro"; texto?: string; linhas?: number; ontentar?: () => void }
  let { tipo, texto = "", linhas = 3, ontentar }: Props = $props();
</script>

{#if tipo === "carregando"}
  <div class="esqueleto" aria-busy="true" aria-label="Carregando">
    {#each Array.from({ length: linhas }) as _, i (i)}<span style:width="{92 - i * 11}%"></span>{/each}
  </div>
{:else if tipo === "vazio"}
  <p class="vazio">{texto || "Nada por aqui."}</p>
{:else}
  <div class="erro" role="alert">
    <span class="ic"><Icone nome="alerta" tam={18} traco={2} /></span>
    <span>{texto || "Não deu para ler agora."}</span>
    {#if ontentar}<Botao tipo="texto" onclick={ontentar}>Tentar de novo</Botao>{/if}
  </div>
{/if}

<style>
  .esqueleto { display: flex; flex-direction: column; gap: 10px; padding: 6px 0; }
  .esqueleto span { height: 14px; border-radius: 7px; background: linear-gradient(90deg, var(--sv-linha), var(--sv-borda), var(--sv-linha)); background-size: 200% 100%; animation: brilho 1.4s ease-in-out infinite; }
  @keyframes brilho { from { background-position: 100% 0; } to { background-position: -100% 0; } }
  .vazio { color: var(--sv-suave); font-size: 14px; padding: 10px 0; }
  .erro { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--sv-atr); font-size: 14px; padding: 8px 0; }
  .ic { display: flex; }
</style>
