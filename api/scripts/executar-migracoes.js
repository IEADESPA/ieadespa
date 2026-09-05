// executar-migracoes.js
// Roda todas as migrações de sql/migrations/, em ordem, numa ÚNICA conexão —
// substitui os N steps individuais que existiam no workflow (um azure/sql-action
// por arquivo), cada um pagando o custo fixo de "ligar a ação, conectar,
// desligar" de novo. Cada migração continua idempotente (IF NOT EXISTS) — a
// gente NUNCA edita uma migração antiga, só adiciona novas; esse script só
// muda COMO elas são executadas, não a regra de nunca alterar as antigas.
//
// Uso: SQL_CONNECTION_STRING=... node scripts/executar-migracoes.js
const fs = require("fs");
const path = require("path");
const sql = require("mssql");

const PASTA_MIGRACOES = path.join(__dirname, "..", "..", "sql", "migrations");
const TENTATIVAS_CONEXAO = 5;
const ESPERA_ENTRE_TENTATIVAS_MS = 20000;

// A primeira conexão do dia pode pegar o Azure SQL Serverless pausado por
// inatividade (login error 40613, "not currently available") — mesmo motivo da
// retry que já existia só na migração 001 no workflow antigo. Aqui cobre a
// conexão única de todo o processo.
async function conectarComRetry(connectionString) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS_CONEXAO; tentativa++) {
    try {
      return await sql.connect(connectionString);
    } catch (erro) {
      ultimoErro = erro;
      console.log(`Tentativa ${tentativa}/${TENTATIVAS_CONEXAO} de conexão falhou: ${erro.message}`);
      if (tentativa < TENTATIVAS_CONEXAO) await new Promise(r => setTimeout(r, ESPERA_ENTRE_TENTATIVAS_MS));
    }
  }
  throw ultimoErro;
}

// mssql (Request.query) não entende "GO" — esse separador é uma convenção do
// sqlcmd/SSMS pra marcar fim de batch, não T-SQL de verdade. Cada trecho entre
// linhas "GO" isoladas vira uma query separada, mesma coisa que o sql-action já
// fazia por baixo dos panos.
function dividirEmBatches(conteudoSql) {
  return conteudoSql
    .split(/^\s*GO\s*$/gim)
    .map(trecho => trecho.trim())
    .filter(Boolean);
}

async function main() {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    console.error("Defina SQL_CONNECTION_STRING antes de rodar este script.");
    process.exit(1);
  }

  const arquivos = fs.readdirSync(PASTA_MIGRACOES)
    .filter(nome => nome.endsWith(".sql"))
    .sort(); // nomes com prefixo numérico zero-padded (001, 002...) -> ordem alfabética = ordem numérica

  if (arquivos.length === 0) {
    console.log("Nenhuma migração encontrada em sql/migrations/.");
    return;
  }

  console.log(`Conectando ao Azure SQL...`);
  const pool = await conectarComRetry(connectionString);
  console.log(`Conectado. Executando ${arquivos.length} migração(ões)...`);

  try {
    for (const arquivo of arquivos) {
      const caminho = path.join(PASTA_MIGRACOES, arquivo);
      const conteudo = fs.readFileSync(caminho, "utf8");
      const batches = dividirEmBatches(conteudo);
      console.log(`→ ${arquivo} (${batches.length} batch(es))`);
      for (const batch of batches) {
        await pool.request().query(batch);
      }
    }
    console.log(`✅ ${arquivos.length} migração(ões) executada(s) com sucesso.`);
  } finally {
    await pool.close();
  }
}

main().catch(erro => {
  console.error("❌ Falha ao executar migrações:", erro.message);
  process.exit(1);
});
