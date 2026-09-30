# IEADESPA — regras obrigatórias (leia antes de qualquer tarefa)

Repositório **público**. Contexto completo no [`README.md`](README.md); segredos em
[`SECRETS.md`](SECRETS.md).

## 1. Toda alteração vai para a nuvem — OBRIGATÓRIO

O responsável **não vê nada localmente, só o que está no GitHub**. Terminou uma mudança
(código, docs, configuração)? **Commit + `git push origin main` na mesma hora**, sem esperar
pedido.

- Commit estreito: só os arquivos da tarefa, `git add` explícito (nunca `git add -A`).
- Depois do push, conferir o deploy com `gh run watch` e informar o resultado.
- Se o push for bloqueado, **parar e avisar** — nunca deixar a alteração só na máquina.

## 2. Senha e segredo nunca em texto puro

Nem em código, nem em `.claude/settings*.json`, nem dentro de comando aprovado/executado.
Segredo só no fluxo criptografado SOPS + Age (ver `SECRETS.md`). Ao mostrar o conteúdo de
arquivo de segredo (`local.settings.json`, `.env*`), **mascare todos os valores**, não só um.

## 3. Referências

`referencias/` guarda protótipos antigos só para consulta de ideias: não copiar código
(Next.js é banido aqui) e não adicionar `.env`, `*.db`, `node_modules` nem `.rar` lá.
