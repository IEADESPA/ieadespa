<!-- O que está no menu aprovado mas ainda não foi construído: um aviso honesto, nunca a tela antiga no lugar. -->
<script lang="ts">
  import Icone from "./Icone.svelte";

  interface Props { titulo: string; texto: string }
  let { titulo, texto }: Props = $props();
</script>

<section class="obra" aria-label="{titulo}: em construção">
  <span class="ic"><Icone nome="obra" tam={28} traco={1.9} /></span>
  <div>
    <h2>{titulo} <span class="selo">em construção</span></h2>
    <p>{texto}</p>
  </div>
</section>

<style>
  .obra { display: flex; gap: 16px; align-items: flex-start; padding: 22px; border-radius: var(--sv-raio); border: 1px dashed var(--sv-campo-borda); background: var(--sv-sup); max-width: 720px; }
  .ic { width: 52px; height: 52px; border-radius: 14px; background: var(--sv-mod-fundo); color: var(--sv-mod); display: flex; align-items: center; justify-content: center; flex: none; }
  h2 { font-size: 18px; font-weight: 700; color: var(--sv-titulo); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .selo { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 12px; background: var(--sv-pend-fundo); color: var(--sv-pend); }
  p { margin-top: 6px; color: var(--sv-texto); font-size: 14.5px; line-height: 1.5; }
</style>
