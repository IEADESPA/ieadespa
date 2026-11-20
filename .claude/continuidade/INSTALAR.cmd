@echo off
rem Instalador da bancada da IEADESPA: de DOIS CLIQUES neste arquivo.
rem Roda o instalar-memoria.ps1 com a politica de execucao liberada SO para este processo (-ExecutionPolicy Bypass):
rem a politica do computador nao muda. O instalador pergunta antes de cada mudanca na configuracao da pessoa.
rem Para so ver o que ele faria, sem mudar nada: INSTALAR.cmd -SoTestar
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-memoria.ps1" %*
set CODIGO=%ERRORLEVEL%
echo.
pause
exit /b %CODIGO%
