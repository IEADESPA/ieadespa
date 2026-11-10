// Testes de UNIDADE do crachá e do certificado novos (10/11/2026), sem rede: as regras (`src/lib/arteEventoRegras.ts` — cores, a
// configuração guardada em `cracha_config`, o texto do certificado, o nome do crachá, a data por extenso, o endereço da verificação) e as
// costuras (as páginas /cracha/ e /certificado/ usam o desenho novo, a verificação abre com o código do QR, o lote da lista de inscritos
// desenha um de cada vez, a aba "Crachá e certificado" grava só `cracha_config` e o "Salvar evento" não mexe mais nele). O desenho em si
// (canvas) é conferido no navegador.
// Como rodar (de dentro de site/):  node scripts/testes/arte-evento-unidade.cjs
const fs = require("fs");
const path = require("path");
const { carregarTs } = require("./carregar-ts.cjs");

let falhas = 0;
let total = 0;
const eq = (a, b, d) => {
  total += 1;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { falhas++; console.log("  FALHA", d, "→", JSON.stringify(a), "esperado", JSON.stringify(b)); } else console.log("  ok   ", d);
};
const verdade = (c, d) => eq(!!c, true, d);
async function tentar(nome, fn) {
  try { await fn(); } catch (e) { falhas++; total++; console.log("  FALHA", nome, "→ o bloco quebrou:", e && e.message); }
}
const ler = (rel) => fs.readFileSync(path.join(__dirname, "../../src", rel), "utf8");
const B = String.fromCharCode(92);

