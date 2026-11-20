---
name: homolog-massa-grande
description: "Massa grande de dados fictícios da homologação — gerador pronto (ramo homolog-massa-grande, 7448821) e ligado ao deploy do ramo homolog em 12/11/2026; o que cobre, o que ficou de fora, logins e o defeito real que ele achou"
metadata:
  node_type: memory
  type: project
  originSessionId: 8e446f57-0011-4863-8efe-ff9484623ad6
  modified: 2026-11-12T19:57:01.147Z
---

**Estado (12/11/2026):** o gerador `api/scripts/semear-homologacao-grande.js` (ramo `homolog-massa-grande`, último 7448821, só 2 arquivos: o script e a seção "Massa grande" do `HOMOLOGACAO.md`) foi mesclado no ramo **`homolog`** (4a86c48) e o passo "Executar Migrações SQL" do workflow, **só no ramo homolog** (838580f), roda o gerador depois do semeador pequeno. Cada deploy do PR #21 completa o que falta (idempotente). NÃO está na `main` (regra da FASE 10: nada na main sem ele aprovar).

**Por que pelo GitHub:** o firewall do `srv-app-sql` recusa o IP do notebook (dinâmico); abrir regra mexe na segurança do servidor da produção — não fazer por conta própria. O runner do GitHub entra pela regra AllowAllWindowsAzureIps com o segredo `AZURE_SQL_CONNECTION_STRING_HOMOLOG`. Roteiro local de checagem (lê a conexão sem imprimir): `scratchpad/homolog-massa.js` desta sessão.

**O que gera (semente 20261111, data-base 2026-11-08):** 45 congregações, 3 Regiões, 9 Áreas, 2 Quadrantes, 1 Distrito, 10 Extensões; 5.047 pessoas; 36 meses de tesouraria (~69 mil lançamentos); 18 meses de relatórios de departamento; reuniões CLI/JAI; prestações; PSC 2026; EBD de um ano; escalas. História com tendência (7 congregações caem, 11 estáveis, 27 crescem), sazonalidade e ~5% de evasão silenciosa (para o alerta da v10.12). Marcas: matrículas 700000–799999, nomes "(Fictícia)/(Fictício)"; `--apagar` remove só isso. Logins com a senha padrão do semeador pequeno: Presidente 700001, Secretário Geral 700002, Tesouraria Geral 700003, Superintendentes 700011–13, Pastores de Área 700021–29, Pastor Distrital 700031, Dirigente da congregação k = 700100+k, Tesoureiro Local = 700200+k.

**Segunda leva (12/11/2026, ordem dele: "tudo entra, enche o sistema, muita coisa, o mais aleatório possível"):** o mesmo agente (a19b8c18667674f30) foi retomado para pôr calendário/eventos, cuidado pastoral, missões, expansão, entidades, consagração, credencial, AFM/seminário, vistorias, termos dos membros fictícios (não dos logins de liderança) e o resto; o que o banco proíbe apagar fica para sempre na homologação. Ele mesmo mescla o ramo no `homolog` (nunca na main) em partes e acompanha o deploy do PR #21.

**Segunda leva TERMINADA (12/11/2026, partes 1–6, último merge no homolog cb525e1, ramo da massa 5db2125):** tudo na homologação (calendário, cuidado, missões, expansão, entidades, ministério, segurança, consentimentos, enquetes, campanhas/doações/cessões, comunicação sem envio, conquistas, menores/check-in, proteção, crises encerradas, temas antigos da identidade, prebenda com CPF de DV impossível, extrato bancário). Fica para sempre o que o banco não deixa apagar (documentado no script e no HOMOLOGACAO.md). O agente usou um banco LocalDB próprio (`ieadespa_massa`) porque o `rodar.sh` das outras provas restaura o `ieadespa_local` no meio. Defeito real achado: conciliação bancária — saídas nunca batem (sinal), esperando o "pode corrigir".

**Ficou de fora na primeira leva (e por quê — superado pela ordem acima):** calendário, vistorias/AVCB, cuidado pastoral, termos/consentimentos (não dá para refazer/forjar), missões, expansão, entidades, consagração, credencial (esteiras de decisão — próxima rodada).

**Defeito real achado:** `LancamentosTesouraria.Tipo` é NVARCHAR(20), mas a categoria `OFERTA_CULTO_DEPARTAMENTO` (migração 047) tem 25 letras — ninguém consegue lançar essa categoria. Correção = migração alargando a coluna; precisa do OK dele (mexe na produção). A permissão `relatorios_departamentais` só para Presidente/Secretário Geral NÃO é defeito (migração 093, de propósito).

**Pendência de segurança antiga (não nova):** a senha de teste da homologação está escrita no código dos semeadores (desde a vD.3) — melhorar levando para o segredo `SEED_SENHA` quando ele decidir. Ver [[fase10-nada-sem-aprovacao]], [[urls-producao-e-homologacao]], [[testar-sql-na-homologacao]].
