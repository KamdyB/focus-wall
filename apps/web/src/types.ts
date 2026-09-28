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

export type WatchCompany = { id: string; name: string; board: string; slug: string };
