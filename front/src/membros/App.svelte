<!-- O módulo Membros: a tela de agora, o caminho no topo e, no celular, a fileira de pílulas (Painel, Pessoas, Fila, Transferências). -->
<script lang="ts">
  import { ponte, type ParteTrilha } from "../comum/ponte";
  import { tela } from "../comum/tela.svelte";
  import Pilulas from "../comum/Pilulas.svelte";
  import EmConstrucao from "../comum/EmConstrucao.svelte";
  import Cabecalho from "../comum/Cabecalho.svelte";
  import { nav, ir, voltar, contadores, escopo, textoEscopo, lerContadores, type Rota } from "./estado.svelte";
  import Painel from "./telas/Painel.svelte";
  import Pessoas from "./telas/Pessoas.svelte";
  import Ficha from "./telas/Ficha.svelte";
  import Cadastrar from "./telas/Cadastrar.svelte";
  import Fila from "./telas/Fila.svelte";
  import CadastroRapido from "./telas/CadastroRapido.svelte";
  import Transferencias from "./telas/Transferencias.svelte";
  import Transferir from "./telas/Transferir.svelte";
  import Transferencia from "./telas/Transferencia.svelte";
  import Sugestoes from "./telas/Sugestoes.svelte";
  import Repetidas from "./telas/Repetidas.svelte";
  import Juntar from "./telas/Juntar.svelte";

  let nomeDaTela = $state("");
  void lerContadores();

  type Pilula = "painel" | "pessoas" | "fila" | "transferencias";
  const pilulaDe = (r: Rota): Pilula | null => (r.tela === "painel" || r.tela === "pessoas" || r.tela === "fila" || r.tela === "transferencias" ? r.tela : null);
  const pilula = $derived(pilulaDe(nav.rota));

  // o caminho do topo, o título do celular e o ← de cada tela; o menu recolhido (o trilho) nas telas em que o desenho o mostra
  $effect(() => {
    const r = nav.rota;
    const p = ponte();
    const m = (rotulo: string, rota: Rota): ParteTrilha => ({ rotulo, ir: () => ir(rota, true) });
    const raiz = m("Membros", { tela: "painel" });
    let partes: ParteTrilha[] = [raiz];
    let titulo = "Membros";
    switch (r.tela) {
      case "painel": partes.push({ rotulo: "Painel executivo" }); break;
      case "pessoas": partes.push({ rotulo: "Pessoas" }); titulo = "Pessoas"; break;
      case "ficha": partes.push(m("Pessoas", { tela: "pessoas" }), { rotulo: nomeDaTela || "Ficha" }); titulo = "Ficha da pessoa"; break;
      case "cadastrar": partes.push({ rotulo: "Cadastrar" }); titulo = "Cadastrar pessoa"; break;
      case "fila": partes.push({ rotulo: "Fila de cadastros" }); titulo = "Fila de cadastros"; break;
      case "rapido": partes.push(m("Fila de cadastros", { tela: "fila" }), { rotulo: "Cadastro rápido" }); titulo = "Cadastro rápido"; break;
      case "transferencias": partes.push({ rotulo: "Transferências" }); titulo = "Transferências"; break;
      case "transferir": partes.push(m("Transferências", { tela: "transferencias", aba: "chegando" }), { rotulo: "Novo pedido" }); titulo = "Transferência"; break;
      case "transferencia": partes.push(m("Transferências", { tela: "transferencias", aba: "chegando" }), { rotulo: nomeDaTela || "Pedido" }); titulo = "Pedido de transferência"; break;
      case "desligamentos": partes.push({ rotulo: "Desligamentos" }); titulo = "Desligamentos"; break;
      case "repetidas": partes.push({ rotulo: "Fichas repetidas" }); titulo = "Fichas repetidas"; break;
      case "juntar": partes.push(m("Fichas repetidas", { tela: "repetidas" }), { rotulo: nomeDaTela || "Juntar" }); titulo = "Juntar fichas"; break;
      case "sugestoes": partes.push({ rotulo: "Sugestões de alteração" }); titulo = "Sugestões"; break;
      case "carteirinhas": partes.push({ rotulo: "Carteirinhas" }); titulo = "Carteirinhas"; break;
    }
    const interna = pilulaDe(r) === null;
    p.trilha(partes, titulo, interna ? () => voltar({ tela: "painel" }) : null);
    // o desenho aprovado mostra o menu recolhido (o trilho de ícones) no painel, na ficha, na esteira e na caixa de sugestões
    p.menuRecolhido(["painel", "ficha", "fila", "sugestoes"].includes(r.tela) ? true : null);
  });
  $effect(() => { const t = textoEscopo(escopo.resumo); if (t) ponte().escopoDoModulo(t); });
  // a mesma tela com outra parte (a ficha trocando de seção, a caixa trocando de aba) não é montada de novo
  const chaveTela = $derived(nav.rota.tela === "ficha" ? `ficha-${nav.rota.id}` : nav.rota.tela === "transferencias" ? "transferencias" : JSON.stringify(nav.rota));
  // a tela de dentro avisa o nome da pessoa (para o caminho do topo)
  $effect(() => { void chaveTela; nomeDaTela = ""; });
