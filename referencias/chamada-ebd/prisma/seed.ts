import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { FUNCIONALIDADES, MATRIZ_PADRAO } from "../src/lib/permissoes-catalogo";
import { PAPEIS_SISTEMA } from "../src/lib/papeis-sistema";
import { CATALOGO_CONQUISTAS } from "../src/lib/conquistas-catalogo";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Configuração de escala do gerador de dados de demonstração
// ---------------------------------------------------------------------------
const AREAS_POR_CAMPO = 2;
const CONGREGACOES_POR_AREA = 3;
const TURMAS_MIN = 3;
const TURMAS_MAX = 4;
const ALUNOS_MIN = 6;
const ALUNOS_MAX = 10;
const SEMANAS_HISTORICO = 8;
const SENHA_PADRAO = "123456";

// ---------------------------------------------------------------------------
// Bancos de nomes / utilitários de aleatoriedade
// ---------------------------------------------------------------------------
const NOMES = [
  "Ana", "Maria", "João", "José", "Pedro", "Paulo", "Lucas", "Mateus", "Marcos", "Rafael",
  "Gabriel", "Daniel", "Davi", "Samuel", "Isaque", "Josué", "Ester", "Débora", "Sara", "Rute",
  "Raquel", "Rebeca", "Naomi", "Priscila", "Juliana", "Camila", "Fernanda", "Patrícia", "Aline",
  "Bianca", "Carolina", "Beatriz", "Larissa", "Vanessa", "Renata", "Simone", "Cristina", "Adriana",
  "Sandra", "Márcia", "Roberto", "Carlos", "Fernando", "Ricardo", "Eduardo", "André", "Bruno",
  "Diego", "Felipe", "Gustavo", "Henrique", "Igor", "Leonardo", "Rodrigo", "Thiago", "Vinícius",
  "Alexandre", "Antônio", "Francisco", "Sebastião", "Cláudio", "Isabela", "Letícia", "Natália",
];
const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima",
  "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes",
  "Vieira", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes", "Marques",
  "Machado", "Mendes", "Freitas", "Cardoso", "Ramos", "Gonçalves", "Correia", "Teixeira", "Araújo",
];
const CIDADES: [string, string][] = [
  ["São Paulo", "SP"], ["Campinas", "SP"], ["Guarulhos", "SP"], ["Rio de Janeiro", "RJ"],
  ["Niterói", "RJ"], ["Belo Horizonte", "MG"], ["Contagem", "MG"], ["Curitiba", "PR"],
  ["Londrina", "PR"], ["Salvador", "BA"], ["Feira de Santana", "BA"], ["Recife", "PE"],
  ["Fortaleza", "CE"], ["Brasília", "DF"], ["Goiânia", "GO"], ["Manaus", "AM"],
  ["Porto Alegre", "RS"], ["Florianópolis", "SC"],
];
const BAIRROS_CONGREGACAO = [
  "Central", "Jardim das Flores", "Vila Nova", "Boa Vista", "Monte Sinai", "Betânia", "Getsêmani",
  "Nazaré", "Emaús", "Canaã", "Peniel", "Shalom", "Betel", "Ebenézer", "Monte Horebe",
  "Vila Esperança", "Jardim América", "Parque das Nações",
];
const CATEGORIAS_TURMA = [
  "BERCARIO", "JARDIM_INFANCIA", "PRIMARIOS", "JUNIORES", "PRE_ADOLESCENTES",
  "ADOLESCENTES", "JOVENS", "ADULTOS", "NOVOS_CONVERTIDOS", "MELHOR_IDADE",
] as const;
const CATEGORIA_LABEL: Record<string, string> = {
  BERCARIO: "Berçário", JARDIM_INFANCIA: "Jardim de Infância", PRIMARIOS: "Primários",
  JUNIORES: "Juniores", PRE_ADOLESCENTES: "Pré-Adolescentes", ADOLESCENTES: "Adolescentes",
  JOVENS: "Jovens", ADULTOS: "Adultos", NOVOS_CONVERTIDOS: "Novos Convertidos", MELHOR_IDADE: "Melhor Idade",
};

const PASTORES = ["Pr. Josué Andrade", "Pr. Elias Ferreira", "Pr. Caleb Souza", "Pra. Miriam Costa", "Pr. Timóteo Alves"];

const BANCO_PERGUNTAS = [
  { enunciado: "Quantos livros tem a Bíblia (versão protestante)?", certa: "66", erradas: ["73", "39", "27"] },
  { enunciado: "Quem construiu a arca por ordem de Deus?", certa: "Noé", erradas: ["Abraão", "Moisés", "Davi"] },
  { enunciado: "Em que cidade Jesus nasceu?", certa: "Belém", erradas: ["Nazaré", "Jerusalém", "Cafarnaum"] },
  { enunciado: "Quem foi lançado na cova dos leões?", certa: "Daniel", erradas: ["Jonas", "Elias", "Josué"] },
  { enunciado: "Qual o primeiro livro da Bíblia?", certa: "Gênesis", erradas: ["Êxodo", "Levítico", "Salmos"] },
  { enunciado: "Quantos discípulos Jesus escolheu?", certa: "12", erradas: ["10", "7", "70"] },
  { enunciado: "Quem traiu Jesus?", certa: "Judas Iscariotes", erradas: ["Pedro", "Tomé", "Filipe"] },
  { enunciado: "Qual o último livro da Bíblia?", certa: "Apocalipse", erradas: ["Judas", "Malaquias", "Atos"] },
  { enunciado: "Quem foi engolido por um grande peixe?", certa: "Jonas", erradas: ["Elias", "Eliseu", "Isaías"] },
  { enunciado: "Em que monte Moisés recebeu os Dez Mandamentos?", certa: "Sinai", erradas: ["Sião", "Carmelo", "Horebe"] },
  { enunciado: "Quem era conhecido como o homem mais sábio de Israel?", certa: "Salomão", erradas: ["Davi", "Saul", "Roboão"] },
  { enunciado: "Quantos dias Jesus jejuou no deserto?", certa: "40", erradas: ["7", "12", "30"] },
];

