import type { WallData } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN = import.meta.env.VITE_APP_TOKEN ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": TOKEN,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      else if (detail?.message) message = String(detail.message);
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export interface StartedFocus {
  id: string;
  started_at: string;
  status: string;
}

export interface GoalItem {
  id: string;
  title: string;
  why: string | null;
  lane: string;
  status: string;
  attention_cost: number;
  importance: number;
  due_date: string | null;
  open_tasks: number;
}

export interface GoalInput {
  title: string;
  why?: string | null;
  lane: string;
  attention_cost: number;
  importance: number;
  due_date?: string | null;
}

export async function getWall() {
  return request<WallData>("/wall/today");
}

export async function completeTask(taskId: string) {
  return request<{ status: string; xp_awarded: boolean }>(`/tasks/${taskId}/complete`, {
    method: "POST",
  });
}

export async function startFocus(taskId: string, minutes: number) {
  return request<StartedFocus>("/focus-sessions", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, preset_minutes: minutes }),
  });
}

export async function finishFocus(sessionId: string, completed: boolean) {
  return request<{ status: string; completed: boolean }>(
    `/focus-sessions/${sessionId}/finish`,
    { method: "POST", body: JSON.stringify({ completed }) },
  );
}

export async function getGoals(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<GoalItem[]>(`/goals${query}`);
}

export async function activateGoal(goalId: string, force = false) {
  return request<{ id: string; status: string; active_load: number }>(
    `/goals/${goalId}/activate${force ? "?force=true" : ""}`,
    { method: "POST" },
  );
}

export async function createGoal(payload: GoalInput) {
  return request<{ id: string; title: string; status: string }>("/goals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
