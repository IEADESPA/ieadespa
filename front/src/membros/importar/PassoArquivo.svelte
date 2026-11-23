<!-- Passo 1 da importação (r27): o arquivo e as colunas. A Geral escolhe a planilha do jeito que o sistema pago exporta; o sistema lê (a
     prévia: nada é gravado nas fichas) e liga cada coluna a um campo da ficha. As colunas a mais ficam em amarelo para ela escolher o
     campo, ou "não usar". "Conferir os números" refaz a prévia com o mapa escolhido (só se ele mudou) e abre o passo 2. -->
<script lang="ts">
  import Icone from "../../comum/Icone.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { numero, plural } from "../../comum/formato";
  import Mapa from "./Mapa.svelte";
  import { fazerPrevia, lerTextoDoArquivo, type ArquivoLido, type CampoColuna, type ColunaArquivo, type MapaDaTela, type Previa } from "./importar";

  interface Props {
    celular: boolean;
    campos: readonly CampoColuna[];
    arquivo: ArquivoLido | null;
    previa: Previa | null;
    mapa: MapaDaTela | null;
    onconferir: () => void;
  }
  let { celular, campos, arquivo = $bindable(), previa = $bindable(), mapa = $bindable(), onconferir }: Props = $props();

  let lendo = $state(false);
  let erro = $state("");

  const padrao = $derived(new Set(campos.filter((c) => c.padrao).map((c) => c.campo)));
  /** o mapa como o sistema leu: a coluna fora das 11 de sempre (ou não reconhecida) é "a mais" e fica amarela */
  function mapaDe(lista: readonly ColunaArquivo[]): MapaDaTela {
    return { lista, extras: lista.map((c) => !c.campo || !padrao.has(c.campo)), escolha: lista.map((c) => c.campo) };
  }
  function colunasDoErro(corpo: unknown): readonly ColunaArquivo[] | null {
    const c = corpo && typeof corpo === "object" ? (corpo as { colunas?: { lista?: unknown } }).colunas : null;
    return c && Array.isArray(c.lista) ? (c.lista as ColunaArquivo[]) : null;
  }

  async function escolher(ev: Event) {
    const inp = ev.currentTarget as HTMLInputElement;
    const f = inp.files?.[0];
    inp.value = "";
    if (!f || lendo) return;
    lendo = true;
    erro = "";
    try {
      let texto: string;
      try { texto = await lerTextoDoArquivo(f); } catch { erro = "Não deu para ler este arquivo. Escolha a planilha de novo."; return; }
      arquivo = { nome: f.name, texto };
      previa = null;
      mapa = null;
      const r = await fazerPrevia({ nomeArquivo: f.name, texto });
      if (r.ok) { previa = { importacaoId: r.dados.importacaoId, resumo: r.dados.resumo }; mapa = mapaDe(r.dados.resumo.colunas.lista); return; }
      erro = r.mensagem;
      const lista = colunasDoErro(r.corpo);
      if (lista) mapa = mapaDe(lista);
    } finally { lendo = false; }
  }

  // voltou ao passo 1 com a prévia guardada (a tela foi aberta de novo): o mapa dela aparece; para mudar as colunas, a planilha de novo
  if (!mapa && previa) mapa = mapaDe(previa.resumo.colunas.lista);

  const mudou = $derived(!!mapa && (!previa || mapa.escolha.some((c, i) => (previa?.resumo.colunas.lista[i]?.campo ?? null) !== c)));
  async function conferir() {
    if (lendo) return;
    if (previa && !mudou) { onconferir(); return; }
    if (!arquivo) { erro = "Para mudar as colunas, escolha a planilha de novo."; return; }
    if (!mapa) return;
    lendo = true;
    erro = "";
    try {
      const r = await fazerPrevia({ nomeArquivo: arquivo.nome, texto: arquivo.texto, colunas: [...mapa.escolha] });
      if (!r.ok) { erro = r.mensagem; return; }
      previa = { importacaoId: r.dados.importacaoId, resumo: r.dados.resumo };
      onconferir();
    } finally { lendo = false; }
  }

  const r = $derived(previa?.resumo ?? null);
  const separador = (s: string) => (s === "\t" ? "tabulação" : `“${s}”`);
  const extras = $derived(mapa ? mapa.extras.filter(Boolean).length : 0);
</script>

