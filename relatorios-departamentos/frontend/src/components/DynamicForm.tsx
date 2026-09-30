import type { CampoFormulario, ItemLista, TipoDepartamento } from "../domain/types";
import { calcularRateio } from "../domain/rateio";
import { chavesRateioManual } from "../domain/departamentos";
import { chavesComputadas, novoIdItem } from "../domain/calculos";
import { formatarMoeda } from "../domain/utils";

interface DynamicFormProps {
  departamento: TipoDepartamento;
  /** já deve vir com os campos computados (listas/semanas) mesclados — ver domain/calculos.ts */
  valores: Record<string, number>;
  listas: Record<string, ItemLista[]>;
  semanas: Record<string, number>[];
  onChangeValor?: (chave: string, valor: number) => void;
  onChangeListas?: (listaId: string, itens: ItemLista[]) => void;
  onChangeSemanas?: (semanas: Record<string, number>[]) => void;
  somenteLeitura?: boolean;
}

const TITULO_GRUPO: Record<CampoFormulario["grupo"], string> = {
  contagem: "Cadastro / Contagem",
  acoes: "Ações",
  eventos: "Eventos",
  integracao: "Integração",
  financeiro: "Financeiro",
};

function agrupar(campos: CampoFormulario[]) {
  const grupos = new Map<CampoFormulario["grupo"], CampoFormulario[]>();
  for (const campo of campos) {
    const lista = grupos.get(campo.grupo) ?? [];
    lista.push(campo);
    grupos.set(campo.grupo, lista);
  }
  return grupos;
}

function Campo({
  campo,
  valor,
  onChange,
  somenteLeitura,
  computado,
}: {
  campo: CampoFormulario;
  valor: number;
  onChange?: (v: number) => void;
  somenteLeitura?: boolean;
  computado?: boolean;
}) {
  return (
    <div>
      <label htmlFor={campo.chave}>
        {campo.rotulo}
        {campo.comportamento === "estado" && !computado && (
          <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> · herdado do mês anterior</span>
        )}
        {computado && <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> · somado automaticamente</span>}
      </label>
      <div style={{ position: "relative" }}>
        {campo.tipo === "moeda" && (
          <span
            style={{
              position: "absolute",
              left: "0.65rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
              fontSize: "0.85rem",
              pointerEvents: "none",
            }}
          >
            R$
          </span>
        )}
        <input
          id={campo.chave}
          type="number"
          step={campo.tipo === "moeda" ? "0.01" : "1"}
          min={0}
          value={Number.isFinite(valor) ? valor : 0}
          disabled={somenteLeitura || computado}
          onChange={(e) => onChange?.(Number(e.target.value))}
          style={campo.tipo === "moeda" ? { paddingLeft: "1.9rem" } : undefined}
        />
      </div>
    </div>
  );
}

