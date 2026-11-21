---
name: v713-eventos-no-site
description: "v7.13 Eventos — decisões dele de 22/10/2026: TUDO NO SITE agora (seminário em novembro, sem risco), sistema na Fase 10; pagamento manual com \"informar pagamento\" + Pix online via conta Cora aprovado pelo Presidente; hospedagem/transporte fora"
metadata:
  node_type: memory
  type: project
  originSessionId: a96b641f-4af0-4399-a180-c1aca450260c
  modified: 2026-10-22T18:07:47.946Z
---

Decisões do responsável (22/10/2026, ao começar a v7.13):
- **Construir no SITE** (Directus + site/api), ampliando o que já existe (inscrição, faixas, cupom, vagas, QR, crachá). Motivo: um **seminário em novembro** que é o maior uso e cujas inscrições abrem bem antes; ele "precisa trabalhar amanhã" e não aceita o risco de mudar de lugar agora. Levar inscrições, camisetas etc. para o sistema fica para a **Fase 10** (integração total; site vira só conteúdo) — ver [[visao-futura-integracao-total]].
- **Pagamento:** (1) manual continua, mas em **Minha Conta → Meus eventos** a pessoa vê inscrições e camisetas e **informa o pagamento** (data, meio, nome de quem pagou); a equipe confere no extrato e confirma (fica quem confirmou e quando); "cada inscrição vira conta a receber" está ERRADO (não fazer). (3) **Pix online pela conta da Igreja no banco Cora** (API: ~R$ 1–2 por Pix + R$ 50/mês) — **aprovado pelo Presidente**; alternativa citada: Asaas. É "aonde a gente quer chegar".
- **Hospedagem/transporte por congregação: não fazer agora** (decidido por mim com aval dele: no campo todos vão juntos; só faria sentido em evento fora ou convenção recebida → Fase 10).

Ver [[site-trava-vagas-inscricoes]] (ninguém recusado por falta de vaga; um PR por vez contra o Directus de produção) e [[camisetas-site-regras-na-api]].

**22/10/2026 (mais tarde):** inscrições do seminário abrem em **1 a 2 semanas** → fazer a parte 1 inteira antes. **Pix online PARADO** a pedido dele até análise de segurança: ele quer DNSSEC e mais proteção no site antes de dinheiro real; CPF (Cora exige CPF do pagador, mínimo R$ 5) só para a cobrança e apagado depois de pago (atenção: estorno). Fato medido: os DNS de ieadespa.org.br estão na Microsoft 365 (ns*.bdm.microsoftonline.com), que NÃO tem DNSSEC — ligar exige mudar os DNS (Registro.br faz DNSSEC automático; ou Azure DNS) e publicar o DS no Registro.br (ação dele). Integração Cora = "Integração Direta" (certificado + chave + client-id gerados em Conta > Integrações via APIs; ambiente stage existe).

**22/10/2026 (noite):** ele decidiu levar domínio/DNS/segurança e o Pix para a **Fase 10** (sem orçamento agora): criei no plano **v10.6** (integração total: site vira conteúdo; hospedagem/transporte), **v10.7** (domínio novo para o e-mail da Microsoft 365 + `ieadespa.org.br` na zona do Azure DNS com DNSSEC, CAA, DMARC endurecido, CSP do site; comparar antes com "só mudar o DNS") e **v10.8** (Pix Cora). Depois ele decidiu: **NENHUM registro de DNS antes da v10.7** (nem o DMARC; não reabrir) — outra sessão, na Fase 10, faz a zona inteira de uma vez (inclusive o e-mail automático do sistema). Até lá pagamento só informado + **aviso contra golpe** (a Igreja não contata ninguém pedindo Pix) nas telas de pagamento do site (entrou na v7.13). Medido: `ieadespa.org` (e-mail Google, DNS na Odara) tem SPF sem `include:_spf.google.com` e sem DMARC. Duas etapas já existem nas contas (disse ele).

**ENTREGUE em 22/10/2026** (merge `3c6b042`; reverter = `git revert -m 1 3c6b042`). Esquema aplicado em produção por `site/scripts/directus-eventos-v713-esquema.mjs` (25 campos, coleção `evento_entradas`, permissões só da equipe; simulado antes; rodar de novo não cria nada) — o segredo foi entregue só ao processo com `sops exec-env site/secrets.env '<comando>'` (DIRECTUS_URL público no env). Licença Core do Directus: permissão nova não aceita lista de campos e não há filtro por evento → "pago" fecha só pela Function (painel mostra "registro divergente"). Produção NÃO tinha criação pública em respostas_inscricao (o README dizia que tinha). Bateria eventos-v713.cjs só roda na réplica local (cria usuário temporário).
