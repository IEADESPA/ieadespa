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
//   --etapas=a,b            só estas etapas, na ordem fixa: territorio, membros, lideranca, reunioes, financeiro, prestacoes, distritos,
//                           relatorios, psc, ebd, escalas, calendario, cuidado
//   --semente=N             semente do gerador pseudoaleatório (padrão 20261111): a MESMA semente gera a MESMA massa
//   --data-base=AAAA-MM-DD  o "hoje" da massa (padrão 2026-11-08, um domingo): idades, datas, o mês aberto da tesouraria e a EBD
//   --membros=N             tamanho aproximado da igreja (padrão 5000; mínimo 1500)
//   --meses=N               meses fechados da tesouraria antes do mês da data-base (padrão 36)
//   --ebd-domingos=N        domingos de chamada da EBD até a data-base (padrão 52)
//   SEED_SENHA              senha de todos os logins de teste (padrão: a mesma do semeador pequeno)
//   Para "atualizar" a massa para outra data: --apagar e rodar de novo com --data-base nova (rodar por cima só completa o que falta).
//
// TRAVA (igual à do semeador pequeno): só roda se o banco da conexão tem "homolog" no nome — conferido na cadeia de conexão E no
// DB_NAME() depois de conectar. A única exceção é E2E_LOCALDB=1 com o shim do equipamento (node -r ./shim-mssql.js), num LocalDB de
// verdade (SERVERPROPERTY('IsLocalDB') = 1): nunca a produção, onde todo dado é real e intocável (README, seção 2.4).
//
// MARCAS (o que --apagar reconhece; nada fora delas é tocado)
//   - pessoas: matrículas 700000 a 799999 (o semeador pequeno usa 900001+; o equipamento e2e, 1001 a 9999);
//   - território: Regiões, Áreas, Congregações e Extensões com o nome terminando em " (Fictícia)"; Bairros, Quadrantes e Distritos em " (Fictício)";
//   - fornecedores: CNPJ "99.999.999/xxxx-00" (dígito verificador inválido de propósito: nunca é empresa real) e nome em " (Fictício)";
//   - reuniões da CLI com " (Fictícia)" na descrição e todas as reuniões dos órgãos locais fictícios;
//   - o resto (lançamentos, fechamentos, saídas, relatórios, PSC, EBD, escalas, vínculos, liderança, assentos...) é achado pela peça fictícia
//     (congregação, turma, equipe, Distrito) ou, quando é da ficha da própria pessoa, pela matrícula fictícia;
//   - e-mails em @example.org (domínio reservado, RFC 2606: nenhum e-mail chega a ninguém) e telefones com DDD (00), que não existe.
//   Se o app foi usado na homologação com essas pessoas FORA das peças fictícias (um casamento, um aluno noutra congregação...), o --apagar
//   recusa INTEIRO (desfaz tudo) e diz a tabela que ainda aponta para elas: nada fica pela metade. Os rastros do login (sessões, tentativas,
//   chaves, PIN, avisos do sininho, os termos assinados no primeiro acesso) das matrículas fictícias são apagados junto; o AuditLog fica (não
//   tem chave para a pessoa e a trilha de auditoria não se apaga).
//
// O QUE CRIA (data-base 2026-11-08, padrão) — uma história com tendência, não ruído: cada congregação cresce, fica estável ou cai no seu
// ritmo (admissões, saídas, ofertas e dízimos acompanham), dezembro forte (13º), janeiro e julho fracos, e ~5% das pessoas se afastam aos
// poucos (presença na EBD, dízimo e escala minguando até sumir, ainda ATIVAS no cadastro: o padrão do alerta de evasão da v10.12).
//   territorio: 2 cidades, 3 Regiões, 9 Áreas, 45 Congregações (com a Sede), 2 Quadrantes, 1 Distrito (a Região Metropolitana na capital),
//      10 Extensões da Tenda, 48 Bairros e os órgãos automáticos (JAI, JEA/JUC, CRA/TER/CRAF, CEQ/CAQ, como a tela de catálogos faz);
//   membros: ~5.000 pessoas em famílias (cônjuge, pai/mãe e filhos, irmãos), 0 a 90 anos, situação, desligados, falecidos e inativos, batismo
//      e admissão coerentes (e nunca antes da fundação da congregação), endereço em linhas com bairro, departamento pela idade e cargo pela
//      escada do Art. 72 (obreira até Missionária), com o histórico do cargo respeitando o interstício;
//   lideranca: logins com senha (SEED_SENHA), todos sem e-mail: Presidente 700001, Secretário Geral 700002, Tesouraria Geral 700003,
//      Superintendentes Regionais 700011-700013, Pastores de Área 700021-700029, Pastor Distrital 700031, Tesoureiro de Distrito 700032,
//      Vice-Presidentes de Quadrante 700035-700036, Dirigente da congregação k = 700100+k e Tesoureiro Local = 700200+k (k = 1 é a Sede);
//      assentos da Diretoria (Presidente, 1º Vice, 1º Secretário, 1º Tesoureiro) e do Conselho Fiscal (700041-700043), encarregados das Extensões;
//   reunioes: a CLI todo mês (ordinária, encerrada, só faltas justificadas) e a JAI de cada congregação no último ano, com presenças;
//   financeiro: dizimistas (os que saíram, inativos), dízimos e ofertas de cada culto por 36 meses, Termo nº contínuo, PIX conciliado,
//      fechamentos como o FecharMesTesouraria (com o Distrito do repasse gravado desde o decreto) e liberados pela Tesouraria Geral, o mês da
//      data-base aberto; fornecedores e saídas locais aprovadas pela Geral (quem solicita nunca aprova) e pagas sem passar do saldo liberado;
//   prestacoes: a prestação de contas mensal (completa, com Ata de Pendência, ou faltando);
//   distritos: o decreto da CLI (período do dinheiro desde o mês do registro, CDE), o Dízimo Institucional de cada mês (10% do Total Final,
//      calculado do banco) e o balanço anual (devolvido e aprovado pelo Conselho Fiscal);
//   relatorios: 18 meses de relatórios dos departamentos (no prazo, atrasados, parados em rascunho ou faltando), com valores, trilha de
//      aprovação (congregação → Área → Geral) e o rateio congelado na aprovação geral;
//   psc: a avaliação do Programa de Saúde Congregacional do exercício (respostas pelo catálogo, esteira com segregação, nível pela Escada
//      Bloqueada de shared/psc.js);
//   ebd: revistas, turmas por faixa etária, alunos, professores, um ano de lições, chamadas, ofertas e cadernetas (turmas sem a marca "com menores");
//   escalas: equipes só de adultos, os domingos de 26 semanas antes a 4 depois da data-base (confirmados, recusas com o convite ao próximo, abertos).
// O lote é por transação: cada bloco de pessoas e cada congregação de cada etapa entra inteiro ou não entra.
//   calendario: 4 anos do calendário oficial (o ciclo da CLI e da Santa Ceia, batismos, assembleia, congressos, vigílias, cruzadas, eventos de
//      Área e de congregação, com deferidos, indeferidos, cancelados, absorvidos e propostas tardias; o ano seguinte em planejamento), presença dos
//      dirigentes na Ceia Geral, organizadores, convidados (ética e nada-consta), caixas de evento com lançamentos e destino do saldo; nada vai ao site;
//   cuidado: pedidos de oração (boletim, risco, o mural do site), a fila do cuidado (afastamento das pessoas que se afastam, visitantes, novos
//      convertidos, visitas, pós-internação), a história de cada item, notas pastorais e leituras.
// O lote é por transação: cada bloco de pessoas e cada congregação (ou ano) de cada etapa entra inteiro ou não entra.
//
// O QUE FICA PARA SEMPRE (o banco proíbe apagar — gatilhos): itens e eventos do cuidado pastoral (CuidadoItens, CuidadoEventos) e os pedidos de
// oração (PedidosOracao). O --apagar não falha por causa deles: deixa essas linhas e, pelas chaves estrangeiras, as peças fictícias de que elas
// dependem — as pessoas citadas (≈700), as congregações, Áreas, Regiões, Quadrantes, o Distrito, os Bairros e as Extensões. Também fica o ano do
// calendário em planejamento que a massa criou (sem marca possível). As notas pastorais saem (com a marca de purga do próprio app). Rodar de novo
// recria o resto em cima do que ficou, sem duplicar.
// Fica de fora (e por quê): ver HOMOLOGACAO.md, "Massa grande" (as etapas da segunda leva entram em partes).
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
const ETAPAS_TODAS = ["territorio", "membros", "lideranca", "reunioes", "financeiro", "prestacoes", "distritos", "relatorios", "psc", "ebd", "escalas", "calendario", "cuidado"];
const SEMENTE = String(opcao("semente", "20261111"));
const DATA_BASE = String(opcao("data-base", "2026-11-08"));
const TOTAL_MEMBROS = Math.max(1500, Number(opcao("membros", 5000)) || 5000);
const MESES_FECHADOS = Math.max(3, Math.min(60, Number(opcao("meses", 36)) || 36));
const EBD_DOMINGOS = Math.max(1, Math.min(104, Number(opcao("ebd-domingos", 52)) || 52));
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
// Bairros inventados da segunda cidade (a do Distrito): nenhum nome de bairro de verdade.
const BAIRROS_DISTRITO = ["Jardim das Mangueiras", "Vila do Açaí", "Parque Guajará", "Conjunto Maracajá", "Residencial Baía Azul", "Vila Marajoara", "Jardim Tapajós",
  "Parque das Garças", "Conjunto Bela Maré", "Vila Tucunaré", "Jardim Samaúma", "Residencial Rio Azul"];
const CONGREGACOES = ["Betel", "Betânia", "Canaã", "Monte Sinai", "Jerusalém", "Filadélfia", "Getsêmani", "Siloé", "Ebenézer", "Peniel", "Hebrom", "Monte Sião",
  "Jordão", "Galileia", "Belém", "Nazaré", "Emaús", "Gileade", "Monte Moriá", "Horebe", "Monte Carmelo", "Berseba", "Efraim", "Shalom", "Maranata", "Elim",
  "Reobote", "Antioquia", "Éfeso", "Corinto", "Tessalônica", "Bereia", "Esmirna", "Pérgamo", "Laodiceia", "Sardes", "Tiatira", "Filipos", "Colossos",
  "Monte Hermom", "Rocha Eterna", "Lírio dos Vales", "Rosa de Saron", "Alfa e Ômega"];
const EXTENSOES = ["Vale da Bênção", "Nova Vida", "Água Viva", "Pão da Vida", "Luz do Mundo", "Sal da Terra", "Fonte de Vida", "Boas Novas", "Semente", "Videira"];
// O território: 2 cidades, 3 Regiões, 2 Quadrantes e 1 Distrito (a Região Metropolitana, numa capital fora da sede: o gatilho do Art. 126-K §2º, a).
// Cidades com o centro aproximado (só para o mapa); a população da capital é um número redondo de referência, não um dado oficial.
const CIDADES = [
  { nome: "Parauapebas", uf: "PA", lat: -6.0675, lng: -49.9025, cep: (i) => `68515-${String(100 + i * 7).padStart(3, "0")}`, bairros: BAIRROS },
  { nome: "Belém", uf: "PA", lat: -1.4558, lng: -48.4902, cep: (i) => `66${String(100 + i * 9).padStart(3, "0")}-000`, bairros: BAIRROS_DISTRITO }
];
const DISTRITOS = [{ nome: "Distrito Metropolitano de Belém", cidade: 1, decretoCli: "2025-03-15", registradoEm: "2025-04-02", desdeMes: "2025-04" }];
const QUADRANTES = [["Quadrante Carajás", null, false], ["Quadrante Guajará", 0, true]]; // [nome, distrito, ativo] — o de Carajás segue latente (Regimento: nível 4)
const REGIOES = [["Região Norte", 0, 0], ["Região Sul", 0, 0], ["Região Metropolitana de Belém", 1, 1]]; // [nome, cidade, quadrante]
const AREAS = [["Área Norte I", 0], ["Área Norte II", 0], ["Área Norte III", 0], ["Área Sul I", 1], ["Área Sul II", 1], ["Área Sul III", 1],
  ["Área Belém Centro", 2], ["Área Belém Norte", 2], ["Área Belém Sul", 2]];
