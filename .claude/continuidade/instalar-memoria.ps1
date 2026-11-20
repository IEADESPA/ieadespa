# Prepara este computador para trabalhar no repositório da IEADESPA com a mesma bancada de quem começou:
# o servidor de memória, os plugins do projeto, o programa do LSP e a memória automática do Claude.
# Pergunta antes de cada mudança na configuração da pessoa. Rodar de novo não estraga nada.
#
# Uso, no PowerShell, na raiz do repositório:
#   powershell -ExecutionPolicy Bypass -File .\.claude\continuidade\instalar-memoria.ps1
#   ... -Simular   mostra o que faria, sem mudar nada
#   ... -Sim       responde "sim" a todas as perguntas
# Kit de 17/11/2026; plugins, memória versionada e memória automática em 20/11/2026.

param([switch]$Simular, [switch]$Sim)

$ErrorActionPreference = 'Stop'
$destino = 'C:\MCP'
$versao = '2.1.1'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Perguntar([string]$texto) {
    if ($Simular) { Write-Host "  [simulação] perguntaria: $texto"; return $false }
    if ($Sim) { Write-Host "  $texto -> sim (-Sim)"; return $true }
    $resposta = Read-Host "  $texto (S/N)"
    return ($resposta -match '^\s*[sS]')
}

# Roda um programa de fora sem que a saída de erro dele pare o instalador (no PowerShell 5.1, com 'Stop', ela pararia).
function Rodar([scriptblock]$bloco) {
    $ErrorActionPreference = 'Continue'
    $saida = & $bloco 2>&1
    $codigo = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $texto = ($saida | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | Out-String)
    return @{ Saida = $saida; Texto = $texto; Codigo = $codigo }
}

# O instalador mora em .claude\continuidade do repositório; a cópia de C:\MCP\continuidade não sabe qual é o repositório.
$noRepositorio = Test-Path (Join-Path $repo '.claude\settings.json')
if ($noRepositorio) { Write-Host "Repositório: $repo" }
else { Write-Host 'Rodando fora do repositório: os passos 3, 5 e 7 (plugins, memória automática e habilidades) ficam de fora.' }
if ($Simular) { Write-Host 'Modo simulação: nada será mudado.' }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Falta o Node.js. Instale com:  winget install OpenJS.NodeJS.LTS'
    Write-Host 'Depois feche e abra o PowerShell e rode este instalador de novo.'
    exit 1
}

# O Claude Code: o comando do terminal ou o da extensão do VS Code (a versão mais nova).
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
    $claude = Get-ChildItem "$env:USERPROFILE\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime | Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $claude) {
    Write-Host 'Não achei o Claude Code. Instale a extensão do VS Code, faça o login e rode de novo.'
    exit 1
}

# 1. O servidor de memória em C:\MCP (o programa, o kit e o servidor com versão fixa).
Write-Host ''
Write-Host "1. O servidor de memória ($destino)"
$kit = Join-Path $destino 'continuidade'
if (Perguntar "Instalar ou atualizar o servidor de memória $versao e o kit em ${destino}?") {
    New-Item -ItemType Directory -Force (Join-Path $destino 'memorias') | Out-Null
    New-Item -ItemType Directory -Force $kit | Out-Null
    if ((Resolve-Path $PSScriptRoot).Path -ne (Resolve-Path $kit).Path) {
        # só os arquivos do kit: as memórias versionadas ficam no repositório
        Get-ChildItem $PSScriptRoot -File | Copy-Item -Destination $kit -Force
    }
    Copy-Item (Join-Path $kit 'iniciar-memoria.mjs') $destino -Force
    $r = Rodar { npm install --prefix $destino --save-exact --no-fund --no-audit "@modelcontextprotocol/server-memory@$versao" }
    if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host 'A instalação do servidor falhou (internet? permissão?).'; exit 1 }
    Write-Host '  Servidor instalado.'
}

# 2. O registro do servidor no Claude Code, para todos os projetos (configuração do usuário).
Write-Host ''
Write-Host '2. O servidor memoria-projeto no Claude Code'
$r = Rodar { & $claude mcp get memoria-projeto }
if ($r.Codigo -eq 0) {
    Write-Host '  Já estava registrado.'
} elseif (Perguntar 'Registrar o servidor memoria-projeto no Claude Code (vale para todos os seus projetos)?') {
    $r = Rodar { & $claude mcp add --scope user memoria-projeto -- node "$destino\iniciar-memoria.mjs" }
    if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host '  O registro falhou.'; exit 1 }
    Write-Host '  Registrado.'
}
Write-Host '  Neste repositório ele usa a memória versionada (.claude\continuidade\memoria); nos outros, a de C:\MCP\memorias.'

