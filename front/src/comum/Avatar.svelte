<!-- As iniciais (ou a foto) da pessoa, no círculo azul claro do módulo; com `cor`, no círculo cheio dessa cor com as letras brancas (o departamento). -->
<script lang="ts">
  import { iniciais } from "./formato";

  interface Props { nome: string; foto?: string | null; tam?: number; cor?: string }
  let { nome, foto = null, tam = 32, cor }: Props = $props();
  // só endereço https ou do próprio sistema vira imagem (a foto vem assinada do armazenamento)
  const fotoSegura = $derived(foto && /^(https:\/\/|\/)/.test(foto) ? foto : null);
  // só cor em hexadecimal entra no estilo
  const corSegura = $derived(cor && /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : null);
</script>

<span class="av" class:cheio={corSegura} style:width="{tam}px" style:height="{tam}px" style:font-size="{Math.round(tam * 0.36)}px" style:background={corSegura} aria-hidden="true">
  {#if fotoSegura}<img src={fotoSegura} alt="" loading="lazy" />{:else}{iniciais(nome)}{/if}
</span>

<style>
  .av { border-radius: 50%; background: var(--sv-mod-fundo); color: var(--sv-mod); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; flex: none; overflow: hidden; }
  .cheio { color: #FFFFFF; }
  img { width: 100%; height: 100%; object-fit: cover; }
</style>
