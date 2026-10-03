// Testes do painel inicial por perfil (vB.7) — o ponto que mais importa
// aqui é a visibilidade de cada bloco baseado em detector seguir A MESMA
// regra de quem receberia a notificação (NotificacaoRegras), nunca uma
// segunda regra de "quem vê o quê" inventada só pro painel.
const { criarPoolFalso } = require("./testUtils");
const { montarPainelInicial } = require("../painelBlocos");

describe("montarPainelInicial", () => {
  test("usuário com permissão financeiro/GLOBAL vê os 3 blocos de detector, além dos 2 sempre-visíveis", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ total: 3 }], // notificações não lidas
      [], // listarFluxosDoUsuario -> abertas (nenhuma)
      [ // regras
        { Chave: "SEGUROS_VENCENDO", Titulo: "Seguros vencendo", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true },
        { Chave: "PRESTACAO_CONTAS_ATRASADA", Titulo: "Prestação atrasada", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true },
        { Chave: "REPASSE_MALOTE_PARADO", Titulo: "Repasse parado", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true }
      ],
      [], // detector SEGUROS_VENCENDO
      [], // detector PRESTACAO_CONTAS_ATRASADA
      []  // detector REPASSE_MALOTE_PARADO
    ]);
    const usuario = { membroId: 1, permissoes: ["financeiro"], nivel: "GLOBAL" };
    const blocos = await montarPainelInicial(pool, usuario);
    expect(blocos.map(b => b.chave)).toEqual(["notificacoes", "tarefas_atrasadas", "seguros_vencendo", "prestacao_contas_atrasada", "repasse_malote_parado"]);
    expect(blocos[0].valor).toBe(3);
    expect(chamadas).toHaveLength(6);
  });

  test("usuário sem permissão financeiro só vê os 2 blocos sempre-visíveis (nunca os de detector)", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ total: 0 }],
      [],
      [
        { Chave: "SEGUROS_VENCENDO", Titulo: "Seguros vencendo", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true },
        { Chave: "PRESTACAO_CONTAS_ATRASADA", Titulo: "Prestação atrasada", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true },
        { Chave: "REPASSE_MALOTE_PARADO", Titulo: "Repasse parado", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: true }
      ]
    ]);
    const usuario = { membroId: 2, permissoes: ["pessoas"], nivel: "CONGREGACAO" };
    const blocos = await montarPainelInicial(pool, usuario);
    expect(blocos.map(b => b.chave)).toEqual(["notificacoes", "tarefas_atrasadas"]);
    expect(chamadas).toHaveLength(3); // nunca chega a chamar nenhum detector
  });

  test("regra desativada (Ativa=false) some do painel mesmo com permissão certa", async () => {
    const { pool, chamadas } = criarPoolFalso([
      [{ total: 0 }],
      [],
      [{ Chave: "SEGUROS_VENCENDO", Titulo: "Seguros vencendo", PermissaoAlvo: "financeiro", NivelAlvo: "GLOBAL", Ativa: false }]
    ]);
    const usuario = { membroId: 1, permissoes: ["financeiro"], nivel: "GLOBAL" };
    const blocos = await montarPainelInicial(pool, usuario);
    expect(blocos.map(b => b.chave)).toEqual(["notificacoes", "tarefas_atrasadas"]);
    expect(chamadas).toHaveLength(3);
  });
});
