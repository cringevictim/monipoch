import { z } from 'zod';

const ESI_BASE = 'https://esi.evetech.net/latest';

export interface ESIRequestOptions {
  token?: string;
  etag?: string;
  params?: Record<string, string | number>;
}

export interface ESIResponse<T> {
  data: T;
  etag?: string;
  expires?: string;
  cached: boolean;
}

export class ESIClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string,
  ) {
    super(message);
    this.name = 'ESIClientError';
  }
}

export class ESIRateLimitError extends ESIClientError {
  retryAfterMs: number;
  constructor(endpoint: string, statusCode = 420, retryAfterMs = 60_000) {
    super('ESI rate limit reached', statusCode, endpoint);
    this.name = 'ESIRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Low-level ESI HTTP client with built-in rate limit awareness.
 * Handles 429/420 with Retry-After and auto-retry.
 */
export class ESIClient {
  private userAgent: string;
  private maxRetries: number;

  constructor(userAgent: string, maxRetries = 2) {
    this.userAgent = userAgent;
    this.maxRetries = maxRetries;
  }

  private parseRetryAfter(response: Response): number {
    const header = response.headers.get('Retry-After');
    if (header) {
      const seconds = parseInt(header, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
    return 60_000;
  }

  private isRateLimited(status: number): boolean {
    return status === 429 || status === 420;
  }

  async get<T>(
    path: string,
    schema: z.ZodType<T>,
    options: ESIRequestOptions = {},
  ): Promise<ESIResponse<T>> {
    const url = new URL(`${ESI_BASE}${path}`);
    url.searchParams.set('datasource', 'tranquility');

    if (options.params) {
      for (const [key, val] of Object.entries(options.params)) {
        url.searchParams.set(key, String(val));
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await fetch(url.toString(), { headers });

      if (response.status === 304) {
        return { data: undefined as unknown as T, cached: true, etag: options.etag };
      }

      if (this.isRateLimited(response.status)) {
        const waitMs = this.parseRetryAfter(response);
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new ESIRateLimitError(path, response.status, waitMs);
      }

      if (!response.ok) {
        const body = await response.text();
        throw new ESIClientError(
          `ESI ${path} returned ${response.status}: ${body}`,
          response.status,
          path,
        );
      }

      const json = await response.json();
      const data = schema.parse(json);

      return {
        data,
        etag: response.headers.get('etag') ?? undefined,
        expires: response.headers.get('expires') ?? undefined,
        cached: false,
      };
    }

    throw new ESIRateLimitError(path);
  }

  async post<TBody, TResponse>(
    path: string,
    body: TBody,
    schema: z.ZodType<TResponse>,
    options: ESIRequestOptions = {},
  ): Promise<ESIResponse<TResponse>> {
    const url = new URL(`${ESI_BASE}${path}`);
    url.searchParams.set('datasource', 'tranquility');

    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (this.isRateLimited(response.status)) {
        const waitMs = this.parseRetryAfter(response);
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new ESIRateLimitError(path, response.status, waitMs);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new ESIClientError(
          `ESI POST ${path} returned ${response.status}: ${text}`,
          response.status,
          path,
        );
      }

      const json = await response.json();
      const data = schema.parse(json);

      return {
        data,
        etag: response.headers.get('etag') ?? undefined,
        expires: response.headers.get('expires') ?? undefined,
        cached: false,
      };
    }

    throw new ESIRateLimitError(path);
  }
}
