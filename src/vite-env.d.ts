/// <reference types="vite/client" />

// PWA virtual module
declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): () => void;
}

// html2canvas
declare module 'html2canvas' {
  export default function html2canvas(
    element: HTMLElement,
    options?: Record<string, unknown>
  ): Promise<HTMLCanvasElement>;
}

// jspdf
declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: Record<string, unknown>);
    addImage(...args: unknown[]): void;
    save(filename?: string): void;
    internal: Record<string, unknown>;
    [key: string]: unknown;
  }
  export default jsPDF;
}
