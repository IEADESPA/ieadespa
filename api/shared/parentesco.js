// shared/parentesco.js (v2.6)
// Art. 43 §3º, I — vedação de nepotismo no Conselho Fiscal: "cônjuges,
// companheiros ou parentes consanguíneos ou afins até o 2º grau... de
// membros da Diretoria Executiva ou de Tesoureiros de Departamentos".
//
// VinculosFamiliares (migração 011) hoje só tem 4 tipos — CONJUGE, PAI_FILHO,
// IRMAO, SOGRO_GENRO_NORA — todos já exatamente até 2º grau isoladamente.
// BFS profundidade 2 sobre esse grafo (tratado como NÃO-DIRECIONADO: cada
// linha vale nos dois sentidos, independente de quem é MembroId/
// MembroParenteId) cobre também combinações que não têm um tipo próprio no
// catálogo — ex: avô/neto (2x PAI_FILHO em cadeia), cunhado (CONJUGE+IRMAO).
//
// Limitação real, documentada: a vedação também cita "Tesoureiros de
// Departamentos" — mas esse cargo não é rastreado em lugar nenhum do sistema
// hoje (não é Assento, não é Lideranca), então só a parte "membros da
// Diretoria Executiva" é verificável aqui.
const PROFUNDIDADE_MAXIMA = 2;

async function vizinhos(pool, sql, membroIds) {
  // Nunca interpola texto cru: só inteiros válidos entram no IN (...) — a
  // lista de ids nunca é o corpo bruto da requisição (vem sempre de
  // MembroId já existente no banco ou coagida aqui), mas blindado mesmo assim.
  const idsValidos = Array.from(membroIds).map(Number).filter(Number.isInteger);
  if (idsValidos.length === 0) return new Map();
  const lista = idsValidos.join(",");
  const result = await pool.request().query(`
    SELECT MembroId AS a, MembroParenteId AS b FROM VinculosFamiliares
    WHERE MembroId IN (${lista}) OR MembroParenteId IN (${lista})
  `);
  const mapa = new Map();
  for (const row of result.recordset) {
    if (!mapa.has(row.a)) mapa.set(row.a, new Set());
    if (!mapa.has(row.b)) mapa.set(row.b, new Set());
    mapa.get(row.a).add(row.b);
    mapa.get(row.b).add(row.a);
  }
  return mapa;
}

// idsAlvo: Set<number> — retorna { encontrado, comMembroId } se existir
// caminho de até `profundidadeMaxima` arestas entre membroId e algum de
// idsAlvo (default 2, Art. 43 §3º/Estatuto Art. 38 §2º — Conselho Fiscal e
// CEI). v3.2 passa 3 pra suspeição de relator de Processo Disciplinar
// (Regimento Art. 91).
async function existeParentescoAte2Grau(pool, sql, membroId, idsAlvo, profundidadeMaxima = PROFUNDIDADE_MAXIMA) {
  const origem = Number(membroId);
  if (idsAlvo.has(origem)) return { encontrado: true, comMembroId: origem };

  let fronteira = new Set([origem]);
  const visitados = new Set([origem]);

  for (let profundidade = 1; profundidade <= profundidadeMaxima; profundidade++) {
    const adjacencias = await vizinhos(pool, sql, fronteira);
    const proximaFronteira = new Set();
    for (const nodo of fronteira) {
      const conectados = adjacencias.get(nodo) || new Set();
      for (const vizinho of conectados) {
        if (visitados.has(vizinho)) continue;
        if (idsAlvo.has(vizinho)) return { encontrado: true, comMembroId: vizinho };
        proximaFronteira.add(vizinho);
        visitados.add(vizinho);
      }
    }
    if (proximaFronteira.size === 0) break;
    fronteira = proximaFronteira;
  }

  return { encontrado: false, comMembroId: null };
}

module.exports = { existeParentescoAte2Grau };
