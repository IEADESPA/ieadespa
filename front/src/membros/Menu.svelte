<!-- O menu do módulo Membros na barra da esquerda (rodada 9): 4 grupos — Painéis, Membros, Movimentações e Cuidados com o cadastro. -->
<script lang="ts">
  import MenuModulo from "../comum/MenuModulo.svelte";
  import { nav, ir, itemDoMenu, contadores, cuidaDoCadastro, type ChaveMenu } from "./estado.svelte";
  import { ponte } from "../comum/ponte";

  const cadastro = cuidaDoCadastro();
  const grupos = $derived([
    { nome: "Painéis", icone: "grafico", itens: [{ chave: "painel" as ChaveMenu, rotulo: "Painel executivo", icone: "grafico" }] },
    { nome: "Membros", icone: "pessoas", itens: [
      { chave: "pessoas" as ChaveMenu, rotulo: "Pessoas", icone: "pessoas" },
      { chave: "fila" as ChaveMenu, rotulo: "Fila de cadastros", icone: "doc", n: contadores.fila },
      ...(cadastro ? [{ chave: "cadastrar" as ChaveMenu, rotulo: "Cadastrar", icone: "mais" }] : [])
    ] },
    { nome: "Movimentações", icone: "seta", itens: [
      { chave: "transferencias" as ChaveMenu, rotulo: "Transferências", icone: "seta", n: contadores.transferencias },
      { chave: "desligamentos" as ChaveMenu, rotulo: "Desligamentos", icone: "balanca" }
    ] },
    { nome: "Cuidados com o cadastro", icone: "cartao", itens: [
      { chave: "repetidas" as ChaveMenu, rotulo: "Fichas repetidas", icone: "pessoas", n: contadores.repetidas },
      { chave: "sugestoes" as ChaveMenu, rotulo: "Sugestões de alteração", icone: "lapis", n: contadores.sugestoes },
      { chave: "carteirinhas" as ChaveMenu, rotulo: "Carteirinhas", icone: "cartao" },
      // a importação do sistema pago (r27): só a Secretaria Geral
      ...(ponte().sessao().geral ? [{ chave: "importar" as ChaveMenu, rotulo: "Importar do sistema pago", icone: "bandeja" }] : [])
    ] }
  ]);

  function escolher(k: ChaveMenu) {
    const r = k === "transferencias" ? { tela: k, aba: "chegando" as const } : k === "carteirinhas" ? { tela: k, congregacaoId: null } : { tela: k };
    ir(r as Parameters<typeof ir>[0], true);
    ponte().fecharGavetaCelular();
  }
</script>

<MenuModulo rotulo="Menu de Membros" chaveGuardada="ieadespaMembrosGruposFechados" {grupos} ativo={itemDoMenu(nav.rota)} onescolher={escolher} />
