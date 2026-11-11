// Semeia uma MASSA GRANDE de dados FICTÍCIOS no banco de HOMOLOGAÇÃO (v10.1, 11/11/2026): uma igreja grande inteira, para o raio-x
// rodar sobre volume de verdade e para "entrar como" cada papel. Complementa (não substitui) o semeador pequeno, semear-homologacao.js.
//
// USO
//   Homologação:  SQL_CONNECTION_STRING=<conexão do ieadespa-homolog> node scripts/semear-homologacao-grande.js [opções]
//   LocalDB (prova, pelo equipamento tools/e2e-localdb):
//       cd tools/e2e-localdb && E2E_LOCALDB=1 node -r ./shim-mssql.js ../../api/scripts/semear-homologacao-grande.js [opções]
//
// OPÇÕES
//   (nenhuma)               cria o que falta (todas as etapas); rodar de novo NÃO duplica nada
//   --apagar                remove SÓ o que este gerador cria (pelas marcas abaixo), numa transação; nada mais
//   --contar                só conta as linhas fictícias por tabela
//   --etapas=a,b            só estas etapas, na ordem fixa: territorio, membros, lideranca, financeiro, ebd, escalas
//   --semente=N             semente do gerador pseudoaleatório (padrão 20261111): a MESMA semente gera a MESMA massa
//   --data-base=AAAA-MM-DD  o "hoje" da massa (padrão 2026-11-08, um domingo): idades, datas, o mês aberto da tesouraria e a EBD
//   --membros=N             tamanho aproximado da igreja (padrão 5000; mínimo 1500)
//   --meses=N               meses fechados da tesouraria antes do mês da data-base (padrão 24)
//   --ebd-domingos=N        domingos de chamada da EBD até a data-base (padrão 26)
//   SEED_SENHA              senha de todos os logins de teste (padrão: a mesma do semeador pequeno)
//   Para "atualizar" a massa para outra data: --apagar e rodar de novo com --data-base nova (rodar por cima só completa o que falta).
//
// TRAVA (igual à do semeador pequeno): só roda se o banco da conexão tem "homolog" no nome — conferido na cadeia de conexão E no
// DB_NAME() depois de conectar. A única exceção é E2E_LOCALDB=1 com o shim do equipamento (node -r ./shim-mssql.js), num LocalDB de
// verdade (SERVERPROPERTY('IsLocalDB') = 1): nunca a produção, onde todo dado é real e intocável (README, seção 2.4).
//
// MARCAS (o que --apagar reconhece; nada fora delas é tocado)
//   - pessoas: matrículas 700000 a 799999 (o semeador pequeno usa 900001+; o equipamento e2e, 1001 a 9999);
//   - território: Regiões, Áreas, Congregações e Extensões com o nome terminando em " (Fictícia)"; Bairros em " (Fictício)";
//   - fornecedores: CNPJ "99.999.999/xxxx-00" (dígito verificador inválido de propósito: nunca é empresa real) e nome em " (Fictício)";
//   - o resto (lançamentos, fechamentos, saídas, EBD, vínculos, liderança...) é achado pela congregação ou pela matrícula fictícia;
//   - e-mails em @example.org (domínio reservado, RFC 2606: nenhum e-mail chega a ninguém) e telefones com DDD (00), que não existe.
//   Se o app foi usado na homologação com essas pessoas (uma reunião, um item de cuidado...), o --apagar recusa INTEIRO (desfaz tudo) e
//   diz a tabela que ainda aponta para elas: nada fica pela metade. Os rastros do login (sessões, tentativas, chaves, PIN, avisos do
//   sininho, os termos assinados no primeiro acesso) das matrículas fictícias são apagados junto; o AuditLog fica (não tem chave para
//   a pessoa e a trilha de auditoria não se apaga).
//
// O QUE CRIA (data-base 2026-11-08, padrão)
//   1. território: 2 Regiões, 6 Áreas, 40 Congregações (com a Sede), 10 Extensões da Tenda, 36 Bairros, os órgãos automáticos
//      (JAI, JEA/JUC, CRA/TER/CRAF, como a tela de catálogos faz) e o vínculo congregação × área;
//   2. ~5.000 pessoas em famílias (cônjuge, pai/mãe e filhos, irmãos), idades de 0 a 90 anos, situação (congregado, em comunhão,
//      sem comunhão), alguns desligados, falecidos e inativos, batismo e admissão coerentes com a idade, endereço em linhas com bairro,
//      departamento pela idade e cargo ministerial pela escada do Art. 72 (poucos pastores e evangelistas, mais presbíteros, diáconos e
//      auxiliares; obreira até Missionária), com o histórico do cargo respeitando o interstício;
//   3. liderança com senha (SEED_SENHA): Presidente 700001, Secretário Geral 700002, Tesoureiro (Tesouraria Geral) 700003,
//      Superintendentes Regionais 700011-700012, Pastores de Área 700021-700026, Dirigente da congregação k = 700100+k e Tesoureiro
//      Local = 700200+k (k = 1 é a Sede); todos sem e-mail (entram só com a senha, como os do semeador pequeno);
//   4. tesouraria: dizimistas, dízimos e ofertas de cada culto (domingo e quarta) por congregação desde 24 meses antes da data-base,
//      com Termo nº contínuo, PIX conciliado em lote por mês, fechamentos mensais calculados como o FecharMesTesouraria (aluguel/lote,
//      40% local / 60% geral) e liberados pela Tesouraria Geral (o último fechado fica, em parte das congregações, esperando a
//      liberação), o mês da data-base aberto; fornecedores e saídas locais (energia, água, Santa Ceia...) aprovadas pela Tesouraria
//      Geral (segregação: quem solicita nunca aprova) e pagas sem passar do saldo local liberado;
//   5. EBD: revistas, turmas por faixa etária em cada congregação, alunos (membros), professores, lições, chamadas, ofertas e
//      cadernetas dos últimos domingos (turmas sem a marca "com menores", como nascem na tela);
//   6. escalas: equipes só de adultos (recepção, louvor, limpeza, cozinha), os cultos de domingo de 8 semanas antes a 4 depois da
//      data-base, com convites confirmados, recusas seguidas do convite ao próximo, e convites ainda abertos.
// O lote é por transação: cada bloco de pessoas, cada congregação da tesouraria, da EBD e das escalas entra inteiro ou não entra.
// Fica de fora (e por quê): eventos/calendário, cuidado pastoral e consentimentos de comunicação — têm regras de sigilo, de ciclo e
// de consentimento (com a impressão digital do texto aceito) que a massa teria de forjar; sem consentimento, nenhum comunicado sai
// para a massa.
"use strict";
const crypto = require("crypto");
const sql = require("mssql");

// ------------------------------------------------------------------ opções ------------------------------------------------------------------
const ARGS = process.argv.slice(2);
function opcao(nome, padrao) {
  const a = ARGS.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  if (!a) return padrao;
  const i = a.indexOf("=");
  return i < 0 ? true : a.slice(i + 1);
}
const ETAPAS_TODAS = ["territorio", "membros", "lideranca", "financeiro", "ebd", "escalas"];
const SEMENTE = String(opcao("semente", "20261111"));
const DATA_BASE = String(opcao("data-base", "2026-11-08"));
const TOTAL_MEMBROS = Math.max(1500, Number(opcao("membros", 5000)) || 5000);
const MESES_FECHADOS = Math.max(3, Math.min(60, Number(opcao("meses", 24)) || 24));
const EBD_DOMINGOS = Math.max(1, Math.min(104, Number(opcao("ebd-domingos", 26)) || 26));
const SENHA = process.env.SEED_SENHA || "Homolog@2026";

const MATRICULA_MIN = 700000;
const MATRICULA_MAX = 799999;
const SUF_F = " (Fictícia)";
const SUF_M = " (Fictício)";
const LIKE_F = "N'% (Fictícia)'";
const LIKE_M = "N'% (Fictício)'";
const CNPJ_PREFIXO = "99.999.999/";

// ------------------------------------------------------------------ sorteio com semente (mulberry32) ------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(texto) {
  let h = 2166136261;
  for (const ch of texto) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Um gerador por assunto ("membros:3", "fin:12"...): mexer numa etapa não desloca o sorteio das outras.
function criarRng(rotulo) {
  const f = mulberry32(hash32(`${SEMENTE}:${rotulo}`));
  const r = {
    real: f,
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    chance: (p) => f() < p,
    pick: (lista) => lista[Math.floor(f() * lista.length)],
    pesos: (pares) => {
      const total = pares.reduce((s, [, w]) => s + w, 0);
      let x = f() * total;
      for (const [v, w] of pares) { x -= w; if (x < 0) return v; }
      return pares[pares.length - 1][0];
    }
  };
  return r;
}

// ------------------------------------------------------------------ datas (dias UTC desde 1970) ------------------------------------------------------------------
const DIA_MS = 86400000;
const diaDe = (iso) => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DIA_MS);
const isoDe = (d) => new Date(d * DIA_MS).toISOString().slice(0, 10);
const momento = (d, hora, minuto = 0, segundo = 0) => `${isoDe(d)}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}`;
const diaSemana = (d) => new Date(d * DIA_MS).getUTCDay();
const mesDe = (d) => isoDe(d).slice(0, 7);
const primeiroDiaMes = (ano, mes) => Math.floor(Date.UTC(ano, mes - 1, 1) / DIA_MS);
function idadeEm(nasc, dia) {
  const a = isoDe(nasc), b = isoDe(dia);
  let anos = Number(b.slice(0, 4)) - Number(a.slice(0, 4));
  if (b.slice(5) < a.slice(5)) anos--;
  return anos;
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATA_BASE) || isoDe(diaDe(DATA_BASE)) !== DATA_BASE) { console.error(`--data-base inválida: ${DATA_BASE}`); process.exit(1); }
const BASE = diaDe(DATA_BASE);
const ANO_BASE = Number(DATA_BASE.slice(0, 4));
const MES_BASE = Number(DATA_BASE.slice(5, 7));
// meses da tesouraria: MESES_FECHADOS fechados + o mês da data-base (aberto)
const MESES = [];
for (let k = MESES_FECHADOS; k >= 0; k--) {
  const total = ANO_BASE * 12 + (MES_BASE - 1) - k;
  const ano = Math.floor(total / 12), mes = (total % 12) + 1;
  MESES.push({ chave: `${ano}-${String(mes).padStart(2, "0")}`, ano, mes, inicio: primeiroDiaMes(ano, mes), fim: primeiroDiaMes(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1) - 1, aberto: k === 0 });
}
const INICIO_FIN = MESES[0].inicio;

// ------------------------------------------------------------------ listas (nomes comuns, combinados ao acaso: ninguém de verdade) ------------------------------------------------------------------
const NOMES_M = ["João", "José", "Antônio", "Francisco", "Carlos", "Paulo", "Pedro", "Lucas", "Luiz", "Marcos", "Gabriel", "Rafael", "Daniel", "Marcelo", "Bruno", "Eduardo",
  "Felipe", "Raimundo", "Rodrigo", "Manoel", "Mateus", "André", "Fernando", "Fábio", "Leonardo", "Gustavo", "Guilherme", "Leandro", "Tiago", "Anderson", "Ricardo",
  "Márcio", "Jorge", "Sebastião", "Alexandre", "Roberto", "Edson", "Diego", "Vitor", "Sérgio", "Cláudio", "Renato", "Samuel", "Davi", "Josué", "Elias", "Isaque",
  "Jonas", "Natanael", "Enzo", "Miguel", "Arthur", "Heitor", "Bernardo", "Benjamin", "Joaquim", "Wesley", "Adriano", "Emanuel", "Ezequiel", "Josias", "Moisés",
  "Abraão", "Calebe", "Levi", "Murilo", "Otávio", "Henrique", "Caio", "Igor", "Valdir", "Wilson", "Gilberto", "Nilson", "Reginaldo", "Silas", "Jeferson", "Kauã"];
const NOMES_F = ["Maria", "Ana", "Francisca", "Antônia", "Adriana", "Juliana", "Márcia", "Fernanda", "Patrícia", "Aline", "Sandra", "Camila", "Amanda", "Bruna",
  "Jéssica", "Letícia", "Júlia", "Luciana", "Vanessa", "Mariana", "Gabriela", "Vera", "Vitória", "Larissa", "Cláudia", "Beatriz", "Raimunda", "Rita", "Tereza",
  "Josefa", "Sara", "Rebeca", "Raquel", "Ester", "Débora", "Rute", "Miriam", "Lídia", "Priscila", "Eunice", "Joana", "Isabel", "Helena", "Alice", "Laura",
  "Valentina", "Sophia", "Manuela", "Lorena", "Lívia", "Cecília", "Heloísa", "Yasmin", "Kelly", "Simone", "Elaine", "Rosângela", "Cristiane", "Daniela",
  "Tatiane", "Keila", "Noemi", "Abigail", "Elisabete", "Marta", "Lúcia", "Edna", "Socorro", "Graça", "Ivone", "Nazaré", "Rosa", "Clara", "Isadora", "Lara"];
const SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho",
  "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques", "Machado", "Mendes",
  "Freitas", "Cardoso", "Ramos", "Gonçalves", "Santana", "Teixeira", "Araújo", "Pinto", "Correia", "Monteiro", "Moura", "Cavalcante", "Batista", "Campos",
  "Farias", "Sousa", "Brito", "Miranda", "Reis", "Castro", "Pires", "Sales", "Macedo", "Aguiar", "Bezerra", "Leite", "Lacerda", "Tavares", "Xavier", "Coelho", "Borges"];
