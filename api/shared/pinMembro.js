// shared/pinMembro.js (fecho da v7.5) — o PIN de 4 dígitos do membro comum e o bloqueio por tentativas.
//
// Por que PIN e não só matrícula: a matrícula é um número em sequência, que qualquer pessoa adivinha. O PIN é a segunda metade da credencial. Quatro dígitos
// são poucos (10 mil combinações), então a segurança NÃO está no tamanho e sim em quatro travas, todas aqui:
//   1. o contador de erros é por pessoa e é atômico no banco, e a tentativa é RESERVADA antes de conferir o PIN — cem chutes ao mesmo tempo não passam de
//      cinco; ao errar 5 vezes bloqueia 15 minutos, e o bloqueio cresce (1 h, 4 h, 24 h) enquanto a pessoa não acertar;
//   2. PIN fácil de adivinhar não é aceito (repetido, sequência, ano, data de nascimento da própria pessoa, final da matrícula);
//   3. o PIN nunca é guardado: só o scrypt dele com sal e com o segredo do sistema (um vazamento só do banco não deixa quebrar os 10 mil);
//   4. a sessão do PIN é de membro: sem permissão nenhuma. Quem tem acesso administrativo continua entrando com a senha da liderança.
// Esquecer o PIN não tranca ninguém: o código de 6 dígitos por e-mail (ou o PIN provisório da Secretaria) cria outro.
const crypto = require("crypto");
const { sql } = require("./db");

const PEPPER = require("./segredoSessao").resolverSegredo();
const PIN_REGEX = /^\d{4}$/;
const LIMITE_FALHAS_PIN = 5;
const LIMITE_FALHAS_SENHA = 10;                 // a senha da liderança é digitada com mais cuidado e é mais valiosa; erra-se menos por engano
const VALIDADE_PROVISORIO_DIAS = 7;
const MENSAGEM_GENERICA = "Matrícula ou PIN incorreto, ou acesso bloqueado por muitas tentativas. Se esqueceu o PIN, peça um código por e-mail.";

const formatoPinValido = (pin) => typeof pin === "string" && PIN_REGEX.test(pin);

// ---------------------------------------------------------------
// PIN fácil de adivinhar
// ---------------------------------------------------------------

const PINS_COMUNS = new Set(["2580", "1004", "1010", "1313", "6969", "1357", "2468", "0852", "1590", "7777", "5683", "0007", "1212", "2121", "1020", "2010", "1001", "5555"]);

// Dia e mês de nascimento ("2008-10-02" -> "0210" e "1002") e o ano ("2008").
function derivadosDeNascimento(nascimento) {
  if (nascimento == null || nascimento === "") return [];
  const iso = nascimento instanceof Date ? nascimento.toISOString().slice(0, 10) : String(nascimento).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [m[1], m[3] + m[2], m[2] + m[3]] : [];
}

// { fraco:true, motivo } se o PIN é fácil demais. `nascimento` e `matricula` são da própria pessoa.
function pinFraco(pin, { nascimento = null, matricula = null } = {}) {
  const d = String(pin).split("").map(Number);
  if (d.every(x => x === d[0])) return { fraco: true, motivo: "os quatro números iguais" };
  const passos = d.slice(1).map((x, i) => x - d[i]);
  if (passos.every(p => p === 1) || passos.every(p => p === -1)) return { fraco: true, motivo: "uma sequência (como 1234 ou 4321)" };
  if (d[0] === d[2] && d[1] === d[3]) return { fraco: true, motivo: "dois números que se repetem" };
  if (d[0] === d[1] && d[2] === d[3]) return { fraco: true, motivo: "dois pares de números iguais" };
  if (PINS_COMUNS.has(pin)) return { fraco: true, motivo: "um dos mais usados" };
  const n = Number(pin);
  if (n >= 1930 && n <= 2035) return { fraco: true, motivo: "um ano (de nascimento ou atual)" };
  if (derivadosDeNascimento(nascimento).includes(pin)) return { fraco: true, motivo: "ligado à sua data de nascimento" };
  if (matricula != null && String(matricula).slice(-4).padStart(4, "0") === pin) return { fraco: true, motivo: "igual ao final da sua matrícula" };
  return { fraco: false };
}

