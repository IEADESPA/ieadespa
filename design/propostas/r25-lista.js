const r25T = (id, nome, grupo, decidido, opcoes, extra) => Object.assign({ id, nome, parte: `Financeiro · ${grupo}`, w: 1280, h: 800, disp: true, perfis: PERFIS13, decidido: `${decidido} ${R22_REGRA}`, opcoes }, extra || {});
// A explicação da rodada 25 (fica na página, FORA do desenho das telas).
const EXPLICA_R25 = `<p><strong>A rodada 25 acerta a folha do mural e refaz o 3º relatório como vocês explicaram na 24.</strong> O lançar da 24 está aprovado e não mudou.</p>
<ol>
<li><strong>A folha do mural:</strong> as linhas com nome que vieram do mês anterior ficam iguais às outras, sem “marcada em outubro/novembro” e sem fundo roxo. As tarjas “referente ao mês posterior” e “referente ao mês anterior” continuam.</li>
<li><strong>As contas do relatório:</strong> o líquido se divide em 60% para a Geral e 40% para o centro de custo da congregação. O retido e as despesas da congregação saíram do relatório: são lançados no centro de custo dela. Só o que se desconta antes do líquido, como o aluguel, continua no relatório.</li>
<li><strong>Quanto cada congregação tem (o 3º relatório):</strong> contínuo, sem mês e sem separar dízimo, oferta ou departamento. Duas linhas separadas: o que já está na sede (o Pix na conta geral e a espécie entregue) e a espécie que ainda está com a congregação. Todo dinheiro que chega conta, mesmo sem a folha lançada.</li>
<li><strong>Quando um relatório fecha, de qualquer mês,</strong> o líquido sai do saldo e se divide sozinho: 60% para a Geral e 40% para o centro de custo da congregação. O que sobra espera o próximo relatório; o que falta, o próximo dinheiro cobre. Não existe mais “fechar novembro” nem “destino da sobra”.</li>
</ol>`;
const TELAS_R25 = [
  r25T('r25-folha-mural', 'A folha do mural, acertada', 'Relatórios', 'Versão única: a aprovada na 24, com o acerto que vocês pediram. As linhas com nome que vieram do mês anterior (a 70.063 e a 70.064 em novembro, a 70.161 e a 70.162 em dezembro) ficam iguais às outras: sem “marcada em” e sem fundo roxo. As tarjas continuam. O quadro das contas termina nos 40% que vão para o centro de custo da congregação. Troque em “Quem está vendo e o mês”.', [
    ['Versão única', 'As folhas como saem da impressora, em retrato, e ao lado (ou embaixo) o que vai em cada uma. No celular, uma folha por vez.', r25Mural]
  ], { perfis: PERFIS24_MURAL, perfisRot: 'Quem está vendo e o mês', explica: R25_EXPLICA_MURAL }),
  r25T('r25-saldo-congregacoes', 'Quanto cada congregação tem', 'Repasses', 'Versão única, como vocês explicaram na 24: o 3º relatório é só saber, todo dia, quanto cada congregação tem, sem mês. Na sede (Pix na conta geral e espécie entregue) e, separada, a espécie que ainda está com ela. Relatório fechado, de qualquer mês: o líquido sai do saldo, 60% para a Geral e 40% para o centro de custo da congregação. A Geral vê a lista e abre uma congregação; a congregação vê a sua; a área acompanha. Troque em “Quem está vendo”.', [
    ['Versão única', 'A Geral: a lista das congregações à esquerda e Vila Nova aberta à direita, com os dois números e o extrato contínuo. A congregação: a aba “Espécie e digital” do relatório do mês, com o anexar comprovante. A área: a lista. No celular, os dois números e a lista.', r25SaldoTela]
  ], { perfis: PERFIS25_SALDO, perfisRot: 'Quem está vendo', explica: R25_EXPLICA_SALDO })
];
TELAS.unshift(...TELAS_R25.map(t => Object.assign({}, t, { rodada: 25 })));
