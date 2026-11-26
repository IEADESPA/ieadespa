<!-- O que vai para a impressora (montado fora das telas, direto no body, só enquanto imprime): no PAPEL, folhas A4 com 10 cartões (2 × 5) e, com
     frente e verso, a folha do verso logo depois, com as colunas trocadas (para a impressora que vira a folha pela borda maior); no PVC, um cartão por
     página, no tamanho do cartão (85,6 × 54 mm), a frente e logo depois o verso. Nada é guardado: o navegador manda para a impressora. -->
<script lang="ts">
  import CartaoFisico from "./CartaoFisico.svelte";
  import type { CartaoImpresso, Material, Modelo } from "./tipos";

  interface Props { cartoes: readonly CartaoImpresso[]; modelos: readonly Modelo[]; material: Material; frenteVerso: boolean }
  let { cartoes, modelos, material, frenteVerso }: Props = $props();

  const porId = $derived(new Map(modelos.map((m) => [m.modeloId, m])));
  const comModelo = $derived(cartoes.filter((c) => porId.get(c.modeloId)?.desenho));
  // de 10 em 10 no papel
  const folhas = $derived.by(() => {
    const r: CartaoImpresso[][] = [];
    for (let i = 0; i < comModelo.length; i += 10) r.push(comModelo.slice(i, i + 10));
    return r;
  });
  // o verso com as colunas trocadas (cada linha: a 2ª coluna vai para a 1ª)
  function verso(f: readonly CartaoImpresso[]): (CartaoImpresso | null)[] {
    const r: (CartaoImpresso | null)[] = [];
    for (let i = 0; i < f.length; i += 2) r.push(f[i + 1] ?? null, f[i] ?? null);
    return r;
  }
</script>

<div class="sv-impressao {material === 'PVC' ? 'pvc' : 'papel'}">
  {#if material === "PVC"}
    {#each comModelo as c (c.membroId)}
      {@const m = porId.get(c.modeloId)}
      {#if m?.desenho}
        <div class="folha"><CartaoFisico desenho={m.desenho} lado="frente" dados={c} arte={m.arteFrente} mm={null} /></div>
        {#if frenteVerso}<div class="folha"><CartaoFisico desenho={m.desenho} lado="verso" dados={c} arte={m.arteVerso} mm={null} /></div>{/if}
      {/if}
    {/each}
  {:else}
    {#each folhas as f, i (i)}
      <div class="folha">
        {#each f as c (c.membroId)}
          {@const m = porId.get(c.modeloId)}
          {#if m?.desenho}<div class="vaga"><CartaoFisico desenho={m.desenho} lado="frente" dados={c} arte={m.arteFrente} mm={null} /></div>{/if}
        {/each}
      </div>
      {#if frenteVerso}
        <div class="folha">
          {#each verso(f) as c, j (j)}
            {@const m = c ? porId.get(c.modeloId) : undefined}
            <div class="vaga">{#if c && m?.desenho}<CartaoFisico desenho={m.desenho} lado="verso" dados={c} arte={m.arteVerso} mm={null} />{/if}</div>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}
</div>