function mensagemPinFraco(f) { return `Esse PIN é fácil de adivinhar (${f.motivo}). Escolha outro de 4 números.`; }

// PIN aleatório para a Secretaria entregar (provisório), sem nenhum dos padrões acima.
function gerarPinProvisorio({ nascimento = null, matricula = null } = {}) {
  for (let i = 0; i < 200; i++) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    if (!pinFraco(pin, { nascimento, matricula }).fraco) return pin;
  }
  return "7392";                                // inalcançável na prática; evita laço infinito
}

// ---------------------------------------------------------------
// Hash do PIN
// ---------------------------------------------------------------

function derivar(pin, membroId, salt) {
  return crypto.scryptSync(`${pin}:${membroId}`, `${salt}:${PEPPER}`, 32).toString("hex");
}
function hashPin(pin, membroId) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${derivar(String(pin), membroId, salt)}`;
}
function verificarPin(pin, membroId, guardado) {
  if (!guardado || typeof guardado !== "string") return false;
  const [salt, hash] = guardado.split(":");
  if (!salt || !hash || hash.length !== 64) return false;
  const a = Buffer.from(derivar(String(pin), membroId, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Gasta o mesmo tempo de uma conferência verdadeira: quem pergunta por matrícula sem PIN não distingue pelo tempo da resposta.
function conferenciaFalsa(pin) { verificarPin(pin, 0, `${"0".repeat(32)}:${"0".repeat(64)}`); }

// ---------------------------------------------------------------
// Banco
// ---------------------------------------------------------------

async function lerPin(pool, membroId) {
  const r = (await pool.request().input("m", sql.Int, membroId)
    .query(`SELECT PinHash, Provisorio, ProvisorioExpiraEm FROM MembroPins WHERE MembroId = @m`)).recordset[0];
  return r ? { pinHash: r.PinHash, provisorio: !!r.Provisorio, expiraEm: r.ProvisorioExpiraEm || null } : null;
}

// Grava (ou troca) o PIN. `provisorioPor`: matrícula de quem gerou o provisório (Secretaria); nulo = a própria pessoa escolheu.
// Zera o contador de erros: quem acabou de criar o PIN não nasce bloqueado.
async function gravarPin(pool, membroId, pin, { provisorioPor = null } = {}) {
  const hash = hashPin(pin, membroId);
  const prov = provisorioPor != null;
  const pedido = () => pool.request().input("m", sql.Int, membroId).input("h", sql.NVarChar(200), hash).input("prov", sql.Bit, prov)
    .input("dias", sql.Int, VALIDADE_PROVISORIO_DIAS).input("por", sql.Int, prov ? provisorioPor : null);
  const atualizar = `UPDATE MembroPins SET PinHash = @h, Provisorio = @prov, ProvisorioExpiraEm = CASE WHEN @prov = 1 THEN DATEADD(DAY, @dias, SYSUTCDATETIME()) ELSE NULL END,
                       DefinidoPorMembroId = @por, AtualizadoEm = SYSUTCDATETIME() WHERE MembroId = @m`;
  let r = await pedido().query(`${atualizar}; SELECT @@ROWCOUNT AS n`);
  if (!(r.recordset[0] && r.recordset[0].n > 0)) {
    try {
      await pedido().query(`INSERT INTO MembroPins (MembroId, PinHash, Provisorio, ProvisorioExpiraEm, DefinidoPorMembroId)
                            VALUES (@m, @h, @prov, CASE WHEN @prov = 1 THEN DATEADD(DAY, @dias, SYSUTCDATETIME()) ELSE NULL END, @por)`);
    } catch (e) {
      if (e && (e.number === 2601 || e.number === 2627)) await pedido().query(atualizar);       // duas gravações ao mesmo tempo: vale a última
      else throw e;
    }
  }
  await limparTentativas(pool, membroId, "PIN");
}

// Reserva UMA tentativa de forma atômica ANTES de conferir a credencial. Devolve { bloqueado:true } se a pessoa já estava bloqueada (e nada foi
// conferido), ou { bloqueado:false, falhas, bloqueadaAgora } com a tentativa já contada como falha — quem acerta chama limparTentativas.
async function reservarTentativa(pool, membroId, canal, limite = LIMITE_FALHAS_PIN) {
  const r = await pool.request().input("m", sql.Int, membroId).input("c", sql.NVarChar(10), canal).input("lim", sql.Int, limite).query(`
    DECLARE @agora DATETIME2 = SYSUTCDATETIME();
    BEGIN TRY
      INSERT INTO AcessoTentativas (MembroId, Canal) SELECT @m, @c
      WHERE NOT EXISTS (SELECT 1 FROM AcessoTentativas WITH (UPDLOCK, HOLDLOCK) WHERE MembroId = @m AND Canal = @c);
    END TRY
    BEGIN CATCH
      IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH;
    -- Um dia inteiro sem erro apaga o histórico: quem erra de vez em quando não escala para o bloqueio de 24 h, e quem ataca com requisições espaçadas não consegue manter
    -- um bloqueio para sempre. (Prev = erros contados; Bloq = já está bloqueada agora.)
    UPDATE t SET
      Falhas = CASE WHEN x.Bloq = 1 THEN t.Falhas ELSE x.Prev + 1 END,
      UltimaFalhaEm = CASE WHEN x.Bloq = 1 THEN t.UltimaFalhaEm ELSE @agora END,
      BloqueadoAte = CASE
        WHEN x.Bloq = 1 THEN t.BloqueadoAte
        WHEN (x.Prev + 1) % @lim = 0 THEN DATEADD(MINUTE, CASE (x.Prev + 1) / @lim WHEN 1 THEN 15 WHEN 2 THEN 60 WHEN 3 THEN 240 ELSE 1440 END, @agora)
        ELSE NULL END
    OUTPUT CAST(x.Bloq AS BIT) AS EstavaBloqueado,
           inserted.Falhas AS Falhas, CAST(CASE WHEN inserted.BloqueadoAte IS NOT NULL AND inserted.BloqueadoAte > @agora THEN 1 ELSE 0 END AS BIT) AS BloqueadaAgora
    FROM AcessoTentativas t
    CROSS APPLY (SELECT CASE WHEN t.UltimaFalhaEm IS NOT NULL AND t.UltimaFalhaEm < DATEADD(HOUR, -24, @agora) AND NOT (t.BloqueadoAte IS NOT NULL AND t.BloqueadoAte > @agora) THEN 0 ELSE t.Falhas END AS Prev,
                        CASE WHEN t.BloqueadoAte IS NOT NULL AND t.BloqueadoAte > @agora THEN 1 ELSE 0 END AS Bloq) x
    WHERE t.MembroId = @m AND t.Canal = @c;`);
  const l = r.recordset[0];
  if (!l) return { bloqueado: true, falhas: 0 };            // sem linha: não deve acontecer; na dúvida, não confere
  if (l.EstavaBloqueado) return { bloqueado: true, falhas: l.Falhas };
  return { bloqueado: false, falhas: l.Falhas, bloqueadaAgora: !!l.BloqueadaAgora };
}

async function limparTentativas(pool, membroId, canal) {
  await pool.request().input("m", sql.Int, membroId).input("c", sql.NVarChar(10), canal)
    .query(`UPDATE AcessoTentativas SET Falhas = 0, BloqueadoAte = NULL, UltimaFalhaEm = NULL WHERE MembroId = @m AND Canal = @c`);
}

module.exports = {
  PIN_REGEX, LIMITE_FALHAS_PIN, LIMITE_FALHAS_SENHA, VALIDADE_PROVISORIO_DIAS, MENSAGEM_GENERICA,
  formatoPinValido, pinFraco, mensagemPinFraco, gerarPinProvisorio, derivadosDeNascimento,
  hashPin, verificarPin, conferenciaFalsa,
  lerPin, gravarPin, reservarTentativa, limparTentativas
};
