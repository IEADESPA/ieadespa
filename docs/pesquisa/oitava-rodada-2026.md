# Referência de pesquisa (8ª rodada, 2026) — o que separa o sistema de hoje do melhor que ele pode ser

> Histórico e checklist desta parte do plano de versões. As referências a “seção 2.x” e “seção 4” apontam para o
> [README](../../README.md); cada versão tem seu lugar no [índice do plano](../plano/INDICE.md).

Pedido do responsável (06/10/2026), com a FASE 7 na metade (v7.1 a v7.5 no ar, Trava 7-A por abrir): *"o que pode ser
melhorado nesse sistema, o quão bom ele pode ficar; se for pegar algo já feito, entra antes da Trava 7-A; se for fase
nova, não sei o que ainda pode ser incrementado"*.

Diferente das rodadas anteriores, esta **não é pesquisa de mercado nem varredura normativa** — as duas já foram feitas
duas vezes cada e o roteiro das FASES 7 a 12 saiu delas. É uma **leitura do sistema como ele está**: plano das 15 fases,
código (cerca de 190 rotas, 139 migrações, 97 suítes de teste, `app/script.js` com 21.690 linhas), fluxo de CI, Azure
(`HOMOLOGACAO.md`, `docs/PLATAFORMAS.md`) e os limites "ditos com honestidade" que cada versão deixou registrados.

## O que foi conferido e está bem (não entra em proposta nenhuma)

| Ponto | O que se conferiu | Resultado |
| --- | --- | --- |
| SQL montado por concatenação | 115 trechos com `${...}` dentro de `query(...)` | Todos com constante de `SELECT` ou lista de ids convertidos em número; parâmetros de verdade (`@nome`) em todo dado que vem de fora. Sem injeção. |
| Trilha de auditoria | `shared/auditoria.js` + v4.12 | Cadeia SHA-256 **e** ancoragem externa (`AuditoriaAncoragens`) já feitas. |
| "Depois eu arrumo" no código | `TODO`/`FIXME` em `api/` e `app/` | Nenhum real (as 64 ocorrências são a palavra "TODOS" em comentário). |
| Segurança do front | CSP forte, eventos por delegação, bibliotecas servidas de dentro | No ar desde 04/10/2026, 4.782 ações idênticas, zero violação. |
| Escopo e sessão | `shared/entrada.js`, `escopoRotas.js`, sessões revogáveis | Fechados em 02-03/10/2026 e presos por teste. |
| Testes de regra | 97 suítes Jest, rodando no CI **antes** das migrações | Regras de dinheiro, estatuto, escopo, LGPD, notificação cobertas. |

Conclusão: **em função de negócio, o sistema está na frente do mercado** — nenhuma das referências comparadas na 7ª
rodada (Planning Center, Rock RMS, ChurchSuite, Pushpay) tem hierarquia territorial em 6 níveis, Código Penal
Eclesiástico, PSC com 57 alíneas, rateio 60/40 com demonstrações ITG 2002 e LGPD com ROPA e RIPD juntos. Quem ainda
não viu o sistema não vai sentir falta de função. Vai sentir — e aqui está a lista — **o que falha quando ele é usado
de verdade por mais de duas pessoas**.

## Achados — o que separa "pronto" de "excelente"

| Achado | Evidência | Onde entra |
| --- | --- | --- |
| **Nenhuma prova automática de que cada tela abre.** A pergunta 2 das travas é respondida à mão; o bug que motivou as travas (um `id` errado derrubou o Financeiro) é o tipo que a mão não pega em 190 rotas | `tools/csp-e2e` já faz isso (880 pontos, 4.782 ações) mas roda só quando alguém lembra | vD.1 (nova) |
| **Front-end num arquivo só, três vezes maior do que quando o plano mandou dividir.** A v10.4 dizia "antes da FASE 5, com 8 mil linhas"; hoje são 21.690 (+ `index.html` 5.481) e faltam 5 fases | `wc -l app/script.js`; texto da v10.4 | vD.2 (nova; v10.4 trazida pra frente) |
| **Homologação que não prova nada.** Banco de homologação com esquema atrasado; passou semanas ligada ao Function App antigo; seed fictício pedido desde 13/09 e nunca escrito | `docs/PLATAFORMAS.md` (03-04/10), `HOMOLOGACAO.md` | vD.3 (nova) |
| **Liderança sem segundo fator.** Matrícula + senha dá acesso a aprovar saída, gerar remessa bancária, conceder permissão, ver dado de menor e de disciplina | nenhuma ocorrência de MFA/TOTP/2FA no código; `codigoAcesso.js` só pro membro | vD.4 (nova) |
| **Ninguém sabe que caiu.** Um alerta só (falhas > 5 em 15 min); nenhum teste de disponibilidade; login de 10-30 s no primeiro acesso (partida a frio) sem solução de infraestrutura | `HOMOLOGACAO.md`; nota na v10.2 | vD.5 (nova) |
| **Anexos sem restauração.** O banco tem restauração a qualquer ponto (ensaiada em 13/09); os arquivos do Storage não têm exclusão suave nem versão | `HOMOLOGACAO.md` só registra o banco | vD.5 |
| **Segredos nunca trocados, sem procedimento.** `AUTH_SECRET`, `CRON_SECRET`, `CHAVE_SITE_SISTEMA`, chaves `age` | `SECRETS.md` só cobre vazamento da chave `age` | vD.5 |
| **Membro no celular com tela de notebook.** 129 tabelas do `index.html` rolam de lado; das 213 que o `script.js` gera, 23 rolam | `grep rolagem-tabela`; v10.3 adiada pro fim do roteiro | vD.6 (nova; parte da v10.3 trazida pra frente) |