const BANCO_VERDADEIRO_FALSO = [
  { enunciado: "Jesus nasceu em Belém.", resposta: true },
  { enunciado: "Moisés atravessou o Mar Vermelho a nado.", resposta: false },
  { enunciado: "Davi derrotou Golias com uma funda e uma pedra.", resposta: true },
  { enunciado: "Jonas foi engolido por uma baleia branca.", resposta: false },
  { enunciado: "Paulo escreveu várias cartas (epístolas) do Novo Testamento.", resposta: true },
  { enunciado: "O dilúvio durou apenas 7 dias.", resposta: false },
  { enunciado: "Adão e Eva foram os primeiros seres humanos, segundo Gênesis.", resposta: true },
];

const BANCO_ORDENAR = [
  { enunciado: "Coloque os livros na ordem em que aparecem na Bíblia:", itens: ["Gênesis", "Êxodo", "Levítico", "Números"] },
  { enunciado: "Ordene os eventos da criação, do primeiro ao último:", itens: ["Luz", "Céu", "Terra e mares", "Sol, lua e estrelas", "Animais", "Ser humano"] },
  { enunciado: "Ordene do menor para o maior:", itens: ["1 semana", "1 mês", "1 trimestre", "1 ano"] },
  { enunciado: "Coloque em ordem cronológica:", itens: ["Nascimento de Jesus", "Batismo de Jesus", "Crucificação", "Ressurreição"] },
];

const BANCO_COMPLETAR = [
  { enunciado: "Quantos dias durou o dilúvio na história de Noé (só o número)?", resposta: "40" },
  { enunciado: "Qual o nome do irmão de Moisés que falava por ele?", resposta: "Arão" },
  { enunciado: "Complete: 'Ordena o teu caminho ao Senhor, confia nele, e o mais ele _____.' — verbo que falta", resposta: "fará" },
  { enunciado: "Quantos apóstolos Jesus escolheu (só o número)?", resposta: "12" },
];

const BANCO_CORRESPONDENCIA = [
  {
    enunciado: "Ligue cada personagem ao que ele é conhecido por fazer:",
    pares: [
      { esquerda: "Noé", direita: "Construiu a arca" },
      { esquerda: "Davi", direita: "Derrotou Golias" },
      { esquerda: "Moisés", direita: "Recebeu os Dez Mandamentos" },
      { esquerda: "Jonas", direita: "Foi engolido por um peixe" },
    ],
  },
  {
    enunciado: "Ligue cada livro ao Testamento em que ele está:",
    pares: [
      { esquerda: "Gênesis", direita: "Antigo Testamento" },
      { esquerda: "Mateus", direita: "Novo Testamento" },
      { esquerda: "Salmos", direita: "Antigo Testamento" },
      { esquerda: "Apocalipse", direita: "Novo Testamento" },
    ],
  },
];

const CATEGORIAS_FINANCEIRO_ENTRADA = ["Dízimos", "Ofertas especiais", "Doação de campanha", "Venda de rifa/bazar"];
const CATEGORIAS_FINANCEIRO_SAIDA = ["Conta de luz", "Conta de água", "Material de limpeza", "Manutenção do templo", "Material de escritório"];

const TEMAS_LICAO = [
  "A graça de Deus", "O caráter de Cristo", "A vida em família", "O fruto do Espírito",
  "A oração eficaz", "A igreja no Novo Testamento", "Os mandamentos", "A mordomia cristã",
  "A segunda vinda de Cristo", "O perdão", "A fé que vence", "A santificação", "O chamado missionário",
];

function aleatorio<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function aleatorioInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function chance(probabilidade: number): boolean {
  return Math.random() < probabilidade;
}
function embaralhar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const matriculasUsadas = new Set<string>(["1", "2", "3", "4"]);
function gerarMatricula(): string {
  let m: string;
  do {
    m = String(aleatorioInt(100000, 999999));
  } while (matriculasUsadas.has(m));
  matriculasUsadas.add(m);
  return m;
}
function gerarNomePessoa(): string {
  return `${aleatorio(NOMES)} ${aleatorio(SOBRENOMES)}`;
}

function ultimosDomingos(quantidade: number): Date[] {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const domingoAtual = new Date(hoje);
  domingoAtual.setDate(hoje.getDate() - diaSemana);
  domingoAtual.setHours(12, 0, 0, 0);

  const domingos: Date[] = [];
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(domingoAtual);
    d.setDate(domingoAtual.getDate() - i * 7);
    domingos.push(d);
  }
  return domingos.reverse();
}

