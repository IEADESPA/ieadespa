/* ---------------- 4. O TERMO: A ASSINATURA REFORÇADA (só o acréscimo da 34) ---------------- */
// Decidido pela sessão (25/11), pela dúvida dele sobre a validade jurídica: no ato de assinar, o PIN ou a senha MAIS o
// código por e-mail; o resumo criptográfico do texto guardado com a assinatura; o QR e o código de conferência no PDF; a
// cópia do termo no e-mail da pessoa; a trilha com o dia, a hora e o aparelho; e uma frase no próprio termo, em que a
// pessoa declara que aceita assinar pelo sistema. Confirmar com o advogado da igreja antes da produção. Só o passo de
// assinar e a linha do PDF: o resto do termo é o aprovado na 34. O exemplo continua a Débora, em 05/01/2027.
const R35_FRASE = 'Declaro que aceito assinar este termo pelo sistema da IEADESPA, com o meu PIN e o código enviado ao meu e-mail, e que essa assinatura eletrônica vale como a minha.';
const R35_EMAIL = 'deb•••@email.com';
const R35_CONF = 'D4M-8K2-7QX';
// as caixinhas do código de 6 números (n preenchidos)
const r35Cod = (p, n, cel) => `<div style="display:flex;gap:${cel ? 6 : 8}px;justify-content:center">${'418273'.split('').map((c, i) => `<span style="width:${cel ? 40 : 42}px;height:${cel ? 46 : 48}px;border-radius:10px;box-sizing:border-box;flex:none;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:${p.titulo};${i < n ? `border:1.5px solid ${p.campoBorda};background:${p.campo};` : i === n ? `border:2px solid #FFB800;background:${p.campo};` : `border:1.5px solid ${p.campoBorda};background:${p.fundo};`}">${i < n ? c : ''}</span>`).join('')}</div>`;
// a frase de aceite, marcada
const r35Frase = (p, cel) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:${cel ? '8px 10px' : '10px 12px'};border-radius:12px;border:2px solid #FFB800;background:#FFF8E1;font-size:${cel ? 12.5 : 13}px;line-height:1.45;color:#3B2F0B">${r33Caixa(p, 1)}<span>${R35_FRASE}</span></div>`;
// os dois passos: o PIN e o código
const r35Passo = (p, n, tit, sub, ok, corpo) => `<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:8px">${ok ? r27Check(p, 22) : `<span style="width:22px;height:22px;border-radius:11px;flex:none;background:#FFB800;color:#0A2342;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${n}</span>`}<strong style="font-size:13.5px;color:${p.titulo}">${tit}</strong><span style="font-size:12px;color:${p.suave}">${sub}</span></div>${corpo}</div>`;
function r35AsPessoa(p, cel) {
  const pin = r35Passo(p, 1, 'O seu PIN', 'conferido', 1, r33Pin(p, 4));
  const cod = r35Passo(p, 2, 'O código do e-mail', `enviado para ${R35_EMAIL}`, 0, `${r35Cod(p, 4, cel)}<div style="display:flex;justify-content:space-between;font-size:12px;color:${p.suave}"><span>vale por 10 minutos</span>${r28Mais(p, 'Reenviar em 0:42')}</div>`);
  const bt = r21Ouro(p, 'Assinar as 3 partes', 'chave', cel ? 44 : 42);
  if (cel) return r28MvCel(p, 'Termo de posse', `${r34Passos(p, 2, 1)}<strong style="font-size:14px;color:${p.titulo}">Assinar as 3 partes</strong>${r35Frase(p, 1)}${pin}${cod}${bt}`);
  const esq = r32Car(p, '3 de 3 · Termo de acesso ao sistema', '', `<div style="font-size:13px;line-height:1.5;color:${p.texto}">${r34Acesso(R34_DEB)}</div><div style="font-size:12.5px;font-weight:700;color:${p.titulo};padding-top:4px">E a frase que fica no termo</div>${r35Frase(p)}${r20Nota(p, 'Sem marcar a frase, o botão de assinar não aparece.')}`);
  const dir = r32Car(p, 'Assinar as 3 partes', r18Etiq(p, 'dois passos', 'ouro'), `<div style="display:flex;flex-direction:column;gap:14px;padding-top:4px">${pin}${cod}${bt}${r20Nota(p, 'O sistema guarda com a assinatura o dia, a hora, o aparelho e o resumo do texto. A cópia do termo vai para o seu e-mail.')}</div>`);
  const tit = r18Tit(p, 'O seu termo de 2027: assinar', `o PIN e o código que chegou no seu e-mail · 05/01/2027, 18h19`);
  return r28Mv(p, R34_USU.debora, ['Termo de posse'], `${tit}${r34Passos(p, 2)}${r17Dois(esq, dir, '1.25fr 1fr')}`);
}
// assinado: a confirmação e a cópia no e-mail
function r35AsFeito(p, cel) {
  const caixa = r31Caixa(p, 1, 'Assinado', cel ? 'em 05/01/2027, às 18h20. O seu acesso já vale.' : 'em 05/01/2027, às 18h20, com o PIN e o código do e-mail. O seu acesso de 1ª secretária já vale.');
  const email = `<div style="border:1px solid ${p.borda};border-radius:12px;background:#FFFFFF;overflow:hidden;flex:none"><div style="padding:8px 12px;background:${p.fundo};border-bottom:1px solid ${p.borda};font-size:12px;line-height:1.5;color:#3B4A63"><strong style="color:#0A2342">De:</strong> IEADESPA &lt;nao-responda@ieadespa.org.br&gt;<br><strong style="color:#0A2342">Para:</strong> ${R35_EMAIL}<br><strong style="color:#0A2342">Assunto:</strong> A cópia do seu termo de posse de 2027</div><div style="padding:10px 12px;font-size:12.5px;line-height:1.5;color:#3B4A63">Débora, a cópia do termo que você assinou hoje, às 18h20, está anexada. Para conferir se é verdadeiro, abra conferir.ieadespa.org.br e digite <strong style="color:#0A2342">${R35_CONF}</strong>.<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 10px;border:1px solid #D5DBE5;border-radius:8px;width:max-content">${ic('doc', '#B91C1C', 16, 2)}<span style="font-size:12px;color:#0A2342">termo-2027-debora-lima.pdf</span></div></div></div>`;
  const fatos = r31Fatos(p, [['Código', `${R35_CONF} (está no PDF e no QR)`], ['Aparelho', 'celular Android, pelo aplicativo'], ['Depois', 'assinam o Presidente e o Secretário Geral']], cel);
  if (cel) return r28MvCel(p, 'Termo de posse', `${caixa}${r32Car(p, 'O que ficou guardado', '', fatos, 1)}${email}`);
  const tit = r18Tit(p, 'O seu termo de 2027 está assinado', `a cópia foi para o seu e-mail · 05/01/2027, 18h20`);
  return r28Mv(p, R34_USU.debora, ['Termo de posse'], `${tit}${caixa}${r17Dois(r18Col(r32Car(p, 'O que ficou guardado com a sua assinatura', '', fatos), m8Linha(p, 'Baixar o PDF', 'doc')), r18Col(`<strong style="font-size:13.5px;color:${p.titulo}">A cópia que chegou no seu e-mail</strong>`, email), '1fr 1.1fr')}`);
}
// no balcão: a Sueli digita o PIN; o código vai para o e-mail dela; sem e-mail, a secretaria confere o documento
function r35AsBalcao(p, cel) {
  const pin = r35Passo(p, 1, 'O PIN da Sueli', 'só ela digita', 1, r33Pin(p, 4));
  const cod = r35Passo(p, 2, 'O código', 'no e-mail dela ou o documento', 0, `${r33Esc(p, ['Código no e-mail dela', 'Ela não tem e-mail'], 'Ela não tem e-mail')}<div style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.4;color:${p.texto}">${r33Caixa(p, 1)}<span><strong style="color:${p.titulo}">Conferi o documento com foto da Sueli.</strong> O número do documento não se guarda; fica “documento conferido por Débora Lima”.</span></div>`);
  const bt = r21Ouro(p, 'Assinar as 3 partes', 'chave', cel ? 44 : 42);
  if (cel) return r32EsCel(p, 'Aceite no balcão', `${r28Pes(p, r32Av(p, 'SR', 30), 'Sueli Rocha', '2ª tesoureira · não tem celular', '', { alt: 44 })}${r35Frase(p, 1)}${pin}${cod}${bt}`);
  const esq = r32Car(p, 'Quem assina', '', `${r28Pes(p, r32Av(p, 'SR', 30), 'Sueli Rocha', '2ª tesoureira de Vila Nova · não usa celular', '', { alt: 46 })}<div style="font-size:12.5px;font-weight:700;color:${p.titulo};padding-top:4px">A frase, lida com ela</div>${r35Frase(p)}${r20Nota(p, 'Fica no termo: “assinado no balcão da secretaria de Vila Nova, atendida por Débora Lima”, com a data e a hora.')}`);
  const tit = r18Tit(p, 'Aceite no balcão: assinar', `o PIN dela e o código no e-mail; sem e-mail, o documento com foto · 07/01/2027`, m8Linha(p, 'Cancelar', 'voltar'));
  return r35Es(p, 'local', 'Termos de posse', `${tit}${r17Dois(esq, r32Car(p, 'Assinar as 3 partes', '', `<div style="display:flex;flex-direction:column;gap:14px;padding-top:4px">${pin}${cod}${bt}</div>`), '1.1fr 1fr')}`, ['Vila Nova', 'Termos de posse', 'Aceite no balcão'], R27_SEC.local);
}
// o Presidente assina os 14 marcados: o PIN e um código só para o lote
function r35AsPres(p, cel) {
  const pin = r35Passo(p, 1, 'O seu PIN', 'conferido', 1, r33Pin(p, 4));
  const cod = r35Passo(p, 2, 'O código do e-mail', 'um só para os 14', 0, `${r35Cod(p, 2, cel)}${r20Nota(p, 'Enviado para o e-mail do Presidente às 7h41 · vale por 10 minutos.')}`);
  const frase = `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;border:2px solid #FFB800;background:#FFF8E1;font-size:13px;line-height:1.45;color:#3B2F0B">${r33Caixa(p, 1)}<span>Assino os 14 termos marcados pelo sistema da IEADESPA, como Presidente, com o meu PIN e o código do meu e-mail.</span></div>`;
  const bt = r21Ouro(p, 'Assinar os 14 termos', 'chave', cel ? 44 : 42);
  if (cel) return r32EsCel(p, 'Assinar 14 termos', `${r16aAviso(p, '<strong>14 termos da Área 2</strong>, todos já aceitos pela pessoa.')}${frase}${pin}${cod}${bt}`);
  const lista = r32Car(p, 'Os 14 marcados · Área 2', r18Etiq(p, 'prontos', 'verde'), R34_LOTE.slice(0, 6).map((x, i) => r28Pes(p, r34Caixa(p, 1), `${x[0]} · ${x[1]}`, `${x[2]} · aceitou em ${x[3]}`, '', { i, alt: 42 })).join('') + r20Nota(p, 'e mais 8.'));
  const tit = r18Tit(p, 'Assinar os 14 termos marcados', `o Presidente · o PIN e um código só, para o lote · 08/01/2027, 7h41`, m8Linha(p, 'Voltar à lista', 'voltar'));
  return r35Es(p, 'pres', 'Termos para assinar', `${tit}${r17Dois(lista, r32Car(p, 'Assinar', '', `<div style="display:flex;flex-direction:column;gap:12px;padding-top:4px">${frase}${pin}${cod}${bt}</div>`), '1fr 1.05fr')}`, ['Termos para assinar', 'Assinar'], R34_USU.pres);
}
// a linha do PDF: a folha 2 com o “como” de cada assinatura, o código de conferência e o resumo do texto
const R35_ASS = [['Tomou posse', 'Débora Lima', '05/01/2027, 18h20', 'PIN + código no e-mail · celular'], ['Deu a posse', 'Pr. Abel Nogueira', '05/01/2027, 9h12', 'PIN + código no e-mail · notebook'], ['Presidente', 'Pr. Samuel Araújo', '08/01/2027, 7h42', 'PIN + código no e-mail · notebook'], ['Secretário Geral', 'Pr. Jonas Ferraz', '09/01/2027, 10h05', 'PIN + código no e-mail · celular']];
const r35Linha = (fs) => `<div style="border:1.5px solid #0A2342;border-radius:6px;padding:6px 9px;font-size:${fs}px;line-height:1.45;color:#0A2342;background:#F7F9FC"><strong>Assinado eletronicamente pelo sistema da IEADESPA</strong> (MP nº 2.200-2/2001, art. 10, § 2º, e Lei nº 14.063/2020), com o PIN e o código enviado ao e-mail de cada um. Código de conferência: <strong style="letter-spacing:.04em">${R35_CONF}</strong>. Resumo do texto assinado: <strong style="font-family:Consolas,monospace">3F9A 71C0 … 8B2E C21E</strong>.</div>`;
function r35Papel2(W) {
  const conf = x => `<div style="display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;padding:3px 0;border-top:1px solid #E6EAF0"><span style="color:#5B6678">${x[0]}</span><span><strong>${x[1]}</strong> · ${x[2]}<span style="display:block;color:#5B6678;font-size:7.6px">${x[3]}</span></span></div>`;
  return r34Folha(W, 2, `${r33Sec('PARTE 3 DE 3 · ACESSO AO SISTEMA')}<p style="margin:0;text-align:justify">${r34Acesso(R34_DEB)}</p><p style="margin:0;text-align:justify"><strong>${R35_FRASE}</strong></p><div style="border:1px solid #D5DBE5;border-radius:6px;padding:5px 9px;margin-top:2px"><div style="font-size:8.6px;font-weight:800;letter-spacing:.05em;padding-bottom:2px">AS QUATRO ASSINATURAS</div>${R35_ASS.map(conf).join('')}</div><div style="flex:1"></div>${r35Linha(7.8)}${r18PpQr(46, R35_CONF, 'Confira se este termo é verdadeiro: aponte a câmera do celular para o código.')}`);
}
function r35AsPdf(p, cel) {
  if (cel) return r32EsCel(p, 'Termo de posse', `<div style="display:flex;align-items:center;gap:8px;flex:none"><span style="flex:1;min-width:0;font-size:13px;font-weight:700;color:${p.titulo};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">termo-2027-debora-lima.pdf · folha 2</span>${r28Mais(p, 'Baixar')}</div><div style="width:358px;height:506px;flex:none;align-self:center;overflow:hidden;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18)"><div style="zoom:0.8326;width:430px">${r35Papel2(430)}</div></div>${r20Nota(p, 'Embaixo: a linha da assinatura eletrônica, o código e o QR.')}`);
  const novo = r32Car(p, 'O que a folha 2 ganhou', r18Etiq(p, 'novo', 'ouro'), r28Vai(p, [['doc', '<strong>A frase do aceite</strong>, assinada junto com o termo.'], ['chave', '<strong>Como cada um assinou:</strong> o PIN e o código no e-mail, o dia, a hora e o aparelho.'], ['escudo', '<strong>A linha da assinatura eletrônica</strong>, com a lei, o código de conferência e o resumo do texto: se uma letra mudar, o resumo não confere.']]));
  const zoom = `<div style="display:flex;flex-direction:column;gap:6px"><strong style="font-size:13px;color:${p.titulo}">A linha, aumentada</strong>${r35Linha(12)}</div>`;
  const tit = r18Tit(p, 'O termo da Débora em PDF: a folha 2', `com a assinatura reforçada · a folha 1 não muda · 09/01/2027`, `${m8Linha(p, 'Baixar', 'doc')}${m8Linha(p, 'Imprimir', 'imprimir')}`);
  return r35Es(p, 'local', 'Termos de posse', `${tit}<div style="display:flex;gap:18px;align-items:flex-start">${r35Papel2(432)}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px">${novo}${zoom}</div></div>`, ['Vila Nova', 'Termos de posse']);
}
const r35Assinar = (p, k, d) => { const cel = ehCel(d); return k === 'feito' ? r35AsFeito(p, cel) : k === 'balcao' ? r35AsBalcao(p, cel) : k === 'pres' ? r35AsPres(p, cel) : k === 'pdf' ? r35AsPdf(p, cel) : r35AsPessoa(p, cel); };
const PERFIS35_ASSINAR = [['pessoa', 'A Débora · assina com o PIN e o código'], ['feito', 'A Débora · assinado, a cópia no e-mail'], ['balcao', 'Secretaria de Vila Nova · no balcão'], ['pres', 'O Presidente · assina em lote'], ['pdf', 'Dirigente de Vila Nova · a linha do PDF']];
