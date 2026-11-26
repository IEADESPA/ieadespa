// tools/ensaio-importacao/gerar-massa.js — a MASSA FICTÍCIA da importação do sistema pago, no tamanho da igreja inteira (missão C da FASE 10, 26/11/2026:
// o ensaio de 05/12, o "vai ou não vai" do Membros; docs/plano/ensaio-importacao-05-12.md).
//
// Só dados de mentira: os nomes saem de listas de nomes comuns combinadas por um número (nunca uma pessoa de verdade), o e-mail é do domínio reservado
// example.org, o celular é da faixa (91) 90000-xxxx, o CPF tem os dígitos certos sobre uma base inventada (97xxxxxxx), e a matrícula começa em 810001
// (fora das faixas da massa da homologação, 700000 a 799999). O mesmo número de semente dá sempre o mesmo arquivo.
//
// O formato é o da planilha do sistema pago (shared/importacaoMembros.js): CSV com ';', o cabeçalho
// MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF, a IGREJA como "IEADESPA - <nome>", o estado civil vazio como
// ".: NAO INFORMADO :.", linhas incompletas e a matrícula 0. Com os CASOS DIFÍCEIS plantados em quantidade conhecida (o "plantio"): a matrícula zerada,
// vazia, que não é número, repetida (de outra pessoa e da mesma pessoa); a congregação desconhecida, "GERAL" e vazia; sem nome; um ';' solto no nome; aspas
// (o ';' e as aspas dobradas dentro do campo); acentos e apóstrofo; datas ruins; CPF inválido, repetido e com pontos; o mesmo nome e nascimento em duas
// linhas; sexo, estado civil, e-mail e celular estragados; e as linhas que batem com fichas que já existem no banco (a matrícula, o CPF, o nome e o
// nascimento), que o ensaio cria antes da prévia (no LocalDB) ou aponta para fichas da homologação (--colidir-com).
//
// Uso: node gerar-massa.js --linhas 6000 --semente 20261205 --congregacoes congregacoes.txt --saida massa.csv [--plantio plantio.json]
//        [--codificacao utf8|1252] [--colidir-com 700001,700002,...]
// congregacoes.txt: um nome por linha (os nomes do banco onde a massa vai entrar). Sem ele, usa 45 nomes "Congregação Ensaio NN".
"use strict";
const fs = require("fs");
const path = require("path");

const CABECALHO = "MATRÍCULA;NOME;IGREJA;SEXO;NASCIMENTO;ESTADO CIVIL;E-MAIL;CELULAR;MÃE;PAI;CPF";
const MATRICULA_INICIAL = 810001;
const HOJE = "2026-12-05";

const PRIMEIROS_F = ["Ana", "Maria", "Antônia", "Francisca", "Conceição", "Raimunda", "Josefa", "Luzia", "Sebastiana", "Rosângela", "Lúcia", "Cláudia",
  "Fernanda", "Juliana", "Patrícia", "Aline", "Débora", "Raquel", "Rebeca", "Sara", "Ester", "Míriam", "Noemi", "Rute", "Lídia", "Priscila", "Tânia",
  "Vitória", "Beatriz", "Letícia", "Íris", "Ângela", "Glória", "Inês", "Márcia", "Simone", "Edna", "Jéssica", "Késia", "Damares"];
const PRIMEIROS_M = ["José", "João", "Antônio", "Francisco", "Raimundo", "Sebastião", "Luís", "Paulo", "Pedro", "Carlos", "Marcos", "Lucas", "Mateus",
  "Tiago", "André", "Felipe", "Davi", "Daniel", "Samuel", "Elias", "Eliseu", "Josué", "Calebe", "Gideão", "Natanael", "Ezequiel", "Abraão", "Isaque",
  "Jônatas", "Ícaro", "Álvaro", "Otávio", "Rogério", "Márcio", "Cícero", "Valdir", "Wesley", "Jeferson", "Edvaldo", "Raí"];
