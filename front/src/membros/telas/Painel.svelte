<!-- 1. O PAINEL EXECUTIVO (rodada 10): os 4 números do rol, o gráfico grande que cada um AJUSTA, os menores (entradas e saídas, como está
     o cadastro) e, à direita no notebook (no alto, numa faixa, no celular), os AVISOS SÓ DE MEMBROS com "só o que eu preciso resolver". -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { numero, pct, mesCurto, mesLongo } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Cartao from "../../comum/Cartao.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import { ir, escopo, contadores, cuidaDoCadastro } from "../estado.svelte";
  import type { Agrupamento, LugarArrolamento, PainelArrolamento, PaginaTransferencias, Recorte, ResumoPainel } from "../tipos";
  import { lerAlerta, montarAvisos, type AlertaAssembleia } from "../avisos";
  import { montarGrafico } from "../grafico";
  import { corDoDepartamento, diaMes, diaPorExtenso, fraseResto, fraseSemCongregacao, hojeIso, lerPainelArrol, pctAndamento } from "../arrolamento";
  import type { Transferencia } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const sessao = ponte().sessao();
  let congregacaoId = $state<number | null>(null);
  let resumo = $state<ResumoPainel | null>(null);
  let erro = $state("");
  let chegando = $state<Transferencia[]>([]);
  let alerta = $state<AlertaAssembleia | null>(null);
  // ---- o 4º grupo (rodada 28): quem veio do sistema pago e ainda espera a secretaria completar (GET /api/arrolamento) ----
  let arrol = $state<PainelArrolamento | null>(null);
  let arrolErro = $state("");
  let todas = $state(false);
  // os avisos se refazem sozinhos quando os contadores do menu chegam ou mudam
  const avisos = $derived(resumo ? montarAvisos(resumo, chegando, alerta, contadores, sessao.geral, cuidaDoCadastro() ? abrirArrolamento : null) : []);
  let soMeu = $state(true);

  // ---- o gráfico grande: o que mostrar e como agrupar ficam guardados neste aparelho ----
  const CHAVE = "ieadespaMembrosGrafico";
  const RECORTES: readonly { valor: Recorte; rotulo: string; sim: string; nao: string }[] = [
    { valor: "es", rotulo: "batismo no Espírito Santo", sim: "Batizados no Espírito Santo", nao: "Ainda não" },
    { valor: "aguas", rotulo: "batismo nas águas", sim: "Batizados nas águas", nao: "Ainda não" },
    { valor: "cpf", rotulo: "com CPF", sim: "Com CPF", nao: "Sem CPF" },
    { valor: "comunhao", rotulo: "em comunhão", sim: "Em comunhão", nao: "Fora da comunhão" },
    { valor: "completo", rotulo: "cadastro completo", sim: "Cadastro completo", nao: "Incompleto" }
  ];
  const AGRUPAR: readonly { valor: Agrupamento; rotulo: string }[] = [
    { valor: "departamento", rotulo: "departamento" }, { valor: "congregacao", rotulo: "congregação" }, { valor: "faixa", rotulo: "faixa etária" }, { valor: "sexo", rotulo: "sexo" }
  ];
  interface Ajuste { recorte: Recorte; agrupar: Agrupamento; modo: "qtd" | "pct" }
  function lerAjuste(): Ajuste {
    try {
      const o: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
      if (o && typeof o === "object") {
        const a = o as Partial<Ajuste>;
        return { recorte: RECORTES.some((r) => r.valor === a.recorte) ? a.recorte! : "es", agrupar: AGRUPAR.some((g) => g.valor === a.agrupar) ? a.agrupar! : "departamento", modo: a.modo === "pct" ? "pct" : "qtd" };
      }
    } catch { /* sem armazenamento */ }
    return { recorte: "es", agrupar: "departamento", modo: "qtd" };
  }
  let ajuste = $state<Ajuste>(lerAjuste());
  let gaveta = $state(false);
  function guardar(a: Partial<Ajuste>) {
    ajuste = { ...ajuste, ...a };
    try { localStorage.setItem(CHAVE, JSON.stringify(ajuste)); } catch { /* vale só nesta visita */ }
  }
  const rec = $derived(RECORTES.find((r) => r.valor === ajuste.recorte) ?? RECORTES[0]!);
  const agr = $derived(AGRUPAR.find((g) => g.valor === ajuste.agrupar) ?? AGRUPAR[0]!);
  // todo grupo com gente entra (a legenda soma o rol do alto); "Sem departamento" sempre visível, por último; o excesso vira "Outros (n)"
  const grafico = $derived(montarGrafico(resumo?.grupos[ajuste.agrupar] ?? [], ajuste.recorte, 6));
  const linhasGraf = $derived(grafico.linhas);
  const totSim = $derived(grafico.sim);
  const totNao = $derived(grafico.nao);
  const maxMov = $derived(Math.max(1, ...(resumo?.movimento ?? []).flatMap((m) => [m.entradas, m.saidas])));
  const totEnt = $derived((resumo?.movimento ?? []).reduce((a, m) => a + m.entradas, 0));
  const totSai = $derived((resumo?.movimento ?? []).reduce((a, m) => a + m.saidas, 0));

  let seq = 0;
  async function carregar() {
    erro = "";
    const meu = ++seq;
    const pedida = congregacaoId;   // o escopo do módulo só vem do painel SEM filtro (nunca da congregação escolhida)
    const [r, tr, al, ar] = await Promise.all([
      pedir<{ resumo: ResumoPainel }>("/pessoas" + qs({ resumo: 1, congregacaoId: pedida })),
      cuidaDoCadastro() ? pedir<PaginaTransferencias>("/transferencias" + qs({ caixa: "chegando", porPagina: 20 })) : Promise.resolve(null),
      lerAlerta(sessao.geral),
      cuidaDoCadastro() ? pedir<unknown>("/arrolamento" + qs({ congregacaoId: pedida })) : Promise.resolve(null)
    ]);
    if (meu !== seq) return;   // a pessoa trocou o filtro antes da resposta: vale só a última
    if (!r.ok) { if (!r.cancelado) erro = r.mensagem; return; }
    resumo = r.dados.resumo;
    if (pedida === null) escopo.resumo = r.dados.resumo;
    chegando = tr && tr.ok ? [...tr.dados.itens] : [];
    alerta = al;
    // a resposta conferida: sem o andamento (servidor antigo ou resposta estranha), nada; o painel fica como era
    arrol = ar && ar.ok ? lerPainelArrol(ar.dados) : null;
    arrolErro = ar && !ar.ok ? (ar.cancelado ? "" : ar.mensagem) : ar && !arrol && Number(r.dados.resumo.arrolamento) > 0 ? "Não deu para ler o andamento do arrolamento agora." : "";
    todas = false;
  }

  // o 4º grupo aparece quando veio alguém do sistema pago para este recorte; antes da importação (vieram = 0), o painel fica como era
  const temArrol = $derived(!!resumo && (Number(resumo.arrolamento) > 0 || (arrol?.andamento.vieram ?? 0) > 0));
  // o cartão e a tabela, só para quem cuida do cadastro (a rota pede a permissão "pessoas"); o número dourado aparece para todos
  const grupoVisivel = $derived(temArrol && cuidaDoCadastro());
  // a congregação (ou a área e a Geral com uma congregação escolhida) vê as próximas fichas; a área e a Geral sem filtro, a tabela
  const vistaLocal = $derived(congregacaoId !== null || ((escopo.resumo ?? resumo)?.congregacoes.length ?? 0) <= 1);
  const idDaCongregacao = $derived(congregacaoId ?? ((escopo.resumo ?? resumo)?.congregacoes.length === 1 ? (escopo.resumo ?? resumo)?.congregacoes[0]?.congregacaoId ?? null : null));
  const hoje = hojeIso();
  const lugaresArrol = $derived.by((): readonly LugarArrolamento[] => {
    if (!arrol) return [];
    if (sessao.geral) return arrol.porArea ?? [];
    return [...arrol.porCongregacao].sort((a, b) => b.faltam - a.faltam || a.nome.localeCompare(b.nome, "pt-BR"));
  });
  const LIMITE = 6;
  const lugaresVisiveis = $derived(todas ? lugaresArrol : lugaresArrol.slice(0, celular ? 4 : LIMITE));
  const escondidos = $derived(lugaresArrol.length - lugaresVisiveis.length);
  const areaUnica = $derived.by(() => { const nomes = new Set(lugaresArrol.map((l) => l.area ?? "")); return nomes.size === 1 ? [...nomes][0] || null : null; });
  const fraseEscondidos = $derived(sessao.geral ? `+ ${numero(escondidos)} ${escondidos === 1 ? "área" : "áreas"}` : fraseResto(escondidos, areaUnica));
  function abrirArrolamento() {
    if (vistaLocal && idDaCongregacao !== null) { ir({ tela: "completar", matricula: null, congregacaoId: idDaCongregacao, semCongregacao: false }); return; }
    document.getElementById("arrolamento-por-lugar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $effect(() => { void congregacaoId; void carregar(); });

  const congregacoes = $derived((escopo.resumo ?? resumo)?.congregacoes ?? []);
  const varias = $derived(congregacoes.length > 1);
  const nomeLugar = $derived(congregacaoId !== null ? congregacoes.find((c) => c.congregacaoId === congregacaoId)?.nome ?? "" : "");
  const sub = $derived.by(() => {
    if (!resumo) return "";
    if (temArrol) {
      // rodada 28: o rol soma os 4 grupos, e a data de hoje fica no alto
      const rol = `${numero(resumo.total)} no rol (os 4 grupos) · ${diaPorExtenso(hoje)}`;
      if (congregacaoId !== null) return `Congregação ${nomeLugar} · ${rol}`;
      if (sessao.geral) return `Igreja toda · ${rol}`;
      if (congregacoes.length === 1 && congregacoes[0]) return `Congregação ${congregacoes[0].nome} · ${rol}`;
      return `${areaUnica ? areaUnica + " · " : ""}${congregacoes.length} congregações · ${rol}`;
    }
    const total = `${numero(resumo.total)} pessoas no rol`;
    if (congregacaoId !== null) return `Congregação ${nomeLugar} · ${total}`;
    if (sessao.geral) return `Igreja toda · ${congregacoes.length} congregações · ${total}`;
    if (congregacoes.length === 1 && congregacoes[0]) return `Congregação ${congregacoes[0].nome} · ${total}`;
    return `${congregacoes.length} congregações · ${total}`;
  });
  const novosSub = $derived(resumo ? resumo.novosPorForma.map((f) => `${numero(f.n)} ${f.forma}`).join(" · ") || "nenhum ainda" : "");
  const avisosVisiveis = $derived(soMeu ? avisos.filter((a) => a.meu) : avisos);
  const qtdMeu = $derived(avisos.filter((a) => a.meu).length);
  const rotuloTudo = $derived(sessao.geral ? "Tudo da Igreja" : congregacoes.length > 1 ? "Tudo da área" : "Tudo da congregação");
</script>

{#snippet kpis()}
  {#if !resumo}
    <!-- antes de o servidor responder: nada de "0" que parece número de verdade -->
    <div class="kpis" aria-busy="true">{#each [1, 2, 3, 4] as k (k)}<div class="kpi"><Estado tipo="carregando" linhas={2} /></div>{/each}</div>
  {:else}
  <!-- rodada 28: com o 4º grupo, 5 números (o dourado em 4º; no celular, o primeiro, na largura toda) -->
  <div class="kpis" class:cinco={temArrol}>
    {#if temArrol && celular}{@render kpiArrol()}{/if}
    <div class="kpi"><span>Em comunhão</span><strong class="verde sv-num">{numero(resumo?.emComunhao)}</strong><small>{pct(resumo?.emComunhao ?? 0, resumo?.total ?? 0)}% do rol</small></div>
    <div class="kpi"><span>Congregados</span><strong class="sv-num">{numero(resumo?.congregados)}</strong><small>ainda não membros</small></div>
    <div class="kpi"><span>Sem comunhão</span><strong class="vermelho sv-num">{numero(resumo?.semComunhao)}</strong><small>em disciplina ou afastados</small></div>
    {#if temArrol && !celular}{@render kpiArrol()}{/if}
    <div class="kpi"><span>Novos em {mesLongo(resumo?.mesAtual ?? "")}</span><strong class="sv-num">{numero(resumo?.novosNoMes)}</strong><small>{novosSub}</small></div>
  </div>
  {/if}
{/snippet}

{#snippet kpiArrol()}
  <div class="kpi ouro"><span>Arrolamento a completar</span><strong class="sv-num">{numero(resumo?.arrolamento)}</strong><small>sem voto até completar</small></div>
{/snippet}

{#snippet barraArrol(feito: number, total: number)}
  <div class="trilho-arr" role="img" aria-label="{pctAndamento(feito, total)}% completadas"><span style:width="{pctAndamento(feito, total)}%"></span></div>
{/snippet}

<!-- a congregação: o andamento, as próximas fichas e "Completar, uma por uma" -->
{#snippet cartaoArrol()}
  <Cartao titulo="Arrolamento a completar">
    {#snippet direita()}<span class="dir-etiq"><Chip tom="pendente">sem voto</Chip></span>{/snippet}
    {#if arrol}
      {@const a = arrol.andamento}
      <div class="andamento">
        {@render barraArrol(a.completadas, a.vieram)}
        <p class="and-txt"><strong class="sv-num">{numero(a.completadas)} de {numero(a.vieram)}</strong> já completadas · faltam <span class="sv-num">{numero(a.faltam)}</span></p>
      </div>
      {#if !celular}<p class="explica">Vieram do sistema pago{arrol.veioEm ? ` em ${diaMes(arrol.veioEm)}` : ""} sem a situação, a data e a forma de entrada. Ao completar, a pessoa sai deste grupo e ganha o voto.</p>{/if}
      {#if a.faltam > 0}
        <div class="proximas">
          {#each arrol.proximas.slice(0, celular ? 3 : 4) as p (p.matricula)}
            <button type="button" class="prox" onclick={() => ir({ tela: "completar", matricula: p.matricula, congregacaoId: null, semCongregacao: false })}>
              <Avatar nome={p.nome} tam={30} cor={corDoDepartamento(p.departamento)} />
              <span class="prox-t"><strong>{p.nome}</strong><small>nº {numero(p.matricula)} · veio do sistema pago · sem voto</small></span>
              <span class="mais">Completar ›</span>
            </button>
          {/each}
        </div>
        {#if idDaCongregacao !== null}
          <Botao tipo="ouro" icone="seta" largo tam={celular ? "grande" : "normal"} onclick={() => ir({ tela: "completar", matricula: null, congregacaoId: idDaCongregacao, semCongregacao: false })}>Completar, uma por uma</Botao>
        {/if}
      {/if}
    {:else if arrolErro}
      <Estado tipo="erro" texto={arrolErro} ontentar={carregar} />
    {:else}
      <Estado tipo="carregando" linhas={3} />
    {/if}
  </Cartao>
{/snippet}

<!-- a área (por congregação) e a Geral (por área): o mesmo grupo, com o andamento de cada lugar -->
{#snippet grupoCima()}
  <section class="grupo-cima" id="arrolamento-por-lugar" aria-label="Arrolamento a completar">
    <div class="gc-topo">
      <h2>Arrolamento a completar, {sessao.geral ? "por área" : "por congregação"}</h2>
      <Chip tom="pendente">sem voto</Chip>
      <span class="gc-tot sv-num">{#if arrol}{numero(arrol.andamento.vieram)} vieram · {numero(arrol.andamento.completadas)} completadas · faltam {numero(arrol.andamento.faltam)}{/if}</span>
    </div>
    {#if arrol}
      <div class="tabela-arr">
        <table>
          <thead><tr><th scope="col">{sessao.geral ? "Área" : "Congregação"}</th><th scope="col">Vieram</th><th scope="col">Completadas</th><th scope="col">Faltam</th><th scope="col">Andamento</th></tr></thead>
          <tbody>
            {#each lugaresVisiveis as l (l.id ?? l.nome)}
              <tr>
                <th scope="row">{l.nome}</th>
                <td class="sv-num">{numero(l.vieram)}</td>
                <td class="sv-num">{numero(l.completadas)}</td>
                <td class="sv-num"><strong class="falta">{numero(l.faltam)}</strong></td>
                <td><span class="and-cel">{@render barraArrol(l.completadas, l.vieram)}<small class="sv-num">{pctAndamento(l.completadas, l.vieram)}%</small></span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {@render fimCima()}
    {:else if arrolErro}
      <Estado tipo="erro" texto={arrolErro} ontentar={carregar} />
    {:else}
      <Estado tipo="carregando" linhas={4} />
    {/if}
  </section>
{/snippet}

{#snippet fimCima()}
  {#if escondidos > 0}<button type="button" class="gc-fim botao-txt" onclick={() => (todas = true)}>{fraseEscondidos}</button>{/if}
  {#if sessao.geral && (arrol?.semCongregacao ?? 0) > 0}
    <p class="gc-fim">{fraseSemCongregacao(arrol?.semCongregacao ?? 0)} <button type="button" class="mais botao-txt" onclick={() => ir({ tela: "completar", matricula: null, congregacaoId: null, semCongregacao: true })}>Completar ›</button></p>
  {/if}
{/snippet}

<!-- no celular, a área e a Geral: cada lugar numa linha -->
{#snippet listaCima()}
  {#if arrol}
    <div class="lista-cel" aria-label="Arrolamento a completar, {sessao.geral ? 'por área' : 'por congregação'}" role="list">
      {#each lugaresVisiveis as l (l.id ?? l.nome)}
        <div class="lc" role="listitem"><span class="lc-t"><strong>{l.nome}</strong><small class="sv-num">{numero(l.completadas)} de {numero(l.vieram)} completadas</small></span><strong class="lc-f sv-num">faltam {numero(l.faltam)}</strong></div>
      {/each}
    </div>
    {@render fimCima()}
  {:else if arrolErro}
    <Estado tipo="erro" texto={arrolErro} ontentar={carregar} />
  {/if}
{/snippet}

{#snippet grafGrande()}
  <Cartao titulo="{rec.sim}, por {agr.rotulo}" nota={celular ? undefined : "para a campanha"}>
    <div class="ajustes">
      <div class="chips">
        <Escolha rotulo="Recorte" prefixo="Recorte: " valor={ajuste.recorte} opcoes={RECORTES.map((r) => ({ valor: r.valor, rotulo: r.rotulo }))} onescolher={(v) => v && guardar({ recorte: v })} />
        <Escolha rotulo="Agrupar" prefixo="Por " valor={ajuste.agrupar} opcoes={AGRUPAR} onescolher={(v) => v && guardar({ agrupar: v })} />
      </div>
      {#if !celular}<Botao tipo="linha" tam="pequeno" icone="engrenagem" onclick={() => (gaveta = true)}>Ajustar os gráficos</Botao>{/if}
    </div>
    <div class="legenda">
      <span><i class="c1"></i>{rec.sim} <strong class="sv-num">{ajuste.modo === "pct" ? pct(totSim, totSim + totNao) + "%" : numero(totSim)}</strong></span>
      <span><i class="c2"></i>{rec.nao} <strong class="sv-num">{ajuste.modo === "pct" ? pct(totNao, totSim + totNao) + "%" : numero(totNao)}</strong></span>
    </div>
    {#if linhasGraf.length}
      <div class="barras">
        {#each linhasGraf as l (l.nome)}
          <div class="barra" class:sem={l.sem}>
            <span class="rot" title={l.nome}>{l.nome}</span>
            <div class="trilho"><div class="cheio" style:width="{l.largura}%">
              <span class="s1" style:width="{l.total ? (l.sim / l.total) * 100 : 0}%" title="{l.nome}: {numero(l.sim)}"></span>
              <span class="s2" title="{l.nome}: {numero(l.nao)} {rec.nao.toLowerCase()}"></span>
            </div></div>
            <span class="val sv-num"><strong>{ajuste.modo === "pct" ? pct(l.nao, l.total) + "%" : numero(l.nao)}</strong>{celular ? "" : " " + rec.nao.toLowerCase()}</span>
          </div>
        {/each}
      </div>
    {:else if resumo}
      <Estado tipo="vazio" texto="Ninguém no rol ainda." />
    {:else}
      <Estado tipo="carregando" linhas={4} />
    {/if}
  </Cartao>
{/snippet}

{#snippet grafMov()}
  <Cartao titulo="Entradas e saídas" nota="últimos 6 meses">
    {#if !resumo}<Estado tipo="carregando" linhas={3} />{:else}
    <div class="legenda"><span><i class="c1"></i>Entradas <strong class="sv-num">{numero(totEnt)}</strong></span><span><i class="c2"></i>Saídas <strong class="sv-num">{numero(totSai)}</strong></span></div>
    <div class="colunas" role="img" aria-label="Entradas e saídas por mês">
      {#each resumo?.movimento ?? [] as m (m.mes)}
        <div class="mes">
          <div class="par">
            <span class="e" style:height="{Math.max(3, Math.round((m.entradas / maxMov) * 74))}px" title="{mesCurto(m.mes)}: {m.entradas} entradas"></span>
            <span class="s" style:height="{Math.max(3, Math.round((m.saidas / maxMov) * 74))}px" title="{mesCurto(m.mes)}: {m.saidas} saídas"></span>
          </div>
          <small>{mesCurto(m.mes)}</small>
        </div>
      {/each}
    </div>
    {/if}
  </Cartao>
{/snippet}

{#snippet grafQual()}
  <Cartao titulo="Como está o cadastro" nota="do rol">
    {#if !resumo}<Estado tipo="carregando" linhas={4} />{:else}
    {#each [["Cadastro completo", resumo?.completos ?? 0], ["Com CPF", (resumo?.total ?? 0) - (resumo?.semCpf ?? 0)], ["Batizados no Espírito Santo", resumo?.batizadosEspirito ?? 0], ["Em comunhão", resumo?.emComunhao ?? 0]] as [rot, v] (rot)}
      {@const p = pct(Number(v), resumo?.total ?? 0)}
      <div class="qual"><div class="qt"><span>{rot}</span><strong class="sv-num">{p}%</strong></div><div class="qb"><span style:width="{p}%"></span></div></div>
    {/each}
    {/if}
  </Cartao>
{/snippet}

{#snippet listaAvisos(curta: boolean)}
  {#each (curta ? avisosVisiveis.slice(0, 2) : avisosVisiveis) as a (a.chave)}
    <button type="button" class="aviso" class:curto={curta} onclick={a.abrir}>
      <span class="tile"><Icone nome={a.icone} tam={curta ? 16 : 16} traco={2} /></span>
      <span class="at"><strong>{a.titulo}</strong>{#if !curta && a.sub}<small>{a.sub}</small>{/if}</span>
      <Chip tom={a.tom === "primeiro" ? "atrasado" : a.tom === "feito" ? "ok" : "pendente"}>{a.tom === "primeiro" ? "Primeiro" : a.tom === "feito" ? "Feito" : "A fazer"}</Chip>
    </button>
  {:else}
    <p class="nada">{soMeu ? "Nada esperando por você em Membros." : "Nenhum aviso de Membros agora."}</p>
  {/each}
{/snippet}

<div class="painel" class:celular>
  {#if celular}
    <section class="faixa" aria-label="Avisos de Membros">
      <div class="faixa-tit"><Icone nome="sino" tam={17} traco={2} /><strong>Avisos de Membros</strong>{#if qtdMeu}<span class="bola sv-num">{qtdMeu}</span>{/if}</div>
      {#if resumo}{@render listaAvisos(true)}{:else}<Estado tipo="carregando" linhas={2} />{/if}
    </section>
    {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />{/if}
    {@render kpis()}
    {#if grupoVisivel}{#if vistaLocal}{@render cartaoArrol()}{:else}{@render listaCima()}{/if}{/if}
    {@render grafGrande()}
    {@render grafMov()}
    {@render grafQual()}
  {:else}
    <Cabecalho titulo="Membros" {sub}>
      {#snippet acoes()}
        {#if varias}
          <Escolha rotulo={sessao.geral ? "Igreja toda" : "A área toda"} icone="mapa" valor={congregacaoId} limpavel
            opcoes={congregacoes.map((c) => ({ valor: c.congregacaoId, rotulo: c.nome, sub: numero(c.total) }))} onescolher={(v) => (congregacaoId = v)} />
        {:else if congregacoes[0]}
          <Escolha rotulo={congregacoes[0].nome} icone="cadeado" estilo="trava" valor={null} opcoes={[]} onescolher={() => {}} />
        {/if}
        {#if cuidaDoCadastro()}<Botao tipo="ouro" icone="mais" onclick={() => ir({ tela: "cadastrar" }, true)}>Cadastrar pessoa</Botao>{/if}
      {/snippet}
    </Cabecalho>
    {#if erro}<Estado tipo="erro" texto={erro} ontentar={carregar} />{/if}
    <!-- rodada 28: com o 4º grupo, os 5 números vão na largura toda; a área e a Geral veem a tabela por lugar logo abaixo -->
    {#if temArrol}
      {@render kpis()}
      {#if grupoVisivel && !vistaLocal}{@render grupoCima()}{/if}
    {/if}
    <div class="duas">
      <div class="esq">
        {#if !temArrol}{@render kpis()}{:else if grupoVisivel && vistaLocal}{@render cartaoArrol()}{/if}
        {@render grafGrande()}
        <div class="par-graf">{@render grafMov()}{@render grafQual()}</div>
      </div>
      <aside class="avisos-col" aria-label="Avisos de Membros">
        <Cartao titulo="Avisos de Membros" nota="só deste módulo">
          <div class="filtro-av">
            <button type="button" class:on={soMeu} aria-pressed={soMeu} onclick={() => (soMeu = true)}>Só o que eu preciso resolver ({qtdMeu})</button>
            <button type="button" class:on={!soMeu} aria-pressed={!soMeu} onclick={() => (soMeu = false)}>{rotuloTudo} ({avisos.length})</button>
          </div>
          <div class="lista-av">{#if resumo}{@render listaAvisos(false)}{:else}<Estado tipo="carregando" linhas={3} />{/if}</div>
          {#if contadores.falhou}<p class="pe falha">Parte dos avisos não pôde ser conferida agora (a fila, as repetidas ou as sugestões).</p>{/if}
          <p class="pe">O sino lá de cima continua com os avisos do sistema todo; aqui, só os de Membros.</p>
        </Cartao>
      </aside>
    </div>
  {/if}
</div>

{#if gaveta}
  <div class="fundo" role="presentation" onclick={() => (gaveta = false)}></div>
  <div class="gaveta" role="dialog" aria-modal="true" aria-label="Ajustar os gráficos" tabindex="-1" onkeydown={(e) => e.key === "Escape" && (gaveta = false)}>
    <div class="g-topo"><Icone nome="engrenagem" tam={20} traco={2} /><strong>Ajustar os gráficos</strong><button type="button" class="fechar" aria-label="Fechar" onclick={() => (gaveta = false)}><Icone nome="fechar" tam={18} traco={2.4} /></button></div>
    <p class="g-sub">Só muda o seu painel. Os números seguem o seu nível.</p>
    <div class="g-grupo"><span>Gráfico grande: o que mostrar</span><Opcoes rotulo="O que mostrar" valor={ajuste.recorte} opcoes={RECORTES.map((r) => ({ valor: r.valor, rotulo: r.sim }))} onescolher={(v) => guardar({ recorte: v })} /></div>
    <div class="g-grupo"><span>Agrupar por</span><Opcoes rotulo="Agrupar por" valor={ajuste.agrupar} opcoes={AGRUPAR.map((g) => ({ valor: g.valor, rotulo: g.rotulo[0]!.toUpperCase() + g.rotulo.slice(1) }))} onescolher={(v) => guardar({ agrupar: v })} /></div>
    <div class="g-grupo"><span>Mostrar</span><Opcoes rotulo="Mostrar" valor={ajuste.modo} opcoes={[{ valor: "qtd", rotulo: "Quantidade" }, { valor: "pct", rotulo: "Porcentagem" }]} onescolher={(v) => guardar({ modo: v })} /></div>
    <div class="g-fim"><Botao tipo="ouro" icone="check" onclick={() => (gaveta = false)}>Pronto</Botao></div>
  </div>
{/if}

<style>
  .painel { display: flex; flex-direction: column; gap: 14px; }
  .duas { display: flex; gap: 16px; align-items: flex-start; }
  .esq { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .avisos-col { width: 332px; flex: none; }
  .par-graf { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kpi span { font-size: 14px; color: var(--sv-texto); }
  .kpi strong { font-size: 27px; font-weight: 800; color: var(--sv-titulo); line-height: 1.2; }
  .kpi small { font-size: 12.5px; color: var(--sv-suave); }
  .verde { color: var(--sv-ok) !important; }
  .vermelho { color: var(--sv-atr) !important; }
  :global(html:not([data-tema="escuro"])) .verde { color: #15803D !important; }
  :global(html:not([data-tema="escuro"])) .vermelho { color: #B91C1C !important; }
  .ajustes { display: flex; align-items: center; gap: 8px; justify-content: space-between; flex-wrap: wrap; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .legenda { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--sv-texto); }
  .legenda span { display: flex; align-items: center; gap: 6px; }
  .legenda strong { color: var(--sv-titulo); }
  i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .c1 { background: var(--sv-graf-1); }
  .c2 { background: var(--sv-graf-2); }
  .barras { display: flex; flex-direction: column; gap: 11px; padding-top: 2px; }
  .barra { display: flex; align-items: center; gap: 10px; }
  .rot { width: 140px; flex: none; font-size: 13.5px; color: var(--sv-texto); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sem .rot { font-style: italic; }
  .trilho { flex: 1; display: flex; align-items: center; min-width: 0; }
  .cheio { display: flex; height: 16px; }
  .s1 { background: var(--sv-graf-1); height: 100%; }
  .s2 { flex: 1; margin-left: 2px; background: var(--sv-graf-2); border-radius: 0 4px 4px 0; height: 100%; }
  .val { width: 100px; flex: none; text-align: right; font-size: 12.5px; color: var(--sv-texto); }
  .val strong { color: var(--sv-titulo); }
  .colunas { display: flex; gap: 6px; border-bottom: 1px solid var(--sv-borda); padding: 0 4px; height: 92px; align-items: flex-end; margin-bottom: 18px; }
  .mes { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
  .par { display: flex; align-items: flex-end; gap: 2px; height: 80px; }
  .par span { width: 11px; border-radius: 4px 4px 0 0; }
  .e { background: var(--sv-graf-1); }
  .s { background: var(--sv-graf-2); }
  .mes small { position: absolute; top: calc(100% + 4px); font-size: 11.5px; color: var(--sv-suave); }
  .qual { display: flex; flex-direction: column; gap: 4px; }
  .qt { display: flex; font-size: 13.5px; }
  .qt span { flex: 1; color: var(--sv-texto); }
  .qt strong { color: var(--sv-titulo); }
  .qb { height: 8px; border-radius: 4px; background: var(--sv-linha); overflow: hidden; }
  .qb span { display: block; height: 100%; background: var(--sv-mod); }
  .filtro-av { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .filtro-av button { height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--sv-borda); background: var(--sv-sup); color: var(--sv-titulo); font-size: 13.5px; font-weight: 600; cursor: pointer; }
  .filtro-av button.on { background: var(--sv-escolha); color: var(--sv-escolha-texto); border-color: var(--sv-escolha); }
  .lista-av { display: flex; flex-direction: column; }
  .aviso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border: 0; border-top: 1px solid var(--sv-linha); background: transparent; text-align: left; cursor: pointer; width: 100%; }
  .lista-av .aviso:first-child { border-top: 0; }
  .tile { width: 32px; height: 32px; border-radius: 10px; background: var(--sv-mod-fundo); color: var(--sv-mod); display: flex; align-items: center; justify-content: center; flex: none; }
  .at { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .at strong { font-size: 14px; font-weight: 600; color: var(--sv-titulo); line-height: 1.3; }
  .at small { font-size: 12.5px; color: var(--sv-suave); }
  .nada { font-size: 13.5px; color: var(--sv-suave); padding: 6px 0; }
  .pe { font-size: 12.5px; color: var(--sv-suave); line-height: 1.4; }
  .pe.falha { color: var(--sv-atr); font-weight: 600; }
  .faixa { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 14px; background: var(--sv-info-fundo); border: 1px solid var(--sv-info-borda); }
  .faixa-tit { display: flex; align-items: center; gap: 8px; color: var(--sv-icone); }
  .faixa-tit strong { font-size: 14px; font-weight: 800; color: var(--sv-titulo); }
  .bola { min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--sv-ouro); color: #0A2342; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .aviso.curto { align-items: center; padding: 8px 10px; border: 1px solid var(--sv-borda); border-radius: 10px; background: var(--sv-sup); }
  .aviso.curto .tile { width: auto; height: auto; background: transparent; color: var(--sv-icone); }
  .celular .kpis { grid-template-columns: 1fr 1fr; gap: 10px; }
  .celular .kpi strong { font-size: 26px; }
  /* no celular o nome vai inteiro numa linha e a barra embaixo ("União de Mocidade", "Sem departamento" e o nome da congregação não cabem ao lado) */
  .celular .barras { gap: 9px; }
  .celular .barra { flex-wrap: wrap; row-gap: 3px; }
  .celular .rot { width: 100%; font-size: 13px; }
  .celular .val { width: 44px; }
  .fundo { position: fixed; inset: 0; background: rgba(4, 12, 24, .28); z-index: 900; }
  .gaveta {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(380px, 92vw); z-index: 901; background: var(--sv-sup); border-left: 1px solid var(--sv-borda);
    box-shadow: -20px 0 50px rgba(6, 22, 41, .25); padding: 18px 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
    animation: entra .2s ease-out;
  }
  @keyframes entra { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  .g-topo { display: flex; align-items: center; gap: 10px; color: var(--sv-icone); }
  .g-topo strong { flex: 1; font-size: 17px; color: var(--sv-titulo); }
  .fechar { border: 0; background: transparent; color: var(--sv-suave); cursor: pointer; display: flex; padding: 6px; border-radius: 8px; }
  .g-sub { font-size: 13.5px; color: var(--sv-suave); line-height: 1.4; }
  .g-grupo { display: flex; flex-direction: column; gap: 8px; }
  .g-grupo > span { font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--sv-suave); }
  .g-fim { margin-top: auto; display: flex; justify-content: flex-end; }
  /* ---- o 4º grupo (rodada 28): as cores do desenho (o dourado do KPI, a barra verde, "faltam" em ouro) ---- */
  .kpis.cinco { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
  .kpis.cinco .kpi { padding: 10px 12px; border-radius: 12px; gap: 1px; }
  .kpis.cinco .kpi span { font-size: 12.5px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpis.cinco .kpi strong { font-size: 26px; }
  .kpis.cinco .kpi small { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpi.ouro { background: #FFF4D1; border-color: #FFB800; }
  .kpis .kpi.ouro span { color: #8A5A00; font-weight: 700; }
  :global(html[data-tema="escuro"]) .kpi.ouro { background: #3A2E0B; }
  :global(html[data-tema="escuro"]) .kpis .kpi.ouro span { color: #FCD34D; }
  .celular .kpis.cinco { grid-template-columns: 1fr 1fr; gap: 8px; }
  .celular .kpis.cinco .kpi { padding: 7px 10px; }
  .celular .kpis.cinco .kpi strong { font-size: 20px; }
  .celular .kpi.ouro { grid-column: span 2; }
  .dir-etiq { margin-left: auto; display: flex; }
  .andamento { display: flex; flex-direction: column; gap: 5px; }
  .trilho-arr { height: 10px; border-radius: 5px; background: var(--sv-linha); overflow: hidden; display: flex; min-width: 0; }
  .trilho-arr span { display: block; height: 100%; background: #166534; }
  :global(html[data-tema="escuro"]) .trilho-arr span { background: #86EFAC; }
  .and-txt { font-size: 13px; color: var(--sv-texto); }
  .and-txt strong { color: var(--sv-titulo); }
  .explica { font-size: 13px; color: var(--sv-texto); line-height: 1.4; }
  .proximas { display: flex; flex-direction: column; }
  .prox { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 4px 0; border: 0; border-top: 1px solid var(--sv-linha); background: transparent; text-align: left; cursor: pointer; width: 100%; }
  .proximas .prox:first-child { border-top: 0; }
  .prox-t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .prox-t strong { font-size: 14px; font-weight: 600; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prox-t small { font-size: 12px; color: var(--sv-suave); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mais { font-size: 13px; font-weight: 700; color: var(--sv-link); white-space: nowrap; }
  .botao-txt { border: 0; background: transparent; padding: 0; cursor: pointer; font: inherit; text-align: left; }
  .prox:hover .mais, .botao-txt:hover { text-decoration: underline; }
  .grupo-cima { display: flex; flex-direction: column; gap: 10px; scroll-margin-top: 12px; }
  .gc-topo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .gc-topo h2 { font-size: 15.5px; font-weight: 700; color: var(--sv-titulo); }
  .gc-tot { margin-left: auto; font-size: 13px; color: var(--sv-suave); }
  .tabela-arr { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); overflow: hidden; }
  .tabela-arr table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .tabela-arr th, .tabela-arr td { padding: 0 16px; height: 44px; text-align: left; font-size: 13.5px; color: var(--sv-titulo); border-top: 1px solid var(--sv-linha); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tabela-arr thead th { height: 38px; border-top: 0; font-size: 12.5px; font-weight: 700; color: var(--sv-texto); border-bottom: 1px solid var(--sv-borda); }
  .tabela-arr tbody tr:first-child th, .tabela-arr tbody tr:first-child td { border-top: 0; }
  .tabela-arr tbody th { font-weight: 700; }
  .tabela-arr thead th:nth-child(1) { width: 30%; }
  .tabela-arr thead th:nth-child(2) { width: 100px; }
  .tabela-arr thead th:nth-child(3) { width: 120px; }
  .tabela-arr thead th:nth-child(4) { width: 100px; }
  .falta { color: #8A5A00; font-weight: 700; }
  :global(html[data-tema="escuro"]) .falta { color: #FCD34D; }
  .and-cel { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .and-cel .trilho-arr { flex: 1; height: 8px; border-radius: 4px; }
  .and-cel small { font-size: 12px; color: var(--sv-suave); width: 34px; text-align: right; flex: none; }
  .gc-fim { font-size: 13px; color: var(--sv-suave); padding: 0 4px; }
  .lista-cel { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 2px 12px; display: flex; flex-direction: column; }
  .lc { display: flex; align-items: center; gap: 10px; min-height: 52px; border-top: 1px solid var(--sv-linha); }
  .lc:first-child { border-top: 0; }
  .lc-t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .lc-t strong { font-size: 14.5px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lc-t small { font-size: 12.5px; color: var(--sv-suave); }
  .lc-f { font-size: 13.5px; font-weight: 700; color: var(--sv-titulo); white-space: nowrap; }
  @media (max-width: 1100px) { .kpis { grid-template-columns: 1fr 1fr; } .kpis.cinco { grid-template-columns: repeat(3, minmax(0, 1fr)); } .avisos-col { width: 280px; } }
</style>
