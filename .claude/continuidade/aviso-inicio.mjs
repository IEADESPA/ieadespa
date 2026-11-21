#!/usr/bin/env node
// O aviso do começo de toda conversa (gancho SessionStart do .claude/settings.json).
//
// SÓ LÊ: não instala, não apaga e não muda nada. Mostra:
//   1. a linha "Em uso por" do HANDOFF.md (uma pessoa por vez);
//   2. se o repositório está atrás do GitHub (faltou o git pull);
//   3. se este computador está atrás do kit (.claude/continuidade): o servidor de memória, os plugins, as
//      habilidades, os programas, as configurações pessoais, as regras globais e a memória automática.
// A régua é a mesma do instalar-memoria.ps1. A única ida à internet é o "git fetch", com limite de tempo e sem
// janela de senha. Qualquer erro vira um aviso: o gancho nunca impede a conversa de começar.
//
// Testar à mão:  node .claude/continuidade/aviso-inicio.mjs

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = dirname(fileURLToPath(import.meta.url));
const repo = resolve(kit, '..', '..');
const casa = homedir();
const avisos = []; // precisa de ação antes de começar
const atrasos = []; // itens em que o computador está atrás do kit
const estado = []; // só informação

const ler = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const lerJson = (p) => {
  const t = ler(p);
  if (t == null) return null;
  try { return JSON.parse(t.replace(/^\uFEFF/, '')); } catch { return undefined; }
};
const resumo = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch { return null; } };
// Compara o texto, não a formatação: ignora o fim de linha do Windows, os espaços no fim e as linhas em branco.
const semFimDeLinha = (t) => t.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).filter(Boolean).join('\n');
const mesmoCaminho = (a, b) => !!a && !!b && resolve(a).toLowerCase() === resolve(b).toLowerCase();
// Sem janela de senha (repositório privado sem login): o fetch falha e vira aviso, em vez de travar a conversa.
const ambienteGit = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
const git = (args, timeout = 4000) => execFileSync('git', ['-C', repo, ...args], {
  encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'], env: ambienteGit, windowsHide: true,
}).trim();

function emUsoPor() {
  const handoff = ler(join(repo, 'HANDOFF.md'));
  if (handoff == null) { avisos.push('Não há HANDOFF.md na raiz: leia as regras globais ("primeira vez num repositório").'); return; }
  const linha = handoff.split(/\r?\n/).find((l) => /^Em uso por:/i.test(l.trim()));
  if (!linha) { avisos.push('O HANDOFF.md não tem a linha "Em uso por".'); return; }
  const texto = linha.replace(/\*\*/g, '').trim();
  if (/^Em uso por:\s*Livre/i.test(texto)) { estado.push(`${texto}: ponha o seu nome e a data antes de começar (commit e push).`); return; }
  let eu = '';
  try { eu = git(['config', 'user.name']); } catch { /* sem nome no git: trata como outra pessoa */ }
  const primeiro = eu.split(/\s+/)[0];
  if (primeiro && texto.toLowerCase().includes(primeiro.toLowerCase())) estado.push(`${texto} (você).`);
  else avisos.push(`${texto}. Se não for você, NÃO comece: fale com essa pessoa (regra 4 do CLAUDE.md).`);
}

