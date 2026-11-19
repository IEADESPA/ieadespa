<!-- 5. CADASTRAR PESSOA EM ETAPAS (rodada 8, opção 3 "com a prévia da ficha"): as 5 etapas em círculos ligados por linha, a ficha como vai ficar
     ao lado (muda enquanto se preenche) e a BARRA QUE CONFERE nome, nascimento e CPF ao digitar (17/11: CPF de outra ficha não deixa concluir). -->
<script lang="ts">
  import { pedir } from "../../comum/api";
  import { dataBr, idade, iniciais, telefoneMascarado } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Opcoes from "../../comum/Opcoes.svelte";
  import Etapas from "../../comum/Etapas.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, escopo, departamentos, lerContadores } from "../estado.svelte";
  import { cadastro, limparRascunho } from "../rascunho.svelte";
  import { sugerirDepartamento } from "../departamento";
  import { ESCOLARIDADE, ESTADO_CIVIL } from "../rotulos";
  import type { Departamento, ResumoPainel } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const ETAPAS = ["Dados pessoais", "Família", "Contato", "Na igreja", "Conferir"];
  const r = $derived(cadastro.r);
  let deps = $state<readonly Departamento[]>([]);
  let cargos = $state<{ sigla: string; nome: string }[]>([]);
  let congs = $state<{ congregacaoId: number; nome: string }[]>([]);
  let erro = $state("");
  let salvando = $state(false);
  let feito = $state<{ matricula: number | null; mensagem: string } | null>(null);
  interface Conferencia { cpf?: { situacao: string; mensagem?: string; matricula?: number; nome?: string }; parecidos?: { matricula: number; nome: string; congregacao: string | null }[]; bloqueia?: boolean }
  let conf = $state<Conferencia | null>(null);
  let confEspera: ReturnType<typeof setTimeout> | null = null;

  void departamentos().then((d) => (deps = d));
  void pedir<{ sigla: string; nome: string; ativo?: boolean }[]>("/catalogos/cargosMinisteriais").then((x) => { if (x.ok && Array.isArray(x.dados)) cargos = x.dados.filter((c) => c.ativo !== false); });
  const lerCongs = (res: ResumoPainel | null) => (congs = (res?.congregacoes ?? []).map((c) => ({ congregacaoId: c.congregacaoId, nome: c.nome })));
  if (escopo.resumo) lerCongs(escopo.resumo);
  let erroCongs = $state("");
  function lerResumo() {
    erroCongs = "";
    void pedir<{ resumo: ResumoPainel }>("/pessoas?resumo=1").then((x) => { if (x.ok) { escopo.resumo = x.dados.resumo; lerCongs(x.dados.resumo); } else erroCongs = x.mensagem; });
  }
  if (!escopo.resumo) lerResumo();
  $effect(() => { if (congs.length === 1 && congs[0] && cadastro.r.congregacaoId === null) cadastro.r.congregacaoId = congs[0].congregacaoId; });

  // o departamento pela idade (a secretaria pode trocar)
  const sugestao = $derived(sugerirDepartamento(deps, r.dataNascimento, r.sexo, r.estadoCivil));
  $effect(() => { if (!cadastro.r.departamentoTrocado) cadastro.r.departamentoId = sugestao ? sugestao.departamento.departamentoId : null; });
  const nomeDep = $derived(deps.find((d) => d.departamentoId === r.departamentoId)?.nome ?? "");
  const nomeCong = $derived(congs.find((c) => c.congregacaoId === r.congregacaoId)?.nome ?? "");
  const anos = $derived(idade(r.dataNascimento));
  const membro = $derived(r.formaAdmissao !== "CONGREGADO");

  function conferirDepois() {
    if (confEspera) clearTimeout(confEspera);
    confEspera = setTimeout(conferir, 500);
  }
  let confSeq = 0;
  async function conferir() {
    const cpf = r.cpf.replace(/\D/g, "");
    const meu = ++confSeq;
    if (!cpf && !(r.nome.trim().length >= 2 && r.dataNascimento)) { conf = null; return; }
    const x = await pedir<Conferencia>("/cadastro/conferir", { metodo: "POST", corpo: { cpf: cpf || null, nome: r.nome.trim() || null, dataNascimento: r.dataNascimento || null, congregacaoId: r.congregacaoId } });
    if (meu !== confSeq) return;   // a resposta de um CPF antigo não vale para o de agora
    // sem conferir agora, não bloqueia: o servidor confere de novo ao salvar
    conf = x.ok ? x.dados : null;
  }
  const bloqueia = $derived(!!conf?.bloqueia);

  function faltaNaEtapa(i: number): string {
    if (i === 0) {
      if (r.nome.trim().length < 3) return "Escreva o nome completo.";
      if (!r.dataNascimento) return "Informe a data de nascimento.";
      if (!r.sexo) return "Escolha o sexo.";
      if (bloqueia) return "Este CPF já está em outra ficha: abra a ficha que já existe.";
    }
    if (i === 3) {
      if (!r.congregacaoId) return "Escolha a congregação.";
      if (membro && !r.dataAdmissao) return "Informe a data de entrada.";
    }
    return "";
  }
  function proximo() {
    const f = faltaNaEtapa(r.etapa);
    if (f) { erro = f; return; }
    erro = "";
    cadastro.r.etapa = Math.min(ETAPAS.length - 1, r.etapa + 1);
  }
  async function salvar() {
    if (salvando) return;
    for (const i of [0, 3]) { const f = faltaNaEtapa(i); if (f) { erro = f; cadastro.r.etapa = i; return; } }
    salvando = true; erro = "";
    const corpo: Record<string, unknown> = {
      gerarMatricula: true, nome: r.nome.trim(), dataNascimento: r.dataNascimento, sexo: r.sexo, estadoCivil: r.estadoCivil || null, escolaridade: r.escolaridade || null,
      telefone: r.telefone.trim() || null, email: r.email.trim() || null, congregacaoId: r.congregacaoId, departamentoId: r.departamentoId,
      situacaoMembro: membro ? "EM_COMUNHAO" : "CONGREGADO", status: "ATIVO", cargoMinisterial: r.cargoMinisterial || null
    };
    if (r.cpf.trim()) corpo.cpf = r.cpf.trim();
    if (r.nomeMae.trim()) corpo.nomeMae = r.nomeMae.trim();
    if (r.nomePai.trim()) corpo.nomePai = r.nomePai.trim();
    if (membro) { corpo.formaAdmissao = r.formaAdmissao; corpo.dataAdmissao = r.dataAdmissao; }
    if (r.logradouro.trim() || r.bairroTexto.trim() || r.cidade.trim()) {
      corpo.enderecoPartes = { logradouro: r.logradouro.trim(), numero: r.numero.trim(), complemento: r.complemento.trim(), bairroTexto: r.bairroTexto.trim(), cidade: r.cidade.trim(), uf: r.uf.trim(), cep: r.cep.trim() };
    }
    const x = await pedir<{ mensagem?: string; membro?: { membroId: number } }>("/pessoas", { metodo: "POST", corpo });
    salvando = false;
    if (x.ok) {
      const m = /matr[íi]cula (\d+)/i.exec(x.dados.mensagem ?? "");
      feito = { matricula: x.dados.membro?.membroId ?? (m ? Number(m[1]) : null), mensagem: x.dados.mensagem ?? "Pessoa cadastrada." };
      limparRascunho();
      escopo.resumo = null;
      void lerContadores();
      return;
    }
    const c = x.corpo as { cpfRepetido?: string; matricula?: number } | null;
    if (c?.cpfRepetido) { conf = { cpf: { situacao: c.cpfRepetido, mensagem: x.mensagem, ...(c.matricula ? { matricula: c.matricula } : {}) }, bloqueia: true }; cadastro.r.etapa = 0; }
    erro = x.mensagem;
  }
  const opcoesEstadoCivil = Object.entries(ESTADO_CIVIL).map(([valor, [m, f]]) => ({ valor, rotulo: m === f ? m : `${m} / ${f}` }));
  const opcoesEscolaridade = Object.entries(ESCOLARIDADE).map(([valor, rotulo]) => ({ valor, rotulo }));
  const FORMAS = [{ valor: "BATISMO", rotulo: "Batismo" }, { valor: "CARTA_MUDANCA", rotulo: "Carta de mudança" }, { valor: "RECONCILIACAO", rotulo: "Reconciliação" }, { valor: "ACLAMACAO", rotulo: "Aclamação" }, { valor: "CONGREGADO", rotulo: "Ainda não é membro" }];