(async () => {
  const R = await carregarTs("arteEventoRegras");

  await tentar("a aparência", async () => {
    console.log("== a aparência (cracha_config.visual) ==");
    eq(R.normalizarVisual(null), { tema: "azul", usarCapa: true }, "sem nada: azul e com a imagem do evento");
    eq(R.normalizarVisual({ visual: { tema: "vinho", usarCapa: false } }), { tema: "vinho", usarCapa: false }, "o que foi escolhido");
    eq(R.normalizarVisual({ visual: { tema: "rosa-choque" } }).tema, "azul", "cor que não existe: azul");
    eq(R.normalizarVisual(JSON.stringify({ visual: { tema: "verde" } })).tema, "verde", "o JSON em texto também vale");
    for (const lixo of ["{", [], 5, { visual: "x" }, { visual: [] }]) eq(R.normalizarVisual(lixo), { tema: "azul", usarCapa: true }, `lixo ${JSON.stringify(lixo)}: o padrão`);
    eq(Object.keys(R.PALETAS).sort(), ["azul", "grafite", "verde", "vinho"], "quatro paletas");
    verdade(Object.values(R.PALETAS).every((p) => ["principal", "escuro", "destaque", "suave", "texto"].every((k) => /^#[0-9A-F]{6}$/.test(p[k]))), "toda paleta com as cinco cores em hexadecimal");
    eq(R.corDoTipo("Preletor", R.PALETAS.azul), "#A6800F", "Preletor: dourado");
    eq(R.corDoTipo("Equipe", R.PALETAS.vinho), "#15803D", "Equipe: verde (em qualquer tema)");
    eq(R.corDoTipo(null, R.PALETAS.verde), R.PALETAS.verde.principal, "sem tipo: a cor do tema");
    eq(R.corDoTipo("Outro", R.PALETAS.grafite), R.PALETAS.grafite.principal, "tipo desconhecido: a cor do tema");
  });

  await tentar("o certificado", async () => {
    console.log("== o certificado (cracha_config.certificado) ==");
    const padrao = R.normalizarCertificado(null);
    eq(padrao, { titulo: "Participação", texto: R.TEXTO_PADRAO, carga: "", local: "", assinantes: [] }, "sem nada: Participação, o texto padrão, sem assinatura");
    const c = R.normalizarCertificado({ certificado: { titulo: "Conclusão", carga: "8 horas", local: "Parauapebas/PA", assinantes: [{ nome: "Pr. José", cargo: "Pastor Presidente", assinatura: "9440f6a8-d02d-423b-b03d-d9dc59c29dfe" }, { nome: " Ev. Jesaias ", cargo: "" }, { nome: "Terceiro", cargo: "x" }] } });
    eq([c.titulo, c.carga, c.local, c.assinantes.length], ["Conclusão", "8 horas", "Parauapebas/PA", 2], "título, carga, cidade e no máximo duas assinaturas");
    eq(c.assinantes[1], { nome: "Ev. Jesaias", cargo: "", assinatura: null }, "nome aparado, sem cargo e sem imagem");
    eq(R.normalizarCertificado({ certificado: { assinantes: [{ nome: "X", assinatura: "../../etc/passwd" }] } }).assinantes[0].assinatura, null, "id de assinatura que não é de arquivo: descartado");
    eq(R.normalizarCertificado({ certificado: { assinantes: [{ nome: "", cargo: "Pastor" }] } }).assinantes, [], "assinatura sem nome: não sai");
    const sujo = R.normalizarCertificado({ certificado: { titulo: "Honra" + B + "u202e" + "x".repeat(80), texto: "a\u2028b {evento}" } });
    eq([sujo.titulo.length <= 40, sujo.texto], [true, "a b {evento}"], "título cortado em 40 e invisíveis viram espaço");
  });

  await tentar("o texto do certificado", async () => {
    console.log("== o texto do certificado ==");
    const base = { evento: "Seminário", data: "28 e 29 de novembro de 2026", carga: "", local: "Parauapebas/PA", tipo: "Participante" };
    eq(R.textoDoCertificado(R.TEXTO_PADRAO, base), "participou do evento “Seminário”, realizado em 28 e 29 de novembro de 2026.", "o padrão, para Participante");
    eq(R.textoDoCertificado(R.TEXTO_PADRAO, { ...base, tipo: "Preletor", carga: "8 horas" }), "participou na qualidade de Preletor do evento “Seminário”, realizado em 28 e 29 de novembro de 2026, com carga horária de 8 horas.", "Preletor e a carga horária");
    eq(R.textoDoCertificado("", { ...base, tipo: null }), "participou do evento “Seminário”, realizado em 28 e 29 de novembro de 2026.", "modelo vazio = o padrão; sem tipo = sem qualidade");
    eq(R.textoDoCertificado("concluiu {evento} em {local}{carga}.", { ...base, data: "" }), "concluiu “Seminário” em Parauapebas/PA.", "modelo próprio, {local}, e a carga vazia some sem deixar espaço antes do ponto");
    eq(R.textoDoCertificado("{evento} {xyz}", base), "“Seminário” {xyz}", "código desconhecido fica como está (o painel já não deixa salvar)");
    eq(R.textoDoCertificado("participou de {evento} em {data}", { ...base, data: "" }), "participou de “Seminário” em data a confirmar", "sem data: \"data a confirmar\"");
    eq(R.problemaCertificado({ texto: "participou de {evento}", assinantes: [] }), null, "texto com {evento}: pode");
    eq(R.problemaCertificado({ texto: "", assinantes: [] }), null, "texto vazio (= o padrão): pode");
    verdade(/\{nome\} não é um código conhecido/.test(R.problemaCertificado({ texto: "{nome} participou de {evento}", assinantes: [] })), "código desconhecido: recusado, dizendo qual");
    eq(R.problemaCertificado({ texto: "participou do seminário", assinantes: [] }), "O texto do certificado precisa ter {evento} (o nome do evento).", "texto sem {evento}: recusado");
    eq(R.problemaCertificado({ texto: "", assinantes: [{ nome: "", cargo: "Pastor" }] }), "Toda assinatura precisa do nome de quem assina.", "assinatura só com cargo: recusada");
  });

  await tentar("o crachá, a data e o resto", async () => {
    console.log("== o crachá, a data por extenso e o resto ==");
    eq(R.nomesDoCracha("Maria Aparecida dos Santos"), { destaque: "Maria", completo: "Maria Aparecida dos Santos" }, "o primeiro nome em destaque e o completo embaixo");
    eq(R.nomesDoCracha("  Ana  "), { destaque: "Ana", completo: null }, "nome de uma palavra: sem a linha de baixo");
    eq(R.nomesDoCracha(""), { destaque: "", completo: null }, "sem nome: vazio, sem quebrar");
    eq(R.periodoPorExtenso("2026-11-28", null), "28 de novembro de 2026", "um dia");
    eq(R.periodoPorExtenso("2026-11-28", "2026-11-29"), "28 e 29 de novembro de 2026", "dois dias seguidos: \"e\"");
    eq(R.periodoPorExtenso("2026-11-28", "2026-11-30"), "28 a 30 de novembro de 2026", "três dias: \"a\"");
    eq(R.periodoPorExtenso("2026-11-30", "2026-12-02"), "30 de novembro a 2 de dezembro de 2026", "virando o mês");
    eq(R.periodoPorExtenso("2026-12-30", "2027-01-02"), "30 de dezembro de 2026 a 2 de janeiro de 2027", "virando o ano");
    eq(R.periodoPorExtenso("2026-11-28", "2026-11-29", true), "28 e 29 de novembro", "sem o ano (o crachá)");
    eq(R.periodoPorExtenso("2026-11-28", "2026-11-28"), "28 de novembro de 2026", "fim igual ao início: um dia");
    eq(R.periodoPorExtenso("2026-11-28", "2026-11-20"), "28 de novembro de 2026", "fim antes do início: vale o início");
    eq(R.periodoPorExtenso(null, null), "", "sem data: vazio");
    eq(R.periodoPorExtenso("lixo", "2026-11-29"), "", "data quebrada: vazio");
    eq(R.periodoPorExtenso("2026-11-28T00:00:00", null), "28 de novembro de 2026", "data com hora: só o dia (sem fuso)");
    eq(R.urlVerificacao("https://ieadespa.org.br/", "engenharia-ministerial", "A3F9K2"), "https://ieadespa.org.br/verificar-certificado/engenharia-ministerial/?codigo=A3F9K2", "o endereço do QR do certificado");
    eq(R.urlVerificacao("https://x.br", "a b", "C&D"), "https://x.br/verificar-certificado/a%20b/?codigo=C%26D", "o endereço escapa o que precisa");
    eq(R.nomeDeArquivo("Maria Aparecida dos Santos"), "maria-aparecida-dos-santos", "nome de arquivo sem acento nem espaço");
    eq(R.nomeDeArquivo("João/../<x>"), "joao-x", "nome de arquivo sem barra nem sinal");
    eq(R.nomeDeArquivo("!!!"), "arquivo", "nada que sobre: \"arquivo\"");
  });

  await tentar("as páginas e o painel", async () => {
    console.log("== as páginas, o lote e o painel ==");
    const cert = ler("pages/certificado/[slug].astro");
    verdade(/from "@\/lib\/arteEvento"/.test(cert) && /desenharCertificado\(/.test(cert) && /certificadosEmPdf\(\[canvas\]/.test(cert), "o /certificado/ usa o desenho novo e o PDF dele");
    verdade(/detalhes: true/.test(cert) && /pessoa\.tipoParticipante/.test(cert), "o /certificado/ pede o tipo (Preletor etc.) para o texto");
    verdade(/if \(!pessoa\.presente\)/.test(cert), "o /certificado/ continua só para quem teve presença confirmada");
    verdade(/data-arte-compartilhar hidden/.test(cert) && /data-arte-imagem/.test(cert) && /data-arte-pdf/.test(cert), "o /certificado/ tem PDF, imagem e compartilhar (este só aparece no aparelho que compartilha)");
    const cr = ler("pages/cracha/[slug].astro");
    verdade(/from "@\/lib\/arteEvento"/.test(cr) && /desenharCracha\(/.test(cr) && /crachasEmPdf\(\[canvas\]/.test(cr) && /cracha: true/.test(cr), "o /cracha/ usa o desenho novo e a configuração que a verificação devolve");
    verdade(/data-evento-capa=\{event\.cover \?\? ""\}/.test(cr), "o /cracha/ leva a imagem do evento");
    const ver = ler("pages/verificar-certificado/[slug].astro");
    verdade(/get\("codigo"\)/.test(ver) && /form\.requestSubmit\(\)/.test(ver) && /\^\[A-Z0-9\]\{6\}\$/.test(ver), "a verificação abre com o código do QR e confere sozinha (só código de 6)");
    const ins = ler("pages/painel-eventos/evento/inscritos.astro");
    verdade((ins.match(/await lotesEmPdf\(\{/g) || []).length === 2 && /tipo: "cracha"/.test(ins) && /tipo: "certificado"/.test(ins), "o lote (crachás e certificados) usa o desenho novo, um de cada vez");
    const arte = ler("lib/arteEvento.ts");
    verdade(/export const POR_ARQUIVO = 100;/.test(arte) && /doc\.save\(partes > 1/.test(arte), "o lote sai em arquivos de até 100 pessoas");
    verdade(/globalCompositeOperation = "multiply"/.test(arte), "a assinatura em foto: o fundo branco some no papel");
    verdade(arte.includes("mini.width = 40;") && arte.includes("ctx.drawImage(mini, 0, 0, L, topo)") && !arte.includes("cobrir(ctx, recursos.capa"), "a imagem do evento (o cartaz, cheio de texto) vai DESFOCADA no topo do crachá — miniatura ampliada, funciona no iPhone");
    verdade(/img\.crossOrigin = "anonymous"/.test(arte) && /img\.onerror = \(\) => ok\(null\)/.test(arte), "imagem que não carrega (CORS): o desenho segue sem ela");
    const painel = ler("pages/painel-eventos/evento/index.astro");
    verdade(/data-tab="arte">Crachá e certificado<\/button>/.test(painel) && /<PainelArte \/>/.test(painel), "a aba \"Crachá e certificado\" existe");
    const dados = painel.slice(painel.indexOf('<div data-tab-panel="dados">'), painel.indexOf('<div data-tab-panel="imagem"'));
    verdade(dados.length > 200 && !/data-cracha-config/.test(dados), "o bloco do crachá saiu da aba Dados");
    verdade(/body: JSON\.stringify\(dadosForm\), \/\/ 10\/11\/2026/.test(painel) && !/cracha_config: lerCracha\(\)/.test(painel), "o \"Salvar evento\" não grava mais o crachá (um não apaga o outro)");
    verdade(/body: JSON\.stringify\(\{ cracha_config: valor \}\)/.test(painel) && /return \{ \.\.\.atual, \.\.\.lerCracha\(\), \.\.\.lerArte\(\) \};/.test(painel), "a aba grava SÓ `cracha_config`, mantendo o que já estava e juntando crachá, aparência e certificado");
    verdade(/const problema = problemaCracha\(\) \?\? problemaArte\(\);/.test(painel), "a aba confere o crachá e o certificado antes de gravar");
    verdade(!fs.existsSync(path.join(__dirname, "../../src/lib/certificado.ts")) && !/export function desenharCracha/.test(ler("lib/cracha.ts")), "o desenho antigo (jsPDF) saiu");
    const pa = ler("lib/painelArte.ts");
    verdade(/problemaDaImagem\(f\)/.test(pa) && /fd\.append\("title"/.test(pa) && pa.indexOf('fd.append("title"') < pa.indexOf('fd.append("file"'), "a imagem da assinatura: conferida antes e o título antes do arquivo");
  });

  console.log(`\ncrachá e certificado: ${total - falhas}/${total} verificações ok${falhas ? ` — ${falhas} FALHA(S)` : ""}`);
  process.exit(falhas ? 1 : 0);
})();
