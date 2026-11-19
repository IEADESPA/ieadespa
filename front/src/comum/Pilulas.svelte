<!-- No CELULAR, uma fileira só de pílulas no alto (o estilo aprovado na rodada 12): a escolhida dourada, as outras cinza, com o número
     quando há pendência. Se não couber, a fileira rola para o lado (nunca vira duas fileiras). -->
<script lang="ts" generics="K extends string">
  interface Item { readonly chave: K; readonly rotulo: string; readonly n?: number }
  interface Props { itens: readonly Item[]; ativa: K | null; onescolher: (k: K) => void; rotulo: string; cheias?: boolean }
  let { itens, ativa, onescolher, rotulo, cheias = true }: Props = $props();
</script>

<nav class="pilulas" class:cheias aria-label={rotulo}>
  {#each itens as it (it.chave)}
    <button type="button" class:ativa={it.chave === ativa} aria-current={it.chave === ativa ? "page" : undefined} onclick={() => onescolher(it.chave)}>
      {it.rotulo}{#if it.n}<span class="n">{it.n}</span>{/if}
    </button>
  {/each}
</nav>

<style>
  .pilulas {
    display: flex; gap: 6px; padding: 10px 12px; background: var(--sv-sup); border-bottom: 1px solid var(--sv-borda);
    overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain;
  }
  .pilulas::-webkit-scrollbar { display: none; }
  button {
    flex: none; height: 36px; padding: 0 14px; border-radius: 18px; border: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    font-size: 12.5px; font-weight: 600; white-space: nowrap; background: var(--sv-linha); color: var(--sv-texto); cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: background-color .15s ease, transform .12s ease;
  }
  .cheias button { flex: 1 1 auto; padding: 0 9px; min-width: 0; }
  button:active { transform: scale(.97); }
  .ativa { background: var(--sv-ouro); color: #0A2342; font-weight: 700; }
  .n { min-width: 17px; height: 17px; border-radius: 9px; background: var(--sv-ouro); color: #0A2342; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; }
  .ativa .n { background: #0A2342; color: #FFB800; }
</style>
