// Semeia dados FICTÍCIOS no banco de HOMOLOGAÇÃO (vD.3, 07/10/2026).
//
// Uso: SQL_CONNECTION_STRING=<conexão do ieadespa-homolog> node scripts/semear-homologacao.js
//      (o fluxo do PR de homologação roda isto logo depois das migrações, com o segredo
//       AZURE_SQL_CONNECTION_STRING_HOMOLOG; ver .github/workflows/azure-static-web-apps-white-grass-*.yml)
//
// TRAVA: só roda se a conexão apontar para um banco cujo nome contém "homolog" — nunca na
// produção, onde todo dado é real e intocável (seção 2.4 do README).
//
// Idempotente: cada peça fictícia tem uma marca ("Fictícia", matrículas 900001+, slug "fict-…")
// e só é criada se ainda não existir. Não apaga nada.
//
// O que cria (o suficiente para alguém — ou uma sessão de IA — entrar e percorrer o sistema):
//   - 1 Área ("Área Fictícia") com 3 congregações ("Fictícia - Alfa/Beta/Gama"), ligadas à área;
//   - 60 pessoas (matrículas 900001 a 900060), distribuídas nas 3 congregações, com idade,
//     admissão, batismo, estado civil, telefone e e-mail fictícios; 1 em cada 5 é menor (congregado);
//   - 20 dizimistas (adultos);
//   - lideranças com senha (a mesma para todos, "Homolog@2026" — ou SEED_SENHA): dirigente e
//     tesoureiro local de cada congregação e um pastor de área. Os papéis "Dirigente de
//     Congregação" e "Pastor de Área" são criados se não existirem.
// Lançamentos de tesouraria, EBD, escalas etc. ficam para serem gerados pelas próprias telas/API
// (as regras de termo, categoria e fechamento são do app, não deste script).
const crypto = require("crypto");
const sql = require("mssql");

const SENHA = process.env.SEED_SENHA || "Homolog@2026";
const BASE_MATRICULA = 900000;

