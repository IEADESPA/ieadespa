<!-- Procurar uma pessoa do cadastro (nome ou matrícula), no escopo de quem procura — para ligar um parente ou um cônjuge. Mostra até 8. -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import type { PaginaPessoas } from "../tipos";

  interface Props { rotulo: string; excluir?: number | null; onescolher: (p: { membroId: number; nome: string }) => void }
  let { rotulo, excluir = null, onescolher }: Props = $props();

  let termo = $state("");
  let itens = $state<{ membroId: number; nome: string; congregacao: string | null }[]>([]);
  let buscando = $state(false);
  let erro = $state("");
  let espera: ReturnType<typeof setTimeout> | undefined;
  let controle: AbortController | null = null;
  function mudou(v: string) {
    termo = v;
    clearTimeout(espera);
    if (v.trim().length < 2) { itens = []; return; }
    espera = setTimeout(() => void buscar(), 250);
  }
  async function buscar() {
    controle?.abort();
    const c = new AbortController();
    controle = c;
    buscando = true; erro = "";
    const r = await pedir<PaginaPessoas>("/pessoas" + qs({ pagina: 1, porPagina: 8, busca: termo.trim(), rol: "1" }), { sinal: c.signal });
    if (c !== controle) return;
    buscando = false;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    itens = r.dados.itens.filter((p) => p.membroId !== excluir).map((p) => ({ membroId: p.membroId, nome: p.nome, congregacao: p.congregacao }));
  }
</script>

<div class="busca">
  <label><span>{rotulo}</span><input type="search" placeholder="Nome ou matrícula" value={termo} oninput={(e) => mudou(e.currentTarget.value)} /></label>
  {#if erro}<p class="erro">{erro}</p>
  {:else if buscando}<p class="nada">Procurando…</p>
  {:else if termo.trim().length >= 2 && !itens.length}<p class="nada">Ninguém com esse nome no seu escopo.</p>{/if}
  {#if itens.length}
    <ul>{#each itens as p (p.membroId)}<li><button type="button" onclick={() => { onescolher({ membroId: p.membroId, nome: p.nome }); termo = ""; itens = []; }}><strong>{p.nome}</strong><small class="sv-num">{p.membroId}{p.congregacao ? ` · ${p.congregacao}` : ""}</small></button></li>{/each}</ul>
  {/if}
</div>

<style>
  .busca { display: flex; flex-direction: column; gap: 6px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--sv-suave); }
  input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); border-radius: 10px; padding: 9px 10px; font: inherit; font-size: 14.5px; color: var(--sv-texto); }
  ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--sv-borda); border-radius: 10px; overflow: hidden; }
  li + li { border-top: 1px solid var(--sv-linha); }
  li button { width: 100%; display: flex; justify-content: space-between; gap: 10px; background: var(--sv-sup); border: 0; padding: 8px 10px; font: inherit; cursor: pointer; text-align: left; color: var(--sv-texto); }
  li button:hover { background: var(--sv-campo); }
  small { color: var(--sv-suave); }
  .nada { margin: 0; font-size: 13px; color: var(--sv-suave); }
  .erro { margin: 0; font-size: 13px; color: var(--sv-atr); }
</style>
