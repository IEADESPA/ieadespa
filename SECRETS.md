# Segredos de DEV (SOPS + Age)

O repositório é **público**. Os segredos de desenvolvimento (ex.:
`api/local.settings.json` — connection string do SQL e `AUTH_SECRET`) NUNCA vão
em texto puro. Em vez disso, o arquivo **criptografado**
(`api/local.settings.enc.json`) é versionado, e cada máquina descriptografa com
a **própria chave privada Age**, que fica fora do repo.

## Ferramentas

- **SOPS** (encrypta só os valores, mantém a estrutura legível)
- **Age** (chave assimétrica, uma por máquina)

Instalar (Windows):

```powershell
winget install --id FiloSottile.age -e --accept-source-agreements --accept-package-agreements
winget install --id SecretsOPerationS.SOPS -e --accept-source-agreements --accept-package-agreements
```

## Configurar uma máquina nova

1. Gere a sua chave (uma vez só):

   ```powershell
   mkdir "$env:APPDATA\sops\age" -Force | Out-Null
   age-keygen -o "$env:APPDATA\sops\age\keys.txt"
   ```

   Anote a **public key** (linha `public key: age1...`).

2. Envie essa public key para quem administra o repo.

3. Quem administra adiciona a chave no `.sops.yaml` (lista `age`) e roda:

   ```powershell
   sops updatekeys api/local.settings.enc.json
   ```

## Usar no dia a dia

```powershell
# descriptografar (gera o local.settings.json, que NÃO é versionado)
cd api
npm run secrets:decrypt

# depois de editar local.settings.json, re-criptografar
npm run secrets:encrypt
```

Ou direto:

```powershell
sops -d --output api/local.settings.json api/local.settings.enc.json
sops -e --input-type json --output-type json --output api/local.settings.enc.json api/local.settings.json
```

## Regras de segurança

- A **chave privada** (`%APPDATA%\sops\age\keys.txt`) nunca vai pro repo.
- O **arquivo descriptografado** (`api/local.settings.json`) nunca vai pro repo
  (já está no `.gitignore`).
- Só o **`.enc.json`** é versionado.
- Se uma chave vazar, gere outra e rode `sops updatekeys` (rotação).
