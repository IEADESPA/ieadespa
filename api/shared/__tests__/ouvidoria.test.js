// Teste do protocolo da Ouvidoria (Art. 104) depois da vB.4 trocar o
// sequencial por `shared/protocolo.js` — o que não pode mudar é o formato
// visível (sufixo aleatório contra enumeração, dado o sigilo do
// denunciante), só a fonte do número deixa de ter corrida.
const { criarPoolFalso } = require("./testUtils");
const { gerarProtocolo } = require("../ouvidoria");

describe("gerarProtocolo (Ouvidoria)", () => {
  test("mantém o formato OUV-ANO-NNNNN-xxxx (5 dígitos + sufixo hex)", async () => {
    const { pool, chamadas } = criarPoolFalso([[{ UltimoNumero: 3 }]]);
    const p = await gerarProtocolo(pool);
    const ano = new Date().getFullYear();
    expect(p).toMatch(new RegExp(`^OUV-${ano}-00003-[0-9a-f]{4}$`));
    expect(chamadas[0].inputs.tipo).toBe("OUV"); // usa o sequenciador central, não um COUNT local
  });
});
