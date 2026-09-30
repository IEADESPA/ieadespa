import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AREAS, CONGREGACOES, RELATORIOS_SEED } from "../domain/seed";
import { chavesRateioManual, getDepartamento } from "../domain/departamentos";
import { listasVazias, semanasVazias } from "../domain/calculos";
import { useConfig } from "./config";
import type { EventoHistorico, PerfilNome, RelatorioMensal, StatusRelatorio, Usuario } from "../domain/types";

const CHAVE_STORAGE = "relatorios-departamentos:v1";

function carregarInicial(): RelatorioMensal[] {
  try {
    const bruto = window.localStorage.getItem(CHAVE_STORAGE);
    if (bruto) return JSON.parse(bruto) as RelatorioMensal[];
  } catch {
    // localStorage indisponível ou dado corrompido — cai para o seed
  }
  return RELATORIOS_SEED;
}

function persistir(relatorios: RelatorioMensal[]) {
  try {
    window.localStorage.setItem(CHAVE_STORAGE, JSON.stringify(relatorios));
  } catch {
    // ambiente sem localStorage (ex.: navegação privada bloqueando) — segue só em memória
  }
}

function novoEvento(usuario: Usuario, papel: PerfilNome, acao: string, detalhe?: string): EventoHistorico {
  return { ts: Date.now(), usuarioNome: usuario.nome, papel, acao, detalhe };
}

export interface PatchRelatorio {
  valores?: Record<string, number>;
  listas?: Record<string, RelatorioMensal["listas"][string]>;
  semanas?: Record<string, number>[];
}

interface DbContextValue {
  relatorios: RelatorioMensal[];
  areas: typeof AREAS;
  congregacoes: typeof CONGREGACOES;
  obterOuCriarRelatorio: (tipoDepartamentoId: string, congregacaoId: string, mes: number, ano: number) => RelatorioMensal;
  salvar: (relatorio: RelatorioMensal, patch: PatchRelatorio) => void;
  /** Muda o status do relatório (e opcionalmente aplica correções de valores no mesmo passo —
   *  é assim que Líder Geral/Secretário Geral/Presidente conseguem editar e aprovar de uma vez,
   *  inclusive pulando etapas intermediárias que ninguém ainda tenha feito). */
  mudarStatus: (
    relatorio: RelatorioMensal,
    novoStatus: StatusRelatorio,
    usuario: Usuario,
    papel: PerfilNome,
    opts?: PatchRelatorio & { comentario?: string; pulouEtapaArea?: boolean },
  ) => void;
  comentar: (relatorioId: string, usuario: Usuario, papel: PerfilNome, comentario: string) => void;
  restaurarDemo: () => void;
}

const DbContext = createContext<DbContextValue | null>(null);

const ROTULO_STATUS: Record<StatusRelatorio, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado_area: "Aprovado (área)",
  aprovado_geral: "Aprovado em definitivo (geral)",
};

