const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type Usuario = { id: number; name: string; email: string; role: "admin" | "atendente" };

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
}