const MEIOS_F = ["", "", "", "da Silva", "de Jesus", "dos Santos", "de Souza", "Conceição", "Aparecida", "Cristina", "Maria", "de Fátima", "Helena", "Lúcia"];
const MEIOS_M = ["", "", "", "da Silva", "de Jesus", "dos Santos", "de Souza", "Augusto", "Henrique", "Luiz", "Carlos", "José", "Roberto", "Batista"];
const COMBINACOES = 40 * 50 * 50 * 14;   // primeiros x sobrenome x sobrenome x meio
const SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Fernandes",
  "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Mendes", "Barros", "Freitas", "Barbosa", "Pinto", "Moura", "Cavalcante",
  "Dias", "Castro", "Campos", "Cardoso", "Teixeira", "Gonçalves", "Brandão", "Assunção", "Magalhães", "Simões", "Guimarães", "Patrício", "Leão",
  "D'Ávila", "Sant'Ana", "Falcão", "Quaresma", "Furtado", "Sampaio", "Bezerra", "Tavares", "Batista", "Nogueira", "Coelho"];

// número pseudoaleatório com semente (mulberry32): o mesmo arquivo a cada execução
function sorteador(semente) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { proximo, inteiro: (min, max) => min + Math.floor(proximo() * (max - min + 1)), um: (lista) => lista[Math.floor(proximo() * lista.length)] };
}

