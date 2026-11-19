<!-- Um campo de formulário do desenho: o rótulo (com * se obrigatório e "(opcional)"), a caixa de 46 px e a ajuda/erro embaixo. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props {
    rotulo: string;
    valor: string;
    oninput: (v: string) => void;
    obrigatorio?: boolean;
    opcional?: boolean;
    tipo?: "text" | "date" | "email" | "tel";
    dica?: string;
    erro?: string;
    placeholder?: string;
    inputmode?: "numeric" | "tel" | "email" | "text";
    autocomplete?: HTMLInputAttributes["autocomplete"];
    maxlength?: number;
    onblur?: () => void;
    id?: string;
    extra?: Snippet;
  }
  let { rotulo, valor, oninput, obrigatorio = false, opcional = false, tipo = "text", dica, erro, placeholder, inputmode, autocomplete = "off", maxlength, onblur, id, extra }: Props = $props();
  const reserva = `c-${Math.random().toString(36).slice(2, 9)}`;
  const uid = $derived(id ?? reserva);
</script>

<div class="campo">
  <label for={uid}>{rotulo}{#if obrigatorio}<span class="obr" aria-hidden="true"> *</span>{/if}{#if opcional}<span class="opc"> (opcional)</span>{/if}</label>
  <input id={uid} type={tipo} value={valor} {placeholder} {inputmode} {autocomplete} {maxlength} required={obrigatorio} aria-invalid={erro ? true : undefined}
    aria-describedby={erro || dica ? uid + "-d" : undefined} oninput={(e) => oninput((e.currentTarget as HTMLInputElement).value)} {onblur} />
  {#if erro}<small id="{uid}-d" class="erro">{erro}</small>{:else if dica}<small id="{uid}-d">{dica}</small>{/if}
  {#if extra}{@render extra()}{/if}
</div>

<style>
  .campo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  label { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); margin-left: 2px; }
  .opc { font-weight: 400; font-size: 12.5px; color: var(--sv-suave); margin-left: 4px; }
  input {
    height: 46px; padding: 0 14px; border: 1px solid var(--sv-campo-borda); border-radius: 10px; background: var(--sv-campo); color: var(--sv-titulo);
    font: inherit; font-size: 16px; width: 100%;
  }
  input:focus { outline: none; border-color: var(--sv-ouro); box-shadow: 0 0 0 3px rgba(255, 184, 0, .35); }
  input[aria-invalid="true"] { border-color: var(--sv-atr); }
  small { font-size: 12.5px; color: var(--sv-suave); }
  .erro { color: var(--sv-atr); font-weight: 600; }
</style>
