# 06. Fluxo Mensal de Relatórios

## Fluxo confirmado

1. **Preenchimento**: o Líder Local (ou o Dirigente da Congregação, que pode
   sobrepor/editar qualquer departamento da sua congregação) preenche o formulário do
   departamento. Campos de "estado" já vêm pré-preenchidos com o último relatório
   enviado (ver [04](04-departamentos-secretarias.md) e [05](05-modelo-dados.md)). Pode
   salvar como rascunho.
2. **Envio**: status muda para `enviado`. Se houver mais de uma edição antes do envio
   (Líder Local e Dirigente mexendo no mesmo relatório), **a última edição é a que vale**
   e segue para revisão.
3. **Aprovação de Área**: o Líder de Área daquele departamento (ou o Pastor de Área,
   que vê todos os departamentos) revisa. Pode **aprovar** e/ou **comentar** — **não
   pode editar valores**. Ao aprovar, o relatório é bloqueado para novas edições do
   Líder Local (status `aprovado_area`).
4. **Aprovação Geral (definitiva)**: o Líder Geral daquele departamento revisa. Ele
   **pode editar/corrigir os valores diretamente** — é ele quem confere o relatório
   contra o caixa real recebido (não há comprovante anexado no sistema) e ajusta se
   necessário. A aprovação dele é **superior e definitiva** (status `aprovado_geral`),
   mesmo que substitua uma aprovação de área.
5. **Fechado**: a partir daqui, só uma **retificação** feita pelo Presidente do Campo
   ou pelo Secretário Geral pode alterar o relatório.
6. **Consolidação**: os valores "para o geral" de todos os relatórios aprovados do mês
   alimentam a `TesourariaDepartamento` (livro-caixa central daquele departamento),
   junto com despesas lançadas manualmente pelo Líder Geral.

## Diagrama de estados do relatório

```
[Rascunho] --enviar--> [Enviado] --Líder de Área aprova--> [Aprovado (Área)]
                            │                                      │
                            │                                      ▼
                            │                          Líder Geral aprova/corrige
                            │                                      │
                            └──────────── (comentário, sem bloquear) ▼
                                                            [Aprovado (Geral) — definitivo]
                                                                     │
                                                        Presidente/Secretário Geral
                                                             pode retificar
```

## Prazos e atrasos (confirmado)

- Existe prazo de envio, e ele é **dinâmico por departamento/relatório** (cada
  departamento pode ter seu próprio prazo, tipicamente "até o mês seguinte").
- Envio fora do prazo **é permitido**, mas fica marcado como **atrasado**.
- Cabe ao **Líder Geral daquele departamento** decidir, caso a caso, se um relatório
  atrasado ainda entra no fechamento do mês a que se refere, ou se precisa rolar para o
  relatório do mês seguinte. Essa decisão depende da natureza do dado:
  - Campos de **estado** (ex.: nº de membros) não têm problema de duplicidade — eles
    apenas substituem o valor anterior (pré-preenchimento), não somam.
  - Campos de **fluxo/cumulativos** (ex.: total de cultos, evangelismos, ofertas) são
    somados ao período em que forem efetivamente integrados — um dado atrasado que
    entra no relatório do mês seguinte soma ali, não no mês original.

## Sem etapa de aprovação automática

Confirmado: **nenhum relatório é aprovado automaticamente**. Todo relatório passa pelas
duas aprovações (Área → Geral) antes de ser considerado fechado.