// CPF com os dígitos certos sobre uma base inventada (não é de ninguém conhecido; nunca um CPF de verdade copiado)
function cpfDe(base9) {
  const b = String(base9).padStart(9, "0");
  const dv = (s) => { let t = 0; for (let i = 0; i < s.length; i++) t += Number(s[i]) * (s.length + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(b);
  return b + d1 + dv(b + d1);
}
const comPontos = (cpf) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
// campo com aspas no padrão do CSV (as aspas de dentro dobradas)
const entreAspas = (t) => `"${String(t).replace(/"/g, "\"\"")}"`;

// o nome da pessoa i: único por construção (o número i, embaralhado e em base mista, escolhe a combinação: 40 x 50 x 50 x 14, bem mais que 20 mil), para o "mesmo
// nome e nascimento" só acontecer onde foi plantado
function nomeDe(i, feminino) {
  const primeiros = feminino ? PRIMEIROS_F : PRIMEIROS_M;
  let k = (i * 7919) % COMBINACOES;   // 7919 é primo e não divide 1.400.000: embaralha sem repetir
  const p = primeiros[k % primeiros.length]; k = Math.floor(k / primeiros.length);
  const s1 = SOBRENOMES[k % SOBRENOMES.length]; k = Math.floor(k / SOBRENOMES.length);
  const s2 = SOBRENOMES[(k + 17) % SOBRENOMES.length]; k = Math.floor(k / SOBRENOMES.length);
  const m = (feminino ? MEIOS_F : MEIOS_M)[k % 14];
  return [p, m, s1, s2 === s1 ? "Filho" : s2].filter(Boolean).join(" ");
}

function lerCongregacoes(arquivo) {
  if (!arquivo) return Array.from({ length: 45 }, (_, i) => `Congregação Ensaio ${String(i + 1).padStart(2, "0")}`);
  return fs.readFileSync(arquivo, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// As quantidades de cada caso difícil para um arquivo de `linhas` pessoas (proporcionais, com um mínimo). Cada linha leva no máximo UM caso que muda a
// classificação (problema, número novo, possível repetida), para o gabarito ser exato; os avisos de campo (data, sexo...) vêm em linhas sem outro caso.
function quantidades(linhas) {
  const p = (por1000, minimo) => Math.max(minimo, Math.round((linhas * por1000) / 1000));
  return {
    matriculaZero: p(4, 3), matriculaVazia: p(2.5, 2), matriculaInvalida: p(1.5, 2), repetidaOutraPessoa: p(4, 3), repetidaMesmaPessoa: p(1.5, 2),
    congregacaoDesconhecida: p(3, 2), congregacaoGeral: p(1.5, 2), congregacaoVazia: p(1.5, 2), semNome: p(1, 2), colunasAMais: p(1, 2),
    cpfRepetidoNoArquivo: p(2.5, 2), nomeNascimentoNoArquivo: p(2.5, 2), comAspas: p(5, 4), cpfInvalido: p(5, 3), nascimentoRuim: p(7, 5),
    sexoRuim: p(2, 2), estadoCivilRuim: p(2, 2), emailRuim: p(3, 2), celularRuim: p(3, 2), incompletas: p(35, 10),
    jaExisteMatricula: 5, jaExisteCpf: 5, jaExisteNomeNascimento: 5
  };
}

function gerarMassa({ linhas = 6000, semente = 20261205, congregacoes, colidirCom = [] } = {}) {
  if (!Number.isInteger(linhas) || linhas < 200 || linhas > 20000) throw new Error("linhas: de 200 a 20.000 (o limite da importação)");
  const s = sorteador(semente);
  const congs = congregacoes && congregacoes.length ? congregacoes : lerCongregacoes(null);
  const qt = quantidades(linhas);
  // a congregação de cada pessoa: a primeira (a sede) com mais gente, o resto espalhado
  const congregacaoQualquer = () => (s.proximo() < 0.12 ? congs[0] : s.um(congs));

  // 1) as pessoas "boas": uma por linha, com a matrícula em sequência (com buracos pequenos, como no sistema pago)
  const pessoas = [];
  let mat = MATRICULA_INICIAL;
  for (let i = 0; i < linhas; i++) {
    mat += s.proximo() < 0.05 ? s.inteiro(2, 9) : 1;
    const feminino = s.proximo() < 0.58;
    const anoNasc = s.inteiro(1935, 2023);
    const nasc = `${anoNasc}-${String(s.inteiro(1, 12)).padStart(2, "0")}-${String(s.inteiro(1, 28)).padStart(2, "0")}`;
    const adulto = anoNasc <= 2006;
    pessoas.push({
      matricula: String(mat), nome: nomeDe(i, feminino), igreja: `IEADESPA - ${congregacaoQualquer()}`,
      sexo: feminino ? (s.proximo() < 0.1 ? "F" : "FEMININO") : (s.proximo() < 0.1 ? "M" : "MASCULINO"), nascimento: dataBr(nasc), nascIso: nasc,
      estadoCivil: adulto ? s.um(["CASADO(A)", "SOLTEIRO(A)", "CASADA", "CASADO", ".: NAO INFORMADO :.", "VIUVO(A)", "DIVORCIADO(A)", "UNIAO ESTAVEL"]) : ".: NAO INFORMADO :.",
      email: s.proximo() < 0.35 ? `pessoa${i + 1}.ensaio@example.org` : "",
      celular: s.proximo() < 0.6 ? `(91) 90000-${String((i % 9999) + 1).padStart(4, "0")}` : "",
      mae: s.proximo() < 0.7 ? nomeDe(i * 104729 + 7, true) : "", pai: s.proximo() < 0.45 ? nomeDe(i * 1299709 + 3, false) : "",
      cpf: s.proximo() < 0.4 ? (s.proximo() < 0.5 ? comPontos(cpfDe(970000000 + i)) : cpfDe(970000000 + i)) : "",
      caso: null
    });
  }
  const livres = () => {
    // escolhe uma linha ainda sem caso (sem repetir), longe do começo para o "fora da sequência" não pegar
    for (;;) { const k = s.inteiro(1, linhas - 1); if (!pessoas[k].caso) return k; }
  };
  const marcar = (caso, quantas, fazer) => { for (let n = 0; n < quantas; n++) { const k = livres(); pessoas[k].caso = caso; fazer(pessoas[k], k, n); } };
  const plantio = { semente, linhas, casos: {}, fichasNoBanco: [] };
  const conta = (caso, n) => { plantio.casos[caso] = (plantio.casos[caso] || 0) + n; };

  // 2) a matrícula: zerada, vazia, que não é número, repetida (de outra pessoa e da mesma pessoa)
  marcar("MATRICULA_ZERO", qt.matriculaZero, (p) => { p.matricula = s.proximo() < 0.5 ? "0" : "000"; }); conta("MATRICULA_ZERO", qt.matriculaZero);
  marcar("SEM_MATRICULA", qt.matriculaVazia, (p) => { p.matricula = ""; }); conta("SEM_MATRICULA", qt.matriculaVazia);
  marcar("MATRICULA_INVALIDA", qt.matriculaInvalida, (p, k, n) => { p.matricula = ["12A", "8100-1", "N/D", "81O0O2"][n % 4]; }); conta("MATRICULA_INVALIDA", qt.matriculaInvalida);
  marcar("MATRICULA_REPETIDA_NO_ARQUIVO", qt.repetidaOutraPessoa, (p) => {
    // a segunda linha com a matrícula de uma linha "boa" anterior (pessoa diferente): entra com a próxima do sistema
    let k; do { k = s.inteiro(0, linhas - 1); } while (pessoas[k].caso || !/^\d+$/.test(pessoas[k].matricula));
    pessoas[k].caso = "DONA_DA_MATRICULA"; p.matricula = pessoas[k].matricula;
  });
  conta("MATRICULA_REPETIDA_NO_ARQUIVO", qt.repetidaOutraPessoa);
  marcar("MESMA_PESSOA_NO_ARQUIVO", qt.repetidaMesmaPessoa, (p) => {
    // a mesma matrícula E a mesma pessoa (o nome igual): entra com a próxima do sistema e a possível repetida
    let k; do { k = s.inteiro(0, linhas - 1); } while (pessoas[k].caso || !/^\d+$/.test(pessoas[k].matricula));
    pessoas[k].caso = "DONA_DA_MATRICULA"; p.matricula = pessoas[k].matricula; p.nome = pessoas[k].nome; p.nascimento = pessoas[k].nascimento;
    p.nascIso = pessoas[k].nascIso; p.cpf = ""; pessoas[k].cpf = "";
  });
  conta("MESMA_PESSOA_NO_ARQUIVO", qt.repetidaMesmaPessoa);

  // 3) a congregação: desconhecida, GERAL e vazia (as três ficam de fora); sem nome; um ';' solto no nome (colunas a mais)
  marcar("CONGREGACAO_NAO_ENCONTRADA", qt.congregacaoDesconhecida, (p, k, n) => { p.igreja = `IEADESPA - Congregação Que Não Existe ${n + 1}`; });
  conta("CONGREGACAO_NAO_ENCONTRADA", qt.congregacaoDesconhecida);
  marcar("SEM_CONGREGACAO", qt.congregacaoGeral, (p) => { p.igreja = "IEADESPA - GERAL"; }); conta("SEM_CONGREGACAO", qt.congregacaoGeral);
  marcar("SEM_CONGREGACAO", qt.congregacaoVazia, (p) => { p.igreja = ""; }); conta("SEM_CONGREGACAO", qt.congregacaoVazia);
  marcar("SEM_NOME", qt.semNome, (p) => { p.nome = ""; }); conta("SEM_NOME", qt.semNome);
  // (a célula a mais só conta se tiver texto: o CPF, que passa a ser a 12ª coluna, vem sempre preenchido nestas)
  marcar("COLUNAS_A_MAIS", qt.colunasAMais, (p, k) => { p.nomeCru = `${p.nome.split(" ")[0]}; ${p.nome.split(" ").slice(1).join(" ")}`; p.cpf = p.cpf || cpfDe(985000000 + k); }); conta("COLUNAS_A_MAIS", qt.colunasAMais);

  // 4) as possíveis repetidas dentro do arquivo: o mesmo CPF; o mesmo nome e nascimento (outra matrícula)
  marcar("CPF_REPETIDO_NO_ARQUIVO", qt.cpfRepetidoNoArquivo, (p) => {
    let k; do { k = s.inteiro(0, linhas - 1); } while (pessoas[k].caso);
    pessoas[k].caso = "DONA_DO_CPF"; if (!pessoas[k].cpf) pessoas[k].cpf = cpfDe(980000000 + k); p.cpf = pessoas[k].cpf.replace(/\D/g, "");
  });
  conta("CPF_REPETIDO_NO_ARQUIVO", qt.cpfRepetidoNoArquivo);
  marcar("NOME_NASCIMENTO_NO_ARQUIVO", qt.nomeNascimentoNoArquivo, (p) => {
    let k; do { k = s.inteiro(0, linhas - 1); } while (pessoas[k].caso);
    pessoas[k].caso = "DONA_DO_NOME"; p.nome = pessoas[k].nome.toUpperCase().replace(" ", "  "); p.nascimento = pessoas[k].nascimento; p.nascIso = pessoas[k].nascIso;
    p.cpf = ""; pessoas[k].cpf = "";
  });
  conta("NOME_NASCIMENTO_NO_ARQUIVO", qt.nomeNascimentoNoArquivo);

  // 5) as que batem com fichas do banco: a matrícula (fica de fora), o CPF e o nome e nascimento (possível repetida). No LocalDB, o ensaio cria essas fichas
  // antes da prévia (plantio.fichasNoBanco); na homologação, --colidir-com dá matrículas de fichas que já existem lá (sem gravar nada antes).
  marcar("MATRICULA_JA_EXISTE", qt.jaExisteMatricula, (p, k, n) => {
    if (colidirCom[n]) { p.matricula = String(colidirCom[n]); return; }
    p.matricula = String(900001 + n);
    plantio.fichasNoBanco.push({ membroId: 900001 + n, nome: `Ficha Antiga Ensaio ${n + 1}` });
  });
  conta("MATRICULA_JA_EXISTE", qt.jaExisteMatricula);
  marcar("CPF_EM_OUTRA_FICHA", qt.jaExisteCpf, (p, k, n) => {
    p.cpf = cpfDe(990000000 + n);
    plantio.fichasNoBanco.push({ membroId: 900101 + n, nome: `Ficha do CPF Ensaio ${n + 1}`, cpf: p.cpf });
  });
  conta("CPF_EM_OUTRA_FICHA", qt.jaExisteCpf);
  marcar("NOME_NASCIMENTO_EM_OUTRA_FICHA", qt.jaExisteNomeNascimento, (p, k, n) => {
    p.cpf = "";
    plantio.fichasNoBanco.push({ membroId: 900201 + n, nome: p.nome, dataNascimento: p.nascIso });
  });
  conta("NOME_NASCIMENTO_EM_OUTRA_FICHA", qt.jaExisteNomeNascimento);
  if (colidirCom.length) plantio.fichasNoBanco = plantio.fichasNoBanco.filter((f) => f.membroId < 900001 || f.membroId > 900005);

  // 6) os avisos de campo (a linha entra sem o campo errado), cada um numa linha sem outro caso
  marcar("CPF_INVALIDO", qt.cpfInvalido, (p, k, n) => { p.cpf = ["12345678900", "111.111.111-11", "123", "98765432100"][n % 4]; }); conta("CPF_INVALIDO", qt.cpfInvalido);
  marcar("NASCIMENTO_INVALIDO", qt.nascimentoRuim, (p, k, n) => { p.nascimento = ["31/02/1990", "00/00/0000", "15/13/1980", "10/10/2099", "29/02/2023", "1/1/1899"][n % 6]; });
  conta("NASCIMENTO_INVALIDO", qt.nascimentoRuim);
  marcar("SEXO_DESCONHECIDO", qt.sexoRuim, (p) => { p.sexo = "X"; }); conta("SEXO_DESCONHECIDO", qt.sexoRuim);
  marcar("ESTADO_CIVIL_DESCONHECIDO", qt.estadoCivilRuim, (p) => { p.estadoCivil = "NOIVO(A)"; }); conta("ESTADO_CIVIL_DESCONHECIDO", qt.estadoCivilRuim);
  marcar("EMAIL_INVALIDO", qt.emailRuim, (p, k, n) => { p.email = ["x@", "sem-arroba.example.org", "dois@@example.org"][n % 3]; }); conta("EMAIL_INVALIDO", qt.emailRuim);
  marcar("CELULAR_INVALIDO", qt.celularRuim, (p, k, n) => { p.celular = ["123", "(91) 9000", "0000000000000000"][n % 3]; }); conta("CELULAR_INVALIDO", qt.celularRuim);

  // 7) as aspas (o ';' e as aspas dobradas dentro do campo, sem quebra de linha: a quebra dentro de aspas recusa o arquivo) e as linhas incompletas
  marcar("COM_ASPAS", qt.comAspas, (p, k, n) => {
    const partes = p.nome.split(" ");
    p.nomeCru = n % 2 === 0 ? entreAspas(`${partes[0]} "${partes[1] || "Neto"}" ${partes.slice(2).join(" ")}`.replace(/\s+/g, " ").trim())
      : entreAspas(p.nome);
    p.igrejaCru = entreAspas(p.igreja);
    if (n % 3 === 0) p.maeCru = entreAspas(`${p.mae || "Maria das Dores"}; viúva`);
  });
  conta("COM_ASPAS", qt.comAspas);
  marcar("INCOMPLETA", qt.incompletas, (p) => { p.incompleta = s.inteiro(3, 5); }); conta("INCOMPLETA", qt.incompletas);

  // o texto: CRLF (o Excel do Windows), com a marca BOM do UTF-8 no começo
  const linhasTexto = [CABECALHO];
  for (const p of pessoas) {
    const celulas = [p.matricula, p.nomeCru != null ? p.nomeCru : p.nome, p.igrejaCru != null ? p.igrejaCru : p.igreja, p.sexo, p.nascimento, p.estadoCivil,
      p.email, p.celular, p.maeCru != null ? p.maeCru : p.mae, p.pai, p.cpf];
    linhasTexto.push((p.incompleta ? celulas.slice(0, p.incompleta) : celulas).join(";"));
  }
  const texto = "﻿" + linhasTexto.join("\r\n") + "\r\n";
  // o gabarito: o que a prévia tem de dizer (as que ficam de fora por problema; as que entram com a próxima matrícula; as possíveis repetidas)
  const c = plantio.casos;
  plantio.gabarito = {
    total: linhas,
    problemas: c.CONGREGACAO_NAO_ENCONTRADA + c.SEM_CONGREGACAO + c.SEM_NOME + c.COLUNAS_A_MAIS + c.MATRICULA_JA_EXISTE,
    numeroNovo: c.MATRICULA_ZERO + c.SEM_MATRICULA + c.MATRICULA_INVALIDA + c.MATRICULA_REPETIDA_NO_ARQUIVO + c.MESMA_PESSOA_NO_ARQUIVO,
    possivelRepetidaNoMinimo: c.MESMA_PESSOA_NO_ARQUIVO + c.CPF_REPETIDO_NO_ARQUIVO + c.NOME_NASCIMENTO_NO_ARQUIVO + c.CPF_EM_OUTRA_FICHA + c.NOME_NASCIMENTO_EM_OUTRA_FICHA
  };
  plantio.gabarito.entram = linhas - plantio.gabarito.problemas;
  return { texto, plantio };
}

function argumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1"; }
  return a;
}

if (require.main === module) {
  const a = argumentos(process.argv.slice(2));
  const { texto, plantio } = gerarMassa({
    linhas: Number(a.linhas || 6000), semente: Number(a.semente || 20261205), congregacoes: lerCongregacoes(a.congregacoes),
    colidirCom: a["colidir-com"] ? String(a["colidir-com"]).split(",").map((v) => Number(v.trim())).filter(Number.isInteger) : []
  });
  const saida = a.saida || "massa-ensaio.csv";
  // Windows-1252 (o padrão do Excel no Windows): os acentos do português cabem no latin1; a tela lê os dois (front/src/membros/importar/importar.ts)
  if (a.codificacao === "1252") fs.writeFileSync(saida, Buffer.from(texto.replace(/^﻿/, ""), "latin1"));
  else fs.writeFileSync(saida, texto, "utf8");
  if (a.plantio) fs.writeFileSync(a.plantio, JSON.stringify(plantio, null, 2));
  console.log(`massa: ${path.resolve(saida)} (${plantio.linhas} pessoas, ${Buffer.byteLength(texto, "utf8").toLocaleString("pt-BR")} bytes)`);
  console.log(`gabarito: ${JSON.stringify(plantio.gabarito)}`);
}

module.exports = { gerarMassa, cpfDe, CABECALHO, MATRICULA_INICIAL, HOJE, quantidades };
