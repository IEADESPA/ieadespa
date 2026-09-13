# Criptografia de segredos — SOPS + age

Este repositório usa **[SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age)**
para criptografar os segredos do projeto (token do Directus, credenciais do Azure, segredo de token de
conta, etc.). Isso permite **compartilhar os segredos entre máquinas de forma segura**: os arquivos
criptografados vão para o Git, e cada máquina autorizada usa a própria chave para abri-los.

## Quais segredos existem e como ficam

Há **dois** arquivos de segredo no projeto. Ambos são ignorados pelo Git (o texto puro fica só na
máquina) e têm uma versão criptografada que é versionada:

| Arquivo criptografado (vai pro Git) | Texto puro (só local, ignorado) | Conteúdo |
| --- | --- | --- |
| `secrets.env` | `.env.local` | Token do Directus + credenciais do Azure (subscription, tenant, client id/secret) |
| `api/local.settings.enc.json` | `api/local.settings.json` | Config das Azure Functions: token do Directus + `CONTA_TOKEN_SECRET` |

O `.gitignore` mantém os textos puros (`.env.local` e `api/local.settings.json`) fora do Git. O que
vai para o Git são apenas as versões **criptografadas** acima.

## Como funciona

Cada máquina tem um **par de chaves age**:

- a **chave privada** fica na própria máquina (é segredo, nunca sai dela);
- a **chave pública** (`age1...`) é a única coisa que se compartilha.

O arquivo `.sops.yaml` lista as chaves públicas (destinatários) que podem abrir/editar os arquivos.

## Estado atual

| Item | Valor |
| --- | --- |
| Chave pública desta máquina | `age1tcc555f5hzy0dv87mkuup56yrghh7c235y2dpfeyy2rqjrv92aaqqtevtn` |
| Chave privada desta máquina | `%APPDATA%\sops\age\keys.txt` (fora do repositório) |
| Configuração | `.sops.yaml` |

## Pré-requisitos (instalar em cada máquina)

Instalar `age` e `sops`.

**Windows:**

```powershell
# via Scoop (recomendado)
scoop install age sops

# ou via Chocolatey
choco install age sops
```

Ou baixar os executáveis oficiais e colocar numa pasta que esteja no `PATH`:

- age: https://github.com/FiloSottile/age/releases (zip `age-v*-windows-amd64.zip`)
- sops: https://github.com/getsops/sops/releases (arquivo `sops-v*.exe`)

Confirme a instalação:

```powershell
age --version
sops --version
```

**Linux/macOS:**

```bash
# age
brew install age            # macOS
sudo apt install age        # Debian/Ubuntu

# sops
brew install sops           # macOS
# ou baixe o binário em https://github.com/getsops/sops/releases
```

## Passo a passo — OUTRA máquina (gerar a chave e mandar a pública)

> A pessoa da outra máquina faz isto **uma única vez**.

1. Instale `age` e `sops` (seção anterior).

2. Gere o par de chaves na localização padrão que o SOPS procura:

   **Windows (PowerShell):**

   ```powershell
   age-keygen -o "$env:APPDATA\sops\age\keys.txt"
   ```

   **Linux/macOS:**

   ```bash
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/keys.txt
   ```

3. Veja a sua **chave pública** (a linha que começa com `age1...`):

   **Windows (PowerShell):**

   ```powershell
   age-keygen -y "$env:APPDATA\sops\age\keys.txt"
   ```

   **Linux/macOS:**

   ```bash
   age-keygen -y ~/.config/sops/age/keys.txt
   ```

4. **Mande SOMENTE a chave pública** (ex.: `age1abc...xyz`) para a máquina principal.

   ⚠️ **Nunca mande** a linha `AGE-SECRET-KEY-...` — ela é a sua chave privada e precisa
   ficar só com você. Quem tiver a pública **não** consegue abrir o arquivo.

## Passo a passo — máquina principal (adicionar a chave recebida)

1. Abra o `.sops.yaml` e adicione a nova chave pública na lista `age:` das **duas** regras:

   ```yaml
   creation_rules:
     - path_regex: (^|/)(\.env\.local|secrets\.env)$
       age:
         - age1tcc555f5hzy0dv87mkuup56yrghh7c235y2dpfeyy2rqjrv92aaqqtevtn  # máquina atual
         - age1NOVA_CHAVE_PUBLICA_AQUI                                  # outra máquina
     - path_regex: '(^|[\\/])api[\\/]local\.settings(\.enc)?\.json$'
       age:
         - age1tcc555f5hzy0dv87mkuup56yrghh7c235y2dpfeyy2rqjrv92aaqqtevtn  # máquina atual
         - age1NOVA_CHAVE_PUBLICA_AQUI                                  # outra máquina
   ```

2. Atualize **os dois** arquivos criptografados para que a nova máquina também consiga abrir:

   ```powershell
   sops updatekeys secrets.env
   sops updatekeys api/local.settings.enc.json
   ```

3. Faça o commit dos arquivos alterados:

   ```powershell
   git add .sops.yaml secrets.env api/local.settings.enc.json
   git commit -m "Adiciona chave age da máquina X"
   git push
   ```

Pronto — a partir daí, as duas máquinas abrem e editam os mesmos arquivos de segredo.

## Uso no dia a dia (em qualquer máquina autorizada)

**Descriptografar** (gera/atualiza os textos puros locais):

```powershell
sops -d --output .env.local secrets.env
sops -d --output api/local.settings.json api/local.settings.enc.json
```

**Ver o conteúdo sem salvar:**

```powershell
sops -d secrets.env
sops -d api/local.settings.enc.json
```

**Editar** (abre no editor de texto configurado):

```powershell
sops secrets.env
sops api/local.settings.enc.json
```

Para editar no VS Code:

```powershell
$env:SOPS_EDITOR = "code --wait"
sops secrets.env
```

Depois de salvar e fechar, o SOPS grava de volta já criptografado — basta commitar.

**Recriptografar a partir do texto puro** (caso você tenha alterado o texto puro diretamente e queira
atualizar o arquivo criptografado):

```powershell
sops -e --output secrets.env .env.local
sops -e --output api/local.settings.enc.json api/local.settings.json
```

## Segurança

- A **chave privada** (`keys.txt`) fica **fora** do repositório e **nunca** deve ser commitada
  nem compartilhada.
- Só a **chave pública** (`age1...`) é compartilhada.
- Os textos puros (`.env.local` e `api/local.settings.json`) são ignorados pelo Git e nunca sobem.
- Se uma máquina for perdida ou comprometida: remova a chave dela do `.sops.yaml`, rode
  `sops updatekeys` nos dois arquivos e commite. A partir desse momento a máquina removida não
  consegue mais abri-los (idealmente, troque também os segredos que ela chegou a ver).
- Nunca edite os arquivos criptografados como texto puro — use sempre os comandos do SOPS.
