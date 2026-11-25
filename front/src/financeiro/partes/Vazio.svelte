<!-- A lista vazia do Financeiro (rodada 30, "r30-blocos-vazios", o "r30Vazio" do desenho): o ícone do livro, o título, a frase e, se houver, uma
     ação embaixo, no meio. Solta na página, com a borda tracejada; dentro de um quadro ("O livro"), sem borda e com menos folga. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import Icone from "../../comum/Icone.svelte";

  interface Props {
    titulo: string;
    texto: string;
    celular?: boolean;
    /** dentro de um quadro: sem a borda tracejada */
    dentro?: boolean;
    acao?: Snippet;
  }
  let { titulo, texto, celular = false, dentro = false, acao }: Props = $props();
</script>

<div class="vazio" class:cel={celular} class:dentro>
  <span class="ic"><Icone nome="livro" tam={celular ? 28 : 32} traco={1.8} /></span>
  <strong>{titulo}</strong>
  <span class="txt">{texto}</span>
  {#if acao}{@render acao()}{/if}
</div>

<style>
  .vazio {
    background: var(--sv-sup); border: 1px dashed var(--sv-campo-borda); border-radius: 14px; padding: 30px 24px; display: flex; flex-direction: column;
    align-items: center; gap: 8px; text-align: center; flex: none;
  }
  .vazio.cel { padding: 22px 16px; }
  .vazio.dentro { border: 0; padding: 14px 8px; }
  .ic { display: flex; color: var(--sv-suave); }
  strong { font-size: 16px; font-weight: 700; color: var(--sv-titulo); line-height: 1.3; }
  .cel strong { font-size: 15px; }
  .txt { font-size: 13px; color: var(--sv-suave); max-width: 440px; line-height: 1.45; }
</style>
