"use server";

import { prisma } from "@/lib/prisma";
import { requireFuncionalidade, podeGerenciarCongregacao, filtroCongregacaoPorEscopo } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CATEGORIAS = [
  "BERCARIO", "JARDIM_INFANCIA", "PRIMARIOS", "JUNIORES", "PRE_ADOLESCENTES",
  "ADOLESCENTES", "JOVENS", "ADULTOS", "NOVOS_CONVERTIDOS", "MELHOR_IDADE", "OUTRA",
] as const;

const revistaSchema = z.object({
  titulo: z.string().min(2, "Informe o título."),
  categoria: z.enum(CATEGORIAS).optional(),
  trimestre: z.coerce.number().int().min(1).max(4),
  ano: z.coerce.number().int().min(2020).max(2100),
  precoFornecedor: z.coerce.number().min(0),
  precoCongregacao: z.coerce.number().min(0),
  precoAluno: z.coerce.number().min(0),
});

export async function criarRevista(_prev: { erro?: string } | undefined, formData: FormData) {
  await requireFuncionalidade("revistas.gerenciar");
  const parsed = revistaSchema.safeParse({
    titulo: formData.get("titulo"),
    categoria: formData.get("categoria") || undefined,
    trimestre: formData.get("trimestre"),
    ano: formData.get("ano"),
    precoFornecedor: formData.get("precoFornecedor"),
    precoCongregacao: formData.get("precoCongregacao"),
    precoAluno: formData.get("precoAluno"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  await prisma.revista.create({
    data: {
      titulo: parsed.data.titulo,
      categoria: parsed.data.categoria,
      trimestre: parsed.data.trimestre,
      ano: parsed.data.ano,
      precoFornecedor: parsed.data.precoFornecedor,
      precoCongregacao: parsed.data.precoCongregacao,
      precoAluno: parsed.data.precoAluno,
    },
  });
  revalidatePath("/revistas");
  return {};
}

export async function alterarStatusRevista(revistaId: string, status: "ATIVO" | "INATIVO") {
  await requireFuncionalidade("revistas.gerenciar");
  await prisma.revista.update({ where: { id: revistaId }, data: { status } });
  revalidatePath("/revistas");
}

async function garantirAcessoCongregacao(user: Awaited<ReturnType<typeof requireFuncionalidade>>, congregacaoId: string) {
  const congregacao = await prisma.congregacao.findUnique({ where: { id: congregacaoId }, include: { area: true } });
  if (!congregacao) return null;
  if (!podeGerenciarCongregacao(user, congregacao.id, congregacao.areaId, congregacao.area.campoId)) return null;
  return congregacao;
}

const itemSchema = z.object({
  congregacaoId: z.string().min(1),
  trimestre: z.coerce.number().int().min(1).max(4),
  ano: z.coerce.number().int().min(2020).max(2100),
  revistaId: z.string().min(1, "Selecione a revista."),
  turmaId: z.string().optional(),
  quantidade: z.coerce.number().int().min(1, "Informe a quantidade."),
});

export async function adicionarItemPedido(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("pedidos_revista.gerenciar");
  const parsed = itemSchema.safeParse({
    congregacaoId: formData.get("congregacaoId"),
    trimestre: formData.get("trimestre"),
    ano: formData.get("ano"),
    revistaId: formData.get("revistaId"),
    turmaId: formData.get("turmaId") || undefined,
    quantidade: formData.get("quantidade"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const congregacao = await garantirAcessoCongregacao(user, parsed.data.congregacaoId);
  if (!congregacao) return { erro: "Você não tem permissão para fazer pedidos nesta congregação." };

  const revista = await prisma.revista.findUnique({ where: { id: parsed.data.revistaId } });
  if (!revista) return { erro: "Revista não encontrada." };

  let pedido = await prisma.pedidoRevista.findFirst({
    where: {
      congregacaoId: parsed.data.congregacaoId,
      trimestre: parsed.data.trimestre,
      ano: parsed.data.ano,
      status: { not: "CANCELADO" },
    },
  });
  if (pedido?.fechado) return { erro: "A janela de pedidos deste trimestre já foi fechada." };
  if (!pedido) {
    pedido = await prisma.pedidoRevista.create({
      data: {
        congregacaoId: parsed.data.congregacaoId,
        criadoPorId: user.id,
        trimestre: parsed.data.trimestre,
        ano: parsed.data.ano,
      },
    });
  }

  await prisma.pedidoRevistaItem.create({
    data: {
      pedidoId: pedido.id,
      revistaId: revista.id,
      turmaId: parsed.data.turmaId || null,
      quantidade: parsed.data.quantidade,
      precoUnitario: revista.precoCongregacao,
    },
  });

  revalidatePath("/revistas");
  return {};
}

export async function removerItemPedido(itemId: string, pedidoId: string) {
  const user = await requireFuncionalidade("pedidos_revista.gerenciar");
  const pedido = await prisma.pedidoRevista.findUnique({ where: { id: pedidoId }, include: { congregacao: { include: { area: true } } } });
  if (!pedido) return;
  if (pedido.fechado) return;
  if (!podeGerenciarCongregacao(user, pedido.congregacaoId, pedido.congregacao.areaId, pedido.congregacao.area.campoId)) return;

  await prisma.pedidoRevistaItem.delete({ where: { id: itemId } });
  revalidatePath("/revistas");
}

const pagamentoSchema = z.object({
  pedidoId: z.string().min(1),
  valor: z.coerce.number().positive("Informe um valor maior que zero."),
  observacao: z.string().optional(),
});

/**
 * O superintendente/secretário registra que pagou — fica PENDENTE_APROVACAO.
 * Só conta para o saldo do pedido depois que um coordenador (ou admin)
 * aprova, em `aprovarPagamento`.
 */
export async function registrarPagamento(_prev: { erro?: string } | undefined, formData: FormData) {
  const user = await requireFuncionalidade("pedidos_revista.gerenciar");
  const parsed = pagamentoSchema.safeParse({
    pedidoId: formData.get("pedidoId"),
    valor: formData.get("valor"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };

  const pedido = await prisma.pedidoRevista.findUnique({
    where: { id: parsed.data.pedidoId },
    include: { congregacao: { include: { area: true } } },
  });
  if (!pedido) return { erro: "Pedido não encontrado." };
  if (!podeGerenciarCongregacao(user, pedido.congregacaoId, pedido.congregacao.areaId, pedido.congregacao.area.campoId)) {
    return { erro: "Você não tem permissão para registrar pagamento neste pedido." };
  }

  await prisma.pagamentoRevista.create({
    data: {
      pedidoId: pedido.id,
      valor: parsed.data.valor,
      observacao: parsed.data.observacao,
      registradoPorId: user.id,
    },
  });

  revalidatePath("/revistas");
  return {};
}

async function recalcularStatusPedido(pedidoId: string) {
  const pedido = await prisma.pedidoRevista.findUnique({
    where: { id: pedidoId },
    include: { itens: true, pagamentos: { where: { status: "APROVADO" } } },
  });
  if (!pedido) return;

  const valorTotal = pedido.itens.reduce((s, it) => s + it.quantidade * it.precoUnitario, 0);
  const jaPago = pedido.pagamentos.reduce((s, p) => s + p.valor, 0);
  await prisma.pedidoRevista.update({
    where: { id: pedidoId },
    data: { status: jaPago >= valorTotal && valorTotal > 0 ? "PAGO" : jaPago > 0 ? "PARCIAL" : "PENDENTE" },
  });
}

/** Aprova (ou rejeita) um pagamento pré-anotado — só quem consolida (coordenador de campo/admin) pode. */
export async function decidirPagamento(pagamentoId: string, decisao: "APROVADO" | "REJEITADO") {
  const user = await requireFuncionalidade("pedidos_revista.consolidar");
  const pagamento = await prisma.pagamentoRevista.findUnique({
    where: { id: pagamentoId },
    include: { pedido: { include: { congregacao: { include: { area: true } } } } },
  });
  if (!pagamento || pagamento.status !== "PENDENTE_APROVACAO") return;
  if (
    !podeGerenciarCongregacao(
      user,
      pagamento.pedido.congregacaoId,
      pagamento.pedido.congregacao.areaId,
      pagamento.pedido.congregacao.area.campoId
    )
  ) {
    return;
  }

  await prisma.pagamentoRevista.update({
    where: { id: pagamentoId },
    data: { status: decisao, aprovadoPorId: user.id, aprovadoEm: new Date() },
  });
  if (decisao === "APROVADO") await recalcularStatusPedido(pagamento.pedidoId);

  revalidatePath("/revistas");
}

/** Fecha a janela de pedidos do trimestre (dentro do escopo de quem aciona) — pronto para o consolidado. */
export async function fecharJanelaPedidos(trimestre: number, ano: number) {
  const user = await requireFuncionalidade("pedidos_revista.consolidar");
  await prisma.pedidoRevista.updateMany({
    where: {
      trimestre,
      ano,
      status: { not: "CANCELADO" },
      congregacao: filtroCongregacaoPorEscopo(user),
    },
    data: { fechado: true, fechadoEm: new Date() },
  });
  revalidatePath("/revistas");
}

export async function reabrirJanelaPedidos(trimestre: number, ano: number) {
  const user = await requireFuncionalidade("pedidos_revista.consolidar");
  await prisma.pedidoRevista.updateMany({
    where: { trimestre, ano, congregacao: filtroCongregacaoPorEscopo(user) },
    data: { fechado: false, fechadoEm: null },
  });
  revalidatePath("/revistas");
}
