import { useState } from "react";
import { useAuth } from "../state/auth";
import { useConfig, type NovoCampoInput } from "../state/config";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { ehSecretarioOuPresidente } from "../domain/permissoes";
import type { CampoFormulario, PerfilRateio, TipoDepartamento, TipoRateio } from "../domain/types";

const ROTULO_TIPO_RATEIO: Record<TipoRateio, string> = {
  integral_geral: "100% para o Geral",
  integral_local: "100% para o Local",
  mensalidade_fixa: "Mensalidade fixa (mensalidades sobem integrais)",
  percentual: "Percentual para o Geral",
  variavel_manual: "Variável / decidido manualmente a cada lançamento",
};

export function ConfiguracoesPage() {
  const { usuario } = useAuth();
  const { departamentos, atualizarDepartamento, atualizarRateio, adicionarCampo, editarCampo, removerCampo, adicionarDepartamento, restaurarPadrao } = useConfig();
  const pedirConfirmacao = useConfirm();
  const { notificar } = useToast();

  const [novoDep, setNovoDep] = useState({ sigla: "", nome: "", rotuloPapelLocal: "Líder Local", corDestaque: "#6b6559" });

  if (!usuario || !ehSecretarioOuPresidente(usuario)) {
    return (
      <div className="aviso-caixa aviso-info">
        <span>⚠️</span>
        <span>Esta área é exclusiva da Secretaria Geral / Presidência.</span>
      </div>
    );
  }

  async function handleRestaurar() {
    const ok = await pedirConfirmacao({
      titulo: "Restaurar configuração padrão",
      mensagem: "Isso descarta qualquer alteração feita nos departamentos, campos e rateios e volta ao padrão de fábrica. Deseja continuar?",
      textoConfirmar: "Restaurar",
      perigoso: true,
    });
    if (ok) {
      restaurarPadrao();
      notificar({ tipo: "info", titulo: "Configuração restaurada ao padrão" });
    }
  }

  function handleCriarDepartamento() {
    if (!novoDep.sigla.trim() || !novoDep.nome.trim()) {
      notificar({ tipo: "erro", titulo: "Preencha sigla e nome do novo departamento" });
      return;
    }
    adicionarDepartamento(novoDep);
    notificar({ tipo: "sucesso", titulo: "Departamento criado", mensagem: "Já pode configurar os campos dele abaixo." });
    setNovoDep({ sigla: "", nome: "", rotuloPapelLocal: "Líder Local", corDestaque: "#6b6559" });
  }

  return (
    <div>
      <div className="secao-titulo">
        <div>
          <h1>Configurações</h1>
          <p>Cadastre departamentos, campos de relatório e métodos de rateio — nada disso exige mexer em código.</p>
        </div>
        <button className="btn btn-outline" onClick={handleRestaurar}>
          Restaurar padrão de fábrica
        </button>
      </div>

      <div className="card grupo-bloco secao">
        <h3 style={{ fontSize: "1rem" }}>Novo departamento</h3>
        <div className="form-grid">
          <div>
            <label>Sigla</label>
            <input value={novoDep.sigla} onChange={(e) => setNovoDep((s) => ({ ...s, sigla: e.target.value }))} placeholder="ex.: UMPADESPA" />
          </div>
          <div>
            <label>Nome</label>
            <input value={novoDep.nome} onChange={(e) => setNovoDep((s) => ({ ...s, nome: e.target.value }))} placeholder="ex.: União de Pequenos Grupos" />
          </div>
          <div>
            <label>Rótulo do responsável local</label>
            <input value={novoDep.rotuloPapelLocal} onChange={(e) => setNovoDep((s) => ({ ...s, rotuloPapelLocal: e.target.value }))} />
          </div>
          <div>
            <label>Cor de destaque</label>
            <input type="color" value={novoDep.corDestaque} onChange={(e) => setNovoDep((s) => ({ ...s, corDestaque: e.target.value }))} style={{ height: 38, padding: "0.2rem" }} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: "0.9rem" }} onClick={handleCriarDepartamento}>
          + Criar departamento
        </button>
        <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.6rem", marginBottom: 0 }}>
          Ele já nasce com os campos padronizados de Eventos e Integração e uma oferta financeira simples — depois é só
          ajustar abaixo.
        </p>
      </div>

      {departamentos.map((dep) => (
        <EditorDepartamento
          key={dep.id}
          departamento={dep}
          onAtualizarDepartamento={(patch) => atualizarDepartamento(dep.id, patch)}
          onAtualizarRateio={(rateio) => atualizarRateio(dep.id, rateio)}
          onAdicionarCampo={(grupo, campo) => adicionarCampo(dep.id, grupo, campo)}
          onEditarCampo={(chave, patch) => editarCampo(dep.id, chave, patch)}
          onRemoverCampo={(chave) => removerCampo(dep.id, chave)}
        />
      ))}
    </div>
  );
}

