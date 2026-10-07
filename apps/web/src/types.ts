export type Task = {
  id: string;
  goal_id: string | null;
  title: string;
  why: string | null;
  how: string | null;
  output: string | null;
  lane: string;
  kind: string;
  status: string;
  attention_cost: number;
  planned_date: string | null;
  completed_at: string | null;
  recur: string | null;
};
export type Goal = {
  id: string;
  title: string;
  why: string | null;
  lane: string;
  status: string;
  attention_cost: number;
  importance: number;
  due_date: string | null;
  open_tasks: number;
};
export type WallToday = {
  planned: Task[];
  small_wins: Task[];
  parked: Task[];
  xp_today: number;
  streak_days: number;
  active_load: number;
  capacity: number;
};
export type FocusSession = {
  id: string;
  task_id: string;
  planned_minutes: number;
  started_at: string;
  status: string;
};
export type Opportunity = {
  id: string;
  kind: string;
  title: string;
  organisation: string | null;
  url: string | null;
  deadline: string | null;
  notes: string | null;
  status: string;
  applied_at: string | null;
  next_states: string[];
};
export type DiscoveredItem = {
  id: string;
  source: string;
  kind: string;
  title: string;
  organisation: string | null;
  url: string | null;
  eligibility: string | null;
  deadline: string | null;
  first_seen: string;
  fit_score: number;
};
export type WatchFeed = { id: string; source: string; param: string; label: string };
export type RadarRefresh = {
  added: number;
  failed: string[];
  skipped?: boolean;
  next_refresh_in_minutes?: number;
};
export type DailyBriefing = {
  date: string;
  done_today: number;
  open_tasks: number;
  xp_today: number;
  focus_minutes: number;
  streak: number;
  next_up: Array<{ id: string; title: string }>;
  next_deadline: { title: string; deadline: string } | null;
  reflection_done: boolean;
};
export type Reflection = { date: string; body: string; mood: string | null } | null;
export type AiInsight = {
  id: string;
  opportunity_id: string;
  verdict: string; // chase | maybe | skip | expired
  fit_score: number;
  read_title: string;
  read_org: string;
  deadline: string | null; // AI-extracted, unverified — never written to Opportunity
  why_fits: string[];
  concerns: string[];
  documents: string[];
  actions: string[];
  model: string;
  created_at: string;
};
export type ProfileData = Record<string, unknown>;