export function DbProvider({ children }: { children: ReactNode }) {
  const { departamentos } = useConfig();
  const [relatorios, setRelatorios] = useState<RelatorioMensal[]>(() => carregarInicial());

  const atualizar = useCallback((updater: (atual: RelatorioMensal[]) => RelatorioMensal[]) => {
    setRelatorios((atual) => {
      const proximo = updater(atual);
      persistir(proximo);
      return proximo;
    });
  }, []);

  const substituirOuAdicionar = (atual: RelatorioMensal[], relatorio: RelatorioMensal) => {
    const existe = atual.some((r) => r.id === relatorio.id);
    return existe ? atual.map((r) => (r.id === relatorio.id ? relatorio : r)) : [...atual, relatorio];
  };

  const obterOuCriarRelatorio = useCallback(
    (tipoDepartamentoId: string, congregacaoId: string, mes: number, ano: number): RelatorioMensal => {
      const existente = relatorios.find(
        (r) =>
          r.tipoDepartamentoId === tipoDepartamentoId &&
          r.congregacaoId === congregacaoId &&
          r.mesReferencia === mes &&
          r.anoReferencia === ano,
      );
      if (existente) return existente;

      // pré-preenchimento: pega os campos "estado" do último relatório enviado deste depto/congregação
      const anteriores = relatorios
        .filter((r) => r.tipoDepartamentoId === tipoDepartamentoId && r.congregacaoId === congregacaoId)
        .sort((a, b) => b.anoReferencia * 100 + b.mesReferencia - (a.anoReferencia * 100 + a.mesReferencia));
      const ultimo = anteriores[0];

      const dep = getDepartamento(departamentos, tipoDepartamentoId);
      const valoresIniciais: Record<string, number> = {};
      for (const campo of [...dep.campos, ...dep.camposFinanceiros]) {
        valoresIniciais[campo.chave] = campo.comportamento === "estado" ? (ultimo?.valores[campo.chave] ?? 0) : 0;
      }
      const rateioManual = chavesRateioManual(dep);
      if (rateioManual) {
        valoresIniciais[rateioManual.local] = 0;
        valoresIniciais[rateioManual.geral] = 0;
      }

      return {
        id: `rel-${tipoDepartamentoId}__${congregacaoId}__${ano}${String(mes).padStart(2, "0")}`,
        tipoDepartamentoId,
        congregacaoId,
        mesReferencia: mes,
        anoReferencia: ano,
        status: "rascunho",
        atrasado: false,
        valores: valoresIniciais,
        listas: listasVazias(dep),
        semanas: semanasVazias(dep),
        historico: [],
      };
    },
    [relatorios, departamentos],
  );

  const salvar = useCallback(
    (relatorio: RelatorioMensal, patch: PatchRelatorio) => {
      atualizar((atual) => substituirOuAdicionar(atual, { ...relatorio, ...patch }));
    },
    [atualizar],
  );

  const mudarStatus = useCallback<DbContextValue["mudarStatus"]>(
    (relatorio, novoStatus, usuario, papel, opts) => {
      const diaDoMes = new Date().getDate();
      const pulou = opts?.pulouEtapaArea ? " (aprovação direta, sem passar pela etapa de área)" : "";
      const acao = `${ROTULO_STATUS[novoStatus]}${pulou}`;
      const atualizado: RelatorioMensal = {
        ...relatorio,
        ...(opts?.valores ? { valores: opts.valores } : {}),
        ...(opts?.listas ? { listas: opts.listas } : {}),
        ...(opts?.semanas ? { semanas: opts.semanas } : {}),
        status: novoStatus,
        dataEnvio: relatorio.dataEnvio ?? Date.now(),
        atrasado: relatorio.status === "rascunho" ? diaDoMes > 10 : relatorio.atrasado,
        comentarioArea: opts?.comentario ?? relatorio.comentarioArea,
        historico: [...relatorio.historico, novoEvento(usuario, papel, acao, opts?.comentario)],
      };
      atualizar((atual) => substituirOuAdicionar(atual, atualizado));
    },
    [atualizar],
  );

  const comentar = useCallback<DbContextValue["comentar"]>(
    (relatorioId, usuario, papel, comentario) => {
      atualizar((atual) =>
        atual.map((r) =>
          r.id === relatorioId
            ? { ...r, comentarioArea: comentario, historico: [...r.historico, novoEvento(usuario, papel, "Comentou", comentario)] }
            : r,
        ),
      );
    },
    [atualizar],
  );

  const restaurarDemo = useCallback(() => {
    persistir(RELATORIOS_SEED);
    setRelatorios(RELATORIOS_SEED);
  }, []);

  const value = useMemo<DbContextValue>(
    () => ({
      relatorios,
      areas: AREAS,
      congregacoes: CONGREGACOES,
      obterOuCriarRelatorio,
      salvar,
      mudarStatus,
      comentar,
      restaurarDemo,
    }),
    [relatorios, obterOuCriarRelatorio, salvar, mudarStatus, comentar, restaurarDemo],
  );

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb precisa estar dentro de um DbProvider");
  return ctx;
}
