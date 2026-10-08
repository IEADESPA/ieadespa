# bases.ps1 salvar <nome> | restaurar <nome> — cópias do banco ieadespa_local no LocalDB (o executor de migrações leva ~9 minutos; restaurar leva segundos).
param([string]$Acao, [string]$Nome)
Add-Type -AssemblyName System.Data
$pasta = Join-Path $PSScriptRoot 'bak'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$arq = Join-Path $pasta "$Nome.bak"
$mestre = New-Object System.Data.SqlClient.SqlConnection('Server=(localdb)\psc7;Database=master;Integrated Security=true;Connect Timeout=30')
$mestre.Open()
$c = $mestre.CreateCommand()
$c.CommandTimeout = 600
if ($Acao -eq 'salvar') {
  $c.CommandText = "BACKUP DATABASE ieadespa_local TO DISK = N'$arq' WITH INIT"
  [void]$c.ExecuteNonQuery()
  Write-Output "salvo: $Nome"
} elseif ($Acao -eq 'restaurar') {
  $c.CommandText = "IF DB_ID('ieadespa_local') IS NOT NULL BEGIN ALTER DATABASE ieadespa_local SET SINGLE_USER WITH ROLLBACK IMMEDIATE; END; RESTORE DATABASE ieadespa_local FROM DISK = N'$arq' WITH REPLACE; ALTER DATABASE ieadespa_local SET MULTI_USER;"
  [void]$c.ExecuteNonQuery()
  Write-Output "restaurado: $Nome"
}
$mestre.Close()