function hashSenha(senha) {
  // Mesmo formato de api/shared/auth.js (que não é carregado aqui porque exige AUTH_SECRET).
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(senha), salt, 64).toString("hex")}`;
}

const NOMES = ["Ana", "Bruno", "Carla", "Daniel", "Elisa", "Fábio", "Gabriela", "Heitor", "Isabela", "João", "Karen", "Lucas", "Marina", "Nelson", "Olívia", "Paulo", "Quitéria", "Rafael", "Sandra", "Tiago"];
const SOBRENOMES = ["Fictício", "de Teste", "Exemplo", "da Homologação", "Simulado", "Amostra"];
const nomeDe = (i) => `${NOMES[i % NOMES.length]} ${SOBRENOMES[Math.floor(i / NOMES.length) % SOBRENOMES.length]} ${String(i + 1).padStart(2, "0")}`;
const dataAnosAtras = (anos, dia) => { const d = new Date(Date.UTC(2026, 9, 7)); d.setUTCFullYear(d.getUTCFullYear() - anos); d.setUTCDate(1 + (dia % 27)); return d.toISOString().slice(0, 10); };

async function main() {
  const conexao = process.env.SQL_CONNECTION_STRING;
  if (!conexao) { console.error("Defina SQL_CONNECTION_STRING."); process.exit(1); }
  const banco = (conexao.match(/(?:Initial Catalog|Database)=([^;]+)/i) || [])[1] || "";
  if (!/homolog/i.test(banco)) { console.error(`TRAVA: o banco da conexão é "${banco || "?"}", não é de homologação. Nada feito.`); process.exit(2); }

  const pool = await sql.connect(conexao);
  const q = (texto, entradas = {}) => { const r = pool.request(); for (const [k, v] of Object.entries(entradas)) r.input(k, v); return r.query(texto); };
  const escalar = async (texto, entradas) => { const r = await q(texto, entradas); return r.recordset[0] ? Object.values(r.recordset[0])[0] : null; };
  const lerUma = async (texto, entradas) => { const r = await q(texto, entradas); return r.recordset[0] || null; };
  const feito = [];

  // 1) Área
  let areaId = await escalar("SELECT AreaId FROM dbo.Areas WHERE Nome = @n", { n: "Área Fictícia (homologação)" });
  if (!areaId) { areaId = await escalar("INSERT INTO dbo.Areas (Nome, Ativa, AtivadaEm) OUTPUT INSERTED.AreaId VALUES (@n, 1, '2026-01-01')", { n: "Área Fictícia (homologação)" }); feito.push("área"); }

  // 2) Congregações
  const congs = [];
  for (const [i, nome] of ["Alfa", "Beta", "Gama"].entries()) {
    const nomeCompleto = `Fictícia - ${nome}`;
    let id = await escalar("SELECT CongregacaoId FROM dbo.Congregacoes WHERE Nome = @n", { n: nomeCompleto });
    if (!id) {
      id = await escalar(
        "INSERT INTO dbo.Congregacoes (Nome, Ativa, AreaId, Slug, Endereco, Bairro, Cidade, Estado, Horarios, FundacaoAno) OUTPUT INSERTED.CongregacaoId VALUES (@n, 1, @a, @s, @e, @b, 'Parauapebas', 'PA', 'Dom 19h · Qua 19h30', @f)",
        { n: nomeCompleto, a: areaId, s: `fict-${nome.toLowerCase()}`, e: `Rua Fictícia, ${100 + i * 10}`, b: `Bairro ${nome}`, f: 2000 + i },
      );
      feito.push(`congregação ${nome}`);
    }
    const vinculo = await escalar("SELECT COUNT(*) FROM dbo.VinculoCongregacaoArea WHERE CongregacaoId = @c AND AreaId = @a AND DataFim IS NULL", { c: id, a: areaId });
    if (!vinculo) await q("INSERT INTO dbo.VinculoCongregacaoArea (CongregacaoId, AreaId, DataInicio) VALUES (@c, @a, '2026-01-01')", { c: id, a: areaId });
    congs.push({ id, nome });
  }

  // 3) Pessoas
  let pessoasCriadas = 0;
  const adultos = [];
  for (let i = 0; i < 60; i++) {
    const matricula = BASE_MATRICULA + i + 1;
    const cong = congs[i % congs.length];
    const menor = i % 5 === 4;
    const idade = menor ? 8 + (i % 9) : 18 + ((i * 7) % 60);
    adultos.push(...(menor ? [] : [{ matricula, cong }]));
    const existe = await escalar("SELECT COUNT(*) FROM dbo.MembroReferencia WHERE MembroId = @m", { m: matricula });
    if (existe) continue;
    await q(
      `INSERT INTO dbo.MembroReferencia (MembroId, Nome, CongregacaoId, Status, SituacaoMembro, DataNascimento, DataAdmissao, DataBatismo, EstadoCivil, Telefone, Email, DizimistaFiel)
       VALUES (@m, @n, @c, 'ATIVO', @s, @nasc, @adm, @bat, @ec, @tel, @mail, @dz)`,
      {
        m: matricula, n: nomeDe(i), c: cong.id, s: menor ? "CONGREGADO" : "EM_COMUNHAO",
        nasc: dataAnosAtras(idade, i), adm: dataAnosAtras(Math.min(idade - (menor ? 0 : 12), 10), i + 3), bat: menor ? null : dataAnosAtras(Math.min(idade - 12, 8), i + 5),
        ec: menor ? "SOLTEIRO" : ["SOLTEIRO", "CASADO", "VIUVO", "DIVORCIADO"][i % 4], tel: `(94) 9${String(8000000 + i * 1237).slice(0, 4)}-${String(1000 + i * 37).slice(-4)}`,
        mail: `pessoa${i + 1}@exemplo.com`, dz: menor ? null : i % 3 === 0,
      },
    );
    pessoasCriadas++;
  }
  if (pessoasCriadas) feito.push(`${pessoasCriadas} pessoas`);

  // 4) Dizimistas (20 adultos)
  let dizimistas = 0;
  for (const { matricula, cong } of adultos.slice(0, 20)) {
    const existe = await escalar("SELECT COUNT(*) FROM dbo.Dizimistas WHERE MembroId = @m", { m: matricula });
    if (existe) continue;
    const nome = await escalar("SELECT Nome FROM dbo.MembroReferencia WHERE MembroId = @m", { m: matricula });
    await q("INSERT INTO dbo.Dizimistas (CongregacaoId, Nome, MembroId, Ativo) VALUES (@c, @n, @m, 1)", { c: cong.id, n: nome, m: matricula });
    dizimistas++;
  }
  if (dizimistas) feito.push(`${dizimistas} dizimistas`);

  // 5) Papéis e lideranças
  // Papel criado se faltar; se já existe, garante que tem ao menos as permissões listadas (só acrescenta — é o banco
  // de homologação, e as telas que a revisão automática abre precisam dessas permissões nos fictícios).
  const papel = async (nome, nivel, permissoes) => {
    const linha = await lerUma("SELECT PapelId, Permissoes FROM dbo.Papeis WHERE Nome = @n", { n: nome });
    if (!linha) { const id = await escalar("INSERT INTO dbo.Papeis (Nome, Nivel, Permissoes) OUTPUT INSERTED.PapelId VALUES (@n, @v, @p)", { n: nome, v: nivel, p: permissoes }); feito.push(`papel ${nome}`); return id; }
    const atuais = String(linha.Permissoes || "").split(",").map((s) => s.trim()).filter(Boolean);
    const faltam = permissoes.split(",").filter((p) => !atuais.includes(p));
    if (faltam.length) { await q("UPDATE dbo.Papeis SET Permissoes = @p WHERE PapelId = @id", { p: [...atuais, ...faltam].join(","), id: linha.PapelId }); feito.push(`papel ${nome}: +${faltam.join(",")}`); }
    return linha.PapelId;
  };
  const papelDirigente = await papel("Dirigente de Congregação", "CONGREGACAO", "reunioes,pessoas,relatorios,escalas");
  const papelTesoureiro = await papel("Tesoureiro Local", "CONGREGACAO", "financeiro");
  // psc_gestao, calendario_secretaria, canais_gestao, eventos_gestao, ebd_gestao: as telas que viraram módulos na vD.2 — o pastor
  // fictício abre cada uma de verdade na homologação (prova em navegador de cada módulo extraído)
  const papelPastorArea = await papel("Pastor de Área", "AREA", "reunioes,pessoas,relatorios,disciplina,psc_gestao,calendario_secretaria,canais_gestao,eventos_gestao,ebd_gestao");
  const lideranca = async (matricula, papelId, escopoTipo, escopoId, rotulo) => {
    const existe = await escalar("SELECT COUNT(*) FROM dbo.Lideranca WHERE MembroId = @m AND PapelId = @p", { m: matricula, p: papelId });
    if (existe) return;
    await q("INSERT INTO dbo.Lideranca (MembroId, PapelId, EscopoTipo, EscopoId, SenhaHash) VALUES (@m, @p, @t, @e, @h)", { m: matricula, p: papelId, t: escopoTipo, e: escopoId, h: hashSenha(SENHA) });
    feito.push(rotulo);
  };
  // dirigente = 1º adulto de cada congregação; tesoureiro = 2º; pastor de área = 3º adulto da Alfa
  for (const cong of congs) {
    const daCong = adultos.filter((a) => a.cong.id === cong.id);
    if (daCong[0]) await lideranca(daCong[0].matricula, papelDirigente, "CONGREGACAO", cong.id, `dirigente ${cong.nome} (matrícula ${daCong[0].matricula})`);
    if (daCong[1]) await lideranca(daCong[1].matricula, papelTesoureiro, "CONGREGACAO", cong.id, `tesoureiro ${cong.nome} (matrícula ${daCong[1].matricula})`);
  }
  const terceiroAlfa = adultos.filter((a) => a.cong.id === congs[0].id)[2];
  if (terceiroAlfa) await lideranca(terceiroAlfa.matricula, papelPastorArea, "AREA", areaId, `pastor de área (matrícula ${terceiroAlfa.matricula})`);

  await pool.close();
  console.log(feito.length ? `Semeado em "${banco}": ${feito.join("; ")}.` : `Nada a criar em "${banco}": a massa fictícia já existia.`);
  console.log(`Acessos fictícios (senha ${process.env.SEED_SENHA ? "de SEED_SENHA" : "padrão do script"}): dirigentes/tesoureiros = 1º e 2º adulto de cada congregação; pastor de área = 3º adulto da Alfa. Matrículas de ${BASE_MATRICULA + 1} a ${BASE_MATRICULA + 60}.`);
}

main().catch((e) => { console.error("ERRO ao semear:", e.message); process.exit(1); });
