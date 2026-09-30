# 03. Perfis de Acesso

## Visão geral dos perfis (confirmado)

Uma particularidade importante: **cada um dos 8 departamentos tem sua própria cadeia de
liderança** (local → área → geral). Ou seja, não existe "o líder de área" genérico —
existe "o líder de área do UCADESPA", "o líder de área do EBD" etc., cada um uma pessoa
diferente, cada um enxergando apenas o departamento pelo qual responde. Por cima dessa
estrutura por departamento, existem papéis "transversais" (Dirigente da Congregação,
Pastor de Área, Presidente do Campo) que enxergam todos os departamentos de uma vez, no
seu respectivo nível.

### 1. Líder Local (por departamento)
- **Escopo**: um ou mais departamentos, em uma ou mais congregações — a mesma pessoa
  pode acumular múltiplos vínculos, pois muitas congregações não têm gente suficiente
  para ter uma pessoa por departamento.
- **Pode**: preencher e enviar o relatório mensal do(s) seu(s) departamento(s).
- Depois que o relatório é aprovado pelo Líder de Área, o Líder Local **perde a
  permissão de editar** aquele relatório.

### 2. Dirigente da Congregação (pastor local)
- **Escopo**: uma congregação — é o único perfil de nível local que enxerga **todos os
  departamentos** daquela congregação de uma vez.
- **Pode**: ver e editar os relatórios de qualquer departamento da sua congregação,
  inclusive sobrepondo o que o Líder Local preencheu. Quando há mais de uma edição
  (Líder Local e depois Dirigente, ou vice-versa), **a última edição é a que segue para
  revisão**.
- Funciona como um "fecho" local antes do relatório subir para a área.

### 3. Líder de Área (por departamento)
- **Escopo**: um departamento específico, em todas as congregações da sua área.
- **Pode**: ver os relatórios daquele departamento em toda a área; **aprovar ou
  comentar**. **Não pode editar os valores** do relatório — se algo precisa mudar, ele
  comenta/solicita a mudança (dentro do sistema ou por fora, ex.: WhatsApp) para o
  Líder Local corrigir.
- Ao aprovar, o relatório é bloqueado para edição pelo Líder Local (mas ainda não é
  definitivo — falta a aprovação do Líder Geral).

### 4. Pastor de Área
- **Escopo**: uma área inteira — enxerga **todos os departamentos** de todas as
  congregações da área (o Líder de Área de um departamento não vê os outros
  departamentos; o Pastor de Área vê todos).
- Papel equivalente, em nível de área, ao Dirigente da Congregação em nível local.

### 5. Líder Geral (por departamento) — 8 pessoas no campo
- **Escopo**: um departamento específico, em **todo o campo** (todas as áreas e
  congregações).
- **Pode**: ver, **editar/corrigir diretamente** os valores dos relatórios daquele
  departamento, e dar a **aprovação definitiva** — superior à aprovação do Líder de
  Área.
- Ele precisa poder corrigir porque **não há coleta de comprovante/anexo** no sistema
  (pagamentos em dinheiro ou por vias digitais diversas tornam isso inviável — quem
  precisar comprovar algo usa WhatsApp, fora do sistema). Por isso o Líder Geral é quem
  bate o relatório contra o caixa real e ajusta se necessário — ele não pode aprovar um
  relatório sabendo que o valor está incorreto.
- Também é quem mantém a **tesouraria consolidada do departamento** (saldo transportado,
  entradas, despesas, saldo do mês — ver [04-departamentos-secretarias.md](04-departamentos-secretarias.md)).

### 6. Secretário(a) Geral
- **Escopo**: campo inteiro — papel administrativo/técnico central. **É uma única
  pessoa** (não um papel replicado por congregação).
- **Pode**: configurar o **perfil de rateio de cada departamento** (a pedido do Líder
  Geral correspondente), cadastrar áreas/congregações/departamentos/usuários, e assina
  como "SECRETÁRIO GERAL" em **todos os níveis do relatório — inclusive no relatório
  individual de cada congregação**, não só no consolidado do campo.
  - **Confirmado**: essa assinatura em nível local é proposital, não um resíduo de
    template. É um controle **antifraude**: impede que um líder local produza ou
    modifique um relatório sem que a Secretaria Geral (que está acima dos
    departamentos e é a última recebedora dos dados) tenha ciência. Não é o Líder
    Geral do departamento nem qualquer outro departamento que assina ali — é sempre a
    mesma pessoa, a Secretaria Geral central.
