<!-- A CARTEIRINHA DIGITAL da própria pessoa (rodada 11, opção 2: o cartão em cima e os dados embaixo; rodada 9: tela cheia no celular, caprichando).
     Mostra o que muda (o cargo, a função, a congregação, a situação de hoje, membro desde) e o QR FIXO — o mesmo da carteirinha de papel, que nunca vence. -->
<script lang="ts">
  import { pedir } from "../../comum/api";
  import Estado from "../../comum/Estado.svelte";
  import Icone from "../../comum/Icone.svelte";
  import type { CarteirinhaDigital } from "./tipos";

  interface Props { celular: boolean; onfechar?: () => void }
  let { celular, onfechar }: Props = $props();

  let c = $state<CarteirinhaDigital | null>(null);
  let erro = $state("");
  async function ler() {
    erro = "";
    const r = await pedir<{ carteirinha: CarteirinhaDigital }>("/carteirinhas/minha");
    if (r.ok) c = r.dados.carteirinha;
    else if (!r.cancelado) erro = r.mensagem;
  }
  void ler();

  const SIT = { EM_COMUNHAO: { rotulo: "Em comunhão", tom: "ok" }, CONGREGADO: { rotulo: "Congregado", tom: "info" }, DISCIPLINA: { rotulo: "Em disciplina", tom: "pend" }, SAIU: { rotulo: "Não é mais membro", tom: "erro" } } as const;
  const qr = $derived(c ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.qrSvg)}` : "");
  const foto = $derived(c?.foto && /^https:\/\//.test(c.foto) ? c.foto : null);
  const iniciais = $derived((c?.nome ?? "").trim().split(/\s+/).filter(Boolean).map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : "")).join("").toUpperCase());
  const titulo = $derived(c ? (c.tipo === "CONGREGADO" ? "CARTEIRA DE CONGREGADO" : c.tipo === "OBREIRO" ? "CREDENCIAL DE OBREIRO" : "CARTEIRA DE MEMBRO") : "");
</script>

<div class="dig" class:celular>
  {#if celular}
    <div class="topo">
      {#if onfechar}<button type="button" class="fechar" aria-label="Fechar a carteirinha" onclick={onfechar}><Icone nome="fechar" tam={22} traco={2.2} /></button>{/if}
      <strong>Minha carteirinha</strong><small>brilho no máximo</small>
    </div>
  {/if}
  {#if erro}<Estado tipo="erro" texto={erro} ontentar={ler} />
  {:else if !c}<Estado tipo="carregando" linhas={5} />
  {:else}
    <div class="cartao {c.tipo.toLowerCase()}" role="img" aria-label="Carteirinha de {c.nome}">
      <div class="cab"><img src="/icones/icone-192.png" alt="" /><span><small>IGREJA EVANGÉLICA ASSEMBLEIA DE DEUS</small><strong>IEADESPA · {titulo}</strong></span></div>
      <div class="corpo">
        <div class="foto">{#if foto}<img src={foto} alt="" />{:else}<strong>{iniciais}</strong><small>foto</small>{/if}</div>
        <div class="quem">
          <strong class="nome">{c.nome}</strong>
          {#if c.cargo}<span class="cargo">{c.cargo.toUpperCase()}</span>{/if}
          <span class="mat sv-num">Matrícula {c.matricula}</span>
        </div>
      </div>
    </div>
    <dl class="dados">
      <div><dt>Função</dt><dd>{c.funcao ?? "—"}</dd></div>
      <div><dt>Congregação</dt><dd>{c.congregacao ?? "—"}{c.area ? ` · ${c.area}` : ""}</dd></div>
      <div><dt>Situação</dt><dd class="sit {SIT[c.situacao].tom}">{#if c.situacao === "EM_COMUNHAO"}<Icone nome="check" tam={16} traco={2.6} />{/if}{SIT[c.situacao].rotulo}{c.exerceCargo === false ? " · no momento não exerce o cargo" : ""}</dd></div>
      <div><dt>Membro desde</dt><dd class="sv-num">{c.membroDesde ?? "—"}</dd></div>
    </dl>
    <div class="qr"><img src={qr} alt="QR para conferir esta carteirinha" /></div>
    <p class="leg">QR fixo desta pessoa · o mesmo da carteirinha de papel · não vence</p>
  {/if}
</div>

<style>
  .dig { display: flex; flex-direction: column; gap: 14px; max-width: 420px; }
  /* no celular, um respiro embaixo: a legenda do QR não encosta na borda */
  .dig.celular { max-width: none; padding-bottom: 28px; gap: 10px; }
  .celular .qr { width: 150px; height: 150px; padding: 10px; }
  .celular .dados div { padding: 8px 0; }
  .topo { display: flex; align-items: center; gap: 10px; }
  .topo strong { color: var(--sv-titulo); font-size: 18px; flex: 1; }
  .topo small { color: var(--sv-suave); font-size: 13px; }
  .fechar { background: none; border: 0; padding: 4px; color: var(--sv-titulo); display: flex; cursor: pointer; }
  /* as cores do desenho aprovado (rodada 11): o marinho escuro com o brilho dourado; o congregado no verde-petróleo; o obreiro no roxo */
  .cartao { --brilho: radial-gradient(circle at 90% 10%, rgba(255, 184, 0, .3), transparent 45%), radial-gradient(circle at 10% 110%, rgba(255, 255, 255, .12), transparent 45%);
    border-radius: 18px; padding: 14px 16px 18px; color: #fff; background: var(--brilho), linear-gradient(135deg, #0a2342, #16365e); box-shadow: 0 12px 26px rgba(6, 22, 41, .3); }
  .cartao.congregado { background: var(--brilho), linear-gradient(135deg, #0f4c45, #126058); }
  .cartao.obreiro { background: var(--brilho), linear-gradient(135deg, #3b1f5e, #55307f); }
  .cab { display: flex; align-items: center; gap: 10px; }
  .cab img { width: 34px; height: 34px; border-radius: 50%; background: #fff; }
  .cab span { display: flex; flex-direction: column; line-height: 1.15; }
  .cab small { font-size: 10.5px; font-weight: 700; opacity: .9; letter-spacing: .02em; }
  .cab strong { font-size: 13px; font-weight: 800; letter-spacing: .02em; }
  .corpo { display: flex; gap: 14px; margin-top: 12px; align-items: center; }
  .foto { width: 78px; height: 94px; flex: none; border-radius: 10px; background: linear-gradient(160deg, #c7d7fe, #93b4f5); color: #1e3a8a; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
  .foto img { width: 100%; height: 100%; object-fit: cover; }
  .foto strong { font-size: 24px; font-weight: 800; }
  .foto small { font-size: 11px; opacity: .8; }
  .quem { display: flex; flex-direction: column; gap: 6px; min-width: 0; align-items: flex-start; }
  .nome { font-size: 19px; font-weight: 800; line-height: 1.15; }
  .cargo { background: #ffb800; color: #0a2342; font-weight: 800; letter-spacing: .06em; font-size: 14px; padding: 3px 12px; border-radius: 8px; }
  .mat { font-size: 13.5px; opacity: .9; }
  .dados { margin: 0; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 4px 16px; }
  .dados div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--sv-linha); }
  .dados div:last-child { border-bottom: 0; }
  dt { color: var(--sv-suave); }
  dd { margin: 0; font-weight: 700; color: var(--sv-titulo); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .sit.ok { color: var(--sv-ok); }
  .sit.pend { color: var(--sv-pend); }
  .sit.erro { color: var(--sv-atr); }
  .sit.info { color: var(--sv-mod); }
  .qr { align-self: center; background: #fff; border: 1px solid var(--sv-borda); border-radius: 16px; padding: 14px; width: 190px; height: 190px; }
  .qr img { width: 100%; height: 100%; display: block; }
  .leg { margin: 0; text-align: center; color: var(--sv-suave); font-size: 13px; font-weight: 600; }
</style>
