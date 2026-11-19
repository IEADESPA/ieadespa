// O que a secretaria já preencheu no cadastro em etapas FICA GUARDADO se ela sair da tela (só na memória desta aba: some ao fechar o sistema,
// nunca vai para o armazenamento do aparelho — tem CPF e dados pessoais).
export interface Rascunho {
  etapa: number;
  nome: string; dataNascimento: string; sexo: string; estadoCivil: string; escolaridade: string; cpf: string;
  nomeMae: string; nomePai: string;
  telefone: string; email: string; logradouro: string; numero: string; complemento: string; bairroTexto: string; cidade: string; uf: string; cep: string;
  congregacaoId: number | null; dataAdmissao: string; formaAdmissao: string; departamentoId: number | null; departamentoTrocado: boolean; cargoMinisterial: string;
}
export function rascunhoVazio(): Rascunho {
  return {
    etapa: 0, nome: "", dataNascimento: "", sexo: "", estadoCivil: "", escolaridade: "", cpf: "", nomeMae: "", nomePai: "",
    telefone: "", email: "", logradouro: "", numero: "", complemento: "", bairroTexto: "", cidade: "", uf: "PA", cep: "",
    congregacaoId: null, dataAdmissao: "", formaAdmissao: "BATISMO", departamentoId: null, departamentoTrocado: false, cargoMinisterial: ""
  };
}
export const cadastro = $state<{ r: Rascunho }>({ r: rascunhoVazio() });
export function limparRascunho(): void { cadastro.r = rascunhoVazio(); }
