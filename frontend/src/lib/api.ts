const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function getToken(): string | null {
  return localStorage.getItem("hsi_token");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("hsi_token", token);
  else localStorage.removeItem("hsi_token");
}

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

/**
 * Upload a file via multipart/form-data and unwrap the server's standard
 * ApiResponse envelope. Adds the bearer token automatically; lets the
 * browser set the Content-Type (with the multipart boundary) by leaving
 * the header off.
 *
 * `extra` is appended to the FormData alongside the file — useful for
 * passing things like { accountId, dealId } to the import endpoints.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  fieldName = "file",
  extra: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Upload failed (${res.status})`);
  }
  return json.data as T;
}

/**
 * Download a binary file from the API (auth included) and trigger a browser save.
 * Filename is taken from the server's Content-Disposition header when present,
 * otherwise falls back to `suggestedName`.
 */
export async function downloadFile(path: string, suggestedName: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  // Prefer the RFC 5987 `filename*=UTF-8''...` form when present — that's
  // the one carrying Vietnamese diacritics. Fall back to the plain
  // `filename="..."` (ASCII), then the suggested name.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const ascii = /filename="([^"]+)"/.exec(disposition);
  const filename = utf8
    ? decodeURIComponent(utf8[1])
    : (ascii?.[1] ?? suggestedName);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
