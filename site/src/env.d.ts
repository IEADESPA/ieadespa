/// <reference types="astro/client" />

interface Window {
  /**
   * Registra um setInterval que é encerrado sozinho antes de cada troca de
   * página do ClientRouter (ver script global em BaseLayout.astro) — evita
   * que o relógio do painel, a sincronização do check-in ou a rotação do
   * versículo continuem rodando escondidos depois que a pessoa navega pra
   * outra página.
   */
  ieadespaSetInterval: (handler: () => void, timeoutMs: number) => void;
  /** Uso interno de `ieadespaSetInterval` — não chame direto. */
  __ieadespaIntervalIds?: ReturnType<typeof setInterval>[];
}
