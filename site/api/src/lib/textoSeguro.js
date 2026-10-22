"use strict";
/*
 * Caracteres que não podem entrar em texto digitado pelo público ou pela equipe e mostrado no painel (nome de quem pagou, motivo da cortesia, quem autorizou):
 * os de controle e os INVISÍVEIS que embaralham a leitura ou escondem texto (largura zero, marcas e isolamentos de direção, hífen invisível, "tags" Unicode).
 * Revisão de 22/10/2026: a lista ganhou U+00AD, U+034F, U+061C, U+180E e U+E0000–U+E007F. Escrita como números (e não como expressão regular com os próprios
 * caracteres) para nenhuma ferramenta de edição trocar o escape pelo caractere de verdade.
 */
const FAIXAS_PROIBIDAS = [
  [0x0000, 0x001f], // controles C0 (inclui quebra de linha e tabulação)
  [0x007f, 0x009f], // DEL e controles C1
  [0x00ad, 0x00ad], // hífen invisível
  [0x034f, 0x034f], // combinador que não junta nada
  [0x061c, 0x061c], // marca de letra árabe (direção)
  [0x180e, 0x180e], // separador de vogal mongol
  [0x200b, 0x200f], // largura zero e marcas de direção
  [0x202a, 0x202e], // embutir/sobrepor direção
  [0x2060, 0x2064], // junções invisíveis
  [0x2066, 0x2069], // isolamentos de direção
  [0xfeff, 0xfeff], // BOM / largura zero sem quebra
  [0xe0000, 0xe007f], // "tags" Unicode
];

function temCaractereProibido(texto) {
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0);
    if (FAIXAS_PROIBIDAS.some(([a, b]) => c >= a && c <= b)) return true;
  }
  return false;
}

module.exports = { FAIXAS_PROIBIDAS, temCaractereProibido };
