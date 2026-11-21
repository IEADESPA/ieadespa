const r26T = (id, nome, grupo, decidido, opcoes, extra) => Object.assign({ id, nome, parte: `Financeiro · ${grupo}`, w: 1280, h: 800, disp: true, perfis: PERFIS13, decidido: `${decidido} ${R22_REGRA}`, opcoes }, extra || {});
// A explicação da rodada 26 (fica na página, FORA do desenho das telas).
const EXPLICA_R26 = `<p><strong>A rodada 26 tira o quadro do fim da folha do mural e refaz “quanto cada congregação tem” do jeito que vocês confirmaram.</strong></p>
<ol>
<li><strong>A folha do mural:</strong> saiu o quadro do fim que explicava as folhas de outro mês. As tarjas e as linhas da folha arrancada e da cancelada continuam na lista. No relatório do mês saiu também a aba “Espécie e digital”, porque o saldo agora fica em “Contas e bancos”.</li>
<li><strong>Quanto cada congregação tem na Geral:</strong> uma conta só por congregação, como um extrato de banco, sem mês. Entra o Pix na conta geral e a espécie entregue. Não tem nada a ver com o repasse nem com o mural: fica em “Contas e bancos”.</li>
<li><strong>Quando um relatório fecha,</strong> de qualquer mês, sai só a parte da Geral. Todo o resto já é da congregação: não existe saldo esperando o próximo relatório. A despesa dela que a Geral paga sai do mesmo saldo. Se a parte da Geral passar do que ela tem, ela cobre com a espécie.</li>
<li><strong>A Geral vê a conta inteira:</strong> quanto é das congregações, que ela não pode gastar, e quanto é dela de verdade.</li>
</ol>`;
const TELAS_R26 = [
  r26T('r26-folha-mural', 'A folha do mural, sem o quadro do fim', 'Relatórios', 'Versão única: a aprovada na 25, sem o quadro do fim que explicava as folhas de outro mês. A lista não mudou: as tarjas e as linhas da folha arrancada e da cancelada continuam. A aba “Espécie e digital” saiu do relatório do mês. Troque em “Quem está vendo e o mês”.', [
    ['Versão única', 'As folhas como saem da impressora, em retrato, e ao lado (ou embaixo) o que vai em cada uma. No celular, uma folha por vez.', r26Mural]
  ], { perfis: PERFIS24_MURAL, perfisRot: 'Quem está vendo e o mês', explica: R26_EXPLICA_MURAL }),
  r26T('r26-saldo-congregacoes', 'Quanto cada congregação tem na Geral', 'Contas e bancos', 'Versão única, do jeito que vocês confirmaram: um extrato por congregação, sem mês. Entra o Pix e a espécie entregue; relatório fechado tira só a parte da Geral, e o resto já é da congregação; a despesa dela que a Geral paga sai do mesmo saldo. A Geral vê a conta inteira e abre uma congregação; a congregação vê o seu extrato; a área acompanha. Troque em “Quem está vendo”.', [
    ['Versão única', 'A Geral: no alto, a conta geral, quanto é das congregações e quanto é dela; embaixo, a lista à esquerda e Vila Nova aberta à direita, com o extrato. A congregação: o seu extrato, o anexar comprovante e a despesa para a Geral pagar. A área: a lista. No celular, os números e a lista (ou o extrato).', r26SaldoTela]
  ], { perfis: PERFIS26_SALDO, perfisRot: 'Quem está vendo', explica: R26_EXPLICA_SALDO })
];
TELAS.unshift(...TELAS_R26.map(t => Object.assign({}, t, { rodada: 26 })));
