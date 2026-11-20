<!-- O botão-chip que abre uma lista curta para escolher (no lugar do <select> nativo, como no desenho): "Igreja toda ▾", "Departamento",
     "Recorte: batismo no Espírito Santo ▾". Com o valor escolhido e `limpavel`, o chip fica escuro com o ✕ para tirar o filtro. -->
<script lang="ts" generics="V extends string | number">
  import Icone from "./Icone.svelte";

  interface Opcao { readonly valor: V; readonly rotulo: string; readonly sub?: string }
  interface Props {
    rotulo: string;
    opcoes: readonly Opcao[];
    valor: V | null;
    onescolher: (v: V | null) => void;
    prefixo?: string;
    icone?: string;
    limpavel?: boolean;
    estilo?: "chip" | "campo" | "trava";
    desligado?: boolean;
    larga?: boolean;
  }
  let { rotulo, opcoes, valor, onescolher, prefixo = "", icone, limpavel = false, estilo = "chip", desligado = false, larga = false }: Props = $props();

  let aberta = $state(false);
  let raiz: HTMLDivElement | undefined = $state();
  let lista: HTMLUListElement | undefined = $state();
  const escolhida = $derived(opcoes.find((o) => o.valor === valor) ?? null);
  const texto = $derived(escolhida ? prefixo + escolhida.rotulo : rotulo);
  const ativa = $derived(limpavel && escolhida !== null);
  const idLista = `esc-${Math.random().toString(36).slice(2, 9)}`;

  function abrir() {
    if (desligado) return;
    aberta = !aberta;
    if (aberta) queueMicrotask(() => (lista?.querySelector<HTMLElement>("[aria-selected='true'], li button")?.focus()));
  }
  function escolher(v: V) { aberta = false; onescolher(v); }
  function limpar(ev: MouseEvent) { ev.stopPropagation(); onescolher(null); }
  function teclado(ev: KeyboardEvent) {
    if (ev.key === "Escape" && aberta) { aberta = false; ev.stopPropagation(); raiz?.querySelector<HTMLElement>("button")?.focus(); return; }
    if (!aberta || (ev.key !== "ArrowDown" && ev.key !== "ArrowUp")) return;
    ev.preventDefault();
    const itens = [...(lista?.querySelectorAll<HTMLElement>("li button") ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    const prox = itens[(i + (ev.key === "ArrowDown" ? 1 : itens.length - 1)) % itens.length];
    prox?.focus();
  }
  function fora(ev: PointerEvent) { if (aberta && raiz && !raiz.contains(ev.target as Node)) aberta = false; }
</script>

<svelte:document onpointerdown={fora} />

<div class="esc" class:larga bind:this={raiz} onkeydown={teclado} role="presentation">
  <button type="button" class="botao {estilo}" class:ativa disabled={desligado || estilo === "trava"} aria-haspopup="listbox" aria-expanded={aberta} aria-controls={idLista} onclick={abrir}>
    {#if icone}<Icone nome={icone} tam={18} />{/if}
    <span class="txt">{texto}</span>
    {#if !ativa && estilo !== "trava"}
      <span class="seta"><Icone nome="setaBaixo" tam={16} traco={2.2} /></span>
    {/if}
  </button>
  {#if ativa}
    <button type="button" class="x" aria-label="Tirar o filtro: {texto}" onclick={limpar}><Icone nome="fechar" tam={14} traco={2.4} /></button>
  {/if}
  {#if aberta}
    <ul class="lista" id={idLista} role="listbox" aria-label={rotulo} bind:this={lista}>
      {#if limpavel}
        <li><button type="button" role="option" aria-selected={valor === null} onclick={() => { aberta = false; onescolher(null); }}>{rotulo}: todos</button></li>
      {/if}
      {#each opcoes as o (o.valor)}
        <li><button type="button" role="option" aria-selected={o.valor === valor} onclick={() => escolher(o.valor)}>
          <span>{o.rotulo}</span>{#if o.sub}<small>{o.sub}</small>{/if}
          {#if o.valor === valor}<span class="ok"><Icone nome="check" tam={16} traco={2.4} /></span>{/if}
        </button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .esc { position: relative; display: inline-flex; min-width: 0; }
  .larga { display: flex; width: 100%; }
  .botao {
    display: inline-flex; align-items: center; gap: 8px; min-width: 0; cursor: pointer; white-space: nowrap; -webkit-tap-highlight-color: transparent;
    transition: background-color .15s ease, transform .12s ease;
  }
  .botao:active:not(:disabled) { transform: scale(.97); }
  .larga .botao { width: 100%; }
  .txt { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .chip { height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--sv-borda); background: var(--sv-sup); color: var(--sv-titulo); font-size: 13.5px; font-weight: 600; }
  .chip.ativa { background: var(--sv-escolha); color: var(--sv-escolha-texto); border-color: var(--sv-escolha); padding-right: 34px; }
  .x {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 14px; border: 0; padding: 0;
    background: transparent; color: var(--sv-escolha-texto); display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .campo, .trava { height: 46px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); color: var(--sv-titulo); font-size: 15px; font-weight: 500; }
  .larga .campo .txt, .larga .trava .txt { flex: 1; text-align: left; }
  .trava { cursor: default; opacity: 1; background: var(--sv-linha); }
  .seta { display: flex; color: inherit; opacity: .85; }
  .lista {
    position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; min-width: 220px; max-width: min(360px, 90vw); max-height: 320px; overflow-y: auto;
    margin: 0; padding: 6px; list-style: none; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px;
    box-shadow: 0 10px 30px rgba(10, 35, 66, .18);
  }
  .lista button {
    width: 100%; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 10px; border: 0; border-radius: 8px; background: transparent;
    text-align: left; cursor: pointer; font-size: 14px; color: var(--sv-texto);
  }
  .lista button small { color: var(--sv-suave); font-size: 12.5px; }
  .lista button[aria-selected="true"] { font-weight: 700; color: var(--sv-titulo); }
  .lista button:hover, .lista button:focus-visible { background: var(--sv-linha); outline: none; }
  .ok { margin-left: auto; color: var(--sv-link); display: flex; }
</style>
