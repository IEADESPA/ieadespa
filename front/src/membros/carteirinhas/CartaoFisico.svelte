<!-- Um lado da carteirinha física, desenhado a partir do modelo (o mesmo desenho na prévia, no editor e na impressora). As medidas são em milímetros: `mm` é
     o tamanho de 1 mm na tela (px) — ou null na impressão, que usa o milímetro de verdade. Só mostra o que o modelo pede, com os dados de quem é (ou do exemplo). -->
<script lang="ts">
  import { dataBr } from "../../comum/formato";
  import Icone from "../../comum/Icone.svelte";
  import type { Camada, DadosCartao, Desenho, Lado } from "./tipos";

  interface Props { desenho: Desenho; lado: Lado; dados: DadosCartao; arte?: string | null; mm?: number | null; sombra?: boolean }
  let { desenho, lado, dados, arte = null, mm = 4, sombra = false }: Props = $props();

  const L = $derived(desenho.lados[lado]);
  const u = $derived(mm === null ? "1mm" : `${mm}px`);
  // só endereço https ou do próprio sistema vira imagem (a arte e a foto vêm assinadas do armazenamento)
  const segura = (x: string | null | undefined): string | null => (x && /^(https:\/\/|\/)/.test(x) ? x : null);
  const arteSegura = $derived(L.fundo.arte ? segura(arte) : null);
  // a arte (se houver) por cima; depois o brilho dourado do desenho aprovado; embaixo a cor ou o degradê
  const BRILHO = "radial-gradient(circle at 88% 12%, rgba(255,184,0,.35), transparent 42%), radial-gradient(circle at 10% 110%, rgba(255,255,255,.12), transparent 45%), ";
  const fundoCss = $derived(
    (arteSegura ? `url("${arteSegura.replace(/"/g, "%22")}") center / cover no-repeat, ` : "") +
    (L.fundo.brilho ? BRILHO : "") +
    (L.fundo.degrade && L.fundo.cor2 ? `linear-gradient(${L.fundo.angulo}deg, ${L.fundo.cor1}, ${L.fundo.cor2})` : L.fundo.cor1)
  );
  const qr = $derived(dados.qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dados.qrSvg)}` : null);
  const iniciais = $derived(dados.nome.trim().split(/\s+/).filter(Boolean).map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : "")).join("").toUpperCase().slice(0, 2));

  function texto(c: Camada): string {
    const r = c.rotulo ? `${c.rotulo} ` : "";
    switch (c.campo) {
      case "NOME": return dados.nome;
      case "NASCIMENTO": return `${r}${dataBr(dados.nascimento) || "—"}`;
      case "MATRICULA": return `${r}${dados.matricula ?? "—"}`;
      case "MAE": return `${c.rotulo ? `${c.rotulo}: ` : ""}${dados.mae || "—"}`;
      case "PAI": return `${c.rotulo ? `${c.rotulo}: ` : ""}${dados.pai || "—"}`;
      case "TIPO": return dados.tipoRotulo.toUpperCase();
      default: return c.texto ?? "";
    }
  }
  const comTexto = (c: Camada) => c.tipo === "CAMPO" || c.tipo === "TEXTO";
</script>

<div class="cartao" class:sombra style:--u={u} style:background={fundoCss} role="img" aria-label="Carteirinha de {dados.nome}, {lado}">
  {#each L.camadas as c (c.id)}
    {#if c.visivel}
      <div class="camada {c.tipo.toLowerCase()}" class:fundo={!!c.fundo}
        style:left="calc(var(--u) * {c.x})" style:top="calc(var(--u) * {c.y})" style:width="calc(var(--u) * {c.larg})" style:height="calc(var(--u) * {c.alt})"
        style:color={c.cor ?? null} style:font-family={comTexto(c) || c.tipo === "ASSINATURA" ? `"${c.fonte ?? "Inter"}", Inter, system-ui, sans-serif` : null}
        style:font-size={c.tamanho ? `calc(var(--u) * ${c.tamanho * 0.3528})` : null}
        style:font-weight={c.negrito ? 800 : 500} style:font-style={c.italico ? "italic" : null}
        style:text-align={c.alinhamento === "centro" ? "center" : c.alinhamento === "dir" ? "right" : "left"}
        style:justify-content={c.alinhamento === "centro" ? "center" : c.alinhamento === "dir" ? "flex-end" : "flex-start"}
        style:background={c.tipo === "FORMA" ? (c.cor ?? "#ffffff") : c.fundo ?? null} style:opacity={c.tipo === "FORMA" ? (c.opacidade ?? 1) : null}
        style:border-radius={c.raio != null ? `calc(var(--u) * ${c.raio})` : c.fundo ? "calc(var(--u) * 1)" : null}
        style:outline={c.borda ? `calc(var(--u) * 0.4) solid ${c.borda}` : null}>
        {#if comTexto(c)}
          <span class="txt">{texto(c)}</span>
        {:else if c.tipo === "LOGO"}
          <img src="/icones/icone-512.png" alt="" draggable="false" />
        {:else if c.tipo === "FOTO"}
          {#if segura(dados.foto)}<img class="foto" src={segura(dados.foto)} alt="" draggable="false" />
          {:else}<span class="semfoto"><strong>{iniciais}</strong><small>foto</small></span>{/if}
        {:else if c.tipo === "QR"}
          {#if qr}<img class="qr" src={qr} alt="QR para conferir a carteirinha" draggable="false" />
          {:else}<span class="semqr"><Icone nome="qr" tam={64} traco={1.6} /></span>{/if}
        {:else if c.tipo === "ASSINATURA"}
          <span class="linha"></span><span class="txt">{c.texto ?? ""}</span>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .cartao {
    position: relative; overflow: hidden; flex: none;
    width: calc(var(--u) * 85.6); height: calc(var(--u) * 54); border-radius: calc(var(--u) * 3.2);
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sombra { box-shadow: 0 10px 24px rgba(15, 23, 42, .28); }
  .camada { position: absolute; display: flex; align-items: center; box-sizing: border-box; line-height: 1.15; white-space: nowrap; overflow: hidden; }
  .camada.fundo { padding: 0 calc(var(--u) * 1); }
  .txt { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .camada img { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; user-select: none; }
  .camada img.foto { object-fit: cover; border-radius: inherit; }
  .foto, .semfoto { border-radius: inherit; }
  .camada.foto { background: linear-gradient(160deg, #c7d7fe, #93b4f5); }
  .semfoto { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #1e3a8a; }
  .semfoto strong { font-size: calc(var(--u) * 5.6); font-weight: 800; line-height: 1; }
  .semfoto small { font-size: calc(var(--u) * 2.2); opacity: .75; }
  .camada.qr { background: #fff; padding: calc(var(--u) * 0.8); border-radius: calc(var(--u) * 1); }
  .semqr { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #0f172a; }
  .semqr :global(svg) { width: 100%; height: 100%; }
  .camada.assinatura { flex-direction: column; justify-content: flex-end; gap: calc(var(--u) * 0.6); }
  .camada.assinatura .linha { width: 100%; border-top: calc(var(--u) * 0.25) solid currentColor; opacity: .7; }
</style>
