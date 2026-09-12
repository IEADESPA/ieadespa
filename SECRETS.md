# 🔐 Segredos de DEV (SOPS + Age)

O repositório é **público**. Os segredos de desenvolvimento (ex.: `api/local.settings.json` —
connection string do SQL e `AUTH_SECRET`) **nunca** vão em texto puro. Em vez disso, o
arquivo **criptografado** (`api/local.settings.enc.json`) é versionado, e cada máquina
descriptografa com a **própria chave privada Age**, que fica fora do repo.

---

## 1. Como funciona (resumo)

- **Age** gera um par de chaves (pública + privada). A privada fica **na sua máquina**,
  nunca vai pro repo. A pública é compartilhada e fica no `.sops.yaml`.
- **SOPS** criptografa **só os valores** dos arquivos de segredo (as chaves continuam
  legíveis), usando as chaves públicas de todo mundo que precisa acesso.
- Cada pessoa descriptografa com a **própria chave privada** — ninguém precisa compartilhar
  senha nenhuma.

```
local.settings.json         →  (texto puro, NÃO versionado)
local.settings.enc.json     →  (criptografado, VERSIONADO)
%APPDATA%\sops\age\keys.txt →  (sua chave privada, NÃO versionada)
```

---

## 2. Instalar as ferramentas (Windows)

Só uma vez por máquina:

```powershell
winget install --id FiloSottile.age -e --accept-source-agreements --accept-package-agreements
winget install --id SecretsOPerationS.SOPS -e --accept-source-agreements --accept-package-agreements
```

> Se o comando `age` ou `sops` não funcionar logo depois de instalar, **feche e reabra o
> terminal** (o PATH é atualizado ao abrir uma sessão nova).

---

## 3. A chave Age — o ponto que confunde todo mundo

**Você pode REUTILIZAR uma chave Age que já tenha de outro repositório.**

A chave Age não é "do repositório" — é **da sua máquina**. Se você já usou SOPS/Age em
outro projeto, provavelmente já tem uma chave em `%APPDATA%\sops\age\keys.txt`. **Não
precisa gerar outra**: essa mesma chave serve pra cá também.

### Descobrir se você já tem uma chave

```powershell
# Mostra a sua public key a partir da chave existente (se existir)
age-keygen -y "$env:APPDATA\sops\age\keys.txt"
```

- Se aparecer `age1...`, você **já tem chave** → pule o passo 4 e vá direto pro passo 5.
- Se der erro ("não foi possível ler"), você **não tem** → gere uma no passo 4.

---

## 4. Gerar a chave (só se você ainda NÃO tem)

```powershell
mkdir "$env:APPDATA\sops\age" -Force | Out-Null
age-keygen -o "$env:APPDATA\sops\age\keys.txt"
```

Esse comando imprime a **public key** (começa com `age1...`). Guarde ela.

> ⚠️ **Nunca** compartilhe a linha `AGE-SECRET-KEY-...` (a privada). Só a pública.

---

## 5. Liberar o acesso (uma vez só, com quem administra o repo)

1. Envie a sua **public key** (`age1...`) pra quem administra o repo.
2. O administrador adiciona essa chave na lista `age` do arquivo `.sops.yaml` e roda:

   ```powershell
   sops updatekeys api/local.settings.enc.json
   ```

3. Pronto: a partir daí a sua máquina consegue descriptografar.

---

## 6. Usar no dia a dia

Dentro da pasta `api`:

```powershell
# 1) descriptografar (gera o local.settings.json, que NÃO é versionado)
npm run secrets:decrypt

# 2) ... trabalhe normalmente (func start, etc.) ...

# 3) depois de editar local.settings.json, re-criptografar e commitar
npm run secrets:encrypt
```

Ou direto, sem npm:

```powershell
sops -d --output api/local.settings.json api/local.settings.enc.json
sops -e --input-type json --output-type json --output api/local.settings.enc.json api/local.settings.json
```

---

## 7. Regras de segurança (não pular)

- ✅ Versionar: `api/local.settings.enc.json`, `.sops.yaml`.
- ❌ **Nunca** versionar: `api/local.settings.json` (texto puro), a chave privada
  (`keys.txt`), qualquer `.env`.
- Se uma chave **vazar**, gere outra e o administrador roda `sops updatekeys` (rotação).
- Antes de commitar, confira: `git status` não pode listar `local.settings.json` nem
  `keys.txt`.

---

## 8. Solução de problemas

| Problema | Solução |
|---|---|
| `sops`/`age` não reconhecido | Feche e reabra o terminal (PATH novo). |
| `no matching creation rules found` | O arquivo criptografado deve ser o `*.enc.json` e o `.sops.yaml` precisa listar sua public key. |
| `sops: failed to decrypt` | Sua public key não está no `.sops.yaml` / `updatekeys` não foi rodado. Peça pro administrador. |
| Esqueci a public key | `age-keygen -y "$env:APPDATA\sops\age\keys.txt"` mostra de novo. |