{#snippet cartaoArquivo()}
  <section class="cartao" class:justo={celular}>
    <div class="topo">
      <h2>O arquivo</h2>
      {#if lendo}<span class="etq neutra">lendo…</span>{:else if previa && arquivo}<span class="etq verde">lido</span>{/if}
    </div>
    <label class="caixa-arq" class:vazia={!arquivo}>
      <input class="sv-escondido" type="file" accept=".csv,.txt,text/csv,text/plain" disabled={lendo} onchange={escolher} />
      <span class="ic-arq"><Icone nome="planilha" tam={24} traco={2} /></span>
      <span class="arq-txt">
        {#if arquivo}
          <span class="arq-nome">{arquivo.nome}</span>
          <span class="arq-sub">{#if r}{numero(r.total + r.vazias)} {plural(r.total + r.vazias, "linha", "linhas")} · separado por {separador(r.separador)} · {numero(r.totalColunas)} {plural(r.totalColunas, "coluna", "colunas")}{:else if lendo}lendo a planilha…{:else}a planilha não foi lida{/if}</span>
        {:else}
          <span class="arq-nome">Escolher a planilha</span>
          <span class="arq-sub">o CSV exportado pelo sistema pago</span>
        {/if}
      </span>
      <span class="trocar">{arquivo ? "Trocar" : "Escolher"}</span>
    </label>
    {#if !celular}<p class="ajuda">Do jeito que o sistema pago exporta. A planilha vai direto do computador para o sistema: nunca por e-mail ou conversa.</p>{/if}
    {#if erro}<Aviso tom="erro">{erro}</Aviso>{/if}
  </section>
{/snippet}

{#snippet botao()}
  <Botao tipo="ouro" icone="seta" largo ocupado={lendo} desligado={!(previa && !mudou) && (!arquivo || !mapa)} onclick={conferir}>Conferir os números</Botao>
{/snippet}

{#if celular}
  {@render cartaoArquivo()}
  <section class="cartao mapa-cel">
    <div class="topo"><h2>O mapa das colunas</h2></div>
    {#if mapa}<Mapa lista={mapa.lista} {campos} extras={mapa.extras} bind:escolha={mapa.escolha} celular desligado={lendo} />
    {:else}<Estado tipo="vazio" texto="As colunas aparecem aqui quando a planilha for lida." />{/if}
  </section>
  {@render botao()}
{:else}
  <div class="dois">
    <section class="cartao sem-pad">
      <div class="topo-mapa"><h2>O mapa das colunas</h2><span>cada coluna vai para um campo da ficha</span></div>
      {#if mapa}<Mapa lista={mapa.lista} {campos} extras={mapa.extras} bind:escolha={mapa.escolha} celular={false} desligado={lendo} />
      {:else}<div class="vazio"><Estado tipo="vazio" texto="As colunas aparecem aqui quando a planilha for lida." /></div>{/if}
    </section>
    <div class="col">
      {@render cartaoArquivo()}
      {#if r}
        <section class="cartao">
          <div class="topo"><h2>O que o sistema já entendeu</h2></div>
          <ul class="entendeu">
            <li><span class="ic azul"><Icone nome="igreja" tam={17} traco={2} /></span><span><strong>{numero(r.congregacoesReconhecidas)} {plural(r.congregacoesReconhecidas, "congregação reconhecida", "congregações reconhecidas")}</strong><small>“IEADESPA - GERAL” fica sem congregação</small></span></li>
            <li><span class="ic azul"><Icone nome="pessoas" tam={17} traco={2} /></span><span><strong>As linhas incompletas entram</strong><small>com o que tiverem; o resto se completa depois</small></span></li>
            <li><span class="ic ouro"><Icone nome="alerta" tam={17} traco={2} /></span><span><strong>O arrolamento não vem</strong><small>cada um entra com a pendência de completar</small></span></li>
            <li><span class="ic azul"><Icone nome="bandeja" tam={17} traco={2} /></span><span>
              {#if extras}<strong>{extras} {plural(extras, "coluna a mais", "colunas a mais")} (em amarelo)</strong><small>{extras === 1 ? "escolha o campo dela, ou “não usar”" : "escolha o campo de cada uma, ou “não usar”"}</small>
              {:else}<strong>Nenhuma coluna a mais</strong><small>as colunas de sempre já vêm ligadas</small>{/if}
            </span></li>
          </ul>
        </section>
      {/if}
      {@render botao()}
    </div>
  </div>
{/if}

<style>
  .dois { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .cartao { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: 14px; padding: 11px 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .cartao.justo { padding: 10px 12px; gap: 6px; }
  .cartao.sem-pad { padding: 0; gap: 0; overflow: hidden; }
  .mapa-cel { padding: 10px 12px; gap: 4px; }
  .topo { display: flex; align-items: center; gap: 8px; min-height: 24px; }
  h2 { font-size: 15px; font-weight: 700; color: var(--sv-titulo); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .topo-mapa { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px 8px; }
  .topo-mapa span { font-size: 12px; color: var(--sv-suave); }
  .vazio { padding: 10px 14px 14px; }
  .etq { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 12px; font-weight: 700; white-space: nowrap; flex: none; }
  .etq.verde { background: var(--imp-etq-verde-fundo); color: var(--imp-etq-verde); }
  .etq.neutra { border: 1px solid var(--sv-borda); color: var(--sv-suave); }
  .caixa-arq { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 12px; border: 1.5px dashed var(--sv-campo-borda); background: var(--sv-campo); cursor: pointer; }
  .caixa-arq:focus-within { outline: 3px solid var(--sv-ouro); outline-offset: 2px; }
  @media (hover: hover) { .caixa-arq:hover .trocar { text-decoration: underline; } }
  .ic-arq { color: var(--sv-mod); display: flex; }
  .arq-txt { flex: 1; min-width: 0; line-height: 1.35; display: flex; flex-direction: column; }
  .arq-nome { font-size: 13.5px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .arq-sub { font-size: 12px; color: var(--sv-suave); }
  .trocar { font-size: 12.5px; font-weight: 700; color: var(--sv-link); white-space: nowrap; }
  .ajuda { font-size: 12px; color: var(--sv-suave); line-height: 1.4; }
  .entendeu { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .entendeu li { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .entendeu li + li { border-top: 1px solid var(--sv-linha); }
  .entendeu li > span:last-child { flex: 1; min-width: 0; line-height: 1.3; display: flex; flex-direction: column; }
  .entendeu strong { font-size: 13px; font-weight: 600; color: var(--sv-titulo); }
  .entendeu small { font-size: 11.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ic { display: flex; }
  .ic.azul { color: var(--sv-mod); }
  .ic.ouro { color: var(--imp-ouro-texto); }
</style>
