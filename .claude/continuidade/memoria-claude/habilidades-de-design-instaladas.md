---
name: habilidades-de-design-instaladas
description: "18/11 ele autorizou e foram instaladas, para todos os repositórios, a frontend-design oficial e o texto do Emil Kowalski e da Vercel; NÃO criar habilidade própria; fonte nova + efeitos aprovados"
metadata:
  node_type: memory
  type: user
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-18T18:11:23.661Z
---

Em 18/11/2026, depois de ler a pesquisa `docs/pesquisa/habilidades-de-design-2026.md`, ele autorizou:

- **Instaladas no nível do usuário,** valendo para todos os repositórios deste notebook. Estão em `~/.claude/skills/` e,
  para o Codex e os outros agentes, em `~/.agents/skills/`:
  - `frontend-design`, a oficial da Anthropic, sem mudança;
  - três do Emil Kowalski, só o texto, com uma nota de adaptação (português, sem React, CSP): `emil-design-eng`,
    `mobile-native` e `review-animations`;
  - `diretrizes-interface-web`, a lista da Vercel copiada e fixada; a original baixava da internet a cada uso.
  - Cada pasta tem um `ORIGEM.md` com o commit de origem.
- **NÃO criar a habilidade própria "desenho-ieadespa":** "é muito trabalho; já está na memória". As regras de desenho
  continuam na memória e no plano.
- **Aprovados:** trocar a fonte por uma "top", servida de dentro, e pôr efeitos modernos. Ele escolhe a fonte entre 3
  opções vendo a homologação.
- Ele quer **habilidades oficiais e gratuitas**, de preferência da Anthropic, que sirvam a todos os repositórios.
  Instalar outras só com o OK dele.
- **Também em 18/11, com o OK dele:**
  - plugins oficiais no escopo do usuário, pelo `claude.exe` que vem com a extensão do VS Code (`plugin install
    <nome>@anthropic-plugin-directory --scope user`): `claude-security`, `claude-md-management`, `typescript-lsp`
    (com `typescript-language-server` e `typescript@6` instalados globais no npm), `microsoft-docs` e
    `pr-review-toolkit`;
  - `guias-web-modernas`: os 187 guias do Google Chrome em texto fixado. A original rodava `npx ...@latest` a cada
    tarefa.
  - Juntos, gastam cerca de 3 mil tokens fixos por sessão.
- **Ele pediu caça a defeitos e travamentos.** Na revisão de cada versão, usar `/code-review` (já existia), o agente
  `silent-failure-hunter` do `pr-review-toolkit` (erros engolidos) e o `claude-security` (segurança) além da revisão
  adversarial de sempre.

Ver [[construir-exatamente-o-aprovado]], [[fase10-nada-sem-aprovacao]].

**23/11/2026, ele pediu "aumentar o nível" em todos os sistemas** (pesquisa em
`C:\tmp\ieadespa-bancada\pesquisa-habilidades-23-11.md`; as pilhas dos outros sistemas ficam fora deste repositório
público). Aprovou trazer para a bancada: `svelte-core-bestpractices` (sveltejs/ai-tools), `supabase-postgres-best-practices`
(só Postgres, para os outros sistemas), o plugin `pyright-lsp` (Python) e a `test-driven-development` (obra/superpowers; o construtor
escreve o teste antes, sem "apagar o código"). A LGPD (goul4rt/lgpd-skills, 3 partes: menores, prazo de guarda, pedido do
titular) entra **adaptada**: os documentos de regras vão para `C:\MCP\bancada\lgpd\<repositório>\`, privada, **nunca no
repositório público**; o texto não tem revisão de advogado. O servidor de memória fica na 2.1.1 até conferir a 2.2.2. O
caminho do Codex é consertado pelo instalador. Ele também quer saber, a cada pesquisa, se há outras que valem a pena:
responder com opinião própria, poucas e lidas antes. Na pergunta, não chamar de "oficial e conferida" o que é só de fonte
conhecida e ainda não foi lido inteiro.

**20/11/2026: mais 4 habilidades instaladas (só texto, versão fixa), em ~/.claude/skills, ~/.agents/skills e ~/.cline/skills, e no repositório pelo pacote do colega:** systematic-debugging e verification-before-completion (obra/superpowers MIT 22f0b46), humanizer-pt (MIT 2557bcb, só chamada à mão: /humanizer-pt) e impeccable (Apache 2.0 b49177d, SÓ o texto, chamada à mão /impeccable, com nota proibindo npx/login/telemetria). Recusados, com motivo em C:/tmp/ieadespa-desenho-fontes/pesquisa-habilidades-lista.md: Superpowers inteiro (gancho obrigatório), Ponytail (3 ganchos), UI UX Pro Max, Matt Pocock, algorithmic-art/theme-factory/web-artifacts-builder, canvas-design (para cartaz, usar o conector do Canva que já está ligado no claude.ai), file-search.
