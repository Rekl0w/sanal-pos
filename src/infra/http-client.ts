import { HttpRequestError } from "../errors";

export interface HttpHeaders {
  [key: string]: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const buildSignal = (timeoutMs: number): AbortSignal => AbortSignal.timeout(timeoutMs);

const normalizeBody = (body: string | URLSearchParams): NonNullable<RequestInit["body"]> => body;

export class HttpClient {
  static async postForm(
    url: string,
    params: Record<string, string | number | boolean | undefined>,
    headers: HttpHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    const form = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        form.set(key, String(value));
      }
    }

    return this.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body: normalizeBody(form),
      signal: buildSignal(timeoutMs),
    });
  }

  static async postJson(
    url: string,
    body: unknown,
    headers: HttpHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    return this.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: buildSignal(timeoutMs),
    });
  }

  static async postRaw(
    url: string,
    body: string,
    headers: HttpHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<string> {
    return this.request(url, {
      method: "POST",
      headers,
      body,
      signal: buildSignal(timeoutMs),
    });
  }

  private static async request(url: string, init: RequestInit): Promise<string> {
    try {
      const response = await fetch(url, init);
      const text = await response.text();

      if (!response.ok) {
        throw new HttpRequestError(
          `HTTP ${response.status} ${response.statusText}`,
          url,
          response.status,
          text,
        );
      }

      return text;
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "HTTP isteği başarısız oldu";
      throw new HttpRequestError(message, url, 0);
    }
  }
}
