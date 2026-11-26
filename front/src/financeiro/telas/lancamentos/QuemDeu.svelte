<!-- "Quem deu · procura no cadastro de membros" (r24-lancamento): a procura na Igreja inteira, só o nome, o número e a congregação (a resposta 2
     de 26/11/2026). Escolhido do cadastro, fica o membro; digitado e não achado, fica o "nome digitado". Teclado: ↑ ↓ escolhe, Enter fica com o
     marcado, Esc fecha a lista. Enquanto a procura do que foi digitado não volta, a lista velha some e o Enter espera: com achados, a lista
     abre para a pessoa escolher; sem achados, fica o nome digitado e a tela segue. -->
<script lang="ts">
  import { untrack } from "svelte";
  import Icone from "../../../comum/Icone.svelte";
  import type { DizimistaAchado } from "../../tipos";
  import { folhaTxt, procurarDizimista, type Pessoa } from "../../lancamentos";

  interface Props {
    pessoa: Pessoa;
    folha: number;
    grande?: boolean;
    /** a linha da planilha que não está ativa: o campo parece texto */
    plano?: boolean;
    placeholder?: string;
    desligado?: boolean;
    onpessoa: (p: Pessoa) => void;
    /** Enter sem lista aberta: a tela segue (a próxima folha) */
    onenter?: () => void;
  }
  let { pessoa, folha, grande = false, plano = false, placeholder = "", desligado = false, onpessoa, onenter }: Props = $props();

  // o texto do campo é da pessoa que digita; começa no que a linha já tem (a linha nova monta outro campo)
  let texto = $state(untrack(() => (pessoa && "nome" in pessoa ? pessoa.nome : pessoa && "digitado" in pessoa ? pessoa.digitado : "")));
  const idLista = $props.id();
  let achados = $state.raw<readonly DizimistaAchado[]>([]);
  let aberta = $state(false);
  let marcado = $state(0);
  /** a procura do texto de agora ainda não voltou */
  let procurando = $state(false);
  /** o Enter chegou antes da procura voltar */
  let enterEsperando = false;
  let campo = $state<HTMLInputElement | null>(null);
  let controle: AbortController | null = null;
  const escolhido = $derived(pessoa && "membroId" in pessoa ? pessoa : null);

  export function focar(): void { campo?.focus(); }

  // a procura espera a pessoa parar de digitar; a resposta velha não cobre a nova
  $effect(() => {
    const v = texto.trim();
    if ((escolhido && v === escolhido.nome) || v.replace(/\./g, "").length < 2) { procurando = false; return; }
    const t = setTimeout(async () => {
      controle?.abort();
      controle = new AbortController();
      const r = await procurarDizimista(v, controle.signal);
      if (v !== texto.trim()) return;
      procurando = false;
      const esperou = enterEsperando;
      enterEsperando = false;
      if (!r.ok) return;
      achados = r.dados.membros;
      marcado = 0;
      if (esperou && !achados.length) { onenter?.(); return; }
      aberta = esperou || document.activeElement === campo;
    }, 250);
    return () => clearTimeout(t);
  });

  function escolher(m: DizimistaAchado): void {
    texto = m.nome;
    aberta = false;
    procurando = false;
    enterEsperando = false;
    onpessoa({ membroId: m.membroId, nome: m.nome });
  }
  function digitou(v: string): void {
    texto = v;
    // a lista do texto anterior não vale mais: some até a procura nova voltar
    achados = [];
    aberta = false;
    marcado = 0;
    enterEsperando = false;
    procurando = v.trim().replace(/\./g, "").length >= 2;
    const t = v.trim().replace(/\s+/g, " ");
    onpessoa(t ? { digitado: t } : null);
  }
  function teclas(e: KeyboardEvent): void {
    if (aberta && achados.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      marcado = (marcado + (e.key === "ArrowDown" ? 1 : achados.length - 1)) % achados.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = achados[marcado];
      if (aberta && m) escolher(m);
      else if (procurando) enterEsperando = true;
      else onenter?.();
    } else if (e.key === "Escape" && aberta) {
      e.preventDefault();
      e.stopPropagation();
      aberta = false;
    }
  }
</script>

<div class="quem" class:grande class:plano>
  <span class="caixa" class:escolhido={!!escolhido}>
    <Icone nome="pessoa" tam={grande ? 17 : 15} traco={2} />
    <input bind:this={campo} value={texto} oninput={(e) => digitou((e.currentTarget as HTMLInputElement).value)} onkeydown={teclas}
      onfocus={() => (aberta = achados.length > 0 && !escolhido)} onblur={() => setTimeout(() => (aberta = false), 150)}
      disabled={desligado} {placeholder} data-quem={folha} maxlength="120" autocomplete="off" spellcheck="false" aria-label={`Quem deu a folha ${folhaTxt(folha)}`}
      role="combobox" aria-expanded={aberta} aria-controls={idLista} aria-autocomplete="list" />
    {#if escolhido}<span class="num">nº {folhaTxt(escolhido.membroId)}</span>{:else if texto.trim() && !aberta}<span class="digitado">nome digitado</span>{/if}
  </span>
  {#if aberta && achados.length}
    <ul class="lista" id={idLista} role="listbox" aria-label="Achados no cadastro">
      {#each achados as m, i (m.membroId)}
        <li role="option" aria-selected={i === marcado}>
          <button type="button" class:marcado={i === marcado} tabindex="-1" onmousedown={(e) => { e.preventDefault(); escolher(m); }}>
            <strong>{m.nome}</strong><span>nº {folhaTxt(m.membroId)}{m.congregacao ? ` · ${m.congregacao}` : ""}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .quem { position: relative; flex: 1; min-width: 0; display: flex; }
  .caixa { flex: 1; height: 30px; border: 2px solid var(--sv-campo-borda); border-radius: 7px; background: var(--sv-campo); display: flex; align-items: center; gap: 6px; padding: 0 8px; min-width: 0; color: var(--fin-forte); }
  .grande .caixa { height: 42px; border-radius: 10px; padding: 0 12px; gap: 10px; }
  .caixa:focus-within { border-color: var(--fin-forte); }
  .plano .caixa:not(:focus-within) { border-color: transparent; background: transparent; padding-left: 0; }
  .plano .caixa:not(:focus-within) :global(svg) { display: none; }
  input::placeholder { color: var(--sv-suave); font-weight: 400; }
  input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--sv-titulo); }
  .grande input { font-size: 14.5px; }
  .num { font-size: 11.5px; font-weight: 400; color: var(--sv-suave); white-space: nowrap; flex: none; }
  .grande .num { font-size: 12px; }
  .digitado { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 8px; border: 1px dashed var(--sv-campo-borda); color: var(--sv-suave); white-space: nowrap; flex: none; }
  .lista { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; margin: 0; padding: 4px; list-style: none; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 10px; box-shadow: var(--sv-sombra); }
  .lista button { width: 100%; border: 0; background: transparent; border-radius: 7px; padding: 6px 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; text-align: left; font: inherit; cursor: pointer; }
  .lista button.marcado { background: var(--sv-mod-fundo); }
  .lista strong { font-size: 13.5px; color: var(--sv-titulo); }
  .lista span { font-size: 11.5px; color: var(--sv-suave); }
</style>
