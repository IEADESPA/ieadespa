/*
 * Regras da venda de balcão (pedido do responsável, 13/10/2026): quem tem a função "Gestor de
 * Camisetas" (ou é administrador) lança, pelo painel, a venda de uma camiseta para alguém que
 * está na sua frente — alguém que muitas vezes não tem telefone nem e-mail para deixar. Quem
 * lança se responsabiliza pelos dados (nome, telefone se houver, congregação) e escolhe o lote.
 * Aqui só há regra pura, sem rede, para ser testada sozinha.
 */
const { gerarHash, chaveTelefone } = require("./telefone");

const MAX_ITENS = 20;
const MAX_QUANTIDADE = 50;
const MAX_VALOR = 100000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(valor, max) {
  return String(valor == null ? "" : valor).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/** Lista do Directus (campo json) vira array de textos; vazio = sem restrição. */
function listaDe(valor) {
  if (Array.isArray(valor)) return valor.map((v) => String(v));
  return [];
}

/**
 * Valida o corpo da chamada e devolve `{ ok: true, dados }` ou `{ ok: false, erro }`.
 * `grupo` = { tamanhos, modelos } da campanha (lidos do Directus): se a campanha tem a lista,
 * o item só vale com um valor dela (o mesmo que o seletor do painel oferece).
 */
function validarVenda(corpo, grupo) {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? corpo : {};
  const grupoId = Number(c.grupoId);
  if (!Number.isInteger(grupoId) || grupoId <= 0) return { ok: false, erro: "Campanha inválida." };

  const seLoteAvulso = c.lote === "avulso";
  let nome = texto(c.nome, 120);
  if (!nome && seLoteAvulso) nome = "Venda avulsa";
  if (!nome) return { ok: false, erro: "Informe o nome de quem está comprando." };

  const telefoneBruto = texto(c.telefone, 40);
  let telefone = null;
  if (telefoneBruto) {
    const hash = gerarHash(telefoneBruto);
    const chave = chaveTelefone(telefoneBruto);
    if (!hash || !chave) return { ok: false, erro: "Telefone inválido: informe o DDD e o número, ou deixe em branco se a pessoa não tem." };
    telefone = { bruto: telefoneBruto, hash, chave };
  }

  const emailBruto = texto(c.email, 160).toLowerCase();
  if (emailBruto && !EMAIL.test(emailBruto)) return { ok: false, erro: "E-mail inválido: confira o que foi digitado ou deixe em branco." };
  const email = emailBruto || null;

  let congregacao = null;
  if (c.congregacaoId != null && c.congregacaoId !== "") {
    congregacao = Number(c.congregacaoId);
    if (!Number.isInteger(congregacao) || congregacao <= 0) return { ok: false, erro: "Congregação inválida." };
  }

  if (!Array.isArray(c.itens) || c.itens.length === 0) return { ok: false, erro: "Adicione pelo menos um item (tamanho, modelo e quantidade)." };
  if (c.itens.length > MAX_ITENS) return { ok: false, erro: `No máximo ${MAX_ITENS} linhas de item por venda.` };
  const tamanhos = listaDe(grupo && grupo.tamanhos);
  const modelos = listaDe(grupo && grupo.modelos);
  const itens = [];
  for (const bruto of c.itens) {
    const it = bruto && typeof bruto === "object" ? bruto : {};
    const quantidade = Number(it.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QUANTIDADE) return { ok: false, erro: `Quantidade inválida (de 1 a ${MAX_QUANTIDADE} por linha).` };
    const tamanho = texto(it.tamanho, 40) || null;
    const modelo = texto(it.modelo, 60) || null;
    if (tamanhos.length && !tamanhos.includes(tamanho)) return { ok: false, erro: `Tamanho "${tamanho || "(vazio)"}" não existe nesta campanha.` };
    if (modelos.length && !modelos.includes(modelo)) return { ok: false, erro: `Modelo "${modelo || "(vazio)"}" não existe nesta campanha.` };
    itens.push({ tamanho, modelo, quantidade });
  }

  let valorPago = 0;
  if (c.valorPago != null && c.valorPago !== "") {
    valorPago = Number(c.valorPago);
    if (!Number.isFinite(valorPago) || valorPago < 0 || valorPago > MAX_VALOR) return { ok: false, erro: "Valor pago inválido." };
    valorPago = Math.round(valorPago * 100) / 100;
  }

  // lote: "aberto" (padrão: o lote que está aberto), "avulso" (peça de estoque, sem lote) ou o número de um lote da campanha
  let lote = "aberto";
  if (c.lote != null && c.lote !== "") {
    if (c.lote === "aberto" || c.lote === "avulso") lote = c.lote;
    else {
      const n = Number(c.lote);
      if (!Number.isInteger(n) || n <= 0) return { ok: false, erro: "Lote inválido." };
      lote = n;
    }
  }

  return {
    ok: true,
    dados: {
      grupoId, nome, telefone, email, congregacao, itens, valorPago, lote,
      confirmarDuplicado: c.confirmarDuplicado === true,
      confirmarLoteFechado: c.confirmarLoteFechado === true,
    },
  };
}

module.exports = { validarVenda, MAX_ITENS, MAX_QUANTIDADE };
