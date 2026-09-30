import { Link } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useDb } from "../state/db";
import { useConfig } from "../state/config";
import { getDepartamento } from "../domain/departamentos";
import {
  departamentosDeRevisaoGeral,
  ehSecretarioOuPresidente,
  escoposDeRevisaoArea,
  tarefasDePreenchimento,
} from "../domain/permissoes";
import { MES_ATUAL } from "../domain/seed";
import { StatusBadge } from "../components/StatusBadge";
import { nomeMes } from "../domain/utils";
import type { RelatorioMensal, Congregacao, TipoDepartamento } from "../domain/types";

export function HomePage() {
  const { usuario } = useAuth();
  const { departamentos } = useConfig();
  const { relatorios, congregacoes, obterOuCriarRelatorio } = useDb();
  if (!usuario) return null;

  const tarefas = tarefasDePreenchimento(usuario, departamentos);
  const escoposArea = escoposDeRevisaoArea(usuario, departamentos);
  const deptosGeral = departamentosDeRevisaoGeral(usuario);
  const ehAdmin = ehSecretarioOuPresidente(usuario);

  const revisaoArea = relatorios.filter(
    (r) =>
      r.status === "enviado" &&
      escoposArea.some((e) => {
        const cong = congregacoes.find((c) => c.id === r.congregacaoId);
        return e.tipoDepartamentoId === r.tipoDepartamentoId && cong?.areaId === e.areaId;
      }),
  );

  const revisaoGeral = relatorios.filter((r) => r.status === "aprovado_area" && deptosGeral.includes(r.tipoDepartamentoId));

  const todosParaAdmin = ehAdmin ? [...relatorios].sort((a, b) => (b.dataEnvio ?? 0) - (a.dataEnvio ?? 0)) : [];

  return (
    <div>
      <div className="secao-titulo">
        <div>
          <h1>
            Painel — {nomeMes(MES_ATUAL.mes)}/{MES_ATUAL.ano}
          </h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: "-0.3rem" }}>Olá, {usuario.nome.split(" ")[0]}.</p>
        </div>
      </div>

      {tarefas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <h2 style={{ fontSize: "1.05rem" }}>Meus relatórios do mês</h2>
            <p>{tarefas.length} departamento(s) sob sua responsabilidade</p>
          </div>
          <div className="grid-cards">
            {tarefas.map((t) => {
              const dep = getDepartamento(departamentos, t.tipoDepartamentoId);
              const cong = congregacoes.find((c) => c.id === t.congregacaoId);
              const relatorio = obterOuCriarRelatorio(t.tipoDepartamentoId, t.congregacaoId, MES_ATUAL.mes, MES_ATUAL.ano);
              return (
                <Link
                  key={`${t.tipoDepartamentoId}-${t.congregacaoId}`}
                  to={`/relatorio/${t.tipoDepartamentoId}/${t.congregacaoId}/${MES_ATUAL.ano}/${MES_ATUAL.mes}`}
                  className="card"
                  style={{ padding: "1.1rem", textDecoration: "none", display: "block" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ color: dep.corDestaque }}>{dep.sigla}</strong>
                      <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>{dep.nome}</div>
                    </div>
                    <StatusBadge status={relatorio.status} atrasado={relatorio.atrasado} />
                  </div>
                  <div style={{ marginTop: "0.7rem", fontSize: "0.85rem" }}>Congregação: {cong?.nome}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {revisaoArea.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <h2 style={{ fontSize: "1.05rem" }}>Aguardando sua aprovação — nível área</h2>
            <p>{revisaoArea.length} relatório(s)</p>
          </div>
          <ListaRelatorios relatorios={revisaoArea} congregacoes={congregacoes} departamentos={departamentos} />
        </section>
      )}

      {revisaoGeral.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <h2 style={{ fontSize: "1.05rem" }}>Aguardando sua aprovação definitiva — nível geral</h2>
            <p>{revisaoGeral.length} relatório(s)</p>
          </div>
          <ListaRelatorios relatorios={revisaoGeral} congregacoes={congregacoes} departamentos={departamentos} />
        </section>
      )}

      {(escoposArea.length > 0 || deptosGeral.length > 0 || ehAdmin) && (
        <section className="secao">
          <div className="secao-titulo">
            <h2 style={{ fontSize: "1.05rem" }}>Ver ou lançar qualquer relatório</h2>
            <p>Use o Consolidado para navegar por departamento, área e mês — sem depender de quem preenche localmente ter agido.</p>
          </div>
          <Link to="/consolidado" className="btn btn-secondary">
            Abrir Consolidado
          </Link>
        </section>
      )}

      {ehAdmin && (
        <section className="secao">
          <div className="secao-titulo">
            <h2 style={{ fontSize: "1.05rem" }}>Relatórios com atividade recente</h2>
            <p>Visão de Secretaria Geral / Presidência</p>
          </div>
          <ListaRelatorios relatorios={todosParaAdmin.slice(0, 12)} congregacoes={congregacoes} departamentos={departamentos} />
        </section>
      )}

      {tarefas.length === 0 && revisaoArea.length === 0 && revisaoGeral.length === 0 && !ehAdmin && (
        <div className="vazio-estado">Nenhuma pendência para o seu perfil no momento.</div>
      )}
    </div>
  );
}

function ListaRelatorios({
  relatorios,
  congregacoes,
  departamentos,
}: {
  relatorios: RelatorioMensal[];
  congregacoes: Congregacao[];
  departamentos: TipoDepartamento[];
}) {
  if (relatorios.length === 0) return <div className="vazio-estado">Nada por aqui.</div>;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Departamento</th>
            <th>Congregação</th>
            <th>Referência</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {relatorios.map((r) => {
            const dep = getDepartamento(departamentos, r.tipoDepartamentoId);
            const cong = congregacoes.find((c) => c.id === r.congregacaoId);
            return (
              <tr key={r.id}>
                <td>
                  <strong style={{ color: dep.corDestaque }}>{dep.sigla}</strong>
                </td>
                <td>{cong?.nome}</td>
                <td>
                  {nomeMes(r.mesReferencia)}/{r.anoReferencia}
                </td>
                <td>
                  <StatusBadge status={r.status} atrasado={r.atrasado} />
                </td>
                <td>
                  <Link className="btn btn-outline" to={`/relatorio/${r.tipoDepartamentoId}/${r.congregacaoId}/${r.anoReferencia}/${r.mesReferencia}`}>
                    Abrir
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
