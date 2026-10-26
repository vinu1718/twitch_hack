import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const AUTH_FILE = path.join(process.cwd(), "data", "auth.json");
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HELIX_URL = "https://api.twitch.tv/helix/";
const EXPIRY_BUFFER_MS = 60_000;

export type AuthRecord = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  login: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type RefreshState = typeof globalThis & {
  __previouslyOnRefresh?: Promise<AuthRecord>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function twitchClientId(): string {
  return requiredEnv("TWITCH_CLIENT_ID");
}

export function twitchRedirectUri(): string {
  return requiredEnv("TWITCH_REDIRECT_URI");
}

function isAuthRecord(value: unknown): value is AuthRecord {
  if (!value || typeof value !== "object") return false;
  const auth = value as Partial<AuthRecord>;
  return (
    typeof auth.access_token === "string" &&
    typeof auth.refresh_token === "string" &&
    typeof auth.expires_at === "number" &&
    Number.isFinite(auth.expires_at) &&
    typeof auth.user_id === "string" &&
    typeof auth.login === "string"
  );
}

export async function readAuth(): Promise<AuthRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(AUTH_FILE, "utf8"));
    if (!isAuthRecord(parsed)) throw new Error("data/auth.json has an invalid shape");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveAuth(auth: AuthRecord): Promise<void> {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true, mode: 0o700 });
  const temporaryFile = `${AUTH_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, JSON.stringify(auth), { mode: 0o600, flag: "wx" });
    await rename(temporaryFile, AUTH_FILE);
    await chmod(AUTH_FILE, 0o600);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

async function requestTokens(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Twitch token request failed (HTTP ${response.status})`);

  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("Invalid Twitch token response");
  const token = body as Partial<TokenResponse>;
  if (
    typeof token.access_token !== "string" ||
    (token.refresh_token !== undefined && typeof token.refresh_token !== "string") ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  ) {
    throw new Error("Invalid Twitch token response");
  }
  return token as TokenResponse;
}

function tokenParams(grantType: string): URLSearchParams {
  return new URLSearchParams({
    client_id: twitchClientId(),
    client_secret: requiredEnv("TWITCH_CLIENT_SECRET"),
    grant_type: grantType,
  });
}

export async function exchangeCode(code: string): Promise<AuthRecord> {
  const params = tokenParams("authorization_code");
  params.set("code", code);
  params.set("redirect_uri", twitchRedirectUri());
  const token = await requestTokens(params);
  if (!token.refresh_token) throw new Error("Twitch did not return a refresh token");

  const response = await fetch(new URL("users", HELIX_URL), {
    headers: {
      "Client-Id": twitchClientId(),
      Authorization: `Bearer ${token.access_token}`,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Twitch user lookup failed (HTTP ${response.status})`);
  const body: unknown = await response.json();
  const users = (body as { data?: unknown } | null)?.data;
  const user = Array.isArray(users) ? users[0] : null;
  if (!user || typeof user.id !== "string" || typeof user.login !== "string") {
    throw new Error("Twitch user lookup returned no user");
  }

  const auth: AuthRecord = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
    user_id: user.id,
    login: user.login,
  };
  await saveAuth(auth);
  return auth;
}

async function performRefresh(rejectedToken?: string): Promise<AuthRecord> {
  const auth = await readAuth();
  if (!auth) throw new Error("Twitch is not connected");
  if (rejectedToken && auth.access_token !== rejectedToken) return auth;
  if (!auth.refresh_token) throw new Error("Twitch needs to be connected again");

  const params = tokenParams("refresh_token");
  params.set("refresh_token", auth.refresh_token);
  const token = await requestTokens(params);

  // A new login may have replaced auth.json while the refresh was in flight.
  const current = await readAuth();
  if (current && current.refresh_token !== auth.refresh_token) return current;

  const updated: AuthRecord = {
    ...auth,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? auth.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
  await saveAuth(updated);
  return updated;
}

async function refreshAccessToken(rejectedToken?: string): Promise<AuthRecord> {
  const state = globalThis as RefreshState;
  if (!state.__previouslyOnRefresh) {
    const pending = performRefresh(rejectedToken);
    state.__previouslyOnRefresh = pending;
    void pending.finally(() => {
      if (state.__previouslyOnRefresh === pending) state.__previouslyOnRefresh = undefined;
    }).catch(() => undefined);
  }
  return state.__previouslyOnRefresh;
}

export async function getAccessToken(forceRefresh = false, rejectedToken?: string): Promise<string> {
  const auth = await readAuth();
  if (!auth) throw new Error("Twitch is not connected");
  if (rejectedToken && auth.access_token !== rejectedToken) return auth.access_token;
  if (!forceRefresh && auth.expires_at > Date.now() + EXPIRY_BUFFER_MS) return auth.access_token;
  return (await refreshAccessToken(rejectedToken)).access_token;
}

export async function helix(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(pathOrUrl.replace(/^\//, ""), HELIX_URL);
  const clientId = twitchClientId();
  const request = (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("Client-Id", clientId);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(url, { ...init, headers, cache: "no-store" });
  };

  const accessToken = await getAccessToken();
  const response = await request(accessToken);
  if (response.status !== 401) return response;
  return request(await getAccessToken(true, accessToken));
}
