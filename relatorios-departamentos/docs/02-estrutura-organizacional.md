# 02. Estrutura Organizacional

## Hierarquia (confirmada)

```
Campo (IEADESPA — a instituição inteira)
 └── Área
      └── Congregação
           └── Departamento / Secretaria (8 tipos fixos, presentes em TODA congregação)
                └── Relatório mensal
```

- **Campo**: nível mais alto. Presidido pelo **Presidente do Campo / Pastor Campal**, que
  enxerga tudo.
- **Área**: agrupamento regional de congregações. Cada área tem um **Pastor de Área**
  (visão de todos os departamentos da área) e, para cada um dos 8 departamentos, um
  **Líder de Área** específico daquele departamento (ver [03-perfis-acesso.md](03-perfis-acesso.md)).
- **Congregação**: unidade local. **Toda congregação pertence a exatamente uma área** —
  não existe congregação ligada diretamente ao campo. Cada congregação tem um
  **Dirigente da Congregação** (pastor local), que enxerga e pode editar os relatórios
  de todos os departamentos daquela congregação.
- **Departamento/Secretaria**: **todas as congregações têm os mesmos 8 departamentos**
  (lista fixa hoje, mas o sistema deve permitir cadastrar novos tipos no futuro — ver
  [04-departamentos-secretarias.md](04-departamentos-secretarias.md)).
- **Relatório mensal**: preenchido por departamento, por congregação, todo mês.

## Região (nível futuro, não ativo agora)

Confirmado que pode fazer sentido, no futuro, criar um nível intermediário **Região**
entre Área e Campo, à medida que o campo cresce e mais camadas de liderança
intermediária forem necessárias. **Não é necessário agora** — o modelo de dados deve
deixar espaço para adicionar esse nível mais tarde (ex.: campo opcional
`regiao_id` em `Area`, inicialmente nulo/inativo), mas a implementação inicial não
precisa construir essa camada.

## Regras confirmadas

- Toda congregação **deve** estar vinculada a uma área (obrigatório, sem exceção).
- Toda congregação tem **todos** os 8 tipos de departamento/secretaria (não existe
  congregação com subconjunto).
- **Congregações podem mudar de área** ao longo do tempo (dinâmica do campo). O sistema
  precisa preservar o histórico: um relatório enviado quando a congregação pertencia à
  Área X deve continuar mostrando Área X no histórico, mesmo que a congregação seja
  posteriormente realocada para a Área Y. Isso implica um vínculo
  congregação↔área **com data de vigência**, não uma referência simples e fixa.

## Regras de visibilidade decorrentes da hierarquia

Ver a matriz completa de perfis em [03-perfis-acesso.md](03-perfis-acesso.md). Resumo:

- **Líder Local** de um departamento vê apenas os relatórios daquele departamento, na(s)
  congregação(ões) em que atua.
- **Dirigente da Congregação** vê e pode editar os relatórios de **todos** os
  departamentos da sua congregação.
- **Líder de Área** (de um departamento específico) vê os relatórios daquele
  departamento em todas as congregações da sua área.
- **Pastor de Área** vê os relatórios de **todos** os departamentos de todas as
  congregações da sua área.
- **Líder Geral** (de um departamento específico, 8 no total — um por departamento) vê
  e pode corrigir os relatórios daquele departamento em **todo o campo**.
- **Presidente do Campo** e **Secretário(a) Geral** veem tudo, em qualquer nível.
