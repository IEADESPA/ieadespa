-- CreateTable
CREATE TABLE "Campo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "campoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Area_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "Campo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Congregacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "endereco" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "pastorResponsavel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Congregacao_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OUTRA',
    "faixaEtariaMin" INTEGER,
    "faixaEtariaMax" INTEGER,
    "congregacaoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Turma_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TurmaProfessor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turmaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TurmaProfessor_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TurmaProfessor_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Papel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataNascimento" DATETIME,
    "telefone" TEXT,
    "endereco" TEXT,
    "senhaHash" TEXT,
    "turmaId" TEXT NOT NULL,
    "congregacaoId" TEXT NOT NULL,
    "membroIgreja" BOOLEAN NOT NULL DEFAULT false,
    "batizado" BOOLEAN NOT NULL DEFAULT false,
    "matriculadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Aluno_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Aluno_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Atribuicao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alunoId" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campoId" TEXT,
    "areaId" TEXT,
    "congregacaoId" TEXT,
    CONSTRAINT "Atribuicao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Atribuicao_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Atribuicao_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "Campo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Atribuicao_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Atribuicao_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Funcionalidade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'Geral',
    "ordem" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PermissaoPapel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "papelId" TEXT NOT NULL,
    "funcionalidadeId" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PermissaoPapel_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PermissaoPapel_funcionalidadeId_fkey" FOREIGN KEY ("funcionalidadeId") REFERENCES "Funcionalidade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PermissaoExcecao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alunoId" TEXT NOT NULL,
    "funcionalidadeId" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,
    CONSTRAINT "PermissaoExcecao_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PermissaoExcecao_funcionalidadeId_fkey" FOREIGN KEY ("funcionalidadeId") REFERENCES "Funcionalidade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Licao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "congregacaoId" TEXT NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "abertaPorId" TEXT NOT NULL,
    "abertaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" DATETIME,
    CONSTRAINT "Licao_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Licao_abertaPorId_fkey" FOREIGN KEY ("abertaPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chamada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turmaId" TEXT NOT NULL,
    "data" DATETIME NOT NULL,
    "lancadoPorId" TEXT NOT NULL,
    "licaoId" TEXT,
    "visitantes" INTEGER NOT NULL DEFAULT 0,
    "biblias" INTEGER NOT NULL DEFAULT 0,
    "revistas" INTEGER NOT NULL DEFAULT 0,
    "oferta" REAL NOT NULL DEFAULT 0,
    "inicioPontual" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chamada_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Chamada_lancadoPorId_fkey" FOREIGN KEY ("lancadoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Chamada_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "Licao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresencaAluno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chamadaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "presente" BOOLEAN NOT NULL DEFAULT false,
    "trouxeBiblia" BOOLEAN NOT NULL DEFAULT false,
    "trouxeRevista" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PresencaAluno_chamadaId_fkey" FOREIGN KEY ("chamadaId") REFERENCES "Chamada" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PresencaAluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campoId" TEXT NOT NULL,
    "pesoPresenca" REAL NOT NULL DEFAULT 1,
    "pesoPontual" REAL NOT NULL DEFAULT 1,
    "pesoBiblia" REAL NOT NULL DEFAULT 1,
    "pesoRevista" REAL NOT NULL DEFAULT 1,
    "pesoVisitante" REAL NOT NULL DEFAULT 2,
    "pesoOferta" REAL NOT NULL DEFAULT 0,
    "pesoAtividade" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "ScoreConfig_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "Campo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Atividade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turmaId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "licaoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazo" DATETIME,
    "pontosBase" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Atividade_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Atividade_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Atividade_licaoId_fkey" FOREIGN KEY ("licaoId") REFERENCES "Licao" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pergunta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "atividadeId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL DEFAULT 'MULTIPLA_ESCOLHA',
    "respostaEsperada" TEXT,
    CONSTRAINT "Pergunta_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alternativa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "perguntaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "correta" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ordemCorreta" INTEGER,
    "parTexto" TEXT,
    CONSTRAINT "Alternativa_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "Pergunta" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RespostaAtividade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "atividadeId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "pontosGanhos" INTEGER NOT NULL DEFAULT 0,
    "acertos" INTEGER NOT NULL DEFAULT 0,
    "totalPerguntas" INTEGER NOT NULL DEFAULT 0,
    "concluidaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RespostaAtividade_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RespostaAtividade_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RespostaPergunta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "respostaAtividadeId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "alternativaId" TEXT,
    "ordemSubmetida" INTEGER,
    "respostaTexto" TEXT,
    CONSTRAINT "RespostaPergunta_respostaAtividadeId_fkey" FOREIGN KEY ("respostaAtividadeId") REFERENCES "RespostaAtividade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RespostaPergunta_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "Pergunta" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RespostaPergunta_alternativaId_fkey" FOREIGN KEY ("alternativaId") REFERENCES "Alternativa" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conquista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "tipoRegra" TEXT NOT NULL,
    "parametro" INTEGER,
    "oculta" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "criadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conquista_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Aluno" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConquistaRequisito" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conquistaId" TEXT NOT NULL,
    "requisitoId" TEXT NOT NULL,
    CONSTRAINT "ConquistaRequisito_conquistaId_fkey" FOREIGN KEY ("conquistaId") REFERENCES "Conquista" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConquistaRequisito_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "Conquista" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConquistaAluno" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alunoId" TEXT NOT NULL,
    "conquistaId" TEXT NOT NULL,
    "desbloqueadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConquistaAluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConquistaAluno_conquistaId_fkey" FOREIGN KEY ("conquistaId") REFERENCES "Conquista" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificadoEmitido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alunoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "emitidoPorId" TEXT NOT NULL,
    "emitidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificadoEmitido_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CertificadoEmitido_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT,
    "trimestre" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "precoFornecedor" REAL NOT NULL,
    "precoCongregacao" REAL NOT NULL,
    "precoAluno" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PedidoRevista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "congregacaoId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "fechado" BOOLEAN NOT NULL DEFAULT false,
    "fechadoEm" DATETIME,
    "observacoes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PedidoRevista_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PedidoRevista_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PedidoRevistaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pedidoId" TEXT NOT NULL,
    "revistaId" TEXT NOT NULL,
    "turmaId" TEXT,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" REAL NOT NULL,
    CONSTRAINT "PedidoRevistaItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoRevista" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PedidoRevistaItem_revistaId_fkey" FOREIGN KEY ("revistaId") REFERENCES "Revista" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PedidoRevistaItem_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PagamentoRevista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pedidoId" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "data" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "registradoPorId" TEXT NOT NULL,
    "aprovadoPorId" TEXT,
    "aprovadoEm" DATETIME,
    CONSTRAINT "PagamentoRevista_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoRevista" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PagamentoRevista_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PagamentoRevista_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "Aluno" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LancamentoFinanceiro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "congregacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" REAL NOT NULL,
    "data" DATETIME NOT NULL,
    "descricao" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LancamentoFinanceiro_congregacaoId_fkey" FOREIGN KEY ("congregacaoId") REFERENCES "Congregacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LancamentoFinanceiro_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Aluno" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Campo_nome_key" ON "Campo"("nome");

-- CreateIndex
CREATE INDEX "Area_campoId_idx" ON "Area"("campoId");

-- CreateIndex
CREATE UNIQUE INDEX "Area_campoId_nome_key" ON "Area"("campoId", "nome");

-- CreateIndex
CREATE INDEX "Congregacao_areaId_idx" ON "Congregacao"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Congregacao_areaId_nome_key" ON "Congregacao"("areaId", "nome");

-- CreateIndex
CREATE INDEX "Turma_congregacaoId_idx" ON "Turma"("congregacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_congregacaoId_nome_key" ON "Turma"("congregacaoId", "nome");

-- CreateIndex
CREATE INDEX "TurmaProfessor_alunoId_idx" ON "TurmaProfessor"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "TurmaProfessor_turmaId_alunoId_key" ON "TurmaProfessor"("turmaId", "alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "Papel_chave_key" ON "Papel"("chave");

-- CreateIndex
CREATE INDEX "Papel_nivel_idx" ON "Papel"("nivel");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_matricula_key" ON "Aluno"("matricula");

-- CreateIndex
CREATE INDEX "Aluno_turmaId_idx" ON "Aluno"("turmaId");

-- CreateIndex
CREATE INDEX "Aluno_congregacaoId_idx" ON "Aluno"("congregacaoId");

-- CreateIndex
CREATE INDEX "Aluno_matricula_idx" ON "Aluno"("matricula");

-- CreateIndex
CREATE INDEX "Atribuicao_alunoId_idx" ON "Atribuicao"("alunoId");

-- CreateIndex
CREATE INDEX "Atribuicao_papelId_idx" ON "Atribuicao"("papelId");

-- CreateIndex
CREATE INDEX "Atribuicao_campoId_idx" ON "Atribuicao"("campoId");

-- CreateIndex
CREATE INDEX "Atribuicao_areaId_idx" ON "Atribuicao"("areaId");

-- CreateIndex
CREATE INDEX "Atribuicao_congregacaoId_idx" ON "Atribuicao"("congregacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Atribuicao_alunoId_papelId_campoId_areaId_congregacaoId_key" ON "Atribuicao"("alunoId", "papelId", "campoId", "areaId", "congregacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Funcionalidade_chave_key" ON "Funcionalidade"("chave");

-- CreateIndex
CREATE INDEX "PermissaoPapel_funcionalidadeId_idx" ON "PermissaoPapel"("funcionalidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoPapel_papelId_funcionalidadeId_key" ON "PermissaoPapel"("papelId", "funcionalidadeId");

-- CreateIndex
CREATE INDEX "PermissaoExcecao_funcionalidadeId_idx" ON "PermissaoExcecao"("funcionalidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoExcecao_alunoId_funcionalidadeId_key" ON "PermissaoExcecao"("alunoId", "funcionalidadeId");

-- CreateIndex
CREATE INDEX "Licao_congregacaoId_idx" ON "Licao"("congregacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Licao_congregacaoId_trimestre_ano_numero_key" ON "Licao"("congregacaoId", "trimestre", "ano", "numero");

-- CreateIndex
CREATE INDEX "Chamada_turmaId_idx" ON "Chamada"("turmaId");

-- CreateIndex
CREATE INDEX "Chamada_data_idx" ON "Chamada"("data");

-- CreateIndex
CREATE INDEX "Chamada_licaoId_idx" ON "Chamada"("licaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Chamada_turmaId_data_key" ON "Chamada"("turmaId", "data");

-- CreateIndex
CREATE INDEX "PresencaAluno_alunoId_idx" ON "PresencaAluno"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "PresencaAluno_chamadaId_alunoId_key" ON "PresencaAluno"("chamadaId", "alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreConfig_campoId_key" ON "ScoreConfig"("campoId");

-- CreateIndex
CREATE INDEX "Atividade_turmaId_idx" ON "Atividade"("turmaId");

-- CreateIndex
CREATE INDEX "Atividade_licaoId_idx" ON "Atividade"("licaoId");

-- CreateIndex
CREATE INDEX "Pergunta_atividadeId_idx" ON "Pergunta"("atividadeId");

-- CreateIndex
CREATE INDEX "Alternativa_perguntaId_idx" ON "Alternativa"("perguntaId");

-- CreateIndex
CREATE INDEX "RespostaAtividade_alunoId_idx" ON "RespostaAtividade"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaAtividade_atividadeId_alunoId_key" ON "RespostaAtividade"("atividadeId", "alunoId");

-- CreateIndex
CREATE INDEX "RespostaPergunta_perguntaId_idx" ON "RespostaPergunta"("perguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaPergunta_respostaAtividadeId_perguntaId_alternativaId_key" ON "RespostaPergunta"("respostaAtividadeId", "perguntaId", "alternativaId");

-- CreateIndex
CREATE UNIQUE INDEX "Conquista_chave_key" ON "Conquista"("chave");

-- CreateIndex
CREATE INDEX "Conquista_criadoPorId_idx" ON "Conquista"("criadoPorId");

-- CreateIndex
CREATE UNIQUE INDEX "ConquistaRequisito_conquistaId_requisitoId_key" ON "ConquistaRequisito"("conquistaId", "requisitoId");

-- CreateIndex
CREATE INDEX "ConquistaAluno_alunoId_idx" ON "ConquistaAluno"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConquistaAluno_alunoId_conquistaId_key" ON "ConquistaAluno"("alunoId", "conquistaId");

-- CreateIndex
CREATE INDEX "CertificadoEmitido_alunoId_idx" ON "CertificadoEmitido"("alunoId");

-- CreateIndex
CREATE UNIQUE INDEX "Revista_titulo_trimestre_ano_key" ON "Revista"("titulo", "trimestre", "ano");

-- CreateIndex
CREATE INDEX "PedidoRevista_congregacaoId_idx" ON "PedidoRevista"("congregacaoId");

-- CreateIndex
CREATE INDEX "PedidoRevistaItem_pedidoId_idx" ON "PedidoRevistaItem"("pedidoId");

-- CreateIndex
CREATE INDEX "PedidoRevistaItem_revistaId_idx" ON "PedidoRevistaItem"("revistaId");

-- CreateIndex
CREATE INDEX "PagamentoRevista_pedidoId_idx" ON "PagamentoRevista"("pedidoId");

-- CreateIndex
CREATE INDEX "LancamentoFinanceiro_congregacaoId_idx" ON "LancamentoFinanceiro"("congregacaoId");

-- CreateIndex
CREATE INDEX "LancamentoFinanceiro_data_idx" ON "LancamentoFinanceiro"("data");