const CONGS_POR_AREA = [5, 6, 5, 6, 5, 6, 4, 3, 4]; // + a Sede, na Área Norte I = 45
const UF = "PA";
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
  const bairros = [];
  CIDADES.forEach((cid, ci) => cid.bairros.forEach((n, j) => bairros.push({
    i: bairros.length, cidade: ci, nomeCidade: cid.nome, nome: `${n}${SUF_M}`, cep: cid.cep(j),
    lat: arred6(cid.lat + (rT.real() - 0.5) * 0.09), lng: arred6(cid.lng + (rT.real() - 0.5) * 0.10)
  })));
  const bairrosDa = (ci) => bairros.filter((b) => b.cidade === ci);
  const distritos = DISTRITOS.map((d, i) => ({ i, ...d, nome: `${d.nome}${SUF_M}`, nomeCidade: CIDADES[d.cidade].nome }));
  const quadrantes = QUADRANTES.map(([n, dist, ativo], i) => ({ i, nome: `${n}${SUF_M}`, distrito: dist, ativo }));
  const regioes = REGIOES.map(([n, cidade, quad], i) => ({ i, nome: `${n}${SUF_F}`, cidade, quadrante: quad }));
  const areas = AREAS.map(([n, reg], i) => ({ i, nome: `${n}${SUF_F}`, regiao: reg, congs: [] }));
  const congs = [];
  const novaCong = (nome, area, sede) => {
    const cidade = regioes[areas[area].regiao].cidade;
    const doLugar = bairrosDa(cidade);
    const bairro = sede ? doLugar[0].i : rT.pick(doLugar).i;
    const noDistrito = distritos.find((d) => d.cidade === cidade) || null;
    // A tendência de cada congregação (crescendo, estável, caindo) e o seu ritmo ao ano: dá forma à história (admissões, saídas, ofertas, relatórios).
    const tendencia = sede ? "ESTAVEL" : noDistrito ? rT.pesos([["CRESCE", 70], ["ESTAVEL", 30]]) : rT.pesos([["CRESCE", 30], ["ESTAVEL", 45], ["CAI", 25]]);
    const taxa = tendencia === "CRESCE" ? 0.07 + rT.real() * 0.08 : tendencia === "CAI" ? -(0.06 + rT.real() * 0.06) : -0.02 + rT.real() * 0.05;
    const c = {
      i: congs.length, k: congs.length + 1, nome: `${nome}${SUF_F}`, area, sede, bairro, cidade, nomeCidade: CIDADES[cidade].nome, distrito: noDistrito,
      extensoes: [], pessoas: [], tendencia, taxa,
      // pontualidade nos relatórios dos departamentos: quem está caindo costuma atrasar mais
      pontualidade: tendencia === "CAI" ? rT.pesos([["RUIM", 50], ["MEDIA", 35], ["BOA", 15]]) : rT.pesos([["BOA", 55], ["MEDIA", 35], ["RUIM", 10]]),
      endereco: `${rT.pick(LOGRADOUROS)}, ${rT.int(10, 1999)}`,
      lat: arred6(bairros[bairro].lat + (rT.real() - 0.5) * 0.006), lng: arred6(bairros[bairro].lng + (rT.real() - 0.5) * 0.006),
      fundacao: sede ? 1972 : noDistrito ? rT.int(2012, 2022) : rT.int(1982, 2021),
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
    const bairro = rT.pick(bairrosDa(mae.cidade)).i;
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
  const apto = (p) => p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && !p.lider && !p.assento;
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
  // O Distrito (Pastor Distrital e Tesoureiro de Distrito, da cidade dele) e os Quadrantes (o Vice-Presidente de cada um).
  distritos.forEach((d) => {
    const doDist = regioes.filter((g) => g.cidade === d.cidade).flatMap((g) => areas.filter((a) => a.regiao === g.i)).flatMap(daArea);
    escolher(doDist, homem(40, 70), PASTOR, PASTOR, "Pastor Distrital", { tipo: "DISTRITO", distrito: d }, MATRICULA_MIN + 31 + d.i * 2);
    escolher(doDist, adulto(28, 65), 0, 0, "Tesoureiro de Distrito", { tipo: "DISTRITO", distrito: d }, MATRICULA_MIN + 32 + d.i * 2);
  });
  quadrantes.forEach((q, i) => {
    const doQuad = regioes.filter((g) => g.quadrante === q.i).flatMap((g) => areas.filter((a) => a.regiao === g.i)).flatMap(daArea);
    escolher(doQuad, homem(40, 72), PASTOR, PASTOR, "Vice-Presidente de Quadrante", { tipo: "QUADRANTE", quadrante: q }, MATRICULA_MIN + 35 + i);
  });
  // O Conselho Fiscal (o NIF, que analisa o balanço do Distrito): 3 titulares, oficiais de congregações diferentes, sem cargo na Diretoria (Estatuto Art. 43).
  const conselhoFiscal = [];
  for (const c of congs.slice(1)) {
    if (conselhoFiscal.length >= 3) break;
    const cand = c.pessoas.filter((p) => apto(p) && p.idade >= 35 && ["DIACONO", "PRESBITERO"].includes(p.cargo));
    if (!cand.length) continue;
    const p = rL.pick(cand);
    p.matricula = MATRICULA_MIN + 41 + conselhoFiscal.length;
    p.assento = { orgao: "CONSELHO_FISCAL", cargo: `TITULAR_${conselhoFiscal.length + 1}` };
    conselhoFiscal.push(p);
  }
  for (const c of congs) {
    const alvo = c.sede ? PASTOR : rL.pesos([[PRESBITERO, 60], [EVANGELISTA, 25], [PASTOR, 15]]);
    escolher(daCong(c), homem(32, 72), alvo, alvo, "Dirigente de Congregação", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 100 + c.k)
      || escolher(daCong(c), homem(25, 80), PRESBITERO, PRESBITERO, "Dirigente de Congregação", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 100 + c.k);
    escolher(daCong(c), adulto(25, 66), 0, 0, "Tesoureiro Local", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 200 + c.k)
      || escolher(daCong(c), adulto(18, 80), 0, 0, "Tesoureiro Local", { tipo: "CONGREGACAO", cong: c }, MATRICULA_MIN + 200 + c.k);
  }
  // Assentos da Diretoria Executiva (o Presidente em exercício é quem tem o assento PRESIDENTE: diretoria.js::ehPresidenteAtual).
  const lider = (papel, k = 0) => lideres.filter((p) => p.lider.papel === papel)[k];
  for (const [papel, k, cargo] of [["Presidente", 0, "PRESIDENTE"], ["Superintendente Regional", 0, "VICE_PRESIDENTE_1"], ["Secretário Geral", 0, "SECRETARIO_1"], ["Tesoureiro", 0, "TESOUREIRO_1"]]) {
    const p = lider(papel, k);
    if (p) p.assento = { orgao: "DIRETORIA_EXECUTIVA", cargo };
  }
  // Quem está se afastando aos poucos (o padrão que o alerta de evasão da v10.12 precisa achar): segue ATIVO no cadastro, mas a presença na EBD, o dízimo e a
  // escala vão minguando a partir de `inicio` até sumir em `duracao` dias. Mais comum na congregação que cai. Nunca a liderança.
  const rV = criarRng("evasao");
  for (const p of pessoas) {
    if (p.lider || p.assento || p.status !== "ATIVO" || p.situacao !== "EM_COMUNHAO" || p.idade < 16) continue;
    if (!rV.chance(p.cong.tendencia === "CAI" ? 0.09 : p.cong.tendencia === "CRESCE" ? 0.03 : 0.05)) continue;
    p.evasao = { inicio: BASE - rV.int(45, 330), duracao: rV.int(90, 210) };
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
  // Quem saiu (desligado ou falecido) também dizimava até sair: o cadastro de dizimista fica inativo e os lançamentos param na data da saída — é daí
  // que vem a queda da arrecadação na congregação que perde gente.
  for (const p of pessoas) {
    const saiu = (p.status === "DESLIGADO" || p.status === "FALECIDO") && p.admissao && p.saida && p.saida > INICIO_FIN;
    if (!saiu && (p.status !== "ATIVO" || p.situacao !== "EM_COMUNHAO" || p.idade < 18)) continue;
    if (saiu && idadeEm(p.nasc, p.saida) < 18) continue;
    if (!p.lider && !p.assento && !rD.chance(0.5)) continue;
    const renda = rD.pesos(RENDAS) * (0.9 + rD.real() * 0.25);
    p.dizimista = {
      regular: p.lider || p.assento ? true : rD.chance(0.75),
      mensal: Math.max(5000, Math.round(renda * 10)), // 10% da renda, em centavos
      pix: rD.chance(p.idade < 40 ? 0.7 : p.idade < 60 ? 0.5 : 0.25),
      desde: Math.max(INICIO_FIN, p.admissao || INICIO_FIN),
      ate: saiu ? p.saida : null,
      ativo: !saiu
    };
    if (!saiu) p.dizimistaFiel = p.evasao ? false : p.dizimista.regular;
  }
  return { bairros, distritos, quadrantes, regioes, areas, congs, extensoes, pessoas, vinculos, lideres, conselhoFiscal };
}

// Uma família (ou pessoa sozinha) na congregação c: mesmo endereço, sobrenomes que se herdam, vínculos.
function gerarFamilia(r, c, bairros, pessoas, vinculos) {
  const daCidade = bairros.filter((b) => b.cidade === c.cidade);
  const casa = {
    bairro: r.chance(0.55) ? c.bairro : r.pick(daCidade).i,
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
  // A tendência da congregação puxa as datas: a que cresce tem mais gente chegando nos últimos anos; a que cai, mais gente antiga. Ninguém entra antes
  // da fundação da congregação (quem é mais antigo que ela veio por carta de outra).
  const tend = p.cong.tendencia;
  const puxar = (a, b) => (b <= a ? a : a + Math.floor(Math.pow(r.real(), tend === "CRESCE" ? 0.55 : tend === "CAI" ? 1.7 : 1) * (b - a)));
  const fundada = diaDe(`${p.cong.fundacao}-01-01`);
  p.forma = forma;
  if (forma === "BATISMO") {
    p.batismo = puxar(Math.max(anoMin, fundada), BASE - 20);
    p.admissao = p.batismo;
  } else {
    p.batismo = entre(anoMin, BASE - 400);
    p.admissao = puxar(Math.max(p.batismo + 200, fundada), BASE - 20);
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
    } else if (r.chance(tend === "CAI" ? 0.07 : tend === "CRESCE" ? 0.015 : 0.025)) {
      // na congregação que cai, as saídas se concentram nos anos recentes
      p.status = "DESLIGADO"; p.situacao = "SEM_COMUNHAO"; p.saida = tend === "CAI" ? puxar(Math.max(desde, BASE - 3 * 365), BASE - 10) : entre(desde, BASE - 10);
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
  return { linha: `${rua} — ${b.nome} — ${b.nomeCidade}/${UF} — CEP ${b.cep}`.slice(0, 300), bairro: b };
}
// Quanto a pessoa ainda "está" na igreja no dia d: 1 antes de começar a se afastar, caindo até 0 (evasão aos poucos).
const atividade = (p, d) => (!p.evasao || d < p.evasao.inicio ? 1 : Math.max(0, 1 - (d - p.evasao.inicio) / p.evasao.duracao));
// Sazonalidade e tendência da arrecadação: dezembro forte, janeiro e julho (férias) fracos; a congregação cresce ou cai no seu ritmo ao ano.
const fatorMesAno = (d) => { const m = Number(isoDe(d).slice(5, 7)); return m === 12 ? 1.25 : m === 1 ? 0.9 : m === 7 ? 0.85 : m === 6 ? 0.95 : 1; };
const tendenciaEm = (c, d) => Math.pow(1 + c.taxa, (d - BASE) / 365);
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
  const fatorMes = fatorMesAno;
  // inflação (~4% ao ano) × a tendência da congregação (crescendo, estável ou caindo: a oferta acompanha o tamanho da igreja naquele dia)
  const crescimento = (d) => (1 + 0.04 * ((d - INICIO_FIN) / 365)) * tendenciaEm(c, d);
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
      if (z.ate && m.inicio >= z.ate) break; // saiu (desligado/falecido): os dízimos param ali
      // quem está se afastando dizima cada vez menos vezes e menos (atividade caindo até 0)
      const at = atividade(p, m.inicio);
      if (!r.chance((z.regular ? 0.93 : 0.45) * at)) continue;
      const doMes = domingos.filter((d) => d >= Math.max(m.inicio, z.desde) && d <= m.fim && (!z.ate || d < z.ate));
      if (!doMes.length) continue;
      // o valor de cada pessoa (regular ou não, e minguando se está se afastando); a curva do mês (inflação, 13º, tendência) vem na normalização abaixo
      const total = Math.round(z.mensal * (z.regular ? 1 : 0.5 + r.real() * 0.5) * (0.4 + 0.6 * at));
      const partes = z.regular && r.chance(0.15) && doMes.length >= 2 ? 2 : 1;
      const dias = partes === 2 ? [doMes[0], doMes[doMes.length - 1]] : [doMes[r.pesos([[0, 60], [Math.min(1, doMes.length - 1), 25], [doMes.length - 1, 15]])]];
      for (let k = 0; k < partes; k++) {
        const valor = partes === 2 ? (k === 0 ? Math.round(total / 2) : total - Math.round(total / 2)) : total;
        const f = forma(z.pix);
        novo(dias[k], 10 + j, { tipo: "DIZIMO", valor, forma: f, pixFrac: f === "MISTO" ? 0.3 + r.real() * 0.4 : null, dizimista: p });
      }
    }
  });
  // A curva da congregação no total do dízimo de cada mês: inflação (~5% ao ano), dezembro com o 13º, janeiro e julho fracos, e a TENDÊNCIA (crescendo,
  // estável ou caindo no seu ritmo). Sem isto as admissões dentro da janela faziam quase toda congregação "crescer". O nível dos últimos 12 meses fechados
  // fica o que as pessoas deram; os meses de antes se ajustam à curva — e quem se afasta continua minguando em relação aos outros.
  const curva = (mm) => (1 + 0.05 * ((mm.inicio - INICIO_FIN) / 365)) * (mm.mes === 12 ? 1.3 : mm.mes === 1 ? 0.92 : mm.mes === 7 ? 0.95 : 1) * tendenciaEm(c, mm.inicio);
  const somaDz = new Map();
  for (const l of lancs) if (l.tipo === "DIZIMO") somaDz.set(mesDe(l.dia), (somaDz.get(mesDe(l.dia)) || 0) + l.valor);
  const fechadosDz = MESES.filter((mm) => !mm.aberto && somaDz.get(mm.chave));
  const ult12 = fechadosDz.slice(-12);
  const K = ult12.reduce((s, mm) => s + somaDz.get(mm.chave), 0) / Math.max(1e-9, ult12.reduce((s, mm) => s + curva(mm), 0));
  const fatorDz = new Map(fechadosDz.map((mm) => [mm.chave, (K * curva(mm)) / somaDz.get(mm.chave)]));
  const ultimoFator = fechadosDz.length ? fatorDz.get(fechadosDz[fechadosDz.length - 1].chave) : 1;
  for (const l of lancs) {
    if (l.tipo !== "DIZIMO") continue;
    l.valor = Math.max(500, Math.round(l.valor * (fatorDz.get(mesDe(l.dia)) || ultimoFator)));
    l.valorPix = l.forma === "MISTO" ? Math.min(l.valor - 100, Math.max(100, Math.round(l.valor * l.pixFrac))) : null;
  }
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
    // No Distrito (desde o mês do decreto) o repasse vai para ele (RepasseDistritoId, gravado no fechamento como faz o FecharMesTesouraria) e o
    // tesoureiro fecha cedo: o Dízimo Institucional do mês vence no dia 5 do mês seguinte e só é calculado com todas as congregações fechadas.
    const noDistrito = !!(c.distrito && m.chave >= c.distrito.desdeMes);
    const diaFech = m.fim + (noDistrito ? r.int(1, 3) : r.int(2, 5));
    const repassado = !(m.chave === ultimoFechado && esperaLiberacao);
    const diaRep = diaFech + r.int(1, 6);
    fechamentos.push({
      mes: m.chave, totalRecebido: totalCent, ...calc, dataFechamento: momento(diaFech, 21, r.int(0, 59)),
      repassado, dataRepasse: repassado ? momento(diaRep, 15, r.int(0, 59)) : null, diaRepasse: repassado ? diaRep : null,
      formaRepasse: repassado ? r.pick(["PIX", "DEPOSITO"]) : null, distrito: noDistrito ? c.distrito : null
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
        const presente = r.chance(a.assiduidade * atividade(a.pessoa, d) * ([1, 7].includes(Number(isoDe(d).slice(5, 7))) ? 0.85 : 1));
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
  let primeiro = BASE - 7 * 26;
  while (diaSemana(primeiro) !== 0) primeiro++;
  for (let d = primeiro; d <= BASE + 7 * 4; d += 7) {
    const publicada = Math.min(d - 10, BASE - 1);
    const passado = d <= BASE;
    const alocs = [];
    for (const e of equipes) {
      const vez = Math.round((d - primeiro) / 7);
      for (let j = 0; j < Math.min(2, e.membros.length); j++) {
        const m = e.membros[(vez * 2 + j) % e.membros.length].pessoa;
        if (passado && (r.chance(0.08) || atividade(m, d) < 0.6) && e.membros.length > 3) {
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
const Q_DIST = `SELECT DistritoId FROM dbo.Distritos WHERE Nome LIKE ${LIKE_M}`;
const Q_QUAD = `SELECT QuadranteId FROM dbo.Quadrantes WHERE Nome LIKE ${LIKE_M}`;
const Q_REL = `SELECT RelatorioDepartamentalId FROM dbo.RelatoriosDepartamentais WHERE CongregacaoId IN (${Q_CONG})`;
// as reuniões: as da CLI com a marca no nome e TODAS as dos órgãos locais fictícios (JAI, JEA...: são peças fictícias)
const Q_SESSAO = `SELECT SessaoId FROM dbo.Sessoes WHERE (Descricao LIKE ${LIKE_F} AND OrgaoId IN (SELECT OrgaoId FROM dbo.Orgaos WHERE Sigla = N'CLI'))
  OR OrgaoLocalId IN (SELECT OrgaoLocalId FROM dbo.OrgaosLocais WHERE (Nivel = 1 AND ReferenciaId IN (${Q_CONG})) OR (Nivel = 2 AND ReferenciaId IN (${Q_AREA}))
    OR (Nivel = 3 AND ReferenciaId IN (${Q_REG})) OR (Nivel = 4 AND ReferenciaId IN (SELECT QuadranteId FROM dbo.Quadrantes WHERE Nome LIKE ${LIKE_M}))
    OR (Nivel = 5 AND ReferenciaId IN (SELECT DistritoId FROM dbo.Distritos WHERE Nome LIKE ${LIKE_M})))`;
// [tabela, condição] na ordem de APAGAR (filhos antes dos pais). --contar usa a mesma lista.
// Regra: sai o que pertence às peças fictícias (congregações, turmas, equipes, lições...) e o que é da PRÓPRIA ficha da pessoa fictícia (liderança, histórico do
// cargo, vínculos, rastros do login); uma linha que o app criou com a pessoa fictícia FORA das peças fictícias (um dízimo, um aluno, uma escala em outra
// congregação, uma reunião...) faz o --apagar recusar inteiro e dizer a tabela.
const Q_EVENTO = `SELECT EventoId FROM dbo.CalendarioEventos WHERE Titulo LIKE ${LIKE_M}`;
const Q_NOTA = `SELECT NotaId FROM dbo.NotasPastorais WHERE MembroId ${M_PESSOA} OR AutorMembroId ${M_PESSOA} OR ItemId IN (SELECT ItemId FROM dbo.CuidadoItens WHERE CongregacaoId IN (${Q_CONG}))`;
const PURGA = "EXEC sp_set_session_context N'cuidado_purga', 1; "; // a marca de sessão com que o próprio app apaga notas pastorais (gatilho TR_NotasPastorais_Imutavel)
// O que o banco proíbe apagar (gatilhos): FICA, e prende as peças fictícias de que depende (ver apagar()).
const PERMANENTES = [
  ["CuidadoItens", `CongregacaoId IN (${Q_CONG})`],
  ["CuidadoEventos", `ItemId IN (SELECT ItemId FROM dbo.CuidadoItens WHERE CongregacaoId IN (${Q_CONG}))`],
  ["PedidosOracao", `CongregacaoId IN (${Q_CONG}) OR (Origem = N'SITE' AND Texto LIKE N'%(pedido fictício do mural do site)%')`]
];
const ALVOS = [
  ["NotasPastoraisLeituras", `NotaId IN (${Q_NOTA}) OR MembroId ${M_PESSOA}`, false, PURGA],
  ["NotasPastorais", `NotaId IN (${Q_NOTA})`, false, PURGA],
  ["EventoCaixaDestinos", `EventoId IN (${Q_EVENTO})`],
  ["EventoCaixaLancamentos", `EventoId IN (${Q_EVENTO})`],
  ["EventoCaixas", `EventoId IN (${Q_EVENTO})`],
  ["EventoConvidados", `EventoId IN (${Q_EVENTO})`],
  ["EventoOrganizadores", `EventoId IN (${Q_EVENTO})`],
  ["CalendarioPresencasDirigente", `EventoId IN (${Q_EVENTO})`],
  ["CalendarioEventoAreas", `EventoId IN (${Q_EVENTO})`],
  ["CalendarioEventos", `EventoId IN (${Q_EVENTO})`],
  ["CalendarioAnos", `AtaReferencia LIKE ${LIKE_F} AND NOT EXISTS (SELECT 1 FROM dbo.CalendarioEventos ce WHERE ce.Ano = dbo.CalendarioAnos.Ano)`],
  ["PscRespostas", `AvaliacaoId IN (SELECT AvaliacaoId FROM dbo.PscAvaliacoes WHERE CongregacaoId IN (${Q_CONG}))`],
  ["PscReclassificacoes", `CongregacaoId IN (${Q_CONG})`],
  ["PscAvaliacoes", `CongregacaoId IN (${Q_CONG})`],
  ["PrestacoesContas", `CongregacaoId IN (${Q_CONG})`],
  ["AprovacoesRelatorioDepartamental", `RelatorioDepartamentalId IN (${Q_REL})`],
  ["ValoresCampoRelatorioDepartamental", `RelatorioDepartamentalId IN (${Q_REL})`],
  ["RelatoriosDepartamentais", `CongregacaoId IN (${Q_CONG})`],
  ["RepassesInstitucionais", `OrigemTipo = N'DISTRITO' AND OrigemId IN (${Q_DIST})`],
  ["DistritoBalancos", `DistritoId IN (${Q_DIST})`],
  ["DistritoIntervencoes", `DistritoId IN (${Q_DIST})`],
  ["DistritoPeriodos", `DistritoId IN (${Q_DIST})`],
  ["Presencas", `SessaoId IN (${Q_SESSAO})`],
  ["Sessoes", `SessaoId IN (${Q_SESSAO})`],
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
  ["Assentos", `MembroId ${M_PESSOA}`],
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
  ["OrgaosLocais", `(Nivel = 1 AND ReferenciaId IN (${Q_CONG})) OR (Nivel = 2 AND ReferenciaId IN (${Q_AREA})) OR (Nivel = 3 AND ReferenciaId IN (${Q_REG}))
    OR (Nivel = 4 AND ReferenciaId IN (${Q_QUAD})) OR (Nivel = 5 AND ReferenciaId IN (${Q_DIST}))`],
  ["VinculoCongregacaoArea", `CongregacaoId IN (${Q_CONG}) OR AreaId IN (${Q_AREA})`],
  ["ExtensoesTenda", `ExtensaoId IN (${Q_EXT})`],
  ["Congregacoes", `CongregacaoId IN (${Q_CONG})`],
  ["Areas", `AreaId IN (${Q_AREA})`],
  ["Regioes", `RegiaoId IN (${Q_REG})`],
  ["Quadrantes", `QuadranteId IN (${Q_QUAD})`],
  ["Distritos", `DistritoId IN (${Q_DIST})`],
  ["Bairros", `Nome LIKE ${LIKE_M}`]
];
async function tabelasExistentes(pool) {
  return new Set((await pool.request().query("SELECT name FROM sys.tables")).recordset.map((x) => x.name));
}
async function contar(pool) {
  const existem = await tabelasExistentes(pool);
  const linhas = [];
  for (const [tabela, cond] of PERMANENTES.concat(ALVOS.slice().reverse())) {
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
      // O que o banco proíbe apagar (gatilhos: itens e eventos do cuidado pastoral, pedidos de oração, vistorias...) FICA — e prende, para sempre, as
      // peças fictícias de que essas linhas dependem (a pessoa, a congregação, a área, o bairro...): o fecho é calculado pelas chaves estrangeiras do
      // próprio banco, a partir das linhas permanentes, subindo até não achar mais nada. Tudo o mais sai.
      const pks = new Map((await ler(req, `SELECT t.name AS t, c.name AS c FROM sys.tables t JOIN sys.indexes i ON i.object_id = t.object_id AND i.is_primary_key = 1
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
        WHERE (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = i.object_id AND x.index_id = i.index_id) = 1 AND TYPE_NAME(c.user_type_id) IN ('int', 'smallint')`)).map((x) => [x.t, x.c]));
      await req().query("IF OBJECT_ID('tempdb..#Fixos') IS NOT NULL DROP TABLE #Fixos; CREATE TABLE #Fixos (Tabela SYSNAME NOT NULL, Id INT NOT NULL, PRIMARY KEY (Tabela, Id));");
      for (const [tabela, cond] of PERMANENTES) {
        if (!existem.has(tabela) || !pks.has(tabela)) continue;
        await req().query(`INSERT INTO #Fixos (Tabela, Id) SELECT N'${tabela}', [${pks.get(tabela)}] FROM dbo.${tabela} WHERE ${cond}`);
      }
      const fks = await ler(req, `SELECT OBJECT_NAME(fc.parent_object_id) AS filho, COL_NAME(fc.parent_object_id, fc.parent_column_id) AS col, OBJECT_NAME(fc.referenced_object_id) AS pai
        FROM sys.foreign_key_columns fc WHERE (SELECT COUNT(*) FROM sys.foreign_key_columns x WHERE x.constraint_object_id = fc.constraint_object_id) = 1`);
      const alvosNomes = new Set(ALVOS.map((a) => a[0]));
      for (let volta = 0; volta < 12; volta++) {
        let novos = 0;
        for (const fk of fks) {
          if (!alvosNomes.has(fk.pai) || !pks.has(fk.filho) || !pks.has(fk.pai)) continue;
          const r = await req().query(`INSERT INTO #Fixos (Tabela, Id) SELECT DISTINCT N'${fk.pai}', c.[${fk.col}] FROM dbo.[${fk.filho}] c
            JOIN #Fixos f ON f.Tabela = N'${fk.filho}' AND f.Id = c.[${pks.get(fk.filho)}]
            WHERE c.[${fk.col}] IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #Fixos g WHERE g.Tabela = N'${fk.pai}' AND g.Id = c.[${fk.col}])`);
          novos += r.rowsAffected.reduce((s, x) => s + x, 0);
        }
        if (!novos) break;
      }
      const fixos = (await ler(req, "SELECT Tabela, COUNT(*) AS n FROM #Fixos GROUP BY Tabela ORDER BY Tabela")).map((x) => `${x.Tabela}: ${x.n}`);
      if (fixos.length) feito.push(`FICAM (o banco proíbe apagar, ou são peças de que isso depende) — ${fixos.join(", ")}`);
      for (const [tabela, condBase, , prefixo] of ALVOS) {
        if (!existem.has(tabela)) continue;
        const cond = pks.has(tabela) ? `(${condBase}) AND NOT EXISTS (SELECT 1 FROM #Fixos fx WHERE fx.Tabela = N'${tabela}' AND fx.Id = dbo.${tabela}.[${pks.get(tabela)}])` : condBase;
        // Em fatias (cada comando curto, longe do prazo do driver), todas na MESMA transação: ou sai tudo, ou nada. A pessoa é a mais cara (o banco confere
        // as ~400 chaves estrangeiras que apontam para MembroReferencia a cada linha).
        const fatia = tabela === "MembroReferencia" ? 1000 : 20000;
        const t0 = Date.now();
        let n = 0;
        for (;;) {
          const r = await req().query(`${prefixo || ""}DELETE TOP (${fatia}) FROM dbo.${tabela} WHERE ${cond}`);
          const k = r.rowsAffected.reduce((s, x) => s + x, 0);
          n += k;
          if (k < fatia) break;
        }
        if (n) feito.push(`${tabela}: ${n}${Date.now() - t0 > 2000 ? ` (${((Date.now() - t0) / 1000).toFixed(0)} s)` : ""}`);
      }
      await req().query("EXEC sp_set_session_context N'cuidado_purga', NULL; DROP TABLE #Fixos;");
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
      mod.bairros.filter((b) => !temBairro.has(b.nome)).map((b) => [b.nome, b.nomeCidade, UF, cru(b.lat.toFixed(6)), cru(b.lng.toFixed(6))]));
    if (nb) feito.push(`${nb} bairros`);
    // Distrito (nasce inativo: só o decreto da CLI, na etapa "distritos", o ativa — como a tela faz) e Quadrantes ligados a ele.
    const temDist = new Set((await ler(req, `SELECT Nome FROM dbo.Distritos WHERE Nome LIKE ${LIKE_M}`)).map((x) => x.Nome));
    const nd = await inserir(req, "Distritos", ["Nome", "Ativo"], mod.distritos.filter((d) => !temDist.has(d.nome)).map((d) => [d.nome, false]));
    if (nd) feito.push(`${nd} distrito`);
    const distId = new Map((await ler(req, `SELECT DistritoId, Nome FROM dbo.Distritos WHERE Nome LIKE ${LIKE_M}`)).map((x) => [x.Nome, x.DistritoId]));
    const temQuad = new Set((await ler(req, `SELECT Nome FROM dbo.Quadrantes WHERE Nome LIKE ${LIKE_M}`)).map((x) => x.Nome));
    const nq = await inserir(req, "Quadrantes", ["Nome", "Ativo", "DistritoId"], mod.quadrantes.filter((q) => !temQuad.has(q.nome))
      .map((q) => [q.nome, q.ativo, q.distrito === null ? null : distId.get(mod.distritos[q.distrito].nome)]));
    if (nq) feito.push(`${nq} quadrantes`);
    const quadId = new Map((await ler(req, `SELECT QuadranteId, Nome FROM dbo.Quadrantes WHERE Nome LIKE ${LIKE_M}`)).map((x) => [x.Nome, x.QuadranteId]));
    const temReg = new Set((await ler(req, `SELECT Nome FROM dbo.Regioes WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const nr = await inserir(req, "Regioes", ["Nome", "Subsede", "Ativa", "QuadranteId"],
      mod.regioes.filter((x) => !temReg.has(x.nome)).map((x) => [x.nome, x.cidade === 1, true, quadId.get(mod.quadrantes[x.quadrante].nome)]));
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
        c.endereco, mod.bairros[c.bairro].nome, c.nomeCidade, UF, mod.bairros[c.bairro].cep, c.horarios, cru(c.lat.toFixed(6)), cru(c.lng.toFixed(6)), c.fundacao, "CONGREGACAO"]));
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
    for (const q of mod.quadrantes) for (const [s, n] of [["CEQ", "Colegiado Estratégico de Quadrante"], ["CAQ", "Câmara de Arbitragem do Quadrante"]]) orgaos.push([s, `${n} — ${q.nome}`, 4, quadId.get(q.nome)]);
    const temOrgao = new Set((await ler(req, "SELECT Nivel, ReferenciaId, Sigla FROM dbo.OrgaosLocais WHERE ReferenciaId IS NOT NULL")).map((x) => `${x.Nivel}:${x.ReferenciaId}:${x.Sigla}`));
    const no = await inserir(req, "OrgaosLocais", ["Sigla", "Nome", "Nivel", "ReferenciaId", "Ativo"], orgaos.filter((o) => !temOrgao.has(`${o[2]}:${o[3]}:${o[0]}`)).map((o) => [...o, true]));
    if (no) feito.push(`${no} órgãos locais`);
    const temExt = new Set((await ler(req, `SELECT Nome FROM dbo.ExtensoesTenda WHERE Nome LIKE ${LIKE_F}`)).map((x) => x.Nome));
    const ne = await inserir(req, "ExtensoesTenda", ["Nome", "CongregacaoMaeId", "Ativa", "Endereco", "Bairro", "Cidade", "UF", "AbertaEm", "Lat", "Lng"],
      mod.extensoes.filter((e) => !temExt.has(e.nome)).map((e) => [e.nome, congId.get(e.mae.nome), true, e.endereco, mod.bairros[e.bairro].nome, e.mae.nomeCidade, UF, isoDe(e.aberta), cru(e.lat.toFixed(6)), cru(e.lng.toFixed(6))]));
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
    distrito: new Map((await ler(req, `SELECT DistritoId, Nome FROM dbo.Distritos WHERE Nome LIKE ${LIKE_M}`)).map((x) => [x.Nome, x.DistritoId])),
    quadrante: new Map((await ler(req, `SELECT QuadranteId, Nome FROM dbo.Quadrantes WHERE Nome LIKE ${LIKE_M}`)).map((x) => [x.Nome, x.QuadranteId])),
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
      p.afastamento ? isoDe(p.afastamento) : null, end.linha, p.casa.logradouro, p.casa.numero, p.casa.complemento, m.bairro.get(end.bairro.nome), end.bairro.nomeCidade, UF, end.bairro.cep];
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
      const escopoId = e.tipo === "CONGREGACAO" ? m.cong.get(e.cong.nome) : e.tipo === "AREA" ? m.area.get(e.area.nome) : e.tipo === "REGIAO" ? m.regiao.get(e.regiao.nome)
        : e.tipo === "DISTRITO" ? m.distrito.get(e.distrito.nome) : e.tipo === "QUADRANTE" ? m.quadrante.get(e.quadrante.nome) : null;
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
    // Assentos da Diretoria Executiva e do Conselho Fiscal (mandato 2023–2027). Assento já ocupado por outra pessoa (o índice único do cargo) fica como está:
    // a massa nunca tira ninguém de um assento.
    const orgaoId = new Map((await ler(req, "SELECT OrgaoId, Sigla FROM dbo.Orgaos")).map((x) => [x.Sigla, x.OrgaoId]));
    const ocupados = new Set((await ler(req, "SELECT OrgaoId, CargoOuFuncao, MembroId FROM dbo.Assentos WHERE DataFim IS NULL"))
      .flatMap((x) => [`${x.OrgaoId}:${x.CargoOuFuncao}`, `p:${x.MembroId}:${x.OrgaoId}`]));
    const assentos = [];
    for (const p of mod.pessoas.filter((x) => x.assento)) {
      const oid = orgaoId.get(p.assento.orgao);
      if (!oid || ocupados.has(`p:${p.matricula}:${oid}`)) continue;
      if (ocupados.has(`${oid}:${p.assento.cargo}`)) { avisos.push(`o assento ${p.assento.cargo} (${p.assento.orgao}) já tem titular: ${p.matricula} ficou sem ele`); continue; }
      assentos.push([oid, p.matricula, "FUNCAO", p.assento.cargo, "2023-01-15", "2027-01-14"]);
    }
    const na = await inserir(req, "Assentos", ["OrgaoId", "MembroId", "TipoAssento", "CargoOuFuncao", "DataInicio", "DataTerminoPrevisao"], assentos);
    if (na) feito.push(`${na} assentos (Diretoria e Conselho Fiscal)`);
  });
  for (const a of avisos) console.log(`  (aviso: ${a})`);
  return feito;
}

// ------------------------------------------------------------------ reuniões (CLI e JAI) ------------------------------------------------------------------
// A CLI: uma reunião ordinária por mês (o 3º sábado), encerrada, com a presença de quem é dela (pastores, evangelistas e dirigentes, cada um desde que está no
// cargo). Ninguém leva falta sem justificativa: a ausência vem justificada (com o motivo do catálogo do Art. 149 §2º) — assim a apuração das 3 faltas da v8.1
// nunca exclui ninguém da massa. A JAI de cada congregação: uma por mês no último ano, com o dirigente, o tesoureiro e os oficiais dela.
const MOTIVOS_FALTA = [["SAUDE", "Consulta médica (dado fictício)."], ["VIAGEM_PROFISSIONAL", "Viagem a trabalho (dado fictício)."], ["EMERGENCIA_FAMILIAR", "Emergência na família (dado fictício)."], ["LUTO", "Falecimento na família (dado fictício)."]];
const terceiroSabado = (ano, mes) => { let d = primeiroDiaMes(ano, mes); while (diaSemana(d) !== 6) d++; return d + 14; };
function gerarReunioes(mod) {
  const r = criarRng("reunioes");
  const cli = [];
  const oficiais = mod.pessoas.filter((p) => p.status === "ATIVO" && (["PASTOR", "EVANGELISTA"].includes(p.cargo) || (p.lider && p.lider.papel === "Dirigente de Congregação")));
  const desdeNoCargo = (p) => (p.carreira && p.carreira.length ? p.carreira[p.carreira.length - 1].desde : BASE - 3650);
  for (const mes of MESES) {
    const dia = terceiroSabado(mes.ano, mes.mes);
    if (dia > BASE) continue;
    const pres = [];
    for (const p of oficiais) {
      if (!(p.lider && p.lider.papel === "Dirigente de Congregação") && desdeNoCargo(p) > dia) continue;
      const presente = r.chance(0.88 * (0.3 + 0.7 * atividade(p, dia)));
      const motivo = presente ? null : r.pick(MOTIVOS_FALTA);
      pres.push({ pessoa: p, presente, motivo });
    }
    const decreto = mod.distritos.find((d) => d.decretoCli === isoDe(dia));
    cli.push({ dia, pres, decreto: decreto || null,
      pauta: decreto ? `Leitura da ata anterior; relatórios das Áreas; decreto de ativação do ${decreto.nome} (Art. 126-K); consagrações; avisos.`
        : r.pick(["Leitura da ata anterior; relatórios das Áreas; calendário do trimestre; consagrações; avisos.", "Leitura da ata anterior; prestação de contas do mês; missões; avisos.",
          "Leitura da ata anterior; relatórios dos departamentos; escalas da Santa Ceia; avisos."]) });
  }
  const jai = [];
  for (const c of mod.congs) {
    const membrosJai = c.pessoas.filter((p) => p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && (p.lider || ["PRESBITERO", "DIACONO", "EVANGELISTA", "PASTOR"].includes(p.cargo))).slice(0, 9);
    for (const mes of MESES.slice(-12)) {
      const dia = terceiroSabado(mes.ano, mes.mes) - 7; // o 2º sábado
      if (dia > BASE || membrosJai.length < 2) continue;
      jai.push({ cong: c, dia, pres: membrosJai.map((p) => ({ pessoa: p, presente: r.chance(0.85 * (0.3 + 0.7 * atividade(p, dia))) })) });
    }
  }
  return { cli, jai };
}
async function etapaReunioes(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const orgaoCli = (await ler(req0, "SELECT OrgaoId FROM dbo.Orgaos WHERE Sigla = N'CLI'"))[0];
  if (!orgaoCli) return ["(sem o órgão CLI neste banco: reuniões puladas)"];
  const reun = gerarReunioes(mod);
  const feito = [];
  // CLI: identificadas pela descrição com a marca; refazer pula as que já existem (pela data).
  const temCli = new Set((await ler(req0, `SELECT CONVERT(char(10), DataSessao, 23) AS d FROM dbo.Sessoes WHERE OrgaoId = ${orgaoCli.OrgaoId} AND Descricao LIKE ${LIKE_F}`)).map((x) => x.d));
  const novasCli = reun.cli.filter((s) => !temCli.has(isoDe(s.dia)));
  if (novasCli.length) {
    await emTransacao(pool, async (req) => {
      await inserir(req, "Sessoes", ["OrgaoId", "Descricao", "DataSessao", "TipoSessao", "Status", "QuorumAtingido", "DataConvocacao", "DataPrevista", "Pauta", "ContaFaltasCLI"],
        novasCli.map((s) => [orgaoCli.OrgaoId, `Reunião ordinária da CLI — ${isoDe(s.dia).split("-").reverse().join("/")}${SUF_F}`, isoDe(s.dia), "ORDINARIA", "ENCERRADA", true,
          isoDe(s.dia - 15), isoDe(s.dia), s.pauta, true]));
      const sid = new Map((await ler(req, `SELECT SessaoId, CONVERT(char(10), DataSessao, 23) AS d FROM dbo.Sessoes WHERE OrgaoId = ${orgaoCli.OrgaoId} AND Descricao LIKE ${LIKE_F}`)).map((x) => [x.d, x.SessaoId]));
      const pres = novasCli.flatMap((s) => s.pres.map((x) => [sid.get(isoDe(s.dia)), x.pessoa.matricula, x.presente, !x.presente, x.motivo ? x.motivo[1] : null, true, x.motivo ? x.motivo[0] : null]));
      await inserir(req, "Presencas", ["SessaoId", "MembroId", "Presente", "FaltaJustificada", "MotivoJustificativa", "EsperadoCLI", "MotivoCodigo"], pres, 1000);
      feito.push(`${novasCli.length} reuniões da CLI com ${pres.length} presenças`);
    });
  }
  // JAI: por congregação, numa transação cada; congregação que já tem reunião da JAI fictícia é pulada.
  const jaiId = new Map((await ler(req0, `SELECT OrgaoLocalId, ReferenciaId FROM dbo.OrgaosLocais WHERE Nivel = 1 AND Sigla = N'JAI' AND ReferenciaId IN (${Q_CONG})`)).map((x) => [x.ReferenciaId, x.OrgaoLocalId]));
  const comJai = new Set((await ler(req0, `SELECT DISTINCT OrgaoLocalId FROM dbo.Sessoes WHERE OrgaoLocalId IS NOT NULL AND Descricao LIKE ${LIKE_F}`)).map((x) => x.OrgaoLocalId));
  let nj = 0, np = 0;
  for (const c of mod.congs) {
    const olId = jaiId.get(m.cong.get(c.nome));
    if (!olId || comJai.has(olId)) continue;
    const sessoes = reun.jai.filter((s) => s.cong === c);
    if (!sessoes.length) continue;
    await emTransacao(pool, async (req) => {
      await inserir(req, "Sessoes", ["OrgaoLocalId", "Descricao", "DataSessao", "TipoSessao", "Status", "QuorumAtingido", "DataConvocacao", "DataPrevista", "Pauta", "ContaFaltasCLI"],
        sessoes.map((s) => [olId, `Reunião da JAI — ${c.nome.replace(SUF_F, "")} — ${isoDe(s.dia).split("-").reverse().join("/")}${SUF_F}`, isoDe(s.dia), "ORDINARIA", "ENCERRADA", true,
          isoDe(s.dia - 7), isoDe(s.dia), "Leitura da ata anterior; tesouraria do mês; relatórios dos departamentos; manutenção do templo; avisos.", false]));
      const sid = new Map((await ler(req, `SELECT SessaoId, CONVERT(char(10), DataSessao, 23) AS d FROM dbo.Sessoes WHERE OrgaoLocalId = ${olId} AND Descricao LIKE ${LIKE_F}`)).map((x) => [x.d, x.SessaoId]));
      const pres = sessoes.flatMap((s) => s.pres.map((x) => [sid.get(isoDe(s.dia)), x.pessoa.matricula, x.presente]));
      await inserir(req, "Presencas", ["SessaoId", "MembroId", "Presente"], pres, 1000);
      nj += sessoes.length; np += pres.length;
    });
  }
  if (nj) feito.push(`${nj} reuniões da JAI com ${np} presenças`);
  return feito;
}

// ------------------------------------------------------------------ o Distrito (decreto, Dízimo Institucional, balanço) ------------------------------------------------------------------
// Depois da tesouraria: o decreto da CLI (a reunião de março/2025) ativa o Distrito com o período do dinheiro desde o mês do registro (como distritosDb.ativar), o CDE
// nasce junto; o Dízimo Institucional de cada mês (10% do Total Final dos fechamentos com o repasse gravado para o Distrito — calculado do banco, nunca digitado)
// é registrado e repassado pelo Tesoureiro de Distrito até o dia 5 do mês seguinte; o balanço de 2025 foi devolvido uma vez pelo NIF (Conselho Fiscal) e aprovado na
// segunda versão (quem analisa nunca é quem enviou).
async function etapaDistritos(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const feito = [];
  const orgaoCli = (await ler(req0, "SELECT OrgaoId FROM dbo.Orgaos WHERE Sigla = N'CLI'"))[0];
  const param = (await ler(req0, "SELECT PercentualDizimoInstitucional AS p FROM dbo.ParametrosRepasseInstitucional WHERE ParametroId = 1"))[0];
  const percentual = param ? Number(param.p) : 10;
  const pastor = (d) => mod.lideres.find((p) => p.lider.papel === "Pastor Distrital" && p.lider.escopo.distrito === d);
  const tesoureiro = (d) => mod.lideres.find((p) => p.lider.papel === "Tesoureiro de Distrito" && p.lider.escopo.distrito === d);
  for (const d of mod.distritos) {
    const did = m.distrito.get(d.nome);
    if (!did) throw new Error('falta o Distrito fictício: rode a etapa "territorio" antes');
    const sessao = orgaoCli && (await ler(req0, `SELECT SessaoId FROM dbo.Sessoes WHERE OrgaoId = ${orgaoCli.OrgaoId} AND DataSessao = '${d.decretoCli}' AND Status = N'ENCERRADA' AND Descricao LIKE ${LIKE_F}`))[0];
    if (!sessao) throw new Error('falta a reunião da CLI do decreto: rode a etapa "reunioes" antes');
    const pd = pastor(d), td = tesoureiro(d);
    const quemRegistra = td ? td.matricula : MATRICULA_MIN + 3;
    await emTransacao(pool, async (req) => {
      if (!(await ler(req, `SELECT TOP 1 1 AS x FROM dbo.DistritoPeriodos WHERE DistritoId = ${did}`)).length) {
        await inserir(req, "DistritoPeriodos", ["DistritoId", "Legado", "AtivadoEm", "FinanceiroDesdeMes", "AtivacaoSessaoId", "Gatilho", "Cidade", "UF", "Fundamentacao", "AtivacaoRegistradaPor", "AtivacaoRegistradaEm"],
          [[did, false, d.decretoCli, d.desdeMes, sessao.SessaoId, "METROPOLE", d.nomeCidade, UF,
            `Capital fora da sede de origem, com congregações bastantes para a administração própria (decreto da CLI de ${d.decretoCli.split("-").reverse().join("/")}; dado fictício).`, MATRICULA_MIN + 2, `${d.registradoEm}T14:00:00`]]);
        await req().query(`UPDATE dbo.Distritos SET Ativo = 1 WHERE DistritoId = ${did}`);
        await req().query(`IF NOT EXISTS (SELECT 1 FROM dbo.OrgaosLocais WHERE Nivel = 5 AND ReferenciaId = ${did} AND Sigla = N'CDE')
          INSERT INTO dbo.OrgaosLocais (Sigla, Nome, Nivel, ReferenciaId, Ativo) VALUES (N'CDE', ${lit(`Conselho Distrital Eclesiástico — ${d.nome}`)}, 5, ${did}, 1)`);
        feito.push(`${d.nome}: decreto, período desde ${d.desdeMes} e CDE`);
      }
      // Dízimo Institucional: um por mês fechado do período (todas as congregações do território fecharam), do banco.
      const meses = await ler(req, `SELECT f.MesReferencia AS mes, SUM(f.TotalFinal) AS soma, MAX(f.DataFechamento) AS ultimo FROM dbo.FechamentosTesouraria f
        WHERE f.RepasseDistritoId = ${did} AND NOT EXISTS (SELECT 1 FROM dbo.RepassesInstitucionais ri WHERE ri.OrigemTipo = N'DISTRITO' AND ri.OrigemId = ${did} AND ri.MesReferencia = f.MesReferencia)
        GROUP BY f.MesReferencia ORDER BY f.MesReferencia`);
      const r = criarRng(`distrito:${d.i}`);
      const linhas = meses.map((x) => {
        const soma = Math.round(Number(x.soma) * 100);
        const valor = Math.round(soma * percentual / 100);
        const fech = new Date(x.ultimo).getTime() / DIA_MS;
        // um mês de 2025 repassado com atraso (o aviso de retenção da v9.3 o mostraria), os outros no prazo
        const atraso = x.mes === `${d.desdeMes.slice(0, 4)}-12` ? r.int(6, 10) : 0;
        const dia = Math.floor(fech) + 1 + atraso;
        return [N_DISTRITO, did, d.nome, x.mes, reais(soma), cru(percentual.toFixed(2)), reais(valor), "REPASSADO", momento(dia, 16, r.int(0, 59)), quemRegistra, quemRegistra, momento(dia, 11, r.int(0, 59))];
      });
      await inserir(req, "RepassesInstitucionais", ["OrigemTipo", "OrigemId", "OrigemNome", "MesReferencia", "ValorArrecadadoLiquido", "Percentual", "ValorRepasse", "Status", "DataRepasse",
        "RepassadoPor", "RegistradoPor", "CriadoEm"], linhas);
      if (linhas.length) feito.push(`${d.nome}: ${linhas.length} meses de Dízimo Institucional`);
      // Balanço de cada ano inteiro do período até o ano anterior à data-base (prazo 31/03 do ano seguinte): devolvido uma vez, aprovado na 2ª versão.
      const anos = (await ler(req, `SELECT DISTINCT LEFT(MesReferencia, 4) AS ano FROM dbo.FechamentosTesouraria WHERE RepasseDistritoId = ${did}`)).map((x) => Number(x.ano)).filter((a) => a < ANO_BASE);
      const cf = mod.conselhoFiscal[0];
      for (const ano of anos) {
        if ((await ler(req, `SELECT TOP 1 1 AS x FROM dbo.DistritoBalancos WHERE DistritoId = ${did} AND Ano = ${ano}`)).length) continue;
        const t = (await ler(req, `SELECT (SELECT ISNULL(SUM(ValorRepasseGeral), 0) FROM dbo.FechamentosTesouraria WHERE RepasseDistritoId = ${did} AND Status = 'REPASSADO' AND LEFT(MesReferencia, 4) = '${ano}') AS rec,
          (SELECT ISNULL(SUM(ValorRepasse), 0) FROM dbo.RepassesInstitucionais WHERE OrigemTipo = N'DISTRITO' AND OrigemId = ${did} AND Status = N'REPASSADO' AND LEFT(MesReferencia, 4) = '${ano}') AS diz`))[0];
        const rec = Math.round(Number(t.rec) * 100), desp = Math.round(Number(t.diz) * 100) + Math.round(rec * 0.55);
        const enviou = pd ? pd.matricula : quemRegistra;
        const analisa = cf ? cf.matricula : MATRICULA_MIN + 3;
        await inserir(req, "DistritoBalancos", ["DistritoId", "Ano", "Versao", "Receitas", "Despesas", "SaldoFinal", "Observacoes", "Status", "EnviadoPor", "EnviadoEm", "AnalisadoPor", "AnalisadoEm", "MotivoDevolucao"], [
          [did, ano, 1, reais(rec), reais(desp), reais(rec - desp), "Balanço anual do Distrito (dado fictício).", "DEVOLVIDO", enviou, `${ano + 1}-02-20T15:00:00`, analisa, `${ano + 1}-03-02T10:00:00`,
            "Faltou o extrato da conta do Distrito de dezembro (dado fictício)."],
          [did, ano, 2, reais(rec), reais(desp), reais(rec - desp), "Balanço anual do Distrito, com o extrato de dezembro (dado fictício).", "APROVADO", enviou, `${ano + 1}-03-10T15:00:00`, analisa, `${ano + 1}-03-20T10:00:00`, null]
        ]);
        feito.push(`${d.nome}: balanço de ${ano}`);
      }
    });
  }
  return feito;
}
const N_DISTRITO = "DISTRITO";

// ------------------------------------------------------------------ prestação de contas mensal (Reg. Art. 120, migração 062) ------------------------------------------------------------------
// Cada mês fechado: os comprovantes de água e luz até o dia 5 do mês seguinte (COMPLETA); quem atrasa fica com a Ata de Pendência (ATA_PENDENCIA) — com o
// repasse bloqueado só nos 2 últimos meses (os antigos já foram regularizados e desbloqueados); alguns meses, nas congregações menos pontuais, nem têm
// prestação (o aviso PRESTACAO_CONTAS_ATRASADA as acharia). Os arquivos são nomes de mentira (o link abre vazio, como os comprovantes da tesouraria).
async function etapaPrestacoes(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const comPrest = new Set((await ler(() => pool.request(), `SELECT DISTINCT CongregacaoId FROM dbo.PrestacoesContas WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const fechados = MESES.filter((x) => !x.aberto);
  let n = 0, atas = 0, faltam = 0, nc = 0;
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    if (comPrest.has(cid)) continue;
    const r = criarRng(`prestacoes:${c.i}`);
    const tes = mod.lideres.find((p) => p.lider.papel === "Tesoureiro Local" && p.lider.escopo.cong === c);
    const quem = tes ? tes.matricula : MATRICULA_MIN + 3;
    const completa = { BOA: 0.95, MEDIA: 0.85, RUIM: 0.65 }[c.pontualidade];
    const linhas = [];
    fechados.forEach((mes, j) => {
      if (r.chance(c.pontualidade === "RUIM" ? 0.08 : 0.02)) { faltam++; return; }
      const ok = r.chance(completa);
      const recentes = j >= fechados.length - 2;
      const arq = (t) => `homolog-ficticio-${t}-${c.k}-${mes.chave}.pdf`;
      const semAgua = !ok && r.chance(0.5);
      linhas.push([cid, mes.chave, semAgua ? null : arq("agua"), ok || semAgua ? arq("luz") : null, ok ? "COMPLETA" : "ATA_PENDENCIA", ok ? null : arq("ata-pendencia"),
        !ok && recentes, quem, momento(mes.fim + (ok ? r.int(1, 5) : r.int(6, 20)), 14, r.int(0, 59))]);
      if (!ok) atas++;
    });
    await emTransacao(pool, (req) => inserir(req, "PrestacoesContas", ["CongregacaoId", "MesReferencia", "ComprovanteAguaUrl", "ComprovanteLuzUrl", "Status", "AtaPendenciaUrl",
      "BloqueioRepasse", "RegistradoPor", "CriadoEm"], linhas));
    n += linhas.length; nc++;
  }
  return nc ? [`prestações de contas de ${nc} congregações: ${n} meses (${atas} com Ata de Pendência, ${faltam} meses sem prestação)`] : [];
}

// ------------------------------------------------------------------ PSC: Programa de Saúde Congregacional (v7.1, migração 113) ------------------------------------------------------------------
// Uma avaliação por congregação e exercício, desde o primeiro exercício obrigatório (PscParametros) até o da data-base. As respostas copiam o catálogo
// vigente (como a tela faz ao abrir) e sobem a Escada Bloqueada até o nível que a congregação sustenta (pela tendência): tudo atendido até ali, alguma
// alínea não atendida no degrau seguinte, o resto bloqueado. O nível, a classificação e o JSON dos sinais vêm de shared/psc.js::montarEscada (o mesmo
// cálculo da homologação). Esteira com segregação: o Dirigente preenche e envia, o Pastor de Área valida, o Presidente homologa. Ninguém fica reprovado no
// Nível 1 em dois exercícios seguidos (a reclassificação compulsória é decisão da CLI, não da massa).
async function etapaPsc(pool, mod) {
  const psc = require("../shared/psc");
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const param = (await ler(req0, "SELECT PrimeiroExercicio FROM dbo.PscParametros WHERE ParametroId = 1"))[0];
  const primeiro = param ? Number(param.PrimeiroExercicio) : ANO_BASE;
  const criterios = await ler(req0, `SELECT c.CriterioId, c.SinalId, c.Nivel, c.Codigo, c.Texto, c.Orientacao FROM dbo.PscCriterios c JOIN dbo.PscSinaisVitais s ON s.SinalId = c.SinalId
    WHERE c.Ativo = 1 AND s.Ativo = 1 ORDER BY c.SinalId, c.Nivel, c.Codigo`);
  const sinaisMeta = (await ler(req0, "SELECT SinalId, Codigo, Nome, Ordem FROM dbo.PscSinaisVitais")).map((s) => ({ sinalId: s.SinalId, codigo: s.Codigo, nome: s.Nome, ordem: s.Ordem }));
  if (!criterios.length) return ["(catálogo do PSC vazio: PSC pulado)"];
  const sinais = [...new Set(criterios.map((x) => x.SinalId))];
  const anos = [];
  for (let a = Math.max(primeiro, ANO_BASE - 2); a <= ANO_BASE; a++) anos.push(a);
  const tem = new Set((await ler(req0, `SELECT CongregacaoId, Ano FROM dbo.PscAvaliacoes WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => `${x.CongregacaoId}:${x.Ano}`));
  const tot = { aval: 0, resp: 0, homolog: 0 };
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    const r = criarRng(`psc:${c.i}`);
    const dir = mod.lideres.find((p) => p.lider.papel === "Dirigente de Congregação" && p.lider.escopo.cong === c);
    const pa = mod.lideres.find((p) => p.lider.papel === "Pastor de Área" && p.lider.escopo.area === mod.areas[c.area]);
    const prep = dir ? dir.matricula : MATRICULA_MIN + 2, valida = pa ? pa.matricula : MATRICULA_MIN + 2;
    const base = c.tendencia === "CRESCE" ? 4 : c.tendencia === "CAI" ? 2 : 3;
    let reprovouAntes = false;
    for (const ano of anos) {
      if (tem.has(`${cid}:${ano}`)) continue;
      const atual = ano === ANO_BASE;
      const status = !atual ? r.pesos([["HOMOLOGADA", 90], ["VALIDADA", 10]]) : r.pesos([["RASCUNHO", 55], ["ENVIADA", 25], ["VALIDADA", 15], ["HOMOLOGADA", 5]]);
      // o nível que cada Sinal sustenta; 0 = reprovado no Nível 1 (só a congregação que cai, no exercício da data-base, e nunca dois seguidos)
      const reprova = atual && !reprovouAntes && c.tendencia === "CAI" && r.chance(0.25);
      const alvo = new Map(sinais.map((s) => [s, reprova && s === sinais[0] ? 0 : Math.max(1, Math.min(5, base + r.int(-1, 1)))]));
      reprovouAntes = reprova;
      const parcial = status === "RASCUNHO";
      const respostas = criterios.map((x) => {
        const L = alvo.get(x.SinalId);
        let sit = "PENDENTE";
        if (x.Nivel <= L) sit = "ATENDIDO";
        else if (x.Nivel === L + 1) sit = "ATENDIDO_OU_NAO";
        if (parcial && x.Nivel > Math.max(1, L - 1)) sit = "PENDENTE";
        return { ...x, sit };
      });
      // no degrau de parada: pelo menos uma alínea não atendida em cada Sinal
      for (const s of sinais) {
        const doDegrau = respostas.filter((x) => x.SinalId === s && x.sit === "ATENDIDO_OU_NAO");
        doDegrau.forEach((x, k) => { x.sit = k === 0 || r.chance(0.4) ? "NAO_ATENDIDO" : "ATENDIDO"; });
      }
      const esc = psc.montarEscada(respostas.map((x) => ({ sinalId: x.SinalId, nivel: x.Nivel, situacao: x.sit, codigo: x.Codigo })), sinaisMeta);
      const homologada = status === "HOMOLOGADA" && esc.concluido && esc.classificacao != null;
      const st = status === "HOMOLOGADA" && !homologada ? "VALIDADA" : status;
      const aberta = atual ? BASE - r.int(40, 120) : diaDe(`${ano}-11-20`) + r.int(0, 20);
      const enviada = st !== "RASCUNHO" ? Math.min(BASE - 3, atual ? aberta + r.int(10, 30) : diaDe(`${ano + 1}-01-10`) + r.int(0, 40)) : null;
      const validada = st === "VALIDADA" || st === "HOMOLOGADA" ? Math.min(BASE - 2, enviada + r.int(3, 20)) : null;
      const homolog = st === "HOMOLOGADA" ? Math.min(BASE - 1, validada + r.int(5, 30)) : null;
      const json = homologada ? JSON.stringify(esc.sinais.map((s) => ({ sinalId: s.sinalId, codigo: s.codigo, nivel: s.nivel, nivelDeParada: s.nivelDeParada,
        niveis: s.niveis.map((nv) => ({ nivel: nv.nivel, situacao: nv.situacao, atendidos: nv.atendidos, naoAtendidos: nv.naoAtendidos, total: nv.total })) }))) : null;
      await emTransacao(pool, async (req) => {
        await inserir(req, "PscAvaliacoes", ["CongregacaoId", "Ano", "Status", "AbertaPorMembroId", "AbertaEm", "EnviadaPorMembroId", "EnviadaEm", "ValidadaPorMembroId", "ValidadaEm",
          "ParecerValidacao", "HomologadaPorMembroId", "HomologadaEm", "ResolucaoReferencia", "NivelFinal", "ReprovadaNivel1", "Classificacao", "ResultadoSinaisJson", "AtualizadaEm"],
        [[cid, ano, st, prep, momento(aberta, 13), enviada ? prep : null, enviada ? momento(enviada, 15) : null, validada ? valida : null, validada ? momento(validada, 16) : null,
          validada ? "Conferido com a Secretaria da congregação (dado fictício)." : null, homologada ? MATRICULA_MIN + 1 : null, homologada ? momento(homolog, 17) : null,
          homologada ? `Resolução CLI nº ${r.int(10, 99)}/${ano + 1} (fictícia)` : null, homologada ? esc.nivelFinal : null, homologada ? esc.reprovadaNivel1 : null,
          homologada ? esc.classificacao : null, json, momento(homolog || validada || enviada || aberta, 18)]]);
        const aid = (await ler(req, `SELECT AvaliacaoId FROM dbo.PscAvaliacoes WHERE CongregacaoId = ${cid} AND Ano = ${ano}`))[0].AvaliacaoId;
        const resp = respostas.map((x) => [aid, x.CriterioId, x.SinalId, x.Nivel, x.Codigo, x.Texto, x.Orientacao, x.sit === "PENDENTE" ? "PENDENTE" : x.sit,
          x.sit === "PENDENTE" ? null : prep, x.sit === "PENDENTE" ? null : momento(aberta + r.int(1, 9), 14)]);
        await inserir(req, "PscRespostas", ["AvaliacaoId", "CriterioId", "SinalId", "Nivel", "Codigo", "Texto", "Orientacao", "Situacao", "RespondidaPorMembroId", "RespondidaEm"], resp);
        tot.aval++; tot.resp += resp.length; if (homologada) tot.homolog++;
      });
    }
  }
  return tot.aval ? [`PSC: ${tot.aval} avaliações (${tot.homolog} homologadas, exercícios ${anos.join(", ")}), ${tot.resp} respostas`] : [];
}

// ------------------------------------------------------------------ relatórios mensais dos departamentos (v5.3/v5.8, migração 094) ------------------------------------------------------------------
// Os últimos 18 meses fechados, por congregação e departamento que ela tem (pelo número de pessoas de cada um). Prazo: o último dia do mês seguinte
// (relatoriosDepartamentais.calcularPrazoEnvio). Cada congregação tem a sua pontualidade: a boa manda quase tudo no prazo; a ruim atrasa (Atrasado = 1) ou
// nem manda (rascunho parado, ou nenhum relatório: o "pendente" do semáforo da v10.12). A trilha (Aprovações) segue a máquina de estados do app: ENVIAR
// (congregação) → APROVAR_AREA (Pastor de Área) → APROVAR_GERAL (Secretaria Geral) → às vezes RETIFICAR; o rateio (ValorParaGeral/Local) é congelado na
// aprovação geral com o perfil do departamento, como GestaoRelatoriosDepartamentais::congelarRateio.
const PONTUALIDADE = { BOA: { envia: 0.97, noPrazo: 0.92 }, MEDIA: { envia: 0.88, noPrazo: 0.7 }, RUIM: { envia: 0.7, noPrazo: 0.4 } };
function rateioDoPerfil(perfil, total, manual) {
  // o mesmo de shared/tesourariaDepartamental.js::calcularRateio (copiado: aquele módulo depende do banco do app)
  if (!perfil) return { geral: 0, local: total };
  const met = perfil.Metodo;
  if (met === "INTEGRAL_GERAL") return { geral: total, local: 0 };
  if (met === "INTEGRAL_LOCAL") return { geral: 0, local: total };
  if (met === "VARIAVEL_MANUAL") return { geral: manual || 0, local: total - (manual || 0) };
  if (met === "PERCENTUAL" || met === "MENSALIDADE_FIXA") {
    if (perfil.ModoEntrada === "LIQUIDO_MANUAL") return { geral: total, local: null };
    const geral = Math.round(total * (Number(perfil.PercentualGeral) || 0) / 100);
    return { geral, local: total - geral };
  }
  return { geral: 0, local: total };
}
async function etapaRelatorios(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const schemas = await ler(req0, `SELECT s.SchemaRelatorioId, s.DepartamentoId, d.Sigla FROM dbo.SchemasRelatorioDepartamental s JOIN dbo.Departamentos d ON d.DepartamentoId = s.DepartamentoId
    WHERE s.DataVigenciaFim IS NULL`);
  const campos = await ler(req0, "SELECT CampoFormularioId, SchemaRelatorioId, NomeCampo, Grupo, Comportamento, TipoDado, PermiteSemanal FROM dbo.CamposFormularioDepartamental ORDER BY Ordem, CampoFormularioId");
  const perfis = new Map((await ler(req0, "SELECT * FROM dbo.PerfisRateioDepartamental")).map((x) => [x.SchemaRelatorioId, x]));
  const schemaDe = new Map(schemas.map((s) => [s.Sigla, s]));
  const comRel = new Set((await ler(req0, `SELECT DISTINCT CongregacaoId FROM dbo.RelatoriosDepartamentais WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const meses = MESES.filter((x) => !x.aberto).slice(-18);
  const tot = { cong: 0, rel: 0, valores: 0, trilha: 0, atrasados: 0, pendentes: 0 };
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    if (comRel.has(cid)) continue;
    const r = criarRng(`relatorios:${c.i}`);
    const vivos = c.pessoas.filter((p) => p.status === "ATIVO");
    const porDepto = new Map();
    for (const p of vivos) { const s = departamentoDe(p); if (s) porDepto.set(s, (porDepto.get(s) || 0) + 1); }
    const deptos = ["UCADESPA", "UMADESPA", "USADESPA", "UHADESPA"].filter((s) => (porDepto.get(s) || 0) >= 3);
    deptos.push("EBD");
    if (vivos.length >= 60) deptos.push("SEMIADESPA");
    if (vivos.length >= 80) deptos.push("FAMILIA");
    if (vivos.length >= 100) deptos.push("ACAO_DA_FE");
    const dir = mod.lideres.find((p) => p.lider.papel === "Dirigente de Congregação" && p.lider.escopo.cong === c);
    const pa = mod.lideres.find((p) => p.lider.papel === "Pastor de Área" && p.lider.escopo.area === mod.areas[c.area]);
    const quem = dir ? dir.matricula : MATRICULA_MIN + 2;
    const pont = PONTUALIDADE[c.pontualidade];
    const rels = [];
    for (const sigla of deptos) {
      const sch = schemaDe.get(sigla);
      if (!sch) continue;
      const cs = campos.filter((x) => x.SchemaRelatorioId === sch.SchemaRelatorioId);
      const n = sigla === "EBD" ? Math.round(vivos.length * 0.6) : (porDepto.get(sigla) || Math.round(vivos.length * 0.15));
      for (const mes of meses) {
        const t2 = mes.ano * 12 + (mes.mes - 1) + 2; // o 1º dia de dois meses depois, menos um = o último dia do mês seguinte
        const prazo = primeiroDiaMes(Math.floor(t2 / 12), (t2 % 12) + 1) - 1;
        const venceu = prazo < BASE;
        let status = null, envio = null;
        if (venceu) {
          if (r.chance(pont.envia)) {
            envio = r.chance(pont.noPrazo) ? mes.fim + r.int(1, prazo - mes.fim) : prazo + r.int(1, 45);
            if (envio > BASE - 1) envio = BASE - 1;
            status = "ENVIADO";
          } else if (r.chance(0.5)) status = "RASCUNHO";
        } else if (r.chance(0.7)) {
          status = r.chance(0.5) && BASE > mes.fim + 1 ? "ENVIADO" : "RASCUNHO";
          if (status === "ENVIADO") envio = mes.fim + r.int(1, BASE - mes.fim - 1);
        }
        if (!status) { tot.pendentes++; continue; }
        const trilha = [];
        let ultimo = envio || mes.fim + r.int(1, 10);
        if (status === "ENVIADO") {
          trilha.push(["ENVIAR", "CONGREGACAO", quem, envio]);
          const area = envio + r.int(3, 12), geral = area + r.int(2, 12);
          if (pa && area < BASE) { status = "APROVADO_AREA"; trilha.push(["APROVAR_AREA", "AREA", pa.matricula, area]); ultimo = area; }
          if (status === "APROVADO_AREA" && geral < BASE && r.chance(0.95)) { status = "APROVADO_GERAL"; trilha.push(["APROVAR_GERAL", "GLOBAL", MATRICULA_MIN + 2, geral]); ultimo = geral; }
          const retif = geral + r.int(5, 20);
          if (status === "APROVADO_GERAL" && retif < BASE && r.chance(0.03)) { status = "RETIFICADO"; trilha.push(["RETIFICAR", "GLOBAL", MATRICULA_MIN + 2, retif]); ultimo = retif; }
        }
        const prazoIso = isoDe(prazo);
        const atrasado = !!envio && isoDe(envio) > prazoIso;
        if (atrasado) tot.atrasados++;
        // valores do formulário (os semanais, um por domingo do mês)
        const domingos = [];
        for (let d = mes.inicio; d <= mes.fim; d++) if (diaSemana(d) === 0) domingos.push(d);
        const valores = [];
        let financeiro = 0;
        const sazonal = fatorMesAno(mes.inicio) * tendenciaEm(c, mes.inicio);
        for (const f of cs) {
          const gera = () => {
            if (f.Grupo === "FINANCEIRO") return Math.round(r.int(0, 30) * 500 * Math.max(0.5, n / 25) * sazonal); // centavos
            if (f.Comportamento === "ESTADO") return Math.max(0, Math.round(n * (0.85 + r.real() * 0.2) * Math.min(1.2, sazonal)));
            if (/presen/i.test(f.NomeCampo)) return Math.round(n * (0.55 + r.real() * 0.25) * sazonal);
            if (/ausen/i.test(f.NomeCampo)) return Math.round(n * (0.1 + r.real() * 0.2));
            return r.int(0, Math.max(2, Math.round(n / 6)));
          };
          if (f.PermiteSemanal) {
            domingos.forEach((d, k) => { const v = gera(); valores.push([f.CampoFormularioId, k + 1, f.TipoDado === "MOEDA" ? reais(v) : v]); });
          } else {
            const v = gera();
            if (f.Grupo === "FINANCEIRO") financeiro += v;
            valores.push([f.CampoFormularioId, null, f.TipoDado === "MOEDA" ? reais(v) : v]);
          }
        }
        let paraGeral = null, paraLocal = null, manual = null;
        const perfil = perfis.get(sch.SchemaRelatorioId);
        if (perfil && perfil.Metodo === "VARIAVEL_MANUAL") manual = Math.round(financeiro * 0.5);
        if (status === "APROVADO_GERAL" || status === "RETIFICADO") {
          const rt = rateioDoPerfil(perfil, financeiro, manual);
          paraGeral = rt.geral; paraLocal = rt.local;
        }
        rels.push({ sch, sigla, mes, status, envio, atrasado, trilha, valores, paraGeral, paraLocal, manual, criado: Math.min(envio || ultimo, mes.fim + r.int(1, 8)), ultimo,
          eventos: [r.int(0, 4), r.int(0, 2), r.int(0, 1)], integracao: [r.int(0, 3), r.int(0, 1), r.int(0, 1)] });
      }
    }
    if (!rels.length) continue;
    await emTransacao(pool, async (req) => {
      await inserir(req, "RelatoriosDepartamentais", ["CongregacaoId", "DepartamentoId", "MesReferencia", "AnoReferencia", "SchemaRelatorioId", "Status", "Atrasado", "EventosLocal", "EventosArea",
        "EventosGeral", "IntegracaoConversao", "IntegracaoReconciliacao", "IntegracaoDeOutraIgreja", "CriadoPor", "DataEnvio", "CriadoEm", "AtualizadoEm", "ValorManualParaGeral", "ValorParaGeral", "ValorParaLocal"],
      rels.map((x) => [cid, x.sch.DepartamentoId, x.mes.mes, x.mes.ano, x.sch.SchemaRelatorioId, x.status, x.atrasado, ...x.eventos, ...x.integracao, quem,
        x.envio ? momento(x.envio, 18, 30) : null, momento(x.criado, 12), momento(x.ultimo, 19), x.manual === null ? null : reais(x.manual),
        x.paraGeral === null ? null : reais(x.paraGeral), x.paraLocal === null ? null : reais(x.paraLocal)]));
      const relId = new Map((await ler(req, `SELECT RelatorioDepartamentalId AS id, DepartamentoId AS d, MesReferencia AS m, AnoReferencia AS a FROM dbo.RelatoriosDepartamentais WHERE CongregacaoId = ${cid}`))
        .map((x) => [`${x.d}:${x.m}:${x.a}`, x.id]));
      const idDe = (x) => relId.get(`${x.sch.DepartamentoId}:${x.mes.mes}:${x.mes.ano}`);
      const vals = rels.flatMap((x) => x.valores.map((v) => [idDe(x), ...v]));
      await inserir(req, "ValoresCampoRelatorioDepartamental", ["RelatorioDepartamentalId", "CampoFormularioId", "NumeroDomingo", "Valor"], vals, 1000);
      const trilha = rels.flatMap((x) => x.trilha.map(([acao, nivel, por, dia]) => [idDe(x), nivel, acao, acao === "RETIFICAR" ? "Correção de digitação (dado fictício)." : null, por, momento(dia, 19)]));
      await inserir(req, "AprovacoesRelatorioDepartamental", ["RelatorioDepartamentalId", "NivelAprovador", "Acao", "Comentario", "MembroId", "CriadoEm"], trilha, 1000);
      tot.cong++; tot.rel += rels.length; tot.valores += vals.length; tot.trilha += trilha.length;
    });
  }
  return tot.cong ? [`relatórios de ${tot.cong} congregações: ${tot.rel} relatórios (${tot.atrasados} entregues com atraso, ${tot.pendentes} meses sem relatório), ${tot.valores} valores, ${tot.trilha} passos da trilha`] : [];
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
  const diz = mod.pessoas.filter((p) => p.dizimista && !temDiz.has(p.matricula)).map((p) => [m.cong.get(p.cong.nome), p.nome, p.matricula, p.dizimista.ativo, momento(p.dizimista.desde, 12)]);
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
  // migração 172: com Tipo NVARCHAR(30) a oferta do culto de departamento vai na categoria própria (antes, 25 letras não cabiam em 20)
  const tipoLargo = Number((await ler(req0, "SELECT COL_LENGTH('dbo.LancamentosTesouraria', 'Tipo') AS n"))[0].n) >= 60;
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
        "ValorRetidoLocal", "ValorRepasseGeral", "Status", "DataFechamento", "FechadoPor", "DataRepasse", "RepassadoPor", "FormaRepasse", "RepasseDistritoId"],
        fin.fechamentos.map((f) => [cid, f.mes, reais(f.totalRecebido), reais(c.aluguel), reais(c.lote), cru(f.totalFinal.toFixed(2)), cru("40.00"), cru(f.valorRetidoLocal.toFixed(2)),
          cru(f.valorRepasseGeral.toFixed(2)), f.repassado ? "REPASSADO" : "FECHADO", f.dataFechamento, tes.matricula, f.dataRepasse, f.repassado ? tesGeral : null, f.formaRepasse,
          f.distrito ? m.distrito.get(f.distrito.nome) : null]));
      const fechId = new Map((await ler(req, `SELECT FechamentoId, MesReferencia FROM dbo.FechamentosTesouraria WHERE CongregacaoId = ${cid}`)).map((x) => [x.MesReferencia, x.FechamentoId]));
      const concId = new Map((await ler(req, `SELECT ConciliacaoId, MesReferencia FROM dbo.ConciliacoesTesouraria WHERE CongregacaoId = ${cid}`)).map((x) => [x.MesReferencia, x.ConciliacaoId]));
      const dizId = new Map((await ler(req, `SELECT DizimistaId, MembroId FROM dbo.Dizimistas WHERE CongregacaoId = ${cid} AND MembroId IS NOT NULL`)).map((x) => [x.MembroId, x.DizimistaId]));
      await inserir(req, "LancamentosTesouraria", ["CongregacaoId", "DizimistaId", "NomeAvulso", "TermoNumero", "Tipo", "Descricao", "Valor", "FormaPagamento", "ValorPix",
        "MesReferencia", "FechamentoId", "RegistradoPor", "CriadoEm", "Status", "MotivoCancelamento", "CanceladoPor", "CanceladoEm", "ConciliacaoId", "Origem", "StatusConfirmacao"],
      fin.lancs.map((l) => [cid, l.dizimista ? dizId.get(l.dizimista.matricula) || null : null, l.dizimista ? null : l.nomeAvulso || null, l.termo, l.tipo === "DEPARTAMENTO" && tipoLargo ? "OFERTA_CULTO_DEPARTAMENTO" : l.tipo, l.descricao || null,
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

// ------------------------------------------------------------------ calendário oficial e eventos (v7.2/v7.4, migrações 114 e 116) ------------------------------------------------------------------
// Do ano da data-base −2 ao +1. O ano que já existe no banco é respeitado (o status dos eventos segue o dele); o que a massa cria nasce com a ata marcada.
// Ciclo do Art. 79 (REGRA, chave canônica: o "Gerar ciclo" do app as reconhece): a Santa Ceia (Geral em maio e outubro) e a CLI no último domingo. Propostas:
// batismos, assembleia e congressos (Nível 1), vigílias, cruzadas e capacitação no campo (2), cruzadas e intercâmbios por Área (3), aniversários, campanhas e
// cultos de ensino (4) e casamentos, 15 anos e formaturas (5) por congregação — sem choque entre eventos ativos (as regras de território e de Festividade).
// Nos homologados: deferidos, indeferidos, cancelados, absorvidos e propostas tardias; no ano seguinte (planejamento): propostas abertas. Nada vai ao site
// (PublicoNoSite = 0, sem SlugSite). Eventos de campo e de Área ganham organizadores, convidados (com ética e nada-consta quando exigem) e o caixa
// (aberto, encerrado ou conferido, com lançamentos e o destino do saldo).
const pad2 = (n) => String(n).padStart(2, "0");
const diasDoMes = (ano, mes, dow) => { const out = []; for (let d = primeiroDiaMes(ano, mes); mesDe(d) === `${ano}-${pad2(mes)}`; d++) if (diaSemana(d) === dow) out.push(d); return out; };
function gerarCalendario(mod, ano, statusAno) {
  const r = criarRng(`calendario:${ano}`);
  const cicloEm = statusAno === "PLANEJAMENTO" ? BASE - 10 : diaDe(`${ano - 1}-12-01`);
  const consolidadoEm = diaDe(`${ano}-01-20`);
  const homologadoEm = diasDoMes(ano, 1, 0).pop();
  const evs = [], campo = new Set(), areaDias = new Map(), congDias = new Map();
  const dias = (e) => { const out = []; for (let d = e.ini; d <= e.fim; d++) out.push(d); return out; };
  const congsDaArea = (a) => mod.areas[a].congs;
  const choca = (e) => dias(e).some((d) => {
    if (campo.has(d)) return true;
    if (e.abr === "CAMPO") return [...areaDias.values()].some((s) => s.has(d)) || [...congDias.values()].some((s) => s.has(d));
    if (e.abr === "AREAS") return e.areas.some((a) => (areaDias.get(a) || new Set()).has(d) || congsDaArea(a).some((c) => (congDias.get(c.i) || new Set()).has(d)));
    return (congDias.get(e.cong.i) || new Set()).has(d) || (areaDias.get(e.cong.area) || new Set()).has(d);
  });
  const marcar = (e) => dias(e).forEach((d) => {
    if (e.abr === "CAMPO") campo.add(d);
    else if (e.abr === "AREAS") e.areas.forEach((a) => { if (!areaDias.has(a)) areaDias.set(a, new Set()); areaDias.get(a).add(d); });
    else { if (!congDias.has(e.cong.i)) congDias.set(e.cong.i, new Set()); congDias.get(e.cong.i).add(d); }
  });
  const lider = (papel, f) => mod.lideres.find((p) => p.lider.papel === papel && f(p.lider.escopo));
  const add = (e) => {
    e.areas = e.areas || [];
    e.fim = e.fim || e.ini;
    if (e.ini > diaDe(`${ano}-12-31`) || e.ini < diaDe(`${ano}-01-01`)) return;
    if (e.origem === "REGRA") {
      e.status = statusAno === "HOMOLOGADO" ? "HOMOLOGADO" : "DEFERIDO";
      e.proposto = MATRICULA_MIN + 2; e.propostaEm = cicloEm; e.decididoEm = cicloEm; e.homologadoEm = e.status === "HOMOLOGADO" ? homologadoEm : null;
      marcar(e); evs.push(e); return;
    }
    // a decisão (a do ano manda)
    let st;
    if (statusAno === "PLANEJAMENTO") st = "PROPOSTO";
    else if (statusAno === "CONSOLIDADO") st = r.pesos([["DEFERIDO", 92], ["INDEFERIDO", 8]]);
    else st = e.nivel === 1 ? r.pesos([["HOMOLOGADO", 96], ["CANCELADO", 4]]) : r.pesos([["HOMOLOGADO", 84], ["INDEFERIDO", 7], ["CANCELADO", 5], ["ABSORVIDO", 4]]);
    const ativo = ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"].includes(st);
    if (ativo) {
      for (let k = 0; k < 5 && choca(e); k++) { e.ini += 7; e.fim += 7; }
      if (choca(e) || e.ini > diaDe(`${ano}-12-31`)) return;
      marcar(e);
    }
    e.status = st;
    const tardia = statusAno === "HOMOLOGADO" && st === "HOMOLOGADO" && e.nivel > 1 && e.ini - 40 > homologadoEm && r.chance(0.1);
    if (statusAno === "PLANEJAMENTO") e.propostaEm = Math.min(BASE - 1, diaDe(`${ano - 1}-10-01`) + r.int(0, 45));
    else if (tardia) e.propostaEm = Math.min(BASE - 1, e.ini - r.int(15, 40));
    else e.propostaEm = diaDe(`${ano - 1}-11-01`) + r.int(0, 70);
    if (e.propostaEm >= e.ini) e.propostaEm = e.ini - 20;
    e.tardia = tardia;
    if (st !== "PROPOSTO") {
      e.decididoPor = tardia ? null : MATRICULA_MIN + 2;
      e.decididoEm = tardia ? e.propostaEm : consolidadoEm;
      if (st === "HOMOLOGADO" || st === "CANCELADO" || st === "ABSORVIDO") e.homologadoEm = tardia ? e.propostaEm : (statusAno === "HOMOLOGADO" ? homologadoEm : null);
      if (st === "INDEFERIDO") { e.motivo = "DECISAO_SECRETARIA"; e.detalhe = "A data foi reservada para outra atividade da igreja (dado fictício)."; }
      if (st === "ABSORVIDO") { e.motivo = "DECISAO_CLI"; e.detalhe = `Unificado com a programação geral (Resolução CLI nº ${r.int(1, 9)}/${ano}, fictícia)`; e.decididoEm = Math.min(BASE - 1, homologadoEm + r.int(20, 120)); }
      if (st === "CANCELADO") { e.canceladoEm = Math.max(homologadoEm + 1, Math.min(BASE - 1, e.ini - r.int(3, 20))); e.canceladoPor = e.proposto; e.motivoCanc = "Cancelado pela organização: mudança de agenda (dado fictício)."; }
    }
    evs.push(e);
  };
  // 1) o ciclo (REGRA): Ceia e CLI no último domingo de cada mês
  for (let mes = 1; mes <= 12; mes++) {
    const dom = diasDoMes(ano, mes, 0).pop();
    const geral = mes === 5 || mes === 10;
    add({ codigo: geral ? "SANTA_CEIA_GERAL" : "SANTA_CEIA_LOCAL", nivel: 1, origem: "REGRA", chave: `CEIA:${ano}-${pad2(mes)}`, ini: dom, abr: "CAMPO", titulo: `Santa Ceia${geral ? " Geral" : ""} do Senhor` });
    add({ codigo: "REUNIAO_CLI", nivel: 1, origem: "REGRA", chave: `CLI:${ano}-${pad2(mes)}`, ini: dom, abr: "CAMPO", hi: "14:00", hf: "17:00", orgao: "CLI", local: "Templo da Sede", titulo: "Reunião ordinária da CLI" });
  }
  // 2) campo (Nível 1 e 2), propostos pela Secretaria Geral
  const sg = MATRICULA_MIN + 2;
  const segundo = (mes, dow) => diasDoMes(ano, mes, dow)[1], primeiro = (mes, dow) => diasDoMes(ano, mes, dow)[0];
  for (const mes of [3, 6, 11]) add({ codigo: "BATISMO", nivel: 1, origem: "PROPOSTA", ini: segundo(mes, 0), abr: "CAMPO", hi: "09:00", hf: "12:00", proposto: sg, titulo: `Batismo nas águas — ${pad2(mes)}/${ano}` });
  add({ codigo: "ASSEMBLEIA_GERAL", nivel: 1, origem: "PROPOSTA", ini: segundo(3, 6), abr: "CAMPO", hi: "09:00", hf: "13:00", proposto: sg, local: "Templo da Sede", titulo: `Assembleia Geral Ordinária ${ano}` });
  add({ codigo: "CONGRESSO_UNIFICADO_DEPARTAMENTOS", nivel: 1, origem: "PROPOSTA", ini: segundo(7, 5), fim: segundo(7, 5) + 2, abr: "CAMPO", proposto: sg, titulo: `Congresso Unificado dos Departamentos ${ano}` });
  add({ codigo: "CONGRESSO_UNIFICADO_SECRETARIAS", nivel: 1, origem: "PROPOSTA", ini: segundo(9, 5), fim: segundo(9, 5) + 1, abr: "CAMPO", proposto: sg, titulo: `Congresso das Secretarias ${ano}` });
  for (const mes of [2, 8]) add({ codigo: "VIGILIA_GERAL", nivel: 2, origem: "PROPOSTA", ini: primeiro(mes, 5), abr: "CAMPO", hi: "22:00", proposto: sg, titulo: `Vigília Geral — ${pad2(mes)}/${ano}` });
  for (const mes of [4, 10]) add({ codigo: "CRUZADA_GERAL", nivel: 2, origem: "PROPOSTA", ini: primeiro(mes, 6), abr: "CAMPO", hi: "19:00", hf: "21:30", proposto: sg, titulo: `Cruzada Evangelística Geral — ${pad2(mes)}/${ano}` });
  for (const mes of [2, 6, 9]) add({ codigo: "CAPACITACAO_LIDERANCA", nivel: 2, origem: "PROPOSTA", ini: primeiro(mes, 6), abr: "CAMPO", hi: "08:00", hf: "12:00", proposto: sg, titulo: `Capacitação de Lideranças — ${pad2(mes)}/${ano}` });
  // 3) Áreas: um evento a cada 3 meses por Área (3º sábado) e o pré-congresso de cada Região
  mod.areas.forEach((a, ai) => {
    const pa = lider("Pastor de Área", (e) => e.area === a);
    for (let mes = 1 + (ai % 3); mes <= 12; mes += 3) {
      const codigo = r.pick(["CRUZADA_AREA", "INTERCAMBIO_PULPITO", "REUNIAO_ADMINISTRATIVA_AREA"]);
      const nome = { CRUZADA_AREA: "Cruzada Evangelística", INTERCAMBIO_PULPITO: "Intercâmbio de Púlpito", REUNIAO_ADMINISTRATIVA_AREA: "Reunião Administrativa" }[codigo];
      add({ codigo, nivel: 3, origem: "PROPOSTA", ini: diasDoMes(ano, mes, 6)[2], abr: "AREAS", areas: [ai], hi: "19:00", hf: "21:30", proposto: pa ? pa.matricula : sg, titulo: `${nome} — ${a.nome.replace(SUF_F, "")}` });
    }
  });
  mod.regioes.forEach((g, gi) => {
    const doReg = mod.areas.filter((a) => a.regiao === g.i).map((a) => a.i);
    add({ codigo: "PRE_CONGRESSO_REGIONAL", nivel: 3, origem: "PROPOSTA", ini: diasDoMes(ano, 6, 6)[2] - 7 + gi * 0, abr: "AREAS", areas: doReg, hi: "18:30", hf: "21:30", proposto: sg, titulo: `Pré-congresso — ${g.nome.replace(SUF_F, "")}` });
  });
  // 4) e 5) congregações: aniversário (Festividade: semanas diferentes na mesma Área), campanhas de oração, culto de ensino, casamentos, 15 anos, formaturas
  for (const c of mod.congs) {
    const dir = lider("Dirigente de Congregação", (e) => e.cong === c);
    const prop = dir ? dir.matricula : sg;
    const j = mod.areas[c.area].congs.indexOf(c);
    const nomeC = c.nome.replace(SUF_F, "");
    add({ codigo: "ANIVERSARIO_CONGREGACAO", nivel: 4, origem: "PROPOSTA", ini: diaDe(`${ano}-01-01`) + 7 * (3 + j * 6) + ((5 - diaSemana(diaDe(`${ano}-01-01`)) + 7) % 7), abr: "CONGREGACAO", cong: c, hi: "19:00", hf: "21:30", proposto: prop, titulo: `Aniversário da Congregação ${nomeC}` });
    for (const mes of [r.int(1, 6), r.int(7, 12)]) add({ codigo: "CAMPANHA_ORACAO", nivel: 4, origem: "PROPOSTA", ini: diasDoMes(ano, mes, 3)[1], fim: diasDoMes(ano, mes, 3)[1] + 4, abr: "CONGREGACAO", cong: c, hi: "19:30", hf: "21:00", proposto: prop, titulo: `Campanha de oração — ${nomeC} — ${pad2(mes)}/${ano}` });
    const mesE = r.int(2, 11);
    add({ codigo: "CULTO_ENSINO_FAMILIA", nivel: 4, origem: "PROPOSTA", ini: diasDoMes(ano, mesE, 4)[2], abr: "CONGREGACAO", cong: c, hi: "19:30", hf: "21:00", proposto: prop, titulo: `Culto de ensino para a família — ${nomeC} — ${pad2(mesE)}/${ano}` });
    for (let k = r.int(0, 3); k > 0; k--) {
      const mes = r.int(1, 12);
      const codigo = r.pick(["CASAMENTO_BODAS", "CASAMENTO_BODAS", "ANIVERSARIO_15_ANOS", "FORMATURA"]);
      const nome = { CASAMENTO_BODAS: "Casamento", ANIVERSARIO_15_ANOS: "Culto de 15 anos", FORMATURA: "Culto de formatura" }[codigo];
      add({ codigo, nivel: 5, origem: "PROPOSTA", ini: diasDoMes(ano, mes, 6)[r.pick([1, 3])] || diasDoMes(ano, mes, 6)[1], abr: "CONGREGACAO", cong: c, hi: "18:00", hf: "20:00", proposto: prop, titulo: `${nome} — ${nomeC} — ${pad2(mes)}/${ano} (${k})` });
    }
  }
  return { evs, cicloEm, consolidadoEm, homologadoEm };
}
async function etapaCalendario(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const tipos = new Map((await ler(req0, "SELECT TipoId, Codigo, Nivel FROM dbo.CalendarioTiposEvento")).map((x) => [x.Codigo, x]));
  if (!tipos.size) return ["(sem catálogo de tipos de evento: calendário pulado)"];
  const orgao = new Map((await ler(req0, "SELECT OrgaoId, Sigla FROM dbo.Orgaos")).map((x) => [x.Sigla, x.OrgaoId]));
  const anos = [ANO_BASE - 2, ANO_BASE - 1, ANO_BASE, ANO_BASE + 1];
  const statusAno = new Map((await ler(req0, `SELECT Ano, Status FROM dbo.CalendarioAnos WHERE Ano IN (${anos.join(",")})`)).map((x) => [x.Ano, x.Status]));
  const jaTem = new Set((await ler(req0, `SELECT DISTINCT Ano FROM dbo.CalendarioEventos WHERE Titulo LIKE ${LIKE_M}`)).map((x) => x.Ano));
  const chaves = new Set((await ler(req0, "SELECT RegraChave FROM dbo.CalendarioEventos WHERE RegraChave IS NOT NULL")).map((x) => x.RegraChave));
  const tot = { anos: 0, novosAnos: 0, ev: 0, pres: 0, org: 0, conv: 0, caixas: 0, lanc: 0 };
  for (const ano of anos) {
    if (jaTem.has(ano)) continue;
    const st = statusAno.get(ano) || (ano <= ANO_BASE ? "HOMOLOGADO" : "PLANEJAMENTO");
    const cal = gerarCalendario(mod, ano, st);
    const r = criarRng(`eventos:${ano}`);
    const evs = cal.evs.filter((e) => tipos.has(e.codigo) && !(e.chave && chaves.has(e.chave)));
    await emTransacao(pool, async (req) => {
      if (!statusAno.has(ano)) {
        const homolog = st === "HOMOLOGADO";
        await inserir(req, "CalendarioAnos", ["Ano", "Status", "PrazoPropostas", "CicloGeradoEm", "ConsolidadoPorMembroId", "ConsolidadoEm", "HomologadoPorMembroId", "HomologadoEm", "AtaReferencia", "CriadoEm"],
          [[ano, st, `${ano}-01-15`, momento(cal.cicloEm, 13), homolog ? MATRICULA_MIN + 2 : null, homolog ? momento(cal.consolidadoEm, 14) : null, homolog ? MATRICULA_MIN + 1 : null,
            homolog ? momento(cal.homologadoEm, 20) : null, homolog ? `Ata da CLI de ${isoDe(cal.homologadoEm).split("-").reverse().join("/")}${SUF_F}` : null, momento(cal.cicloEm - 1, 12)]]);
        tot.novosAnos++;
      }
      const hm = (h) => (h ? `${h}:00` : null);
      await inserir(req, "CalendarioEventos", ["Ano", "TipoId", "Nivel", "Titulo", "Descricao", "DataInicio", "DataFim", "HoraInicio", "HoraFim", "Abrangencia", "CongregacaoId", "Local", "OrgaoId",
        "Origem", "RegraChave", "Status", "Tardia", "MotivoIndeferimento", "DetalheDecisao", "PropostoPorMembroId", "PropostaEm", "DecididoPorMembroId", "DecididoEm", "HomologadoEm",
        "CanceladoPorMembroId", "CanceladoEm", "MotivoCancelamento", "PublicoNoSite", "AtualizadoEm"],
      evs.map((e, k) => [ano, tipos.get(e.codigo).TipoId, tipos.get(e.codigo).Nivel, `${e.titulo}${SUF_M}`, "Evento da massa fictícia da homologação.", isoDe(e.ini), isoDe(e.fim), hm(e.hi), hm(e.hf), e.abr,
        e.abr === "CONGREGACAO" ? m.cong.get(e.cong.nome) : null, e.local || null, e.orgao ? orgao.get(e.orgao) || null : null, e.origem, e.chave || null, e.status, !!e.tardia,
        e.motivo || null, e.detalhe || null, e.proposto, momento(e.propostaEm, 13, Math.floor(k / 60) % 60, k % 60), e.decididoPor || null, e.decididoEm ? momento(e.decididoEm, 14) : null,
        e.homologadoEm ? momento(e.homologadoEm, 20, 30) : null, e.canceladoPor || null, e.canceladoEm ? momento(e.canceladoEm, 15) : null, e.motivoCanc || null, false,
        momento(e.canceladoEm || e.homologadoEm || e.decididoEm || e.propostaEm, 21)]), 300);
      const ids = new Map((await ler(req, `SELECT EventoId, Titulo, CONVERT(char(10), DataInicio, 23) AS d, ISNULL(CongregacaoId, 0) AS c FROM dbo.CalendarioEventos WHERE Ano = ${ano} AND Titulo LIKE ${LIKE_M}`))
        .map((x) => [`${x.Titulo}|${x.d}|${x.c}`, x.EventoId]));
      const idDe = (e) => ids.get(`${e.titulo}${SUF_M}|${isoDe(e.ini)}|${e.abr === "CONGREGACAO" ? m.cong.get(e.cong.nome) : 0}`);
      await inserir(req, "CalendarioEventoAreas", ["EventoId", "AreaId"], evs.filter((e) => e.abr === "AREAS").flatMap((e) => e.areas.map((a) => [idDe(e), m.area.get(mod.areas[a].nome)])));
      // presença do dirigente na Santa Ceia Geral já acontecida
      const pres = [];
      for (const e of evs.filter((x) => x.codigo === "SANTA_CEIA_GERAL" && ["DEFERIDO", "HOMOLOGADO"].includes(x.status) && x.ini <= BASE)) {
        for (const c of mod.congs) {
          const s = r.pesos([["PRESENTE", 85], ["AUSENTE_JUSTIFICADA", 10], ["AUSENTE_INJUSTIFICADA", 5]]);
          pres.push([idDe(e), m.cong.get(c.nome), s, s === "AUSENTE_JUSTIFICADA" ? "Viagem de trabalho comunicada à Secretaria (dado fictício)." : null, MATRICULA_MIN + 2, momento(e.ini + 1, 15)]);
        }
      }
      await inserir(req, "CalendarioPresencasDirigente", ["EventoId", "CongregacaoId", "Situacao", "Justificativa", "RegistradoPorMembroId", "RegistradoEm"], pres, 1000);
      // o painel de eventos: organizadores, convidados e caixa dos ativos de campo e de Área (fora o ciclo)
      const orgs = [], convs = [], caixas = [], lancs = [], destinos = [], fechar = [];
      const ativos = evs.filter((e) => e.origem === "PROPOSTA" && ["PROPOSTO", "DEFERIDO", "HOMOLOGADO"].includes(e.status) && (e.nivel <= 3 || e.abr !== "CONGREGACAO"));
      for (const e of ativos) {
        const eid = idDe(e);
        const base = e.abr === "AREAS" ? mod.areas[e.areas[0]].congs[0] : mod.congs[0];
        const cands = base.pessoas.filter((p) => p.status === "ATIVO" && p.situacao === "EM_COMUNHAO" && p.idade >= 21 && !p.lider && !p.assento);
        if (cands.length < 2) continue;
        const o = r.pick(cands); let t = r.pick(cands); if (t === o) t = cands[(cands.indexOf(o) + 1) % cands.length];
        const designado = Math.min(BASE - 1, (e.decididoEm || e.propostaEm) + r.int(1, 10));
        orgs.push([eid, o.matricula, "ORGANIZADOR", e.proposto, momento(designado, 15)], [eid, t.matricula, "TESOUREIRO", e.proposto, momento(designado, 15, 5)]);
        for (let k = r.int(1, 3); k > 0; k--) {
          const tipo = r.pick(["PRELETOR", "PRELETOR", "CANTOR", "BANDA"]);
          const nome = tipo === "BANDA" ? `Banda ${r.pick(["Louvor Eterno", "Vozes do Céu", "Novo Cântico", "Ágape"])}${SUF_F}` : `${tipo === "PRELETOR" ? "Pr." : "Cantor(a)"} ${r.pick(NOMES_M.concat(NOMES_F))} ${r.pick(SOBRENOMES)}${SUF_M}`;
          const rep = r.chance(0.8), etica = !rep, nada = e.nivel <= 2;
          const submetido = Math.min(BASE - 1, designado + r.int(1, 5));
          const sit = e.status === "PROPOSTO" ? r.pick(["RASCUNHO", "EM_ANALISE"]) : (submetido + 4 < BASE && (!etica || e.ini - submetido >= 10)) ? r.pesos([["AUTORIZADO", 92], ["CANCELADO", 5], ["VETADO", etica || nada ? 3 : 0]]) : "EM_ANALISE";
          const sub = sit !== "RASCUNHO", parecer = sit === "AUTORIZADO" || sit === "VETADO" || sit === "CANCELADO";
          const veta = sit === "VETADO";
          convs.push([eid, nome, tipo, rep ? null : "Ministério Exemplo (fictício)", null, rep, false, sit, sub ? etica : false, sub ? nada : false, sub ? momento(submetido, 16) : null, sub ? o.matricula : null,
            parecer && etica ? (veta ? "DESFAVORAVEL" : "FAVORAVEL") : null, parecer && etica && veta ? "Testemunho público incompatível com a doutrina (dado fictício)." : null,
            parecer && etica ? MATRICULA_MIN + 1 : null, parecer && etica ? momento(submetido + 2, 10) : null,
            parecer && nada ? (veta && !etica ? "NEGADO" : "CONCEDIDO") : null, parecer && nada && veta && !etica ? "Pendência registrada na convenção de origem (dado fictício)." : null,
            parecer && nada ? MATRICULA_MIN + 1 : null, parecer && nada ? momento(submetido + 3, 10) : null,
            sit === "AUTORIZADO" || sit === "CANCELADO" ? momento(submetido + 4, 11) : null, sit === "AUTORIZADO" || sit === "CANCELADO" ? MATRICULA_MIN + 1 : null,
            sit === "CANCELADO" ? momento(Math.min(BASE - 1, submetido + 6), 12) : null, sit === "CANCELADO" ? o.matricula : null, sit === "CANCELADO" ? "A agenda do convidado mudou (dado fictício)." : null,
            o.matricula, momento(designado, 16)]);
        }
        // caixa: só evento de campo ou de Área, deferido ou homologado, já com data
        if (e.abr === "CONGREGACAO" || e.status === "PROPOSTO" || e.ini > BASE) continue;
        const abertoEm = Math.max(e.ini - 30, (e.decididoEm || e.propostaEm) + 1);
        caixas.push([eid, "ABERTO", momento(abertoEm, 14), t.matricula, momento(abertoEm, 14), t.matricula, isoDe(e.fim + 15), 1]);
        let ent = 0, sai = 0;
        const ultimo = Math.min(BASE, e.fim + 10);
        for (let k = r.int(2, 6); k > 0; k--) {
          const v = r.int(80, 2500) * 100 + r.int(0, 99); ent += v;
          lancs.push([eid, "ENTRADA", r.pick(["OFERTA_VOLUNTARIA", "OFERTA_VOLUNTARIA", "VENDAS_CANTINA", "CAMPANHA"]), reais(v), isoDe(Math.min(ultimo, e.ini + r.int(0, e.fim - e.ini))), "Entrada do evento (dado fictício).", null, t.matricula, momento(Math.min(ultimo, e.fim), 22)]);
        }
        for (let k = r.int(1, 5); k > 0; k--) {
          const v = r.int(50, 1800) * 100; sai += v;
          lancs.push([eid, "SAIDA", r.pick(["ESTRUTURA", "ALIMENTACAO", "SOM_E_MIDIA", "OFERTA_A_CONVIDADO", "MATERIAL", "TRANSPORTE"]), reais(v), isoDe(Math.max(abertoEm, e.ini - r.int(0, 20))),
            "Despesa do evento (dado fictício).", `NF-FICT-${eid}-${k}`, t.matricula, momento(Math.max(abertoEm, e.ini - 1), 12)]);
        }
        if (e.fim + 20 < BASE) fechar.push({ eid, ent, sai, encerrado: Math.min(BASE - 2, e.fim + r.int(3, 14)), por: t.matricula, conferir: r.chance(0.8) });
      }
      await inserir(req, "EventoOrganizadores", ["EventoId", "MembroId", "Papel", "DesignadoPorMembroId", "DesignadoEm"], orgs, 1000);
      await inserir(req, "EventoConvidados", ["EventoId", "Nome", "Tipo", "MinisterioOrigem", "Contato", "ReputacaoConhecida", "DivulgacaoAutorizada", "Status", "ExigeEtica", "ExigeNadaConsta",
        "SubmetidoEm", "SubmetidoPorMembroId", "EticaParecer", "EticaMotivo", "EticaPorMembroId", "EticaEm", "NadaConsta", "NadaConstaMotivo", "NadaConstaPorMembroId", "NadaConstaEm",
        "OficializadoEm", "OficializadoPorMembroId", "CanceladoEm", "CanceladoPorMembroId", "MotivoCancelamento", "CriadoPorMembroId", "CriadoEm"], convs, 300);
      await inserir(req, "EventoCaixas", ["EventoId", "Status", "AbertoEm", "AbertoPorMembroId", "DeclaracaoSemContaEm", "DeclaracaoSemContaPorMembroId", "PrazoEncerramentoEm", "Ciclo"], caixas);
      // os lançamentos entram com o caixa aberto (gatilho TR_EventoCaixaLancamentos_SoAberto); só depois o caixa é encerrado e conferido
      await inserir(req, "EventoCaixaLancamentos", ["EventoId", "Tipo", "Categoria", "Valor", "DataLancamento", "Descricao", "Comprovante", "RegistradoPorMembroId", "RegistradoEm"], lancs, 1000);
      for (const f of fechar) {
        const saldo = f.ent - f.sai;
        await req().query(`UPDATE dbo.EventoCaixas SET Status = N'${f.conferir ? "CONFERIDO" : "ENCERRADO"}', EncerradoEm = '${momento(f.encerrado, 18)}', EncerradoPorMembroId = ${f.por},
          TotalEntradas = ${(f.ent / 100).toFixed(2)}, TotalSaidas = ${(f.sai / 100).toFixed(2)}, Saldo = ${(saldo / 100).toFixed(2)},
          JustificativaDeficit = ${saldo < 0 ? lit("As despesas passaram das entradas; a diferença foi coberta pela Sede (dado fictício).") : "NULL"},
          ConferidoEm = ${f.conferir ? `'${momento(f.encerrado + 1, 15)}'` : "NULL"}, ConferidoPorMembroId = ${f.conferir ? MATRICULA_MIN + 3 : "NULL"} WHERE EventoId = ${f.eid}`);
        if (saldo > 0) destinos.push([f.eid, "RECOLHIDO_SEDE", reais(saldo), isoDe(f.encerrado), `DEP-FICT-${f.eid}`, null, momento(f.encerrado, 19)]);
      }
      await inserir(req, "EventoCaixaDestinos", ["EventoId", "Tipo", "Valor", "DataDestino", "Comprovante", "Descricao", "RegistradoEm"], destinos);
      tot.anos++; tot.ev += evs.length; tot.pres += pres.length; tot.org += orgs.length; tot.conv += convs.length; tot.caixas += caixas.length; tot.lanc += lancs.length;
    });
  }
  return tot.anos ? [`calendário de ${tot.anos} anos (${tot.novosAnos} anos criados): ${tot.ev} eventos, ${tot.pres} presenças de dirigente na Ceia Geral, ${tot.org} organizadores, ${tot.conv} convidados, ${tot.caixas} caixas com ${tot.lanc} lançamentos`] : [];
}

// ------------------------------------------------------------------ cuidado pastoral (v7.11, migração 148; mural do site, 149) ------------------------------------------------------------------
// Por congregação: pedidos de oração (moderados para o boletim, não publicados, aguardando; alguns com sinal de risco e o item urgente), e a fila do
// cuidado: afastamento detectado das pessoas que estão se afastando (o mesmo padrão da massa), visitantes, novos convertidos, pedidos de visita e
// pós-internação, pedidos de oração com contato — abertos (no prazo ou já subidos à Área), concluídos e cancelados, com a história (criado, atribuído,
// contatos e visitas com acompanhante, escalonado, encerrado), notas pastorais nos três níveis de sigilo e quem as leu. Mais alguns pedidos do mural do site.
// PERMANENTE (gatilhos): itens, eventos e pedidos não se apagam — prendem a pessoa e a congregação. As notas e as leituras saem pela marca de purga do app.
const TEXTOS_PEDIDO = { SAUDE: "Peço oração pela minha saúde; vou fazer exames nesta semana.", FAMILIA: "Peço oração pela paz na minha família.", TRABALHO: "Peço oração por uma porta de emprego.",
  LUTO: "Peço oração pela família que perdeu um ente querido.", ESPIRITUAL: "Peço oração para crescer na fé e na oração.", GRATIDAO: "Quero agradecer a Deus pela cura recebida.", OUTRO: "Peço oração por um pedido especial." };
function gerarCuidado(mod, c) {
  const r = criarRng(`cuidado:${c.i}`);
  const dir = mod.lideres.find((p) => p.lider.papel === "Dirigente de Congregação" && p.lider.escopo.cong === c);
  const pa = mod.lideres.find((p) => p.lider.papel === "Pastor de Área" && p.lider.escopo.area === mod.areas[c.area]);
  const ativos = c.pessoas.filter((p) => p.status === "ATIVO" && p.idade >= 14 && p !== dir);
  const pedidos = [], itens = [];
  let seq = 0;
  const nomeCong = c.nome.replace(SUF_F, "");
  // pedidos de oração do último ano
  for (let k = r.int(4, 10); k > 0 && ativos.length; k--) {
    const sol = r.pick(ativos);
    const cat = r.pick(Object.keys(TEXTOS_PEDIDO));
    const para = cat === "LUTO" || r.chance(0.3) ? "OUTRA_PESSOA" : "PROPRIO";
    const criado = BASE - r.int(1, 360);
    const viaLider = r.chance(0.25) && dir;
    const risco = c.tendencia === "CAI" && r.chance(0.06);
    const quer = risco || r.chance(0.3);
    const pode = !risco && r.chance(0.7);
    let mod_ = risco ? r.pick(["AGUARDANDO", "NAO_PUBLICAR"]) : criado > BASE - 10 ? "AGUARDANDO" : pode ? r.pesos([["APROVADO", 75], ["NAO_PUBLICAR", 25]]) : "NAO_PUBLICAR";
    const moderado = mod_ === "AGUARDANDO" ? null : criado + r.int(0, 3);
    const tb = mod_ === "APROVADO" ? (cat === "GRATIDAO" ? `Alguém da Congregação ${nomeCong} agradece a Deus e pede que a igreja agradeça junto.` : `Alguém da Congregação ${nomeCong} pede oração ${para === "OUTRA_PESSOA" ? "por uma pessoa querida" : cat === "SAUDE" ? "pela saúde" : "por um pedido especial"}.`).slice(0, 200) : null;
    const p = { seq: seq++, sol, para, cat, criado, viaLider, risco, quer, pode, moderacao: mod_, moderado, tb, texto: risco ? "Estou num momento muito difícil e às vezes penso em desistir de tudo (texto fictício de teste)." : `${TEXTOS_PEDIDO[cat]} (pedido fictício)` };
    pedidos.push(p);
    if (quer) itens.push({ tipo: "PEDIDO_ORACAO", membro: sol, origem: "PEDIDO_ORACAO", pedido: p, criado, urgente: risco, motivo: risco ? "Pedido de oração com SINAL DE RISCO (o texto está em Pedidos de oração → Sinal de risco)." : `Pedido de oração: ${cat === "SAUDE" ? "Saúde" : "Família e outros"} (pediu contato).`, prazoDias: risco ? 1 : 3 });
  }
  // afastamento detectado (as pessoas da massa que estão se afastando)
  for (const p of c.pessoas.filter((x) => x.evasao && x.status === "ATIVO" && x.situacao !== "SEM_COMUNHAO")) {
    const criado = p.evasao.inicio + r.int(42, 70);
    if (criado > BASE - 2) continue;
    itens.push({ tipo: "AFASTAMENTO", membro: p, origem: "DETECCAO", criado, motivo: "A frequência caiu em relação ao costume da própria pessoa.", resumo: `EBD e reuniões: antes ${r.int(16, 22)} de 24 (${r.int(70, 92)}%); nas últimas 6 semanas ${r.int(0, 1)} de 6 (${r.int(0, 17)}%).`, prazoDias: 14 });
  }
  // visitantes, novos convertidos, visitas e pós-internação
  for (let k = r.int(2, 6); k > 0; k--) itens.push({ tipo: "VISITANTE", nome: `${r.pick(NOMES_M.concat(NOMES_F))} ${r.pick(SOBRENOMES)} (visitante fictício)`, origem: "LIDERANCA", criado: BASE - r.int(2, 330), motivo: "Visitou o culto de domingo e deixou o contato.", prazoDias: 2 });
  for (const p of c.pessoas.filter((x) => x.status === "ATIVO" && x.forma === "BATISMO" && x.batismo > BASE - 200)) itens.push({ tipo: "NOVO_CONVERTIDO", membro: p, origem: "LIDERANCA", criado: p.batismo + 1, motivo: "Batizado recentemente: acompanhar os primeiros passos.", prazoDias: 7 });
  const idosos = c.pessoas.filter((x) => x.status === "ATIVO" && x.idade >= 60 && x !== dir);
  for (let k = Math.min(idosos.length, r.int(0, 3)); k > 0; k--) {
    const p = r.pick(idosos);
    const tipo = r.chance(0.5) ? "PEDIDO_VISITA" : "POS_INTERNACAO";
    itens.push({ tipo, membro: p, origem: r.chance(0.5) ? "PEDIDO_MEMBRO" : "LIDERANCA", criado: BASE - r.int(3, 300), motivo: tipo === "PEDIDO_VISITA" ? "Pediu uma visita em casa — Melhor contato/horário: à tarde." : "Teve alta do hospital e pediu visita.", prazoDias: tipo === "PEDIDO_VISITA" ? 7 : 3 });
  }
  // desfecho de cada item (um aberto por pessoa e tipo); a história de cada um
  const abertos = new Set();
  for (const it of itens) {
    it.seq = seq++;
    const chave = it.membro ? `${it.tipo}:${it.membro.matricula}` : null;
    const recente = it.criado > BASE - 25;
    let status = recente ? "ABERTO" : r.pesos([["CONCLUIDO", 80], ["ABERTO", 12], ["CANCELADO", 8]]);
    if (it.urgente && status === "CANCELADO") status = "CONCLUIDO";
    if (status === "ABERTO" && chave) { if (abertos.has(chave)) status = "CONCLUIDO"; else abertos.add(chave); }
    it.status = status;
    it.responsavel = dir && it.membro !== dir ? dir : null;
    it.nivel = it.responsavel ? "CONGREGACAO" : "AREA";
    it.prazo = it.criado + it.prazoDias;
    it.eventos = [{ tipo: "CRIADO", membro: it.origem === "DETECCAO" ? null : it.origem === "PEDIDO_MEMBRO" ? it.membro : dir, em: it.criado, prazo: it.prazo }];
    if (it.responsavel) it.eventos.push({ tipo: "ATRIBUIDO", membro: null, em: it.criado, resp: it.responsavel });
    if (status === "ABERTO" && it.prazo < BASE) {
      // venceu sem contato: subiu um degrau (a rotina das 7h faz isto todo dia)
      it.eventos.push({ tipo: "ESCALONADO", membro: null, em: it.prazo + 1, de: it.nivel, para: "AREA", prazo: it.prazo + 4 });
      it.nivel = "AREA"; it.escal = 1; it.prazo = it.prazo + 4;
    }
    if (status !== "ABERTO" || r.chance(0.5)) {
      const visita = it.tipo === "PEDIDO_VISITA" || it.tipo === "POS_INTERNACAO";
      const forma = visita ? (it.tipo === "POS_INTERNACAO" ? "VISITA_HOSPITAL" : "VISITA_LAR") : r.pick(["LIGACAO", "MENSAGEM", "NO_CULTO"]);
      const em = Math.min(BASE - 1, it.criado + r.int(1, Math.max(1, it.prazoDias)));
      const conseguiu = r.chance(0.8);
      const acomp = visita ? `${r.pick(NOMES_M.concat(NOMES_F))} ${r.pick(SOBRENOMES)}` : null;
      it.eventos.push({ tipo: "CONTATO", membro: it.responsavel || pa || null, em, forma, conseguiu, acomp, obs: "Conversa de acompanhamento (dado fictício)." });
      if (conseguiu) it.primeiroContato = em;
    }
    if (status !== "ABERTO") {
      it.encerrado = Math.min(BASE - 1, it.criado + r.int(2, 30));
      it.desfecho = status === "CANCELADO" ? r.pick(["DUPLICADO", "ENGANO"]) : it.tipo === "AFASTAMENTO" ? r.pick(["ACOMPANHADO", "INTEGRADO", "NAO_LOCALIZADO", "RECUSOU_CONTATO"]) : r.pick(["ACOMPANHADO", "INTEGRADO", "ENCAMINHADO"]);
      it.encerradoPor = it.responsavel || (pa || null);
      it.eventos.push({ tipo: status === "CANCELADO" ? "CANCELADO" : "CONCLUIDO", membro: it.encerradoPor, em: it.encerrado, obs: status === "CANCELADO" ? "Registrado em duplicidade (dado fictício)." : null });
    }
    it.eventos.sort((a, b) => a.em - b.em);
  }
  // notas pastorais (o autor é o Dirigente ou o Pastor de Área; nunca sobre si mesmo) e as leituras
  const notas = [];
  for (const it of itens) {
    if (!r.chance(0.35)) continue;
    const autor = r.chance(0.6) && dir && it.membro !== dir ? dir : pa;
    if (!autor || it.membro === autor) continue;
    const nivel = r.pesos([["EQUIPE", 50], ["LIDERANCA", 35], ["PASTORAL", 15]]);
    const nota = { seq: seq++, item: it, autor, nivel, em: Math.min(BASE - 1, it.criado + r.int(1, 20)), texto: `${nivel === "PASTORAL" ? "Conversa reservada" : "Acompanhamento"}: a pessoa está sendo cuidada; retomar o contato em breve (nota fictícia).` };
    nota.leitores = [pa, mod.lideres.find((p) => p.lider.papel === "Secretário Geral")].filter((x) => x && x !== autor && x !== it.membro && (nivel !== "PASTORAL" || x.cargo === "PASTOR")).filter(() => r.chance(0.6));
    notas.push(nota);
  }
  return { pedidos, itens, notas, dir, pa };
}
async function etapaCuidado(pool, mod) {
  const m = await mapas(pool);
  exigirTerritorio(mod, m);
  const req0 = () => pool.request();
  const comItens = new Set((await ler(req0, `SELECT DISTINCT CongregacaoId FROM dbo.CuidadoItens WHERE CongregacaoId IN (${Q_CONG})`)).map((x) => x.CongregacaoId));
  const tot = { cong: 0, ped: 0, itens: 0, ev: 0, notas: 0, leit: 0 };
  for (const c of mod.congs) {
    const cid = m.cong.get(c.nome);
    const g = gerarCuidado(mod, c);
    if (comItens.has(cid)) {
      // os itens, os eventos e os pedidos ficaram (o banco não os apaga); as notas e as leituras saíram com o --apagar: refaz só elas, se faltam
      const temNota = (await ler(req0, `SELECT TOP 1 1 AS x FROM dbo.NotasPastorais WHERE ItemId IN (SELECT ItemId FROM dbo.CuidadoItens WHERE CongregacaoId = ${cid})
        OR MembroId IN (SELECT MembroId FROM dbo.MembroReferencia WHERE CongregacaoId = ${cid})`)).length;
      if (temNota || !g.notas.length) continue;
      await emTransacao(pool, async (req) => {
        const itemId = new Map((await ler(req, `SELECT ItemId, CONVERT(varchar(19), CriadoEm, 126) AS em FROM dbo.CuidadoItens WHERE CongregacaoId = ${cid}`)).map((x) => [x.em, x.ItemId]));
        const idDoItem = (it) => itemId.get(momento(it.criado, 13, Math.floor(it.seq / 60) % 60, it.seq % 60));
        await inserir(req, "NotasPastorais", ["MembroId", "ItemId", "Nivel", "Texto", "AutorMembroId", "CriadaEm"],
          g.notas.map((n) => [n.item.membro ? n.item.membro.matricula : null, n.item.membro ? null : idDoItem(n.item), n.nivel, n.texto, n.autor.matricula, momento(n.em, 16, Math.floor(n.seq / 60) % 60, n.seq % 60)]));
        const notaId = new Map((await ler(req, `SELECT NotaId, CONVERT(varchar(19), CriadaEm, 126) AS em FROM dbo.NotasPastorais WHERE MembroId IN (SELECT MembroId FROM dbo.MembroReferencia WHERE CongregacaoId = ${cid}) OR ItemId IN (SELECT ItemId FROM dbo.CuidadoItens WHERE CongregacaoId = ${cid})`)).map((x) => [x.em, x.NotaId]));
        const leit = g.notas.flatMap((n) => n.leitores.map((l, k) => [notaId.get(momento(n.em, 16, Math.floor(n.seq / 60) % 60, n.seq % 60)), l.matricula, momento(Math.min(BASE, n.em + 1 + k), 18)]));
        await inserir(req, "NotasPastoraisLeituras", ["NotaId", "MembroId", "LidaEm"], leit);
        tot.notas += g.notas.length; tot.leit += leit.length; tot.cong++;
      });
      continue;
    }
    if (!g.itens.length && !g.pedidos.length) continue;
    await emTransacao(pool, async (req) => {
      await inserir(req, "PedidosOracao", ["CongregacaoId", "SolicitanteMembroId", "RegistradoPorMembroId", "ParaQuem", "Categoria", "Texto", "PodeBoletim", "QuerContato", "Moderacao", "ModeradoPorMembroId",
        "ModeradoEm", "TextoBoletim", "BoletimAte", "Risco", "RiscoOrigem", "RiscoJaTeve", "RiscoMarcadoEm", "Origem", "CriadoEm"],
      g.pedidos.map((p) => [cid, p.sol.matricula, p.viaLider ? g.dir.matricula : p.sol.matricula, p.para, p.cat, p.texto, p.pode, p.quer, p.moderacao,
        p.moderado !== null ? (g.dir && g.dir !== p.sol ? g.dir.matricula : (g.pa ? g.pa.matricula : MATRICULA_MIN + 2)) : null, p.moderado !== null ? momento(p.moderado, 17) : null,
        p.tb, p.moderacao === "APROVADO" ? isoDe(p.moderado + 14) : null, p.risco, p.risco ? "AUTOMATICO" : null, p.risco, p.risco ? momento(p.criado, 12, 0, p.seq % 60) : null, "SISTEMA",
        momento(p.criado, 12, Math.floor(p.seq / 60) % 60, p.seq % 60)]));
      const pedId = new Map((await ler(req, `SELECT PedidoId, CONVERT(varchar(19), CriadoEm, 126) AS em FROM dbo.PedidosOracao WHERE CongregacaoId = ${cid}`)).map((x) => [x.em, x.PedidoId]));
      await inserir(req, "CuidadoItens", ["Tipo", "CongregacaoId", "MembroId", "PessoaNome", "PessoaContato", "Motivo", "Origem", "PedidoOracaoId", "Urgente", "DeteccaoResumo", "ResponsavelMembroId",
        "PrazoEm", "Nivel", "Escalonamentos", "Status", "Desfecho", "EncerradoEm", "EncerradoPorMembroId", "PrimeiroContatoEm", "CriadoEm", "CriadoPorMembroId"],
      g.itens.map((it) => [it.tipo, cid, it.membro ? it.membro.matricula : null, it.nome || null, it.nome ? "(00) 90000-0000" : null, it.motivo, it.origem,
        it.pedido ? pedId.get(momento(it.pedido.criado, 12, Math.floor(it.pedido.seq / 60) % 60, it.pedido.seq % 60)) : null, !!it.urgente, it.resumo || null,
        it.responsavel ? it.responsavel.matricula : null, momento(it.prazo, 20), it.nivel, it.escal || 0, it.status, it.desfecho || null, it.encerrado ? momento(it.encerrado, 19) : null,
        it.encerradoPor ? it.encerradoPor.matricula : null, it.primeiroContato ? momento(it.primeiroContato, 15) : null, momento(it.criado, 13, Math.floor(it.seq / 60) % 60, it.seq % 60),
        it.origem === "DETECCAO" ? null : it.origem === "PEDIDO_MEMBRO" ? it.membro.matricula : (g.dir ? g.dir.matricula : MATRICULA_MIN + 2)]));
      const itemId = new Map((await ler(req, `SELECT ItemId, CONVERT(varchar(19), CriadoEm, 126) AS em FROM dbo.CuidadoItens WHERE CongregacaoId = ${cid}`)).map((x) => [x.em, x.ItemId]));
      const idDoItem = (it) => itemId.get(momento(it.criado, 13, Math.floor(it.seq / 60) % 60, it.seq % 60));
      const evs = g.itens.flatMap((it) => it.eventos.map((e, k) => [idDoItem(it), e.tipo, e.membro ? e.membro.matricula : null, momento(e.em, e.tipo === "CRIADO" ? 13 : 15, k), e.forma || null,
        e.forma ? e.conseguiu : null, e.acomp || null, e.obs || null, e.de || null, e.para || null, e.prazo ? momento(e.prazo, 20) : null, e.resp ? e.resp.matricula : null]));
      await inserir(req, "CuidadoEventos", ["ItemId", "Tipo", "MembroId", "Em", "Forma", "Conseguiu", "Acompanhante", "Observacao", "NivelDe", "NivelPara", "PrazoNovo", "ResponsavelMembroId"], evs, 500);
      await inserir(req, "NotasPastorais", ["MembroId", "ItemId", "Nivel", "Texto", "AutorMembroId", "CriadaEm"],
        g.notas.map((n) => [n.item.membro ? n.item.membro.matricula : null, n.item.membro ? null : idDoItem(n.item), n.nivel, n.texto, n.autor.matricula, momento(n.em, 16, Math.floor(n.seq / 60) % 60, n.seq % 60)]));
      const notaId = new Map((await ler(req, `SELECT NotaId, CONVERT(varchar(19), CriadaEm, 126) AS em FROM dbo.NotasPastorais WHERE MembroId IN (SELECT MembroId FROM dbo.MembroReferencia WHERE CongregacaoId = ${cid}) OR ItemId IN (SELECT ItemId FROM dbo.CuidadoItens WHERE CongregacaoId = ${cid})`)).map((x) => [x.em, x.NotaId]));
      const leit = g.notas.flatMap((n) => n.leitores.map((l, k) => [notaId.get(momento(n.em, 16, Math.floor(n.seq / 60) % 60, n.seq % 60)), l.matricula, momento(Math.min(BASE, n.em + 1 + k), 18)]));
      await inserir(req, "NotasPastoraisLeituras", ["NotaId", "MembroId", "LidaEm"], leit);
      tot.cong++; tot.ped += g.pedidos.length; tot.itens += g.itens.length; tot.ev += evs.length; tot.notas += g.notas.length; tot.leit += leit.length;
    });
  }
  // o mural de oração do site (só o confidencial ou com risco chega; sem congregação; só o nível geral vê)
  const marcaSite = "(pedido fictício do mural do site)";
  if (!(await ler(req0, `SELECT TOP 1 1 AS x FROM dbo.PedidosOracao WHERE Origem = N'SITE' AND Texto LIKE N'%${marcaSite}%'`)).length) {
    const r = criarRng("mural-site");
    const linhas = [];
    for (let k = 0; k < 6; k++) linhas.push([null, null, null, "PROPRIO", "OUTRO", `Peço oração em sigilo por uma situação na família ${marcaSite}`, false, false, k < 3 ? "AGUARDANDO" : "NAO_PUBLICAR",
      k < 3 ? null : MATRICULA_MIN + 2, k < 3 ? null : momento(BASE - 20 + k, 17), null, null, false, null, false, null, "SITE", momento(BASE - r.int(5, 90), 11, k), true, r.chance(0.5) ? "Visitante do site (fictício)" : null]);
    await emTransacao(pool, (req) => inserir(req, "PedidosOracao", ["CongregacaoId", "SolicitanteMembroId", "RegistradoPorMembroId", "ParaQuem", "Categoria", "Texto", "PodeBoletim", "QuerContato", "Moderacao",
      "ModeradoPorMembroId", "ModeradoEm", "TextoBoletim", "BoletimAte", "Risco", "RiscoOrigem", "RiscoJaTeve", "RiscoMarcadoEm", "Origem", "CriadoEm", "SoNivelGeral", "SolicitanteNome"], linhas));
    tot.ped += linhas.length;
  }
  return tot.cong ? [`cuidado pastoral de ${tot.cong} congregações: ${tot.ped} pedidos de oração (com o mural do site), ${tot.itens} itens, ${tot.ev} eventos, ${tot.notas} notas, ${tot.leit} leituras`] : [];
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
    const FUNCOES = { territorio: etapaTerritorio, membros: etapaMembros, lideranca: etapaLideranca, reunioes: etapaReunioes, financeiro: etapaFinanceiro, distritos: etapaDistritos,
      relatorios: etapaRelatorios, prestacoes: etapaPrestacoes, psc: etapaPsc, ebd: etapaEbd, escalas: etapaEscalas,
      calendario: etapaCalendario, cuidado: etapaCuidado };
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