const LOGRADOUROS = ["Rua das Acácias", "Rua dos Ipês", "Rua da Esperança", "Rua São José", "Avenida Principal", "Travessa da Paz", "Rua Sete", "Rua Dez", "Rua Quinze",
  "Rua das Palmeiras", "Rua dos Girassóis", "Avenida das Nações", "Rua Bela Vista", "Rua do Sol", "Rua da Alegria", "Rua Boa Vista", "Rua das Flores", "Rua Nova",
  "Travessa Primavera", "Rua do Comércio", "Rua Santa Luzia", "Rua Alvorada", "Rua Liberdade", "Avenida Castanheira", "Rua dos Cedros", "Rua Aroeira",
  "Rua das Mangueiras", "Rua Jatobá", "Rua Pau-Brasil", "Rua Andiroba"];
const COMPLEMENTOS = ["Casa 2", "Fundos", "Apto 101", "Apto 203", "Bloco B", "Quadra 3, Lote 12", "Quadra 8, Lote 4", "Casa A"];
const BAIRROS = ["Jardim das Palmeiras", "Vila Esperança", "Novo Horizonte", "Parque dos Ipês", "Bela Vista", "Jardim Primavera", "Nova Aliança", "Morada do Sol",
  "Recanto Verde", "Vale do Sol", "Jardim Europa", "Vila Rica", "Monte Castelo", "Bom Retiro", "Santa Luzia", "São Francisco", "Jardim Tropical", "Residencial Araguaia",
  "Parque das Nações", "Vila Nova", "Jardim Canaã", "Alto Bonito", "Boa Esperança", "Cidade Nova", "Jardim Itacaiúnas", "Liberdade", "Paraíso", "Rio Verde",
  "Serra Azul", "Sol Nascente", "União", "Vitória", "Floresta", "Ipiranga", "Castanheiras", "Bosque Azul"];
const CONGREGACOES = ["Betel", "Betânia", "Canaã", "Monte Sinai", "Jerusalém", "Filadélfia", "Getsêmani", "Siloé", "Ebenézer", "Peniel", "Hebrom", "Monte Sião",
  "Jordão", "Galileia", "Belém", "Nazaré", "Emaús", "Gileade", "Monte Moriá", "Horebe", "Monte Carmelo", "Berseba", "Efraim", "Shalom", "Maranata", "Elim",
  "Reobote", "Antioquia", "Éfeso", "Corinto", "Tessalônica", "Bereia", "Esmirna", "Pérgamo", "Laodiceia", "Sardes", "Tiatira", "Filipos", "Colossos"];
const EXTENSOES = ["Vale da Bênção", "Nova Vida", "Água Viva", "Pão da Vida", "Luz do Mundo", "Sal da Terra", "Fonte de Vida", "Boas Novas", "Semente", "Videira"];
const AREAS = [["Área Norte I", 0], ["Área Norte II", 0], ["Área Norte III", 0], ["Área Sul I", 1], ["Área Sul II", 1], ["Área Sul III", 1]];
const REGIOES = ["Região Norte", "Região Sul"];
const CONGS_POR_AREA = [6, 7, 6, 7, 6, 7]; // + a Sede, na Área Norte I = 40
const CIDADE = "Parauapebas", UF = "PA", CENTRO_LAT = -6.0675, CENTRO_LNG = -49.9025;
const ESCADA = ["MEMBRO", "AUXILIAR", "MISSIONARIO", "DIACONO", "PRESBITERO", "EVANGELISTA", "PASTOR"];
// Art. 72: anos mínimos no degrau de baixo (Auxiliar→Missionário 1, Missionário→Diácono 2, Diácono→Presbítero 2). Evangelista e Pastor: 2 anos — escolha do gerador
// (não há interstício escrito; a subida é por indicação do Presidente).
const INTERSTICIO_ANOS = [0, 0, 1, 2, 2, 2, 2];

