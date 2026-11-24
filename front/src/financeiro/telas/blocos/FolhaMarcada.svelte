<!-- A folha clicada que não vai ao formulário (rodada 30, "r30-blocos-desfazer"): a folha marcada (a exceção, ou a lançada que tem histórico) e,
     no celular, a folha livre que já foi marcada e desfeita. Diz como a folha está ("Está como" e a etiqueta) e:
     - a Tesouraria Geral desfaz a exceção da entrega em curso, com o motivo ("Motivo para desfazer*", que fica no histórico);
     - a área e a congregação veem o cadeado ("Marcou errado? Só a Tesouraria Geral desfaz, com o motivo. Fale com ela.");
     - a folha livre com histórico, no celular, oferece "Marcar o que aconteceu" (o formulário abre ao tocar).
     Embaixo, o histórico da folha. No notebook, o quadro "A folha que você clicou"; no celular, o cartão com o número e a etiqueta. -->
<script lang="ts">
  import { numero } from "../../../comum/formato";
  import Icone from "../../../comum/Icone.svelte";
  import { NOME_CURTO } from "../../blocos";
  import type { DestinoFolha, HistoricoFolha } from "../../tipos";
  import Quadro from "../../partes/Quadro.svelte";
  import Historico from "./Historico.svelte";

  interface Props {
    celular: boolean;
    blocoNumero: number;
    folha: number;
    posicao: number;
    /** null = a folha está livre (a que já foi marcada e desfeita) */
    destino: DestinoFolha | null;
    historico: HistoricoFolha | null;
    /** a Tesouraria Geral desfaz esta exceção (a da entrega em curso) */
    pode: boolean;
    /** o porquê de não desfazer (o cadeado) */
    trava: string;
    nota: string;
    gravando: boolean;
    falta: string;
    motivo: string;
    ondesfazer: () => void;
    /** a folha livre com histórico, no celular: abre o formulário */
    onmarcar?: () => void;
    oneditar: () => void;
  }
  let { celular, blocoNumero, folha, posicao, destino, historico, pode, trava, nota, gravando, falta, motivo = $bindable(), ondesfazer, onmarcar, oneditar }: Props = $props();
</script>

