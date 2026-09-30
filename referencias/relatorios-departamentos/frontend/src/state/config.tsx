import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEPARTAMENTOS_SEED, gerarChaveCampo, gerarIdDepartamento } from "../domain/departamentos";
import type { CampoFormulario, GrupoCampo, PerfilRateio, TipoDepartamento } from "../domain/types";

const CHAVE_STORAGE = "relatorios-departamentos:config:v1";

function carregarInicial(): TipoDepartamento[] {
  try {
    const bruto = window.localStorage.getItem(CHAVE_STORAGE);
    if (bruto) return JSON.parse(bruto) as TipoDepartamento[];
  } catch {
    // segue para o padrão de fábrica
  }
  return DEPARTAMENTOS_SEED;
}

function persistir(departamentos: TipoDepartamento[]) {
  try {
    window.localStorage.setItem(CHAVE_STORAGE, JSON.stringify(departamentos));
  } catch {
    // ambiente sem localStorage — segue só em memória
  }
}

export interface NovoCampoInput {
  rotulo: string;
  tipo: CampoFormulario["tipo"];
  comportamento: CampoFormulario["comportamento"];
  somaTotalLocal?: boolean;
}

interface ConfigContextValue {
  departamentos: TipoDepartamento[];
  atualizarDepartamento: (id: string, patch: Partial<Pick<TipoDepartamento, "nome" | "sigla" | "rotuloPapelLocal" | "corDestaque">>) => void;
  atualizarRateio: (id: string, rateio: PerfilRateio) => void;
  adicionarCampo: (depId: string, grupo: Extract<GrupoCampo, "contagem" | "acoes" | "financeiro">, campo: NovoCampoInput) => void;
  editarCampo: (depId: string, chave: string, patch: Partial<Pick<CampoFormulario, "rotulo" | "tipo" | "comportamento" | "somaTotalLocal">>) => void;
  removerCampo: (depId: string, chave: string) => void;
  adicionarDepartamento: (input: { sigla: string; nome: string; rotuloPapelLocal: string; corDestaque: string }) => string;
  restaurarPadrao: () => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [departamentos, setDepartamentos] = useState<TipoDepartamento[]>(() => carregarInicial());

  const atualizar = useCallback((updater: (atual: TipoDepartamento[]) => TipoDepartamento[]) => {
    setDepartamentos((atual) => {
      const proximo = updater(atual);
      persistir(proximo);
      return proximo;
    });
  }, []);

  const atualizarDepartamento = useCallback<ConfigContextValue["atualizarDepartamento"]>(
    (id, patch) => {
      atualizar((atual) => atual.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    },
    [atualizar],
  );

  const atualizarRateio = useCallback<ConfigContextValue["atualizarRateio"]>(
    (id, rateio) => {
      atualizar((atual) => atual.map((d) => (d.id === id ? { ...d, rateio } : d)));
    },
    [atualizar],
  );

  const adicionarCampo = useCallback<ConfigContextValue["adicionarCampo"]>(
    (depId, grupo, campo) => {
      atualizar((atual) =>
        atual.map((d) => {
          if (d.id !== depId) return d;
          const chave = `${grupo === "financeiro" ? "fin_" : ""}${gerarChaveCampo(campo.rotulo)}`;
          const novoCampo: CampoFormulario = { chave, rotulo: campo.rotulo, grupo, tipo: campo.tipo, comportamento: campo.comportamento, somaTotalLocal: campo.somaTotalLocal };
          if (grupo === "financeiro") {
            return { ...d, camposFinanceiros: [...d.camposFinanceiros, novoCampo] };
          }
          return { ...d, campos: [...d.campos, novoCampo] };
        }),
      );
    },
    [atualizar],
  );

  const editarCampo = useCallback<ConfigContextValue["editarCampo"]>(
    (depId, chave, patch) => {
      atualizar((atual) =>
        atual.map((d) => {
          if (d.id !== depId) return d;
          const aplicar = (lista: CampoFormulario[]) => lista.map((c) => (c.chave === chave ? { ...c, ...patch } : c));
          return { ...d, campos: aplicar(d.campos), camposFinanceiros: aplicar(d.camposFinanceiros) };
        }),
      );
    },
    [atualizar],
  );

  const removerCampo = useCallback<ConfigContextValue["removerCampo"]>(
    (depId, chave) => {
      atualizar((atual) =>
        atual.map((d) => {
          if (d.id !== depId) return d;
          return {
            ...d,
            campos: d.campos.filter((c) => c.chave !== chave),
            camposFinanceiros: d.camposFinanceiros.filter((c) => c.chave !== chave),
          };
        }),
      );
    },
    [atualizar],
  );

  const adicionarDepartamento = useCallback<ConfigContextValue["adicionarDepartamento"]>(
    (input) => {
      let id = "";
      atualizar((atual) => {
        const base = gerarIdDepartamento(input.sigla);
        id = atual.some((d) => d.id === base) ? `${base}_${atual.length + 1}` : base;
        const proximoNumero = String(atual.length + 1).padStart(2, "0");
        const novo: TipoDepartamento = {
          id,
          numero: proximoNumero,
          sigla: input.sigla,
          nome: input.nome,
          rotuloPapelLocal: input.rotuloPapelLocal || "Líder Local",
          corDestaque: input.corDestaque || "#6b6559",
          campos: [
            ...eventosECopiadosDe(atual),
            ...integracaoCopiadaDe(atual),
          ],
          camposFinanceiros: [{ chave: "fin_ofertas", rotulo: "Ofertas", grupo: "financeiro", tipo: "moeda", comportamento: "fluxo" }],
          rateio: {
            tipo: "integral_local",
            modoEntrada: "bruto_calculado",
            suporteSecretariaGeralHabilitado: false,
            descricao: "100% do valor arrecadado fica na congregação local (padrão inicial — ajuste conforme necessário).",
          },
        };
        return [...atual, novo];
      });
      return id;
    },
    [atualizar],
  );

  const restaurarPadrao = useCallback(() => {
    persistir(DEPARTAMENTOS_SEED);
    setDepartamentos(DEPARTAMENTOS_SEED);
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({
      departamentos,
      atualizarDepartamento,
      atualizarRateio,
      adicionarCampo,
      editarCampo,
      removerCampo,
      adicionarDepartamento,
      restaurarPadrao,
    }),
    [departamentos, atualizarDepartamento, atualizarRateio, adicionarCampo, editarCampo, removerCampo, adicionarDepartamento, restaurarPadrao],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

function eventosECopiadosDe(atual: TipoDepartamento[]): CampoFormulario[] {
  return atual[0]?.campos.filter((c) => c.grupo === "eventos") ?? [];
}
function integracaoCopiadaDe(atual: TipoDepartamento[]): CampoFormulario[] {
  return atual[0]?.campos.filter((c) => c.grupo === "integracao") ?? [];
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig precisa estar dentro de um ConfigProvider");
  return ctx;
}
