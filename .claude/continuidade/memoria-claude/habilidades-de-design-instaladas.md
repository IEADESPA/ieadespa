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