{#snippet etiqueta()}
  <span class="etq {destino ?? 'livre'}">{NOME_CURTO[destino ?? "livre"]}</span>
{/snippet}

{#snippet campoMotivo()}
  <label class="campo">
    <span class="rot">Motivo para desfazer<span class="obrig">*</span>{#if !celular}&nbsp;<span class="nota-campo">· fica no histórico</span>{/if}</span>
    <input type="text" maxlength="300" autocomplete="off" placeholder="por que a marcação está errada" bind:value={motivo} oninput={oneditar} />
  </label>
{/snippet}

{#snippet botaoDesfazer()}
  <button type="button" class="linha-botao" disabled={gravando} aria-busy={gravando} onclick={ondesfazer}><Icone nome="voltar" tam={17} traco={2} />Desfazer a marcação</button>
{/snippet}

{#snippet cadeado()}
  <div class="trava"><Icone nome="cadeado" tam={15} traco={2} /><span>{trava}</span></div>
{/snippet}

{#snippet faltando()}
  {#if falta}<p class="falta" role="alert">{falta}</p>{/if}
{/snippet}

<div class="folha-marcada" class:cel={celular}>
  {#if celular}
    <Quadro titulo={`Folha ${numero(folha)} · a ${posicao}ª`} celular extra={etiqueta}>
      {#if onmarcar}
        {#if historico}<Historico {historico} {celular} />{/if}
        <div class="fim"><button type="button" class="linha-botao" onclick={onmarcar}><Icone nome="lapis" tam={17} traco={2} />Marcar o que aconteceu</button></div>
      {:else}
        {#if pode}
          {@render campoMotivo()}
          {@render faltando()}
          <div class="fim">{@render botaoDesfazer()}</div>
        {:else}
          {@render cadeado()}
        {/if}
        {#if historico}<Historico {historico} {celular} />{/if}
      {/if}
    </Quadro>
  {:else}
    <Quadro titulo="A folha que você clicou" {nota}>
      <div class="linha">
        <div class="campo">
          <span class="rot">Folha (bloco {numero(blocoNumero)})</span>
          <span class="auto"><Icone nome="livro" tam={15} traco={2} />{numero(folha)} · {posicao}ª</span>
        </div>
        <div class="campo">
          <span class="rot">Está como</span>
          <span class="esta">{@render etiqueta()}</span>
        </div>
        {#if pode}
          {@render campoMotivo()}
          {@render botaoDesfazer()}
        {:else}
          <div class="lado">{@render cadeado()}</div>
        {/if}
      </div>
      {@render faltando()}
      {#if historico}<Historico {historico} {celular} />{/if}
    </Quadro>
  {/if}
</div>

<style>
  .folha-marcada { display: contents; }
  button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }

  /* as medidas da r30 (r30CardMarcada): a folha, como está, o motivo e o botão numa linha; sem o desfazer, o cadeado ocupa as duas últimas */
  .linha { display: grid; grid-template-columns: minmax(0, 0.95fr) auto minmax(0, 2.6fr) auto; gap: 12px; align-items: end; }
  .lado { grid-column: span 2; min-width: 0; }
  .campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .rot { font-size: 12.5px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .obrig { color: var(--sv-atr); }
  .nota-campo { font-weight: 400; color: var(--sv-suave); }
  .auto, .campo input { min-height: 40px; border-radius: 9px; display: flex; align-items: center; gap: 8px; padding: 0 11px; font-size: 13.5px; color: var(--sv-texto); }
  .auto { border: 1px dashed var(--sv-campo-borda); background: transparent; white-space: nowrap; overflow: hidden; }
  .auto :global(svg) { color: var(--sv-suave); }
  .campo input { border: 1px solid var(--sv-campo-borda); background: var(--sv-campo); font-family: inherit; width: 100%; outline: none; }
  .campo input::placeholder { color: var(--sv-suave); opacity: 1; }
  .campo input:focus { border-color: var(--sv-mod); }
  .esta { min-height: 40px; display: flex; align-items: center; }

  /* a etiqueta da situação (r30Etq): as cores das folhas */
  .etq { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 13px; font-size: 12.5px; font-weight: 700; white-space: nowrap; flex: none; }
  .etq.lancada { background: var(--f-lancada); color: var(--f-lancada-texto); }
  .etq.cancelada { background: var(--f-cancelada); color: var(--f-cancelada-texto); }
  .etq.arrancada { background: var(--f-arrancada); color: var(--f-arrancada-texto); }
  .etq.extraviada { background: var(--f-extraviada); color: var(--f-extraviada-texto); border: 1.5px dashed var(--f-extraviada-borda); }
  .etq.inexistente { background-color: var(--f-inexistente); color: var(--f-inexistente-texto); background-image: repeating-linear-gradient(135deg, transparent 0 5px, var(--f-inexistente-risca) 5px 8px); }
  .etq.livre { background: var(--sv-campo); color: var(--sv-suave); }

  .trava { min-height: 40px; display: flex; align-items: center; gap: 8px; font-size: 12.5px; line-height: 1.35; color: var(--sv-suave); }
  .trava :global(svg) { color: var(--sv-suave); flex: none; }
  .trava span { min-width: 0; }
  .cel .trava { min-height: 0; }
  .linha-botao {
    height: 42px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sv-campo-borda); background: transparent; color: var(--sv-titulo); display: inline-flex;
    align-items: center; gap: 8px; font-size: 14px; font-weight: 600; white-space: nowrap; flex: none; transition: background-color .15s ease;
  }
  .linha-botao :global(svg) { color: var(--sv-icone); }
  .linha-botao:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) { .linha-botao:hover:not(:disabled) { background: var(--sv-linha); } }
  .fim { display: flex; justify-content: flex-end; }
  .falta { font-size: 12.5px; font-weight: 600; color: var(--sv-atr); }
</style>