</script>

<div class="sv membros" class:celular={tela.celular}>
  {#if tela.celular && pilula}
    <div class="pilulas-topo">
      <Pilulas rotulo="Telas de Membros" ativa={pilula} onescolher={(k) => ir(k === "transferencias" ? { tela: k, aba: "chegando" } : { tela: k }, true)}
        itens={[{ chave: "painel", rotulo: "Painel" }, { chave: "pessoas", rotulo: "Pessoas" }, { chave: "fila", rotulo: "Fila", n: contadores.fila }, { chave: "transferencias", rotulo: "Transferências" }]} />
    </div>
  {/if}
  <div class="tela">
    {#key chaveTela}
      {#if nav.rota.tela === "painel"}<Painel celular={tela.celular} />
      {:else if nav.rota.tela === "pessoas"}<Pessoas celular={tela.celular} />
      {:else if nav.rota.tela === "ficha"}<Ficha id={nav.rota.id} secao={nav.rota.secao} celular={tela.celular} onnome={(n: string) => (nomeDaTela = n)} />
      {:else if nav.rota.tela === "cadastrar"}<Cadastrar celular={tela.celular} />
      {:else if nav.rota.tela === "fila"}<Fila celular={tela.celular} />
      {:else if nav.rota.tela === "rapido"}<CadastroRapido celular={tela.celular} />
      {:else if nav.rota.tela === "transferencias"}<Transferencias aba={nav.rota.aba} celular={tela.celular} />
      {:else if nav.rota.tela === "transferir"}<Transferir membroId={nav.rota.membroId} celular={tela.celular} />
      {:else if nav.rota.tela === "transferencia"}<Transferencia id={nav.rota.id} celular={tela.celular} onnome={(n: string) => (nomeDaTela = n)} />
      {:else if nav.rota.tela === "sugestoes"}<Sugestoes celular={tela.celular} />
      {:else if nav.rota.tela === "repetidas"}<Repetidas celular={tela.celular} />
      {:else if nav.rota.tela === "juntar"}<Juntar a={nav.rota.a} b={nav.rota.b} celular={tela.celular} onnome={(n: string) => (nomeDaTela = n)} />
      {:else if nav.rota.tela === "desligamentos"}
        <div class="pilha">
          {#if !tela.celular}<Cabecalho titulo="Desligamentos" sub="Quem sai do rol: a pedido, por falecimento ou pelo processo da Igreja" />{/if}
          <EmConstrucao titulo="Desligamentos" texto="Esta tela ainda vai ser desenhada e aprovada. Até lá, a saída do rol continua pelo caminho de hoje, com a secretaria." />
        </div>
      {:else if nav.rota.tela === "carteirinhas"}
        <div class="pilha">
          {#if !tela.celular}<Cabecalho titulo="Carteirinhas" sub="A física (papel ou PVC) e a digital, com o QR que nunca muda" />{/if}
          <EmConstrucao titulo="Carteirinhas" texto="O desenho já foi aprovado (rodada 11): o início das carteirinhas, o editor do modelo, a digital e a página que o QR abre. A construção vem no passo 8." />
        </div>
      {/if}
    {/key}
  </div>
</div>

<style>
  .membros { display: flex; flex-direction: column; min-height: 100%; }
  .tela { display: flex; flex-direction: column; gap: 14px; animation: aparece .18s ease-out; }
  .pilha { display: flex; flex-direction: column; gap: 14px; }
  .celular .tela { padding: 16px; }
  .pilulas-topo { position: sticky; top: 0; z-index: 5; }
  @keyframes aparece { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
</style>