- Junto com o Presidente, o Secretário(a) Geral tem a **última palavra** sobre
  qualquer relatório (inclusive fazendo retificação), porque são eles os
  responsáveis institucionais pelos dados e os únicos com acesso administrativo ao
  banco de dados/infraestrutura do sistema no Azure.
- Também é quem gerencia a assinatura/conta Azure do projeto (ver
  [07-arquitetura-tecnica.md](07-arquitetura-tecnica.md)).
- É, na prática, o perfil "Administrador" do sistema.

### 7. Presidente do Campo / Pastor Campal
- **Escopo**: tudo, em qualquer nível.
- **Pode**: tudo que os demais perfis podem, e é o único (junto com o Secretário Geral)
  que pode fazer uma **retificação** em um relatório já aprovado definitivamente pelo
  Líder Geral — a única forma de alterar um relatório depois de fechado.

## Fluxo de aprovação (confirmado — ver detalhamento em [06-fluxo-relatorios.md](06-fluxo-relatorios.md))

```
Líder Local / Dirigente da Congregação
        │  preenche e envia
        ▼
Líder de Área (do departamento)
        │  aprova + comenta (NÃO edita valores)
        │  → a partir daqui, Líder Local não edita mais
        ▼
Líder Geral (do departamento)
        │  PODE editar/corrigir valores
        │  aprovação definitiva (superior à da área)
        ▼
   Relatório fechado
        │
        └─ só pode ser alterado por Presidente/Secretário Geral (retificação)
```

**Nenhum relatório é aprovado automaticamente** — todos passam por esse fluxo.

## Autenticação e login

- **Não** será usado login corporativo Microsoft/Azure AD para os usuários finais — o
  custo de licenciamento (Microsoft 365) para ~500 pessoas é proibitivo.
- Login proposto: **matrícula do rol de membros** (o número de matrícula da pessoa no
  cadastro de membros da igreja) + **senha simples**, criada pelo próprio usuário no
  primeiro acesso. Isso também incentiva a manutenção do rol de membros atualizado.
  - **Confirmado**: existe um sistema separado de gestão de membros que já gera esse
    número de matrícula, mas **não é possível integrá-lo** (não expõe API/mecanismo
    de integração). O cadastro do usuário no sistema de relatórios será **manual**: o
    Secretário(a) Geral (ou quem administrar o cadastro) consulta a matrícula da
    pessoa no sistema de membros e a registra manualmente no perfil de acesso deste
    sistema. Não há sincronização automática entre os dois sistemas.
- **Log de auditoria é obrigatório** (não opcional): toda edição relevante (quem, o quê,
  quando) precisa ficar registrada, especialmente por causa das correções feitas por
  Dirigentes e Líderes Gerais sobre relatórios de terceiros.

## Matriz de permissões (resumo)

| Ação | Líder Local | Dirigente Congregação | Líder de Área (depto) | Pastor de Área | Líder Geral (depto) | Secretário/Presidente |
|---|---|---|---|---|---|---|
| Preencher/enviar relatório do próprio depto | ✅ | ✅ (qualquer depto da congregação) | ❌ | ❌ | ❌ | ❌ |
| Ver relatórios do próprio depto/congregação | ✅ | ✅ (todos os deptos) | ✅ (seu depto, toda a área) | ✅ (todos os deptos da área) | ✅ (seu depto, todo o campo) | ✅ (tudo) |
| Comentar / aprovar (sem editar valores) | ❌ | — | ✅ | ✅ | — | — |
| Editar valores de relatório de outrem | ❌ | ✅ (na congregação) | ❌ | ❌ | ✅ (no depto, campo todo) | ✅ (retificação) |
| Aprovação definitiva | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (retificação após fechado) |
| Configurar rateio / cadastro do sistema | ❌ | ❌ | ❌ | ❌ | ❌ (solicita) | ✅ |

## Multi-vínculo

Confirmado: uma mesma pessoa **pode acumular** múltiplos vínculos — ex.: ser Líder
Local de dois departamentos na mesma congregação, ou Líder Local em uma congregação e
Líder de Área de outro departamento. O cadastro de usuário precisa suportar múltiplos
vínculos simultâneos (perfil × escopo), não um único perfil fixo por usuário.