function EditorDepartamento({
  departamento,
  onAtualizarDepartamento,
  onAtualizarRateio,
  onAdicionarCampo,
  onEditarCampo,
  onRemoverCampo,
}: {
  departamento: TipoDepartamento;
  onAtualizarDepartamento: (patch: Partial<Pick<TipoDepartamento, "nome" | "sigla" | "rotuloPapelLocal" | "corDestaque">>) => void;
  onAtualizarRateio: (rateio: PerfilRateio) => void;
  onAdicionarCampo: (grupo: "contagem" | "acoes" | "financeiro", campo: NovoCampoInput) => void;
  onEditarCampo: (chave: string, patch: Partial<Pick<CampoFormulario, "rotulo" | "tipo" | "comportamento" | "somaTotalLocal">>) => void;
  onRemoverCampo: (chave: string) => void;
}) {
  const camposContagem = departamento.campos.filter((c) => c.grupo === "contagem");
  const camposAcoes = departamento.campos.filter((c) => c.grupo === "acoes");
  const camposPadrao = departamento.campos.filter((c) => c.padraoDoSistema);

  return (
    <details className="card secao" style={{ padding: "1.1rem 1.3rem" }} open={false}>
      <summary style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 700 }}>
        <span className="tag-cor" style={{ background: departamento.corDestaque, width: 12, height: 12, borderRadius: 3, display: "inline-block" }} />
        {departamento.numero} — {departamento.sigla}
        <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>{departamento.nome}</span>
      </summary>

      <div style={{ marginTop: "1.1rem" }}>
        <h4 style={{ fontSize: "0.9rem" }}>Dados gerais</h4>
        <div className="form-grid">
          <div>
            <label>Sigla</label>
            <input value={departamento.sigla} onChange={(e) => onAtualizarDepartamento({ sigla: e.target.value })} />
          </div>
          <div>
            <label>Nome</label>
            <input value={departamento.nome} onChange={(e) => onAtualizarDepartamento({ nome: e.target.value })} />
          </div>
          <div>
            <label>Rótulo do responsável local</label>
            <input value={departamento.rotuloPapelLocal} onChange={(e) => onAtualizarDepartamento({ rotuloPapelLocal: e.target.value })} />
          </div>
          <div>
            <label>Cor de destaque</label>
            <input type="color" value={departamento.corDestaque} onChange={(e) => onAtualizarDepartamento({ corDestaque: e.target.value })} style={{ height: 38, padding: "0.2rem" }} />
          </div>
        </div>

        <h4 style={{ fontSize: "0.9rem", marginTop: "1.3rem" }}>Rateio</h4>
        <EditorRateio rateio={departamento.rateio} onChange={onAtualizarRateio} />

        <h4 style={{ fontSize: "0.9rem", marginTop: "1.3rem" }}>Campos de Cadastro/Contagem</h4>
        <TabelaCampos campos={camposContagem} onEditar={onEditarCampo} onRemover={onRemoverCampo} />
        <FormularioNovoCampo onAdicionar={(c) => onAdicionarCampo("contagem", c)} permiteTotalLocal />

        <h4 style={{ fontSize: "0.9rem", marginTop: "1.3rem" }}>Campos de Ações</h4>
        <TabelaCampos campos={camposAcoes} onEditar={onEditarCampo} onRemover={onRemoverCampo} />
        <FormularioNovoCampo onAdicionar={(c) => onAdicionarCampo("acoes", c)} />

        <h4 style={{ fontSize: "0.9rem", marginTop: "1.3rem" }}>Campos Financeiros</h4>
        <TabelaCampos campos={departamento.camposFinanceiros} onEditar={onEditarCampo} onRemover={onRemoverCampo} />
        <FormularioNovoCampo onAdicionar={(c) => onAdicionarCampo("financeiro", c)} apenasMoeda />

        <h4 style={{ fontSize: "0.9rem", marginTop: "1.3rem" }}>Eventos e Integração</h4>
        <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
          Campos padronizados do sistema, iguais em todos os departamentos, para poder consolidar Eventos e Integração no
          campo inteiro — {camposPadrao.map((c) => c.rotulo).join(", ")}. Não são editáveis por aqui.
        </p>

        {(departamento.listasDetalhadas?.length || departamento.chavesDetalheSemanal?.length) ? (
          <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
            Este departamento também usa {departamento.listasDetalhadas?.length ? "lista(s) nominal(is) detalhada(s)" : ""}
            {departamento.listasDetalhadas?.length && departamento.chavesDetalheSemanal?.length ? " e " : ""}
            {departamento.chavesDetalheSemanal?.length ? "detalhamento semanal" : ""} — configuração avançada, ainda não
            editável por esta tela.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function EditorRateio({ rateio, onChange }: { rateio: PerfilRateio; onChange: (r: PerfilRateio) => void }) {
  return (
    <div className="form-grid">
      <div>
        <label>Método</label>
        <select value={rateio.tipo} onChange={(e) => onChange({ ...rateio, tipo: e.target.value as TipoRateio })}>
          {(Object.keys(ROTULO_TIPO_RATEIO) as TipoRateio[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_RATEIO[t]}
            </option>
          ))}
        </select>
      </div>
      {rateio.tipo === "percentual" && (
        <div>
          <label>% para o Geral</label>
          <input type="number" min={0} max={100} value={rateio.percentualGeral ?? 0} onChange={(e) => onChange({ ...rateio, percentualGeral: Number(e.target.value) })} />
        </div>
      )}
      <div>
        <label>Modo de entrada</label>
        <select value={rateio.modoEntrada} onChange={(e) => onChange({ ...rateio, modoEntrada: e.target.value as PerfilRateio["modoEntrada"] })}>
          <option value="bruto_calculado">Sistema calcula a partir do valor bruto</option>
          <option value="liquido_manual">Quem preenche já lança o valor líquido</option>
        </select>
      </div>
      <div>
        <label>Suporte para Secretaria Geral</label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={rateio.suporteSecretariaGeralHabilitado}
            onChange={(e) => onChange({ ...rateio, suporteSecretariaGeralHabilitado: e.target.checked })}
          />
          Facultativo — habilitado para este departamento
        </label>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label>Descrição (mostrada para quem preenche o relatório)</label>
        <textarea rows={2} value={rateio.descricao} onChange={(e) => onChange({ ...rateio, descricao: e.target.value })} />
      </div>
    </div>
  );
}

function TabelaCampos({
  campos,
  onEditar,
  onRemover,
}: {
  campos: CampoFormulario[];
  onEditar: (chave: string, patch: Partial<Pick<CampoFormulario, "rotulo" | "tipo" | "comportamento" | "somaTotalLocal">>) => void;
  onRemover: (chave: string) => void;
}) {
  if (campos.length === 0) return <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>Nenhum campo cadastrado ainda.</p>;
  return (
    <div style={{ overflowX: "auto", marginBottom: "0.6rem" }}>
      <table>
        <thead>
          <tr>
            <th>Rótulo</th>
            <th>Tipo</th>
            <th>Comportamento</th>
            <th>Soma Total Local</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campos.map((campo) => (
            <tr key={campo.chave}>
              <td>
                <input value={campo.rotulo} onChange={(e) => onEditar(campo.chave, { rotulo: e.target.value })} />
              </td>
              <td>
                <select value={campo.tipo} onChange={(e) => onEditar(campo.chave, { tipo: e.target.value as CampoFormulario["tipo"] })}>
                  <option value="numero">Número</option>
                  <option value="moeda">Moeda</option>
                </select>
              </td>
              <td>
                <select value={campo.comportamento} onChange={(e) => onEditar(campo.chave, { comportamento: e.target.value as CampoFormulario["comportamento"] })}>
                  <option value="fluxo">Fluxo (zera todo mês)</option>
                  <option value="estado">Estado (herda do mês anterior)</option>
                </select>
              </td>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={!!campo.somaTotalLocal} onChange={(e) => onEditar(campo.chave, { somaTotalLocal: e.target.checked })} />
              </td>
              <td>
                <button className="btn btn-ghost" onClick={() => onRemover(campo.chave)} aria-label="Remover campo">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormularioNovoCampo({
  onAdicionar,
  permiteTotalLocal,
  apenasMoeda,
}: {
  onAdicionar: (campo: NovoCampoInput) => void;
  permiteTotalLocal?: boolean;
  apenasMoeda?: boolean;
}) {
  const [rotulo, setRotulo] = useState("");
  const [tipo, setTipo] = useState<CampoFormulario["tipo"]>(apenasMoeda ? "moeda" : "numero");
  const [comportamento, setComportamento] = useState<CampoFormulario["comportamento"]>("fluxo");
  const [somaTotalLocal, setSomaTotalLocal] = useState(false);

  function adicionar() {
    if (!rotulo.trim()) return;
    onAdicionar({ rotulo, tipo, comportamento, somaTotalLocal: permiteTotalLocal ? somaTotalLocal : undefined });
    setRotulo("");
    setSomaTotalLocal(false);
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
      <div style={{ flex: "1 1 200px" }}>
        <label>Novo campo — rótulo</label>
        <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="ex.: Entrega de Folhetos" />
      </div>
      {!apenasMoeda && (
        <div>
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as CampoFormulario["tipo"])}>
            <option value="numero">Número</option>
            <option value="moeda">Moeda</option>
          </select>
        </div>
      )}
      <div>
        <label>Comportamento</label>
        <select value={comportamento} onChange={(e) => setComportamento(e.target.value as CampoFormulario["comportamento"])}>
          <option value="fluxo">Fluxo</option>
          <option value="estado">Estado</option>
        </select>
      </div>
      {permiteTotalLocal && (
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400, marginBottom: "0.5rem" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={somaTotalLocal} onChange={(e) => setSomaTotalLocal(e.target.checked)} />
          soma no Total do Local
        </label>
      )}
      <button className="btn btn-outline" onClick={adicionar}>
        + Adicionar campo
      </button>
    </div>
  );
}
