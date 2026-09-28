import type { DiscoveredItem, FocusSession, Goal, Opportunity, Task, WallToday, WatchCompany } from "../types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const TOKEN = (import.meta.env.VITE_APP_TOKEN as string | undefined) ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-App-Token": TOKEN, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function getWall(): Promise<WallToday> {
  return request<WallToday>("/wall/today");
}

export function completeTask(taskId: string): Promise<Task> {
  return request<Task>(`/tasks/${taskId}/complete`, { method: "POST" });
}

export function startFocus(taskId: string, minutes: number): Promise<FocusSession> {
  return request<FocusSession>("/focus-sessions", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, planned_minutes: minutes }),
  });
}

export function finishFocus(sessionId: string, body: { completed: boolean }): Promise<unknown> {
  return request(`/focus-sessions/${sessionId}/finish`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  title: string;
  kind: string;
  organisation?: string;
  url?: string;
  deadline?: string;
  notes?: string;
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

