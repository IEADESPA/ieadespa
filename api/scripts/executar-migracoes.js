// executar-migracoes.js
// Roda todas as migrações de sql/migrations/, em ordem, numa ÚNICA conexão —
// substitui os N steps individuais que existiam no workflow (um azure/sql-action
// por arquivo), cada um pagando o custo fixo de "ligar a ação, conectar,
// desligar" de novo. Cada migração continua idempotente (IF NOT EXISTS) — a
// gente NUNCA edita uma migração antiga, só adiciona novas; esse script só
// muda COMO elas são executadas, não a regra de nunca alterar as antigas.
//
// Mensagens do SQL Server (PRINT) aparecem no log: é assim que uma migração AVISA sem derrubar o deploy — por exemplo, "índice único NÃO criado: há
// dados repetidos" (migrações 127 a 130 e 139: cada índice só nasce se não houver repetição hoje e, havendo, só imprime "AVISO migração N: ..." e segue; no deploy
// seguinte à limpeza o índice entra sozinho). Linhas "AVISO" viram também anotação do GitHub Actions (aparece na página da execução) e entram num resumo no
// fim. Os avisos trazem só contagens, nunca dado de pessoa: o log de repositório público é público.
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

// Anotação do GitHub Actions (workflow command): `%`, CR e LF precisam de escape no texto da mensagem.
function anotacaoDeAviso(mensagem) {
  const texto = String(mensagem).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return `::warning title=Migração do banco::${texto}`;
}

// Roda UM lote e entrega cada mensagem informativa (PRINT) do SQL Server a `aoReceberMensagem`. A mensagem chega pelo evento "info" da requisição do mssql; sem
// ouvir esse evento o PRINT se perde em silêncio e o aviso de uma migração nunca apareceria no log do deploy.
async function executarBatch(pool, batch, aoReceberMensagem) {
  const requisicao = pool.request();
  requisicao.on("info", (info) => aoReceberMensagem(String(info && info.message !== undefined ? info.message : "")));
  return requisicao.query(batch);
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

  const avisos = [];
  try {
    for (const arquivo of arquivos) {
      const caminho = path.join(PASTA_MIGRACOES, arquivo);
      const conteudo = fs.readFileSync(caminho, "utf8");
      const batches = dividirEmBatches(conteudo);
      console.log(`→ ${arquivo} (${batches.length} batch(es))`);
      for (const batch of batches) {
        await executarBatch(pool, batch, (mensagem) => {
          console.log(`   ${mensagem}`);
          if (/^AVISO/.test(mensagem)) {
            avisos.push(mensagem);
            if (process.env.GITHUB_ACTIONS === "true") console.log(anotacaoDeAviso(mensagem));
          }
        });
      }
    }
    console.log(`✅ ${arquivos.length} migração(ões) executada(s) com sucesso.`);
    if (avisos.length > 0) {
      console.log(`⚠️ ${avisos.length} aviso(s) de migração (nada falhou; o que o aviso descreve ainda não foi aplicado — leia as linhas "AVISO" acima):`);
      for (const aviso of avisos) console.log(`   - ${aviso}`);
    }
  } finally {
    await pool.close();
  }
}

module.exports = { dividirEmBatches, executarBatch, anotacaoDeAviso, main };

if (require.main === module) {
  main().catch(erro => {
    console.error("❌ Falha ao executar migrações:", erro.message);
    process.exit(1);
  });
}