// ---------------------------------------------------------------------------
async function limparBanco() {
  const tabelas = [
    "respostaPergunta", "respostaAtividade", "alternativa", "pergunta", "atividade",
    "pagamentoRevista", "pedidoRevistaItem", "pedidoRevista", "revista",
    "lancamentoFinanceiro", "certificadoEmitido",
    "conquistaAluno", "conquistaRequisito", "conquista",
    "presencaAluno", "chamada", "licao", "turmaProfessor",
    "permissaoExcecao", "permissaoPapel", "funcionalidade",
    "atribuicao", "aluno", "turma", "congregacao", "area", "scoreConfig", "campo", "papel",
  ] as const;
  for (const t of tabelas) {
    // @ts-expect-error acesso dinâmico por nome de modelo
    await prisma[t].deleteMany();
  }
}

type AlunoGerado = {
  id: string; matricula: string; nome: string; turmaId: string; congregacaoId: string;
  telefone: string; membroIgreja: boolean; batizado: boolean; dataNascimento: Date;
};
type TurmaGerada = { id: string; nome: string; congregacaoId: string; categoria: string };
type CongregacaoGerada = { id: string; areaId: string; campoId: string };
type AreaGerada = { id: string; campoId: string };

async function main() {
  console.log("Limpando banco...");
  await limparBanco();

  const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

  console.log("Semeando papéis nativos...");
  const papeisCriados = await Promise.all(
    PAPEIS_SISTEMA.map((p) =>
      prisma.papel.create({
        data: { chave: p.chave, nome: p.nome, nivel: p.nivel, ordem: p.ordem, escopoAmplo: p.escopoAmplo, sistema: true },
      })
    )
  );
  const papelIdPorChave = new Map(papeisCriados.map((p) => [p.chave, p.id]));
  function papelId(chave: string): string {
    const id = papelIdPorChave.get(chave);
    if (!id) throw new Error(`Papel "${chave}" não encontrado — verifique PAPEIS_SISTEMA.`);
    return id;
  }

  console.log("Semeando catálogo de funcionalidades e matriz de permissões padrão...");
  const funcionalidadesCriadas = await Promise.all(
    FUNCIONALIDADES.map((f) =>
      prisma.funcionalidade.create({
        data: { chave: f.chave, nome: f.nome, categoria: f.categoria, ordem: f.ordem },
      })
    )
  );
  const funcIdPorChave = new Map(funcionalidadesCriadas.map((f) => [f.chave, f.id]));
  const permissoesPapelData = Object.keys(MATRIZ_PADRAO).flatMap((chaveRole) =>
    MATRIZ_PADRAO[chaveRole].map((chave) => ({ papelId: papelId(chaveRole), funcionalidadeId: funcIdPorChave.get(chave)!, permitido: true }))
  );
  await prisma.permissaoPapel.createMany({ data: permissoesPapelData });

  console.log("Semeando catálogo de conquistas...");
  const conquistasCriadas = await Promise.all(
    CATALOGO_CONQUISTAS.map((c) =>
      prisma.conquista.create({
        data: {
          chave: c.chave, nome: c.nome, descricao: c.descricao, icone: c.icone,
          tipoRegra: c.tipoRegra, parametro: c.parametro ?? null, oculta: !!c.oculta, ordem: c.ordem,
        },
      })
    )
  );
  const conquistaIdPorChave = new Map(conquistasCriadas.map((c) => [c.chave, c.id]));
  const requisitosData = CATALOGO_CONQUISTAS.flatMap((c) =>
    (c.requer ?? []).map((requisitoChave) => ({
      conquistaId: conquistaIdPorChave.get(c.chave)!,
      requisitoId: conquistaIdPorChave.get(requisitoChave)!,
    }))
  );
  if (requisitosData.length > 0) {
    await prisma.conquistaRequisito.createMany({ data: requisitosData });
  }

  // ---------------------------------------------------------------------
  // 1) Hierarquia (Campo > Área > Congregação > Turma) — sem pessoas ainda
  // ---------------------------------------------------------------------
  console.log("Criando hierarquia (campos, áreas, congregações, turmas)...");
  const CAMPOS = ["Campo Metropolitano", "Campo do Interior", "Campo Litoral"];
  const areasGeradas: AreaGerada[] = [];
  const congregacoesGeradas: CongregacaoGerada[] = [];
  const turmasGeradas: TurmaGerada[] = [];

  for (const nomeCampo of CAMPOS) {
    const campo = await prisma.campo.create({
      data: { nome: nomeCampo, sigla: nomeCampo.split(" ")[1]?.slice(0, 4).toUpperCase(), scoreConfig: { create: {} } },
    });

    for (let a = 1; a <= AREAS_POR_CAMPO; a++) {
      const area = await prisma.area.create({ data: { nome: `Área ${a}`, campoId: campo.id } });
      areasGeradas.push({ id: area.id, campoId: campo.id });

      const bairros = embaralhar(BAIRROS_CONGREGACAO);
      for (let c = 0; c < CONGREGACOES_POR_AREA; c++) {
        const [cidade, estado] = aleatorio(CIDADES);
        const congregacao = await prisma.congregacao.create({
          data: {
            nome: `Congregação ${bairros[c % bairros.length]}`,
            areaId: area.id,
            cidade,
            estado,
            pastorResponsavel: aleatorio(PASTORES),
          },
        });
        congregacoesGeradas.push({ id: congregacao.id, areaId: area.id, campoId: campo.id });

        const categorias = embaralhar([...CATEGORIAS_TURMA]).slice(0, aleatorioInt(TURMAS_MIN, TURMAS_MAX));
        for (const categoria of categorias) {
          const turma = await prisma.turma.create({
            data: { nome: CATEGORIA_LABEL[categoria], categoria: categoria as (typeof CATEGORIAS_TURMA)[number], congregacaoId: congregacao.id },
          });
          turmasGeradas.push({ id: turma.id, nome: turma.nome, congregacaoId: congregacao.id, categoria });
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // 2) Todo mundo é aluno primeiro — gera a massa de alunos matriculados
  // ---------------------------------------------------------------------
  const alunosParaCriar: AlunoGerado[] = [];
  for (const turma of turmasGeradas) {
    const numAlunos = aleatorioInt(ALUNOS_MIN, ALUNOS_MAX);
    for (let i = 0; i < numAlunos; i++) {
      alunosParaCriar.push({
        id: randomUUID(),
        matricula: gerarMatricula(),
        nome: gerarNomePessoa(),
        turmaId: turma.id,
        congregacaoId: turma.congregacaoId,
        telefone: `(11) 9${aleatorioInt(1000, 9999)}-${aleatorioInt(1000, 9999)}`,
        membroIgreja: chance(0.6),
        batizado: chance(0.5),
        dataNascimento: new Date(aleatorioInt(1950, 2018), aleatorioInt(0, 11), aleatorioInt(1, 28)),
      });
    }
  }
  console.log(`Criando ${alunosParaCriar.length} alunos...`);
  await prisma.aluno.createMany({ data: alunosParaCriar });

  const alunosPorTurma = new Map<string, AlunoGerado[]>();
  const alunosPorCongregacao = new Map<string, AlunoGerado[]>();
  for (const al of alunosParaCriar) {
    (alunosPorTurma.get(al.turmaId) ?? alunosPorTurma.set(al.turmaId, []).get(al.turmaId)!).push(al);
    (alunosPorCongregacao.get(al.congregacaoId) ?? alunosPorCongregacao.set(al.congregacaoId, []).get(al.congregacaoId)!).push(al);
  }

  // ---------------------------------------------------------------------
  // 3) Concede papéis administrativos a alunos JÁ EXISTENTES (ninguém é
  //    criado "de fora" — todo papel é concedido em cima de uma matrícula).
  // ---------------------------------------------------------------------
  console.log("Concedendo papéis administrativos a alunos já matriculados...");
  const professorPorTurma = new Map<string, string>(); // turmaId -> alunoId

  for (const congregacao of congregacoesGeradas) {
    const pool = embaralhar(alunosPorCongregacao.get(congregacao.id) ?? []);
    if (pool.length === 0) continue;

    const superintendente = pool[0];
    const secretaria = pool[1 % pool.length];
    await prisma.aluno.update({ where: { id: superintendente.id }, data: { senhaHash } });
    await prisma.atribuicao.create({ data: { alunoId: superintendente.id, papelId: papelId("SUPERINTENDENTE"), congregacaoId: congregacao.id } });
    if (secretaria.id !== superintendente.id) {
      await prisma.aluno.update({ where: { id: secretaria.id }, data: { senhaHash } });
    }
    await prisma.atribuicao.create({ data: { alunoId: secretaria.id, papelId: papelId("SECRETARIO"), congregacaoId: congregacao.id } });

    const tesoureiro = pool[2 % pool.length];
    if (tesoureiro.id !== superintendente.id && tesoureiro.id !== secretaria.id) {
      await prisma.aluno.update({ where: { id: tesoureiro.id }, data: { senhaHash } });
    }
    await prisma.atribuicao.create({ data: { alunoId: tesoureiro.id, papelId: papelId("TESOUREIRO"), congregacaoId: congregacao.id } });

    const turmasDaCongregacao = turmasGeradas.filter((t) => t.congregacaoId === congregacao.id);
    let cursor = 3;
    for (const turma of turmasDaCongregacao) {
      const professor = pool[cursor % pool.length];
      cursor += 1;
      professorPorTurma.set(turma.id, professor.id);
      await prisma.aluno.update({ where: { id: professor.id }, data: { senhaHash } });
      const jaEhProfessorAqui = await prisma.atribuicao.findFirst({
        where: { alunoId: professor.id, papelId: papelId("PROFESSOR"), congregacaoId: congregacao.id },
      });
      if (!jaEhProfessorAqui) {
        await prisma.atribuicao.create({ data: { alunoId: professor.id, papelId: papelId("PROFESSOR"), congregacaoId: congregacao.id } });
      }
      await prisma.turmaProfessor.upsert({
        where: { turmaId_alunoId: { turmaId: turma.id, alunoId: professor.id } },
        update: {},
        create: { turmaId: turma.id, alunoId: professor.id },
      });
    }
  }

  for (const area of areasGeradas) {
    const congsDaArea = congregacoesGeradas.filter((c) => c.areaId === area.id);
    const pool = embaralhar(congsDaArea.flatMap((c) => alunosPorCongregacao.get(c.id) ?? []));
    const coordenador = pool[0];
    if (coordenador) {
      await prisma.aluno.update({ where: { id: coordenador.id }, data: { senhaHash } });
      await prisma.atribuicao.create({ data: { alunoId: coordenador.id, papelId: papelId("COORDENADOR_AREA"), areaId: area.id } });
    }
  }

  for (const campo of await prisma.campo.findMany()) {
    const areasDoCampo = areasGeradas.filter((a) => a.campoId === campo.id);
    const congsDoCampo = congregacoesGeradas.filter((c) => areasDoCampo.some((a) => a.id === c.areaId));
    const pool = embaralhar(congsDoCampo.flatMap((c) => alunosPorCongregacao.get(c.id) ?? []));
    const coordenador = pool[0];
    if (coordenador) {
      await prisma.aluno.update({ where: { id: coordenador.id }, data: { senhaHash } });
      await prisma.atribuicao.create({ data: { alunoId: coordenador.id, papelId: papelId("COORDENADOR_CAMPO"), campoId: campo.id } });
    }
  }

  // ---------------------------------------------------------------------
  // 4) Contas de destaque, com matrícula fixa — para explorar o sistema
  // ---------------------------------------------------------------------
  console.log("Criando contas de destaque (matrícula fixa)...");
  const contasDemo: { papel: string; matricula: string }[] = [];

  const turmaAdmin = turmasGeradas[0];
  const admin = await prisma.aluno.create({
    data: {
      matricula: "1", nome: "Administrador Geral", senhaHash,
      turmaId: turmaAdmin.id, congregacaoId: turmaAdmin.congregacaoId,
      atribuicoes: { create: { papelId: papelId("ADMIN") } },
    },
  });
  alunosPorTurma.get(turmaAdmin.id)?.push({ ...admin, telefone: "", membroIgreja: true, batizado: true } as AlunoGerado);
  contasDemo.push({ papel: "ADMIN — acesso total", matricula: admin.matricula });

  const congA = congregacoesGeradas[0];
  const congB = congregacoesGeradas[congregacoesGeradas.length - 1];
  const turmaMultiPapel = turmasGeradas.find((t) => t.congregacaoId === congA.id)!;
  const multipapeis = await prisma.aluno.create({
    data: {
      matricula: "2", nome: "Débora Multi-Papéis (demo)", senhaHash,
      turmaId: turmaMultiPapel.id, congregacaoId: turmaMultiPapel.congregacaoId,
      atribuicoes: { create: [{ papelId: papelId("COORDENADOR_AREA"), areaId: congA.areaId }, { papelId: papelId("SUPERINTENDENTE"), congregacaoId: congB.id }] },
    },
  });
  alunosPorTurma.get(turmaMultiPapel.id)?.push({ ...multipapeis, telefone: "", membroIgreja: true, batizado: true } as AlunoGerado);
  contasDemo.push({ papel: "MULTI-PAPEL — Coordenador de Área + Superintendente (troque de painel!)", matricula: multipapeis.matricula });

  const turmaProfessorDemo = turmasGeradas[1];
  const professorDemo = await prisma.aluno.create({
    data: {
      matricula: "3", nome: "Professor Demo", senhaHash,
      turmaId: turmaProfessorDemo.id, congregacaoId: turmaProfessorDemo.congregacaoId,
      atribuicoes: { create: { papelId: papelId("PROFESSOR"), congregacaoId: turmaProfessorDemo.congregacaoId } },
    },
  });
  await prisma.turmaProfessor.create({ data: { turmaId: turmaProfessorDemo.id, alunoId: professorDemo.id } });
  alunosPorTurma.get(turmaProfessorDemo.id)?.push({ ...professorDemo, telefone: "", membroIgreja: true, batizado: true } as AlunoGerado);
  contasDemo.push({ papel: "PROFESSOR (matrícula fixa, sempre igual)", matricula: professorDemo.matricula });

  const turmaAlunoPuro = turmasGeradas[2];
  const alunoPuro = await prisma.aluno.create({
    data: {
      matricula: "4", nome: "Aluno Puro (demo)",
      turmaId: turmaAlunoPuro.id, congregacaoId: turmaAlunoPuro.congregacaoId,
      // sem senhaHash de propósito: entra só com a matrícula.
    },
  });
  alunosPorTurma.get(turmaAlunoPuro.id)?.push({ ...alunoPuro, telefone: "", membroIgreja: true, batizado: true } as AlunoGerado);
  contasDemo.push({ papel: "ALUNO puro — SEM SENHA, entra só com a matrícula", matricula: alunoPuro.matricula });

  const idsAlunosReservados = new Set([admin.id, multipapeis.id, professorDemo.id, alunoPuro.id]);

  // ---------------------------------------------------------------------
  // 5) Lições — cada congregação abre a lição atual (aberta) e tem uma
  //    fechada anterior, sempre pelo/a superintendente ou secretário(a).
  // ---------------------------------------------------------------------
  console.log("Abrindo lições por congregação...");
  const licaoAbertaPorCongregacao = new Map<string, { id: string; abertaEm: Date }>(); // congregacaoId -> lição aberta
  for (const congregacao of congregacoesGeradas) {
    const responsavelAtribuicao = await prisma.atribuicao.findFirst({
      where: { congregacaoId: congregacao.id, papel: { chave: { in: ["SUPERINTENDENTE", "SECRETARIO"] } } },
    });
    if (!responsavelAtribuicao) continue;

    const numeroFechada = aleatorioInt(1, 6);
    await prisma.licao.create({
      data: {
        congregacaoId: congregacao.id, trimestre: 2, ano: 2026, numero: numeroFechada,
        titulo: `Lição ${numeroFechada} — ${aleatorio(TEMAS_LICAO)}`, status: "FECHADA",
        abertaPorId: responsavelAtribuicao.alunoId, fechadaEm: new Date(),
      },
    });

    const numeroAberta = numeroFechada + 1;
    const aberta = await prisma.licao.create({
      data: {
        congregacaoId: congregacao.id, trimestre: 2, ano: 2026, numero: numeroAberta,
        titulo: `Lição ${numeroAberta} — ${aleatorio(TEMAS_LICAO)}`, status: "ABERTA",
        abertaPorId: responsavelAtribuicao.alunoId,
      },
    });
    licaoAbertaPorCongregacao.set(congregacao.id, { id: aberta.id, abertaEm: aberta.abertaEm });
  }

  // ---------------------------------------------------------------------
  // 6) Histórico de chamadas
  // ---------------------------------------------------------------------
  console.log("Gerando histórico de chamadas...");
  const domingos = ultimosDomingos(SEMANAS_HISTORICO);
  const chamadasParaCriar: {
    id: string; turmaId: string; data: Date; lancadoPorId: string; licaoId: string | null;
    visitantes: number; biblias: number; revistas: number; oferta: number; inicioPontual: boolean;
  }[] = [];
  const presencasParaCriar: {
    id: string; chamadaId: string; alunoId: string; presente: boolean; trouxeBiblia: boolean; trouxeRevista: boolean;
  }[] = [];

  for (const turma of turmasGeradas) {
    const alunosDaTurma = alunosPorTurma.get(turma.id) ?? [];
    const lancador = professorPorTurma.get(turma.id) ?? alunosDaTurma[0]?.id;
    if (!lancador) continue;
    const licaoAberta = licaoAbertaPorCongregacao.get(turma.congregacaoId) ?? null;

    domingos.forEach((data, i) => {
      const chamadaId = randomUUID();
      let biblias = 0;
      let revistas = 0;

      for (const aluno of alunosDaTurma) {
        const presente = chance(0.78);
        const trouxeBiblia = presente && chance(0.65);
        const trouxeRevista = presente && chance(0.55);
        if (trouxeBiblia) biblias += 1;
        if (trouxeRevista) revistas += 1;
        presencasParaCriar.push({ id: randomUUID(), chamadaId, alunoId: aluno.id, presente, trouxeBiblia, trouxeRevista });
      }

      chamadasParaCriar.push({
        id: chamadaId, turmaId: turma.id, data, lancadoPorId: lancador,
        licaoId: i === domingos.length - 1 ? (licaoAberta?.id ?? null) : null,
        visitantes: chance(0.4) ? aleatorioInt(1, 3) : 0,
        biblias, revistas,
        oferta: Math.round(aleatorioInt(0, 4000) / 10) / 10,
        inicioPontual: chance(0.7),
      });
    });
  }

  await prisma.chamada.createMany({ data: chamadasParaCriar });
  console.log(`Criadas ${chamadasParaCriar.length} chamadas.`);

  console.log(`Criando ${presencasParaCriar.length} registros de presença...`);
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < presencasParaCriar.length; i += TAMANHO_LOTE) {
    await prisma.presencaAluno.createMany({ data: presencasParaCriar.slice(i, i + TAMANHO_LOTE) });
  }

  // ---------------------------------------------------------------------
  // 7) Atividades (quizzes) — garante que as turmas das contas de destaque
  //    sempre tenham uma atividade pendente pra testar o fluxo do aluno.
  // ---------------------------------------------------------------------
  console.log("Criando atividades (quizzes) de exemplo...");
  const turmasReservadas = [turmaMultiPapel, turmaProfessorDemo, turmaAlunoPuro];
  const idsReservados = new Set(turmasReservadas.map((t) => t.id));
  const turmasComAtividade = [...turmasReservadas, ...embaralhar(turmasGeradas.filter((t) => !idsReservados.has(t.id))).slice(0, 7)];

  for (const turma of turmasComAtividade) {
    const criadoPorId = professorPorTurma.get(turma.id) ?? alunosPorTurma.get(turma.id)?.[0]?.id;
    if (!criadoPorId) continue;
    const licaoAberta = licaoAbertaPorCongregacao.get(turma.congregacaoId);
    // Espelha a regra real: sem lição aberta, não existe atividade.
    if (!licaoAberta) continue;
    const prazoAtividade = new Date(licaoAberta.abertaEm);
    prazoAtividade.setDate(prazoAtividade.getDate() + 3);

    const numAtividades = aleatorioInt(1, 2);
    for (let n = 0; n < numAtividades; n++) {
      // Mistura tipos de pergunta pra demonstrar todos: algumas de múltipla
      // escolha do banco principal + uma de cada tipo novo (V/F, ordenar,
      // completar) em toda atividade gerada.
      const perguntasMultipla = embaralhar(BANCO_PERGUNTAS).slice(0, aleatorioInt(2, 3));
      const vf = aleatorio(BANCO_VERDADEIRO_FALSO);
      const ordenarEscolhido = aleatorio(BANCO_ORDENAR);
      const completarEscolhido = aleatorio(BANCO_COMPLETAR);
      const correspondenciaEscolhida = aleatorio(BANCO_CORRESPONDENCIA);

      let ordemPergunta = 0;
      const perguntasParaCriar = [
        ...perguntasMultipla.map((p) => ({
          tipo: "MULTIPLA_ESCOLHA" as const,
          enunciado: p.enunciado,
          ordem: ordemPergunta++,
          alternativas: {
            create: embaralhar([{ texto: p.certa, correta: true }, ...p.erradas.map((e) => ({ texto: e, correta: false }))]).map(
              (alt, i) => ({ ...alt, ordem: i })
            ),
          },
        })),
        {
          tipo: "VERDADEIRO_FALSO" as const,
          enunciado: vf.enunciado,
          ordem: ordemPergunta++,
          alternativas: {
            create: [
              { texto: "Verdadeiro", correta: vf.resposta === true, ordem: 0 },
              { texto: "Falso", correta: vf.resposta === false, ordem: 1 },
            ],
          },
        },
        {
          tipo: "ORDENAR" as const,
          enunciado: ordenarEscolhido.enunciado,
          ordem: ordemPergunta++,
          alternativas: { create: ordenarEscolhido.itens.map((texto, i) => ({ texto, ordem: i, ordemCorreta: i + 1 })) },
        },
        {
          tipo: "COMPLETAR" as const,
          enunciado: completarEscolhido.enunciado,
          ordem: ordemPergunta++,
          respostaEsperada: completarEscolhido.resposta,
        },
        {
          tipo: "CORRESPONDENCIA" as const,
          enunciado: correspondenciaEscolhida.enunciado,
          ordem: ordemPergunta++,
          alternativas: {
            create: correspondenciaEscolhida.pares.map((par, i) => ({ texto: par.esquerda, parTexto: par.direita, ordem: i })),
          },
        },
      ];

      const atividade = await prisma.atividade.create({
        data: {
          turmaId: turma.id, criadoPorId, licaoId: licaoAberta.id, prazo: prazoAtividade,
          titulo: `Quiz — ${turma.nome} #${n + 1}`, descricao: "Revisão da lição da semana.", pontosBase: 10,
          perguntas: { create: perguntasParaCriar },
        },
        include: { perguntas: { include: { alternativas: true } } },
      });

      const alunosDaTurma = (alunosPorTurma.get(turma.id) ?? []).filter((a) => !idsAlunosReservados.has(a.id));
      const respondentes = embaralhar(alunosDaTurma).slice(0, Math.ceil(alunosDaTurma.length * 0.6));
      for (const aluno of respondentes) {
        let acertos = 0;
        const respostasParaCriar: { perguntaId: string; alternativaId?: string; ordemSubmetida?: number; respostaTexto?: string }[] = [];

        for (const p of atividade.perguntas) {
          if (p.tipo === "COMPLETAR") {
            const acertou = chance(0.7);
            if (acertou) acertos += 1;
            respostasParaCriar.push({ perguntaId: p.id, respostaTexto: acertou ? p.respostaEsperada ?? "" : "resposta errada" });
          } else if (p.tipo === "ORDENAR") {
            const acertou = chance(0.7);
            if (acertou) acertos += 1;
            const posicoesCorretas = p.alternativas.map((a) => a.ordemCorreta!);
            const posicoesSubmetidas = acertou ? posicoesCorretas : embaralhar(posicoesCorretas);
            p.alternativas.forEach((alt, i) => {
              respostasParaCriar.push({ perguntaId: p.id, alternativaId: alt.id, ordemSubmetida: posicoesSubmetidas[i] });
            });
          } else if (p.tipo === "CORRESPONDENCIA") {
            const acertouTudo = chance(0.7);
            const textosDireita = embaralhar(p.alternativas.map((a) => a.parTexto!));
            if (acertouTudo) acertos += 1;
            p.alternativas.forEach((alt, i) => {
              respostasParaCriar.push({
                perguntaId: p.id,
                alternativaId: alt.id,
                respostaTexto: acertouTudo ? alt.parTexto! : textosDireita[i],
              });
            });
          } else {
            const acertou = chance(0.7);
            const alternativa = acertou ? p.alternativas.find((a) => a.correta)! : aleatorio(p.alternativas.filter((a) => !a.correta));
            if (acertou) acertos += 1;
            respostasParaCriar.push({ perguntaId: p.id, alternativaId: alternativa.id });
          }
        }

        const pontosGanhos = Math.round((atividade.pontosBase * acertos) / atividade.perguntas.length);
        await prisma.respostaAtividade.create({
          data: { atividadeId: atividade.id, alunoId: aluno.id, acertos, totalPerguntas: atividade.perguntas.length, pontosGanhos, respostas: { create: respostasParaCriar } },
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // 8) Revistas — catálogo com os 3 preços + pedidos por congregação
  // ---------------------------------------------------------------------
  console.log("Criando catálogo de revistas e pedidos...");
  const CATALOGO_REVISTAS: { titulo: string; categoria: (typeof CATEGORIAS_TURMA)[number] }[] = [
    { titulo: "Lições Bíblicas — Adultos", categoria: "ADULTOS" },
    { titulo: "Lições Bíblicas — Jovens", categoria: "JOVENS" },
    { titulo: "Lições Bíblicas — Adolescentes", categoria: "ADOLESCENTES" },
    { titulo: "Lições Bíblicas — Juniores", categoria: "JUNIORES" },
    { titulo: "Lições Bíblicas — Primários", categoria: "PRIMARIOS" },
    { titulo: "Lições Bíblicas — Jardim de Infância", categoria: "JARDIM_INFANCIA" },
  ];
  const revistasCriadas: Awaited<ReturnType<typeof prisma.revista.create>>[] = [];
  for (const r of CATALOGO_REVISTAS) {
    const precoFornecedor = Math.round(aleatorioInt(600, 900)) / 100;
    revistasCriadas.push(
      await prisma.revista.create({
        data: {
          titulo: r.titulo, categoria: r.categoria, trimestre: 2, ano: 2026,
          precoFornecedor,
          precoCongregacao: Math.round((precoFornecedor + 1.5) * 100) / 100,
          precoAluno: Math.round((precoFornecedor + 3) * 100) / 100,
        },
      })
    );
  }

  const congregacoesComPedido = embaralhar(congregacoesGeradas).slice(0, 10);
  let cenarioPedido = 0;
  for (const congregacao of congregacoesComPedido) {
    const responsavel = await prisma.atribuicao.findFirst({
      where: { congregacaoId: congregacao.id, papel: { chave: { in: ["SUPERINTENDENTE", "SECRETARIO"] } } },
    });
    if (!responsavel) continue;

    const turmasDaCongregacao = turmasGeradas.filter((t) => t.congregacaoId === congregacao.id);
    const itens = turmasDaCongregacao.slice(0, aleatorioInt(2, Math.max(2, turmasDaCongregacao.length))).map((turma) => {
      const compativel = revistasCriadas.filter((r) => r.categoria === turma.categoria);
      const revista = compativel.length > 0 ? aleatorio(compativel) : aleatorio(revistasCriadas);
      return { revistaId: revista.id, turmaId: turma.id, quantidade: aleatorioInt(6, 12), precoUnitario: revista.precoCongregacao };
    });
    const valorTotal = itens.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0);

    const pedido = await prisma.pedidoRevista.create({
      data: { congregacaoId: congregacao.id, criadoPorId: responsavel.alunoId, trimestre: 2, ano: 2026, itens: { create: itens } },
    });

    // Alterna 4 cenários pra demonstrar o fluxo de aprovação em duas etapas:
    // pago e fechado / parcial com uma parcela ainda aguardando aprovação /
    // só aguardando aprovação (aparece na fila do coordenador) / sem nada.
    cenarioPedido += 1;
    const cenario = cenarioPedido % 4;
    if (cenario === 0) {
      await prisma.pagamentoRevista.create({
        data: {
          pedidoId: pedido.id, valor: Math.round(valorTotal * 100) / 100, observacao: "Pagamento integral",
          registradoPorId: responsavel.alunoId, status: "APROVADO", aprovadoPorId: admin.id, aprovadoEm: new Date(),
        },
      });
      await prisma.pedidoRevista.update({ where: { id: pedido.id }, data: { status: "PAGO", fechado: true, fechadoEm: new Date() } });
    } else if (cenario === 1) {
      await prisma.pagamentoRevista.create({
        data: {
          pedidoId: pedido.id, valor: Math.round(valorTotal * 0.5 * 100) / 100, observacao: "Primeira parcela",
          registradoPorId: responsavel.alunoId, status: "APROVADO", aprovadoPorId: admin.id, aprovadoEm: new Date(),
        },
      });
      await prisma.pagamentoRevista.create({
        data: { pedidoId: pedido.id, valor: Math.round(valorTotal * 0.3 * 100) / 100, observacao: "Segunda parcela — pago em espécie", registradoPorId: responsavel.alunoId },
      });
      await prisma.pedidoRevista.update({ where: { id: pedido.id }, data: { status: "PARCIAL" } });
    } else if (cenario === 2) {
      await prisma.pagamentoRevista.create({
        data: { pedidoId: pedido.id, valor: Math.round(valorTotal * 0.4 * 100) / 100, observacao: "Pago via Pix, aguardando confirmação", registradoPorId: responsavel.alunoId },
      });
    }
    // cenario === 3: pedido criado sem nenhum pagamento ainda.
  }

  // ---------------------------------------------------------------------
  // 9) Financeiro — lançamentos manuais de entrada/saída por congregação
  // ---------------------------------------------------------------------
  console.log("Criando lançamentos financeiros de exemplo...");
  const congregacoesComFinanceiro = embaralhar(congregacoesGeradas).slice(0, 12);
  for (const congregacao of congregacoesComFinanceiro) {
    const responsavel = await prisma.atribuicao.findFirst({
      where: { congregacaoId: congregacao.id, papel: { chave: { in: ["TESOUREIRO", "SUPERINTENDENTE"] } } },
    });
    if (!responsavel) continue;

    const numLancamentos = aleatorioInt(3, 6);
    for (let i = 0; i < numLancamentos; i++) {
      const tipo = chance(0.6) ? "SAIDA" : "ENTRADA";
      const categoria = tipo === "ENTRADA" ? aleatorio(CATEGORIAS_FINANCEIRO_ENTRADA) : aleatorio(CATEGORIAS_FINANCEIRO_SAIDA);
      const dataLancamento = new Date();
      dataLancamento.setDate(dataLancamento.getDate() - aleatorioInt(0, SEMANAS_HISTORICO * 7));
      await prisma.lancamentoFinanceiro.create({
        data: {
          congregacaoId: congregacao.id,
          tipo,
          categoria,
          valor: aleatorioInt(5000, 80000) / 100,
          data: dataLancamento,
          criadoPorId: responsavel.alunoId,
        },
      });
    }
  }

  const totalAlunos = await prisma.aluno.count();
  const totalTurmas = await prisma.turma.count();
  const totalCongregacoes = await prisma.congregacao.count();
  const totalComPapel = await prisma.aluno.count({ where: { atribuicoes: { some: {} } } });

  console.log("\n============================================================");
  console.log("Seed concluído!");
  console.log(
    `${CAMPOS.length} campos · ${totalCongregacoes} congregações · ${totalTurmas} turmas · ${totalAlunos} alunos (${totalComPapel} com algum papel administrativo)`
  );
  console.log(`Senha de quem tem papel: ${SENHA_PADRAO}. Aluno puro entra só com a matrícula.`);
  console.log("\nContas de destaque para explorar o sistema (login por MATRÍCULA):");
  contasDemo.forEach((c) => console.log(`  - ${c.papel}\n    matrícula: ${c.matricula}`));
  console.log("\nTodos os demais alunos/professores/coordenadores têm matrícula aleatória de");
  console.log("6 dígitos — veja a lista completa em /alunos ou /usuarios depois de entrar como admin.");
  console.log("============================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
