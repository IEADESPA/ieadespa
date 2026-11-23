<!-- O rodapé das listas em páginas (o "r17Pag" do desenho): o texto à esquerda ("1 a 5 de 412 registros") e, à direita, ‹ até 5 números ›.
     Só mostra as páginas que existem; a atual na cor do módulo. -->
<script lang="ts">
  interface Props { texto: string; pagina: number; paginas: number; onir: (n: number) => void }
  let { texto, pagina, paginas, onir }: Props = $props();

  // até 5 números de página em volta da atual
  const numeros = $derived.by(() => {
    const ini = Math.max(1, Math.min(pagina - 2, paginas - 4));
    return Array.from({ length: Math.min(5, paginas) }, (_, i) => ini + i);
  });
  const ir = (n: number) => { if (n >= 1 && n <= paginas && n !== pagina) onir(n); };
</script>

<div class="rodape">
  <span>{texto}</span>
  <nav class="paginas" aria-label="Páginas">
    <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onclick={() => ir(pagina - 1)}>‹</button>
    {#each numeros as n (n)}
      <button type="button" class:atual={n === pagina} aria-current={n === pagina ? "page" : undefined} onclick={() => ir(n)}>{n}</button>
    {/each}
    <button type="button" aria-label="Próxima página" disabled={pagina >= paginas} onclick={() => ir(pagina + 1)}>›</button>
  </nav>
</div>

<style>
  .rodape { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 12.5px; color: var(--sv-suave); }
  .rodape > span { white-space: nowrap; }
  .paginas { display: flex; gap: 5px; align-items: center; }
  /* o desenho não usa box-sizing: o número com borda mede 26 + 2 = 28 px; o da página atual, sem borda, 26 */
  .paginas button {
    min-width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--sv-borda); background: transparent; color: var(--sv-texto); font: inherit; font-size: 12.5px;
    display: flex; align-items: center; justify-content: center; padding: 0 4px; cursor: pointer; -webkit-tap-highlight-color: transparent;
  }
  .paginas button.atual { min-width: 26px; height: 26px; background: var(--fin-forte); border-color: var(--fin-forte); color: var(--fin-forte-texto); font-weight: 700; }
  .paginas button:disabled { cursor: default; opacity: .7; }
</style>