function ListaSomavel({
  titulo,
  rotuloColunaNome,
  rotuloColunaValor,
  unidade,
  itens,
  onChange,
  somenteLeitura,
  sugestoes,
}: {
  titulo: string;
  rotuloColunaNome: string;
  rotuloColunaValor: string;
  unidade: "moeda" | "numero";
  itens: ItemLista[];
  onChange?: (itens: ItemLista[]) => void;
  somenteLeitura?: boolean;
  sugestoes?: string[];
}) {
  const soma = itens.reduce((s, i) => s + (i.valor || 0), 0);

  function adicionar(nomeSugerido?: string) {
    onChange?.([...itens, { id: novoIdItem(), nome: nomeSugerido ?? "", valor: 0 }]);
  }
  function atualizar(id: string, patch: Partial<ItemLista>) {
    onChange?.(itens.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function remover(id: string) {
    onChange?.(itens.filter((i) => i.id !== id));
  }

  return (
    <div className="card grupo-bloco">
      <div className="grupo-bloco-cabecalho">
        <h3 style={{ margin: 0, fontSize: "1rem" }}>{titulo}</h3>
      </div>

      {itens.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: "0.8rem" }}>
          <table>
            <thead>
              <tr>
                <th>{rotuloColunaNome}</th>
                <th style={{ width: 160 }}>{rotuloColunaValor}</th>
                {!somenteLeitura && <th style={{ width: 40 }} />}
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input value={item.nome} disabled={somenteLeitura} onChange={(e) => atualizar(item.id, { nome: e.target.value })} placeholder="Nome" />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={unidade === "moeda" ? "0.01" : "1"}
                      min={0}
                      value={item.valor}
                      disabled={somenteLeitura}
                      onChange={(e) => atualizar(item.id, { valor: Number(e.target.value) })}
                    />
                  </td>
                  {!somenteLeitura && (
                    <td>
                      <button type="button" className="btn btn-ghost" onClick={() => remover(item.id)} aria-label="Remover">
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!somenteLeitura && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-outline" onClick={() => adicionar()}>
            + Adicionar
          </button>
          {sugestoes && sugestoes.length > 0 && (
            <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
              sugestões:{" "}
              {sugestoes.map((s, i) => (
                <span key={s}>
                  <button
                    type="button"
                    onClick={() => adicionar(s)}
                    style={{ border: "none", background: "none", color: "var(--color-secondary)", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: "0.78rem" }}
                  >
                    {s}
                  </button>
                  {i < sugestoes.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <p style={{ marginTop: "0.8rem", fontSize: "0.85rem" }}>
        Soma: <strong style={{ color: "var(--color-secondary)" }}>{unidade === "moeda" ? formatarMoeda(soma) : soma}</strong>
      </p>
    </div>
  );
}

const NOME_DOMINGO = ["1º Domingo", "2º Domingo", "3º Domingo", "4º Domingo", "5º Domingo"];

function DomingosDoMes({
  departamento,
  semanas,
  onChange,
  somenteLeitura,
}: {
  departamento: TipoDepartamento;
  semanas: Record<string, number>[];
  onChange?: (semanas: Record<string, number>[]) => void;
  somenteLeitura?: boolean;
}) {
  const chaves = departamento.chavesDetalheSemanal ?? [];
  if (chaves.length === 0) return null;
  const todosOsCampos = [...departamento.campos, ...departamento.camposFinanceiros];
  const colunas = chaves.map((chave) => todosOsCampos.find((c) => c.chave === chave)).filter((c): c is CampoFormulario => !!c);

  function atualizarCelula(indiceSemana: number, chave: string, valor: number) {
    const proximo = semanas.map((linha, i) => (i === indiceSemana ? { ...linha, [chave]: valor } : linha));
    onChange?.(proximo);
  }

  return (
    <div className="card grupo-bloco">
      <div className="grupo-bloco-cabecalho">
        <span className="tag-cor" style={{ background: departamento.corDestaque }} />
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Domingos do Mês</h3>
      </div>
      <p style={{ marginTop: 0, marginBottom: "0.8rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
        A {departamento.sigla} detalha semana a semana — os totais mensais dos campos abaixo são somados automaticamente a partir destas linhas.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Domingo</th>
              {colunas.map((c) => (
                <th key={c.chave}>{c.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOME_DOMINGO.map((nome, i) => (
              <tr key={nome}>
                <td style={{ fontWeight: 600 }}>{nome}</td>
                {colunas.map((c) => (
                  <td key={c.chave}>
                    <input
                      type="number"
                      step={c.tipo === "moeda" ? "0.01" : "1"}
                      min={0}
                      value={semanas[i]?.[c.chave] ?? 0}
                      disabled={somenteLeitura}
                      onChange={(e) => atualizarCelula(i, c.chave, Number(e.target.value))}
                      style={{ minWidth: 80 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DynamicForm({ departamento, valores, listas, semanas, onChangeValor, onChangeListas, onChangeSemanas, somenteLeitura }: DynamicFormProps) {
  const gruposContagemAcoes = agrupar(departamento.campos);
  const rateioManual = chavesRateioManual(departamento);
  const resultadoRateio = calcularRateio(departamento, valores);
  const computadas = chavesComputadas(departamento);

  const totalLocal = departamento.campos
    .filter((c) => c.somaTotalLocal)
    .reduce((soma, c) => soma + (valores[c.chave] ?? 0), 0);

  const totalIntegracao =
    (valores["integracao_conversao"] ?? 0) + (valores["integracao_reconciliacao"] ?? 0) + (valores["integracao_outra_igreja"] ?? 0);

  const set = (chave: string) => (v: number) => onChangeValor?.(chave, v);

  const ordemGrupos: CampoFormulario["grupo"][] = ["contagem", "acoes", "eventos", "integracao"];

  return (
    <div>
      <DomingosDoMes departamento={departamento} semanas={semanas} onChange={onChangeSemanas} somenteLeitura={somenteLeitura} />

      {ordemGrupos.map((grupo) => {
        const campos = gruposContagemAcoes.get(grupo);
        if (!campos || campos.length === 0) return null;
        return (
          <div className="card grupo-bloco" key={grupo}>
            <div className="grupo-bloco-cabecalho">
              <span className="tag-cor" style={{ background: departamento.corDestaque }} />
              <h3 style={{ margin: 0, fontSize: "1rem" }}>{TITULO_GRUPO[grupo]}</h3>
              {(grupo === "eventos" || grupo === "integracao") && (
                <span style={{ fontSize: "0.74rem", color: "var(--color-text-muted)", marginLeft: "auto" }}>
                  campo padronizado do sistema
                </span>
              )}
            </div>
            <div className="form-grid">
              {campos.map((campo) => (
                <Campo
                  key={campo.chave}
                  campo={campo}
                  valor={valores[campo.chave] ?? 0}
                  onChange={set(campo.chave)}
                  somenteLeitura={somenteLeitura}
                  computado={computadas.has(campo.chave)}
                />
              ))}
            </div>
            {grupo === "contagem" && totalLocal > 0 && (
              <p style={{ marginTop: "0.8rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Total do Local (calculado): <strong style={{ color: "var(--color-secondary)" }}>{totalLocal}</strong>
              </p>
            )}
            {grupo === "integracao" && (
              <p style={{ marginTop: "0.8rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Total de Integração (calculado): <strong style={{ color: "var(--color-secondary)" }}>{totalIntegracao}</strong>
              </p>
            )}
          </div>
        );
      })}

      {(departamento.listasDetalhadas ?? []).map((lista) => (
        <ListaSomavel
          key={lista.id}
          titulo={lista.titulo}
          rotuloColunaNome={lista.rotuloColunaNome}
          rotuloColunaValor={lista.rotuloColunaValor}
          unidade={lista.unidade}
          itens={listas[lista.id] ?? []}
          onChange={(itens) => onChangeListas?.(lista.id, itens)}
          somenteLeitura={somenteLeitura}
          sugestoes={lista.sugestoesDeNome}
        />
      ))}

      <div className="card grupo-bloco">
        <div className="grupo-bloco-cabecalho">
          <span className="tag-cor" style={{ background: departamento.corDestaque }} />
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{TITULO_GRUPO.financeiro}</h3>
        </div>
        <div className="form-grid">
          {departamento.camposFinanceiros.map((campo) => (
            <Campo
              key={campo.chave}
              campo={campo}
              valor={valores[campo.chave] ?? 0}
              onChange={set(campo.chave)}
              somenteLeitura={somenteLeitura}
              computado={computadas.has(campo.chave)}
            />
          ))}
        </div>

        <div className="aviso-caixa aviso-info" style={{ marginTop: "1rem" }}>
          <span>ℹ️</span>
          <span>
            <strong>Rateio deste departamento:</strong> {departamento.rateio.descricao}
          </span>
        </div>

        {rateioManual ? (
          <div className="form-grid" style={{ marginTop: "0.9rem" }}>
            <div>
              <label htmlFor={rateioManual.local}>Para o Local (R$)</label>
              <input
                id={rateioManual.local}
                type="number"
                step="0.01"
                min={0}
                value={valores[rateioManual.local] ?? 0}
                disabled={somenteLeitura}
                onChange={(e) => onChangeValor?.(rateioManual.local, Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={rateioManual.geral}>Para o Geral (R$)</label>
              <input
                id={rateioManual.geral}
                type="number"
                step="0.01"
                min={0}
                value={valores[rateioManual.geral] ?? 0}
                disabled={somenteLeitura}
                onChange={(e) => onChangeValor?.(rateioManual.geral, Number(e.target.value))}
              />
            </div>
          </div>
        ) : null}

        <div className="form-grid" style={{ marginTop: "0.9rem" }}>
          <ResumoValor rotulo="Valor Total" valor={resultadoRateio.valorTotal} />
          <ResumoValor rotulo="Para o Local" valor={resultadoRateio.paraLocal} />
          <ResumoValor rotulo="Para o Geral" valor={resultadoRateio.paraGeral} />
        </div>
      </div>
    </div>
  );
}

function ResumoValor({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <label>{rotulo}</label>
      <div
        style={{
          padding: "0.5rem 0.65rem",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          fontWeight: 700,
          color: "var(--color-secondary)",
        }}
      >
        {formatarMoeda(valor)}
      </div>
    </div>
  );
}