</script>

{#snippet barraConfere()}
  {#if conf?.cpf && (conf.cpf.situacao === "NO_ESCOPO" || conf.cpf.situacao === "FORA_DO_ESCOPO")}
    <Aviso tom="erro">
      <strong>Este CPF já tem cadastro.</strong> {conf.cpf.mensagem ?? ""}
      {#snippet acao()}{#if conf?.cpf?.matricula}<Botao tipo="linha" tam="pequeno" onclick={() => ir({ tela: "ficha", id: conf!.cpf!.matricula!, secao: "resumo" })}>Ir para a ficha {conf.cpf.matricula}</Botao>{/if}{/snippet}
    </Aviso>
  {:else if conf?.cpf?.situacao === "INVALIDO"}
    <Aviso tom="alerta"><strong>CPF inválido.</strong> Confira os 11 números.</Aviso>
  {/if}
  {#if conf?.parecidos?.length}
    <Aviso tom="alerta"><strong>Parece com quem já tem ficha:</strong> {conf.parecidos.map((p) => `${p.nome} (${p.matricula}${p.congregacao ? " · " + p.congregacao : ""})`).join("; ")}. Confira antes de cadastrar de novo.</Aviso>
  {/if}
{/snippet}

{#snippet etapaAtual()}
  {#if r.etapa === 0}
    <Campo rotulo="Nome completo" obrigatorio valor={r.nome} oninput={(v) => (cadastro.r.nome = v)} onblur={conferirDepois} autocomplete="name" />
    <div class="duas">
      <Campo rotulo="Nascimento" obrigatorio tipo="date" valor={r.dataNascimento} oninput={(v) => { cadastro.r.dataNascimento = v; conferirDepois(); }} />
      <Campo rotulo="CPF" opcional valor={r.cpf} oninput={(v) => { cadastro.r.cpf = v; conferirDepois(); }} inputmode="numeric" placeholder="000.000.000-00" maxlength={14} />
    </div>
    <div class="grupo"><span class="rot">Sexo <span class="obr">*</span></span><Opcoes rotulo="Sexo" valor={r.sexo || null} opcoes={[{ valor: "F", rotulo: "Feminino" }, { valor: "M", rotulo: "Masculino" }]} onescolher={(v) => (cadastro.r.sexo = v)} /></div>
    <div class="duas">
      <div class="grupo"><span class="rot">Estado civil</span><Escolha rotulo="Escolha" estilo="campo" larga valor={r.estadoCivil || null} opcoes={opcoesEstadoCivil} onescolher={(v) => (cadastro.r.estadoCivil = v ?? "")} /></div>
      <div class="grupo"><span class="rot">Escolaridade</span><Escolha rotulo="Escolha" estilo="campo" larga valor={r.escolaridade || null} opcoes={opcoesEscolaridade} onescolher={(v) => (cadastro.r.escolaridade = v ?? "")} /></div>
    </div>
    {@render barraConfere()}
  {:else if r.etapa === 1}
    <Campo rotulo="Nome da mãe" opcional valor={r.nomeMae} oninput={(v) => (cadastro.r.nomeMae = v)} />
    <Campo rotulo="Nome do pai" opcional valor={r.nomePai} oninput={(v) => (cadastro.r.nomePai = v)} />
    <p class="nota">A filiação vai na carteirinha física e na digital.</p>
  {:else if r.etapa === 2}
    <div class="duas">
      <Campo rotulo="Celular" opcional tipo="tel" valor={r.telefone} oninput={(v) => (cadastro.r.telefone = v)} inputmode="tel" placeholder="(00) 00000-0000" />
      <Campo rotulo="E-mail" opcional tipo="email" valor={r.email} oninput={(v) => (cadastro.r.email = v)} dica="É por onde a pessoa cria a senha." />
    </div>
    <div class="end">
      <Campo rotulo="Rua" opcional valor={r.logradouro} oninput={(v) => (cadastro.r.logradouro = v)} autocomplete="address-line1" />
      <Campo rotulo="Número" valor={r.numero} oninput={(v) => (cadastro.r.numero = v)} />
    </div>
    <div class="tres">
      <Campo rotulo="Bairro" valor={r.bairroTexto} oninput={(v) => (cadastro.r.bairroTexto = v)} />
      <Campo rotulo="Cidade" valor={r.cidade} oninput={(v) => (cadastro.r.cidade = v)} autocomplete="address-level2" />
      <Campo rotulo="UF" valor={r.uf} oninput={(v) => (cadastro.r.uf = v.toUpperCase())} maxlength={2} />
    </div>
  {:else if r.etapa === 3}
    <div class="duas">
      <div class="grupo"><span class="rot">Congregação <span class="obr">*</span></span>
        {#if erroCongs}<Estado tipo="erro" texto="Não deu para ler as congregações: {erroCongs}" ontentar={lerResumo} />{/if}
        {#if congs.length === 1}<Escolha rotulo={`${nomeCong} (a sua congregação)`} estilo="trava" larga valor={null} opcoes={[]} onescolher={() => {}} />
        {:else}<Escolha rotulo="Escolha a congregação" estilo="campo" larga valor={r.congregacaoId} opcoes={congs.map((c) => ({ valor: c.congregacaoId, rotulo: c.nome }))} onescolher={(v) => (cadastro.r.congregacaoId = v)} />{/if}
      </div>
      {#if membro}<Campo rotulo="Data de entrada" obrigatorio tipo="date" valor={r.dataAdmissao} oninput={(v) => (cadastro.r.dataAdmissao = v)} />{/if}
    </div>
    <div class="grupo"><span class="rot">Como entrou <span class="obr">*</span></span><Opcoes rotulo="Como entrou" valor={r.formaAdmissao} opcoes={FORMAS} onescolher={(v) => (cadastro.r.formaAdmissao = v)} /></div>
    <div class="grupo"><span class="rot">Departamento</span>
      <div class="dep">
        <Icone nome="pessoas" tam={18} traco={2} />
        {#if r.departamentoId !== null}<strong>{nomeDep}</strong>{:else}<strong class="nada">sem departamento</strong>{/if}
        <span class="porque">{r.departamentoTrocado ? "escolhido pela secretaria" : sugestao ? `sugerido ${sugestao.porque}` : "informe o nascimento e o sexo para sugerir"}</span>
        <Escolha rotulo="Trocar" valor={null} opcoes={deps.map((d) => ({ valor: d.departamentoId, rotulo: d.nome }))} onescolher={(v) => { cadastro.r.departamentoId = v; cadastro.r.departamentoTrocado = v !== null; }} />
      </div>
    </div>
    <div class="duas">
      <div class="grupo"><span class="rot">Cargo</span><Escolha rotulo="Membro" estilo="campo" larga valor={r.cargoMinisterial || null} opcoes={cargos.map((c) => ({ valor: c.sigla, rotulo: c.nome }))} onescolher={(v) => (cadastro.r.cargoMinisterial = v ?? "")} /></div>
      <div class="grupo"><span class="rot">Serve em algum ministério? <span class="opc">(opcional)</span></span><Escolha rotulo="Em construção" estilo="trava" larga valor={null} opcoes={[]} onescolher={() => {}} /></div>
    </div>
  {:else}
    <div class="conferir">
      <div class="linha-c"><span>Nome</span><strong>{r.nome}</strong></div>
      <div class="linha-c"><span>Nascimento</span><strong>{dataBr(r.dataNascimento)}{anos !== null ? ` · ${anos} anos` : ""}</strong></div>
      <div class="linha-c"><span>CPF</span><strong>{r.cpf || "—"}</strong></div>
      <div class="linha-c"><span>Filiação</span><strong>{[r.nomeMae, r.nomePai].filter(Boolean).join(" e ") || "—"}</strong></div>
      <div class="linha-c"><span>Contato</span><strong>{[r.telefone, r.email].filter(Boolean).join(" · ") || "—"}</strong></div>
      <div class="linha-c"><span>Congregação</span><strong>{nomeCong || "—"}</strong></div>
      <div class="linha-c"><span>Entrada</span><strong>{membro ? `${FORMAS.find((f) => f.valor === r.formaAdmissao)?.rotulo ?? ""} · ${dataBr(r.dataAdmissao)}` : "Congregado (ainda não membro)"}</strong></div>
      <div class="linha-c"><span>Departamento</span><strong>{nomeDep || "—"}</strong></div>
    </div>
    {@render barraConfere()}
  {/if}
{/snippet}

<div class="cad" class:celular>
  {#if feito}
    <Aviso tom="ok"><strong>{feito.mensagem}</strong></Aviso>
    <div class="fim">
      {#if feito.matricula}<Botao tipo="ouro" icone="pessoa" onclick={() => ir({ tela: "ficha", id: feito!.matricula!, secao: "resumo" })}>Abrir a ficha</Botao>{/if}
      <Botao tipo="linha" icone="mais" onclick={() => (feito = null)}>Cadastrar outra pessoa</Botao>
    </div>
  {:else}
    {#if !celular}<Cabecalho titulo="Cadastrar pessoa" sub="Etapa {r.etapa + 1} de 5 · os campos com * são obrigatórios" />{/if}
    <Etapas passos={ETAPAS} atual={r.etapa} onir={(i) => (cadastro.r.etapa = i)} />
    <div class="lado-a-lado">
      <form class="form" onsubmit={(e) => { e.preventDefault(); if (r.etapa < 4) proximo(); else void salvar(); }}>
        {@render etapaAtual()}
        {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
        <div class="rodape">
          <span class="guardado">Fica guardado se sair.</span>
          {#if r.etapa > 0}<Botao tipo="linha" onclick={() => { erro = ""; cadastro.r.etapa = r.etapa - 1; }}>Voltar</Botao>{/if}
          {#if r.etapa < 4}<Botao tipo="ouro" onclick={proximo}>Próximo: {ETAPAS[r.etapa + 1]}</Botao>
          {:else}<Botao tipo="ouro" icone="check" ocupado={salvando} desligado={bloqueia} onclick={() => void salvar()}>Salvar o cadastro</Botao>{/if}
        </div>
      </form>
      {#if !celular}
        <aside class="previa" aria-label="Como a ficha vai ficar">
          <span class="ptit">Como a ficha vai ficar</span>
          <div class="pquem"><span class="pav">{iniciais(r.nome) || "?"}</span><div><strong>{r.nome || "Nome da pessoa"}</strong><small>a matrícula sai ao salvar</small></div></div>
          <div class="pl"><span>Nascimento</span><strong>{r.dataNascimento ? `${dataBr(r.dataNascimento)}${anos !== null ? ` · ${anos} anos` : ""}` : "—"}</strong></div>
          <div class="pl"><span>Filiação</span><strong>{[r.nomeMae.split(" ")[0], r.nomePai.split(" ")[0]].filter(Boolean).join(" e ") || "—"}</strong></div>
          <div class="pl"><span>Celular</span><strong>{r.telefone ? telefoneMascarado(r.telefone) : "—"}</strong></div>
          <div class="pl"><span>Congregação</span><strong>{nomeCong || "—"}</strong></div>
          <div class="pl"><span>Departamento</span><strong>{nomeDep || "—"}</strong></div>
          <small class="pnota">Muda enquanto você preenche.</small>
        </aside>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cad { display: flex; flex-direction: column; gap: 16px; }
  .lado-a-lado { display: flex; gap: 20px; align-items: flex-start; }
  .form { flex: 1; min-width: 0; max-width: 570px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .tres { display: grid; grid-template-columns: 1fr 1fr 80px; gap: 14px; }
  .end { display: grid; grid-template-columns: 1fr 110px; gap: 14px; }
  .grupo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .rot { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); }
  .opc { font-weight: 400; font-size: 12.5px; color: var(--sv-suave); }
  .dep { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 46px; padding: 6px 12px; border: 1px dashed var(--sv-campo-borda); border-radius: 10px; color: var(--sv-icone); }
  .dep strong { color: var(--sv-titulo); font-size: 15px; }
  .dep .nada { color: var(--sv-suave); font-weight: 500; }
  .porque { flex: 1; min-width: 150px; font-size: 13px; color: var(--sv-suave); }
  .nota { font-size: 13px; color: var(--sv-suave); }
  .erro { color: var(--sv-atr); font-size: 14px; font-weight: 600; }
  .rodape { display: flex; align-items: center; gap: 10px; justify-content: flex-end; padding-top: 4px; flex-wrap: wrap; }
  .guardado { margin-right: auto; font-size: 13px; color: var(--sv-suave); }
  .previa { width: 348px; flex: none; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 18px; display: flex; flex-direction: column; }
  .ptit { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-suave); }
  .pquem { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--sv-linha); }
  .pav { width: 50px; height: 50px; border-radius: 50%; background: var(--sv-mod-fundo); color: var(--sv-mod); font-weight: 800; font-size: 18px; display: flex; align-items: center; justify-content: center; flex: none; }
  .pquem strong { display: block; font-size: 16px; color: var(--sv-titulo); }
  .pquem small { font-size: 12.5px; color: var(--sv-suave); }
  .pl { display: flex; align-items: center; gap: 10px; min-height: 50px; border-bottom: 1px solid var(--sv-linha); }
  .pl span { width: 112px; flex: none; font-size: 13.5px; color: var(--sv-suave); }
  .pl strong { font-size: 14.5px; color: var(--sv-titulo); }
  .pnota { padding-top: 12px; font-size: 12.5px; color: var(--sv-suave); }
  .conferir { display: flex; flex-direction: column; }
  .linha-c { display: flex; gap: 10px; min-height: 42px; align-items: center; border-bottom: 1px solid var(--sv-linha); font-size: 14.5px; }
  .linha-c span { width: 120px; flex: none; color: var(--sv-suave); }
  .linha-c strong { color: var(--sv-titulo); }
  .fim { display: flex; gap: 10px; flex-wrap: wrap; }
  .celular .form { padding: 16px; }
  .celular .duas, .celular .tres, .celular .end { grid-template-columns: 1fr; }
</style>