Tudo isso é **retrofit** (mexe no que já existe) — por isso vira a **FASE D**, inserida entre a v7.5 e a Trava 7-A,
com arquivo próprio ([`fase-d-robustez-e-operacao.md`](../plano/fase-d-robustez-e-operacao.md)), duas travas, e custo
(esforço + risco + o que depende do responsável) escrito em cada versão. Mesmo padrão da FASE B.

## Ordem recomendada dentro da FASE D (por custo e dependência)

1. **vD.1** (prova automática) — médio esforço, zero risco, e é pré-requisito do resto.
2. **vD.3** (homologação) e **vD.5** (operação) — baixo esforço, dependem de ações do responsável no Azure/GitHub
   (modo manual); dá pra fazer em paralelo com a vD.1.
3. **vD.6** (celular do membro) — baixo/médio, risco baixo, resultado visível pra quem já usa.
4. **vD.4** (segundo fator) — médio; precisa da decisão e-mail × aplicativo autenticador.
5. **vD.2** (modularização) — alto esforço, só depois da vD.1; é a que mais paga nas FASES 8 a 12.

Se o responsável quiser cortar: vD.2 é a maior e a mais adiável (o sistema funciona com o arquivo único — só fica cada
vez mais caro de mexer). As outras cinco cabem em poucas sessões.

## O que ainda pode ser incrementado depois da FASE 12 (candidatos, sem versão — decisão do responsável)

O roteiro comprometido (FASES 7 a 12) já esgota o Estatuto e o Regimento. O que sobra não é obrigação normativa; é o
que faz o sistema **ser usado** e o que o próprio Regimento cita como critério sem ter cadastro correspondente.

| Candidato | Por que | Custo | Se virar fase |
| --- | --- | --- | --- |
| **Implantação por congregação** — migrar o cadastro real do sistema de membros atual (hoje importação manual, v1.8), piloto em uma congregação com dirigente + tesoureiro + secretário de EBD, treinamento e um manual curto **por papel** (dirigente, tesoureiro local, professor, membro), medição de uso | Hoje são 2 pessoas no sistema. Com 190 rotas prontas, o valor só aparece quando a congregação usa; e o piloto é o que mostra o que as travas não pegam (fluxo confuso, campo que ninguém preenche) | Pouco código; muita ação humana do responsável | FASE 13 — Implantação (ou primeira versão da FASE 10, se preferir juntar com a experiência do usuário) |
| **Cultos nos Lares, Círculos de Oração e Pequenos Grupos** — cadastro de grupo (endereço, líder, dia, congregação), frequência e visitantes | É critério **literal** do PSC Nível 4 (Art. 128, "Requisito de Ocupação") e hoje só existe como alínea declaratória; alimenta v12.1 (% de membros em grupo) e v9.5 (mapa de cobertura), que hoje não têm de onde tirar esse dado | Médio (um módulo pequeno, mesmo motor de sessões/presença da seção 2.5) | FASE 13 ou versão nova na FASE 9 (v9.7), antes da FASE 12 |
| **Secretaria da Família** (Art. 47) — curso de noivos e ECC como trilhas (v6.9) ligadas a `Casamentos`; aconselhamento familiar como fila da v7.11 | O Regimento cria a secretaria; o sistema tem as peças soltas (casamentos, trilhas, filas) sem o fio | Baixo | Versão nova na FASE 7 (v7.16) ou na FASE 8 |
| **Assinatura qualificada (ICP-Brasil / gov.br)** para ata e documento que vai a cartório ou banco | A assinatura interna da vB.6 vale dentro da igreja; fora, cartório e banco pedem certificado digital | Custo recorrente por certificado (centenas de reais/ano por signatário) + integração | Só se o responsável quiser; decisão de custo |
| **Sistema campal (FASE 11)** | Continua especulativo, como está escrito lá | Alto | Como está |

Nenhum destes virou versão: ficam aqui como opção com custo, pra decisão. Item recusado sai desta lista.
