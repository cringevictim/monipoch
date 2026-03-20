import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { RedisQKillmailSchema, type RedisQKillmail } from '@monipoch/shared';

const STREAM_BASE = 'wss://killmail.stream/websocket';

export interface KillmailStreamOptions {
  queueId: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export interface KillmailStreamEvents {
  killmail: (km: RedisQKillmail) => void;
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (err: Error) => void;
}

/**
 * Persistent WebSocket connection to killmail.stream.
 * Auto-reconnects with exponential backoff.
 * Emits parsed, Zod-validated killmail events.
 */
export class KillmailStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private shouldRun = false;
  private queueId: string;

  constructor(options: KillmailStreamOptions) {
    super();
    this.queueId = options.queueId;
    this.reconnectDelay = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelayMs ?? 30000;
  }

  async start(): Promise<void> {
    this.shouldRun = true;
    this.connect();
  }

  stop(): void {
    this.shouldRun = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    const url = `${STREAM_BASE}/${this.queueId}`;
    let currentDelay = this.reconnectDelay;

    const attemptConnect = () => {
      if (!this.shouldRun) return;

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        currentDelay = this.reconnectDelay;
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const raw = data.toString();
          if (raw === 'ping' || raw === 'pong' || raw.length < 10) return;
          const json = JSON.parse(raw);
          const parsed = RedisQKillmailSchema.safeParse(json);
          if (parsed.success) {
            this.emit('killmail', parsed.data);
          } else {
            const keys = Object.keys(json).join(',');
            const hasKillId = 'killID' in json || 'killmail_id' in json;
            this.emit('error', new Error(
              `Schema validation failed (keys: ${keys}, hasKillId: ${hasKillId}): ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`
            ));
          }
        } catch {
          // Non-JSON messages (keepalives, etc)
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.emit('disconnected', reason.toString() || `code ${code}`);
        if (this.shouldRun) {
          setTimeout(() => attemptConnect(), currentDelay);
          currentDelay = Math.min(currentDelay * 2, this.maxReconnectDelay);
        }
      });

      this.ws.on('error', (err: Error) => {
        this.emit('error', err);
      });
    };

    attemptConnect();
  }
}