// ------------------------------------------------------------------ SQL em lote (valores literais; nada vem de fora) ------------------------------------------------------------------
const cru = (texto) => ({ __sql: texto });
const reais = (centavos) => cru((centavos / 100).toFixed(2));
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object" && v.__sql) return v.__sql;
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("número inválido no lote"); return String(v); }
  if (typeof v === "boolean") return v ? "1" : "0";
  return `N'${String(v).replace(/'/g, "''")}'`;
}
async function inserir(req, tabela, colunas, linhas, porVez = 500) {
  for (let i = 0; i < linhas.length; i += porVez) {
    const parte = linhas.slice(i, i + porVez);
    await req().query(`INSERT INTO dbo.${tabela} (${colunas.join(", ")}) VALUES\n${parte.map((l) => `(${l.map(lit).join(", ")})`).join(",\n")}`);
  }
  return linhas.length;
}
const ler = async (req, texto) => (await req().query(texto)).recordset;
async function emTransacao(pool, fn) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await fn(() => new sql.Request(tx));
    await tx.commit();
    return r;
  } catch (e) {
    try { await tx.rollback(); } catch { /* a transação já foi desfeita pelo banco */ }
    throw e;
  }
}
function hashSenha(senha) {
  // Mesmo formato de api/shared/auth.js (que não é carregado aqui porque exige AUTH_SECRET) — igual ao semeador pequeno.
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(senha), salt, 64).toString("hex")}`;
}
// O mesmo cálculo de shared/tesouraria.js::calcularFechamento (copiado: aquele módulo carrega auth.js, que exige AUTH_SECRET).
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function calcularFechamento({ totalRecebido, valorAluguel, valorLote, percentualRetencao }) {
  const totalFinal = round2(totalRecebido - (valorAluguel || 0) - (valorLote || 0));
  const valorRetidoLocal = round2(totalFinal * (percentualRetencao / 100));
  const valorRepasseGeral = round2(totalFinal - valorRetidoLocal);
  return { totalFinal, valorRetidoLocal, valorRepasseGeral };
}
const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// =========================================================================================================================================
// O MODELO: a massa inteira gerada em memória, só a partir da semente e da data-base (nada do banco entra aqui) — por isso é determinística.
// =========================================================================================================================================
function gerarModelo() {
  const rT = criarRng("territorio");
  const arred6 = (n) => Math.round(n * 1e6) / 1e6;
  const bairros = BAIRROS.map((n, i) => ({
    i, nome: `${n}${SUF_M}`, lat: arred6(CENTRO_LAT + (rT.real() - 0.5) * 0.09), lng: arred6(CENTRO_LNG + (rT.real() - 0.5) * 0.10),
    cep: `68515-${String(100 + i * 7).padStart(3, "0")}`
  }));
  const regioes = REGIOES.map((n, i) => ({ i, nome: `${n}${SUF_F}` }));
  const areas = AREAS.map(([n, reg], i) => ({ i, nome: `${n}${SUF_F}`, regiao: reg, congs: [] }));
  const congs = [];
  const novaCong = (nome, area, sede) => {
    const bairro = sede ? 0 : rT.int(0, bairros.length - 1);
    const c = {
      i: congs.length, k: congs.length + 1, nome: `${nome}${SUF_F}`, area, sede, bairro, extensoes: [], pessoas: [],
      endereco: `${rT.pick(LOGRADOUROS)}, ${rT.int(10, 1999)}`,
      lat: arred6(bairros[bairro].lat + (rT.real() - 0.5) * 0.006), lng: arred6(bairros[bairro].lng + (rT.real() - 0.5) * 0.006),
      fundacao: sede ? 1972 : rT.int(1982, 2021),
      horarios: sede ? "Dom 9h (EBD) · Dom 18h · Qua 19h30 · Sex 19h30 (oração)" : "Dom 9h (EBD) · Dom 19h · Qua 19h30"
    };
    congs.push(c);
    areas[area].congs.push(c);
    return c;
  };
  novaCong("Sede", 0, true);
  let n = 0;
  CONGS_POR_AREA.forEach((qtd, a) => { for (let j = 0; j < qtd; j++) novaCong(CONGREGACOES[n++], a, false); });

  // Tamanho de cada congregação: a Sede ~9,5% da igreja; as outras com pesos desiguais (há congregação de 30 e de 250 pessoas).
  const alvoSede = Math.round(TOTAL_MEMBROS * 0.095);
  const pesos = congs.slice(1).map(() => 0.15 + Math.pow(rT.real(), 1.6));
  const somaPesos = pesos.reduce((s, x) => s + x, 0);
  congs[0].alvo = alvoSede;
  congs.slice(1).forEach((c, j) => { c.alvo = Math.max(25, Math.round((TOTAL_MEMBROS - alvoSede) * pesos[j] / somaPesos)); });
  // Aluguel (algumas alugam o templo) e lote (algumas pagam o terreno em parcelas): só onde a arrecadação esperada cobre com folga.
  for (const c of congs) {
    c.aluguel = !c.sede && c.alvo >= 70 && c.i % 5 === 3 ? Math.min(1400, Math.round(c.alvo * 8 / 50) * 50) * 100 : 0;
    c.lote = !c.sede && c.alvo >= 60 && c.i % 7 === 5 ? (300 + 50 * rT.int(0, 8)) * 100 : 0;
  }
  // Extensões da Tenda: nas 10 maiores congregações (fora a Sede), uma em cada.
  const maiores = congs.slice(1).sort((a, b) => b.alvo - a.alvo || a.i - b.i).slice(0, EXTENSOES.length);
  const extensoes = maiores.map((mae, i) => {
    const bairro = rT.int(0, bairros.length - 1);
    const e = {
      i, nome: `Extensão ${EXTENSOES[i]}${SUF_F}`, mae, bairro, endereco: `${rT.pick(LOGRADOUROS)}, ${rT.int(10, 1999)}`,
      aberta: diaDe(`${rT.int(2015, 2024)}-${String(rT.int(1, 12)).padStart(2, "0")}-${String(rT.int(1, 28)).padStart(2, "0")}`),
      lat: arred6(bairros[bairro].lat + (rT.real() - 0.5) * 0.006), lng: arred6(bairros[bairro].lng + (rT.real() - 0.5) * 0.006)
    };
    mae.extensoes.push(e);
    return e;
  });

  // ---------------------------------------------------------- pessoas, por família ----------------------------------------------------------
  const pessoas = [];
  const vinculos = []; // { a, b, tipo } — a/b são pessoas; PAI_FILHO: a = pai/mãe, b = filho(a) (o rótulo direto "Pai/Mãe de" é o de a)
  for (const c of congs) {
    const r = criarRng(`membros:${c.i}`);
    while (c.pessoas.length < c.alvo) gerarFamilia(r, c, bairros, pessoas, vinculos);
  }
  // Quem perdeu o cônjuge (falecido) fica viúvo(a).
  for (const v of vinculos) {
    if (v.tipo !== "CONJUGE") continue;
    if (v.a.status === "FALECIDO" && v.b.status !== "FALECIDO") v.b.estadoCivil = "VIUVO";
    if (v.b.status === "FALECIDO" && v.a.status !== "FALECIDO") v.a.estadoCivil = "VIUVO";
  }
  // Cargo ministerial pela escada, a partir da idade, do sexo e do tempo de casa.
  const rC = criarRng("cargos");
  for (const p of pessoas) atribuirCargo(rC, p);

  // ---------------------------------------------------------- liderança (escolhida, com o cargo à altura) ----------------------------------------------------------
  const rL = criarRng("lideranca");
  const lideres = [];
  const apto = (p) => p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && !p.lider;
  const escolher = (lista, filtro, cargoMin, cargoAlvo, papel, escopo, matricula) => {
    let cands = lista.filter((p) => apto(p) && filtro(p));
    const prontos = cands.filter((p) => ESCADA.indexOf(p.cargo || "MEMBRO") >= cargoMin);
    let p = prontos.length ? rL.pick(prontos) : null;
    if (!p && cargoAlvo > 0) {
      cands = cands.filter((x) => planejarCarreira(rL, x, cargoAlvo));
      if (cands.length) { p = rL.pick(cands); aplicarCarreira(p, planejarCarreira(rL, p, cargoAlvo), cargoAlvo); }
    }
    if (!p && cargoAlvo === 0 && cands.length) p = rL.pick(cands);
    if (!p) return null;
    p.lider = { papel, escopo };
    p.matricula = matricula;
    lideres.push(p);
    return p;
  };
  const daCong = (c) => c.pessoas;
  const daArea = (a) => a.congs.flatMap((c) => c.pessoas);
  const homem = (min, max) => (p) => p.sexo === "M" && p.idade >= min && p.idade <= max;
  const adulto = (min, max) => (p) => p.idade >= min && p.idade <= max;
  const PASTOR = 6, EVANGELISTA = 5, PRESBITERO = 4;
  const sede = congs[0];
  escolher(daCong(sede), homem(50, 72), PASTOR, PASTOR, "Presidente", { tipo: "GLOBAL" }, MATRICULA_MIN + 1);
  escolher(daCong(sede), homem(35, 66), PRESBITERO, PRESBITERO, "Secretário Geral", { tipo: "GLOBAL" }, MATRICULA_MIN + 2);
  escolher(daCong(sede), adulto(30, 65), 0, 0, "Tesoureiro", { tipo: "GLOBAL" }, MATRICULA_MIN + 3);
  regioes.forEach((reg, i) => {
    const doReg = areas.filter((a) => a.regiao === reg.i).flatMap(daArea);
    escolher(doReg, homem(45, 72), PASTOR, PASTOR, "Superintendente Regional", { tipo: "REGIAO", regiao: reg }, MATRICULA_MIN + 11 + i);
  });
  areas.forEach((a, i) => {
    escolher(a.congs[0].pessoas, homem(38, 70), PASTOR, PASTOR, "Pastor de Área", { tipo: "AREA", area: a }, MATRICULA_MIN + 21 + i)
      || escolher(daArea(a), homem(38, 70), PASTOR, PASTOR, "Pastor de Área", { tipo: "AREA", area: a }, MATRICULA_MIN + 21 + i);
  });
  for (const c of congs) {
    const alvo = c.sede ? PASTOR : rL.pesos([[PRESBITERO, 60], [EVANGELISTA, 25], [PASTOR, 15]]);
    escolher(daCong(c), homem(32, 72), alvo, alvo, "Dirigente de Congregação", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 100 + c.k)
      || escolher(daCong(c), homem(25, 80), PRESBITERO, PRESBITERO, "Dirigente de Congregação", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 100 + c.k);
    escolher(daCong(c), adulto(25, 66), 0, 0, "Tesoureiro Local", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 200 + c.k)
      || escolher(daCong(c), adulto(18, 80), 0, 0, "Tesoureiro Local", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 200 + c.k);
  }
  // Matrículas: liderança nos números fixos; o resto a partir de 701001, na ordem em que nasceu no modelo.
  let proxima = MATRICULA_MIN + 1001;
  for (const p of pessoas) if (!p.matricula) p.matricula = proxima++;
  if (proxima - 1 > MATRICULA_MAX) throw new Error("matrículas passaram da faixa fictícia");
  pessoas.sort((a, b) => a.matricula - b.matricula);

  // Encarregado de cada Extensão (alguém da própria Extensão, de preferência com cargo).
  const rE = criarRng("extensoes");
  for (const e of extensoes) {
    const daExt = e.mae.pessoas.filter((p) => p.extensao === e && p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && p.idade >= 21);
    const comCargo = daExt.filter((p) => ESCADA.indexOf(p.cargo || "MEMBRO") >= 1 && !p.lider);
    const pool = comCargo.length ? comCargo : daExt.filter((p) => !p.lider);
    const enc = pool.length ? rE.pick(pool) : null;
    if (enc) e.encarregado = { pessoa: enc, desde: Math.max(e.aberta, enc.admissao || e.aberta) };
  }

  // Dizimistas: metade dos adultos em comunhão (a liderança, todos), cada um com o seu jeito de dizimar.
  const rD = criarRng("dizimistas");
  const RENDAS = [[1300, 14], [1500, 16], [1700, 14], [2000, 13], [2400, 10], [2800, 8], [3200, 7], [3800, 6], [4500, 4], [5500, 3], [7000, 2], [9000, 2], [12000, 1]];
  for (const p of pessoas) {
    if (p.status !== "ATIVO" || p.situacao !== "EM_COMUNHAO" || p.idade < 18) continue;
    if (!p.lider && !rD.chance(0.5)) continue;
    const renda = rD.pesos(RENDAS) * (0.9 + rD.real() * 0.25);
    p.dizimista = {
      regular: p.lider ? true : rD.chance(0.75),
      mensal: Math.max(5000, Math.round(renda * 10)), // 10% da renda, em centavos
      pix: rD.chance(p.idade < 40 ? 0.7 : p.idade < 60 ? 0.5 : 0.25),
      desde: Math.max(INICIO_FIN, p.admissao || INICIO_FIN)
    };
    p.dizimistaFiel = p.dizimista.regular;
  }
  return { bairros, regioes, areas, congs, extensoes, pessoas, vinculos, lideres };
}

// Uma família (ou pessoa sozinha) na congregação c: mesmo endereço, sobrenomes que se herdam, vínculos.
function gerarFamilia(r, c, bairros, pessoas, vinculos) {
  const casa = {
    bairro: r.chance(0.55) ? c.bairro : r.int(0, bairros.length - 1),
    logradouro: r.pick(LOGRADOUROS), numero: String(r.int(1, 2500)), complemento: r.chance(0.12) ? r.pick(COMPLEMENTOS) : null,
    extensao: c.extensoes.length && r.chance(0.3) ? r.pick(c.extensoes) : null
  };
  const sob = () => r.pick(SOBRENOMES);
  const nova = (sexo, idade, sobrenomes, estadoCivil) => {
    const p = {
      sexo, cong: c, casa, extensao: casa.extensao, sobrenomes,
      primeiro: r.pick(sexo === "M" ? NOMES_M : NOMES_F),
      nasc: BASE - Math.floor(idade * 365.25) - r.int(1, 360),
      estadoCivil
    };
    p.nome = `${p.primeiro} ${sobrenomes.join(" ")}`;
    p.idade = idadeEm(p.nasc, BASE);
    vidaEclesial(r, p);
    pessoas.push(p);
    c.pessoas.push(p);
    return p;
  };
  const filhos = (pai, mae, qtd, sobrenomes) => {
    const ref = mae || pai;
    const lista = [];
    for (let j = 0; j < qtd; j++) {
      const idade = ref.idade - r.int(19, 40);
      if (idade < 0) continue;
      const f = nova(r.chance(0.5) ? "M" : "F", idade, sobrenomes, idade >= 16 ? "SOLTEIRO" : null);
      if (pai) vinculos.push({ a: pai, b: f, tipo: "PAI_FILHO" });
      if (mae) vinculos.push({ a: mae, b: f, tipo: "PAI_FILHO" });
      lista.push(f);
    }
    return lista;
  };
  const tipo = r.pesos([["casal_filhos", 42], ["casal", 10], ["mae_solo", 12], ["pai_solo", 2], ["so", 24], ["irmaos", 5], ["idosos", 5]]);
  if (tipo === "casal_filhos" || tipo === "casal" || tipo === "idosos") {
    const jovem = tipo === "casal" && r.chance(0.5);
    const hIdade = tipo === "idosos" ? r.int(62, 88) : tipo === "casal" ? (jovem ? r.int(20, 34) : r.int(60, 85)) : r.int(24, 68);
    const mIdade = Math.max(19, Math.min(90, hIdade + r.int(-6, 3)));
    const ec = r.chance(0.08) ? "UNIAO_ESTAVEL" : "CASADO";
    const hs = [sob(), sob()], ms = [sob(), sob()];
    const marido = nova("M", hIdade, hs, ec);
    const esposa = nova("F", mIdade, r.chance(0.5) ? [ms[0], hs[1]] : ms, ec);
    vinculos.push({ a: marido, b: esposa, tipo: "CONJUGE" });
    if (tipo === "casal_filhos") filhos(marido, esposa, r.pesos([[1, 30], [2, 40], [3, 20], [4, 10]]), [ms[1], hs[1]]);
    if (tipo === "idosos" && r.chance(0.4)) filhos(marido, esposa, 1, [ms[1], hs[1]]);
  } else if (tipo === "mae_solo" || tipo === "pai_solo") {
    const sexo = tipo === "mae_solo" ? "F" : "M";
    const s = [sob(), sob()];
    const chefe = nova(sexo, r.int(21, 55), s, r.pesos([["SOLTEIRO", 45], ["DIVORCIADO", 40], ["VIUVO", 15]]));
    filhos(sexo === "M" ? chefe : null, sexo === "F" ? chefe : null, r.pesos([[1, 45], [2, 40], [3, 15]]), [s[1], sob()]);
  } else if (tipo === "irmaos") {
    const s = [sob(), sob()];
    const irmaos = [];
    const qtd = r.chance(0.3) ? 3 : 2;
    for (let j = 0; j < qtd; j++) irmaos.push(nova(r.chance(0.5) ? "M" : "F", r.int(18, 35), s, "SOLTEIRO"));
    for (let x = 0; x < irmaos.length; x++) for (let y = x + 1; y < irmaos.length; y++) vinculos.push({ a: irmaos[x], b: irmaos[y], tipo: "IRMAO" });
  } else {
    const faixa = r.pesos([["jovem", 40], ["meia", 35], ["idoso", 25]]);
    const idade = faixa === "jovem" ? r.int(18, 29) : faixa === "meia" ? r.int(30, 59) : r.int(60, 90);
    const ec = faixa === "jovem" ? "SOLTEIRO" : faixa === "meia" ? r.pesos([["SOLTEIRO", 55], ["DIVORCIADO", 45]]) : r.pesos([["VIUVO", 65], ["SOLTEIRO", 20], ["DIVORCIADO", 15]]);
    nova(r.chance(0.55) ? "F" : "M", idade, [sob(), sob()], ec);
  }
}

// Batismo, admissão, situação e status coerentes com a idade (Estatuto Art. 7º: comunhão = batizado e 12 anos ou mais).
function vidaEclesial(r, p) {
  const idade = p.idade;
  p.status = "ATIVO";
  let batizado = false;
  if (idade >= 18) batizado = r.chance(0.88);
  else if (idade >= 12) batizado = r.chance((idade - 11) * 0.1);
  if (!batizado) { p.situacao = "CONGREGADO"; return; }
  const anoMin = Math.max(p.nasc + Math.ceil(12 * 365.25), diaDe("1968-01-01"));
  const forma = r.pesos([["BATISMO", 72], ["CARTA_MUDANCA", 18], ["RECONCILIACAO", 5], ["ACLAMACAO", 5]]);
  const entre = (a, b) => (b <= a ? a : a + r.int(0, b - a));
  p.forma = forma;
  if (forma === "BATISMO") {
    p.batismo = entre(anoMin, BASE - 20);
    p.admissao = p.batismo;
  } else {
    p.batismo = entre(anoMin, BASE - 400);
    p.admissao = entre(p.batismo + 200, BASE - 20);
    if (forma === "CARTA_MUDANCA" || forma === "ACLAMACAO") p.igrejaAnterior = `Igreja de origem ${r.int(1, 40)} (fictícia)`;
  }
  // Quem acabou de fazer 12 anos: nada depois da data-base, e o batismo nunca depois da admissão.
  p.admissao = Math.min(p.admissao, BASE - 1);
  p.batismo = Math.min(p.batismo, p.admissao);
  p.situacao = r.chance(0.03) ? "SEM_COMUNHAO" : "EM_COMUNHAO";
  // Saídas: falecidos (sobretudo idosos), desligados e inativos — com a data depois da admissão.
  const desde = Math.max(p.admissao + 30, BASE - 6 * 365);
  if (desde < BASE - 10) {
    if (idade >= 65 ? r.chance(0.05) : idade >= 40 && r.chance(0.004)) {
      p.status = "FALECIDO"; p.saida = entre(desde, BASE - 10); p.motivoSaida = "FALECIMENTO";
    } else if (r.chance(0.02)) {
      p.status = "DESLIGADO"; p.situacao = "SEM_COMUNHAO"; p.saida = entre(desde, BASE - 10);
      p.motivoSaida = r.pesos([["DESLIGAMENTO", 30], ["CARTA_MUDANCA", 40], ["ABANDONO_MATERIAL", 30]]);
    } else if (r.chance(0.01)) {
      p.status = "INATIVO"; p.afastamento = entre(desde, BASE - 10);
    }
  }
}

// O plano da carreira até o degrau `alvo` (índice da ESCADA): a data de entrada em cada degrau, respeitando a idade mínima (17), um ano de
// casa para Auxiliar e o interstício entre os degraus; null se não cabe até a data-base.
function planejarCarreira(r, p, alvo) {
  if (!p.admissao || alvo < 1) return null;
  if (p.sexo === "F" && alvo > 2) return null; // Art. 71, III: Missionária é o teto das obreiras
  const inicio = Math.max(p.admissao + 366, p.nasc + Math.ceil(17 * 365.25) + 1, diaDe("1975-01-01"));
  const limite = BASE - 60;
  let minimo = 0;
  for (let i = 2; i <= alvo; i++) minimo += INTERSTICIO_ANOS[i] * 366;
  const folga = limite - inicio - minimo;
  if (folga < 0) return null;
  const w = Array.from({ length: alvo + 1 }, () => 0.2 + r.real());
  const s = w.reduce((a, b) => a + b, 0);
  let d = inicio + Math.floor((folga * w[0]) / s);
  const datas = [d];
  for (let i = 2; i <= alvo; i++) { d += INTERSTICIO_ANOS[i] * 366 + Math.floor((folga * w[i - 1]) / s); datas.push(d); }
  return datas;
}
function aplicarCarreira(p, datas, alvo) {
  p.cargo = ESCADA[alvo];
  p.carreira = datas.map((desde, k) => ({ cargo: ESCADA[k + 1], desde, ate: k + 1 < datas.length ? datas[k + 1] : null }));
}
function atribuirCargo(r, p) {
  if (p.status !== "ATIVO" || p.situacao === "CONGREGADO") { p.cargo = null; return; }
  p.cargo = "MEMBRO";
  if (p.situacao !== "EM_COMUNHAO" || p.idade < 18) return;
  const i = p.idade;
  let pesos;
  if (p.sexo === "M") {
    pesos = i < 25 ? [[0, 86], [1, 12], [2, 2]] : i < 35 ? [[0, 62], [1, 16], [2, 6], [3, 12], [4, 4]]
      : i < 50 ? [[0, 48], [1, 10], [2, 5], [3, 17], [4, 17], [5, 2.5], [6, 0.5]] : [[0, 45], [1, 7], [2, 4], [3, 17], [4, 22], [5, 4], [6, 1]];
  } else pesos = i < 25 ? [[0, 92], [1, 7], [2, 1]] : [[0, 82], [1, 11], [2, 7]];
  for (let alvo = r.pesos(pesos); alvo >= 1; alvo--) {
    const datas = planejarCarreira(r, p, alvo);
    if (datas) { aplicarCarreira(p, datas, alvo); return; }
  }
}
function departamentoDe(p) {
  if (p.status === "FALECIDO" || p.status === "DESLIGADO") return null;
  if (p.idade < 12) return "UCADESPA";
  const casado = p.estadoCivil === "CASADO" || p.estadoCivil === "UNIAO_ESTAVEL";
  if (p.idade < 18 || (p.idade < 30 && !casado)) return "UMADESPA";
  return p.sexo === "F" ? "USADESPA" : "UHADESPA";
}
function enderecoDe(p, bairros) {
  const b = bairros[p.casa.bairro];
  const rua = [p.casa.logradouro, p.casa.numero, p.casa.complemento].filter(Boolean).join(", ");
  return { linha: `${rua} — ${b.nome} — ${CIDADE}/${UF} — CEP ${b.cep}`.slice(0, 300), bairro: b };
}
const telefoneDe = (m) => { const s = String(m).padStart(8, "0"); return `(00) 9${s.slice(0, 4)}-${s.slice(4)}`; };
const emailDe = (p) => `${semAcento(p.primeiro)}.${semAcento(p.sobrenomes[p.sobrenomes.length - 1])}.${p.matricula}@example.org`;

// A tesouraria de UMA congregação (pura: só o modelo e a semente da congregação).
function gerarFinanceiro(c) {
  const r = criarRng(`fin:${c.i}`);
  const ativos = c.pessoas.filter((p) => p.status === "ATIVO" && p.idade >= 12).length;
  const dizimistas = c.pessoas.filter((p) => p.dizimista);
  const lancs = [];
  const domingos = [], quartas = [];
  for (let d = INICIO_FIN; d <= BASE; d++) { if (diaSemana(d) === 0) domingos.push(d); else if (diaSemana(d) === 3) quartas.push(d); }
  const fatorMes = (d) => { const m = Number(isoDe(d).slice(5, 7)); return m === 12 ? 1.25 : m === 1 ? 0.9 : 1; };
  const crescimento = (d) => 1 + 0.04 * ((d - INICIO_FIN) / 365);
  const forma = (prefPix) => {
    const f = prefPix ? r.pesos([["PIX", 90], ["MISTO", 3], ["DINHEIRO", 7]]) : r.pesos([["DINHEIRO", 85], ["PIX", 12], ["MISTO", 3]]);
    return f;
  };
  const novo = (dia, seq, dados) => lancs.push({ ...dados, dia, criadoEm: momento(dia, 22, Math.floor(seq / 60) % 60, seq % 60), ordem: lancs.length });
  // Ofertas de cada culto (domingo e quarta), com parte por PIX.
  const oferta = (dia, base, rotulo, seq) => {
    const valor = Math.max(1000, Math.round(base * fatorMes(dia) * crescimento(dia) * (0.75 + r.real() * 0.5) * 100 + r.int(0, 99)));
    const misto = r.chance(0.55);
    novo(dia, seq, { tipo: "OFERTA", valor, forma: misto ? "MISTO" : "DINHEIRO", valorPix: misto ? Math.round(valor * (0.2 + r.real() * 0.3)) : null, descricao: rotulo });
  };
  for (const d of domingos) oferta(d, ativos * 2.2, "Oferta do culto de domingo", 0);
  for (const d of quartas) oferta(d, ativos * 1.0, "Oferta do culto de quarta", 0);
  // Por mês: o culto de departamento (3º domingo) e, às vezes, a oferta de um visitante.
  for (const m of MESES) {
    const doMes = domingos.filter((d) => d >= m.inicio && d <= m.fim);
    if (doMes[2]) {
      oferta(doMes[2], ativos * 0.7, `Oferta do culto da ${r.pick(["União de Mocidade", "União de Senhoras", "União de Homens", "União de Crianças"])}`, 1);
      // "DEPARTAMENTO" (Entrada de Departamento): a categoria própria, OFERTA_CULTO_DEPARTAMENTO, tem 25 letras e LancamentosTesouraria.Tipo é NVARCHAR(20) —
      // o banco recusa (nem a tela consegue lançá-la hoje).
      lancs[lancs.length - 1].tipo = "DEPARTAMENTO";
    }
    if (doMes.length && r.chance(0.5)) {
      const valor = (r.int(2, 30) * 1000);
      novo(r.pick(doMes), 2, { tipo: "OFERTA", valor, forma: r.chance(0.5) ? "PIX" : "DINHEIRO", valorPix: null, nomeAvulso: `${r.pick(NOMES_M.concat(NOMES_F))} ${r.pick(SOBRENOMES)} (visitante)`, descricao: "Oferta de visitante" });
    }
  }
  // Dízimos: cada dizimista, no domingo do mês em que costuma entregar (regular: quase todo mês; irregular: metade dos meses).
  dizimistas.forEach((p, j) => {
    const z = p.dizimista;
    for (const m of MESES) {
      if (m.fim < z.desde) continue;
      if (!r.chance(z.regular ? 0.93 : 0.45)) continue;
      const doMes = domingos.filter((d) => d >= Math.max(m.inicio, z.desde) && d <= m.fim);
      if (!doMes.length) continue;
      const anos = Math.floor((m.inicio - INICIO_FIN) / 365);
      const total = Math.round(z.mensal * Math.pow(1.05, anos) * (z.regular ? 1 : 0.5 + r.real() * 0.5));
      const partes = z.regular && r.chance(0.15) && doMes.length >= 2 ? 2 : 1;
      const dias = partes === 2 ? [doMes[0], doMes[doMes.length - 1]] : [doMes[r.pesos([[0, 60], [Math.min(1, doMes.length - 1), 25], [doMes.length - 1, 15]])]];
      for (let k = 0; k < partes; k++) {
        const valor = partes === 2 ? (k === 0 ? Math.round(total / 2) : total - Math.round(total / 2)) : total;
        const f = forma(z.pix);
        novo(dias[k], 10 + j, { tipo: "DIZIMO", valor, forma: f, valorPix: f === "MISTO" ? Math.round(valor * (0.3 + r.real() * 0.4)) : null, dizimista: p });
      }
    }
  });
  // Folhas canceladas (lançado em duplicidade): ~0,3% dos dízimos ganham uma cópia cancelada logo depois.
  for (const l of lancs.slice()) {
    if (l.tipo === "DIZIMO" && r.chance(0.003)) {
      novo(l.dia, 0, { ...l, cancelado: true });
      lancs[lancs.length - 1].criadoEm = momento(l.dia, 23, r.int(0, 58), r.int(0, 59)); // depois do original; cancelado às 23:59
    }
  }
  // Termo nº: contínuo na congregação, na ordem do registro.
  lancs.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.ordem - b.ordem));
  lancs.forEach((l, i) => { l.termo = i + 1; l.mes = mesDe(l.dia); });

  // Conciliação do PIX em lote (último dia do mês, antes do fechamento) e fechamento de cada mês fechado.
  const conciliacoes = [], fechamentos = [];
  const fechados = MESES.filter((m) => !m.aberto);
  const ultimoFechado = fechados[fechados.length - 1].chave;
  const esperaLiberacao = r.chance(0.6);
  for (const m of fechados) {
    const doMes = lancs.filter((l) => l.mes === m.chave);
    const pix = doMes.filter((l) => !l.cancelado && (l.forma === "PIX" || l.forma === "MISTO"));
    if (pix.length) {
      conciliacoes.push({ mes: m.chave, valorTotal: pix.reduce((s, l) => s + (l.forma === "PIX" ? l.valor : l.valorPix), 0), criadoEm: momento(m.fim, 23, 10) });
      for (const l of pix) l.conciliado = true;
    }
    const totalCent = doMes.filter((l) => !l.cancelado).reduce((s, l) => s + l.valor, 0);
    if (!doMes.length) continue;
    const calc = calcularFechamento({ totalRecebido: totalCent / 100, valorAluguel: c.aluguel / 100, valorLote: c.lote / 100, percentualRetencao: 40 });
    const diaFech = m.fim + r.int(2, 5);
    const repassado = !(m.chave === ultimoFechado && esperaLiberacao);
    const diaRep = diaFech + r.int(1, 6);
    fechamentos.push({
      mes: m.chave, totalRecebido: totalCent, ...calc, dataFechamento: momento(diaFech, 21, r.int(0, 59)),
      repassado, dataRepasse: repassado ? momento(diaRep, 15, r.int(0, 59)) : null, diaRepasse: repassado ? diaRep : null,
      formaRepasse: repassado ? r.pick(["PIX", "DEPOSITO"]) : null
    });
    for (const l of doMes) l.fechado = true;
  }

  // Saídas locais (Contas a Pagar), pagas só até o saldo local já liberado (ValorRetidoLocal dos fechamentos REPASSADOS antes do pagamento).
  const escala = Math.max(0.6, Math.min(3, ativos / 90));
  const CONTAS = [
    { forn: 0, tipo: "MANUTENCAO", desc: "Conta de energia", min: 150, max: 420, p: 1 },
    { forn: 1, tipo: "MANUTENCAO", desc: "Conta de água", min: 60, max: 160, p: 1 },
    { forn: 2, tipo: "MANUTENCAO", desc: "Material de limpeza", min: 80, max: 260, p: 0.6 },
    { forn: 3, tipo: "CULTO_EVENTO", desc: "Pão e suco da Santa Ceia", min: 50, max: 140, p: 1 },
    { forn: 4, tipo: "MANUTENCAO", desc: "Manutenção do som", min: 120, max: 480, p: 0.12 },
    { forn: 5, tipo: "MANUTENCAO", desc: "Material de construção (reparos)", min: 150, max: 700, p: 0.18 },
    { forn: 6, tipo: "CULTO_EVENTO", desc: "Material de papelaria", min: 40, max: 160, p: 0.25 },
    { forn: 7, tipo: "MANUTENCAO", desc: "Internet do templo", min: 99, max: 99, p: c.alvo >= 80 ? 1 : 0 },
    { forn: 8, tipo: "CULTO_EVENTO", desc: "Flores e decoração", min: 80, max: 300, p: 0.1 },
    { forn: 9, tipo: "CULTO_EVENTO", desc: "Impressão de folhetos", min: 60, max: 250, p: 0.15 }
  ];
  const repasses = fechamentos.filter((f) => f.repassado).map((f) => ({ dia: f.diaRepasse, valor: Math.round(f.valorRetidoLocal * 100) })).sort((a, b) => a.dia - b.dia);
  const liberadoAte = (dia) => repasses.filter((x) => x.dia < dia).reduce((s, x) => s + x.valor, 0);
  const saidas = [];
  let pago = 0;
  for (const m of MESES.slice(1)) {
    for (const conta of CONTAS) {
      if (!r.chance(conta.p)) continue;
      const valor = Math.round((conta.min + r.real() * (conta.max - conta.min)) * (conta.min === conta.max ? 1 : escala) * 100);
      if (valor >= 100000) continue; // abaixo de R$ 1.000: sem as 3 cotações (Reg. Art. 62), alçada da congregação
      const dia = m.aberto ? m.inicio + r.int(0, Math.max(0, BASE - m.inicio)) : m.inicio + r.int(8, 20);
      if (m.aberto) {
        // o mês da data-base: a fila de aprovação (a aprovação, 25 h depois da solicitação, nunca depois da data-base)
        saidas.push({ conta, valor, solicitado: momento(dia, 13, r.int(0, 59)), status: dia <= BASE - 2 && r.chance(0.4) ? "APROVADA" : "PENDENTE", pago: null });
        continue;
      }
      const diaPago = dia + r.int(2, 4);
      if (pago + valor > liberadoAte(diaPago)) continue;
      pago += valor;
      saidas.push({ conta, valor, solicitado: momento(dia, 13, r.int(0, 59)), status: "PAGA", pago: momento(diaPago, 16, r.int(0, 59)) });
    }
  }
  return { lancs, conciliacoes, fechamentos, saidas };
}

const FORNECEDORES = [
  ["Energia Exemplo Distribuidora", "energia"], ["Saneamento Exemplo", "agua"], ["Limpeza Total Comércio", "limpeza"], ["Panificadora Pão Nosso", "padaria"],
  ["Som e Luz Manutenção", "som"], ["Rocha Materiais de Construção", "construcao"], ["Papelaria Boa Nova", "papelaria"], ["Exemplo Telecom Internet", "internet"],
  ["Lírio Flores e Decoração", "flores"], ["Gráfica Luz do Mundo", "grafica"]
].map(([nome, chave], i) => ({ i, nome: `${nome}${SUF_M}`, chave, cnpj: `${CNPJ_PREFIXO}${1001 + i}-00` }));

// A EBD de uma congregação (pura): turmas por faixa etária, alunos (membros), professores, lições, chamadas, ofertas, cadernetas.
const TURMAS_EBD = [
  { nome: "Berçário e Maternal", faixa: "0 a 3 anos", min: 0, max: 3, menores: true },
  { nome: "Jardim de Infância", faixa: "4 a 6 anos", min: 4, max: 6, menores: true },
  { nome: "Primários", faixa: "7 a 8 anos", min: 7, max: 8, menores: true },
  { nome: "Juniores", faixa: "9 a 11 anos", min: 9, max: 11, menores: true },
  { nome: "Adolescentes", faixa: "12 a 14 anos", min: 12, max: 14, menores: true },
  { nome: "Juvenis", faixa: "15 a 17 anos", min: 15, max: 17, menores: true },
  { nome: "Jovens", faixa: "18 a 29 anos", min: 18, max: 29, menores: false },
  { nome: "Adultos", faixa: "30 a 59 anos", min: 30, max: 59, menores: false },
  { nome: "Melhor Idade", faixa: "60 anos ou mais", min: 60, max: 200, menores: false }
];
function gerarEbd(c) {
  const r = criarRng(`ebd:${c.i}`);
  const vivos = c.pessoas.filter((p) => p.status === "ATIVO");
  const pequena = c.pessoas.length < 80;
  // Congregação pequena junta as turmas infantis e as de adultos (menos turmas, como na vida real).
  const turmas = (pequena ? [
    { nome: "Crianças", faixa: "0 a 11 anos", min: 0, max: 11, menores: true }, { nome: "Adolescentes e Juvenis", faixa: "12 a 17 anos", min: 12, max: 17, menores: true },
    { nome: "Jovens", faixa: "18 a 29 anos", min: 18, max: 29, menores: false }, { nome: "Adultos", faixa: "30 anos ou mais", min: 30, max: 200, menores: false }
  ] : TURMAS_EBD).map((t) => ({ ...t, alunos: [], professores: [] }));
  const turmaDe = (p) => turmas.find((t) => p.idade >= t.min && p.idade <= t.max);
  // Professores: adultos em comunhão (de preferência com cargo), 1 ou 2 por turma; um professor não é aluno.
  const professores = new Set();
  for (const t of turmas) {
    const cands = vivos.filter((p) => p.situacao === "EM_COMUNHAO" && p.idade >= 21 && p.idade <= 70 && !professores.has(p) && !p.lider);
    const qtd = pequena ? 1 : (t.max - t.min >= 10 || t.min >= 18 ? 2 : 1);
    for (let j = 0; j < qtd && cands.length; j++) {
      const comCargo = cands.filter((p) => !professores.has(p) && (p.cargo && p.cargo !== "MEMBRO"));
      const pool = (comCargo.length && r.chance(0.6) ? comCargo : cands.filter((p) => !professores.has(p)));
      if (!pool.length) break;
      const prof = r.pick(pool);
      professores.add(prof);
      t.professores.push({ pessoa: prof, principal: j === 0 });
    }
  }
  // Alunos: ~60% dos vivos ativos (crianças de família na igreja quase todas), cada um com a sua assiduidade.
  for (const p of vivos) {
    if (professores.has(p)) continue;
    const t = turmaDe(p);
    if (!t) continue;
    if (!r.chance(p.idade < 12 ? 0.85 : p.idade < 18 ? 0.7 : 0.5)) continue;
    t.alunos.push({ pessoa: p, assiduidade: r.pesos([[0.92, 45], [0.75, 30], [0.5, 15], [0.2, 10]]) });
  }
  // Lições: os últimos EBD_DOMINGOS domingos até a data-base, todas fechadas (a da data-base também: a aula já aconteceu).
  const domingos = [];
  for (let d = BASE; domingos.length < EBD_DOMINGOS; d--) if (diaSemana(d) === 0) domingos.unshift(d);
  const licoes = domingos.map((d, n) => {
    const chamadas = [];
    const cadernetas = [];
    let ofertaCent = 0;
    for (const t of turmas) {
      let presentes = 0, ausentes = 0, visitantes = 0;
      for (const a of t.alunos) {
        const presente = r.chance(a.assiduidade);
        chamadas.push({ turma: t, aluno: a, status: presente ? "PRESENTE" : "AUSENTE" });
        if (presente) presentes++; else ausentes++;
      }
      if (r.chance(0.25)) { chamadas.push({ turma: t, visitante: `${r.pick(NOMES_M.concat(NOMES_F))} ${r.pick(SOBRENOMES)} (visitante)`, status: "VISITANTE" }); visitantes++; }
      ofertaCent += presentes * r.int(80, 350);
      cadernetas.push({ turma: t, biblias: Math.max(0, presentes - r.int(0, Math.ceil(presentes / 4))), revistas: Math.max(0, presentes - r.int(0, Math.ceil(presentes / 3))), matriculados: t.alunos.length });
    }
    return { dia: d, n, chamadas, cadernetas, oferta: ofertaCent, titulo: `Lição ${(n % 13) + 1}: ${r.pick(TEMAS_LICAO)}` };
  });
  return { turmas, licoes };
}
// As escalas de uma congregação (pura): equipes só de ADULTOS e sem a marca de menores (assim nenhuma regra de adesão do menor nem de aptidão da v7.7 entra em
// jogo — a marca é decisão da liderança na tela), e os cultos de domingo das 8 semanas antes da data-base (confirmados, com alguma recusa e o convite seguinte)
// e das 4 depois (convidados ou aceitos).
const EQUIPES_ESCALA = [["Recepção e Portaria", "PORTARIA"], ["Louvor e Liturgia", "LITURGIA"], ["Limpeza do Templo", "ZELADORIA"], ["Cozinha e Cantina", "COZINHA"]];
function gerarEscalas(c) {
  const r = criarRng(`escalas:${c.i}`);
  const livres = c.pessoas.filter((p) => p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && p.idade >= 18 && p.idade <= 72);
  const usados = new Set();
  const equipes = [];
  for (const [nome, natureza] of EQUIPES_ESCALA.slice(0, c.pessoas.length >= 60 ? 4 : 2)) {
    const tam = Math.min(r.int(4, 8), livres.length - usados.size);
    if (tam < 2) break;
    const membros = [];
    while (membros.length < tam) {
      const p = r.pick(livres);
      if (usados.has(p)) continue;
      usados.add(p);
      membros.push({ pessoa: p, frequencia: r.pick([14, 30, 30, 30, 60]) });
    }
    equipes.push({ nome, natureza, membros, lider: membros[0].pessoa });
  }
  const servicos = [];
  let primeiro = BASE - 7 * 8;
  while (diaSemana(primeiro) !== 0) primeiro++;
  for (let d = primeiro; d <= BASE + 7 * 4; d += 7) {
    const publicada = Math.min(d - 10, BASE - 1);
    const passado = d <= BASE;
    const alocs = [];
    for (const e of equipes) {
      const vez = Math.round((d - primeiro) / 7);
      for (let j = 0; j < Math.min(2, e.membros.length); j++) {
        const m = e.membros[(vez * 2 + j) % e.membros.length].pessoa;
        if (passado && r.chance(0.08) && e.membros.length > 3) {
          // recusou: a cadeia convida o seguinte, que confirma
          alocs.push({ equipe: e, pessoa: m, status: "RECUSADO", ordem: 1, respondido: publicada + 1 });
          const subst = e.membros[(vez * 2 + j + 2) % e.membros.length].pessoa;
          alocs.push({ equipe: e, pessoa: subst, status: "CONFIRMADO", ordem: 2, convidado: publicada + 1, respondido: publicada + 2, confirmado: d - 2 });
        } else if (passado) alocs.push({ equipe: e, pessoa: m, status: "CONFIRMADO", ordem: 1, respondido: publicada + 1, confirmado: d - 2 });
        else alocs.push({ equipe: e, pessoa: m, status: r.chance(0.5) ? "ACEITO" : "CONVIDADO", ordem: 1, respondido: null });
      }
    }
    // a mesma pessoa não serve duas vezes no mesmo culto pela mesma equipe (índice único): a substituta pode já estar na escala
    const vistos = new Set();
    servicos.push({ dia: d, publicada, alocs: alocs.filter((a) => { const k = `${a.equipe.nome}:${a.pessoa.matricula}`; if (vistos.has(k)) return false; vistos.add(k); return true; }) });
  }
  return { equipes, servicos };
}

const TEMAS_LICAO = ["A fé que agrada a Deus", "O fruto do Espírito", "A oração do justo", "O amor ao próximo", "A Palavra como lâmpada", "Servir com alegria",
  "A família segundo a Bíblia", "Mordomia cristã", "O perdão", "A esperança da volta de Jesus", "Os dons espirituais", "A santificação", "O testemunho cristão"];
const REVISTAS_EBD = ["Berçário", "Maternal", "Jardim de Infância", "Primários", "Juniores", "Adolescentes", "Juvenis", "Jovens", "Adultos"];

// =========================================================================================================================================
// O BANCO
// =========================================================================================================================================
function recusar(msg, codigo = 2) { console.error(msg); process.exit(codigo); }
async function conectar() {
  if (process.env.E2E_LOCALDB === "1") {
    // Prova local: só pelo shim do equipamento (que fala com o LocalDB por uma ponte .NET) e só num LocalDB de verdade.
    if (typeof sql.__encerrar !== "function") recusar("TRAVA: E2E_LOCALDB=1 só vale pelo equipamento: cd tools/e2e-localdb && E2E_LOCALDB=1 node -r ./shim-mssql.js <script>. Nada feito.");
    const cs = process.env.E2E_CS || "";
    if (!/Server=\(localdb\)\\/i.test(cs)) recusar("TRAVA: E2E_LOCALDB=1, mas E2E_CS não aponta para um (localdb). Nada feito.");
    if (process.env.SQL_CONNECTION_STRING && !/\(localdb\)/i.test(process.env.SQL_CONNECTION_STRING)) recusar("TRAVA: E2E_LOCALDB=1 com SQL_CONNECTION_STRING apontando para fora do LocalDB. Nada feito.");
    const pool = await sql.connect(cs);
    const quem = (await pool.request().query("SELECT DB_NAME() AS banco, CAST(SERVERPROPERTY('IsLocalDB') AS int) AS localdb")).recordset[0];
    if (!quem || quem.localdb !== 1) { await pool.close(); recusar("TRAVA: a conexão não é um LocalDB. Nada feito."); }
    return { pool, banco: `${quem.banco} (LocalDB)` };
  }
  const conexao = process.env.SQL_CONNECTION_STRING;
  if (!conexao) recusar("Defina SQL_CONNECTION_STRING (a conexão do banco de HOMOLOGAÇÃO).", 1);
  const banco = (conexao.match(/(?:Initial Catalog|Database)=([^;]+)/i) || [])[1] || "";
  if (!/homolog/i.test(banco)) recusar(`TRAVA: o banco da conexão é "${banco || "?"}", não é de homologação. Nada feito.`);
  // Lotes grandes: 5 minutos por comando (o padrão do driver, 15 s, não basta para um bloco de mil linhas num banco que acabou de acordar).
  const pool = await sql.connect(/request timeout/i.test(conexao) ? conexao : `${conexao.replace(/;\s*$/, "")};Request Timeout=300000`);
  const real = (await pool.request().query("SELECT DB_NAME() AS banco")).recordset[0].banco;
  if (!/homolog/i.test(real || "")) { await pool.close(); recusar(`TRAVA: conectado em "${real}", que não é de homologação. Nada feito.`); }
  return { pool, banco: real };
}

// As marcas, em SQL (subconsultas) — usadas por --apagar e --contar.
const M_PESSOA = `BETWEEN ${MATRICULA_MIN} AND ${MATRICULA_MAX}`;
const Q_CONG = `SELECT CongregacaoId FROM dbo.Congregacoes WHERE Nome LIKE ${LIKE_F}`;
const Q_AREA = `SELECT AreaId FROM dbo.Areas WHERE Nome LIKE ${LIKE_F}`;
const Q_REG = `SELECT RegiaoId FROM dbo.Regioes WHERE Nome LIKE ${LIKE_F}`;
const Q_EXT = `SELECT ExtensaoId FROM dbo.ExtensoesTenda WHERE Nome LIKE ${LIKE_F}`;
const Q_FORN = `SELECT FornecedorId FROM dbo.Fornecedores WHERE CpfCnpj LIKE '${CNPJ_PREFIXO}%' AND Nome LIKE ${LIKE_M}`;
const Q_SAIDA = `SELECT SaidaId FROM dbo.SaidasTesouraria WHERE CongregacaoId IN (${Q_CONG}) OR FornecedorId IN (${Q_FORN})`;
const Q_TURMA = `SELECT TurmaId FROM dbo.EbdTurmas WHERE CongregacaoId IN (${Q_CONG})`;
const Q_LICAO = `SELECT LicaoId FROM dbo.EbdLicoes WHERE CongregacaoId IN (${Q_CONG})`;
const Q_ALUNO = `SELECT AlunoId FROM dbo.EbdAlunos WHERE TurmaId IN (${Q_TURMA})`;
const Q_EQUIPE = `SELECT EquipeId FROM dbo.EscalasEquipes WHERE CongregacaoId IN (${Q_CONG})`;
const Q_SERVICO = `SELECT ServicoId FROM dbo.EscalasServicos WHERE CongregacaoId IN (${Q_CONG})`;
// [tabela, condição] na ordem de APAGAR (filhos antes dos pais). --contar usa a mesma lista.
// Regra: sai o que pertence às peças fictícias (congregações, turmas, equipes, lições...) e o que é da PRÓPRIA ficha da pessoa fictícia (liderança, histórico do
// cargo, vínculos, rastros do login); uma linha que o app criou com a pessoa fictícia FORA das peças fictícias (um dízimo, um aluno, uma escala em outra
// congregação, uma reunião...) faz o --apagar recusar inteiro e dizer a tabela.
const ALVOS = [
  ["EscalasAlocacoes", `ServicoId IN (${Q_SERVICO}) OR EquipeId IN (${Q_EQUIPE})`],
  ["EscalasServicos", `CongregacaoId IN (${Q_CONG})`],
  ["EscalasEquipeMembros", `EquipeId IN (${Q_EQUIPE})`],
  ["EscalasEquipes", `CongregacaoId IN (${Q_CONG})`],
  ["EbdCadernetas", `LicaoId IN (${Q_LICAO}) OR TurmaId IN (${Q_TURMA})`],
  ["EbdOfertas", `LicaoId IN (${Q_LICAO})`],
  ["EbdChamadas", `LicaoId IN (${Q_LICAO}) OR TurmaId IN (${Q_TURMA}) OR AlunoId IN (${Q_ALUNO})`],
  ["EbdLicoes", `CongregacaoId IN (${Q_CONG})`],
  ["EbdAlunos", `TurmaId IN (${Q_TURMA})`],
  ["EbdTurmaProfessores", `TurmaId IN (${Q_TURMA})`],
  ["EbdTurmas", `CongregacaoId IN (${Q_CONG})`],
  ["EbdCatalogoRevistas", `Nome LIKE ${LIKE_F}`],
  ["SaidaAprovacoes", `SaidaId IN (${Q_SAIDA})`],
  ["SaidaCotacoes", `SaidaId IN (${Q_SAIDA})`],
  ["SaidasTesouraria", `CongregacaoId IN (${Q_CONG}) OR FornecedorId IN (${Q_FORN})`],
  ["LancamentosTesouraria", `CongregacaoId IN (${Q_CONG})`],
  ["ConciliacoesTesouraria", `CongregacaoId IN (${Q_CONG})`],
  ["FechamentosTesouraria", `CongregacaoId IN (${Q_CONG})`],
  ["Dizimistas", `CongregacaoId IN (${Q_CONG})`],
  ["Fornecedores", `FornecedorId IN (${Q_FORN})`],
  ["Lideranca", `MembroId ${M_PESSOA}`],
  ["ExtensaoEncarregados", `ExtensaoId IN (${Q_EXT})`],
  ["CargosMinisteriaisHistorico", `MembroId ${M_PESSOA}`],
  ["VinculosFamiliares", `MembroId ${M_PESSOA} OR MembroParenteId ${M_PESSOA}`],
  // rastros do login de quem "entrou como" um papel fictício na homologação
  ["SessoesAtivas", `MembroId ${M_PESSOA}`, true],
  ["AcessoTentativas", `MembroId ${M_PESSOA}`, true],
  ["MembroPins", `MembroId ${M_PESSOA} OR DefinidoPorMembroId ${M_PESSOA}`, true],
  ["CodigosAcessoMembro", `MembroId ${M_PESSOA}`, true],
  ["DesafiosWebAuthn", `MembroId ${M_PESSOA}`, true],
  ["ChavesAcesso", `MembroId ${M_PESSOA}`, true],
  ["Notificacoes", `DestinatarioMembroId ${M_PESSOA}`, true],
  ["NotificacaoPreferencias", `MembroId ${M_PESSOA}`, true],
  ["TermosAssinados", `MembroId ${M_PESSOA}`, true], // os termos que a liderança fictícia assina no primeiro acesso (POST /api/termos/{tipo})
  ["MembroReferencia", `MembroId ${M_PESSOA}`],
  ["OrgaosLocais", `(Nivel = 1 AND ReferenciaId IN (${Q_CONG})) OR (Nivel = 2 AND ReferenciaId IN (${Q_AREA})) OR (Nivel = 3 AND ReferenciaId IN (${Q_REG}))`],
  ["VinculoCongregacaoArea", `CongregacaoId IN (${Q_CONG}) OR AreaId IN (${Q_AREA})`],
  ["ExtensoesTenda", `ExtensaoId IN (${Q_EXT})`],
  ["Congregacoes", `CongregacaoId IN (${Q_CONG})`],
  ["Areas", `AreaId IN (${Q_AREA})`],
  ["Regioes", `RegiaoId IN (${Q_REG})`],
  ["Bairros", `Nome LIKE ${LIKE_M}`]
];
async function tabelasExistentes(pool) {
  return new Set((await pool.request().query("SELECT name FROM sys.tables")).recordset.map((x) => x.name));
}
async function contar(pool) {
  const existem = await tabelasExistentes(pool);
  const linhas = [];
  for (const [tabela, cond] of ALVOS.slice().reverse()) {
    if (!existem.has(tabela)) continue;
    const n = (await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.${tabela} WHERE ${cond}`)).recordset[0].n;
    linhas.push([tabela, n]);
  }
  return linhas;
}
async function apagar(pool) {
  const existem = await tabelasExistentes(pool);
  const feito = [];
  try {
    await emTransacao(pool, async (req) => {
      for (const [tabela, cond] of ALVOS) {
        if (!existem.has(tabela)) continue;
        // Em fatias (cada comando curto, longe do prazo do driver), todas na MESMA transação: ou sai tudo, ou nada. A pessoa é a mais cara (o banco confere
        // as ~400 chaves estrangeiras que apontam para MembroReferencia a cada linha).
        const fatia = tabela === "MembroReferencia" ? 1000 : 20000;
        const t0 = Date.now();
        let n = 0;
        for (;;) {
          const r = await req().query(`DELETE TOP (${fatia}) FROM dbo.${tabela} WHERE ${cond}`);
          const k = r.rowsAffected.reduce((s, x) => s + x, 0);
          n += k;
          if (k < fatia) break;
        }
        if (n) feito.push(`${tabela}: ${n}${Date.now() - t0 > 2000 ? ` (${((Date.now() - t0) / 1000).toFixed(0)} s)` : ""}`);
      }
    });
  } catch (e) {
    const m = /table "([^"]+)", column '([^']+)'/i.exec(e.message || "");
    console.error(`NADA FOI APAGADO (a transação foi desfeita): ${e.message}`);
    if (m) console.error(`→ a tabela ${m[1]} (coluna ${m[2]}) ainda aponta para dado fictício — algo foi criado pelo app com essas pessoas/congregações. Apague isso antes (ou deixe a massa como está).`);
    process.exitCode = 1;
    return null;
  }
  return feito;
}

