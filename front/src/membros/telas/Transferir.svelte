<!-- 8a. PEDIR A TRANSFERÊNCIA (rodada 8, "pedido simples"): a pessoa, "Sai de › Vai para", e a tela já diz, ANTES de enviar, se entra na hora ou quem
     precisa aceitar (as regras de 13/11: pela Geral ou na mesma área entra na hora; entre áreas, o destino — ou a Geral — aceita ou recusa). -->
<script lang="ts">
  import { pedir, qs } from "../../comum/api";
  import { ponte } from "../../comum/ponte";
  import { primeiroNome } from "../../comum/formato";
  import Cabecalho from "../../comum/Cabecalho.svelte";
  import Botao from "../../comum/Botao.svelte";
  import Escolha from "../../comum/Escolha.svelte";
  import Campo from "../../comum/Campo.svelte";
  import Avatar from "../../comum/Avatar.svelte";
  import Aviso from "../../comum/Aviso.svelte";
  import Icone from "../../comum/Icone.svelte";
  import Estado from "../../comum/Estado.svelte";
  import { ir, voltar, departamentos, congregacoesDestino, lerContadores, falhasCatalogo } from "../estado.svelte";
  import { situacaoDe } from "../rotulos";
  import type { Congregacao, Departamento, PaginaPessoas, PessoaLista } from "../tipos";

  interface Props { membroId: number | null; celular: boolean }
  let { membroId, celular }: Props = $props();

  const sessao = ponte().sessao();
  let pessoa = $state<PessoaLista | null>(null);
  let destinos = $state<readonly Congregacao[]>([]);
  let deps = $state<readonly Departamento[]>([]);
  let destinoId = $state<number | null>(null);
  let motivo = $state("");
  let erro = $state("");
  let enviando = $state(false);
  let busca = $state("");
  let achados = $state<PessoaLista[]>([]);
  let espera: ReturnType<typeof setTimeout> | null = null;

  void congregacoesDestino().then((c) => (destinos = c));
  void departamentos().then((d) => (deps = d));
  async function lerPessoa(id: number) {
    const r = await pedir<PaginaPessoas>("/pessoas" + qs({ pagina: 1, porPagina: 1, matricula: id }));
    if (!r.ok) { erro = r.mensagem; return; }
    pessoa = r.dados.itens[0] ?? null;
    if (!pessoa) erro = "Matrícula não encontrada no seu escopo. Procure a pessoa pelo nome.";
  }
  $effect(() => { if (membroId) void lerPessoa(membroId); });
  let buscaSeq = 0;
  let erroBusca = $state("");
  function procurar(v: string) {
    busca = v;
    const meu = ++buscaSeq;   // qualquer digitação invalida a busca que ainda está no ar
    if (espera) clearTimeout(espera);
    espera = setTimeout(async () => {
      if (v.trim().length < 2) { achados = []; erroBusca = ""; return; }
      const r = await pedir<PaginaPessoas>("/pessoas" + qs({ pagina: 1, porPagina: 8, busca: v.trim(), rol: 1 }));
      if (meu !== buscaSeq) return;   // chegou a resposta de uma busca velha
      if (r.ok) { achados = [...r.dados.itens]; erroBusca = ""; } else { achados = []; erroBusca = r.mensagem; }
    }, 250);
  }
  const origem = $derived(pessoa ? destinos.find((c) => c.congregacaoId === pessoa!.congregacaoId) ?? null : null);
  const areaOrigem = $derived(origem?.areaNome ?? pessoa?.areaNome ?? null);
  const destino = $derived(destinos.find((c) => c.congregacaoId === destinoId) ?? null);
  // quem aceita: a mesma regra do servidor (shared/transferencias.js), só para avisar antes; o servidor decide de novo
  const regra = $derived.by(() => {
    if (!destino || !pessoa) return null;
    if (sessao.geral) return "geral" as const;
    if (areaOrigem && destino.areaNome && areaOrigem === destino.areaNome) return "mesma" as const;
    return "entre" as const;
  });
  const nomeDep = $derived(pessoa?.departamentoId != null ? deps.find((d) => d.departamentoId === pessoa!.departamentoId)?.nome ?? "" : "");
  async function enviar() {
    if (enviando) return;   // o Enter no campo do motivo também envia: nunca duas vezes
    if (!pessoa || !destinoId) { erro = "Escolha para onde a pessoa vai."; return; }
    enviando = true; erro = "";
    const r = await pedir<{ mensagem?: string; transferenciaId?: number; situacao?: string }>("/transferencias", { metodo: "POST", corpo: { membroId: pessoa.membroId, congregacaoDestinoId: destinoId, motivo: motivo.trim() || null } });
    enviando = false;
    if (!r.ok) { erro = r.mensagem; return; }
    ponte().avisar(r.dados.mensagem ?? "Pedido enviado.", "sucesso");
    void lerContadores();
    const id = r.dados.transferenciaId;
    if (id) ir({ tela: "transferencia", id }); else ir({ tela: "transferencias", aba: "saindo" }, true);
  }
</script>

