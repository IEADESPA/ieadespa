import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useDb } from "../state/db";
import { useConfig } from "../state/config";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { DynamicForm } from "../components/DynamicForm";
import { StatusBadge } from "../components/StatusBadge";
import { nomeMes } from "../domain/utils";
import { valoresComputados } from "../domain/calculos";
import { acoesParaNivel, nivelSobreRelatorio, ROTULO_PERFIL } from "../domain/permissoes";
import type { PerfilNome } from "../domain/types";
import { HistoricoLista } from "../components/HistoricoLista";

function papelParaNivel(nivel: number, usuario: { vinculos: { perfil: PerfilNome }[] }): PerfilNome {
  const alvo = nivel >= 4 ? ["secretario_geral", "presidente"] : nivel === 3 ? ["lider_geral"] : nivel === 2 ? ["lider_area", "pastor_area"] : ["lider_local", "dirigente_congregacao"];
  return usuario.vinculos.find((v) => alvo.includes(v.perfil))?.perfil ?? alvo[0] as PerfilNome;
}

export function RelatorioPage() {
  const { tipoDepartamentoId, congregacaoId, ano, mes } = useParams();
  const { usuario } = useAuth();
  const { departamentos } = useConfig();
  const { obterOuCriarRelatorio, salvar, mudarStatus, comentar, congregacoes } = useDb();
  const { notificar } = useToast();
  const pedirConfirmacao = useConfirm();
  const navigate = useNavigate();

  const anoNum = Number(ano);
  const mesNum = Number(mes);

  const dep = tipoDepartamentoId ? departamentos.find((d) => d.id === tipoDepartamentoId) ?? null : null;
  const congregacao = congregacoes.find((c) => c.id === congregacaoId);
  const relatorio =
    usuario && dep && congregacaoId && anoNum && mesNum
      ? obterOuCriarRelatorio(dep.id, congregacaoId, mesNum, anoNum)
      : null;

  const [valores, setValores] = useState<Record<string, number>>(relatorio?.valores ?? {});
  const [listas, setListas] = useState(relatorio?.listas ?? {});
  const [semanas, setSemanas] = useState(relatorio?.semanas ?? []);
  const [comentario, setComentario] = useState(relatorio?.comentarioArea ?? "");

  useEffect(() => {
    if (relatorio) {
      setValores(relatorio.valores);
      setListas(relatorio.listas);
      setSemanas(relatorio.semanas);
      setComentario(relatorio.comentarioArea ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatorio?.id]);

  if (!usuario || !dep || !congregacaoId || !relatorio) {
    return (
      <div className="aviso-caixa aviso-info">
        <span>⚠️</span>
        <span>Relatório não encontrado.</span>
      </div>
    );
  }

  const nivel = nivelSobreRelatorio(usuario, dep.id, congregacaoId, congregacoes);
  if (nivel === 0) {
    return (
      <div className="aviso-caixa aviso-info">
        <span>⚠️</span>
        <span>Você não tem permissão para acessar este relatório.</span>
      </div>
    );
  }

  const acoes = acoesParaNivel(nivel, relatorio.status);
  const papel = papelParaNivel(nivel, usuario);
  const usuarioAtual = usuario;
  const relatorioAtual = relatorio;
  const depAtual = dep;

  const valoresExibidos = valoresComputados(depAtual, valores, listas, semanas);

  function mudarMes(delta: number) {
    let m = mesNum + delta;
    let a = anoNum;
    if (m > 12) { m = 1; a += 1; }
    if (m < 1) { m = 12; a -= 1; }
    navigate(`/relatorio/${depAtual.id}/${congregacaoId}/${a}/${m}`);
  }

  function salvarAlteracoes() {
    salvar(relatorioAtual, { valores, listas, semanas });
    notificar({ tipo: "sucesso", titulo: "Alterações salvas" });
  }

  async function enviar() {
    const ok = await pedirConfirmacao({
      titulo: "Enviar relatório",
      mensagem: `Confirma o envio do relatório de ${depAtual.nome} — ${congregacao?.nome} (${nomeMes(mesNum)}/${anoNum})?`,
      textoConfirmar: "Enviar",
    });
    if (!ok) return;
    mudarStatus(relatorioAtual, "enviado", usuarioAtual, papel, { valores, listas, semanas });
    notificar({ tipo: "sucesso", titulo: "Relatório enviado!" });
  }

  async function aprovarArea() {
    const ok = await pedirConfirmacao({
      titulo: "Aprovar relatório (nível área)",
      mensagem: "O relatório seguirá para a aprovação definitiva do Líder Geral. Confirma?",
      textoConfirmar: "Aprovar",
    });
    if (!ok) return;
    mudarStatus(relatorioAtual, "aprovado_area", usuarioAtual, papel, { comentario });
    notificar({ tipo: "sucesso", titulo: "Relatório aprovado (nível área)" });
  }

  function salvarComentario() {
    comentar(relatorioAtual.id, usuarioAtual, papel, comentario);
    notificar({ tipo: "info", titulo: "Comentário registrado" });
  }

  async function aprovarGeral() {
    const pulou = relatorioAtual.status !== "aprovado_area";
    const ok = await pedirConfirmacao({
      titulo: "Aprovar em definitivo",
      mensagem: pulou
        ? "Este relatório ainda não passou pela aprovação de área — ao confirmar, você aprova direto em definitivo, pulando essa etapa. Depois disso só uma retificação da Presidência/Secretaria Geral poderá alterá-lo. Confirma os valores?"
        : "Essa é a aprovação definitiva do relatório. Depois disso, só uma retificação da Presidência/Secretaria Geral poderá alterá-lo. Confirma os valores?",
      textoConfirmar: "Aprovar em definitivo",
    });
    if (!ok) return;
    mudarStatus(relatorioAtual, "aprovado_geral", usuarioAtual, papel, { valores, listas, semanas, pulouEtapaArea: pulou });
    notificar({ tipo: "sucesso", titulo: "Relatório aprovado em definitivo!" });
  }

  async function retificar() {
    const ok = await pedirConfirmacao({
      titulo: "Retificar relatório fechado",
      mensagem: "Este relatório já estava fechado. A retificação fica registrada no histórico. Confirma a alteração?",
      textoConfirmar: "Salvar retificação",
      perigoso: true,
    });
    if (!ok) return;
    mudarStatus(relatorioAtual, "aprovado_geral", usuarioAtual, papel, { valores, listas, semanas });
    notificar({ tipo: "sucesso", titulo: "Retificação registrada" });
  }

  return (
    <div>
      <Link to="/painel" style={{ fontSize: "0.85rem" }}>
        ← Voltar ao painel
      </Link>

      <div className="secao-titulo" style={{ marginTop: "0.6rem" }}>
        <div>
          <h1>
            <span style={{ color: depAtual.corDestaque }}>{depAtual.sigla}</span> — {congregacao?.nome}
          </h1>
          <p style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {depAtual.nome} ·
            <button className="btn btn-ghost" style={{ padding: "0.1rem 0.4rem" }} onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              ‹
            </button>
            {nomeMes(mesNum)}/{anoNum}
            <button className="btn btn-ghost" style={{ padding: "0.1rem 0.4rem" }} onClick={() => mudarMes(1)} aria-label="Próximo mês">
              ›
            </button>
            · você está agindo como <strong>{ROTULO_PERFIL[papel]}</strong>
          </p>
        </div>
        <StatusBadge status={relatorio.status} atrasado={relatorio.atrasado} />
      </div>

      {nivel === 3 && relatorio.status !== "aprovado_area" && relatorio.status !== "aprovado_geral" && (
        <div className="aviso-caixa aviso-primario secao">
          Este relatório ainda não passou pela aprovação de área — como Líder Geral, você pode editar e aprovar direto, sem
          depender do líder de área.
        </div>
      )}
      {nivel === 3 && relatorio.status === "aprovado_area" && (
        <div className="aviso-caixa aviso-primario secao">
          Você pode corrigir diretamente os valores abaixo antes de dar a aprovação definitiva — é assim que o sistema
          concilia o relatório com o caixa real recebido, já que não há comprovante anexado.
        </div>
      )}
      {acoes.podeRetificar && (
        <div className="aviso-caixa aviso-primario secao">
          Este relatório já está fechado. Qualquer alteração aqui é uma retificação e ficará registrada no histórico.
        </div>
      )}
      {nivel === 4 && relatorio.status !== "aprovado_geral" && (
        <div className="aviso-caixa aviso-info secao">
          Como Secretário(a) Geral/Presidente, você pode editar, enviar e aprovar este relatório em qualquer nível,
          independentemente do que os demais responsáveis já tenham feito.
        </div>
      )}

      {relatorio.comentarioArea && (
        <div className="aviso-caixa aviso-info secao">
          <span>💬</span>
          <span>
            <strong>Comentário do Líder de Área:</strong> {relatorio.comentarioArea}
          </span>
        </div>
      )}

      <DynamicForm
        departamento={depAtual}
        valores={valoresExibidos}
        listas={listas}
        semanas={semanas}
        onChangeValor={(chave, v) => setValores((atual) => ({ ...atual, [chave]: v }))}
        onChangeListas={(listaId, itens) => setListas((atual) => ({ ...atual, [listaId]: itens }))}
        onChangeSemanas={setSemanas}
        somenteLeitura={!acoes.podeEditarValores}
      />

      {acoes.podeComentar && (
        <div className="card grupo-bloco">
          <h3 style={{ fontSize: "1rem" }}>Comentário para o líder local</h3>
          <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Opcional — visível para quem preencheu o relatório" />
          <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.8rem" }}>
            <button className="btn btn-outline" onClick={salvarComentario}>
              Salvar só o comentário
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.7rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {acoes.podeEditarValores && (
          <button className="btn btn-outline" onClick={salvarAlteracoes}>
            Salvar alterações
          </button>
        )}
        {acoes.podeEnviar && (
          <button className="btn btn-outline" onClick={enviar}>
            Enviar relatório
          </button>
        )}
        {acoes.podeAprovarArea && (
          <button className="btn btn-primary" onClick={aprovarArea}>
            Aprovar (nível área)
          </button>
        )}
        {acoes.podeAprovarGeral && (
          <button className="btn btn-primary" onClick={aprovarGeral}>
            Aprovar em definitivo
          </button>
        )}
        {acoes.podeRetificar && (
          <button className="btn btn-danger" onClick={retificar}>
            Salvar retificação
          </button>
        )}
      </div>

      {relatorio.historico.length > 0 && (
        <div className="secao" style={{ marginTop: "1.6rem" }}>
          <h3 style={{ fontSize: "0.95rem" }}>Histórico</h3>
          <HistoricoLista historico={relatorio.historico} />
        </div>
      )}
    </div>
  );
}