// ------------------------------------------------------------------ etapas ------------------------------------------------------------------
async function etapaTerritorio(pool, mod) {
  const feito = [];
  await emTransacao(pool, async (req) => {
    const temBairro = new Set((await ler(req, `SELECT Nome FROM dbo.Bairros WHERE Nome LIKE ${LIKE_M} AND Ativo = 1`)).map((x) => x.Nome));
    const nb = await inserir(req, "Bairros", ["Nome", "Cidade", "UF", "Lat", "Lng"],
      mod.bairros.filter((b) => !temBairro.has(b.nome)).map((b) => [b.nome, CIDADE, UF, cru(b.lat.toFixed(6)), cru(b.lng.toFixed(6))]));
    if (nb) feito.push(`${nb} bairros`);
    const temReg = new Set((await ler(req, `SELECT Nome FROM dbo.Regioes WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const nr = await inserir(req, "Regioes", ["Nome", "Subsede", "Ativa"], mod.regioes.filter((x) => !temReg.has(x.nome)).map((x) => [x.nome, false, true]));
    if (nr) feito.push(`${nr} regiões`);
    const regId = new Map((await ler(req, `SELECT RegiaoId, Nome FROM dbo.Regioes WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.RegiaoId]));
    const temArea = new Set((await ler(req, `SELECT Nome FROM dbo.Areas WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const na = await inserir(req, "Areas", ["Nome", "Ativa", "AtivadaEm", "RegiaoId"],
      mod.areas.filter((a) => !temArea.has(a.nome)).map((a) => [a.nome, true, "2018-01-01", regId.get(mod.regioes[a.regiao].nome)]));
    if (na) feito.push(`${na} áreas`);
    const areaId = new Map((await ler(req, `SELECT AreaId, Nome FROM dbo.Areas WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.AreaId]));
    const temCong = new Set((await ler(req, `SELECT Nome FROM dbo.Congregacoes WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const nc = await inserir(req, "Congregacoes",
      ["Nome", "Ativa", "AreaId", "ValorAluguelMensal", "ValorLoteMensal", "Endereco", "Bairro", "Cidade", "Estado", "Cep", "Horarios", "Lat", "Lng", "FundacaoAno", "Categoria"],
      mod.congs.filter((c) => !temCong.has(c.nome)).map((c) => [c.nome, true, areaId.get(mod.areas[c.area].nome), c.aluguel ? reais(c.aluguel) : null, c.lote ? reais(c.lote) : null,
        c.endereco, mod.bairros[c.bairro].nome, CIDADE, UF, mod.bairros[c.bairro].cep, c.horarios, cru(c.lat.toFixed(6)), cru(c.lng.toFixed(6)), c.fundacao, "CONGREGACAO"]));
    if (nc) feito.push(`${nc} congregações`);
    const congId = new Map((await ler(req, `SELECT CongregacaoId, Nome FROM dbo.Congregacoes WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.CongregacaoId]));
    const comVinculo = new Set((await ler(req, `SELECT CongregacaoId FROM dbo.VinculoCongregacaoArea WHERE DataFim IS NULL AND CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
    const nv = await inserir(req, "VinculoCongregacaoArea", ["CongregacaoId", "AreaId", "DataInicio"],
      mod.congs.filter((c) => !comVinculo.has(congId.get(c.nome))).map((c) => [congId.get(c.nome), areaId.get(mod.areas[c.area].nome), `${Math.max(2018, c.fundacao)}-01-01`]));
    if (nv) feito.push(`${nv} vínculos congregação × área`);
    // Os órgãos que a tela de catálogos cria junto com a unidade (GestaoCatalogos::criarOrgaosAutomaticos).
    const orgaos = [];
    for (const c of mod.congs) orgaos.push(["JAI", `Junta de Articulação Institucional — ${c.nome}`, 1, congId.get(c.nome)]);
    for (const a of mod.areas) { orgaos.push(["JEA", `Junta Executiva de Área — ${a.nome}`, 2, areaId.get(a.nome)]); orgaos.push(["JUC", `Junta de Contas de Área — ${a.nome}`, 2, areaId.get(a.nome)]); }
    for (const g of mod.regioes) for (const [s, n] of [["CRA", "Conselho Regional de Administração"], ["TER", "Tribunal Eclesiástico Regional"], ["CRAF", "Conselho Regional de Auditoria e Fiscalização"]]) orgaos.push([s, `${n} — ${g.nome}`, 3, regId.get(g.nome)]);
    const temOrgao = new Set((await ler(req, "SELECT Nivel, ReferenciaId, Sigla FROM dbo.OrgaosLocais WHERE ReferenciaId IS NOT NULL")).map((x) => `${x.Nivel}:${x.ReferenciaId}:${x.Sigla}`));
    const no = await inserir(req, "OrgaosLocais", ["Sigla", "Nome", "Nivel", "ReferenciaId", "Ativo"], orgaos.filter((o) => !temOrgao.has(`${o[2]}:${o[3]}:${o[0]}`)).map((o) => [...o, true]));
    if (no) feito.push(`${no} órgãos locais`);
    const temExt = new Set((await ler(req, `SELECT Nome FROM dbo.ExtensoesTenda WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const ne = await inserir(req, "ExtensoesTenda", ["Nome", "CongregacaoMaeId", "Ativa", "Endereco", "Bairro", "Cidade", "UF", "AbertaEm", "Lat", "Lng"],
      mod.extensoes.filter((e) => !temExt.has(e.nome)).map((e) => [e.nome, congId.get(e.mae.nome), true, e.endereco, mod.bairros[e.bairro].nome, CIDADE, UF, isoDe(e.aberta), cru(e.lat.toFixed(6)), cru(e.lng.toFixed(6))]));
    if (ne) feito.push(`${ne} extensões`);
  });
  return feito;
}

async function mapas(pool) {
  const req = () => pool.request();
  const m = {
    cong: new Map((await ler(req, `SELECT CongregacaoId, Nome FROM dbo.Congregacoes WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.CongregacaoId])),
    area: new Map((await ler(req, `SELECT AreaId, Nome FROM dbo.Areas WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.AreaId])),
    regiao: new Map((await ler(req, `SELECT RegiaoId, Nome FROM dbo.Regioes WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.RegiaoId])),
    ext: new Map((await ler(req, `SELECT ExtensaoId, Nome FROM dbo.ExtensoesTenda WHERE Nome LIKE ${LIKE_F}`)).map((x) => [x.Nome, x.ExtensaoId])),
    bairro: new Map((await ler(req, `SELECT BairroId, Nome FROM dbo.Bairros WHERE Nome LIKE ${LIKE_M} AND Ativo = 1`)).map((x) => [x.Nome, x.BairroId])),
    depto: new Map((await ler(req, "SELECT DepartamentoId, Sigla FROM dbo.Departamentos")).map((x) => [x.Sigla, x.DepartamentoId])),
    papel: new Map((await ler(req, "SELECT PapelId, Nome FROM dbo.Papeis")).map((x) => [x.Nome, x.PapelId]))
  };
  return m;
}
function exigirTerritorio(mod, m) {
  const faltam = mod.congs.filter((c) => !m.cong.has(c.nome)).length + mod.extensoes.filter((e) => !m.ext.has(e.nome)).length + mod.bairros.filter((b) => !m.bairro.has(b.nome)).length;
  if (faltam) throw new Error(`faltam ${faltam} peças do território fictício: rode a etapa "territorio" antes`);
}

async function etapaMembros(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const feito = [];
  const existentes = new Set((await ler(() => pool.request(), `SELECT MembroId FROM dbo.MembroReferencia WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  const faltam = mod.pessoas.filter((p) => !existentes.has(p.matricula));
  const COLS = ["MembroId", "Nome", "CongregacaoId", "Status", "SituacaoMembro", "DataNascimento", "DataAdmissao", "DataBatismo", "FormaAdmissao", "IgrejaAnterior",
    "EstadoCivil", "Sexo", "Telefone", "Email", "DepartamentoId", "CargoMinisterial", "DizimistaFiel", "ExtensaoId", "DataSaida", "MotivoSaida", "DataAfastamento",
    "Endereco", "EnderecoLogradouro", "EnderecoNumero", "EnderecoComplemento", "EnderecoBairroId", "EnderecoCidade", "EnderecoUF", "EnderecoCep"];
  const linha = (p) => {
    const end = enderecoDe(p, mod.bairros);
    const depto = departamentoDe(p);
    const temContato = p.idade >= 13 && p.status !== "FALECIDO";
    return [p.matricula, p.nome, m.cong.get(p.cong.nome), p.status, p.situacao, isoDe(p.nasc), p.admissao ? isoDe(p.admissao) : null, p.batismo ? isoDe(p.batismo) : null,
      p.forma || null, p.igrejaAnterior || null, p.estadoCivil || null, p.sexo, temContato && (p.lider || (p.matricula % 100) < 85) ? telefoneDe(p.matricula) : null,
      temContato && !p.lider && p.idade >= 16 && (p.matricula % 100) < 55 ? emailDe(p) : null, depto ? m.depto.get(depto) || null : null, p.cargo,
      p.dizimistaFiel === undefined ? null : p.dizimistaFiel, p.extensao ? m.ext.get(p.extensao.nome) : null, p.saida ? isoDe(p.saida) : null, p.motivoSaida || null,
      p.afastamento ? isoDe(p.afastamento) : null, end.linha, p.casa.logradouro, p.casa.numero, p.casa.complemento, m.bairro.get(end.bairro.nome), CIDADE, UF, end.bairro.cep];
  };
  for (let i = 0; i < faltam.length; i += 500) {
    const bloco = faltam.slice(i, i + 500);
    await emTransacao(pool, (req) => inserir(req, "MembroReferencia", COLS, bloco.map(linha), 250));
  }
  if (faltam.length) feito.push(`${faltam.length} pessoas`);

  // Vínculos familiares: uma linha por par (o app recusa o par repetido em qualquer sentido). Responsável Legal fica 0: na tela, a marca vale para
  // "a outra pessoa" da linha, o contrário do sentido do rótulo "Pai/Mãe de" — a massa não força esse caso ambíguo.
  const tipos = new Map((await ler(() => pool.request(), "SELECT TipoVinculoId, Codigo FROM dbo.TiposVinculoFamiliar")).map((x) => [x.Codigo, x.TipoVinculoId]));
  const temPar = new Set((await ler(() => pool.request(), `SELECT MembroId, MembroParenteId FROM dbo.VinculosFamiliares WHERE MembroId ${M_PESSOA} OR MembroParenteId ${M_PESSOA}`))
    .flatMap((x) => [`${x.MembroId}:${x.MembroParenteId}`, `${x.MembroParenteId}:${x.MembroId}`]));
  const novos = mod.vinculos.filter((v) => tipos.has(v.tipo) && !temPar.has(`${v.a.matricula}:${v.b.matricula}`))
    .map((v) => [v.a.matricula, v.b.matricula, tipos.get(v.tipo), false, MATRICULA_MIN + 2]);
  for (let i = 0; i < novos.length; i += 2000) await emTransacao(pool, (req) => inserir(req, "VinculosFamiliares", ["MembroId", "MembroParenteId", "TipoVinculoId", "ResponsavelLegal", "CriadoPor"], novos.slice(i, i + 2000), 1000));
  if (novos.length) feito.push(`${novos.length} vínculos familiares`);

  // Histórico do cargo (a escada da v8.2): as linhas fechadas dos degraus de baixo e a aberta do cargo de hoje, como a 157 grava ("LEGADO").
  const comHist = new Set((await ler(() => pool.request(), `SELECT DISTINCT MembroId FROM dbo.CargosMinisteriaisHistorico WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  const hist = [];
  for (const p of mod.pessoas) {
    if (!p.carreira || comHist.has(p.matricula)) continue;
    for (const h of p.carreira) hist.push([p.matricula, h.cargo, isoDe(h.desde), h.ate ? isoDe(h.ate) : null, "LEGADO", "Massa fictícia de homologação (semear-homologacao-grande)."]);
  }
  for (let i = 0; i < hist.length; i += 2000) await emTransacao(pool, (req) => inserir(req, "CargosMinisteriaisHistorico", ["MembroId", "Cargo", "Desde", "Ate", "Origem", "Observacao"], hist.slice(i, i + 2000), 1000));
  if (hist.length) feito.push(`${hist.length} linhas de histórico de cargo`);
  return feito;
}

async function etapaLideranca(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const existentes = new Set((await ler(() => pool.request(), `SELECT MembroId FROM dbo.MembroReferencia WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  if (mod.lideres.some((p) => !existentes.has(p.matricula))) throw new Error('faltam pessoas fictícias: rode a etapa "membros" antes');
  const feito = [];
  const avisos = [];
  await emTransacao(pool, async (req) => {
    const temLid = new Set((await ler(req, `SELECT MembroId FROM dbo.Lideranca WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
    const linhas = [];
    for (const p of mod.lideres) {
      if (temLid.has(p.matricula)) continue;
      const papelId = m.papel.get(p.lider.papel);
      if (!papelId) { avisos.push(`papel "${p.lider.papel}" não existe neste banco: ${p.matricula} ficou sem login`); continue; }
      const e = p.lider.escopo;
      const escopoId = e.tipo === "CONGREGACAO" ? m.cong.get(e.cong.nome) : e.tipo === "AREA" ? m.area.get(e.area.nome) : e.tipo === "REGIAO" ? m.regiao.get(e.regiao.nome) : null;
      linhas.push([p.matricula, papelId, e.tipo, escopoId, hashSenha(SENHA)]);
    }
    const n = await inserir(req, "Lideranca", ["MembroId", "PapelId", "EscopoTipo", "EscopoId", "SenhaHash"], linhas);
    if (n) feito.push(`${n} lideranças com senha`);
    // Encarregado de cada Extensão da Tenda (um vigente por Extensão).
    const temEnc = new Set((await ler(req, `SELECT ExtensaoId FROM dbo.ExtensaoEncarregados WHERE Ate IS NULL AND ExtensaoId IN (${Q_EXT})`)).map((x) => x.ExtensaoId));
    const enc = mod.extensoes.filter((e) => e.encarregado && !temEnc.has(m.ext.get(e.nome)))
      .map((e) => [m.ext.get(e.nome), e.encarregado.pessoa.matricula, isoDe(e.encarregado.desde), MATRICULA_MIN + 2, momento(e.encarregado.desde, 15)]);
    const ne = await inserir(req, "ExtensaoEncarregados", ["ExtensaoId", "MembroId", "Desde", "RegistradoPor", "RegistradoEm"], enc);
    if (ne) feito.push(`${ne} encarregados de Extensão`);
  });
  for (const a of avisos) console.log(`  (aviso: ${a})`);
  return feito;
}

async function etapaFinanceiro(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const existentes = new Set((await ler(req0, `SELECT MembroId FROM dbo.MembroReferencia WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  if (mod.pessoas.some((p) => !existentes.has(p.matricula))) throw new Error('faltam pessoas fictícias: rode a etapa "membros" antes');
  const feito = [];
  // Dizimistas (um por pessoa, na congregação dela).
  const temDiz = new Set((await ler(req0, `SELECT MembroId FROM dbo.Dizimistas WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  const diz = mod.pessoas.filter((p) => p.dizimista && !temDiz.has(p.matricula)).map((p) => [m.cong.get(p.cong.nome), p.nome, p.matricula, true, momento(p.dizimista.desde, 12)]);
  if (diz.length) { await emTransacao(pool, (req) => inserir(req, "Dizimistas", ["CongregacaoId", "Nome", "MembroId", "Ativo", "CriadoEm"], diz, 1000)); feito.push(`${diz.length} dizimistas`); }
  // Fornecedores (cadastrados pela Secretaria Geral, dados bancários confirmados pelo Presidente: quem aprova as saídas — a Tesouraria Geral — não cadastrou nenhum).
  const temForn = new Set((await ler(req0, `SELECT CpfCnpj FROM dbo.Fornecedores WHERE CpfCnpj LIKE '${CNPJ_PREFIXO}%'`)).map((x) => x.CpfCnpj));
  const forn = FORNECEDORES.filter((f) => !temForn.has(f.cnpj)).map((f) => [f.nome, f.cnpj, "PJ", `(00) 3000-${String(1001 + f.i).slice(-4)}`, `contato.${f.chave}@example.org`,
    "Banco Exemplo (fictício)", "0001", `${10000 + f.i * 137}-${f.i % 10}`, "CORRENTE", true, MATRICULA_MIN + 1, momento(INICIO_FIN - 20, 14), true, MATRICULA_MIN + 2, momento(INICIO_FIN - 25, 13)]);
  if (forn.length) {
    await emTransacao(pool, (req) => inserir(req, "Fornecedores", ["Nome", "CpfCnpj", "Tipo", "Telefone", "Email", "Banco", "Agencia", "Conta", "TipoConta", "DadosBancariosConfirmados",
      "ConfirmadoPor", "ConfirmadoEm", "Ativo", "CriadoPor", "CriadoEm"], forn));
    feito.push(`${forn.length} fornecedores`);
  }
  const fornId = new Map((await ler(req0, `SELECT FornecedorId, CpfCnpj FROM dbo.Fornecedores WHERE CpfCnpj LIKE '${CNPJ_PREFIXO}%'`)).map((x) => [x.CpfCnpj, x.FornecedorId]));
  // Por congregação, numa transação: conciliações, fechamentos, lançamentos, saídas e aprovações. Congregação que já tem lançamento é pulada inteira.
  const comLanc = new Set((await ler(req0, `SELECT DISTINCT CongregacaoId FROM dbo.LancamentosTesouraria WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const tot = { lanc: 0, fech: 0, conc: 0, saidas: 0, cong: 0 };
  const tesGeral = MATRICULA_MIN + 3;
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    if (comLanc.has(cid)) continue;
    const tes = mod.lideres.find((p) => p.lider.papel === "Tesoureiro Local" && p.lider.escopo.cong === c);
    if (!tes) { console.log(`  (aviso: ${c.nome} sem tesoureiro local no modelo: tesouraria pulada)`); continue; }
    const fin = gerarFinanceiro(c);
    await emTransacao(pool, async (req) => {
      await inserir(req, "ConciliacoesTesouraria", ["CongregacaoId", "MesReferencia", "ValorTotal", "ComprovanteUrl", "CriadoPor", "CriadoEm"],
        fin.conciliacoes.map((x) => [cid, x.mes, reais(x.valorTotal), `homolog-ficticio-extrato-pix-${c.k}-${x.mes}.pdf`, tes.matricula, x.criadoEm]));
      await inserir(req, "FechamentosTesouraria", ["CongregacaoId", "MesReferencia", "TotalRecebido", "ValorAluguel", "ValorLote", "TotalFinal", "PercentualRetencaoLocal",
        "ValorRetidoLocal", "ValorRepasseGeral", "Status", "DataFechamento", "FechadoPor", "DataRepasse", "RepassadoPor", "FormaRepasse"],
        fin.fechamentos.map((f) => [cid, f.mes, reais(f.totalRecebido), reais(c.aluguel), reais(c.lote), cru(f.totalFinal.toFixed(2)), cru("40.00"), cru(f.valorRetidoLocal.toFixed(2)),
          cru(f.valorRepasseGeral.toFixed(2)), f.repassado ? "REPASSADO" : "FECHADO", f.dataFechamento, tes.matricula, f.dataRepasse, f.repassado ? tesGeral : null, f.formaRepasse]));
      const fechId = new Map((await ler(req, `SELECT FechamentoId, MesReferencia FROM dbo.FechamentosTesouraria WHERE CongregacaoId = ${cid}`)).map((x) => [x.MesReferencia, x.FechamentoId]));
      const concId = new Map((await ler(req, `SELECT ConciliacaoId, MesReferencia FROM dbo.ConciliacoesTesouraria WHERE CongregacaoId = ${cid}`)).map((x) => [x.MesReferencia, x.ConciliacaoId]));
      const dizId = new Map((await ler(req, `SELECT DizimistaId, MembroId FROM dbo.Dizimistas WHERE CongregacaoId = ${cid} AND MembroId IS NOT NULL`)).map((x) => [x.MembroId, x.DizimistaId]));
      await inserir(req, "LancamentosTesouraria", ["CongregacaoId", "DizimistaId", "NomeAvulso", "TermoNumero", "Tipo", "Descricao", "Valor", "FormaPagamento", "ValorPix",
        "MesReferencia", "FechamentoId", "RegistradoPor", "CriadoEm", "Status", "MotivoCancelamento", "CanceladoPor", "CanceladoEm", "ConciliacaoId", "Origem", "StatusConfirmacao"],
      fin.lancs.map((l) => [cid, l.dizimista ? dizId.get(l.dizimista.matricula) || null : null, l.dizimista ? null : l.nomeAvulso || null, l.termo, l.tipo, l.descricao || null,
        reais(l.valor), l.forma, l.valorPix ? reais(l.valorPix) : null, l.mes, l.fechado ? fechId.get(l.mes) || null : null, tes.matricula, l.criadoEm,
        l.cancelado ? "CANCELADO" : "ATIVO", l.cancelado ? "Lançado em duplicidade (dado fictício)." : null, l.cancelado ? tes.matricula : null,
        l.cancelado ? `${l.criadoEm.slice(0, 11)}23:59:00` : null, l.conciliado && !l.cancelado ? concId.get(l.mes) || null : null, "TESOUREIRO", "CONFIRMADO"]), 400);
      await inserir(req, "SaidasTesouraria", ["CongregacaoId", "FornecedorId", "Tipo", "Descricao", "Valor", "DocumentoFiscalUrl", "ComprovantePagamentoUrl", "Status",
        "SolicitadoPor", "SolicitadoEm", "PagoPor", "PagoEm"],
      fin.saidas.map((s, j) => [cid, fornId.get(FORNECEDORES[s.conta.forn].cnpj), s.conta.tipo, `${s.conta.desc} (${s.solicitado.slice(5, 7)}/${s.solicitado.slice(0, 4)})`, reais(s.valor),
        `homolog-ficticio-nota-${c.k}-${j + 1}.pdf`, s.status === "PAGA" ? `homolog-ficticio-pagamento-${c.k}-${j + 1}.pdf` : null, s.status, tes.matricula, s.solicitado,
        s.status === "PAGA" ? tes.matricula : null, s.pago]));
      // Aprovação da Tesouraria Geral (nunca quem solicitou): um dia depois da solicitação, antes do pagamento.
      await req().query(`INSERT INTO dbo.SaidaAprovacoes (SaidaId, AprovadoPor, AprovadoEm)
        SELECT SaidaId, ${tesGeral}, DATEADD(HOUR, 25, SolicitadoEm) FROM dbo.SaidasTesouraria WHERE CongregacaoId = ${cid} AND Status IN (N'APROVADA', N'PAGA')`);
    });
    tot.cong++; tot.lanc += fin.lancs.length; tot.fech += fin.fechamentos.length; tot.conc += fin.conciliacoes.length; tot.saidas += fin.saidas.length;
  }
  if (tot.cong) feito.push(`tesouraria de ${tot.cong} congregações: ${tot.lanc} lançamentos, ${tot.fech} fechamentos, ${tot.conc} conciliações PIX, ${tot.saidas} saídas`);
  return feito;
}

async function etapaEbd(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const existentes = new Set((await ler(req0, `SELECT MembroId FROM dbo.MembroReferencia WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  if (mod.pessoas.some((p) => !existentes.has(p.matricula))) throw new Error('faltam pessoas fictícias: rode a etapa "membros" antes');
  const feito = [];
  // Catálogo de revistas do trimestre da data-base (marcado com " (Fictícia)" no nome).
  const tri = `${ANO_BASE}-T${Math.ceil(MES_BASE / 3)}`;
  const temRev = new Set((await ler(req0, `SELECT Nome FROM dbo.EbdCatalogoRevistas WHERE Nome LIKE ${LIKE_F} AND Trimestre = N'${tri}'`)).map((x) => x.Nome));
  const revs = REVISTAS_EBD.map((n, i) => [`Revista ${n}${SUF_F}`, n, tri, reais(i < 6 ? 1290 : 1590), true, MATRICULA_MIN + 2]).filter((x) => !temRev.has(x[0]));
  if (revs.length) { await emTransacao(pool, (req) => inserir(req, "EbdCatalogoRevistas", ["Nome", "FaixaEtaria", "Trimestre", "PrecoUnitario", "Ativa", "CriadoPorMembroId"], revs)); feito.push(`${revs.length} revistas no catálogo`); }
  const comEbd = new Set((await ler(req0, `SELECT DISTINCT CongregacaoId FROM dbo.EbdTurmas WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const tot = { cong: 0, turmas: 0, alunos: 0, prof: 0, licoes: 0, chamadas: 0 };
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    if (comEbd.has(cid)) continue;
    const dir = mod.lideres.find((p) => p.lider.papel === "Dirigente de Congregação" && p.lider.escopo.cong === c);
    const quem = dir ? dir.matricula : MATRICULA_MIN + 2;
    const ebd = gerarEbd(c);
    await emTransacao(pool, async (req) => {
      const inicioEbd = ebd.licoes.length ? ebd.licoes[0].dia - 30 : BASE - 200;
      await inserir(req, "EbdTurmas", ["CongregacaoId", "Nome", "FaixaEtaria", "Ativa", "CriadoPorMembroId", "CriadoEm", "ContatoComMenores"],
        // ContatoComMenores = 0, como a turma nasce na tela: a marca é decisão da liderança e, com ela, só professor APTO (v7.7) age na turma (Trava 7-B).
        ebd.turmas.map((t) => [cid, t.nome, t.faixa, true, quem, momento(inicioEbd, 12), false]));
      const turmaId = new Map((await ler(req, `SELECT TurmaId, Nome FROM dbo.EbdTurmas WHERE CongregacaoId = ${cid}`)).map((x) => [x.Nome, x.TurmaId]));
      const profs = ebd.turmas.flatMap((t) => t.professores.map((p) => [turmaId.get(t.nome), p.pessoa.matricula, p.principal, true, quem, momento(inicioEbd, 12, 30)]));
      await inserir(req, "EbdTurmaProfessores", ["TurmaId", "MembroId", "Principal", "Ativo", "DesignadoPorMembroId", "DesignadoEm"], profs);
      const alunos = ebd.turmas.flatMap((t) => t.alunos.map((a) => [a.pessoa.matricula, turmaId.get(t.nome), `EBD-FICT-${a.pessoa.matricula}`, true, momento(inicioEbd, 13), quem]));
      await inserir(req, "EbdAlunos", ["MembroId", "TurmaId", "Matricula", "Ativo", "MatriculadoEm", "CriadoPorMembroId"], alunos, 1000);
      const alunoId = new Map((await ler(req, `SELECT AlunoId, MembroId FROM dbo.EbdAlunos WHERE TurmaId IN (SELECT TurmaId FROM dbo.EbdTurmas WHERE CongregacaoId = ${cid})`)).map((x) => [x.MembroId, x.AlunoId]));
      await inserir(req, "EbdLicoes", ["CongregacaoId", "Data", "Status", "AbertaPorMembroId", "AbertaEm", "FechadaPorMembroId", "FechadaEm", "Titulo"],
        ebd.licoes.map((l) => [cid, isoDe(l.dia), "FECHADA", quem, momento(l.dia, 11, 45), quem, momento(l.dia, 13, 50), l.titulo]));
      const licaoId = new Map((await ler(req, `SELECT LicaoId, CONVERT(char(10), Data, 23) AS Data FROM dbo.EbdLicoes WHERE CongregacaoId = ${cid}`)).map((x) => [x.Data, x.LicaoId]));
      const chamadas = [], ofertas = [], cadernetas = [];
      for (const l of ebd.licoes) {
        const lid = licaoId.get(isoDe(l.dia));
        for (const ch of l.chamadas) {
          chamadas.push(ch.aluno
            ? [lid, turmaId.get(ch.turma.nome), alunoId.get(ch.aluno.pessoa.matricula), null, ch.status, quem, momento(l.dia, 12, 30)]
            : [lid, turmaId.get(ch.turma.nome), null, ch.visitante, ch.status, quem, momento(l.dia, 12, 30)]);
        }
        ofertas.push([lid, reais(l.oferta), quem, momento(l.dia, 13, 40)]);
        for (const cd of l.cadernetas) cadernetas.push([lid, turmaId.get(cd.turma.nome), cd.biblias, cd.revistas, "SISTEMA", cd.matriculados, quem, momento(l.dia, 13, 45)]);
      }
      await inserir(req, "EbdChamadas", ["LicaoId", "TurmaId", "AlunoId", "VisitanteNome", "Status", "RegistradoPorMembroId", "RegistradoEm"], chamadas, 1000);
      await inserir(req, "EbdOfertas", ["LicaoId", "Valor", "RegistradoPorMembroId", "RegistradoEm"], ofertas, 1000);
      await inserir(req, "EbdCadernetas", ["LicaoId", "TurmaId", "Biblias", "Revistas", "Origem", "MatriculadosRegistrado", "RegistradoPorMembroId", "RegistradoEm"], cadernetas, 1000);
      tot.cong++; tot.turmas += ebd.turmas.length; tot.alunos += alunos.length; tot.prof += profs.length; tot.licoes += ebd.licoes.length; tot.chamadas += chamadas.length;
    });
  }
  if (tot.cong) feito.push(`EBD de ${tot.cong} congregações: ${tot.turmas} turmas, ${tot.alunos} alunos, ${tot.prof} professores, ${tot.licoes} lições, ${tot.chamadas} chamadas`);
  return feito;
}

async function etapaEscalas(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const existentes = new Set((await ler(req0, `SELECT MembroId FROM dbo.MembroReferencia WHERE MembroId ${M_PESSOA}`)).map((x) => x.MembroId));
  if (mod.pessoas.some((p) => !existentes.has(p.matricula))) throw new Error('faltam pessoas fictícias: rode a etapa "membros" antes');
  const comEscala = new Set((await ler(req0, `SELECT DISTINCT CongregacaoId FROM dbo.EscalasEquipes WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const tot = { cong: 0, equipes: 0, membros: 0, servicos: 0, alocacoes: 0 };
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    if (comEscala.has(cid)) continue;
    const dir = mod.lideres.find((p) => p.lider.papel === "Dirigente de Congregação" && p.lider.escopo.cong === c);
    const quem = dir ? dir.matricula : MATRICULA_MIN + 2;
    const esc = gerarEscalas(c);
    if (!esc.equipes.length) continue;
    await emTransacao(pool, async (req) => {
      const criada = momento(BASE - 120, 12);
      await inserir(req, "EscalasEquipes", ["Nome", "CongregacaoId", "LiderMembroId", "Ativa", "CriadaEm", "ContatoComMenores", "Natureza"],
        esc.equipes.map((e) => [e.nome, cid, e.lider.matricula, true, criada, false, e.natureza]));
      const eqId = new Map((await ler(req, `SELECT EquipeId, Nome FROM dbo.EscalasEquipes WHERE CongregacaoId = ${cid}`)).map((x) => [x.Nome, x.EquipeId]));
      const membros = esc.equipes.flatMap((e) => e.membros.map((x) => [eqId.get(e.nome), x.pessoa.matricula, x.frequencia, true, criada]));
      await inserir(req, "EscalasEquipeMembros", ["EquipeId", "MembroId", "FrequenciaPreferidaDias", "Ativo", "CriadoEm"], membros);
      await inserir(req, "EscalasServicos", ["CongregacaoId", "DataHora", "Descricao", "Status", "PublicadaEm", "PrazoConfirmacaoDias", "CriadoPorMembroId", "CriadoEm"],
        esc.servicos.map((s) => [cid, momento(s.dia, 21), "Culto de domingo", "PUBLICADA", momento(s.publicada, 20), 3, quem, momento(s.publicada - 2, 20)]));
      const svId = new Map((await ler(req, `SELECT ServicoId, CONVERT(char(10), DataHora, 23) AS Dia FROM dbo.EscalasServicos WHERE CongregacaoId = ${cid}`)).map((x) => [x.Dia, x.ServicoId]));
      const alocs = esc.servicos.flatMap((s) => s.alocs.map((a) => [svId.get(isoDe(s.dia)), eqId.get(a.equipe.nome), a.pessoa.matricula, a.status, a.ordem,
        momento(a.convidado || s.publicada, 20, 5), a.respondido ? momento(a.respondido, 18) : null, a.confirmado ? momento(a.confirmado, 18, 30) : null]));
      await inserir(req, "EscalasAlocacoes", ["ServicoId", "EquipeId", "MembroId", "Status", "OrdemConvite", "ConvidadoEm", "RespondidoEm", "ConfirmadoEm"], alocs, 1000);
      tot.cong++; tot.equipes += esc.equipes.length; tot.membros += membros.length; tot.servicos += esc.servicos.length; tot.alocacoes += alocs.length;
    });
  }
  return tot.cong ? [`escalas de ${tot.cong} congregações: ${tot.equipes} equipes, ${tot.membros} voluntários, ${tot.servicos} cultos, ${tot.alocacoes} convites`] : [];
}

// ------------------------------------------------------------------ principal ------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  const { pool, banco } = await conectar();
  try {
    if (opcao("contar", false)) {
      for (const [t, n] of await contar(pool)) console.log(`${t.padEnd(30)} ${n}`);
      return;
    }
    if (opcao("apagar", false)) {
      const feito = await apagar(pool);
      if (feito) console.log(feito.length ? `Apagado em "${banco}" (${((Date.now() - t0) / 1000).toFixed(1)} s): ${feito.join("; ")}.` : `Nada a apagar em "${banco}".`);
      return;
    }
    const pedidas = String(opcao("etapas", ETAPAS_TODAS.join(","))).split(",").map((s) => s.trim()).filter(Boolean);
    const invalidas = pedidas.filter((e) => !ETAPAS_TODAS.includes(e));
    if (invalidas.length) recusar(`Etapa(s) desconhecida(s): ${invalidas.join(", ")}. Use: ${ETAPAS_TODAS.join(", ")}.`, 1);
    const tm = Date.now();
    const mod = gerarModelo();
    console.log(`Modelo (semente ${SEMENTE}, data-base ${DATA_BASE}): ${mod.congs.length} congregações, ${mod.pessoas.length} pessoas, ${mod.vinculos.length} vínculos, ${mod.lideres.length} lideranças — ${((Date.now() - tm) / 1000).toFixed(1)} s`);
    const FUNCOES = { territorio: etapaTerritorio, membros: etapaMembros, lideranca: etapaLideranca, financeiro: etapaFinanceiro, ebd: etapaEbd, escalas: etapaEscalas };
    for (const etapa of ETAPAS_TODAS.filter((e) => pedidas.includes(e))) {
      const te = Date.now();
      const feito = await FUNCOES[etapa](pool, mod);
      console.log(`[${etapa}] ${feito.length ? feito.join("; ") : "nada a criar (já existia)"} — ${((Date.now() - te) / 1000).toFixed(1)} s`);
    }
    console.log(`Pronto em "${banco}" (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
    if (pedidas.includes("lideranca")) {
      console.log(`Logins de teste (senha ${process.env.SEED_SENHA ? "de SEED_SENHA" : "padrão do semeador pequeno"}; sem e-mail: entram só com a senha):`);
      const papeis = ["Presidente", "Secretário Geral", "Tesoureiro", "Superintendente Regional", "Pastor de Área"];
      for (const p of mod.lideres.filter((x) => papeis.includes(x.lider.papel))) {
        const e = p.lider.escopo;
        console.log(`  ${p.matricula}  ${p.lider.papel.padEnd(26)} ${e.tipo === "AREA" ? e.area.nome : e.tipo === "REGIAO" ? e.regiao.nome : "Geral"}`);
      }
      console.log(`  ${MATRICULA_MIN + 101}..${MATRICULA_MIN + 100 + mod.congs.length}  Dirigente de Congregação (k = 1 é a Sede)`);
      console.log(`  ${MATRICULA_MIN + 201}..${MATRICULA_MIN + 200 + mod.congs.length}  Tesoureiro Local`);
    }
  } finally {
    await pool.close();
  }
}

main().catch((e) => { console.error("ERRO na massa grande:", e.message); process.exit(1); });
