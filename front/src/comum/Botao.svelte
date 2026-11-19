<!-- O botão das telas: "ouro" (a ação principal, dourado), "linha" (a secundária, com borda), "texto" (link) e "perigo". -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icone from "./Icone.svelte";

  interface Props {
    tipo?: "ouro" | "linha" | "texto" | "perigo";
    icone?: string;
    tam?: "normal" | "grande" | "pequeno";
    largo?: boolean;
    desligado?: boolean;
    ocupado?: boolean;
    rotulo?: string;
    onclick?: (ev: MouseEvent) => void;
    children?: Snippet;
  }
  let { tipo = "linha", icone, tam = "normal", largo = false, desligado = false, ocupado = false, rotulo, onclick, children }: Props = $props();
</script>

<button type="button" class="b {tipo} {tam}" class:largo disabled={desligado || ocupado} aria-busy={ocupado} aria-label={rotulo} {onclick}>
  {#if icone}<Icone nome={icone} tam={tam === "pequeno" ? 16 : 18} traco={2.2} />{/if}
  {#if children}{@render children()}{/if}
</button>

<style>
  .b {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; cursor: pointer;
    font-weight: 700; font-size: 15px; line-height: 1; white-space: nowrap; border: 1px solid transparent;
    transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease; -webkit-tap-highlight-color: transparent; user-select: none;
  }
  .b:active:not(:disabled) { transform: scale(.97); }
  .b:disabled { opacity: .55; cursor: not-allowed; }
  .normal { height: 44px; padding: 0 16px; }
  .grande { height: 52px; padding: 0 20px; font-size: 16px; }
  .pequeno { height: 36px; padding: 0 12px; font-size: 14px; border-radius: 10px; }
  .largo { width: 100%; }
  .ouro { background: var(--sv-ouro); color: var(--sv-ouro-texto); }
  @media (hover: hover) { .ouro:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(10, 35, 66, .18); } }
  .linha { background: var(--sv-sup); color: var(--sv-titulo); border-color: var(--sv-campo-borda); font-weight: 600; }
  @media (hover: hover) { .linha:hover:not(:disabled) { background: var(--sv-linha); } }
  .texto { background: transparent; color: var(--sv-link); padding: 0 6px; height: auto; min-height: 32px; font-weight: 600; font-size: 14px; }
  .perigo { background: var(--sv-sup); color: var(--sv-atr); border-color: var(--sv-atr); font-weight: 600; }
</style>
