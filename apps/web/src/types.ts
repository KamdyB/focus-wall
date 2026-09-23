export type WallTask = {
  id: string;
  what: string;
  how: string;
  output: string;
  minutes: number;
  lane: string;
  score: number;
  due_at: string | null;
};

export type WallData = {
  date: string;
  active_load: number;
  capacity: number;
  xp: number;
  level: number;
  streak: number;
  remaining_minutes: number;
  core: WallTask[];
  small: WallTask[];
  next: WallTask[];
  updated_at: string;
};