function atrasDoGitHub() {
  let ramo;
  try { ramo = git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch { avisos.push('Não consegui ler o Git deste repositório.'); return; }
  try { git(['fetch', '--quiet', 'origin'], 10000); } catch {
    avisos.push('Não consegui consultar o GitHub (sem internet ou sem login): faça git pull antes de começar.');
    return;
  }
  let atras;
  try { atras = Number(git(['rev-list', '--count', `HEAD..origin/${ramo}`])); } catch {
    estado.push(`Ramo atual: ${ramo} (ainda não existe no GitHub).`);
    return;
  }
  if (ramo !== 'main') estado.push(`Ramo atual: ${ramo}.`);
  if (atras > 0) avisos.push(`O repositório está ${atras} registro(s) atrás do GitHub: faça git pull antes de começar.`);
}

function computadorContraOKit() {
  const bancada = lerJson(join(kit, 'bancada.json'));
  const instalador = ler(join(kit, 'instalar-memoria.ps1')) ?? '';
  if (!bancada) { avisos.push('Não consegui ler a .claude/continuidade/bancada.json.'); return; }
  const destino = /\$destino\s*=\s*'([^']+)'/.exec(instalador)?.[1] ?? 'C:\\MCP';
  const versao = /\$versao\s*=\s*'([^']+)'/.exec(instalador)?.[1];

  // 1. O servidor de memória e a cópia do kit em C:\MCP.
  const instalada = lerJson(join(destino, 'node_modules', '@modelcontextprotocol', 'server-memory', 'package.json'))?.version;
  if (!instalada) atrasos.push(`o servidor de memória não está instalado em ${destino}`);
  else if (versao && instalada !== versao) atrasos.push(`o servidor de memória está na versão ${instalada}; o kit pede a ${versao}`);
  const copia = join(destino, 'continuidade');
  const diferentes = readdirSync(kit).filter((n) => statSync(join(kit, n)).isFile() && resumo(join(kit, n)) !== resumo(join(copia, n)));
  if (resumo(join(kit, 'iniciar-memoria.mjs')) !== resumo(join(destino, 'iniciar-memoria.mjs'))) diferentes.push('iniciar-memoria.mjs (o que liga o servidor)');
  if (diferentes.length) atrasos.push(`a cópia do kit em ${copia} está velha (${diferentes.join(', ')})`);

  // 2. O registro do servidor no Claude Code (configuração do usuário).
  const servidores = lerJson(join(casa, '.claude.json'))?.mcpServers ?? {};
  if (!servidores['memoria-projeto']) atrasos.push('o servidor memoria-projeto não está registrado no Claude Code');

  // 3. Os plugins da bancada.
  const instalados = Object.keys(lerJson(join(casa, '.claude', 'plugins', 'installed_plugins.json'))?.plugins ?? {});
  const faltam = (bancada.plugins ?? []).map((p) => p.id).filter((id) => !instalados.includes(id));
  if (faltam.length) atrasos.push(`faltam plugins: ${faltam.join(', ')}`);

  // 4. As habilidades: vêm com o repositório; uma cópia pessoal diferente ganharia da do projeto.
  for (const h of bancada.habilidades ?? []) {
    const doProjeto = join(repo, '.claude', 'skills', h.nome, 'SKILL.md');
    if (!existsSync(doProjeto) || !existsSync(join(repo, '.agents', 'skills', h.nome, 'SKILL.md'))) {
      avisos.push(`A habilidade ${h.nome} falta no repositório: faça git pull.`);
      continue;
    }
    const pessoal = join(casa, '.claude', 'skills', h.nome, 'SKILL.md');
    if (existsSync(pessoal) && semFimDeLinha(ler(pessoal) ?? '') !== semFimDeLinha(ler(doProjeto) ?? '')) {
      atrasos.push(`a sua cópia pessoal da habilidade ${h.nome} (~/.claude/skills) é diferente da do projeto e ganha dela`);
    }
  }

  // 5. Os programas dos plugins (procurados no PATH, sem rodar nada).
  const pastas = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const p of bancada.programas ?? []) {
    const achou = pastas.some((d) => ['', '.cmd', '.exe', '.ps1'].some((ext) => existsSync(join(d, p.comando + ext))));
    if (!achou) atrasos.push(`falta o programa ${p.comando} (${p.para})`);
  }

  // 6. As configurações pessoais (economia de créditos).
  const minhas = lerJson(join(casa, '.claude', 'settings.json')) ?? {};
  for (const c of bancada.configuracoesPessoais ?? []) {
    if (JSON.stringify(minhas[c.chave]) !== JSON.stringify(c.valor)) atrasos.push(`a configuração ${c.chave} não está em ${c.valor}`);
  }

  // 7. As regras globais (~/.claude/CLAUDE.md) contra as do kit.
  const minhasRegras = ler(join(casa, '.claude', 'CLAUDE.md'));
  const regrasDoKit = ler(join(kit, 'regras-globais.md'));
  if (minhasRegras == null) atrasos.push('faltam as regras globais (~/.claude/CLAUDE.md)');
  else if (regrasDoKit != null && semFimDeLinha(minhasRegras) !== semFimDeLinha(regrasDoKit)) {
    avisos.push('As suas regras globais (~/.claude/CLAUDE.md) são diferentes das do kit (.claude/continuidade/regras-globais.md): compare e junte as duas, sem perder nada.');
  }

  // 8. A memória automática do Claude apontando para a pasta versionada deste repositório.
  const local = lerJson(join(repo, '.claude', 'settings.local.json'));
  if (!mesmoCaminho(local?.autoMemoryDirectory, join(kit, 'memoria-claude'))) {
    atrasos.push('a memória automática do Claude não grava na pasta versionada (.claude/continuidade/memoria-claude)');
  }

  if (atrasos.length) {
    avisos.push(`Este computador está atrás do kit: ${atrasos.join('; ')}. Para atualizar: dois cliques em .claude\\continuidade\\INSTALAR.cmd (ele pergunta antes de cada mudança).`);
  } else {
    estado.push('Este computador está em dia com o kit.');
  }
}

for (const passo of [emUsoPor, atrasDoGitHub, computadorContraOKit]) {
  try { passo(); } catch (e) { avisos.push(`O aviso de início falhou em ${passo.name}: ${e?.message ?? e}`); }
}

const linhas = [
  ...(avisos.length ? ['ATENÇÃO, antes de começar:', ...avisos.map((a) => `- ${a}`)] : []),
  ...estado.map((s) => `- ${s}`),
];
const paraOClaude = [
  'Aviso de início (gancho SessionStart: .claude/continuidade/aviso-inicio.mjs, só leitura).',
  ...linhas,
  avisos.length
    ? 'Conte isso ao responsável na primeira resposta, em português simples. Atualizar o computador só com o sim dele (primeiro INSTALAR.cmd -SoTestar).'
    : 'Tudo em dia: não precisa comentar, a não ser a linha "Em uso por".',
].join('\n');

process.stdout.write(JSON.stringify({
  systemMessage: avisos.length ? `Bancada: ${avisos.join(' | ')}` : `Bancada em dia. ${estado[0] ?? ''}`.trim(),
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: paraOClaude },
}));
