<!-- 2. A LISTA DE PESSOAS (rodada 9, opção 1 "confortável"): a busca que filtra enquanto se digita (com o realce do que bate), os filtros numa
     linha em chips (o nível, a situação e o departamento), a tabela ordenada pelo cabeçalho e "Mostrar 20 / 40 / 80 por página". No celular, cartões. -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { numero, partesRealce } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, escopo, departamentos, cuidaDoCadastro } from "../estado.svelte";
  import { SITUACOES, situacaoDe } from "../rotulos";
  import type { Departamento, PaginaPessoas, PessoaLista, ResumoPainel } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const sessao = ponte().sessao();
  type Ordem = "nome" | "matricula" | "congregacao" | "area" | "situacao" | "cargo" | "departamento";
  const filtro = $state({ busca: "", congregacaoId: null as number | null, situacao: null as string | null, departamentoId: null as number | null, porPagina: 20, pagina: 1, ordem: "nome" as Ordem, desc: false });
  let dados = $state<PaginaPessoas | null>(null);
  let carregando = $state(true);
  let erro = $state("");
  let deps = $state<readonly Departamento[]>([]);
  let resumo = $state<ResumoPainel | null>(escopo.resumo);
  let buscaDigitada = $state("");
  let espera: ReturnType<typeof setTimeout> | null = null;
  let controle: AbortController | null = null;

  void departamentos().then((d) => (deps = d));
  if (!escopo.resumo) void pedir<{ resumo: ResumoPainel }>("/pessoas" + qs({ resumo: 1 })).then((r) => { if (r.ok) { resumo = r.dados.resumo; escopo.resumo = r.dados.resumo; } });

  const congregacoes = $derived(resumo?.congregacoes ?? []);
  const varias = $derived(congregacoes.length > 1);
  const nomeDep = (id: number | null) => (id === null ? "" : deps.find((d) => d.departamentoId === id)?.nome ?? "");
  const totalRol = $derived(resumo?.total ?? 0);

  async function carregar() {
    controle?.abort();
    const c = new AbortController();
    controle = c;
    carregando = true;
    erro = "";
    const situacao = filtro.situacao === "SAIDAS" ? null : filtro.situacao;
    const r = await pedir<PaginaPessoas>("/pessoas" + qs({
      pagina: filtro.pagina, porPagina: filtro.porPagina, busca: filtro.busca.trim(), congregacaoId: filtro.congregacaoId, situacao,
      departamentoId: filtro.departamentoId, rol: filtro.situacao === "SAIDAS" ? "saidas" : "1", ordem: filtro.ordem, direcao: filtro.desc ? "desc" : "asc"
    }), { sinal: c.signal });
    if (c !== controle) return;
    carregando = false;
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    dados = r.dados;
  }
  $effect(() => {
    // relê quando qualquer filtro muda (a busca chega aqui já com a espera de 250 ms)
    void [filtro.busca, filtro.congregacaoId, filtro.situacao, filtro.departamentoId, filtro.porPagina, filtro.pagina, filtro.ordem, filtro.desc];
    void carregar();
  });
  function digitou(v: string) {
    buscaDigitada = v;
    if (espera) clearTimeout(espera);
    espera = setTimeout(() => { filtro.pagina = 1; filtro.busca = v; }, 250);
  }
  function ordenar(o: Ordem) {
    if (filtro.ordem === o) filtro.desc = !filtro.desc;
    else { filtro.ordem = o; filtro.desc = false; }
    filtro.pagina = 1;
  }
  const total = $derived(dados?.total ?? 0);
  const paginas = $derived(Math.max(1, Math.ceil(total / filtro.porPagina)));
  const ini = $derived(total ? (filtro.pagina - 1) * filtro.porPagina + 1 : 0);
  const fim = $derived(Math.min(total, filtro.pagina * filtro.porPagina));
  const numerosPaginas = $derived.by(() => {
    const p = filtro.pagina, n = paginas;
    const s = new Set([1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
    return [...s].sort((a, b) => a - b);
  });
  const sub = $derived.by(() => {
    const lugar = filtro.congregacaoId !== null ? `Congregação ${congregacoes.find((c) => c.congregacaoId === filtro.congregacaoId)?.nome ?? ""}`
      : sessao.geral ? "Igreja toda" : congregacoes.length === 1 && congregacoes[0] ? `Congregação ${congregacoes[0].nome}` : "A área toda";
    return `${lugar} · ${numero(totalRol)} no rol`;
  });
  const colunas = $derived<readonly { chave: Ordem; rot: string }[]>(varias
    ? [{ chave: "nome", rot: "Nome" }, { chave: "matricula", rot: "Matrícula" }, { chave: "congregacao", rot: "Congregação" }, { chave: "area", rot: "Área" }, { chave: "situacao", rot: "Situação" }, { chave: "cargo", rot: "Cargo" }]
    : [{ chave: "nome", rot: "Nome" }, { chave: "matricula", rot: "Matrícula" }, { chave: "departamento", rot: "Departamento" }, { chave: "situacao", rot: "Situação" }, { chave: "cargo", rot: "Cargo" }]);
  const abrir = (p: PessoaLista) => ir({ tela: "ficha", id: p.membroId, secao: "resumo" });
  const rodape = $derived(filtro.busca.trim()
    ? (total <= filtro.porPagina ? `${numero(total)} ${total === 1 ? "pessoa" : "pessoas"} com "${filtro.busca.trim()}" · todas nesta página` : `${numero(ini)} a ${numero(fim)} de ${numero(total)} com "${filtro.busca.trim()}"`)
    : total ? `${numero(ini)} a ${numero(fim)} de ${numero(total)}` : "");
</script>

{#snippet nomeRealcado(nome: string)}
  {#each partesRealce(nome, filtro.busca) as pedaco, i (i)}{#if pedaco.marca}<mark>{pedaco.t}</mark>{:else}{pedaco.t}{/if}{/each}
{/snippet}

{#snippet filtros()}
  <div class="filtros">
    <label class="busca">
      <Icone nome="busca" tam={20} traco={2.2} />
      <span class="sv-escondido">Procurar na lista: nome, matrícula ou CPF</span>
      <input type="search" value={buscaDigitada} placeholder="Nome, matrícula ou CPF" autocomplete="off" enterkeyhint="search"
        oninput={(e) => digitou((e.currentTarget as HTMLInputElement).value)} />
      {#if dados}<span class="conta sv-num">{numero(total)} de {numero(totalRol)}</span>{/if}
    </label>
    {#if varias}
      <Escolha rotulo={sessao.geral ? "Igreja toda" : "A área toda"} icone="mapa" valor={filtro.congregacaoId} limpavel
        opcoes={congregacoes.map((c) => ({ valor: c.congregacaoId, rotulo: c.nome, sub: numero(c.total) }))} onescolher={(v) => { filtro.congregacaoId = v; filtro.pagina = 1; }} />
    {:else if congregacoes[0]}
      <Escolha rotulo={congregacoes[0].nome} icone="cadeado" estilo="trava" valor={null} opcoes={[]} onescolher={() => {}} />
    {/if}
    <Escolha rotulo="Situação" prefixo="Situação: " valor={filtro.situacao} limpavel opcoes={SITUACOES} onescolher={(v) => { filtro.situacao = v; filtro.pagina = 1; }} />
    {#if deps.length}
      <Escolha rotulo="Departamento" valor={filtro.departamentoId} limpavel opcoes={deps.map((d) => ({ valor: d.departamentoId, rotulo: d.nome }))} onescolher={(v) => { filtro.departamentoId = v; filtro.pagina = 1; }} />
    {/if}
  </div>
{/snippet}

{#snippet dica()}
  <p class="dica">Esta busca filtra só esta lista enquanto você digita. O <strong>Ctrl K</strong>, lá em cima, procura no sistema todo (pessoas, relatórios, eventos).</p>
{/snippet}

<div class="pessoas" class:celular>
  {#if !celular}
    <Cabecalho titulo="Pessoas" {sub}>
      {#snippet acoes()}{#if cuidaDoCadastro()}<Botao tipo="ouro" icone="mais" onclick={() => ir({ tela: "cadastrar" }, true)}>Cadastrar pessoa</Botao>{/if}{/snippet}
    </Cabecalho>
  {/if}
  {@render filtros()}
  {#if !celular}{@render dica()}{/if}

  {#if erro}
    <Estado tipo="erro" texto={erro} ontentar={carregar} />
  {:else if !dados && carregando}
    <div class="caixa"><div class="pad"><Estado tipo="carregando" linhas={6} /></div></div>
  {:else if dados && !dados.itens.length}
    <div class="caixa"><div class="pad"><Estado tipo="vazio" texto={filtro.busca ? "Ninguém com esse nome, matrícula ou CPF nesta lista." : "Ninguém com esses filtros."} /></div></div>
  {:else if dados}
    {#if celular}
      <ul class="cartoes" class:apagado={carregando}>
        {#each dados.itens as p (p.membroId)}
          {@const s = situacaoDe(p)}
          <li><button type="button" onclick={() => abrir(p)}>
            <Avatar nome={p.nome} foto={p.fotoUrl} tam={40} />
            <span class="cn"><strong>{@render nomeRealcado(p.nome)}</strong><small class="sv-num">{p.membroId}{nomeDep(p.departamentoId) ? " · " + nomeDep(p.departamentoId) : ""}</small></span>
            <Chip tom={s.tom}>{s.rotulo}</Chip>
          </button></li>
        {/each}
      </ul>
      <p class="mostrando">Mostrando {numero(fim - ini + 1)} de {numero(total)}</p>
      {#if paginas > 1}
        <div class="pag-cel">
          <Botao tipo="linha" tam="pequeno" desligado={filtro.pagina <= 1} onclick={() => filtro.pagina--}>Anteriores</Botao>
          <span class="sv-num">{filtro.pagina} de {paginas}</span>
          <Botao tipo="linha" tam="pequeno" desligado={filtro.pagina >= paginas} onclick={() => filtro.pagina++}>Próximas</Botao>
        </div>
      {/if}
      {@render dica()}
    {:else}
      <div class="caixa">
        <table class:apagado={carregando}>
          <thead><tr>
            {#each colunas as c (c.chave)}
              <th aria-sort={filtro.ordem === c.chave ? (filtro.desc ? "descending" : "ascending") : "none"}>
                <button type="button" onclick={() => ordenar(c.chave)}>{c.rot}{#if filtro.ordem === c.chave}<span class="seta" class:desc={filtro.desc} aria-hidden="true">↑</span>{/if}</button>
              </th>
            {/each}
          </tr></thead>
          <tbody>
            {#each dados.itens as p (p.membroId)}
              {@const s = situacaoDe(p)}
              <tr onclick={() => abrir(p)}>
                <td><button type="button" class="nome" onclick={(e) => { e.stopPropagation(); abrir(p); }}><Avatar nome={p.nome} foto={p.fotoUrl} tam={28} /><span>{@render nomeRealcado(p.nome)}</span></button></td>
                <td class="sv-num">{p.membroId}</td>
                {#if varias}<td>{p.congregacao ?? "—"}</td><td>{p.areaNome ?? "—"}</td>{:else}<td>{nomeDep(p.departamentoId) || "—"}</td>{/if}
                <td><Chip tom={s.tom}>{s.rotulo}</Chip></td>
                <td>{p.funcao || "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="rodape">
          <span>{rodape}</span>
          <div class="por-pag">
            <span>Mostrar</span>
            <div class="seg" role="radiogroup" aria-label="Quantos por página">
              {#each [20, 40, 80] as n (n)}<button type="button" role="radio" aria-checked={filtro.porPagina === n} onclick={() => { filtro.porPagina = n; filtro.pagina = 1; }}>{n}</button>{/each}
            </div>
            <span>por página</span>
            {#if paginas > 1}
              <nav class="pags" aria-label="Páginas">
                <button type="button" aria-label="Página anterior" disabled={filtro.pagina <= 1} onclick={() => filtro.pagina--}>‹</button>
                {#each numerosPaginas as n, i (n)}
                  {#if i > 0 && n - (numerosPaginas[i - 1] ?? n) > 1}<span class="gap">…</span>{/if}
                  <button type="button" class:atual={n === filtro.pagina} aria-current={n === filtro.pagina ? "page" : undefined} onclick={() => (filtro.pagina = n)}>{n}</button>
                {/each}
                <button type="button" aria-label="Próxima página" disabled={filtro.pagina >= paginas} onclick={() => filtro.pagina++}>›</button>
              </nav>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .pessoas { display: flex; flex-direction: column; gap: 12px; }
  .filtros { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .busca {
    display: flex; align-items: center; gap: 10px; height: 46px; width: 368px; max-width: 100%; padding: 0 14px; border: 2px solid var(--sv-titulo); border-radius: 12px;
    background: var(--sv-sup); color: var(--sv-titulo);
  }
  :global(html[data-tema="escuro"]) .busca { border-color: var(--sv-ouro); }
  .busca input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 0; height: 40px; border-radius: 0; background: transparent; color: var(--sv-titulo); font: inherit; font-size: 16px; }
  .busca:focus-within { box-shadow: 0 0 0 3px rgba(255, 184, 0, .45); }
  .conta { font-size: 13px; color: var(--sv-suave); white-space: nowrap; }
  .dica { font-size: 13px; color: var(--sv-suave); }
  .dica strong { color: var(--sv-texto); }
  .caixa { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); overflow: hidden; }
  .pad { padding: 14px 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; transition: opacity .15s ease; }
  .apagado { opacity: .55; }
  th { text-align: left; font-size: 14px; font-weight: 600; color: var(--sv-suave); padding: 0; background: var(--sv-campo); border-bottom: 1px solid var(--sv-borda); }
  th button { display: flex; align-items: center; gap: 4px; width: 100%; height: 40px; padding: 0 18px; border: 0; background: transparent; cursor: pointer; font-weight: 600; color: inherit; text-align: left; }
  th[aria-sort="ascending"] button, th[aria-sort="descending"] button { color: var(--sv-titulo); }
  .seta { display: inline-block; transition: transform .15s ease; }
  .seta.desc { transform: rotate(180deg); }
  td { padding: 0 18px; height: 51px; border-top: 1px solid var(--sv-linha); color: var(--sv-texto); }
  tbody tr:first-child td { border-top: 0; }
  tbody tr { cursor: pointer; }
  @media (hover: hover) { tbody tr:hover td { background: var(--sv-campo); } }
  .nome { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 0; cursor: pointer; font-weight: 700; color: var(--sv-titulo); text-align: left; }
  mark { background: #FDE68A; color: inherit; border-radius: 3px; padding: 0 1px; }
  :global(html[data-tema="escuro"]) mark { background: #7A5800; }
  .rodape { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 10px 16px; border-top: 1px solid var(--sv-linha); font-size: 13.5px; color: var(--sv-suave); flex-wrap: wrap; }
  .por-pag { display: flex; align-items: center; gap: 10px; color: var(--sv-texto); }
  .seg { display: flex; border: 1px solid var(--sv-borda); border-radius: 9px; overflow: hidden; }
  .seg button { width: 36px; height: 32px; border: 0; background: var(--sv-sup); font-weight: 700; font-size: 14px; cursor: pointer; color: var(--sv-titulo); }
  .seg button[aria-checked="true"] { background: var(--sv-escolha); color: var(--sv-escolha-texto); }
  .pags { display: flex; gap: 6px; align-items: center; margin-left: 10px; }
  .pags button { min-width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--sv-borda); background: var(--sv-sup); cursor: pointer; font-weight: 600; font-size: 13.5px; color: var(--sv-titulo); }
  .pags button.atual { background: var(--sv-escolha); color: var(--sv-escolha-texto); border-color: var(--sv-escolha); }
  .pags button:disabled { opacity: .4; cursor: default; }
  .gap { color: var(--sv-suave); }
  .celular .busca { width: 100%; }
  .celular .filtros { gap: 8px; }
  .cartoes { list-style: none; margin: 0; padding: 0 14px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .cartoes li + li { border-top: 1px solid var(--sv-linha); }
  .cartoes button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 62px; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 8px 0; }
  .cn { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .cn strong { font-size: 15.5px; color: var(--sv-titulo); }
  .cn small { font-size: 13px; color: var(--sv-suave); }
  .mostrando { font-size: 14px; color: var(--sv-suave); }
  .pag-cel { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--sv-texto); font-size: 14px; }
</style>
