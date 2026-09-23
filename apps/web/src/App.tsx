import { useCallback, useEffect, useMemo, useState } from "react";
import { completeTask, getWall, startFocus } from "./lib/api";
import type { WallData, WallTask } from "./types";

function minutesToClock(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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

function Placeholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
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
  } | null>(null);

  const [message, setMessage] = useState("");

  const [view, setView] = useState<
    "wall" | "focus" | "goals" | "opps" | "more"
  >("wall");

  const load = useCallback(async () => {
    try {
      setWall(await getWall());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Wall unavailable"
      );
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
      setMessage("Focus session complete.");
      setFocus(null);
      return;
    }

    const id = window.setInterval(() => {
      setFocus((current) =>
        current
          ? {
              ...current,
              seconds: current.seconds - 1,
            }
          : null
      );
    }, 1000);

    return () => window.clearInterval(id);
  }, [focus]);

  const progress = useMemo(() => {
    if (!wall) return 0;

    const used = Math.max(0, wall.xp % 100);

    return used;
  }, [wall]);

  async function finish(task: WallTask) {
    try {
      await completeTask(task.id);

      setMessage("WALL UPDATED");

      window.setTimeout(() => {
        setMessage("");
      }, 4000);

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not complete task"
      );
    }
  }

  async function focusTask(task: WallTask) {
    try {
      const minutes = Math.min(task.minutes, 45);

      await startFocus(task.id, minutes);

      setView("focus");

      setFocus({
        task,
        seconds: minutes * 60,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start focus"
      );
    }
  }

  function leaveFocus() {
    setFocus(null);
    setView("wall");
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
          onClick={() =>
            setTheme(theme === "dark" ? "light" : "dark")
          }
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
            {[...(wall?.core ?? []), ...(wall?.small ?? [])].map(
              (task) => (
                <div className="next-item focus-row" key={task.id}>
                  <span>{task.lane}</span>

                  <strong>{task.what}</strong>

                  <button
                    className="focus-start"
                    onClick={() => focusTask(task)}
                  >
                    START {Math.min(task.minutes, 45)}m
                  </button>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {view === "goals" && (
        <Placeholder
          title="GOALS"
          note="The API already serves goals. The Goals panel will be wired to the real endpoint next."
        />
      )}

      {view === "opps" && (
        <Placeholder
          title="OPPORTUNITIES"
          note="Opportunity inbox and lifecycle will live here."
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
