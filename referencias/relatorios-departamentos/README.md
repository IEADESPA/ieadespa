# Sistema de Relatórios de Departamentos e Secretarias

Sistema para coleta, consolidação e visualização mensal dos relatórios enviados pelos
departamentos e secretarias das congregações, organizados por área e consolidados em
nível de campo (igreja como um todo).

Este repositório está, neste momento, em **fase conceitual**: os arquivos aqui servem
para alinhar entendimento sobre o problema, a estrutura organizacional, os perfis de
acesso e a arquitetura antes de qualquer linha de código de produção ser escrita.
A ideia é evoluir esta documentação junto com vocês, registrando decisões e dúvidas em
aberto, até termos um desenho maduro o suficiente para iniciar a implementação.

## Como navegar

| Documento | Conteúdo |
|---|---|
| [docs/01-visao-geral.md](docs/01-visao-geral.md) | Objetivo do sistema, problema atual, público-alvo |
| [docs/02-estrutura-organizacional.md](docs/02-estrutura-organizacional.md) | Hierarquia Campo → Área → Congregação → Departamento |
| [docs/03-perfis-acesso.md](docs/03-perfis-acesso.md) | Perfis de usuário e regras de visibilidade dos relatórios |
| [docs/04-departamentos-secretarias.md](docs/04-departamentos-secretarias.md) | Tipos de departamento/secretaria, campos de relatório e rateio |
| [docs/05-modelo-dados.md](docs/05-modelo-dados.md) | Entidades conceituais e relacionamentos |
| [docs/06-fluxo-relatorios.md](docs/06-fluxo-relatorios.md) | Ciclo mensal: preenchimento, envio, aprovação, consolidação |
| [docs/07-arquitetura-tecnica.md](docs/07-arquitetura-tecnica.md) | Stack recomendada e caminho de evolução até o Azure |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Fases do projeto e perguntas em aberto |

## Status

- [x] Levantamento inicial do problema (via conversa)
- [x] Validação da estrutura organizacional (Campo → Área → Congregação → Departamento)
- [x] Validação dos perfis de acesso e do fluxo de aprovação em duas camadas
- [x] Levantamento detalhado dos 8 departamentos/secretarias e seus campos (com base em
      planilhas reais em uso)
- [x] Restrição de orçamento Azure identificada (~US$ 30/mês) e incorporada à
      arquitetura
- [x] Pendências de perfis, rateio e orçamento esclarecidas (ver
      [docs/08-roadmap.md](docs/08-roadmap.md))
- [ ] Protótipo navegável (mock de telas)
- [ ] Implementação do MVP

## Departamentos/Secretarias (confirmado)

01 UCADESPA (Crianças) · 02 UMADESPA (Mocidade) · 03 USADESPA (Senhoras) · 04 UHADESPA
(Homens) · 05 SEMIADESPA (Missões) · 06 Ação da Fé (Ação Social) · 07 EBD (Escola
Bíblica Dominical) · 08 Família — detalhes em
[docs/04-departamentos-secretarias.md](docs/04-departamentos-secretarias.md).
