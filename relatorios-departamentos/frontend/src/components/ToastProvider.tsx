import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastTipo = "sucesso" | "erro" | "info";

interface Toast {
  id: number;
  tipo: ToastTipo;
  titulo: string;
  mensagem?: string;
}

interface ToastContextValue {
  notificar: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONE: Record<ToastTipo, string> = {
  sucesso: "✓",
  erro: "!",
  info: "i",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(1);

  const notificar = useCallback((toast: Omit<Toast, "id">) => {
    const id = proximoId.current++;
    setToasts((atual) => [...atual, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((atual) => atual.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const fechar = (id: number) => setToasts((atual) => atual.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ notificar }}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`} role="status">
            <span className={`toast-icone toast-icone-${t.tipo}`}>{ICONE[t.tipo]}</span>
            <div className="toast-corpo">
              <strong>{t.titulo}</strong>
              {t.mensagem && <p>{t.mensagem}</p>}
            </div>
            <button className="toast-fechar" onClick={() => fechar(t.id)} aria-label="Fechar aviso">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de um ToastProvider");
  return ctx;
}
