const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}
