<!-- 3. A FICHA 360 (rodada 10, versão final): a pessoa no alto (foto, situação, cargo, departamento, se vota, e os botões Transferência,
     Carteirinha e Editar); no notebook o menu "Nesta ficha" à DIREITA (cresce para baixo); no celular as partes em pílulas no alto.
     Cada parte mostra o que o sistema já sabe da pessoa — o que estava nas abas antigas do perfil foi redistribuído aqui dentro. -->
<script lang="ts">
  import { pedir, qs, avisarFalha } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { dataBr, mesAnoBr, anoDe, idade, telefoneMascarado, iniciais, numero, haQuanto } from "../../comum/formato";
  import Botao from "../../comum/Botao.svelte";
  import Cartao from "../../comum/Cartao.svelte";
  import Chip from "../../comum/Chip.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Dado from "../../comum/Dado.svelte";
  import Estado from "../../comum/Estado.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Pilulas from "../../comum/Pilulas.svelte";
  import NaFicha from "../carteirinhas/NaFicha.svelte";
  import LinhaTempo from "../../comum/LinhaTempo.svelte";
  import CampoEditavel from "../partes/CampoEditavel.svelte";
  import { ir, departamentos, cuidaDoCadastro, type SecaoFicha } from "../estado.svelte";
  import { situacaoDe, estadoCivil, ESCOLARIDADE, textoDoValor } from "../rotulos";
  import type { Alteracao, CampoFicha, CamposFicha, Departamento, Endereco, EventoVida, LinhaDoTempo, PaginaAlteracoes, PaginaPessoas, PessoaLista } from "../tipos";

  interface Props { id: number; secao: SecaoFicha; celular: boolean; onnome: (nome: string) => void }
  let { id, secao, celular, onnome }: Props = $props();

  const sessao = ponte().sessao();
  const SECOES: readonly { chave: SecaoFicha; rotulo: string; curto: string; icone: string }[] = [
    { chave: "resumo", rotulo: "Resumo", curto: "Resumo", icone: "casa" }, { chave: "dados", rotulo: "Dados pessoais", curto: "Dados", icone: "pessoa" },
    { chave: "familia", rotulo: "Família", curto: "Família", icone: "pessoas" }, { chave: "vida", rotulo: "Vida espiritual", curto: "Vida espiritual", icone: "coracao" },
    { chave: "cargos", rotulo: "Cargos e funções", curto: "Cargos", icone: "escudo" }, { chave: "ministerios", rotulo: "Ministérios e EBD", curto: "Ministérios", icone: "livro" },
    { chave: "assembleia", rotulo: "Assembleia e disciplina", curto: "Assembleia", icone: "balanca" }, { chave: "documentos", rotulo: "Documentos", curto: "Documentos", icone: "doc" },
    { chave: "alteracoes", rotulo: "Alterações", curto: "Alterações", icone: "relogio" }
  ];

  let pessoa = $state<PessoaLista | null>(null);
  let linha = $state<LinhaDoTempo | null>(null);
  let campos = $state<CamposFicha | null>(null);
  let alteracoes = $state<Alteracao[]>([]);
  let altTotal = $state(0);
  let vinculos = $state<{ vinculoId: number; outraPessoaId: number; outraPessoaNome: string; rotulo: string }[] | null>(null);
  let pendencias = $state<{ pendencias: { tipo?: string; descricao?: string; rotulo?: string }[]; impressaoFisicaBloqueada: boolean } | null>(null);
  let deps = $state<readonly Departamento[]>([]);
  let erro = $state("");
  // cada parte com o seu erro: nunca um "nada registrado" no lugar de uma leitura que falhou
  const falhas = $state({ linha: "", campos: "", alteracoes: "", vinculos: "", pendencias: "" });
  let cpfInteiro = $state<string | null>(null);
  let editando = $state<string | null>(null);
  let salvando = $state(false);
  let erroCampo = $state("");
  let outraFicha = $state<number | null>(null);

  void departamentos().then((d) => (deps = d));

  async function carregarPessoa() {
    erro = "";
    const [p, l] = await Promise.all([
      pedir<PaginaPessoas>("/pessoas" + qs({ pagina: 1, porPagina: 1, matricula: id })),
      pedir<LinhaDoTempo>(`/pessoas/${id}/linha-do-tempo` + qs({ porPagina: 200 }))
    ]);
    if (!p.ok) { erro = p.mensagem; return; }
    const achada = p.dados.itens[0];
    if (!achada) { erro = "Matrícula não encontrada."; return; }
    pessoa = achada;
    onnome(achada.nome);
    if (l.ok) { linha = l.dados; falhas.linha = ""; } else if (!l.cancelado) falhas.linha = l.mensagem;
  }
  async function carregarCampos() {
    const [c, a] = await Promise.all([
      pedir<CamposFicha>(`/pessoas/${id}/ficha/campos`),
      pedir<PaginaAlteracoes>(`/pessoas/${id}/ficha/alteracoes` + qs({ porPagina: 50 }))
    ]);
    if (c.ok) { campos = c.dados; falhas.campos = ""; } else falhas.campos = c.mensagem;
    if (a.ok) { alteracoes = [...a.dados.itens]; altTotal = a.dados.total; falhas.alteracoes = ""; } else falhas.alteracoes = a.mensagem;
  }
  $effect(() => { void id; pessoa = null; linha = null; campos = null; vinculos = null; pendencias = null; cpfInteiro = null; editando = null; void carregarPessoa(); });
  $effect(() => {
    if (!pessoa) return;
    if (["dados", "vida", "ministerios", "alteracoes", "familia"].includes(secao) && !campos) void carregarCampos();
    if (secao === "familia" && vinculos === null) {
      void lerVinculos();
    }
    if (secao === "documentos" && pendencias === null) {
      void lerPendencias();
    }
  });

  async function lerVinculos() {
    const r = await pedir<unknown>("/vinculos-familiares" + qs({ membroId: id }));
    if (!r.ok) { falhas.vinculos = r.mensagem; return; }
    falhas.vinculos = "";
    const lista = Array.isArray(r.dados) ? r.dados : ((r.dados as { vinculos?: unknown[] }).vinculos ?? []);
    vinculos = lista as typeof vinculos;
  }
  async function lerPendencias() {
    const r = await pedir<{ pendencias: []; impressaoFisicaBloqueada: boolean }>("/fichas-repetidas/pendencias" + qs({ membroId: id }));
    if (!r.ok) { falhas.pendencias = r.mensagem; return; }
    falhas.pendencias = "";
    pendencias = r.dados;
  }
  const ir2 = (s: SecaoFicha) => ir({ tela: "ficha", id, secao: s });
  const eventos = $derived(linha?.eventos ?? []);
  const de = (...cats: string[]) => eventos.filter((e) => cats.includes(e.categoria));
  const anos = $derived(idade(pessoa?.dataNascimento));
  const sit = $derived(pessoa ? situacaoDe(pessoa) : null);
  const saiu = $derived(pessoa?.status === "DESLIGADO" || pessoa?.status === "FALECIDO");
  const nomeDep = $derived(pessoa?.departamentoId != null ? deps.find((d) => d.departamentoId === pessoa!.departamentoId)?.nome ?? "" : "");
  const vota = $derived(pessoa?.capacidade?.capacidadeAtiva === true);
  const ve = $derived(linha?.vidaEspiritual ?? null);
  const conversao = $derived(ve?.conversao?.data ? [ve.conversao.aproximada ? anoDe(ve.conversao.data) : mesAnoBr(ve.conversao.data), ve.conversao.detalhe].filter(Boolean).join(" · ") : "");
  const batAguas = $derived(ve?.batismoAguas?.data ? [dataBr(ve.batismoAguas.data), ve.batismoAguas.local ?? ve.batismoAguas.emOutraIgreja].filter(Boolean).join(" · ") : "");
  const batES = $derived(ve?.batismoEspiritoSanto?.data ? (ve.batismoEspiritoSanto.aproximada ? anoDe(ve.batismoEspiritoSanto.data) : dataBr(ve.batismoEspiritoSanto.data)) : "");
  const procedencia = $derived(ve?.procedencia?.igrejaAnterior ?? ve?.procedencia?.origem ?? "");
  const lugar = $derived(pessoa ? `${pessoa.congregacao ? `Congregação ${pessoa.congregacao}` : "sem congregação"}${pessoa.areaNome ? ` (${pessoa.areaNome})` : ""}` : "");

  // ---- "mudou em ... por quem": a última mudança de cada campo, lida das alterações ----
  const ultimaMudanca = $derived.by(() => {
    const m = new Map<string, string>();
    for (const a of alteracoes) for (const x of a.mudancas) if (!m.has(x.campo)) m.set(x.campo, `mudou em ${dataBr(a.quando)} · ${a.quem?.nome ?? "a secretaria"}`);
    return m;
  });
  const camposDo = (...grupos: string[]) => (campos?.campos ?? []).filter((c) => grupos.includes(c.grupo) && c.chave !== "departamentoId");
  const campoDep = $derived((campos?.campos ?? []).find((c) => c.chave === "departamentoId") ?? null);

  async function salvarCampo(c: CampoFicha, valor: string | Endereco) {
    if (salvando) return;
    salvando = true; erroCampo = ""; outraFicha = null;
    const r = await pedir<{ valor?: string | null; mensagem?: string }>(`/pessoas/${id}/ficha/campo`, { metodo: "POST", corpo: { campo: c.chave, valor, valorLido: c.valor } });
    salvando = false;
    if (r.ok) {
      editando = null;
      ponte().avisar(`${c.rotulo}: salvo.`, "sucesso");
      campos = null; cpfInteiro = null;
      await Promise.all([carregarCampos(), carregarPessoa()]);
      return;
    }
    if (r.status === 409) { erroCampo = r.mensagem; campos = null; void carregarCampos(); return; }
    const corpo = r.corpo as { cpfRepetido?: string; matricula?: number } | null;
    if (corpo?.cpfRepetido === "NO_ESCOPO" && corpo.matricula) outraFicha = corpo.matricula;
    erroCampo = r.mensagem;
  }
  async function mostrarCpf() {
    const r = await pedir<{ cpf: string | null }>(`/pessoas/${id}` + qs({ ver: "cpf" }));
    if (r.ok) cpfInteiro = r.dados.cpf ?? "";
    else avisarFalha(r);
  }
  async function maisAlteracoes() {
    const pag = Math.floor(alteracoes.length / 50) + 1;
    const a = await pedir<PaginaAlteracoes>(`/pessoas/${id}/ficha/alteracoes` + qs({ porPagina: 50, pagina: pag }));
    if (a.ok) alteracoes = [...alteracoes, ...a.dados.itens]; else avisarFalha(a);
  }
  const enderecoAtual = $derived<Endereco | null>(pessoa ? {
    logradouro: pessoa.enderecoLogradouro ?? "", numero: pessoa.enderecoNumero ?? "", complemento: pessoa.enderecoComplemento ?? "",
    bairroId: pessoa.enderecoBairroId ?? null, bairroTexto: pessoa.enderecoBairroTexto ?? pessoa.enderecoBairroNome ?? "", cidade: pessoa.enderecoCidade ?? "", uf: pessoa.enderecoUF ?? "PA", cep: pessoa.enderecoCep ?? ""
  } : null);
  const resumoMudanca = (a: Alteracao) => a.mudancas.map((x) => x.campo === "congregacaoId" ? "Congregação" : x.rotulo).filter(Boolean).join(", ") || a.acao;
