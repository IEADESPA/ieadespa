# 01. Visão Geral

## Problema

Hoje, os departamentos e secretarias de cada congregação (IEADESPA) produzem
relatórios mensais (atividades, membros, finanças/contribuições, rateios etc.) em
planilhas Excel (ver exemplos reais em [08-roadmap.md](08-roadmap.md)). Isso dificulta:

- A consolidação da informação por área e por campo (rede inteira de congregações).
- O acompanhamento em tempo hábil por parte das lideranças de área e da liderança
  geral.
- A rastreabilidade histórica (quem enviou o quê, quando, e se houve correção) — hoje
  as planilhas não têm controle de versão nem log de quem alterou o quê.

## Objetivo do sistema

Criar uma aplicação web onde:

1. **Líderes locais** de cada um dos 8 departamentos/secretarias (ver
   [04-departamentos-secretarias.md](04-departamentos-secretarias.md)) preenchem e
   enviam o relatório do seu departamento todo mês, reproduzindo digitalmente o que
   hoje é feito em planilha.
2. O relatório passa por um **fluxo de duas aprovações** (Líder de Área → Líder Geral)
   antes de ser considerado fechado — ver [06-fluxo-relatorios.md](06-fluxo-relatorios.md).
3. **Líderes de área, pastores de área, líderes gerais** e a **liderança do campo**
   enxergam relatórios consolidados no seu respectivo nível — ver
   [03-perfis-acesso.md](03-perfis-acesso.md).
4. Cada um dos 8 departamentos/secretarias tem seu **próprio formato de relatório e
   suas próprias regras de rateio**, configuráveis pelo Secretário(a) Geral.

## Confirmado sobre a operação

- O relatório é **sempre mensal**, para todos os 8 departamentos.
- Um mesmo líder **pode responder por mais de um departamento e/ou mais de uma
  congregação** — é comum na prática, por falta de pessoas disponíveis.
- Um relatório enviado **pode ser editado/reenviado**, mas com regras: uma vez aprovado
  pelo Líder de Área, o Líder Local perde a permissão de editar; uma vez aprovado pelo
  Líder Geral, o relatório é definitivo (só uma retificação do Presidente/Secretário
  Geral pode mudá-lo depois disso).
- **Todo relatório passa por aprovação** — nada é aprovado automaticamente.
- "Campo" é a instituição inteira (IEADESPA); "Área" é uma subdivisão regional com
  várias congregações — nomenclatura confirmada.

## Público-alvo (perfis de usuário)

Ver detalhamento completo em [03-perfis-acesso.md](03-perfis-acesso.md). Resumo: Líder
Local (por departamento), Dirigente da Congregação, Líder de Área (por departamento),
Pastor de Área, Líder Geral (por departamento, 8 no total), Secretário(a) Geral,
Presidente do Campo.

## Fora de escopo

- Substituir sistemas financeiros/contábeis oficiais da instituição — o sistema é de
  **relatório, aprovação e consolidação**, não de contabilidade formal.
- Upload de comprovantes/anexos — decisão explícita (ver
  [04-departamentos-secretarias.md](04-departamentos-secretarias.md)); quem precisar
  comprovar algo usa canais externos (WhatsApp).
- App mobile nativo — web responsivo cobre o caso de uso.
- Login corporativo Microsoft/Azure AD para usuários finais — inviável financeiramente
  para ~500 usuários; login será por matrícula + senha própria do sistema.
