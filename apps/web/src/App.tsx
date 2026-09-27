import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  activateGoal, completeTask, createGoal, finishFocus, getWall, listGoals, startFocus,
} from "./lib/api";
import type { Goal, Task } from "./types";

type View = "wall" | "focus" | "goals" | "opps" | "more";
type FocusState = { task: Task; secondsLeft: number; sessionId: string | null };

function seedTilt(id: string): CSSProperties {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  const rx = ((h % 401) / 100 - 2).toFixed(2);
  const ry = (((h >> 3) % 401) / 100 - 2).toFixed(2);
  return { "--rx": `${rx}deg`, "--ry": `${ry}deg` } as CSSProperties;
}

function fmt(s: number): ReactNode {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return <>{h}<span className="dim">:</span>{String(m % 60).padStart(2, "0")}<span className="dim">:</span>{sec}</>;
  }
  return <>{String(m).padStart(2, "0")}<span className="dim">:</span>{sec}</>;
}

function HoldButton({ locked, onEngaged }: { locked: boolean; onEngaged: () => void }) {
  const [filling, setFilling] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    if (locked || timer.current !== null) return;
    fired.current = false;
    setFilling(true);
    timer.current = window.setTimeout(() => { timer.current = null; fired.current = true; setFilling(false); onEngaged(); }, 1500);
  }, [locked, onEngaged]);
  const stop = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (!fired.current) setFilling(false);
  }, []);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  return (
    <button
      className={`hold-btn${filling ? " filling" : ""}${locked ? " locked" : ""}`}
      disabled={locked}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(); }}
      onKeyUp={stop}
    >
      <span className="hold-fill" />
      <span className="hold-label">{locked ? "LOCKED IN" : "HOLD TO ENGAGE"}</span>
    </button>
  );
}

function NavButton({ active, onGo, children }: { active: boolean; onGo: () => void; children: ReactNode }) {
  return (
    <button
      className={`nav-btn${active ? " active" : ""}`}
      onClick={(e) => {
        const b = e.currentTarget;
        const r = b.getBoundingClientRect();
        const s = document.createElement("span");
        s.className = "nav-ripple";
        s.style.left = `${e.clientX - r.left}px`;
        s.style.top = `${e.clientY - r.top}px`;
        b.appendChild(s);
        const kill = () => s.remove();
        s.addEventListener("animationend", kill, { once: true });
        window.setTimeout(kill, 700);
        onGo();
      }}
    >{children}</button>
  );
}

const GLYPHS: Record<View, ReactNode> = {
  wall: <svg viewBox="0 0 24 24"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /></svg>,
  focus: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="1.4" /></svg>,
  goals: <svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h9M5 17h5" /></svg>,
  opps: <svg viewBox="0 0 24 24"><path d="M4 10h16M7 10v7h10v-7M9 6h6" /></svg>,
  more: <svg viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>,
};

