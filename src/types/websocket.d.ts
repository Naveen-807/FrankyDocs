declare class WebSocket {
  constructor(url: string, protocols?: string | string[]);
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (...args: any[]) => void): void;
  removeEventListener(type: string, listener: (...args: any[]) => void): void;
  readyState: number;
}

