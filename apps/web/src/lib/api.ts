export type NexaUser = { id: string; email: string; username: string };
import { useNexaStore } from "@/store/nexa-store";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1").replace(/\/$/, "");

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string | null,
): Promise<T> {
  const response = await sendRequest(path, options, accessToken);
  if (response.status === 401 && accessToken && path !== "/auth/refresh") {
    try {
      const refreshed = await refreshAccessToken();
      useNexaStore.getState().setAuth(refreshed.accessToken, refreshed.user);
      return sendRequest(path, options, refreshed.accessToken).then(parseResponse<T>);
    } catch {
      useNexaStore.getState().clearAuth();
    }
  }
  return parseResponse<T>(response);
}

async function sendRequest(path: string, options: RequestInit, accessToken?: string | null) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  return response;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message || `La solicitud falló (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function refreshAccessToken(): Promise<{ accessToken: string; user: NexaUser }> {
  return apiRequest("/auth/refresh", { method: "POST", body: JSON.stringify({}) });
}
