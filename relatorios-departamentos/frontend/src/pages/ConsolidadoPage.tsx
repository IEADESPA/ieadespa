import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useDb } from "../state/db";
import { useConfig } from "../state/config";
import { calcularRateio } from "../domain/rateio";
import { formatarMoeda, nomeMes } from "../domain/utils";
import { MES_ATUAL } from "../domain/seed";
import {
  departamentosDeRevisaoGeral,
  ehSecretarioOuPresidente,
  escoposDeRevisaoArea,
  maiorNivelGeral,
} from "../domain/permissoes";
import { StatusBadge } from "../components/StatusBadge";
import { BarrasSimples } from "../components/BarrasSimples";
import type { RelatorioMensal } from "../domain/types";

const CAMPOS_EVENTOS: [string, string][] = [
  ["eventos_local", "Local"],
  ["eventos_area", "Área"],
  ["eventos_geral", "Geral"],
];
const CAMPOS_INTEGRACAO: [string, string][] = [
  ["integracao_conversao", "Conversão"],
  ["integracao_reconciliacao", "Reconciliação"],
  ["integracao_outra_igreja", "De Outra Igreja"],
];

export function ConsolidadoPage() {
  const { usuario } = useAuth();
  const { departamentos } = useConfig();
  const { relatorios, congregacoes, areas } = useDb();
  const [ano, setAno] = useState(MES_ATUAL.ano);
  const [mes, setMes] = useState(MES_ATUAL.mes);
  const [abaSelecionada, setAbaSelecionada] = useState<string>("todos");

  if (!usuario) return null;

  if (maiorNivelGeral(usuario) < 2) {
    return (
      <div className="aviso-caixa aviso-info">
        <span>⚠️</span>
        <span>O Consolidado é uma visão de Líder de Área, Líder Geral, Secretaria Geral ou Presidência — não está disponível para o seu perfil.</span>
      </div>
    );
  }

  const ehAdmin = ehSecretarioOuPresidente(usuario);
  const deptosGeralIds = departamentosDeRevisaoGeral(usuario);
  const escoposArea = escoposDeRevisaoArea(usuario, departamentos);

  const departamentosPermitidos = ehAdmin
    ? departamentos
    : departamentos.filter((d) => deptosGeralIds.includes(d.id) || escoposArea.some((e) => e.tipoDepartamentoId === d.id));

  function congregacoesVisiveis(depId: string) {
    if (ehAdmin || deptosGeralIds.includes(depId)) return congregacoes;
    const areasDoDep = new Set(escoposArea.filter((e) => e.tipoDepartamentoId === depId).map((e) => e.areaId));
    return congregacoes.filter((c) => areasDoDep.has(c.areaId));
  }

  const deptosParaMostrar = abaSelecionada === "todos" ? departamentosPermitidos : departamentosPermitidos.filter((d) => d.id === abaSelecionada);

  function mudarMes(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m > 12) { m = 1; a += 1; }
    if (m < 1) { m = 12; a -= 1; }
    setMes(m);
    setAno(a);
  }

  // linhas: departamento x congregação visível, no mês selecionado
  const linhas = deptosParaMostrar.flatMap((dep) =>
    congregacoesVisiveis(dep.id).map((cong) => {
      const relatorio = relatorios.find(
        (r) => r.tipoDepartamentoId === dep.id && r.congregacaoId === cong.id && r.mesReferencia === mes && r.anoReferencia === ano,
      );
      return { dep, cong, relatorio };
    }),
  );

  const fechados = linhas.filter((l) => l.relatorio?.status === "aprovado_geral").map((l) => l.relatorio!);
  const naoIniciados = linhas.filter((l) => !l.relatorio).length;
  const emAndamento = linhas.length - naoIniciados - fechados.length;

  return (
    <div>
      <div className="secao-titulo">
        <div>
          <h1>Consolidado</h1>
          <p style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button className="btn btn-ghost" style={{ padding: "0.1rem 0.4rem" }} onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              ‹
            </button>
            {nomeMes(mes)}/{ano}
            <button className="btn btn-ghost" style={{ padding: "0.1rem 0.4rem" }} onClick={() => mudarMes(1)} aria-label="Próximo mês">
              ›
            </button>
          </p>
        </div>
      </div>

      <div className="secao" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className={`btn ${abaSelecionada === "todos" ? "btn-primary" : "btn-outline"}`} onClick={() => setAbaSelecionada("todos")}>
          Todos
        </button>
        {departamentosPermitidos.map((d) => (
          <button
            key={d.id}
            className={`btn ${abaSelecionada === d.id ? "btn-primary" : "btn-outline"}`}
            onClick={() => setAbaSelecionada(d.id)}
            style={abaSelecionada === d.id ? undefined : { borderColor: d.corDestaque, color: d.corDestaque }}
          >
            {d.sigla}
          </button>
        ))}
      </div>

      <div className="grid-cards secao">
        <ResumoCard titulo="Fechados" valor={fechados.length} sub={`de ${linhas.length} relatórios no recorte`} />
        <ResumoCard titulo="Em andamento" valor={emAndamento} sub="enviados ou aprovados na área, aguardando próxima etapa" />
        <ResumoCard titulo="Não iniciados" valor={naoIniciados} sub="ninguém preencheu ainda neste mês" />
      </div>

      <div className="grid-cards secao">
        {abaSelecionada === "todos" ? (
          <>
            <BarrasSimples
              titulo="Eventos por departamento (fechados)"
              barras={deptosParaMostrar.map((d) => ({
                rotulo: d.sigla,
                valor: somarCampos(fechados.filter((r) => r.tipoDepartamentoId === d.id), CAMPOS_EVENTOS.map((c) => c[0])),
                cor: d.corDestaque,
              }))}
            />
            <BarrasSimples
              titulo="Integração por departamento (fechados)"
              barras={deptosParaMostrar.map((d) => ({
                rotulo: d.sigla,
                valor: somarCampos(fechados.filter((r) => r.tipoDepartamentoId === d.id), CAMPOS_INTEGRACAO.map((c) => c[0])),
                cor: d.corDestaque,
              }))}
            />
          </>
        ) : (
          <>
            <BarrasSimples
              titulo="Eventos (fechados)"
              barras={CAMPOS_EVENTOS.map(([chave, rotulo]) => ({ rotulo, valor: somarCampos(fechados, [chave]) }))}
            />
            <BarrasSimples
              titulo="Integração (fechados)"
              barras={CAMPOS_INTEGRACAO.map(([chave, rotulo]) => ({ rotulo, valor: somarCampos(fechados, [chave]) }))}
            />
          </>
        )}
      </div>

      <div className="secao">
        <h2 style={{ fontSize: "1.05rem" }}>Relatórios do recorte</h2>
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Congregação</th>
                <th>Área</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ dep, cong, relatorio }) => {
                const areaNome = areas.find((a) => a.id === cong.areaId)?.nome;
                return (
                  <tr key={`${dep.id}-${cong.id}`}>
                    <td>
                      <strong style={{ color: dep.corDestaque }}>{dep.sigla}</strong>
                    </td>
                    <td>{cong.nome}</td>
                    <td>{areaNome}</td>
                    <td>{relatorio ? <StatusBadge status={relatorio.status} atrasado={relatorio.atrasado} /> : <span className="badge badge-rascunho">Não iniciado</span>}</td>
                    <td>
                      <Link className="btn btn-outline" to={`/relatorio/${dep.id}/${cong.id}/${ano}/${mes}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="secao">
        <h2 style={{ fontSize: "1.05rem" }}>Arrecadação (fechados)</h2>
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Fechados</th>
                <th>Arrecadado (para o geral)</th>
              </tr>
            </thead>
            <tbody>
              {deptosParaMostrar.map((dep) => {
                const doDepto = fechados.filter((r) => r.tipoDepartamentoId === dep.id);
                const arrecadado = doDepto.reduce((soma, r) => soma + calcularRateio(dep, r.valores).paraGeral, 0);
                return (
                  <tr key={dep.id}>
                    <td>
                      <strong style={{ color: dep.corDestaque }}>{dep.sigla}</strong>
                      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{dep.nome}</div>
                    </td>
                    <td>{doDepto.length}</td>
                    <td>{formatarMoeda(arrecadado)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function somarCampos(relatorios: RelatorioMensal[], chaves: string[]): number {
  return relatorios.reduce((soma, r) => soma + chaves.reduce((s2, chave) => s2 + (r.valores[chave] ?? 0), 0), 0);
}

function ResumoCard({ titulo, valor, sub }: { titulo: string; valor: number | string; sub: string }) {
  return (
    <div className="card" style={{ padding: "1.1rem 1.2rem" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "var(--color-secondary)", margin: "0.15rem 0" }}>{valor}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>{sub}</div>
    </div>
  );
}
