import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AuthError, activateGoal, advanceOpportunity, completeTask, createGoal, createOpportunity,
  finishFocus, getActiveSession, getSettings, getWall, listGoals, listOpportunities,
  login, quickCapture, runDecay, saveSetting, startFocus,
} from "./lib/api";
import type { Goal, Opportunity, Task } from "./types";
import { playChime, unlockChime } from "./lib/chime";

type View = "wall" | "focus" | "goals" | "opps" | "more";
type FocusState = { task: Task; secondsLeft: number; sessionId: string | null };

const LIVE_OPP = new Set(["inbox", "applied", "interview", "offer"]);
const KIND_LABEL: Record<string, string> = { learn: "LEARN", compete: "COMPETE", earn: "EARN", other: "OTHER" };

function seedTilt(id: string): CSSProperties {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  const rx = ((h % 401) / 100 - 2).toFixed(2);
  const ry = (((h >>> 3) % 401) / 100 - 2).toFixed(2);
  const tz = ((h >>> 6) % 9).toFixed(1);
  return { "--rx": `${rx}deg`, "--ry": `${ry}deg`, "--tz": `${tz}px` } as CSSProperties;
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
    unlockChime(); // user gesture — opens the audio door for the end-of-session chime
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
  wall: <svg className="i-home" viewBox="0 0 24 24"><path d="M4 11.5 12 4.5l8 7M6.5 10.5V19h11v-8.5M10 19v-5h4v5" /></svg>,
  focus: <svg className="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path className="i-hand" d="M12 12V7.5M12 12l3 2" /></svg>,
  goals: <svg className="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.2" /><circle className="i-dot" cx="12" cy="12" r="1.6" /></svg>,
  opps: <svg className="i-inbox" viewBox="0 0 24 24"><path d="M4 13.5V19h16v-5.5M4 13.5 6.5 5.5h11L20 13.5M4 13.5h5a3 3 0 0 0 6 0h5" /></svg>,
  more: <svg className="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" /></svg>,
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

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppFilter, setOppFilter] = useState("all");
  const [oTitle, setOTitle] = useState(""); const [oOrg, setOOrg] = useState("");
  const [oKind, setOKind] = useState("learn"); const [oDeadline, setODeadline] = useState("");

  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginPw, setLoginPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [qText, setQText] = useState("");

  const wipeRef = useRef<HTMLDivElement>(null);
  const wipeBusy = useRef(false);
  const themeTouched = useRef(false);
  const didResume = useRef(false);
  const finishedSessions = useRef<Set<string>>(new Set());
  const captureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fw-theme");
    document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : "light";
    void (async () => {
      try {
        const s = await getSettings();
        const t = s.theme;
        if ((t === "dark" || t === "light") && !themeTouched.current) {
          document.documentElement.dataset.theme = t;
          localStorage.setItem("fw-theme", t);
        }
      } catch { /* offline or locked — local value stands */ }
    })();
  }, []);

  const switchTheme = useCallback((next: "dark" | "light") => {
    if (document.documentElement.dataset.theme === next) return;
    themeTouched.current = true;
    const apply = () => {
      if (wipeBusy.current) return;
      wipeBusy.current = true;
      document.documentElement.dataset.theme = next;
      localStorage.setItem("fw-theme", next);
      void saveSetting("theme", next).catch(() => { /* server sync best-effort */ });
      wipeRef.current?.classList.remove("running");
      window.setTimeout(() => { wipeBusy.current = false; }, 60);
    };
    const wipe = wipeRef.current;
    if (!wipe || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    wipeBusy.current = false;
    wipe.style.setProperty("--wipe-color", next === "dark" ? "#0B0C0E" : "#F7F5F0");
    wipe.classList.add("running");
    const fallback = window.setTimeout(apply, 950);
    wipe.addEventListener("animationend", () => { window.clearTimeout(fallback); apply(); }, { once: true });
  }, []);

  const refresh = useCallback(async () => {
    try { setWall((await getWall()) as unknown as Record<string, unknown>); setError(""); }
    catch (e) {
      if (e instanceof AuthError) { setNeedsLogin(true); setError(""); }
      else setError(e instanceof Error ? e.message : "Wall unavailable");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // morning clean — decay stale tasks whenever the app opens
  useEffect(() => {
    void (async () => {
      try { const d = await runDecay(); if (d.decayed > 0) void refresh(); }
      catch { /* silent — best-effort */ }
    })();
  }, [refresh]);

  const finishOnce = useCallback(async (sid: string, completed: boolean) => {
    if (finishedSessions.current.has(sid)) return;
    finishedSessions.current.add(sid);
    try { await finishFocus(sid, { completed }); }
    catch { finishedSessions.current.delete(sid); }
  }, []);

  const loadGoals = useCallback(async () => {
    try { setGoals(await listGoals(goalFilter === "all" ? undefined : goalFilter)); }
    catch (e) { setToast(e instanceof Error ? e.message : "Goals unavailable"); }
  }, [goalFilter]);
  useEffect(() => { if (view === "goals") void loadGoals(); }, [view, loadGoals]);

  const loadOpps = useCallback(async () => {
    try { setOpps(await listOpportunities(oppFilter)); }
    catch (e) { setToast(e instanceof Error ? e.message : "Opportunities unavailable"); }
  }, [oppFilter]);
  useEffect(() => { if (view === "wall" || view === "opps") void loadOpps(); }, [view, loadOpps]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // resume an interrupted session once the wall has loaded
  useEffect(() => {
    if (!wall || didResume.current) return;
    didResume.current = true;
    void (async () => {
      try {
        const s = await getActiveSession();
        if (!s) return;
        const planned = (wall.planned as Task[] | undefined) ?? [];
        const smallWins = (wall.small_wins as Task[] | undefined) ?? [];
        const parked = (wall.parked as Task[] | undefined) ?? [];
        const t =
          planned.find((x) => x.id === s.task_id) ??
          smallWins.find((x) => x.id === s.task_id) ??
          parked.find((x) => x.id === s.task_id) ?? {
            id: s.task_id, goal_id: null, title: "Running session", why: null, how: null,
            output: null, lane: "personal", kind: "task", status: "todo",
            attention_cost: 2, planned_date: null, completed_at: null,
          } as Task;
        setFocus({ task: t, secondsLeft: s.remaining_seconds, sessionId: s.id });
        setView("focus");
      } catch { /* ignore */ }
    })();
  }, [wall]);

  useEffect(() => {
    if (!focus) return;
    const iv = window.setInterval(() => {
      setFocus((f) => {
        if (!f || f.secondsLeft <= 1) {
          const sid = f?.sessionId ?? null;
          window.setTimeout(() => {
            void (async () => {
              playChime();
              if (sid) await finishOnce(sid, true);
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
  }, [focus?.sessionId, refresh, finishOnce]);

  // Cmd/Ctrl+K -> capture bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("wall");
        requestAnimationFrame(() => captureRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const quickAdd = useCallback(async () => {
    if (!qText.trim()) return;
    try {
      const r = await quickCapture(qText);
      setQText("");
      setToast(`Captured: ${r.title}${r.due_today ? " — today" : ""}`);
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Capture failed"); }
  }, [qText, refresh]);

  const doLogin = useCallback(async () => {
    try {
      await login(loginPw);
      setNeedsLogin(false); setLoginPw(""); setLoginErr("");
      void refresh();
    } catch (e) { setLoginErr(e instanceof Error ? e.message : "Sign-in failed"); }
  }, [loginPw, refresh]);

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
    if (focus.sessionId) await finishOnce(focus.sessionId, false);
    setFocus(null);
    setToast("Session logged as abandoned.");
    void refresh();
  }, [focus, finishOnce, refresh]);

  const complete = useCallback(async (t: Task) => {
    try {
      await completeTask(t.id);
      setFocus((f) => {
        if (f?.task.id === t.id && f.sessionId) void finishOnce(f.sessionId, false);
        return f?.task.id === t.id ? null : f;
      });
      setToast("Block settled.");
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to settle"); }
  }, [refresh, finishOnce]);

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

  const addOpp = useCallback(async () => {
    if (!oTitle.trim()) return;
    try {
      await createOpportunity({ title: oTitle.trim(), kind: oKind, organisation: oOrg.trim() || undefined, deadline: oDeadline || undefined });
      setOTitle(""); setOOrg(""); setODeadline("");
      setToast("Logged to the horizon.");
      void loadOpps();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to create"); }
  }, [oTitle, oKind, oOrg, oDeadline, loadOpps]);

  const advance = useCallback(async (o: Opportunity, to: string) => {
    try {
      await advanceOpportunity(o.id, { to });
      setToast(`${o.title} — ${to}.`);
      void loadOpps();
    } catch (e) { setToast(e instanceof Error ? e.message : "Move rejected"); }
  }, [loadOpps]);

  const planned = (wall?.planned as Task[] | undefined) ?? [];
  const smallWins = (wall?.small_wins as Task[] | undefined) ?? [];
  const parked = (wall?.parked as Task[] | undefined) ?? [];
  const xp = (wall?.xp_today as number | undefined) ?? 0;
  const streak = (wall?.streak_days as number | undefined) ?? (wall?.streak as number | undefined) ?? 0;
  const doneCount = planned.filter((t) => t.status === "done").length;

  const trayGroups = useMemo(() => {
    const groups: Array<[string, Opportunity[]]> = [];
    for (const kind of ["learn", "compete", "earn", "other"]) {
      const items = opps.filter((o) => o.kind === kind && LIVE_OPP.has(o.status)).slice(0, 5);
      if (items.length) groups.push([KIND_LABEL[kind] ?? kind.toUpperCase(), items]);
    }
    return groups;
  }, [opps]);

  if (needsLogin) {
    return (
      <main className="panel" style={{ paddingTop: "16vh" }}>
        <div className="section-label">Sign in</div>
        <input className="field" type="password" placeholder="Password" value={loginPw} autoFocus
          onChange={(e) => setLoginPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void doLogin(); }} />
        {loginErr && <p className="empty-note">{loginErr}</p>}
        <button className="ghost-btn" onClick={() => void doLogin()}>UNLOCK</button>
      </main>
    );
  }

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
          <div style={{ display: "flex", gap: 8, margin: "4px 0 10px" }}>
            <input ref={captureRef} className="field" style={{ margin: 0 }}
              placeholder="Capture — add !t for today, !25 for minutes"
              value={qText} onChange={(e) => setQText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void quickAdd(); }} />
            <button className="ghost-btn" style={{ height: "auto" }} onClick={() => void quickAdd()}>ADD</button>
          </div>
          {sections.map(([label, items]) => (
            <section key={label}>
              <div className="section-label">{label}</div>
              <div className={`wall-grid${focus ? " locked" : ""}`}>
                {items.map((t, i) => (
                  <article
                    key={t.id}
                    className={`task-card lane-${t.lane}${focus?.task.id === t.id ? " card-active" : ""}${t.status === "done" ? " settled" : ""}`}
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
          <div className="chip-row">
            {["all", "inbox", "applied", "interview", "offer", "won", "rejected", "archived"].map((f) => (
              <button key={f} className={`chip${oppFilter === f ? " active" : ""}`} onClick={() => setOppFilter(f)}>{f}</button>
            ))}
          </div>
          {opps.map((o) => (
            <div key={o.id} className="goal-row">
              <h4>{o.title}</h4>
              <div className="goal-meta">
                {KIND_LABEL[o.kind] ?? o.kind.toUpperCase()}{o.organisation ? ` · ${o.organisation}` : ""}
                {o.deadline ? ` · due ${o.deadline}` : ""}
                {o.url ? <> · <a href={o.url} target="_blank" rel="noreferrer">link</a></> : null}
              </div>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                {o.next_states.map((s) => (
                  <button key={s} className="chip" onClick={() => void advance(o, s)}>{s === "archived" ? "archive" : `→ ${s}`}</button>
                ))}
              </div>
            </div>
          ))}
          {opps.length === 0 && <p className="empty-note">The horizon is clear. Log something below.</p>}
          <div className="section-label">Log opportunity</div>
          <input className="field" placeholder="Title" value={oTitle} onChange={(e) => setOTitle(e.target.value)} />
          <input className="field" placeholder="Organisation" value={oOrg} onChange={(e) => setOOrg(e.target.value)} />
          <input className="field" type="date" value={oDeadline} onChange={(e) => setODeadline(e.target.value)} />
          <div className="chip-row">
            {["learn", "compete", "earn", "other"].map((k) => (
              <button key={k} className={`chip${oKind === k ? " active" : ""}`} onClick={() => setOKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => void addOpp()}>LOG IT</button>
        </main>
      )}

      {view === "more" && (
        <main className="panel">
          <div className="section-label">Utility</div>
          <button className="ghost-btn" onClick={() => switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>SWITCH THEME</button>
          <p className="empty-note">Queued: agenda week strip, reminders.</p>
        </main>
      )}

      {view === "wall" && (
        <div className={`tray${focus ? " collapsed" : ""}`}>
          <span className="tray-title">Horizon</span>
          {trayGroups.length === 0 && <span className="tray-label">quiet for now</span>}
          {trayGroups.map(([label, items], gi) => (
            <span key={label} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {gi > 0 && <span className="tray-rule" />}
              <span className="tray-label">{label}</span>
              {items.map((o) => (
                <button key={o.id} className="tray-pill" onClick={() => setView("opps")}>
                  <span className="tray-dot" />{o.title}
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
