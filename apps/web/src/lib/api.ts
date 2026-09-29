import type { DiscoveredItem, Goal, Opportunity, Task, WallToday, WatchCompany } from "../types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class AuthError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("fw-session") ?? (import.meta.env.VITE_APP_TOKEN as string | undefined) ?? "";
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-App-Token": token, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch { /* non-JSON error body */ }
    if (res.status === 401) throw new AuthError(detail);
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/* ---- login gate ---- */
export async function login(password: string): Promise<void> {
  const data = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  localStorage.setItem("fw-session", data.token);
}

/* ---- task normalization: backend vocab in, frontend vocab out, ONE place ---- */
type RawTask = {
  id: string;
  goal_id?: string | null;
  what?: string; title?: string | null;
  how?: string | null; output?: string | null; why?: string | null;
  estimated_minutes?: number; attention_cost?: number;
  size?: string; kind?: string; lane?: string;
  status?: string; completed_at?: string | null;
};

function normTask(t: RawTask): Task {
  return {
    id: t.id,
    goal_id: t.goal_id ?? null,
    title: t.what ?? t.title ?? "Untitled block",
    why: t.why ?? null,
    how: t.how ?? t.output ?? null,
    output: t.output ?? null,
    lane: t.lane ?? "personal",
    kind: t.kind ?? "task",
    status: t.status === "completed" || t.status === "done" ? "done" : (t.status ?? "todo"),
    attention_cost: t.attention_cost ?? Math.max(1, Math.round((t.estimated_minutes ?? 30) / 15)),
    planned_date: null,
    completed_at: t.completed_at ?? null,
  };
}

export function getWall(): Promise<WallToday> {
  return request<Record<string, unknown>>("/wall/today").then((w) => ({
    planned: (((w.core ?? w.planned) as RawTask[] | undefined) ?? []).map(normTask),
    small_wins: (((w.small ?? w.small_wins) as RawTask[] | undefined) ?? []).map(normTask),
    parked: (((w.next ?? w.parked) as RawTask[] | undefined) ?? []).map(normTask),
    xp_today: (w.xp as number | undefined) ?? (w.xp_today as number | undefined) ?? 0,
    streak_days: (w.streak_days as number | undefined) ?? (w.streak as number | undefined) ?? 0,
    active_load: (w.active_load as number | undefined) ?? 0,
    capacity: (w.capacity as number | undefined) ?? 0,
  }));
}

export function completeTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/complete`, { method: "POST" });
}

export function quickCapture(text: string): Promise<{ id: string; title: string; minutes: number; due_today: boolean }> {
  return request("/quick-capture", { method: "POST", body: JSON.stringify({ text }) });
}

export function runDecay(): Promise<{ decayed: number }> {
  return request("/maintenance/decay", { method: "POST" });
}

export function startFocus(taskId: string, minutes: number): Promise<{ id: string }> {
  // backend field is preset_minutes
  return request<{ id: string }>("/focus-sessions", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, preset_minutes: minutes }),
  });
}

export function finishFocus(sessionId: string, body: { completed: boolean }): Promise<unknown> {
  return request(`/focus-sessions/${sessionId}/finish`, { method: "POST", body: JSON.stringify(body) });
}

export type ActiveSession = {
  id: string; task_id: string; planned_minutes: number;
  started_at: string; remaining_seconds: number;
};

export function getActiveSession(): Promise<ActiveSession | null> {
  return request<ActiveSession | null>("/focus-sessions/active");
}

export function listGoals(status?: string): Promise<Goal[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<Goal[]>(`/goals${q}`);
}

export function createGoal(payload: {
  title: string; why?: string; lane: string;
  attention_cost: number; importance: number; due_date?: string;
}): Promise<unknown> {
  return request("/goals", { method: "POST", body: JSON.stringify(payload) });
}

export function activateGoal(goalId: string, force = false): Promise<unknown> {
  return request(`/goals/${goalId}/activate${force ? "?force=true" : ""}`, { method: "POST" });
}

export type OpportunityInput = {
  title: string; kind: string; organisation?: string;
  url?: string; deadline?: string; notes?: string;
};

export function listOpportunities(status?: string): Promise<Opportunity[]> {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return request<Opportunity[]>(`/opportunities${q}`);
}

export function createOpportunity(payload: OpportunityInput): Promise<unknown> {
  return request("/opportunities", { method: "POST", body: JSON.stringify(payload) });
}

export function advanceOpportunity(id: string, body: { to: string; note?: string }): Promise<unknown> {
  return request(`/opportunities/${id}/advance`, { method: "POST", body: JSON.stringify(body) });
}

export function getOpportunityEvents(
  id: string,
): Promise<Array<{ from_status: string | null; to_status: string; note: string | null; created_at: string }>> {
  return request(`/opportunities/${id}/events`);
}

export function listRadar(): Promise<DiscoveredItem[]> {
  return request<DiscoveredItem[]>("/radar");
}
export function listCompanies(): Promise<WatchCompany[]> {
  return request<WatchCompany[]>("/radar/companies");
}
export function addCompany(payload: { name: string; board: string; slug: string }): Promise<unknown> {
  return request("/radar/companies", { method: "POST", body: JSON.stringify(payload) });
}
export function refreshRadar(): Promise<{ added: number; failed: string[] }> {
  return request("/radar/refresh", { method: "POST" });
}
export function pinItem(id: string): Promise<unknown> {
  return request(`/radar/${id}/pin`, { method: "POST" });
}
export function dismissItem(id: string): Promise<unknown> {
  return request(`/radar/${id}/dismiss`, { method: "POST" });
}
export function createLog(payload: {
  session_id?: string; task_id?: string; minutes: number;
  worked_on?: string; needed_help: boolean;
}): Promise<unknown> {
  return request("/logs", { method: "POST", body: JSON.stringify(payload) });
}

export function getSettings(): Promise<Record<string, string>> {
  return request<Record<string, string>>("/settings");
}
export function saveSetting(key: string, value: string): Promise<unknown> {
  return request("/settings", { method: "PUT", body: JSON.stringify({ key, value }) });
}
