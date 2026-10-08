import type {
  AiInsight, DailyBriefing, DiscoveredItem, Goal, Opportunity, ProfileData,
  RadarRefresh, Reflection, Task, WallToday, WatchFeed,
} from "../types";

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
  status?: string; completed_at?: string | null; recur?: string | null;
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
    recur: t.recur ?? null,
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

export async function getTask(taskId: string): Promise<Task> {
  return normTask(await request<RawTask>(`/tasks/${taskId}`));
}

export function completeTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/complete`, { method: "POST" });
}

export type TaskPatch = Partial<{
  what: string; how: string; output: string; estimated_minutes: number;
  size: string; lane: string; importance: number; due_at: string | null; goal_id: string | null;
}> & { recur?: "none" | "daily" | "weekly" | "monthly" };

export function updateTask(taskId: string, patch: TaskPatch): Promise<unknown> {
  return request(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteTask(taskId: string): Promise<{ deleted: boolean }> {
  return request(`/tasks/${taskId}`, { method: "DELETE" });
}

export type CaptureResult = {
  created: boolean;
  duplicate_of: string | null;
  id: string; title: string; minutes: number; due_today: boolean;
};
export function quickCapture(text: string, force = false): Promise<CaptureResult> {
  return request("/quick-capture", { method: "POST", body: JSON.stringify({ text, force }) });
}

export function runDecay(): Promise<{ decayed: number }> {
  return request("/maintenance/decay", { method: "POST" });
}

export function startFocus(taskId: string, minutes: number): Promise<{ id: string }> {
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

export type GoalCreateResult = {
  created: boolean;
  duplicate_of: string | null;
  id: string;
  title: string;
};
export function createGoal(payload: {
  title: string; why?: string; lane: string;
  attention_cost: number; importance: number; due_date?: string; force?: boolean;
}): Promise<GoalCreateResult> {
  return request("/goals", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGoal(goalId: string, patch: Partial<{
  title: string; why: string | null; lane: string;
  attention_cost: number; importance: number; due_date: string | null;
}>): Promise<Goal> {
  return request(`/goals/${goalId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteGoal(goalId: string): Promise<{ deleted: boolean }> {
  return request(`/goals/${goalId}`, { method: "DELETE" });
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

/* ---- radar feeds ---- */
export function listRadar(): Promise<DiscoveredItem[]> {
  return request<DiscoveredItem[]>("/radar");
}
export function listFeeds(): Promise<WatchFeed[]> {
  return request<WatchFeed[]>("/radar/feeds");
}
export function addFeed(payload: { source: string; param?: string; label: string }): Promise<{ status: string }> {
  return request("/radar/feeds", { method: "POST", body: JSON.stringify(payload) });
}
export function removeFeed(feedId: string): Promise<{ deleted: boolean }> {
  return request(`/radar/feeds/${feedId}`, { method: "DELETE" });
}
export function refreshRadar(): Promise<RadarRefresh> {
  return request<RadarRefresh>("/radar/refresh", { method: "POST" });
}
export function pinItem(id: string): Promise<unknown> {
  return request(`/radar/${id}/pin`, { method: "POST" });
}
export function dismissItem(id: string): Promise<unknown> {
  return request(`/radar/${id}/dismiss`, { method: "POST" });
}

export type StudyLabCloudState = { data: Record<string, unknown> | null; updated_at: string | null };
export function getStudyLabState(): Promise<StudyLabCloudState> {
  return request<StudyLabCloudState>("/study-lab");
}
export function saveStudyLabState(data: Record<string, unknown>): Promise<{ saved: boolean; updated_at: string }> {
  return request("/study-lab", { method: "PUT", body: JSON.stringify({ data }) });
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

/* ---- daily briefing + reflection ---- */
export function getBriefing(): Promise<DailyBriefing> {
  return request<DailyBriefing>("/daily/briefing");
}
export function getReflection(day?: string): Promise<Reflection> {
  const q = day ? `?day=${encodeURIComponent(day)}` : "";
  return request<Reflection>(`/daily/reflection${q}`);
}
export function saveReflection(body: string, mood: string | null): Promise<Reflection> {
  return request("/daily/reflection", { method: "PUT", body: JSON.stringify({ body, mood }) });
}
export function listReflections(limit = 7): Promise<Array<{ date: string; body: string; mood: string | null }>> {
  return request(`/daily/reflections?limit=${limit}`);
}

/* ---- AI triage (Groq) ---- */
export function getAiProfile(): Promise<ProfileData> {
  return request<{ data: ProfileData }>("/ai/profile").then((r) => r.data ?? {});
}
export function saveAiProfile(data: ProfileData): Promise<ProfileData> {
  return request("/ai/profile", { method: "PUT", body: JSON.stringify({ data }) });
}
export function triageOpportunity(id: string, text?: string): Promise<AiInsight> {
  return request<AiInsight>(`/ai/${id}/triage`, { method: "POST", body: JSON.stringify({ text: text || null }) });
}
export function listInsights(): Promise<Record<string, AiInsight>> {
  return request<Record<string, AiInsight>>("/ai/insights");
}