export default function App() {
  const [view, setView] = useState<View>("wall");
  const [wall, setWall] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalFilter, setGoalFilter] = useState("active");
  const [gTitle, setGTitle] = useState(""); const [gWhy, setGWhy] = useState("");
  const [gLane, setGLane] = useState("technical"); const [gCost, setGCost] = useState(2); const [gDue, setGDue] = useState("");

  const wipeRef = useRef<HTMLDivElement>(null);
  const wipeBusy = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem("fw-theme") === "light" ? "light" : "dark";
  }, []);

  const switchTheme = useCallback((next: "dark" | "light") => {
    if (document.documentElement.dataset.theme === next) return;
    const apply = () => {
      if (wipeBusy.current) return;
      wipeBusy.current = true;
      document.documentElement.dataset.theme = next;
      localStorage.setItem("fw-theme", next);
      wipeRef.current?.classList.remove("running");
      window.setTimeout(() => { wipeBusy.current = false; }, 60);
    };
    const wipe = wipeRef.current;
    if (!wipe || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    wipeBusy.current = false;
    wipe.style.setProperty("--wipe-color", next === "dark" ? "#1a1715" : "#ded4c6");
    wipe.classList.add("running");
    const fallback = window.setTimeout(apply, 950);
    wipe.addEventListener("animationend", () => { window.clearTimeout(fallback); apply(); }, { once: true });
  }, []);

  const refresh = useCallback(async () => {
    try { setWall((await getWall()) as unknown as Record<string, unknown>); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Wall unavailable"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadGoals = useCallback(async () => {
    try { setGoals(await listGoals(goalFilter === "all" ? undefined : goalFilter)); }
    catch (e) { setToast(e instanceof Error ? e.message : "Goals unavailable"); }
  }, [goalFilter]);
  useEffect(() => { if (view === "goals" || view === "opps") void loadGoals(); }, [view, loadGoals]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!focus) return;
    const iv = window.setInterval(() => {
      setFocus((f) => {
        if (!f || f.secondsLeft <= 1) {
          const sid = f?.sessionId ?? null;
          window.setTimeout(() => {
            void (async () => {
              if (sid) { try { await finishFocus(sid, { completed: true }); } catch { /* retry next pass */ } }
              setToast("Session complete — logged.");
              setFocus(null);
              void refresh();
            })();
          }, 0);
          return f ? { ...f, secondsLeft: 0 } : f;
        }
        return { ...f, secondsLeft: f.secondsLeft - 1 };
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [focus?.sessionId, refresh]);

  const engage = useCallback(async (task: Task) => {
    const minutes = Math.max(15, (task.attention_cost ?? 2) * 15);
    try {
      const res = await startFocus(task.id, minutes);
      setFocus({ task, secondsLeft: minutes * 60, sessionId: res.id });
      setView("focus");
    } catch (e) { setToast(e instanceof Error ? e.message : "Could not start"); }
  }, []);

  const abandon = useCallback(async () => {
    if (!focus) return;
    if (focus.sessionId) { try { await finishFocus(focus.sessionId, { completed: false }); } catch { /* ignore */ } }
    setFocus(null);
    setToast("Session logged as abandoned.");
    void refresh();
  }, [focus, refresh]);

  const complete = useCallback(async (t: Task) => {
    try {
      await completeTask(t.id);
      setFocus((f) => (f?.task.id === t.id ? null : f));
      setToast("Block settled.");
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to settle"); }
  }, [refresh]);

  const addGoal = useCallback(async () => {
    if (!gTitle.trim()) return;
    try {
      await createGoal({ title: gTitle.trim(), why: gWhy.trim() || undefined, lane: gLane, attention_cost: gCost, importance: gCost, due_date: gDue || undefined });
      setGTitle(""); setGWhy(""); setGDue("");
      setToast("Goal carved.");
      void loadGoals();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to create"); }
  }, [gTitle, gWhy, gLane, gCost, gDue, loadGoals]);

  const activate = useCallback(async (g: Goal, force = false) => {
    try { await activateGoal(g.id, force); setToast("Goal active."); void loadGoals(); void refresh(); }
    catch (e) {
      const m = e instanceof Error ? e.message : "Failed";
      if (m.toLowerCase().includes("full")) setToast("Wall is full — settle something first.");
      else setToast(m);
    }
  }, [loadGoals, refresh]);

  const planned = (wall?.planned as Task[] | undefined) ?? [];
  const smallWins = (wall?.small_wins as Task[] | undefined) ?? [];
  const parked = (wall?.parked as Task[] | undefined) ?? [];
  const xp = (wall?.xp_today as number | undefined) ?? 0;
  const streak = (wall?.streak_days as number | undefined) ?? (wall?.streak as number | undefined) ?? 0;
  const doneCount = planned.filter((t) => t.status === "done").length;

  const trayGroups = useMemo(() => {
    const groups: Record<string, Goal[]> = {};
    for (const g of goals) (groups[g.lane] ??= []).push(g);
    return Object.entries(groups);
  }, [goals]);

  const sections: Array<[string, Task[]]> = [
    ["Today's three", planned],
    ["Small wins", smallWins],
    ["Parked", parked],
  ];

  return (
    <>
      <div ref={wipeRef} className="theme-wipe" />

      <header className="app-header">
        <h1 className="wordmark">FOCUS//WALL</h1>
        <div className="metrics">
          <span>XP {xp}</span>
          <span>STREAK {streak}D</span>
          <span>{String(doneCount).padStart(2, "0")} / {String(planned.length).padStart(2, "0")}</span>
          <button className="theme-btn" onClick={() => switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>◐</button>
        </div>
      </header>
      {error && <div className="error-note">{error}</div>}

      {view === "wall" && (
        <main className="wall-viewport">
          {sections.map(([label, items]) => (
            <section key={label}>
              <div className="section-label">{label}</div>
              <div className={`wall-grid${focus ? " locked" : ""}`}>
                {items.map((t, i) => (
                  <article
                    key={t.id}
                    className={`task-card${focus?.task.id === t.id ? " card-active" : ""}${t.status === "done" ? " settled" : ""}`}
                  >
                    <div className="pin" />
                    <div className="card-tilt" style={seedTilt(t.id)}>
                      <div className="card-top">
                        <span className="lane-tag">{t.lane}</span>
                        <span className="fraction">{String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
                      </div>
                      <h3 className="card-title">{t.title}</h3>
                      {(t.how || t.why) && <p className="how-line">{t.how || t.why}</p>}
                      <div className="base-plate">
                        <span className={`plate-timer${focus?.task.id === t.id ? " live" : ""}`}>
                          {focus && focus.task.id === t.id ? fmt(focus.secondsLeft) : `${String((t.attention_cost ?? 2) * 15).padStart(2, "0")}:00`}
                        </span>
                        {t.status !== "done" && focus?.task.id !== t.id && <HoldButton locked={false} onEngaged={() => void engage(t)} />}
                        <button className="ghost-btn" onClick={() => void complete(t)}>SETTLE</button>
                      </div>
                    </div>
                  </article>
                ))}
                {items.length === 0 && <p className="empty-note">Nothing pinned here.</p>}
              </div>
            </section>
          ))}
        </main>
      )}

      {view === "focus" && (
        <main className="focus-screen">
          {focus ? (
            <>
              <h2 className="focus-title">{focus.task.title}</h2>
              <div className="focus-count">{fmt(focus.secondsLeft)}</div>
              <button className="ghost-btn" onClick={() => void abandon()}>END EARLY</button>
            </>
          ) : (
            <p className="empty-note">No session running. Hold to engage from the wall.</p>
          )}
        </main>
      )}

      {view === "goals" && (
        <main className="panel">
          <div className="chip-row">
            {["active", "parked", "done", "all"].map((f) => (
              <button key={f} className={`chip${goalFilter === f ? " active" : ""}`} onClick={() => setGoalFilter(f)}>{f}</button>
            ))}
          </div>
          {goals.map((g) => (
            <div key={g.id} className="goal-row">
              <h4>{g.title}</h4>
              {g.why && <p>{g.why}</p>}
              <div className="goal-meta">{g.lane} · cost {g.attention_cost} · {g.open_tasks} open{g.due_date ? ` · due ${g.due_date}` : ""}</div>
              {g.status !== "active" && <button className="ghost-btn" onClick={() => void activate(g)}>ACTIVATE</button>}
            </div>
          ))}
          {goals.length === 0 && <p className="empty-note">No goals here yet.</p>}
          <div className="section-label">New goal</div>
          <input className="field" placeholder="Title" value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
          <input className="field" placeholder="Why it matters" value={gWhy} onChange={(e) => setGWhy(e.target.value)} />
          <input className="field" type="date" value={gDue} onChange={(e) => setGDue(e.target.value)} />
          <div className="chip-row">
            {[1, 2, 3, 4, 5].map((c) => (
              <button key={c} className={`chip${gCost === c ? " active" : ""}`} onClick={() => setGCost(c)}>COST {c}</button>
            ))}
          </div>
          <select className="field" value={gLane} onChange={(e) => setGLane(e.target.value)}>
            {["technical", "creative", "university", "competitions", "opportunities", "writing", "exercise", "personal"].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="ghost-btn" onClick={() => void addGoal()}>CARVE IT</button>
        </main>
      )}

      {view === "opps" && (
        <main className="panel">
          <div className="section-label">Horizon</div>
          {trayGroups.length === 0 && <p className="empty-note">The tray fills as goals land. Create one below.</p>}
          {trayGroups.map(([lane, gs]) => (
            <section key={lane}>
              <div className="section-label">{lane}</div>
              {gs.map((g) => (
                <div key={g.id} className="goal-row">
                  <h4>{g.title}</h4>
                  <div className="goal-meta">{g.open_tasks} open{g.due_date ? ` · due ${g.due_date}` : ""}</div>
                </div>
              ))}
            </section>
          ))}
        </main>
      )}

      {view === "more" && (
        <main className="panel">
          <div className="section-label">Utility</div>
          <button className="ghost-btn" onClick={() => switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>SWITCH THEME</button>
          <p className="empty-note">Queued: opportunities pipeline, projects, agenda.</p>
        </main>
      )}

      {view === "wall" && (
        <div className={`tray${focus ? " collapsed" : ""}`}>
          <span className="tray-title">Opportunities</span>
          {trayGroups.map(([lane, gs]) => (
            <span key={lane} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="tray-rule" />
              <span className="tray-label">{lane}</span>
              {gs.slice(0, 4).map((g) => (
                <button key={g.id} className="tray-pill" onClick={() => setView("goals")}>
                  <span className="tray-dot" />{g.title}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}

      <nav className="navbar">
        {(["wall", "focus", "goals", "opps", "more"] as View[]).map((v) => (
          <NavButton key={v} active={view === v} onGo={() => setView(v)}>{GLYPHS[v]}</NavButton>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