# 3. Os plugins que o projeto liga (.claude\settings.json): ligar no arquivo não instala.
Write-Host ''
Write-Host '3. Os plugins do projeto'
$pedidos = @()
if ($noRepositorio) {
    $projeto = Get-Content (Join-Path $repo '.claude\settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pedidos = @($projeto.enabledPlugins.PSObject.Properties | Where-Object { $_.Value -eq $true } | ForEach-Object { $_.Name })
}
$r = Rodar { & $claude plugin list --json }
$instalados = @()
if ($r.Codigo -eq 0) { $instalados = @(($r.Texto | ConvertFrom-Json) | ForEach-Object { $_.id }) }
$faltam = @($pedidos | Where-Object { $instalados -notcontains $_ })
if (-not $noRepositorio) {
    Write-Host '  Fora do repositório: pulado.'
} elseif ($faltam.Count -eq 0) {
    Write-Host "  Os $($pedidos.Count) plugins já estão instalados."
} elseif (Perguntar "Instalar $($faltam.Count) plugin(s) neste repositório: $($faltam -join ', ')?") {
    Push-Location $repo
    try {
        foreach ($p in $faltam) {
            $r = Rodar { & $claude plugin install $p --scope project }
            if ($r.Codigo -eq 0) { Write-Host "  Instalado: $p" }
            else { $r.Saida | Write-Host; Write-Host "  Não instalou $p. No VS Code: /plugins, procure o nome e 'Install for this project'." }
        }
    } finally { Pop-Location }
}

# 4. O programa que o plugin typescript-lsp usa (npm global).
Write-Host ''
Write-Host '4. O programa do LSP do TypeScript'
if (Get-Command typescript-language-server -ErrorAction SilentlyContinue) {
    Write-Host '  Já instalado.'
} elseif (Perguntar 'Instalar o typescript-language-server e o typescript no npm global?') {
    $r = Rodar { npm install -g typescript-language-server typescript }
    if ($r.Codigo -ne 0) { $r.Saida | Write-Host; Write-Host '  A instalação falhou: o resto continua.' } else { Write-Host '  Instalado.' }
}

# 5. A memória automática do Claude: a pasta versionada, só neste repositório (settings.local.json, fora do Git).
Write-Host ''
Write-Host '5. A memória automática do Claude (como trabalhar com o responsável)'
$memoriaClaude = Join-Path $repo '.claude\continuidade\memoria-claude'
$local = Join-Path $repo '.claude\settings.local.json'
$atual = $null
if ($noRepositorio -and (Test-Path $local)) { $atual = (Get-Content $local -Raw -Encoding UTF8 | ConvertFrom-Json).autoMemoryDirectory }
if (-not $noRepositorio) {
    Write-Host '  Fora do repositório: pulado.'
} elseif ($atual -eq $memoriaClaude) {
    Write-Host '  Já aponta para a pasta versionada.'
} else {
    # A memória pessoal que o Claude usa hoje neste repositório: avisa o que ela tem de diferente da versionada.
    $pessoal = Join-Path $env:USERPROFILE (".claude\projects\" + ($repo -replace '[^A-Za-z0-9]', '-') + '\memory')
    if (Test-Path $pessoal) {
        $diferentes = @(Get-ChildItem $pessoal -Filter *.md | Where-Object {
            $par = Join-Path $memoriaClaude $_.Name
            -not (Test-Path $par) -or (Get-FileHash $_.FullName).Hash -ne (Get-FileHash $par).Hash
        } | ForEach-Object { $_.Name })
        if ($diferentes.Count -gt 0) {
            Write-Host "  A sua memória pessoal ($pessoal) tem $($diferentes.Count) nota(s) diferente(s) da versionada:"
            $diferentes | Select-Object -First 15 | ForEach-Object { Write-Host "    $_" }
            Write-Host '  Se alguma for mais nova, junte à mão na pasta versionada antes (sem senha nem dado pessoal).'
        }
    }
    if ($atual) { Write-Host "  Hoje o autoMemoryDirectory aponta para: $atual" }
    if (Perguntar "Apontar a memória automática do Claude deste repositório para $memoriaClaude ?") {
        $r = Rodar { node (Join-Path $PSScriptRoot 'ajustar-config.mjs') $local autoMemoryDirectory $memoriaClaude }
        $r.Saida | Write-Host
    }
}

# 6. As regras globais, só se ainda não houver.
Write-Host ''
Write-Host '6. As regras globais (~\.claude\CLAUDE.md)'
$regras = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
if (Test-Path $regras) {
    Write-Host "  Você já tem regras globais: não mexi. Compare com $PSScriptRoot\regras-globais.md e junte à mão."
} elseif (Perguntar "Instalar as regras globais da IEADESPA em ${regras}?") {
    New-Item -ItemType Directory -Force (Split-Path $regras) | Out-Null
    Copy-Item (Join-Path $PSScriptRoot 'regras-globais.md') $regras
    Write-Host '  Instaladas.'
}

# 7. Habilidades pessoais com o mesmo nome das do projeto ganham das do projeto: só avisa, nunca apaga.
$pessoais = Join-Path $env:USERPROFILE '.claude\skills'
$sombras = @(Get-ChildItem (Join-Path $repo '.claude\skills') -Directory -ErrorAction SilentlyContinue | Where-Object {
    $p = Join-Path $pessoais (Join-Path $_.Name 'SKILL.md')
    (Test-Path $p) -and (Get-FileHash $p).Hash -ne (Get-FileHash (Join-Path $_.FullName 'SKILL.md')).Hash
} | ForEach-Object { $_.Name })
if ($sombras.Count -gt 0) {
    Write-Host ''
    Write-Host "Atenção: a sua cópia pessoal destas habilidades é diferente da do projeto e ganha dela: $($sombras -join ', ')."
    Write-Host "Atualize ou apague a pasta pessoal em $pessoais."
}

Write-Host ''
Write-Host 'Pronto. No VS Code: Ctrl+Shift+P, "Recarregar Janela". Numa conversa nova do Claude, confira:'
Write-Host '  /mcp (memoria-projeto conectado), /plugins (os 5 do projeto) e /memory (a pasta da memória automática).'
Write-Host 'Antes de começar: git pull e a linha "Em uso por" no alto do HANDOFF.md.'
