<!-- O MENU DO MÓDULO na barra da esquerda (rodada 9): grupos que abrem e fecham (o fechado mostra quantas funções tem), a função escolhida com
     o traço dourado. Com o menu recolhido (a casca põe .recolhido na barra), vira o TRILHO: um ícone por grupo, o do grupo atual em dourado. -->
<script lang="ts" generics="K extends string">
  import Icone from "./Icone.svelte";

  interface Item { readonly chave: K; readonly rotulo: string; readonly icone: string; readonly n?: number }
  interface Grupo { readonly nome: string; readonly icone: string; readonly itens: readonly Item[] }
  interface Props { grupos: readonly Grupo[]; ativo: K; onescolher: (k: K) => void; chaveGuardada: string; rotulo: string }
  let { grupos, ativo, onescolher, chaveGuardada, rotulo }: Props = $props();

  // os grupos fechados ficam guardados neste aparelho; o grupo da função escolhida sempre abre
  function lerFechados(): string[] {
    try { const l: unknown = JSON.parse(localStorage.getItem(chaveGuardada) ?? "null"); return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
  }
  let fechados = $state<string[]>(lerFechados());
  const grupoAtivo = $derived(grupos.find((g) => g.itens.some((i) => i.chave === ativo))?.nome ?? "");
  const aberto = (g: Grupo) => g.nome === grupoAtivo || !fechados.includes(g.nome);
  function alternar(g: Grupo) {
    fechados = aberto(g) ? [...fechados.filter((n) => n !== g.nome), g.nome] : fechados.filter((n) => n !== g.nome);
    try { localStorage.setItem(chaveGuardada, JSON.stringify(fechados)); } catch { /* vale só nesta visita */ }
  }
</script>

<nav class="menu-mod" aria-label={rotulo}>
  {#each grupos as g (g.nome)}
    {@const abre = aberto(g)}
    <div class="grupo">
      <button type="button" class="cab" aria-expanded={abre} onclick={() => alternar(g)}>
        <span class="seta"><Icone nome={abre ? "setaBaixo" : "seta"} tam={15} traco={2.4} /></span>
        <span class="nome">{g.nome}</span>
        {#if !abre}<span class="qtd">{g.itens.length}</span>{/if}
      </button>
      <!-- no trilho (menu recolhido): um ícone por grupo -->
      <button type="button" class="trilho" class:atual={g.nome === grupoAtivo} title={g.nome} aria-label={g.nome}
        onclick={() => { const primeiro = g.itens[0]; if (primeiro) onescolher(primeiro.chave); }}>
        <Icone nome={g.icone} tam={20} traco={2} />
      </button>
      {#if abre}
        <ul>
          {#each g.itens as it (it.chave)}
            <li>
              <button type="button" class="item" class:ativo={it.chave === ativo} aria-current={it.chave === ativo ? "page" : undefined} onclick={() => onescolher(it.chave)}>
                <span class="ic"><Icone nome={it.icone} tam={19} traco={it.chave === ativo ? 2 : 1.8} /></span>
                <span class="rot">{it.rotulo}</span>
                {#if it.n}<span class="n">{it.n}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .menu-mod { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
  .grupo { display: flex; flex-direction: column; }
  button { font: inherit; border: 0; background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .cab {
    display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; width: 100%; text-align: left; color: #FFFFFF;
    font-size: 12.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-radius: 8px;
  }
  .cab:hover { background: rgba(255, 255, 255, .06); }
  .seta { display: flex; color: var(--cor-menu-texto-suave, #C7D5F8); }
  .nome { flex: 1; min-width: 0; }
  .qtd { font-size: 11.5px; font-weight: 600; color: var(--cor-menu-texto-suave, #C7D5F8); letter-spacing: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .item {
    display: flex; align-items: center; gap: 12px; height: 40px; width: calc(100% - 14px); margin-left: 14px; padding: 0 14px; border-radius: 9px;
    color: #E6EEFB; font-size: 14.5px; text-align: left; border-left: 4px solid transparent; transition: background-color .15s ease;
  }
  .item:hover { background: rgba(255, 255, 255, .07); }
  .item .ic { display: flex; color: var(--cor-menu-texto-suave, #C7D5F8); }
  .item.ativo { background: var(--cor-menu-ativo, #26449A); border-left-color: #FFB800; padding-left: 10px; color: #FFFFFF; font-weight: 600; }
  .item.ativo .ic { color: #FFB800; }
  .rot { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { min-width: 20px; height: 20px; border-radius: 10px; padding: 0 6px; background: #FFB800; color: #0A2342; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .trilho { display: none; }
  .menu-mod :focus-visible { outline: 3px solid #FFB800; outline-offset: 1px; }
  /* o trilho: a casca recolheu o menu (notebook) */
  @media (min-width: 641px) {
    :global(.sidebar.recolhido) .menu-mod { align-items: center; gap: 6px; }
    :global(.sidebar.recolhido) .cab, :global(.sidebar.recolhido) ul { display: none; }
    :global(.sidebar.recolhido) .trilho {
      display: flex; width: 44px; height: 44px; border-radius: 10px; align-items: center; justify-content: center; color: var(--cor-menu-texto-suave, #C7D5F8);
    }
    :global(.sidebar.recolhido) .trilho:hover { background: rgba(255, 255, 255, .08); }
    :global(.sidebar.recolhido) .trilho.atual { color: #FFB800; background: rgba(255, 255, 255, .08); box-shadow: inset 3px 0 0 #FFB800; }
  }
</style>
