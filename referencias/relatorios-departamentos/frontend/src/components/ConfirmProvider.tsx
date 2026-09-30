import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface PedidoConfirmacao {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  perigoso?: boolean;
  resolver: (ok: boolean) => void;
}

const ConfirmContext = createContext<((p: Omit<PedidoConfirmacao, "resolver">) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);

  const pedirConfirmacao = useCallback((p: Omit<PedidoConfirmacao, "resolver">) => {
    return new Promise<boolean>((resolve) => {
      setPedido({ ...p, resolver: resolve });
    });
  }, []);

  const responder = (ok: boolean) => {
    pedido?.resolver(ok);
    setPedido(null);
  };

  return (
    <ConfirmContext.Provider value={pedirConfirmacao}>
      {children}
      {pedido && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => responder(false)}>
          <div className="modal-caixa" onClick={(e) => e.stopPropagation()}>
            <h3>{pedido.titulo}</h3>
            <p>{pedido.mensagem}</p>
            <div className="modal-acoes">
              <button className="btn btn-outline" onClick={() => responder(false)}>
                Cancelar
              </button>
              <button
                className={pedido.perigoso ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => responder(true)}
              >
                {pedido.textoConfirmar ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de um ConfirmProvider");
  return ctx;
}
