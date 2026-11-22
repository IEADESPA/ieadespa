# bases.ps1 salvar <nome> | restaurar <nome> — cópias do banco ieadespa_local no LocalDB (o executor de migrações leva ~9 minutos; restaurar leva segundos).
# Outra instância ou outro banco (dois agentes ao mesmo tempo, cada um no seu): E2E_INSTANCIA (padrão psc7) e E2E_BANCO (padrão ieadespa_local). Com
# E2E_BANCO, a restauração põe os arquivos com o nome do banco (WITH MOVE), para não disputar os arquivos do banco de quem fez a cópia.
param([string]$Acao, [string]$Nome)
# Trava 8-A: erro do banco PARA o script (antes, uma restauração recusada ainda imprimia "restaurado" e os roteiros rodavam sobre uma base suja)
$ErrorActionPreference = 'Stop'
trap { Write-Output "FALHOU: $($_.Exception.Message)"; exit 1 }
Add-Type -AssemblyName System.Data
$instancia = if ($env:E2E_INSTANCIA) { $env:E2E_INSTANCIA } else { 'psc7' }
$banco = if ($env:E2E_BANCO) { $env:E2E_BANCO } else { 'ieadespa_local' }
if ($instancia -notmatch '^[A-Za-z0-9_-]+$' -or $banco -notmatch '^[A-Za-z0-9_]+$') { Write-Output "FALHOU: E2E_INSTANCIA ou E2E_BANCO com caractere inválido"; exit 1 }
$pasta = Join-Path $PSScriptRoot 'bak'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$arq = Join-Path $pasta "$Nome.bak"
$mestre = New-Object System.Data.SqlClient.SqlConnection("Server=(localdb)\$instancia;Database=master;Integrated Security=true;Connect Timeout=30")
$mestre.Open()
$c = $mestre.CreateCommand()
$c.CommandTimeout = 600
if ($Acao -eq 'salvar') {
  $c.CommandText = "BACKUP DATABASE [$banco] TO DISK = N'$arq' WITH INIT"
  [void]$c.ExecuteNonQuery()
  Write-Output "salvo: $Nome"
} elseif ($Acao -eq 'restaurar') {
  $mover = ''
  if ($env:E2E_BANCO) {
    $c.CommandText = "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(400))"
    $dir = [string]$c.ExecuteScalar()
    $c.CommandText = "RESTORE FILELISTONLY FROM DISK = N'$arq'"
    $r = $c.ExecuteReader()
    $partes = @()
    while ($r.Read()) {
      $logico = [string]$r['LogicalName']
      $fim = if ([string]$r['Type'] -eq 'L') { '_log.ldf' } else { '.mdf' }
      $partes += "MOVE N'$logico' TO N'$(Join-Path $dir ($banco + $fim))'"
    }
    $r.Close()
    $mover = ', ' + ($partes -join ', ')
  }
  $c.CommandText = "IF DB_ID('$banco') IS NOT NULL BEGIN ALTER DATABASE [$banco] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; END; RESTORE DATABASE [$banco] FROM DISK = N'$arq' WITH REPLACE$mover; ALTER DATABASE [$banco] SET MULTI_USER;"
  [void]$c.ExecuteNonQuery()
  Write-Output "restaurado: $Nome"
}
$mestre.Close()
