/* ---------------- 2. OS CULTOS E OS PONTOS DE CULTO ---------------- */
// A congregação (e a área e a Geral) atualiza os cultos e os pontos de culto, e o site muda sozinho. A cada 6 meses a
// congregação confirma num toque que está tudo certo; passou do prazo, vai para o painel como "para conferir".
const r32Lapis = p => `<span style="width:30px;height:30px;border-radius:8px;flex:none;border:1px solid ${p.borda};display:flex;align-items:center;justify-content:center">${ic('lapis', p.icone, 15, 2)}</span>`;
function r32CultosEdit(p, cel, sel) {
  const linhas = R32_CULTOS_VN.map((x, i) => r28Pes(p, r32Ic(p, 'relogio'), `${x[0]}, ${i === 3 && sel ? '20h' : x[1]}`, x[2], cel ? '' : r32Lapis(p), { i, alt: cel ? 40 : 42, sel: sel && i === 3 })).join('');
  return r32Car(p, 'Cultos', r28Mais(p, '+ Novo culto'), linhas, cel);
}
const r32PontosEdit = (p, cel) => r32Car(p, 'Pontos de culto', r28Mais(p, '+ Novo ponto'), `${R32_PONTOS_VN.map((x, i) => r28Pes(p, r32Ic(p, 'casa'), `${x[0]} · ${x[1]}`, `${x[3]} · ${x[2]}`, cel ? '' : r32Lapis(p), { i, alt: cel ? 42 : 46 })).join('')}${r20Nota(p, cel ? 'O endereço da casa, só a liderança vê.' : 'O responsável e o endereço da casa, só a liderança vê. No site vai só o bairro e o horário.')}`, cel);
// como aparece no site: o mesmo que está aqui, sem a casa do ponto de culto
function r32Site(p) {
  const l = (a, b) => `<div style="display:flex;gap:10px;padding:5px 0;border-top:1px solid #EEF1F5;font-size:12.5px"><strong style="width:118px;flex:none;color:#0A2342">${a}</strong><span style="color:#3B4A63">${b}</span></div>`;
  return `<div style="border:1px solid ${p.borda};border-radius:14px;overflow:hidden;background:#FFFFFF;flex:none"><div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0A2342">${logo(22)}<span style="font-size:12px;color:#C9D4E3">ieadespa.org.br/vila-nova</span></div><div style="padding:10px 14px;display:flex;flex-direction:column;gap:2px"><div style="font-size:17px;font-weight:800;color:#0A2342">Congregação Vila Nova</div><div style="font-size:12px;color:#5B6678;padding-bottom:6px">Rua Sete, 410 · bairro Vila Nova · dirigente: Pr. Abel Nogueira</div><div style="font-size:11px;font-weight:800;letter-spacing:.06em;color:#5B6678;padding:4px 0">CULTOS</div>${R32_CULTOS_VN.map(x => l(`${x[0]}, ${x[1]}`, x[2])).join('')}<div style="font-size:11px;font-weight:800;letter-spacing:.06em;color:#5B6678;padding:8px 0 4px">PONTOS DE CULTO</div>${R32_PONTOS_VN.map(x => l(x[1], `bairro ${x[0]}`)).join('')}</div></div>`;
}
const r32Atrasado = (p, cel) => r16aAviso(p, cel ? '<strong>Passou dos 6 meses</strong> desde a última conferência (14/05). Confira e toque em “Está tudo certo”.' : '<strong>Passou dos 6 meses desde a última conferência, em 14/05/2026.</strong> Confira os cultos e os pontos de culto e toque em “Está tudo certo”: o painel deixa de cobrar.', 'alerta');
function r32CultosLocal(p, cel, editar) {
  const ok = r21Ouro(p, 'Está tudo certo', 'check', cel ? 44 : 40);
  if (cel) {
    if (editar) return r32EsCel(p, 'Editar o culto', `${r17Campo(p, 'Dia', 'Quinta', { icone: 'calendario' })}${r17Campo(p, 'Hora', '20h', { icone: 'relogio' })}${r17Campo(p, 'Nome do culto', 'Culto de ensino')}${r17Campo(p, 'Repete', 'Toda semana')}${r21Ouro(p, 'Salvar', 'check', 44)}${r21Linha(p, 'Tirar este culto', 'fechar')}${r30Toast(p, 'Salvo. O site já mostra quinta, às 20h.', 1)}`).replace('padding:12px 14px;display:flex;flex-direction:column;gap:10px">', 'padding:12px 14px;display:flex;flex-direction:column;gap:10px;position:relative">');
    return r32EsCel(p, 'Cultos e pontos', `${r32Atrasado(p, 1)}${r32CultosEdit(p, 1)}${r32PontosEdit(p, 1)}${ok}`);
  }
  const dir = editar
    ? r32Car(p, 'Editar o culto', r18Etiq(p, 'mudou a hora', 'ouro'), `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:4px">${r17Campo(p, 'Dia', 'Quinta', { icone: 'calendario' })}${r17Campo(p, 'Hora', '20h', { icone: 'relogio', nota: 'era 19h30' })}${r17Campo(p, 'Nome do culto', 'Culto de ensino', { larg: 2 })}${r17Campo(p, 'Repete', 'Toda semana', { larg: 2 })}</div><div style="display:flex;gap:10px;padding-top:8px">${r21Ouro(p, 'Salvar', 'check', 40).replace('display:flex', 'flex:1;display:flex')}${r28Bt(p, 'Tirar este culto', 'fechar')}</div>${r20Nota(p, 'Ao salvar, o site muda sozinho. Fica registrado quem mudou e quando.')}`)
    : `<div style="display:flex;flex-direction:column;gap:6px"><strong style="font-size:14.5px;color:${p.titulo}">Como aparece no site</strong>${r32Site(p)}${r20Nota(p, 'É o que está à esquerda, sem o responsável e sem a casa do ponto de culto. Muda sozinho quando alguém salva.')}</div>`;
  const tit = r18Tit(p, 'Cultos e pontos de culto de Vila Nova', `o que está aqui vai para o site sozinho · a congregação, a área e a Geral atualizam · ${R32_HOJE}`, editar ? '' : ok);
  return r32Es(p, 'local', 'Cultos e pontos', `${tit}${editar ? '' : r32Atrasado(p)}${r17Dois(r18Col(r32CultosEdit(p, 0, editar), r32PontosEdit(p, 0)), dir, '1.15fr 1fr')}${editar ? r30Toast(p, 'Salvo. O site já mostra quinta, às 20h.') : ''}`, ['Vila Nova', 'Cultos e pontos de culto'], R32_USU.sec);
}
// a área: as 12 congregações, quando cada uma conferiu; a área também corrige
const R32_CONF_A2 = { '7': ['14/05/2026', 'há 6 meses', 'ouro'], '12': ['30/04/2026', 'há 7 meses', 'ouro'], '21': ['02/04/2026', 'há 8 meses', 'ouro'] };
function r32CultosArea(p, cel) {
  const L = R32_CONG_A2.concat(R32_CONG_A2_MAIS).sort((a, b) => a[0] - b[0]).map((x, i) => { const c = R32_CONF_A2[x[0]] || [`${String(10 + (i * 7) % 18).padStart(2, '0')}/${i % 2 ? '10' : '09'}/2026`, 'em dia', 'verde']; return [x[0], x[1], String([5, 4, 6, 4, 3, 5, 4, 6, 5, 4, 5, 7][i]), String([2, 1, 3, 2, 0, 2, 1, 2, 1, 2, 1, 2][i]), c[0], r18Etiq(p, c[1], c[2])]; });
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${r32Filtro(p, 1)}${r16aAviso(p, '3 congregações passaram dos 6 meses sem conferir. A área também pode corrigir.')}${r16aListaCel(p, L.filter(x => /há/.test(x[5])).concat(L.filter(x => !/há/.test(x[5])).slice(0, 3)).map(x => [`${x[0]} · ${x[1]}`, `${x[2]} cultos · ${x[3]} pontos · conferido em ${x[4]}`, x[5]]))}`);
  const tab = r16aTab(p, '44px minmax(0,1.2fr) 90px 110px 110px minmax(0,1fr)', ['Nº', 'Congregação', 'Cultos', 'Pontos de culto', 'Conferido em', 'Situação'], L.map(x => [x[0], x[1], x[2] + ' por semana', x[3], x[4], x[5]]));
  const tit = r18Tit(p, 'Cultos e pontos de culto da Área 2', `quando cada congregação conferiu · a área também corrige, e o site muda sozinho · ${R32_HOJE}`, r32Filtro(p));
  return r32Es(p, 'area', 'Cultos e pontos', `${tit}${tab}`, ['Área 2', 'Cultos e pontos de culto']);
}
// a Geral: a igreja toda, por área, e o que está no site
function r32CultosGeral(p, cel) {
  const N = [r32Num('45', 'congregações no site'), r32Num('214', 'cultos por semana'), r32Num('61', 'pontos de culto'), r32Num('11', 'passaram dos 6 meses', 'ouro')];
  const nums = r29Nums(p, cel ? N.slice(1).map(x => [x[0], x[1].replace('passaram dos 6 meses', 'sem conferir')]) : N, cel);
  if (cel) return r32EsCel(p, 'Cultos e pontos', `${nums}${r16aListaCel(p, R32_AREAS.slice(0, 7).map(x => [x[0], `${x[1]} congregações · ${x[2]} cultos · ${x[3]} pontos`, r32N(p, x[4], 'ouro')]))}`);
  const tab = r16aTab(p, 'minmax(0,1.4fr) 120px 120px 130px minmax(0,1fr)', ['Área', 'Congregações', 'Cultos', 'Pontos de culto', 'Passaram dos 6 meses'], R32_AREAS.map(x => [x[0], x[1], x[2] + ' por semana', x[3], r32N(p, x[4], 'ouro')]));
  const tit = r18Tit(p, 'Cultos e pontos de culto da igreja toda', `o que está no site, por área · tocar numa área abre as congregações dela · ${R32_HOJE}`, r32Filtro(p));
  return r32Es(p, 'geral', 'Cultos e pontos', `${tit}${nums}${tab}`, ['Cultos e pontos de culto']);
}
const r32Cultos = (p, k, d) => { const cel = ehCel(d); return k === 'editar' ? r32CultosLocal(p, cel, 1) : k === 'area' ? r32CultosArea(p, cel) : k === 'geral' ? r32CultosGeral(p, cel) : r32CultosLocal(p, cel, 0); };
const PERFIS32_CULTOS = [['local', 'Secretaria de Vila Nova · conferir'], ['editar', 'Secretaria de Vila Nova · mudar a hora'], ['area', 'Pastor da Área 2 · as 12 congregações'], ['geral', 'Secretaria Geral · a igreja toda']];
