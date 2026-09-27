import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  activateGoal,
  completeTask,
  createGoal,
  finishFocus,
  getGoals,
  getWall,
  startFocus,
  type GoalItem,
} from "./lib/api";
import type { WallData, WallTask } from "./types";

const LANES = ["technical", "career", "academic", "personal", "health"] as const;

function minutesToClock(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function flash(message: string, setMessage: (value: string) => void) {
  setMessage(message);
  window.setTimeout(() => setMessage(""), 4000);
}

function TaskCard({
  task,
  onComplete,
  onFocus,
}: {
  task: WallTask;
  onComplete: () => void;
  onFocus: () => void;
}) {
  return (
    <article className="task-card">
      <div className="pin" />

      <div className="task-top">
        <span className={`lane lane-${task.lane}`}>{task.lane}</span>
        <span>{task.minutes} min</span>
      </div>

      <h3>{task.what}</h3>

      <p className="label">HOW</p>
      <p>{task.how}</p>

      <p className="label">OUTPUT</p>
      <p>{task.output}</p>

      <div className="task-actions">
        <button onClick={onFocus}>Focus</button>
        <button className="done" onClick={onComplete}>
          Finish
        </button>
      </div>
    </article>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="wall-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>On the wall next.</h2>
        </div>
      </div>

      <article className="task-card placeholder-card">
        <div className="pin" />
        <p className="label">NOT BUILT YET</p>
        <p>{note}</p>
      </article>
    </section>
  );
}

export default function App() {
  const [wall, setWall] = useState<WallData | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("focus-theme") as "light" | "dark") ?? "dark"
  );
  const [focus, setFocus] = useState<{
    task: WallTask;
    seconds: number;
    sessionId: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"wall" | "focus" | "goals" | "opps" | "more">("wall");

  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);
  const [form, setForm] = useState({
    title: "",
    lane: "technical",
    attention_cost: 2,
    importance: 3,
    due_date: "",
  });

  const load = useCallback(async () => {
    try {
      setWall(await getWall());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wall unavailable");
    }
  }, []);

  useEffect(() => {
    load();

    const id = window.setInterval(load, 10 * 60 * 1000);

    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("focus-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!focus) return;

    if (focus.seconds <= 0) {
      const sessionId = focus.sessionId;
      setFocus(null);
      flash("FOCUS COMPLETE", setMessage);
      void load();
      void finishFocus(sessionId, true).catch(() => undefined);
      return;
    }

    const id = window.setInterval(() => {
      setFocus((current) =>
        current ? { ...current, seconds: current.seconds - 1 } : null
      );
    }, 1000);

    return () => window.clearInterval(id);
  }, [focus, load]);

  useEffect(() => {
    if (view !== "goals") return;

    let cancelled = false;

    getGoals()
      .then((rows) => {
        if (!cancelled) {
          setGoals(rows);
          setGoalsLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load goals");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [view]);

  const progress = useMemo(() => (wall ? Math.max(0, wall.xp % 100) : 0), [wall]);

  async function finish(task: WallTask) {
    try {
      await completeTask(task.id);
      flash("WALL UPDATED", setMessage);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete task");
    }
  }

  async function focusTask(task: WallTask) {
    try {
      const minutes = Math.min(task.minutes, 45);
      const started = await startFocus(task.id, minutes);
      setView("focus");
      setFocus({ task, seconds: minutes * 60, sessionId: started.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start focus");
    }
  }

  async function endEarly() {
    if (!focus) return;
    const sessionId = focus.sessionId;
    setFocus(null);
    setView("wall");
    try {
      await finishFocus(sessionId, false);
      flash("SESSION LOGGED", setMessage);
    } catch {
      setMessage("Session could not be logged");
    }
    void load();
  }

  function leaveFocus() {
    if (focus) {
      const sessionId = focus.sessionId;
      void finishFocus(sessionId, false).catch(() => undefined);
    }
    setFocus(null);
    setView("wall");
  }

  async function activate(goal: GoalItem) {
    try {
      await activateGoal(goal.id);
      flash("GOAL ACTIVE", setMessage);
      setGoals(await getGoals());
      void load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not activate goal");
    }
  }

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;

    try {
      await createGoal({
        title: form.title.trim(),
        lane: form.lane,
        attention_cost: form.attention_cost,
        importance: form.importance,
        due_date: form.due_date || null,
      });
      setForm({
        title: "",
        lane: form.lane,
        attention_cost: 2,
        importance: 3,
        due_date: "",
      });
      setGoals(await getGoals());
      flash("PINNED TO GOALS", setMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create goal");
    }
  }

  if (focus) {
    const mm = String(Math.floor(focus.seconds / 60)).padStart(2, "0");
    const ss = String(focus.seconds % 60).padStart(2, "0");

    return (
      <main className="focus-screen">
        <button className="back" onClick={leaveFocus}>
          Back to wall
        </button>

        <div className="focus-note">
          <span className="label">CURRENT FOCUS</span>

          <h1>{focus.task.what}</h1>

          <p>{focus.task.how}</p>

          <strong>
            {mm}:{ss}
          </strong>

          <small>Output: {focus.task.output}</small>

          <button className="focus-end" onClick={endEarly}>
            END EARLY — LOG IT
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="wall-header">
        <div>
          <p className="eyebrow">PERSONAL OPERATING WALL</p>

          <h1>
            FOCUS<span>//</span>WALL
          </h1>

          <p>
            {wall?.date ?? "Loading"} ·{" "}
            {wall ? minutesToClock(wall.remaining_minutes) : "..."} remaining
          </p>
        </div>

        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "LIGHT" : "DARK"}
        </button>
      </header>

      <section className="status-strip">
        <div>
          <span>ACTIVE LOAD</span>
          <b>
            {wall?.active_load ?? 0}/{wall?.capacity ?? 12}
          </b>
        </div>

        <div>
          <span>LEVEL</span>
          <b>{wall?.level ?? 1}</b>
        </div>

        <div>
          <span>STREAK</span>
          <b>{wall?.streak ?? 0} days</b>
        </div>

        <div className="xp">
          <span>XP</span>
          <b>{wall?.xp ?? 0}</b>

          <i>
            <em style={{ width: `${progress}%` }} />
          </i>
        </div>
      </section>

      {message && <div className="toast">{message}</div>}

      {view === "wall" && (
        <>
          <section className="wall-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TODAY</p>
                <h2>Three things. Then stop.</h2>
              </div>

              <span className="budget">
                {wall?.remaining_minutes ?? 0} min left
              </span>
            </div>

            <div className="task-grid">
              {wall?.core.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => finish(task)}
                  onFocus={() => focusTask(task)}
                />
              ))}
            </div>
          </section>

          <section className="wall-section secondary">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SMALL WINS</p>
                <h2>Keep the wall moving.</h2>
              </div>
            </div>

            <div className="small-grid">
              {wall?.small.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => finish(task)}
                  onFocus={() => focusTask(task)}
                />
              ))}
            </div>
          </section>

          <section className="wall-section next">
            <p className="eyebrow">NEXT</p>

            <div className="next-list">
              {wall?.next.map((task) => (
                <div className="next-item" key={task.id}>
                  <span>{task.lane}</span>
                  <strong>{task.what}</strong>
                  <small>{task.minutes} min</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {view === "focus" && (
        <section className="wall-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FOCUS</p>
              <h2>Pick one thing. Start the clock.</h2>
            </div>
          </div>

          <div className="next-list">
            {[...(wall?.core ?? []), ...(wall?.small ?? [])].map((task) => (
              <div className="next-item focus-row" key={task.id}>
                <span>{task.lane}</span>

                <strong>{task.what}</strong>

                <button className="focus-start" onClick={() => focusTask(task)}>
                  START {Math.min(task.minutes, 45)}m
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "goals" && (
        <section className="wall-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GOALS</p>
              <h2>What the wall is carrying.</h2>
            </div>

            <span className="budget">
              {goals
                .filter((goal) => goal.status === "active")
                .reduce((sum, goal) => sum + goal.attention_cost, 0)}{" "}
              load active
            </span>
          </div>

          <form className="goal-form" onSubmit={submitGoal}>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="New goal — pin it to the wall"
            />

            <select
              value={form.lane}
              onChange={(event) => setForm({ ...form, lane: event.target.value })}
            >
              {LANES.map((lane) => (
                <option key={lane} value={lane}>
                  {lane}
                </option>
              ))}
            </select>

            <select
              value={form.attention_cost}
              onChange={(event) =>
                setForm({ ...form, attention_cost: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  cost {n}
                </option>
              ))}
            </select>

            <select
              value={form.importance}
              onChange={(event) =>
                setForm({ ...form, importance: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  prio {n}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            />

            <button type="submit">PIN</button>
          </form>

          <div className="goal-list">
            {goalsLoaded && goals.length === 0 && (
              <p className="muted-note">No goals yet. Pin the first one above.</p>
            )}

            {goals.map((goal) => (
              <div className="goal-row" key={goal.id}>
                <span className={`lane lane-${goal.lane}`}>{goal.lane}</span>
                <strong>{goal.title}</strong>
                <span className="goal-meta">
                  cost {goal.attention_cost} · {goal.open_tasks} open
                  {goal.due_date ? ` · due ${goal.due_date}` : ""}
                </span>
                <span className={`status-chip chip-${goal.status}`}>{goal.status}</span>
                {goal.status === "inbox" && (
                  <button className="goal-activate" onClick={() => activate(goal)}>
                    ACTIVATE
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "opps" && (
        <Placeholder
          title="OPPORTUNITIES"
          note="Opportunity inbox and lifecycle land here — own domain, own pipeline, sorted by deadline."
        />
      )}

      {view === "more" && (
        <Placeholder
          title="MORE"
          note="Parking lot, weekly reflection and settings will live here."
        />
      )}

      <nav className="bottom-nav">
        {(
          [
            ["wall", "WALL"],
            ["focus", "FOCUS"],
            ["goals", "GOALS"],
            ["opps", "OPPS"],
            ["more", "MORE"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