</script>

{#snippet foto(tam: number)}
  <div class="foto" style:width="{tam}px" style:height="{Math.round(tam * 1.2)}px">
    {#if pessoa?.fotoUrl && /^(https:\/\/|\/)/.test(pessoa.fotoUrl)}<img src={pessoa.fotoUrl} alt="Foto de {pessoa.nome}" />
    {:else}<strong>{iniciais(pessoa?.nome)}</strong><span>foto</span>{/if}
  </div>
{/snippet}

{#snippet chips()}
  <div class="chips">
    {#if sit}<Chip tom={sit.tom}>{sit.rotulo}</Chip>{/if}
    {#if pessoa?.funcao}<Chip tom="ouro">{pessoa.funcao}</Chip>{/if}
    {#if nomeDep}<Chip tom="info">{nomeDep}</Chip>{/if}
    {#if vota}<Chip tom="neutro"><Icone nome="check" tam={13} traco={2.6} />Vota na assembleia</Chip>{/if}
    {#if pessoa?.menorDeIdade}<Chip tom="neutro">Menor de idade</Chip>{/if}
  </div>
{/snippet}

{#snippet botoes()}
  <!-- no celular, como no desenho: Editar primeiro; no notebook, Transferência, Carteirinha e Editar -->
  {#if celular && cuidaDoCadastro()}<Botao tipo="ouro" icone="lapis" onclick={() => ir2("dados")}>Editar</Botao>{/if}
  {#if !saiu && cuidaDoCadastro()}<Botao tipo="linha" icone="seta" onclick={() => ir({ tela: "transferir", membroId: id })}>Transferência</Botao>{/if}
  {#if !celular}<Botao tipo="linha" icone="cartao" onclick={() => ir2("documentos")}>Carteirinha</Botao>{/if}
  {#if !celular && cuidaDoCadastro()}<Botao tipo="ouro" icone="lapis" onclick={() => ir2("dados")}>Editar</Botao>{/if}
{/snippet}

{#snippet cabecalho()}
  {#if celular}
    <div class="cab-cel">
      {@render foto(84)}
      <div class="quem"><h1>{pessoa?.nome}</h1><p class="sv-num">{pessoa?.membroId} · {pessoa?.congregacao ?? "sem congregação"}{pessoa?.areaNome ? ` (${pessoa.areaNome})` : ""}{anos !== null ? ` · ${anos} anos` : ""}</p></div>
    </div>
    {@render chips()}
    <div class="botoes-cel">{@render botoes()}</div>
  {:else}
    <div class="cab cartao-base">
      {@render foto(104)}
      <div class="quem">
        <div class="linha1">
          <div class="nomes"><h1>{pessoa?.nome}</h1><p class="sv-num">Matrícula {pessoa?.membroId} · {lugar}</p></div>
          <div class="botoes">{@render botoes()}</div>
        </div>
        {@render chips()}
        <div class="fatos">
          {#if anos !== null}<div><span>Idade</span><strong>{anos} anos</strong></div>{/if}
          {#if pessoa?.dataAdmissao}<div><span>Membro desde</span><strong class="sv-num">{dataBr(pessoa.dataAdmissao)}</strong></div>{/if}
          {#if ve?.conversao?.data}<div><span>{pessoa?.sexo === "F" ? "Convertida em" : "Convertido em"}</span><strong class="sv-num">{anoDe(ve.conversao.data)}</strong></div>{/if}
          {#if pessoa?.telefone}<div><span>Celular</span><strong class="sv-num">{telefoneMascarado(pessoa.telefone)}</strong></div>{/if}
          {#if saiu && pessoa?.dataSaida}<div><span>Saída</span><strong class="sv-num">{dataBr(pessoa.dataSaida)}</strong></div>{/if}
        </div>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet blocoEspiritual()}
  <Cartao titulo="Vida espiritual" icone="coracao" pad="justo">
    <div class="dados">
      <Dado rotulo="Conversão" valor={conversao} vazio="não informada" />
      <Dado rotulo="Batismo nas águas" valor={batAguas} vazio="não informado" />
      <Dado rotulo="Batismo no Espírito" valor={batES} vazio="não informado" />
      <Dado rotulo="Procedência" valor={procedencia} vazio="—" />
    </div>
  </Cartao>
{/snippet}

{#snippet blocoPessoais()}
  <Cartao titulo="Dados pessoais" icone="pessoa" pad="justo">
    <div class="dados">
      <Dado rotulo="Nascimento" valor={pessoa?.dataNascimento ? `${dataBr(pessoa.dataNascimento)}${anos !== null ? ` · ${anos} anos` : ""}` : ""} vazio="não informado" />
      <Dado rotulo="CPF">
        <strong class="cpf sv-num">{cpfInteiro ?? pessoa?.cpfMascarado ?? "—"}{#if pessoa?.cpfMascarado && !cpfInteiro}<span class="masc"> (mascarado)</span>{/if}</strong>
        {#snippet acao()}{#if sessao.geral && pessoa?.cpfMascarado && !cpfInteiro}<Botao tipo="texto" onclick={mostrarCpf}>Mostrar</Botao>{/if}{/snippet}
      </Dado>
      <Dado rotulo="Estado civil" valor={estadoCivil(pessoa?.estadoCivil, pessoa?.sexo)} vazio="não informado" />
      <Dado rotulo="Escolaridade" valor={pessoa?.escolaridade ? ESCOLARIDADE[pessoa.escolaridade] ?? pessoa.escolaridade : ""} vazio="não informada" />
    </div>
  </Cartao>
{/snippet}

{#snippet editaveis(lista: readonly CampoFicha[])}
  {#each lista as c (c.chave)}
    <CampoEditavel campo={c} sexo={pessoa?.sexo ?? null} {deps} {enderecoAtual} mudou={ultimaMudanca.get(c.chave) ?? ""} aberto={editando === c.chave} {salvando}
      erro={editando === c.chave ? erroCampo : ""} onabrir={() => { editando = c.chave; erroCampo = ""; outraFicha = null; }} onfechar={() => { editando = null; erroCampo = ""; }}
      onsalvar={(v) => salvarCampo(c, v)}>
      {#snippet extra()}{#if outraFicha}<button type="button" class="link" onclick={() => ir({ tela: "ficha", id: outraFicha!, secao: "resumo" })}>Abrir a ficha {outraFicha}</button>{/if}{/snippet}
    </CampoEditavel>
  {/each}
{/snippet}

{#snippet grupoEditavel(titulo: string, lista: readonly CampoFicha[])}
  {#if lista.length}
    <h4 class="grupo">{titulo}</h4>
    {@render editaveis(lista)}
  {/if}
{/snippet}

{#snippet quemMudou()}
  <Cartao titulo="Quem mudou o quê">
    {#if falhas.alteracoes}<Estado tipo="erro" texto={falhas.alteracoes} ontentar={carregarCampos} />
    {:else if !campos}<Estado tipo="carregando" linhas={4} />
    {:else if !alteracoes.length}<Estado tipo="vazio" texto="Nenhuma mudança registrada ainda." />
    {:else}
      <ol class="quem-mudou">
        {#each alteracoes.slice(0, 8) as a (a.id)}
          <li><small>{haQuanto(a.quando) === "hoje" ? "hoje" : dataBr(a.quando)} · {a.quem?.matricula && String(a.quem.matricula) === sessao.matricula ? "Você" : a.quem?.nome ?? "a secretaria"}</small><strong>{resumoMudanca(a)}</strong></li>
        {/each}
      </ol>
      {#if altTotal > 8}<Botao tipo="texto" onclick={() => ir2("alteracoes")}>Ver todas ({numero(altTotal)})</Botao>{/if}
    {/if}
  </Cartao>
{/snippet}

{#snippet secaoAtual()}
  {#if secao === "resumo"}
    <div class="resumo">
      <Cartao titulo="Vida na Igreja" nota={celular ? "todos veem" : "todos veem · mais recente primeiro"}>
        {#if falhas.linha}<Estado tipo="erro" texto={falhas.linha} ontentar={carregarPessoa} />{:else if !linha}<Estado tipo="carregando" linhas={5} />{:else if eventos.length}<LinhaTempo eventos={eventos} max={celular ? 4 : 7} />{:else}<Estado tipo="vazio" texto="Nada registrado ainda na vida desta pessoa na Igreja." />{/if}
        {#if eventos.length > (celular ? 4 : 7)}<Botao tipo="texto" onclick={() => ir2("vida")}>Ver a linha do tempo inteira ({eventos.length})</Botao>{/if}
      </Cartao>
      {#if !celular}<div class="col">{@render blocoEspiritual()}{@render blocoPessoais()}</div>{/if}
    </div>
  {:else if secao === "dados"}
    <div class="duas">
      <section class="cartao-base editar" aria-label="Dados pessoais">
        {#if falhas.campos}<div class="pad"><Estado tipo="erro" texto={falhas.campos} ontentar={carregarCampos} /></div>{:else if !campos}<div class="pad"><Estado tipo="carregando" linhas={7} /></div>
        {:else}
          {@render grupoEditavel("Dados pessoais", camposDo("Dados pessoais"))}
          {@render grupoEditavel("Filiação", camposDo("Filiação"))}
          {@render grupoEditavel("Contato", camposDo("Contato"))}
        {/if}
      </section>
      <div class="lado">{@render quemMudou()}</div>
    </div>
  {:else if secao === "vida"}
    <div class="duas">
      <div class="col">
        {@render blocoEspiritual()}
        <section class="cartao-base editar" aria-label="Datas e entrada na igreja">
          {#if falhas.campos}<div class="pad"><Estado tipo="erro" texto={falhas.campos} ontentar={carregarCampos} /></div>{:else if !campos}<div class="pad"><Estado tipo="carregando" linhas={5} /></div>
          {:else}{@render grupoEditavel("Vida espiritual", camposDo("Vida espiritual"))}{@render grupoEditavel("Na igreja", camposDo("Na igreja"))}{/if}
        </section>
      </div>
      <div class="lado">
        <Cartao titulo="A linha do tempo inteira" nota="{eventos.length} {eventos.length === 1 ? 'fato' : 'fatos'}">
          {#if eventos.length}<LinhaTempo {eventos} />{:else}<Estado tipo="vazio" texto="Nada registrado ainda." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "familia"}
    <div class="duas">
      <div class="col">
        <Cartao titulo="Filiação" icone="pessoas" pad="justo">
          <div class="dados"><Dado rotulo="Mãe" valor={pessoa?.nomeMae} vazio="não informada" /><Dado rotulo="Pai" valor={pessoa?.nomePai} vazio="não informado" /></div>
        </Cartao>
        <Cartao titulo="Parentes no cadastro" icone="pessoas">
          {#if falhas.vinculos}<Estado tipo="erro" texto={falhas.vinculos} ontentar={lerVinculos} />
          {:else if vinculos === null}<Estado tipo="carregando" linhas={3} />
          {:else if !vinculos.length}<Estado tipo="vazio" texto="Nenhum parente ligado a esta ficha." />
          {:else}
            <ul class="parentes">
              {#each vinculos as v (v.vinculoId)}
                <li><button type="button" onclick={() => ir({ tela: "ficha", id: v.outraPessoaId, secao: "resumo" })}><span class="av">{iniciais(v.outraPessoaNome)}</span><span><strong>{v.outraPessoaNome}</strong><small>{v.rotulo}</small></span><Icone nome="seta" tam={16} traco={2} /></button></li>
              {/each}
            </ul>
          {/if}
        </Cartao>
      </div>
      <div class="lado">
        <Cartao titulo="Casamento e filhos" nota="na linha do tempo">
          {#if de("FAMILIA").length}<LinhaTempo eventos={de("FAMILIA")} />{:else}<Estado tipo="vazio" texto="Nenhum casamento ou apresentação registrado." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "cargos"}
    <div class="duas">
      <div class="col">
        <Cartao titulo="Cargo e função de hoje" icone="escudo" pad="justo">
          <div class="dados">
            <Dado rotulo="Função" valor={pessoa?.funcao} vazio="membro" />
            <Dado rotulo="No cargo desde" valor={dataBr(pessoa?.cargoDesde)} vazio="—" />
          </div>
        </Cartao>
        {#if de("LICENCA").length}<Cartao titulo="Licenças"><LinhaTempo eventos={de("LICENCA")} /></Cartao>{/if}
      </div>
      <div class="lado">
        <Cartao titulo="Consagrações e cargos" nota="mais recente primeiro">
          {#if de("MINISTERIO").length}<LinhaTempo eventos={de("MINISTERIO")} />{:else}<Estado tipo="vazio" texto="Nenhuma consagração ou cargo registrado." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "ministerios"}
    <div class="duas">
      <div class="col">
        <section class="cartao-base editar" aria-label="Departamento">
          <h4 class="grupo">Departamento</h4>
          {#if falhas.campos}<div class="pad"><Estado tipo="erro" texto={falhas.campos} ontentar={carregarCampos} /></div>{:else if !campos}<div class="pad"><Estado tipo="carregando" linhas={1} /></div>{:else if campoDep}{@render editaveis([campoDep])}{/if}
          <p class="nota-dep">Um departamento por pessoa, pela idade, separado dos ministérios onde ela serve.</p>
        </section>
      </div>
      <div class="lado">
        <Cartao titulo="Onde serve" nota="ministérios e funções">
          {#if de("MINISTERIO").filter((e: EventoVida) => e.tipo.startsWith("CARGO")).length}<LinhaTempo eventos={de("MINISTERIO").filter((e: EventoVida) => e.tipo.startsWith("CARGO"))} />
          {:else}<Estado tipo="vazio" texto="Nenhum ministério registrado." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "assembleia"}
    <div class="duas">
      <div class="col">
        <Cartao titulo="Assembleia" icone="urna" pad="justo">
          <div class="dados">
            <Dado rotulo="Vota na assembleia" valor={vota ? "Sim" : "Não"} sub={pessoa?.capacidade?.emPeriodoIntegracao ? "em período de integração" : pessoa?.capacidade?.categoria ?? ""} />
            <Dado rotulo="Situação" valor={sit?.rotulo ?? ""} />
          </div>
        </Cartao>
      </div>
      <div class="lado">
        <Cartao titulo="Disciplina e saída" nota="só quem cuida da disciplina vê o motivo">
          {#if de("DISCIPLINA", "SAIDA").length}<LinhaTempo eventos={de("DISCIPLINA", "SAIDA")} />{:else}<Estado tipo="vazio" texto="Nada registrado." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "documentos"}
    <div class="duas">
      <div class="col">
        <Cartao titulo="Carteirinha" icone="cartao">
          {#if cuidaDoCadastro()}<NaFicha membroId={id} />{:else if !de("CREDENCIAL").length}<Estado tipo="vazio" texto="Nenhuma carteirinha emitida." />{/if}
          {#if de("CREDENCIAL").length}<h4 class="sub-cart">Credencial (vias)</h4><LinhaTempo eventos={de("CREDENCIAL")} />{/if}
          {#if falhas.pendencias}<Estado tipo="erro" texto="Não deu para conferir as pendências do cadastro (e se a impressão está bloqueada)." ontentar={lerPendencias} />{/if}
          {#if pendencias?.impressaoFisicaBloqueada}<Aviso tom="alerta"><strong>A impressão da carteirinha física está bloqueada</strong> enquanto a ficha tiver pendência de cadastro.</Aviso>{/if}
        </Cartao>
        {#if pendencias && pendencias.pendencias.length}
          <Cartao titulo="Pendências do cadastro" icone="alerta">
            <ul class="pend">{#each pendencias.pendencias as p, i (i)}<li>{p.rotulo ?? p.descricao ?? p.tipo}</li>{/each}</ul>
          </Cartao>
        {/if}
      </div>
      <div class="lado">
        <Cartao titulo="Cartas" nota="na linha do tempo">
          {#if de("CARTAS").length}<LinhaTempo eventos={de("CARTAS")} />{:else}<Estado tipo="vazio" texto="Nenhuma carta registrada." />{/if}
        </Cartao>
      </div>
    </div>
  {:else if secao === "alteracoes"}
    <Cartao titulo="Alterações" nota="quem mudou o quê e quando">
      {#if falhas.alteracoes}<Estado tipo="erro" texto={falhas.alteracoes} ontentar={carregarCampos} />
      {:else if !campos}<Estado tipo="carregando" linhas={6} />
      {:else if !alteracoes.length}<Estado tipo="vazio" texto="Nenhuma alteração registrada." />
      {:else}
        <ol class="alteracoes">
          {#each alteracoes as a (a.id)}
            <li>
              <div class="alt-topo"><strong>{a.acao}</strong><small class="sv-num">{dataBr(a.quando)} · {a.quem?.nome ?? "a secretaria"}</small></div>
              {#each a.mudancas as m (m.campo)}
                <div class="alt-m"><span>{m.campo === "congregacaoId" ? "Congregação" : m.rotulo}</span><s>{textoDoValor(m.campo, m.antes, pessoa?.sexo ?? null, deps) || "vazio"}</s><Icone nome="seta" tam={14} traco={2} /><strong>{textoDoValor(m.campo, m.depois, pessoa?.sexo ?? null, deps) || "vazio"}</strong></div>
              {/each}
            </li>
          {/each}
        </ol>
        {#if alteracoes.length < altTotal}<Botao tipo="texto" onclick={maisAlteracoes}>Ver mais</Botao>{/if}
      {/if}
    </Cartao>
  {/if}
{/snippet}

{#if erro}
  <Estado tipo="erro" texto={erro} ontentar={carregarPessoa} />
{:else if !pessoa}
  <div class="cartao-base pad"><Estado tipo="carregando" linhas={5} /></div>
{:else if celular}
  <div class="ficha-cel">
    <Pilulas rotulo="Nesta ficha" cheias={false} itens={SECOES.map((s) => ({ chave: s.chave, rotulo: s.curto }))} ativa={secao} onescolher={(k) => ir2(k)} />
    <div class="corpo-cel">
      {#if secao === "resumo"}{@render cabecalho()}{/if}
      {#if secao !== "resumo"}<h2 class="tit-sec">{SECOES.find((s) => s.chave === secao)?.rotulo}</h2>{/if}
      {@render secaoAtual()}
    </div>
  </div>
{:else}
  <div class="ficha">
    <div class="centro">
      {@render cabecalho()}
      {@render secaoAtual()}
    </div>
    <nav class="sub" aria-label="Nesta ficha">
      <span class="sub-tit">Nesta ficha</span>
      {#each SECOES as s (s.chave)}
        <button type="button" class:ativo={s.chave === secao} aria-current={s.chave === secao ? "page" : undefined} onclick={() => ir2(s.chave)}><Icone nome={s.icone} tam={17} traco={2} />{s.rotulo}</button>
      {/each}
    </nav>
  </div>
{/if}

<style>
  .ficha { display: flex; gap: 16px; align-items: flex-start; }
  .centro { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .cartao-base { background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); }
  .pad { padding: 16px 18px; }
  .cab { display: flex; gap: 18px; align-items: flex-start; padding: 16px 18px; }
  .foto { border-radius: 14px; background: linear-gradient(160deg, #C9D8FB, #7EA2EE); color: #0A2342; display: flex; flex-direction: column; align-items: center; justify-content: center; flex: none; overflow: hidden; }
  .foto strong { font-size: 30px; font-weight: 800; line-height: 1; }
  .foto span { font-size: 11px; margin-top: 6px; opacity: .8; }
  .foto img { width: 100%; height: 100%; object-fit: cover; }
  .quem { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .linha1 { display: flex; align-items: flex-start; gap: 12px; }
  .nomes { flex: 1; min-width: 0; }
  h1 { font-size: 24px; font-weight: 800; color: var(--sv-titulo); line-height: 1.2; overflow-wrap: anywhere; }
  .nomes p { font-size: 14px; color: var(--sv-suave); margin-top: 2px; }
  .botoes { display: flex; gap: 8px; flex: none; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .fatos { display: flex; gap: 28px; flex-wrap: wrap; margin-top: 2px; }
  .fatos div { display: flex; flex-direction: column; gap: 2px; }
  .fatos span { font-size: 12.5px; color: var(--sv-suave); }
  .fatos strong { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .resumo { display: grid; grid-template-columns: 1.05fr 1fr; gap: 14px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .duas { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .lado { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
  .dados { display: flex; flex-direction: column; }
  .dados :global(.dado:first-child) { border-top: 0; }
  .cpf { font-size: 15px; font-weight: 700; color: var(--sv-titulo); }
  .masc { font-weight: 500; font-size: 13px; color: var(--sv-suave); }
  .editar { overflow: hidden; }
  .grupo { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); padding: 14px 18px 8px; }
  .grupo:not(:first-child) { border-top: 1px solid var(--sv-borda); }
  .nota-dep { font-size: 13px; color: var(--sv-suave); padding: 8px 18px 14px; border-top: 1px solid var(--sv-linha); }
  .quem-mudou { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .quem-mudou li { display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid var(--sv-linha); }
  .quem-mudou li:first-child { border-top: 0; padding-top: 2px; }
  .quem-mudou small { font-size: 12.5px; color: var(--sv-suave); }
  .quem-mudou strong { font-size: 14.5px; color: var(--sv-titulo); }
  .parentes { list-style: none; margin: 0; padding: 0; }
  .parentes li + li { border-top: 1px solid var(--sv-linha); }
  .parentes button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; border: 0; background: transparent; text-align: left; cursor: pointer; color: var(--sv-suave); }
  .parentes span:nth-child(2) { flex: 1; display: flex; flex-direction: column; }
  .parentes strong { color: var(--sv-titulo); font-size: 14.5px; }
  .parentes small { font-size: 12.5px; }
  .av { width: 32px; height: 32px; border-radius: 50%; background: var(--sv-mod-fundo); color: var(--sv-mod); font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .pend { margin: 0; padding-left: 18px; font-size: 14px; color: var(--sv-texto); display: flex; flex-direction: column; gap: 4px; }
  .alteracoes { list-style: none; margin: 0; padding: 0; }
  .alteracoes li { padding: 12px 0; border-top: 1px solid var(--sv-linha); display: flex; flex-direction: column; gap: 6px; }
  .alteracoes li:first-child { border-top: 0; }
  .alt-topo { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .alt-topo strong { font-size: 14.5px; color: var(--sv-titulo); }
  .alt-topo small { font-size: 12.5px; color: var(--sv-suave); }
  .alt-m { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--sv-suave); flex-wrap: wrap; }
  .alt-m span { width: 140px; flex: none; }
  .alt-m strong { color: var(--sv-titulo); }
  .link { border: 0; background: transparent; color: var(--sv-link); font-weight: 700; cursor: pointer; margin-left: 6px; padding: 0; text-decoration: underline; }
  .sub {
    width: 242px; flex: none; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 10px 8px;
    display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px;
  }
  .sub-tit { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); padding: 4px 10px 6px; }
  .sub button {
    display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 10px; border-radius: 9px; border: 0; background: transparent; cursor: pointer;
    font-size: 14.5px; font-weight: 500; color: var(--sv-titulo); text-align: left; transition: background-color .15s ease;
  }
  .sub button :global(svg) { color: var(--sv-icone); }
  @media (hover: hover) { .sub button:hover { background: var(--sv-linha); } }
  .sub button.ativo { font-weight: 700; background: var(--sv-info-fundo); box-shadow: inset 3px 0 0 var(--sv-ouro); }
  .ficha-cel { display: flex; flex-direction: column; margin: -16px -16px 0; }
  .corpo-cel { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .cab-cel { display: flex; gap: 14px; align-items: center; }
  .cab-cel h1 { font-size: 19px; }
  .cab-cel p { font-size: 12.5px; color: var(--sv-suave); margin-top: 4px; }
  .botoes-cel { display: flex; gap: 8px; }
  .tit-sec { font-size: 19px; font-weight: 800; color: var(--sv-titulo); }
  .ficha-cel .resumo, .ficha-cel .duas { grid-template-columns: 1fr; }
  @media (max-width: 1180px) { .resumo, .duas { grid-template-columns: 1fr; } }
  .sub-cart { margin: 6px 0 0; font-size: 13px; color: var(--sv-suave); }
</style>