<div class="pedir" class:celular>
  {#if !celular}<Cabecalho titulo="Transferência de congregação" sub="A tela já diz, antes de enviar, se entra na hora ou quem precisa aceitar" />{/if}
  <div class="lado-a-lado">
    <form class="form" onsubmit={(e) => { e.preventDefault(); void enviar(); }}>
      {#if pessoa}
        {@const s = situacaoDe(pessoa)}
        <div class="pessoa">
          <Avatar nome={pessoa.nome} foto={pessoa.fotoUrl} tam={40} />
          <span><strong>{pessoa.nome}</strong><small class="sv-num">{pessoa.membroId}{nomeDep ? ` · ${nomeDep}` : ""} · {pessoa.funcao || s.rotulo}</small></span>
          <Botao tipo="texto" onclick={() => { pessoa = null; destinoId = null; }}>Trocar</Botao>
        </div>
        <div class="rota">
          <div class="grupo"><span class="rot">Sai de</span><Escolha rotulo={`${pessoa.congregacao ?? "sem congregação"}${areaOrigem ? ` · ${areaOrigem}` : ""}`} estilo="trava" larga valor={null} opcoes={[]} onescolher={() => {}} /></div>
          <span class="seta" aria-hidden="true"><Icone nome="seta" tam={20} traco={2.4} /></span>
          <div class="grupo"><span class="rot">Vai para <span class="obr">*</span></span>
            <Escolha rotulo="Escolha a congregação" estilo="campo" larga valor={destinoId}
              opcoes={destinos.filter((c) => c.congregacaoId !== pessoa!.congregacaoId).map((c) => ({ valor: c.congregacaoId, rotulo: c.areaNome ? `${c.nome} · ${c.areaNome}` : c.nome }))} onescolher={(v) => (destinoId = v)} />
          </div>
        </div>
        {#if falhasCatalogo.destinos}<Estado tipo="erro" texto="Não deu para ler as congregações de destino: {falhasCatalogo.destinos}" ontentar={() => void congregacoesDestino().then((c) => (destinos = c))} />{/if}
        {#if regra === "entre" && destino}
          <Aviso tom="alerta"><strong>Áreas diferentes:</strong> o pedido vai para a secretaria de <strong>{destino.nome}</strong>, que aceita ou recusa. Até lá, {pessoa.sexo === "F" ? "a" : "o"} {primeiroNome(pessoa.nome)} continua em {pessoa.congregacao}.</Aviso>
        {:else if regra === "mesma" && destino}
          <Aviso tom="ok"><strong>Mesma área:</strong> a transferência entra na hora, sem precisar de aceite.</Aviso>
        {:else if regra === "geral" && destino}
          <Aviso tom="ok"><strong>Pela Secretaria Geral:</strong> a transferência entra na hora.</Aviso>
        {/if}
        <Campo rotulo="Motivo" opcional valor={motivo} oninput={(v) => (motivo = v)} placeholder="Ex.: mudou de bairro" />
        {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
        <div class="botoes">
          <Botao tipo="linha" onclick={() => voltar({ tela: "transferencias", aba: "chegando" })}>Cancelar</Botao>
          <Botao tipo="ouro" ocupado={enviando} desligado={!destinoId} onclick={() => void enviar()}>{regra === "entre" && destino ? `Enviar o pedido para ${destino.nome}` : "Transferir"}</Botao>
        </div>
      {:else if membroId && !erro}
        <Estado tipo="carregando" linhas={4} />
      {:else}
        <Campo rotulo="Quem vai ser transferido?" valor={busca} oninput={procurar} placeholder="Nome ou matrícula" />
        {#if achados.length}
          <ul class="achados">
            {#each achados as p (p.membroId)}
              <li><button type="button" onclick={() => { pessoa = p; achados = []; busca = ""; }}><Avatar nome={p.nome} tam={32} /><span><strong>{p.nome}</strong><small class="sv-num">{p.membroId} · {p.congregacao ?? ""}</small></span></button></li>
            {/each}
          </ul>
        {/if}
        {#if erroBusca}<p class="erro" role="alert">{erroBusca}</p>{/if}
        {#if erro}<p class="erro" role="alert">{erro}</p>{/if}
      {/if}
    </form>
    <aside class="quem-aceita">
      <Aviso tom="info"><strong>Quem aceita:</strong> pedido pela Secretaria Geral → na hora · mesma área → na hora · áreas diferentes → a secretaria de destino (ou a Geral) aceita ou recusa. A pessoa não precisa aceitar.</Aviso>
    </aside>
  </div>
</div>

<style>
  .pedir { display: flex; flex-direction: column; gap: 16px; }
  .lado-a-lado { display: flex; gap: 18px; align-items: flex-start; }
  .form { flex: 1; min-width: 0; max-width: 618px; background: var(--sv-sup); border: 1px solid var(--sv-borda); border-radius: var(--sv-raio); padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .quem-aceita { width: 300px; flex: none; }
  .pessoa { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--sv-borda); border-radius: 12px; background: var(--sv-campo); }
  .pessoa > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pessoa strong { font-size: 15.5px; color: var(--sv-titulo); }
  .pessoa small { font-size: 13px; color: var(--sv-suave); }
  .rota { display: grid; grid-template-columns: 1fr 28px 1fr; gap: 10px; align-items: end; }
  .seta { display: flex; align-items: center; justify-content: center; height: 46px; color: var(--sv-titulo); }
  .grupo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .rot { font-size: 14px; font-weight: 700; color: var(--sv-titulo); }
  .obr { color: var(--sv-atr); }
  .botoes { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .erro { color: var(--sv-atr); font-weight: 600; font-size: 14px; }
  .achados { list-style: none; margin: 0; padding: 0; border: 1px solid var(--sv-borda); border-radius: 12px; }
  .achados li + li { border-top: 1px solid var(--sv-linha); }
  .achados button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 0; background: transparent; text-align: left; cursor: pointer; }
  .achados span { display: flex; flex-direction: column; }
  .achados strong { color: var(--sv-titulo); font-size: 14.5px; }
  .achados small { color: var(--sv-suave); font-size: 12.5px; }
  .celular .lado-a-lado { flex-direction: column; }
  .celular .quem-aceita { width: 100%; }
  .celular .form { padding: 16px; }
  .celular .rota { grid-template-columns: 1fr; }
  .celular .seta { display: none; }
</style>
