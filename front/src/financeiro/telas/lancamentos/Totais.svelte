<!-- Os totais do mês embaixo da planilha (r24-lancamento): dízimos, oferta de culto, oferta voluntária, o mês até aqui e o pré-repasse (o quadro
     verde). O pré-repasse, até o incremento 5, é só o que foi lançado no mês (a resposta 6 de 26/11/2026), sem número de repasse inventado. -->
<script lang="ts">
  import type { TotaisMes } from "../../tipos";
  import { NomeDoMes, asFolhas, emReais, nomeDoMes, reais } from "../../lancamentos";

  interface Props { totais: TotaisMes; mes: string; marcadas: readonly number[] }
  let { totais: t, mes, marcadas }: Props = $props();

  const voluntarias = $derived.by(() => {
    const p = [];
    if (t.voluntariasJunto) p.push(`${t.voluntariasJunto} junto do dízimo`);
    if (t.voluntariasSozinhas) p.push(`${t.voluntariasSozinhas} ${t.voluntariasSozinhas === 1 ? "sozinha" : "sozinhas"}`);
    return p.join(", ") || "nenhuma ainda";
  });
  const itens = $derived([
    { rot: "Dízimos", v: t.dizimos, sub: marcadas.length ? `com ${asFolhas(marcadas)}` : "do cadastro e digitados" },
    { rot: "Oferta de culto", v: t.ofertaCulto, sub: "só quando há" },
    { rot: "Oferta voluntária", v: t.ofertaVoluntaria, sub: voluntarias },
    { rot: `${NomeDoMes(mes)} até aqui`, v: t.total, sub: `Pix ${reais(t.pix)} · espécie ${reais(t.especie)}` },
    { rot: `Pré-repasse de ${nomeDoMes(mes)}`, v: t.total, sub: t.adiantado ? `com ${emReais(t.adiantado)} adiantados` : "o que foi lançado no mês" }
  ]);
</script>

<div class="totais">
  {#each itens as x, i (x.rot)}
    <div class="tot" class:pre={i === itens.length - 1}><span class="rot">{x.rot}</span><strong>{emReais(x.v)}</strong><span class="sub">{x.sub}</span></div>
  {/each}
</div>

<style>
  .totais { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  .tot { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 12px; padding: 7px 12px; display: flex; flex-direction: column; min-width: 0; }
  .tot.pre { background: var(--sv-mod-fundo); border-color: transparent; }
  .rot { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pre .rot { color: var(--fin-forte); font-weight: 700; }
  strong { font-size: 18px; font-weight: 800; color: var(--sv-titulo); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub { font-size: 11.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
