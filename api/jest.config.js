// Só arquivos *.test.js são suíte de teste — testUtils.js (helpers/mocks
// compartilhados) mora dentro de __tests__/ pra ficar perto do que testa,
// mas não é ele mesmo um teste.
module.exports = {
  testMatch: ["**/__tests__/**/*.test.js"]
};
