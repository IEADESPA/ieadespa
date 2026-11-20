// Grava UMA chave num arquivo de configuração JSON (ex.: .claude/settings.local.json) sem mexer no resto: as
// permissões e os outros ajustes da pessoa continuam como estavam. Cria o arquivo se ele não existir.
//
// Uso: node ajustar-config.mjs <arquivo.json> <chave> <valor> [--json]
//   --json: o valor é JSON (número, verdadeiro/falso...); sem ele, é texto. Ex.: autoCompactWindow 400000 --json
// Usado pelo instalar-memoria.ps1 (o PowerShell 5.1 reescreveria o arquivo inteiro com outra formatação).

import fs from "node:fs";
import path from "node:path";

const [arquivo, chave, bruto, modo] = process.argv.slice(2);
if (!arquivo || !chave || bruto === undefined) {
  process.stderr.write("Uso: node ajustar-config.mjs <arquivo.json> <chave> <valor> [--json]\n");
  process.exit(2);
}
let valor = bruto;
if (modo === "--json") {
  try {
    valor = JSON.parse(bruto);
  } catch {
    process.stderr.write(`O valor ${bruto} não é JSON: não mexi em nada.\n`);
    process.exit(2);
  }
}

let config = {};
if (fs.existsSync(arquivo)) {
  const texto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  try {
    config = texto.trim() ? JSON.parse(texto) : {};
  } catch (erro) {
    process.stderr.write(`O arquivo ${arquivo} não é um JSON válido (${erro.message}): não mexi nele.\n`);
    process.exit(1);
  }
}
if (config === null || typeof config !== "object" || Array.isArray(config)) {
  process.stderr.write(`O arquivo ${arquivo} não guarda um objeto JSON: não mexi nele.\n`);
  process.exit(1);
}

if (config[chave] === valor) {
  console.log(`${chave} já estava com esse valor em ${arquivo}.`);
} else {
  config[chave] = valor;
  fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(config, null, 2) + "\n");
  console.log(`${chave} gravado em ${arquivo}.`);
}
