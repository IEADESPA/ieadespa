// Abre o servidor de memória (MCP) com um arquivo por projeto.
//
// O projeto é a pasta raiz do repositório Git em que o Claude Code (ou o Codex) foi aberto; fora de um repositório, a
// própria pasta. Num worktree do Git, vale a pasta principal do repositório: a memória é uma só por computador, como a
// memória automática do Claude. A variável MEMORIA_PROJETO_PASTA, se existir, escolhe a pasta no lugar da atual.
//
// Qual arquivo (desde 20/11/2026):
//   1. a memória VERSIONADA do repositório, se ele tiver .claude/continuidade/memoria/<nome>.jsonl (ou um único .jsonl
//      nessa pasta, para quem clonou com outro nome de pasta). Ela vai para o Git com a passagem de bastão: quem entra
//      dá "git pull" e continua do mesmo ponto. O repositório pode ser público: nada de senha, chave nem dado pessoal;
//   2. senão, a memória pessoal deste computador, em C:\MCP\memorias\<nome>.jsonl. Ex.: "C:\sistemas vs code\construtor
//      de igreja" usa C:\MCP\memorias\construtor-de-igreja.jsonl.
//
// Cada abertura fica registrada em C:\MCP\aberturas.log (data, pasta e arquivo), para conferir qual memória cada
// sessão usou. Nada é escrito na saída padrão: ela é do MCP.
//
// Servidor: @modelcontextprotocol/server-memory 2.1.1 (licença MIT), instalado nesta pasta com versão fixa
// ("npm install --prefix C:\MCP"). Configurado em 17/11/2026; memória versionada em 20/11/2026.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA_VERSIONADA = path.join(".claude", "continuidade", "memoria");

// Num worktree, ".git" é um arquivo "gitdir: <principal>/.git/worktrees/<nome>": devolve a pasta principal.
function pastaPrincipalDoWorktree(raiz) {
  try {
    const texto = fs.readFileSync(path.join(raiz, ".git"), "utf8");
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(texto)?.[1];
    if (!gitdir) return raiz;
    const partes = path.resolve(raiz, gitdir).split(path.sep);
    const i = partes.lastIndexOf("worktrees");
    if (i < 1 || partes[i - 1] !== ".git") return raiz; // submódulo ou outro arranjo: fica a própria pasta
    return partes.slice(0, i - 1).join(path.sep);
  } catch {
    return raiz; // ".git" é uma pasta (o repositório principal) ou não dá para ler
  }
}

function raizDoProjeto(pasta) {
  const inicio = path.resolve(pasta);
  for (let atual = inicio; ; atual = path.dirname(atual)) {
    if (fs.existsSync(path.join(atual, ".git"))) return pastaPrincipalDoWorktree(atual);
    if (path.dirname(atual) === atual) return inicio;
  }
}

function nomeDoArquivo(raiz) {
  const nome = path
    .basename(raiz)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira os acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${nome || "sem-nome"}.jsonl`;
}

// A memória versionada do repositório, se houver: o arquivo com o nome do projeto ou, se não houver, o único .jsonl.
function memoriaVersionada(raiz, nome) {
  const pasta = path.join(raiz, PASTA_VERSIONADA);
  if (fs.existsSync(path.join(pasta, nome))) return path.join(pasta, nome);
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(pasta).filter((a) => a.endsWith(".jsonl"));
  } catch {
    return null; // o repositório não tem memória versionada
  }
  return arquivos.length === 1 ? path.join(pasta, arquivos[0]) : null;
}

const raiz = raizDoProjeto(process.env.MEMORIA_PROJETO_PASTA || process.cwd());
const nome = nomeDoArquivo(raiz);
const versionada = memoriaVersionada(raiz, nome);
const arquivo = versionada || path.join(AQUI, "memorias", nome);
fs.mkdirSync(path.dirname(arquivo), { recursive: true });
try {
  const quando = new Date().toLocaleString("pt-BR");
  const tipo = versionada ? "versionada" : "pessoal";
  fs.appendFileSync(path.join(AQUI, "aberturas.log"), `${quando}  ${raiz}  ->  ${arquivo}  (${tipo})\n`);
} catch {
  // o registro é só para conferência: nunca impede a memória de abrir
}

process.env.MEMORY_FILE_PATH = arquivo;
const servidor = path.join(
  AQUI, "node_modules", "@modelcontextprotocol", "server-memory", "dist", "index.js"
);
try {
  const { main } = await import(pathToFileURL(servidor).href);
  await main();
} catch (erro) {
  process.stderr.write(
    `Não foi possível abrir o servidor de memória (${arquivo}). ` +
      `Confira se ele está instalado em ${AQUI} ("npm install --prefix C:\\MCP"). ` +
      `Detalhe técnico para os mantenedores: ${erro?.stack || erro}\n`
  );
  process.exit(1);
}
