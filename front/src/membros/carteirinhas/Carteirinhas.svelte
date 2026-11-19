<!-- 8. AS CARTEIRINHAS — a tela inicial (rodada 11, opção 1: os modelos em cartões grandes). A Secretaria Geral vê os modelos (editar abre o editor) e,
     embaixo, as carteirinhas de cada congregação; a secretaria local vê os modelos só para ver e a lista "para imprimir" da congregação dela, com o material
     (papel ou PVC) e frente e verso. No celular, as pílulas Modelos, Imprimir e Bloqueadas; os modelos se criam e se mudam no computador. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { numero, plural } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import Pilulas from "../../comum/Pilulas.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Campo from "../../comum/Campo.svelte";
  import CartaoFisico from "./CartaoFisico.svelte";
  import { imprimirCartoes } from "./imprimir";
  import { ir } from "../estado.svelte";
  import { EXEMPLO, ROTULO_PUBLICO, type ItemFila, type Material, type Modelo, type Publico, type Resumo, type RespostaImpressao } from "./tipos";

  interface Props { celular: boolean; congregacaoId: number | null; onnome: (n: string) => void }
  let { celular, congregacaoId, onnome }: Props = $props();

  const sessao = ponte().sessao();
  let modelos = $state<Modelo[] | null>(null);
  let erroModelos = $state("");
  let resumo = $state<Resumo | null>(null);
  let erroResumo = $state("");
  let fila = $state<ItemFila[] | null>(null);
  let erroFila = $state("");
  let marcados = $state<Set<number>>(new Set());
  let material = $state<Material>("PVC");
  let frenteVerso = $state(true);
  let enviando = $state(false);
  let recusas = $state<RespostaImpressao["recusadas"]>([]);
  let aba = $state<"modelos" | "imprimir" | "bloqueadas">("modelos");

  // qual congregação imprimir: a escolhida na tabela (Geral e área) ou a única do escopo (a local)
  const unica = $derived(resumo && !resumo.geral && resumo.congregacoes.length === 1 ? resumo.congregacoes[0] ?? null : null);
  const congAtual = $derived(congregacaoId ?? unica?.congregacaoId ?? null);
  const nomeCong = $derived(resumo?.congregacoes.find((c) => c.congregacaoId === congAtual)?.congregacao ?? "");
  const geral = $derived(resumo?.geral ?? sessao.geral);
  const visaoTabela = $derived(congAtual === null && !!resumo && (resumo.geral || resumo.congregacoes.length > 1));
  // o caminho do topo: "Modelos" na tabela; "Imprimir" na lista de uma congregação
  $effect(() => { onnome(congAtual === null ? (visaoTabela ? "Modelos" : "") : "Imprimir"); });

  async function lerModelos() {
    erroModelos = "";
    const r = await pedir<{ modelos: Modelo[] }>("/carteirinhas/modelos");
    if (r.ok) modelos = r.dados.modelos;
    else if (!r.cancelado) erroModelos = r.mensagem;
  }
  async function lerResumo() {
    erroResumo = "";
    const r = await pedir<Resumo>("/carteirinhas/resumo");
    if (r.ok) resumo = r.dados;
    else if (!r.cancelado) erroResumo = r.mensagem;
  }
  let seqFila = 0;
  async function lerFila(id: number) {
    const meu = ++seqFila;
    erroFila = "";
    const r = await pedir<{ itens: ItemFila[] }>("/carteirinhas/fila" + qs({ congregacaoId: id }));
    if (meu !== seqFila) return;
    if (r.ok) {
      fila = r.dados.itens;
      // já vêm marcadas as que podem sair
      marcados = new Set(r.dados.itens.filter((x) => !x.bloqueada && !x.soGeral).map((x) => x.membroId));
    } else if (!r.cancelado) erroFila = r.mensagem;
  }
  void lerModelos();
  void lerResumo();
  $effect(() => { const id = congAtual; if (id !== null) { fila = null; void lerFila(id); } });

  const ativos = $derived((modelos ?? []).filter((m) => m.ativo));
  const guardados = $derived((modelos ?? []).filter((m) => !m.ativo));
  const prontas = $derived((fila ?? []).filter((x) => !x.bloqueada));
  const bloqueadas = $derived((fila ?? []).filter((x) => x.bloqueada));
  const quantos = $derived([...marcados].filter((id) => prontas.some((x) => x.membroId === id && !x.soGeral)).length);

  function alternar(id: number) {
    const s = new Set(marcados);
    if (s.has(id)) s.delete(id); else s.add(id);
    marcados = s;
  }
  async function imprimir() {
    if (enviando || !quantos) return;
    enviando = true;
    recusas = [];
    const ids = [...marcados].filter((id) => prontas.some((x) => x.membroId === id && !x.soGeral));
    const r = await pedir<RespostaImpressao>("/carteirinhas/imprimir", { metodo: "POST", corpo: { membroIds: ids, material, frenteVerso } });
    enviando = false;
    if (!r.ok) {
      const corpo = r.corpo as { recusadas?: RespostaImpressao["recusadas"] } | null;
      recusas = corpo?.recusadas ?? [];
      avisarFalha(r);
      return;
    }
    recusas = r.dados.recusadas;
    await imprimirCartoes({ cartoes: r.dados.cartoes, modelos: r.dados.modelos, material: r.dados.material, frenteVerso: r.dados.frenteVerso });
    ponte().avisar(`${r.dados.cartoes.length} ${plural(r.dados.cartoes.length, "carteirinha registrada", "carteirinhas registradas")} como impressa${r.dados.cartoes.length === 1 ? "" : "s"}.`, "sucesso");
    if (congAtual !== null) void lerFila(congAtual);
    void lerResumo();
  }

  // ---- modelo novo (só a Geral) ----
  let novo = $state(false);
  let novoNome = $state("");
  let novoPublico = $state<Publico>("OUTRO");
  let criando = $state(false);
  let erroNovo = $state("");
  async function criar() {
    if (criando) return;
    criando = true;
    erroNovo = "";
    const r = await pedir<{ modeloId: number; mensagem: string }>("/carteirinhas/modelos", { metodo: "POST", corpo: { nome: novoNome, publico: novoPublico } });
    criando = false;
    if (!r.ok) { erroNovo = r.mensagem; return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    ir({ tela: "editor", modeloId: r.dados.modeloId });
  }
  let ativando = $state<number | null>(null);
  async function usar(m: Modelo) {
    if (ativando !== null) return;
    ativando = m.modeloId;
    const r = await pedir<{ mensagem: string }>(`/carteirinhas/ativar/${m.modeloId}`, { metodo: "POST" });
    ativando = null;
    if (!r.ok) { avisarFalha(r); return; }
    ponte().avisar(r.dados.mensagem, "sucesso");
    void lerModelos();
  }

  const exemplo = (m: Modelo) => ({ ...EXEMPLO, tipoRotulo: m.publico === "OBREIRO" ? "Obreiro" : ROTULO_PUBLICO[m.publico] });
  const tomTipo = (t: Publico) => (t === "CONGREGADO" ? "verde" : t === "OBREIRO" ? "roxo" : "azul");
  const modeloDoTipo = (t: Publico) => ativos.find((m) => m.publico === t)?.nome ?? ROTULO_PUBLICO[t];
  const totalBloq = $derived(resumo?.bloqueadas ?? 0);
</script>

{#snippet cartaoModelo(m: Modelo, grande: boolean)}
  <article class="modelo" class:guardado={!m.ativo}>
    {#if m.desenho}<div class="previa"><CartaoFisico desenho={m.desenho} lado="frente" dados={exemplo(m)} arte={m.arteFrente} mm={celular ? 3.85 : grande ? 3.3 : 2.45} sombra /></div>{/if}
    <strong>{m.nome}</strong>
    <small>{m.ativo ? (m.publico === "OUTRO" ? "não sai sozinho" : `usado por ${numero(m.usadoPor)}`) : `guardado · ${ROTULO_PUBLICO[m.publico].toLowerCase()}`}</small>
    {#if geral && !celular}
      <div class="acoes-modelo">
        <Botao tipo="linha" tam="pequeno" icone="lapis" onclick={() => ir({ tela: "editor", modeloId: m.modeloId })}>Editar o modelo</Botao>
        {#if !m.ativo}<Botao tipo="texto" tam="pequeno" ocupado={ativando === m.modeloId} onclick={() => usar(m)}>Usar este modelo</Botao>{/if}
      </div>
    {/if}
  </article>
{/snippet}

{#snippet listaModelos()}
  {#if erroModelos}<Estado tipo="erro" texto={erroModelos} ontentar={lerModelos} />
  {:else if !modelos}<Estado tipo="carregando" linhas={3} />
  {:else}
    <div class="modelos" class:local={!geral}>
      {#each ativos as m (m.modeloId)}{@render cartaoModelo(m, !geral)}{/each}
      {#if geral && !celular}
        <button type="button" class="modelo novo" onclick={() => (novo = true)}><span class="mais"><Icone nome="mais" tam={26} traco={2.4} /></span><strong>Novo modelo</strong><small>ex.: visitante</small></button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet listaGuardados()}
  {#if geral && guardados.length && !celular}
    <h4 class="secao">Modelos guardados (não saem sozinhos)</h4>
    <div class="modelos menores">{#each guardados as m (m.modeloId)}{@render cartaoModelo(m, false)}{/each}</div>
  {/if}
{/snippet}

{#snippet formNovo()}
  {#if novo}
    <div class="novo-form">
      <h4>Novo modelo</h4>
      <div class="linha-form">
        <Campo rotulo="Nome do modelo" valor={novoNome} oninput={(v) => (novoNome = v)} dica="ex.: Visitante, Membro 2027" />
        <div class="para"><span class="rot">Para quem</span>
          <Opcoes rotulo="Para quem é o modelo" valor={novoPublico} onescolher={(v) => (novoPublico = v)}
            opcoes={[{ valor: "MEMBRO", rotulo: "Membro" }, { valor: "CONGREGADO", rotulo: "Congregado" }, { valor: "OBREIRO", rotulo: "Obreiro" }, { valor: "OUTRO", rotulo: "Outro" }]} />
        </div>
      </div>
      {#if erroNovo}<Aviso tom="erro">{erroNovo}</Aviso>{/if}
      <div class="botoes"><Botao tipo="texto" onclick={() => { novo = false; erroNovo = ""; }}>Cancelar</Botao><Botao tipo="ouro" icone="check" ocupado={criando} onclick={criar}>Criar e abrir o editor</Botao></div>
    </div>
  {/if}
{/snippet}

{#snippet tabela()}
  {#if erroResumo}<Estado tipo="erro" texto={erroResumo} ontentar={lerResumo} />
  {:else if !resumo}<Estado tipo="carregando" linhas={4} />
  {:else if !resumo.congregacoes.length}<Estado tipo="vazio" texto="Nenhuma congregação com gente no rol no seu escopo." />
  {:else if celular}
    <div class="caixa lista-cong">
      {#each resumo.congregacoes as l (l.congregacaoId)}
        <button type="button" class="cong" onclick={() => ir({ tela: "carteirinhas", congregacaoId: l.congregacaoId })}>
          <span><strong>{l.congregacao}</strong><small>{l.area ?? "sem área"} · {numero(l.prontas)} para imprimir</small></span>
          {#if l.bloqueadas}<span class="chip-bloq">{l.bloqueadas} com pendência</span>{/if}<Icone nome="seta" tam={18} />
        </button>
      {/each}
    </div>
  {:else}
    <div class="caixa">
      <table>
        <thead><tr><th>Congregação</th><th>Área</th><th>Prontas para imprimir</th><th>Bloqueadas</th><th aria-label="Abrir"></th></tr></thead>
        <tbody>
          {#each resumo.congregacoes as l (l.congregacaoId)}
            <tr>
              <td class="forte">{l.congregacao}</td><td>{l.area ?? "—"}</td><td class="sv-num">{numero(l.prontas)}</td>
              <td>{#if l.bloqueadas}<span class="chip-bloq">{l.bloqueadas} com pendência</span>{:else}—{/if}</td>
              <td class="ver"><button type="button" class="link" onclick={() => ir({ tela: "carteirinhas", congregacaoId: l.congregacaoId })}>Ver ›</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#snippet barraBloqueio()}
  {#if totalBloq > 0}
    <div class="barra-bloq" role="note">
      <Icone nome="cadeado" tam={16} traco={2} />
      <p><strong>{totalBloq} {plural(totalBloq, "carteirinha bloqueada", "carteirinhas bloqueadas")} {geral ? "na Igreja" : "no seu escopo"}: resolva antes de imprimir.</strong>
        {resumo?.repetidas ? `${resumo.repetidas} ${plural(resumo.repetidas, "ficha repetida", "fichas repetidas")}` : ""}{resumo?.repetidas && resumo?.numeros ? " e " : ""}{resumo?.numeros ? `${resumo.numeros} ${plural(resumo.numeros, "número de matrícula", "números de matrícula")} a acertar` : ""} — nunca sai carteirinha com o número de duas pessoas.</p>
      <button type="button" class="link forte" onclick={() => ir({ tela: "repetidas" }, true)}>Resolver ›</button>
    </div>
  {/if}
{/snippet}

{#snippet linhaFila(x: ItemFila)}
  <li class:bloq={x.bloqueada}>
    {#if x.bloqueada}<span class="trava" title="Bloqueada"><Icone nome="cadeado" tam={18} traco={2} /></span>
    {:else}<input type="checkbox" checked={marcados.has(x.membroId) && !x.soGeral} disabled={x.soGeral} onchange={() => alternar(x.membroId)} aria-label="Imprimir a de {x.nome}" />{/if}
    <span class="av"><Avatar nome={x.nome} tam={30} /></span>
    <button type="button" class="nome" onclick={() => ir({ tela: "ficha", id: x.membroId, secao: "documentos" })}>{x.nome}</button>
    {#if x.bloqueada}<span class="chip-tipo bloq">bloqueada</span>
    {:else}<span class="chip-tipo {tomTipo(x.tipo)}">modelo {modeloDoTipo(x.tipo).replace(/^Credencial de /, "").replace(/^./, (c) => c.toUpperCase())}</span>{/if}
    <span class="detalhe">{x.detalhe}{x.soGeral ? " · a Secretaria Geral imprime" : ""}</span>
  </li>
{/snippet}

{#snippet painelImpressao()}
  <aside class="caixa painel-imp">
    <span class="rot">Material</span>
    <Opcoes rotulo="Material" valor={material} onescolher={(v) => (material = v)} opcoes={[{ valor: "PAPEL", rotulo: "Papel" }, { valor: "PVC", rotulo: "PVC" }]} />
    <span class="rot">Impressão</span>
    <Opcoes rotulo="Impressão" valor={frenteVerso ? "fv" : "f"} onescolher={(v) => (frenteVerso = v === "fv")} opcoes={[{ valor: "f", rotulo: "Só frente" }, { valor: "fv", rotulo: "Frente e verso" }]} />
    <Botao tipo="ouro" icone="check" largo desligado={!quantos} ocupado={enviando} onclick={imprimir}>Imprimir {quantos || ""}</Botao>
    <small>Vai direto para a impressora; nenhum arquivo fica guardado. O modelo sai sozinho pelo tipo da pessoa.</small>
    {#if recusas.length}
      <Aviso tom="alerta">{#each recusas as r (r.membroId)}<span class="recusa">{r.nome ?? `Matrícula ${r.membroId}`}: {r.mensagem}</span>{/each}</Aviso>
    {/if}
  </aside>
{/snippet}

{#snippet imprimirCong(soBloqueadas: boolean)}
  {#if erroFila}<Estado tipo="erro" texto={erroFila} ontentar={() => congAtual !== null && lerFila(congAtual)} />
  {:else if !fila}<Estado tipo="carregando" linhas={4} />
  {:else}
    {@const lista = soBloqueadas ? bloqueadas : [...prontas, ...bloqueadas]}
    {#if !lista.length}<Estado tipo="vazio" texto={soBloqueadas ? "Nenhuma carteirinha bloqueada aqui." : "Todo mundo já tem a sua carteirinha. Quem entrar, mudar de tipo ou pedir segunda via aparece aqui."} />
    {:else}<ul class="caixa fila">{#each lista as x (x.membroId)}{@render linhaFila(x)}{/each}</ul>{/if}
  {/if}
{/snippet}

<div class="pilha" class:celular>
  {#if celular}
    <Pilulas rotulo="Carteirinhas" ativa={aba} onescolher={(k) => (aba = k)} cheias={false}
      itens={[{ chave: "modelos", rotulo: "Modelos" }, { chave: "imprimir", rotulo: "Imprimir" }, { chave: "bloqueadas", rotulo: "Bloqueadas", n: (congAtual !== null ? bloqueadas.length : totalBloq) || undefined }]} />
    {#if aba === "modelos"}
      <Aviso tom="info"><strong>Os modelos se criam e se mudam no computador.</strong> Aqui você confere como estão.</Aviso>
      {@render listaModelos()}
    {:else if aba === "imprimir"}
      {#if congAtual === null && visaoTabela}{@render tabela()}
      {:else if congAtual !== null}
        {#if nomeCong}<p class="onde"><Icone nome="igreja" tam={16} /> {nomeCong}</p>{/if}
        {@render imprimirCong(false)}{#if fila?.length}{@render painelImpressao()}{/if}
      {:else if resumo}<Estado tipo="vazio" texto="Nenhuma congregação no seu escopo." />{:else}<Estado tipo="carregando" linhas={3} />{/if}
    {:else}
      {#if congAtual !== null}{@render imprimirCong(true)}{:else}{@render barraBloqueio()}{#if !totalBloq}<Estado tipo="vazio" texto="Nenhuma carteirinha bloqueada." />{/if}{/if}
    {/if}
  {:else if visaoTabela}
    <Cabecalho titulo="Carteirinhas" sub="Os modelos da Igreja em cima (a Secretaria Geral cria e muda); embaixo, as carteirinhas de cada congregação">
      {#snippet acoes()}{#if geral}<Botao tipo="ouro" icone="mais" onclick={() => (novo = true)}>Novo modelo</Botao>{/if}{/snippet}
    </Cabecalho>
    {@render formNovo()}
    <h4 class="secao">Os modelos{geral ? " (editar abre o editor)" : " da Igreja (só para ver)"}</h4>
    {@render listaModelos()}
    <h4 class="secao">As carteirinhas das congregações</h4>
    {@render tabela()}
    {@render barraBloqueio()}
    {@render listaGuardados()}
  {:else}
    <Cabecalho titulo="Carteirinhas" sub={nomeCong ? `${nomeCong} · os modelos são da Secretaria Geral; aqui você imprime as suas` : "Os modelos são da Secretaria Geral; aqui você imprime as suas"}>
      {#snippet acoes()}
        {#if congregacaoId !== null && (geral || (resumo?.congregacoes.length ?? 0) > 1)}<Botao tipo="linha" icone="voltar" onclick={() => ir({ tela: "carteirinhas", congregacaoId: null }, true)}>Todas as congregações</Botao>{/if}
        {#if nomeCong}<span class="trancada"><Icone nome="cadeado" tam={16} traco={2} />{nomeCong}</span>{/if}
      {/snippet}
    </Cabecalho>
    {@render formNovo()}
    <h4 class="secao">Os modelos da Igreja{geral ? " (editar abre o editor)" : " (só para ver)"}</h4>
    {@render listaModelos()}
    {#if congAtual === null}
      {#if erroResumo}<Estado tipo="erro" texto={erroResumo} ontentar={lerResumo} />{:else if resumo}<Estado tipo="vazio" texto="Nenhuma congregação com gente no rol no seu escopo." />{:else}<Estado tipo="carregando" linhas={3} />{/if}
    {:else}
      <div class="dupla">
        <section class="col">
          <h4 class="secao">Para imprimir{nomeCong ? ` em ${nomeCong}` : ""}</h4>
          {@render imprimirCong(false)}
        </section>
        {@render painelImpressao()}
      </div>
    {/if}
  {/if}
</div>

<style>
  .pilha { display: flex; flex-direction: column; gap: 14px; }
  .secao { margin: 4px 0 -4px; font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); font-weight: 700; }
  .modelos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(140px, .6fr); gap: 14px; }
  .modelos.local { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .modelos.menores { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .modelo { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 12px 12px 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; min-width: 0; }
  .modelo.guardado { opacity: .9; }
  .modelo strong { color: var(--sv-titulo); font-size: 15px; margin-top: 8px; }
  .modelo small { color: var(--sv-suave); font-size: 13px; }
  .previa { display: flex; justify-content: center; max-width: 100%; overflow: hidden; }
  .acoes-modelo { display: flex; flex-direction: column; gap: 4px; align-items: center; margin-top: 8px; }
  .modelo.novo { border: 2px dashed var(--sv-campo-borda); background: transparent; justify-content: center; cursor: pointer; font: inherit; color: var(--sv-link); }
  .modelo.novo strong { color: var(--sv-link); margin-top: 2px; }
  .modelo.novo:hover { background: var(--sv-sup); }
  .mais { color: var(--sv-link); }
  .caixa { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  th { text-align: left; font-size: 13px; color: var(--sv-suave); font-weight: 600; padding: 10px 16px; border-bottom: 1px solid var(--sv-borda); background: var(--sv-campo); }
  th:first-child { border-top-left-radius: var(--sv-raio); }
  th:last-child { border-top-right-radius: var(--sv-raio); }
  td { padding: 11px 16px; border-bottom: 1px solid var(--sv-linha); }
  tr:last-child td { border-bottom: 0; }
  .forte { font-weight: 700; color: var(--sv-titulo); }
  .ver { text-align: right; }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--sv-link); font-weight: 700; cursor: pointer; }
  .link.forte { color: var(--sv-atr); white-space: nowrap; }
  .chip-bloq { display: inline-block; background: var(--sv-atr-fundo); color: var(--sv-atr); font-weight: 700; font-size: 12.5px; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
  .barra-bloq { display: flex; align-items: center; gap: 10px; background: var(--sv-atr-fundo); border: 1px solid #FCA5A5; color: var(--sv-atr); border-radius: 12px; padding: 10px 14px; font-size: 13.5px; }
  .barra-bloq p { margin: 0; flex: 1; }
  .dupla { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .fila { list-style: none; margin: 0; padding: 4px 16px; }
  .fila li { display: grid; grid-template-columns: 22px 34px minmax(0, 1fr) auto minmax(0, 1.2fr); align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--sv-linha); }
  .fila li:last-child { border-bottom: 0; }
  .fila input { width: 18px; height: 18px; accent-color: var(--sv-marinho); }
  .fila .nome { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--sv-titulo); text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fila li.bloq .nome { color: var(--sv-suave); }
  .trava { color: var(--sv-atr); display: flex; }
  .chip-tipo { font-size: 12.5px; font-weight: 700; padding: 2px 10px; border-radius: 999px; white-space: nowrap; justify-self: end; }
  .chip-tipo.azul { background: var(--sv-mod-fundo); color: var(--sv-mod); }
  .chip-tipo.verde { background: #D1FAE5; color: #047857; }
  .chip-tipo.roxo { background: #EDE9FE; color: #6D28D9; }
  .chip-tipo.bloq { background: var(--sv-atr-fundo); color: var(--sv-atr); }
  .detalhe { color: var(--sv-suave); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li.bloq .detalhe { color: var(--sv-atr); }
  .painel-imp { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .painel-imp .rot, .para .rot { font-size: 12.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); font-weight: 700; }
  .painel-imp small { color: var(--sv-suave); font-size: 12.5px; line-height: 1.4; }
  .recusa { display: block; }
  .trancada { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--sv-borda); background: var(--sv-sup); border-radius: 10px; padding: 8px 14px; font-weight: 700; color: var(--sv-titulo); }
  .novo-form { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .novo-form h4 { margin: 0; color: var(--sv-titulo); }
  .linha-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: end; }
  .para { display: flex; flex-direction: column; gap: 6px; }
  .botoes { display: flex; justify-content: flex-end; gap: 8px; }
  .onde { margin: 0; display: flex; align-items: center; gap: 6px; font-weight: 700; color: var(--sv-titulo); }
  .lista-cong { display: flex; flex-direction: column; }
  .cong { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: none; border: 0; border-bottom: 1px solid var(--sv-linha); font: inherit; text-align: left; cursor: pointer; color: var(--sv-texto); }
  .cong:last-child { border-bottom: 0; }
  .cong span:first-child { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .cong strong { color: var(--sv-titulo); }
  .cong small { color: var(--sv-suave); }
  .celular .modelos { grid-template-columns: 1fr; }
  .celular .fila li { grid-template-columns: 22px 32px minmax(0, 1fr) auto; }
  .celular .fila .detalhe { grid-column: 3 / -1; white-space: normal; }
  @media (max-width: 1100px) { .dupla { grid-template-columns: 1fr; } }
</style>
