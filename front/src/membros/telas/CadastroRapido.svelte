<!-- 7. O CADASTRO RÁPIDO (rodada 9, opção 1 "uma tela só"): poucos campos e "Enviar para a secretaria"; nada preso embaixo (o botão fica no fim).
     Caminho seguro (a regra escrita da rodada 10 e do passo 4): além do desenho, o CPF e o e-mail — com eles a pessoa entra sozinha; o celular é opcional. -->
<script lang="ts">
  import { pedir } from "../../comum/api";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import { ir, escopo, lerContadores } from "../estado.svelte";
  import type { ResumoPainel } from "../tipos";

  interface Props { celular: boolean }
  let { celular }: Props = $props();

  const f = $state({ nome: "", dataNascimento: "", cpf: "", email: "", telefone: "", congregacaoId: null as number | null, autorizo: false });
  let congs = $state<{ congregacaoId: number; nome: string }[]>([]);
  let enviando = $state(false);
  let erro = $state("");
  let resultado = $state<{ matricula: number | null; pendencias: string[] } | null>(null);
  const lerCongs = (r: ResumoPainel | null) => {
    congs = (r?.congregacoes ?? []).map((c) => ({ congregacaoId: c.congregacaoId, nome: c.nome }));
    if (congs.length === 1 && congs[0]) f.congregacaoId = congs[0].congregacaoId;
  };
  if (escopo.resumo) lerCongs(escopo.resumo);
  else void pedir<{ resumo: ResumoPainel }>("/pessoas?resumo=1").then((x) => { if (x.ok) { escopo.resumo = x.dados.resumo; lerCongs(x.dados.resumo); } });
  const nomeCong = $derived(congs.find((c) => c.congregacaoId === f.congregacaoId)?.nome ?? "");

  async function enviar() {
    erro = "";
    if (f.nome.trim().length < 3) { erro = "Escreva o nome completo."; return; }
    if (!f.dataNascimento) { erro = "Informe o nascimento."; return; }
    if (!f.congregacaoId) { erro = "Escolha a congregação."; return; }
    if (!f.autorizo) { erro = "Marque a autorização para a Igreja guardar os dados."; return; }
    enviando = true;
    const x = await pedir<{ matricula?: number | null; preCadastro?: { pendencias?: { rotulo: string }[] } }>("/pre-cadastros", { metodo: "POST", corpo: {
      nome: f.nome.trim(), dataNascimento: f.dataNascimento, cpf: f.cpf.trim() || null, email: f.email.trim() || null, telefone: f.telefone.trim() || null,
      congregacaoId: f.congregacaoId, consentimentoDaPessoa: true } });
    enviando = false;
    if (!x.ok) { erro = x.mensagem; return; }
    resultado = { matricula: x.dados.matricula ?? null, pendencias: (x.dados.preCadastro?.pendencias ?? []).map((p) => p.rotulo) };
    Object.assign(f, { nome: "", dataNascimento: "", cpf: "", email: "", telefone: "", autorizo: false });
    void lerContadores();
  }
</script>

<div class="rapido" class:celular>
  {#if !celular}<Cabecalho titulo="Cadastro rápido" sub="Só o essencial; a secretaria confere e completa o resto" />{/if}
  {#if resultado}
    {#if resultado.matricula}
      <Aviso tom="ok"><strong>Entrou no rol</strong> com a matrícula {resultado.matricula}.
        {#snippet acao()}<Botao tipo="linha" tam="pequeno" onclick={() => ir({ tela: "ficha", id: resultado!.matricula!, secao: "resumo" })}>Abrir a ficha</Botao>{/snippet}</Aviso>
    {:else}
      <Aviso tom="info"><strong>Enviado para a secretaria.</strong> Falta: {resultado.pendencias.join("; ") || "conferir"}.</Aviso>
    {/if}
    <div><Botao tipo="linha" icone="mais" onclick={() => (resultado = null)}>Cadastrar outra pessoa</Botao></div>
  {:else}
    <form class="form" onsubmit={(e) => { e.preventDefault(); void enviar(); }}>
      {#if celular && nomeCong}<p class="onde">{nomeCong}</p>{/if}
      <Campo rotulo="Nome completo" obrigatorio valor={f.nome} oninput={(v) => (f.nome = v)} autocomplete="name" />
      <Campo rotulo="Nascimento" obrigatorio tipo="date" valor={f.dataNascimento} oninput={(v) => (f.dataNascimento = v)} />
      <Campo rotulo="CPF" opcional valor={f.cpf} oninput={(v) => (f.cpf = v)} inputmode="numeric" maxlength={14} dica="Com CPF e e-mail, a pessoa entra sozinha no rol." />
      <Campo rotulo="E-mail" opcional tipo="email" valor={f.email} oninput={(v) => (f.email = v)} dica="É por onde ela cria a senha." />
      <Campo rotulo="Celular" opcional tipo="tel" valor={f.telefone} oninput={(v) => (f.telefone = v)} inputmode="tel" />
      <div class="grupo"><span class="rot">Congregação <span class="obr">*</span></span>
        {#if congs.length === 1}<Escolha rotulo={nomeCong} estilo="trava" larga valor={null} opcoes={[]} onescolher={() => {}} />
        {:else}<Escolha rotulo="Escolha a congregação" estilo="campo" larga valor={f.congregacaoId} opcoes={congs.map((c) => ({ valor: c.congregacaoId, rotulo: c.nome }))} onescolher={(v) => (f.congregacaoId = v)} />{/if}
      </div>
      <label class="autorizo"><input type="checkbox" bind:checked={f.autorizo} /><span>Autorizo a Igreja a guardar estes dados para o cadastro de membros.</span></label>
      {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
      <Botao tipo="ouro" tam="grande" largo ocupado={enviando} onclick={() => void enviar()}>Enviar para a secretaria</Botao>
      <Aviso tom="info">A secretaria de <strong>{nomeCong || "sua congregação"}</strong> confere e aceita. A matrícula sai no aceite.</Aviso>
    </form>
  {/if}
</div>

<style>
  .rapido { display: flex; flex-direction: column; gap: 14px; }
  .form { max-width: 520px; display: flex; flex-direction: column; gap: 14px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 20px; }
  .celular .form { background: transparent; border: 0; padding: 0; max-width: none; }
  .onde { font-size: 13.5px; color: var(--sv-suave); }
  .grupo { display: flex; flex-direction: column; gap: 6px; }
  .rot { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); }
  .autorizo { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; color: var(--sv-texto); line-height: 1.4; }
  .autorizo input { width: 20px; height: 20px; margin: 0; flex: none; accent-color: #0A2342; }
  .erro { color: var(--sv-atr); font-weight: 600; font-size: 14px; }
</style>
