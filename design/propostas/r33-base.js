/* ================= RODADA 33: ESTRUTURA E TERRITÓRIOS (MÓDULO 3), OS AJUSTES DA 32 ================= */
// A 32 foi conferida por ele (24 e 25/11/2026): o painel e a ficha aprovados; os cultos, o termo de posse e o mapa
// voltam com os ajustes dele. A casca, os dados e as peças da 32 continuam na base (r32Es, r32Car, r32Mapa...); aqui só
// o que é novo, com o prefixo r33/R33. Hoje, nos desenhos, é 02/12/2026; a tela de janeiro é de 05/01/2027.
const R33_HOJE = '02/12/2026', R33_JAN = '05/01/2027';
// peças que a poda da 32 tirou (vêm da 31): a página pública que o QR abre e a caixa "é verdadeiro"
const r29Publico = (p, conteudo) => `<div style="width:390px;height:844px;display:flex;flex-direction:column;background:${p.fundo};color:${p.texto};overflow:hidden"><div style="background:#0A2342">${statusBar('#FFFFFF')}</div><div style="height:60px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:#0A2342">${logo(34)}<div style="line-height:1.2"><div style="font-size:15px;font-weight:800;color:#FFFFFF;letter-spacing:.04em">IEADESPA</div><div style="font-size:12px;color:#C9D4E3">Conferir um documento</div></div></div><div style="flex:1;min-height:0;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:12px">${conteudo}</div></div>`;
const r29PublicoNote = (p, conteudo) => `<div style="width:1280px;height:800px;display:flex;flex-direction:column;background:${p.fundo};color:${p.texto}"><header style="height:64px;flex:none;display:flex;align-items:center;gap:12px;padding:0 32px;background:#0A2342">${logo(38)}<span style="font-size:16px;font-weight:800;color:#FFFFFF;letter-spacing:.04em">IEADESPA</span><span style="font-size:14px;color:#C9D4E3">· Conferir um documento</span></header><div style="flex:1;min-height:0;display:flex;justify-content:center;align-items:flex-start;padding:28px 32px;gap:20px;overflow:hidden">${conteudo}</div></div>`;
const r27Check = (p, t = 20) => `<span style="width:${t}px;height:${t}px;border-radius:${t / 2}px;flex:none;background:${m8Verde(p)};display:flex;align-items:center;justify-content:center">${ic('check', p.e ? '#0B1F3A' : '#FFFFFF', Math.round(t * 0.6), 3)}</span>`;
const r31Caixa = (p, ok, tit, sub) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:${ok ? (p.e ? '#0F3B2E' : '#E8F6EE') : (p.e ? '#3A1414' : '#FDE4E4')};border:1px solid ${ok ? (p.e ? '#1F6B50' : '#A9DDBF') : m8Verm(p)};flex:none">${ok ? r27Check(p, 32) : `<span style="width:32px;height:32px;border-radius:16px;flex:none;background:${m8Verm(p)};display:flex;align-items:center;justify-content:center">${ic('fechar', '#FFFFFF', 18, 2.6)}</span>`}<div style="line-height:1.3;min-width:0"><div style="font-size:16px;font-weight:800;color:${p.titulo}">${tit}</div><div style="font-size:12.5px;color:${p.texto}">${sub}</div></div></div>`;
// o menu da 33: o da 32, e a Geral ganha a agenda padrão e os bairros da cidade em "Só a Geral"
function r33Grupos(k, ativo) {
  const G = [['Painel', [['grafico', 'Painel da estrutura']]], ['Igrejas', [['igreja', k === 'area' ? 'Ficha da área' : 'Ficha da congregação'], ['relogio', 'Cultos e pontos'], ['mapa', 'Mapa']]], ['Diretoria', [['maleta', 'Diretoria e cargos'], ['doc', 'Termos de posse']]]];
  if (k === 'geral') G.push(['Só a Geral', [['calendario', 'Agenda padrão'], ['casas', 'Bairros da cidade'], ['igreja', 'Áreas e números']]]);
  return G.map(g => { const tem = g[1].some(f => f[1] === ativo); return [g[0], g[1].map(f => (f[1] === ativo ? f.concat([1]) : f)), tem]; });
}
const r33Es = (p, k, ativo, conteudo, trilha, usu) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'estrutura', { titulo: 'Estrutura', escopo: R32_ESC[k], grupos: r33Grupos(k, ativo), usuario: usu || R32_USU[k] }), trilha: ['Estrutura'].concat(trilha || [ativo]), faixa: R32_VERDE, conteudo }));
// a ficha do membro mora no módulo Membros (azul): só para mostrar o campo do bairro e o alfinete
const r33Membros = (p, conteudo, trilha) => r16bAperta(casca(p, { lateralHtml: menuCor(p, 'pessoas', { titulo: 'Membros', escopo: R32_ESC.local, grupos: [['Pessoas', [['pessoas', 'Lista de membros'], ['pessoa', 'Ficha do membro', 1], ['mais', 'Cadastro novo']], 1], ['Documentos', [['doc', 'Cartas e certidões']], 0]], usuario: R27_SEC.local }), trilha: ['Membros'].concat(trilha), faixa: '#1D4ED8', conteudo }));
function r33MembrosCel(p, titulo, conteudo) {
  const marca = '<div style="flex:1;min-height:0;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:14px">';
  const h = cascaCel(p, { titulo, corBarra: '#1F4BAE', voltar: 1, conteudo }), i = h.indexOf(marca);
  return i < 0 ? h : h.slice(0, i) + '<div style="flex:1;min-height:0;overflow:hidden;padding:12px 14px;display:flex;flex-direction:column;gap:10px">' + h.slice(i + marca.length);
}
// o cadeado do que vem da Geral e não se mexe aqui
const r33Trava = p => `<span style="width:30px;height:30px;border-radius:8px;flex:none;background:${p.fundo};display:flex;align-items:center;justify-content:center">${ic('cadeado', p.suave, 15, 2)}</span>`;
// a caixinha de marcar
const r33Caixa = (p, on) => `<span style="width:20px;height:20px;border-radius:6px;flex:none;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${on ? `background:${R32_VERDE};` : `border:1.5px solid ${p.campoBorda};`}">${on ? ic('check', '#FFFFFF', 14, 3) : ''}</span>`;
// a escolha de uma entre poucas (o que mudar, por exemplo)
const r33Esc = (p, itens, ativo) => `<div style="display:flex;gap:6px;flex-wrap:wrap">${itens.map(t => `<span style="height:34px;padding:0 12px;border-radius:9px;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;${t === ativo ? `background:#FFF8E1;border:2px solid #FFB800;color:${p.titulo};` : `border:1px solid ${p.campoBorda};color:${p.texto};`}">${t === ativo ? ic('check', '#8A5A00', 14, 2.6) : ''}${t}</span>`).join('')}</div>`;
// o campo de texto longo (o porquê do pedido)
const r33Texto = (p, rot, val, alt = 64) => `<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12.5px;font-weight:600;color:${p.titulo}">${rot}</span><span style="min-height:${alt}px;border:1px solid ${p.campoBorda};border-radius:9px;background:${p.campo};padding:8px 11px;font-size:13px;line-height:1.4;color:${p.texto}">${val}</span></div>`;
