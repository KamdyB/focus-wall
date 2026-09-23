import type { WallData } from "../types";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN = import.meta.env.VITE_APP_TOKEN ?? "change-this-local-token";

export async function getWall(): Promise<WallData> {
  const res = await fetch(`${API}/wall/today`, {
    headers: { "X-App-Token": TOKEN }
  });
  if (!res.ok) throw new Error("Could not load the wall");
  return res.json();
}

export async function completeTask(id: string) {
  const res = await fetch(`${API}/tasks/${id}/complete`, {
    method: "POST",
    headers: { "X-App-Token": TOKEN }
  });
  if (!res.ok) throw new Error("Could not complete task");
  return res.json();
}

export async function startFocus(taskId: string, minutes = 45) {
  const res = await fetch(`${API}/focus-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Token": TOKEN },
    body: JSON.stringify({ task_id: taskId, preset_minutes: minutes, break_minutes: 10 })
  });
  if (!res.ok) throw new Error("Could not start focus");
  return res.json();
}
