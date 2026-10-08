import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AuthError, activateGoal, addFeed, advanceOpportunity, completeTask, createGoal, createOpportunity,
  deleteGoal, deleteTask, dismissItem, finishFocus, getActiveSession, getAiProfile, getBriefing,
  getReflection, getSettings, getTask, getWall, listFeeds, listGoals, listInsights,
  listOpportunities, listRadar, listReflections, login, pinItem, quickCapture, refreshRadar,
  removeFeed, runDecay, saveAiProfile, saveReflection, saveSetting, startFocus, triageOpportunity,
  updateGoal, updateTask,
} from "./lib/api";
import type {
  AiInsight, DailyBriefing, DiscoveredItem, Goal, Opportunity, ProfileData,
  Reflection, Task, WatchFeed,
} from "./types";
import { playChime, unlockChime } from "./lib/chime";

type View = "wall" | "focus" | "goals" | "opps" | "more";
type FocusState = { task: Task; secondsLeft: number; sessionId: string | null };
type EditDraft = { what: string; minutes: number; recur: string };
type GoalDraft = { title: string; why: string; lane: string; cost: number; due: string };

const LIVE_OPP = new Set(["inbox", "applied", "interview", "offer"]);
const KIND_LABEL: Record<string, string> = { learn: "LEARN", compete: "COMPETE", earn: "EARN", other: "OTHER" };
const REPEAT_OPTS: Array<[string, string]> = [["none", "One-off"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
const FEED_SOURCES: Array<[string, string]> = [
  ["greenhouse", "Greenhouse board slug"],
  ["lever", "Lever board slug"],
  ["remotive", "Remotive — search keyword (optional)"],
  ["jobicy", "Jobicy — search keyword (optional)"],
  ["arbeitnow", "Arbeitnow — filter keyword (optional)"],
];
const MINUTES_OPTS = [15, 30, 45, 60, 90, 120, 180, 240];
const LANES = ["technical", "creative", "university", "competitions", "opportunities", "writing", "exercise", "personal"];

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
    unlockChime();
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
      title={locked ? "Session running" : "Press and hold 1.5s to start the focus timer"}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(); }}
      onKeyUp={stop}
    >
      <span className="hold-fill" />
      <span className="hold-label">{locked ? "LOCKED IN" : "HOLD TO ENGAGE"}</span>
    </button>
  );
}

const NAV_HINTS: Record<View, string> = {
  wall: "Wall — today's blocks, planner's pick",
  focus: "Focus — the running session",
  goals: "Goals — the why behind your blocks",
  opps: "Opportunities — radar, feeds and pipeline",
  more: "More — theme, daily reflection, profile, utility",
};

function NavButton({ active, locked, hint, onGo, children }: { active: boolean; locked?: boolean; hint: string; onGo: () => void; children: ReactNode }) {
  return (
    <button
      className={`nav-btn${active ? " active" : ""}${locked ? " nav-locked" : ""}`}
      aria-label={hint}
      title={hint}
      aria-current={active ? "page" : undefined}
      aria-disabled={locked || undefined}
      disabled={locked}
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
    ><span className="nav-icon">{children}</span></button>
  );
}

const GLYPHS: Record<View, ReactNode> = {
  wall: <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v5M16 10v5M9 15v4" /></svg>,
  focus: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>,
  goals: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r="1.3" /></svg>,
  opps: <svg viewBox="0 0 24 24"><path d="M4 7.5h16v11H4zM4 12h5l1.5 2h3l1.5-2h5M7 7.5l1-3h8l1 3" /></svg>,
  more: <svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /><circle cx="12" cy="12" r="3.2" /></svg>,
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
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppFilter, setOppFilter] = useState("all");
  const [oTitle, setOTitle] = useState(""); const [oOrg, setOOrg] = useState(""); const [oUrl, setOUrl] = useState("");
  const [oKind, setOKind] = useState("learn"); const [oDeadline, setODeadline] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginPw, setLoginPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [qText, setQText] = useState(""); const [qBusy, setQBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [reflText, setReflText] = useState(""); const [reflMood, setReflMood] = useState<string | null>(null);
  const [reflList, setReflList] = useState<Array<{ date: string; body: string; mood: string | null }>>([]);
  const [reflSaved, setReflSaved] = useState(false);
  const [feeds, setFeeds] = useState<WatchFeed[]>([]);
  const [radar, setRadar] = useState<DiscoveredItem[]>([]);
  const [fSource, setFSource] = useState("remotive"); const [fParam, setFParam] = useState(""); const [fLabel, setFLabel] = useState("");
  const [insights, setInsights] = useState<Record<string, AiInsight>>({});
  const [triagingId, setTriagingId] = useState<string | null>(null);
  const [profEdu, setProfEdu] = useState(""); const [profInterests, setProfInterests] = useState("");
  const [profSkills, setProfSkills] = useState(""); const [profExp, setProfExp] = useState("");
  const [profConstraints, setProfConstraints] = useState("");

  const wipeRef = useRef<HTMLDivElement>(null);
  const wipeBusy = useRef(false);
  const themeTouched = useRef(false);
  const didResume = useRef(false);
  const finishedSessions = useRef<Set<string>>(new Set());
  const captureRef = useRef<HTMLInputElement>(null);
  const captureBusy = useRef(false);
  const captureForce = useRef(false);
  const lastCapture = useRef("");
  const aiAddForce = useRef(false);
  const lastAiAdd = useRef("");
  const goalForce = useRef(false);
  const lastGoal = useRef("");
  const radarRefreshedOn = useRef("");

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
      void saveSetting("theme", next).catch(() => { /* best-effort */ });
      wipeRef.current?.classList.remove("running");
      window.setTimeout(() => { wipeBusy.current = false; }, 60);
    };
    const wipe = wipeRef.current;
    if (!wipe || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
    wipeBusy.current = false;
    wipe.style.setProperty("--wipe-color", next === "dark" ? "#08182D" : "#D7E6F5");
    wipe.classList.add("running");
    const fallback = window.setTimeout(apply, 950);
    wipe.addEventListener("animationend", () => { window.clearTimeout(fallback); apply(); }, { once: true });
  }, []);

  const loadBriefing = useCallback(async () => {
    try { setBriefing(await getBriefing()); } catch { /* best-effort */ }
  }, []);

  const refresh = useCallback(async () => {
    try { setWall((await getWall()) as unknown as Record<string, unknown>); setError(""); }
    catch (e) {
      if (e instanceof AuthError) { setNeedsLogin(true); setError(""); }
      else setError(e instanceof Error ? e.message : "Wall unavailable");
    }
    void loadBriefing();
  }, [loadBriefing]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    void (async () => {
      try { const d = await runDecay(); if (d.decayed > 0) void refresh(); }
      catch { /* best-effort */ }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!menuId) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".task-menu") && !t.closest(".kebab-btn") && !t.closest(".pin")) setMenuId(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  useEffect(() => {
    if (!editingId) { setEditDraft(null); return; }
    let alive = true;
    void (async () => {
      try {
        const t = await getTask(editingId);
        if (alive) setEditDraft({ what: t.title, minutes: Math.max(15, Math.round((t.attention_cost ?? 2) * 15)), recur: t.recur ?? "none" });
      } catch { if (alive) { setEditingId(null); setToast("Could not load that block."); } }
    })();
    return () => { alive = false; };
  }, [editingId]);

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

  const loadRadar = useCallback(async () => {
    try { setRadar(await listRadar()); } catch { /* best-effort */ }
  }, []);

  const loadFeeds = useCallback(async () => {
    try { setFeeds(await listFeeds()); } catch { /* best-effort */ }
  }, []);

  const loadInsights = useCallback(async () => {
    try { setInsights(await listInsights()); } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (view !== "opps") return;
    void loadOpps();
    void loadFeeds();
    void loadRadar();
    void loadInsights();
    const today = new Date().toISOString().slice(0, 10);
    if (radarRefreshedOn.current !== today && localStorage.getItem("fw-radar-day") !== today) {
      radarRefreshedOn.current = today;
      localStorage.setItem("fw-radar-day", today);
      void (async () => {
        try {
          const r = await refreshRadar();
          if (r.added > 0) { setToast(`Radar: ${r.added} new role${r.added === 1 ? "" : "s"} found.`); void loadRadar(); }
        } catch { /* best-effort */ }
      })();
    }
  }, [view, loadOpps, loadFeeds, loadRadar, loadInsights]);

  useEffect(() => {
    if (view !== "more") return;
    void (async () => {
      try {
        const r: Reflection = await getReflection();
        if (r) { setReflText(r.body); setReflMood(r.mood); }
        setReflSaved(!!r);
        setReflList(await listReflections(7));
      } catch { /* best-effort */ }
      try {
        const p: ProfileData = await getAiProfile();
        const s = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : "");
        setProfEdu(s(p.education)); setProfInterests(s(p.interests)); setProfSkills(s(p.skills));
        setProfExp(s(p.experience)); setProfConstraints(s(p.constraints));
      } catch { /* best-effort — profile stays local until first save */ }
    })();
  }, [view]);

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
    if (captureBusy.current || qBusy || !qText.trim()) return;
    captureBusy.current = true;
    setQBusy(true);
    try {
      let text = qText.trim();
      const repeat = text.match(/!(daily|weekly|monthly)\b/i);
      if (repeat) text = text.replace(repeat[0], "").trim();
      const force = captureForce.current && text === lastCapture.current;
      const r = await quickCapture(text, force);
      if (!r.created && r.duplicate_of) {
        captureForce.current = true;
        lastCapture.current = text;
        setToast(`Already open: "${r.duplicate_of}" — press ADD again to log anyway.`);
        return;
      }
      captureForce.current = false;
      lastCapture.current = "";
      if (repeat && r.created) {
        try { await updateTask(r.id, { recur: repeat[1].toLowerCase() as "daily" | "weekly" | "monthly" }); }
        catch { /* block still captured */ }
      }
      setQText("");
      setToast(`Captured: ${r.title}${repeat ? ` · repeats ${repeat[1].toLowerCase()}` : r.due_today ? " — today" : ""}`);
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Capture failed"); }
    finally { captureBusy.current = false; setQBusy(false); }
  }, [qBusy, qText, refresh]);

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
      setToast(t.recur && t.recur !== "none" ? `Settled — next one queued (${t.recur}).` : "Block settled.");
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to settle"); }
  }, [refresh, finishOnce]);

  const removeBlock = useCallback(async (t: Task) => {
    setMenuId(null);
    try {
      await deleteTask(t.id);
      setFocus((f) => (f?.task.id === t.id ? null : f));
      setToast("Block removed.");
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Delete failed"); }
  }, [refresh]);

  const saveEdit = useCallback(async (t: Task) => {
    if (!editDraft) return;
    const what = editDraft.what.trim();
    if (!what) { setToast("Title can't be empty."); return; }
    try {
      await updateTask(t.id, {
        what,
        estimated_minutes: editDraft.minutes,
        recur: editDraft.recur as "none" | "daily" | "weekly" | "monthly",
      });
      setEditingId(null);
      setToast("Saved.");
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Save failed"); }
  }, [editDraft, refresh]);

  const addGoal = useCallback(async () => {
    if (!gTitle.trim()) return;
    const force = goalForce.current && gTitle.trim().toLowerCase() === lastGoal.current;
    try {
      const r = await createGoal({ title: gTitle.trim(), why: gWhy.trim() || undefined, lane: gLane, attention_cost: gCost, importance: gCost, due_date: gDue || undefined, force });
      if (r.created === false && r.duplicate_of) {
        goalForce.current = true;
        lastGoal.current = gTitle.trim().toLowerCase();
        setToast(`"${r.duplicate_of}" already exists — tap CARVE IT again to add anyway.`);
        return;
      }
      goalForce.current = false; lastGoal.current = "";
      setGTitle(""); setGWhy(""); setGDue("");
      setToast("Goal carved.");
      void loadGoals();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to create"); }
  }, [gTitle, gWhy, gLane, gCost, gDue, loadGoals]);

  const saveGoalEdit = useCallback(async (g: Goal) => {
    if (!goalDraft) return;
    const title = goalDraft.title.trim();
    if (!title) { setToast("Title can't be empty."); return; }
    try {
      await updateGoal(g.id, { title, why: goalDraft.why.trim() || null, lane: goalDraft.lane, attention_cost: goalDraft.cost, importance: goalDraft.cost, due_date: goalDraft.due || null });
      setEditingGoalId(null);
      setToast("Goal saved.");
      void loadGoals();
    } catch (e) { setToast(e instanceof Error ? e.message : "Save failed"); }
  }, [goalDraft, loadGoals]);

  const removeGoal = useCallback(async (g: Goal) => {
    try {
      await deleteGoal(g.id);
      setEditingGoalId(null);
      setToast("Goal removed.");
      void loadGoals();
    } catch (e) { setToast(e instanceof Error ? e.message : "Delete failed"); }
  }, [loadGoals]);

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
      await createOpportunity({ title: oTitle.trim(), kind: oKind, organisation: oOrg.trim() || undefined, url: oUrl.trim() || undefined, deadline: oDeadline || undefined });
      setOTitle(""); setOOrg(""); setOUrl(""); setODeadline("");
      setToast("Logged to the horizon.");
      void loadOpps();
    } catch (e) { setToast(e instanceof Error ? e.message : "Failed to create"); }
  }, [oTitle, oKind, oOrg, oUrl, oDeadline, loadOpps]);

  const advance = useCallback(async (o: Opportunity, to: string) => {
    try {
      await advanceOpportunity(o.id, { to });
      setToast(`${o.title} — ${to}.`);
      void loadOpps();
    } catch (e) { setToast(e instanceof Error ? e.message : "Move rejected"); }
  }, [loadOpps]);

  const runTriage = useCallback(async (o: Opportunity) => {
    if (triagingId) return;
    setTriagingId(o.id);
    try {
      const ins = await triageOpportunity(o.id);
      setInsights((prev) => ({ ...prev, [o.id]: ins }));
      setToast(`${o.title}: ${ins.verdict.toUpperCase()} — fit ${ins.fit_score}/100.`);
    } catch (e) { setToast(e instanceof Error ? e.message : "Triage failed"); }
    finally { setTriagingId(null); }
  }, [triagingId]);

  const addAiAction = useCallback(async (text: string) => {
    if (captureBusy.current || !text.trim()) return;
    captureBusy.current = true;
    try {
      const force = aiAddForce.current && text === lastAiAdd.current;
      const r = await quickCapture(text, force);
      if (!r.created && r.duplicate_of) {
        aiAddForce.current = true;
        lastAiAdd.current = text;
        setToast(`Already open: "${r.duplicate_of}" — press ADD again to log anyway.`);
        return;
      }
      aiAddForce.current = false; lastAiAdd.current = "";
      setToast(`Captured: ${r.title}`);
      void refresh();
    } catch (e) { setToast(e instanceof Error ? e.message : "Capture failed"); }
    finally { captureBusy.current = false; }
  }, [refresh]);

  const saveProfileCard = useCallback(async () => {
    try {
      await saveAiProfile({
        education: profEdu.trim(), interests: profInterests.trim(), skills: profSkills.trim(),
        experience: profExp.trim(), constraints: profConstraints.trim(),
      });
      setToast("Profile saved — the AI reads this on every triage.");
    } catch (e) { setToast(e instanceof Error ? e.message : "Save failed"); }
  }, [profEdu, profInterests, profSkills, profExp, profConstraints]);

  const addFeedRow = useCallback(async () => {
    if (!fLabel.trim() && !fParam.trim()) { setToast("Give the feed a name."); return; }
    try {
      await addFeed({ source: fSource, param: fParam.trim(), label: fLabel.trim() || fParam.trim() || fSource });
      setFParam(""); setFLabel("");
      setToast("Feed added.");
      void loadFeeds();
    } catch (e) { setToast(e instanceof Error ? e.message : "Feed rejected"); }
  }, [fSource, fParam, fLabel, loadFeeds]);

  const removeFeedRow = useCallback(async (f: WatchFeed) => {
    try {
      await removeFeed(f.id);
      setToast(`Feed removed: ${f.label}`);
      void loadFeeds();
    } catch (e) { setToast(e instanceof Error ? e.message : "Remove failed"); }
  }, [loadFeeds]);

  const manualRefresh = useCallback(async () => {
    try {
      const r = await refreshRadar();
      if (r.skipped) setToast(`Radar refreshed recently — next in ~${r.next_refresh_in_minutes ?? 0} min.`);
      else setToast(r.added > 0 ? `${r.added} new role${r.added === 1 ? "" : "s"} found.` : "Radar up to date.");
      void loadRadar();
    } catch (e) { setToast(e instanceof Error ? e.message : "Refresh failed"); }
  }, [loadRadar]);

  const pinRow = useCallback(async (d: DiscoveredItem) => {
    try {
      await pinItem(d.id);
      setToast("Pinned to your pipeline.");
      void loadRadar();
      if (view === "opps") void loadOpps();
    } catch (e) { setToast(e instanceof Error ? e.message : "Pin failed"); }
  }, [loadRadar, loadOpps, view]);

  const dismissRow = useCallback(async (d: DiscoveredItem) => {
    try {
      await dismissItem(d.id);
      void loadRadar();
    } catch { /* best-effort */ }
  }, [loadRadar]);

  const saveRefl = useCallback(async () => {
    if (!reflText.trim()) { setToast("Write a line first — even one honest sentence."); return; }
    try {
      await saveReflection(reflText.trim(), reflMood);
      setReflSaved(true);
      setToast("Reflection saved for today.");
      setReflList(await listReflections(7));
      void loadBriefing();
    } catch (e) { setToast(e instanceof Error ? e.message : "Save failed"); }
  }, [reflText, reflMood, loadBriefing]);

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
          <span title="Experience earned today">XP {xp}</span>
          <span title="Consecutive days with a settled block">STREAK {streak}D</span>
          <span title="Core blocks settled today">{String(doneCount).padStart(2, "0")} / {String(planned.length).padStart(2, "0")}</span>
          <button className="theme-btn" aria-label="Switch theme — syncs across your devices" title="Switch theme (syncs to your account)"
            onClick={() => switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>◐</button>
        </div>
      </header>
      {error && <div className="error-note">{error}</div>}

      {view === "wall" && (
        <main className="wall-viewport">
          {briefing && (
            <div className="briefing" title="Your day at a glance — live from your data">
              <span><b>{briefing.done_today}</b> done</span><span className="sep">·</span>
              <span><b>{briefing.focus_minutes}</b> focus min</span><span className="sep">·</span>
              <span><b>{briefing.open_tasks}</b> open</span>
              {briefing.next_deadline && (<><span className="sep">·</span><span>next due: <b>{briefing.next_deadline.title}</b> ({briefing.next_deadline.deadline})</span></>)}
              {!briefing.reflection_done && <button className="chip" title="One honest line about today — lives in More" onClick={() => setView("more")}>reflect?</button>}
            </div>
          )}
          <div className="focus-dock">
            <div className="focus-dock-copy">
              <span className="focus-kicker">{focus ? "FOCUSING NOW" : "FOCUS NEXT"}</span>
              <strong>{focus ? focus.task.title : (planned[0]?.title ?? "Nothing queued")}</strong>
              <span className="focus-sub">{focus ? "Stay here. The wall is locked until this session ends." : "Choose one block. Hold to start. Everything else can wait."}</span>
            </div>
            <div className="focus-dock-action">
              <span className="focus-dock-time">
                {focus ? fmt(focus.secondsLeft) : planned[0] ? `${String((planned[0].attention_cost ?? 2) * 15).padStart(2, "0")}:00` : "--:--"}
              </span>
              {focus ? (
                <button className="ghost-btn focus-end" title="Stop now — logged as abandoned" onClick={() => void abandon()}>END</button>
              ) : planned[0] ? (
                <HoldButton locked={false} onEngaged={() => void engage(planned[0])} />
              ) : (
                <button className="ghost-btn" disabled>EMPTY</button>
              )}
            </div>
          </div>
          <div className="capture-row">
            <input ref={captureRef} className="field" style={{ margin: 0 }}
              title="Bare capture = 45 min (a real block). !25 = 25 minutes (under 30 = small win). !t = due today. !daily !weekly !monthly = repeats. Duplicate titles ask first."
              placeholder="Capture a block… !t today · !25 for 25 min · !daily"
              value={qText} onChange={(e) => setQText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void quickAdd(); }} />
            <button className="ghost-btn capture-add" disabled={qBusy} title="Add the line above (or just press Enter)" onClick={() => void quickAdd()}>ADD</button>
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
                    <button
                      className="pin"
                      aria-label="Task options — edit or delete"
                      aria-haspopup="menu"
                      aria-expanded={menuId === t.id}
                      title="Edit or delete this block"
                      onClick={(e) => { e.stopPropagation(); setMenuId(menuId === t.id ? null : t.id); }}
                    />
                    <div className="card-tilt" style={seedTilt(t.id)}>
                      <div className="card-top">
                        <span className="lane-tag" title="Which part of life this block serves">{t.lane}</span>
                        <span className="fraction" title="Position on today's wall">
                          {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                          <button
                            className="kebab-btn"
                            aria-label="Task options — edit or delete"
                            aria-haspopup="menu"
                            aria-expanded={menuId === t.id}
                            title="Edit or delete this block"
                            onClick={(e) => { e.stopPropagation(); setMenuId(menuId === t.id ? null : t.id); }}
                          >⋯</button>
                        </span>
                      </div>
                      {menuId === t.id && (
                        <div className="task-menu" role="menu">
                          <button role="menuitem" title="Change title, minutes or repeat rule" onClick={() => { setMenuId(null); setEditingId(t.id); }}>Edit</button>
                          <button role="menuitem" title="Remove this block immediately (no undo)" onClick={() => void removeBlock(t)}>Delete</button>
                        </div>
                      )}
                      {editingId === t.id && editDraft ? (
                        <div className="edit-form">
                          <input className="field" style={{ margin: 0 }} aria-label="Task title" value={editDraft.what} autoFocus
                            onChange={(e) => setEditDraft({ ...editDraft, what: e.target.value })} />
                          <div className="edit-row">
                            <select className="field" style={{ margin: 0 }} aria-label="Minutes" value={editDraft.minutes}
                              title="How long one block takes"
                              onChange={(e) => setEditDraft({ ...editDraft, minutes: Number(e.target.value) })}>
                              {MINUTES_OPTS.map((m) => <option key={m} value={m}>{m} min</option>)}
                            </select>
                            <select className="field" style={{ margin: 0 }} aria-label="Repeat" value={editDraft.recur}
                              title="Repeats automatically — a fresh copy appears each cycle"
                              onChange={(e) => setEditDraft({ ...editDraft, recur: e.target.value })}>
                              {REPEAT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div className="edit-row">
                            <button className="ghost-btn" style={{ height: "auto", flex: 1 }} title="Apply changes" onClick={() => void saveEdit(t)}>SAVE</button>
                            <button className="ghost-btn" style={{ height: "auto", flex: 1 }} title="Discard changes" onClick={() => setEditingId(null)}>CANCEL</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="card-title" title={t.recur && t.recur !== "none" ? `Repeats ${t.recur}` : undefined}>{t.title}</h3>
                          {t.how && <p className="how-line">{t.how}</p>}
                        </>
                      )}
                      <div className="base-plate">
                        <span className={`plate-timer${focus?.task.id === t.id ? " live" : ""}`}>
                          {focus && focus.task.id === t.id ? fmt(focus.secondsLeft) : `${String((t.attention_cost ?? 2) * 15).padStart(2, "0")}:00`}
                        </span>
                        {t.status !== "done" && focus?.task.id !== t.id && <HoldButton locked={false} onEngaged={() => void engage(t)} />}
                        <button className="ghost-btn" title="Mark done — it stays on the wall as evidence" onClick={() => void complete(t)}>SETTLE</button>
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
              <div className="focus-lock-note"><span className="focus-pin-mark" aria-hidden="true" /> THE WALL IS CLOSED</div>
              <p className="focus-whisper">One thing. Stay with it.</p>
              <h2 className="focus-title">{focus.task.title}</h2>
              <div className="focus-count">{fmt(focus.secondsLeft)}</div>
              <p className="focus-footer">You don't need to remember anything else right now.</p>
              <button className="ghost-btn" title="Stop now — logged as abandoned, still honest data" onClick={() => void abandon()}>END EARLY</button>
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
              {editingGoalId === g.id && goalDraft ? (
                <div className="edit-form">
                  <input className="field" style={{ margin: 0 }} aria-label="Goal title" value={goalDraft.title}
                    onChange={(e) => setGoalDraft({ ...goalDraft, title: e.target.value })} />
                  <input className="field" style={{ margin: 0 }} aria-label="Why it matters" placeholder="Why it matters"
                    value={goalDraft.why} onChange={(e) => setGoalDraft({ ...goalDraft, why: e.target.value })} />
                  <div className="edit-row">
                    <select className="field" style={{ margin: 0 }} aria-label="Cost" value={goalDraft.cost} title="How much attention this goal demands"
                      onChange={(e) => setGoalDraft({ ...goalDraft, cost: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>COST {c}</option>)}
                    </select>
                    <input className="field" style={{ margin: 0 }} type="date" aria-label="Due date" value={goalDraft.due}
                      onChange={(e) => setGoalDraft({ ...goalDraft, due: e.target.value })} />
                  </div>
                  <select className="field" style={{ margin: 0 }} aria-label="Lane" value={goalDraft.lane}
                    onChange={(e) => setGoalDraft({ ...goalDraft, lane: e.target.value })}>
                    {LANES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <div className="edit-row">
                    <button className="ghost-btn" style={{ height: "auto", flex: 1 }} title="Apply changes" onClick={() => void saveGoalEdit(g)}>SAVE</button>
                    <button className="ghost-btn" style={{ height: "auto", flex: 1 }} title="Discard changes" onClick={() => setEditingGoalId(null)}>CANCEL</button>
                  </div>
                </div>
              ) : (
                <>
                  <h4>{g.title}</h4>
                  {g.why && <p>{g.why}</p>}
                  <div className="goal-meta">{g.lane} · cost {g.attention_cost} · {g.open_tasks} open{g.due_date ? ` · due ${g.due_date}` : ""}</div>
                  <div className="chip-row" style={{ marginBottom: 0 }}>
                    <button className="chip" title="Edit this goal"
                      onClick={() => { setEditingGoalId(g.id); setGoalDraft({ title: g.title, why: g.why ?? "", lane: g.lane, cost: g.attention_cost, due: g.due_date ?? "" }); }}>EDIT</button>
                    <button className="chip" title="Delete this goal — blocked while it still has tasks" onClick={() => void removeGoal(g)}>DELETE</button>
                    {g.status !== "active" && <button className="chip" title="Put this goal's tasks on the wall" onClick={() => void activate(g)}>ACTIVATE</button>}
                  </div>
                </>
              )}
            </div>
          ))}
          {goals.length === 0 && <p className="empty-note">No goals here yet.</p>}
          <div className="section-label">New goal</div>
          <input className="field" placeholder="Title" value={gTitle} onChange={(e) => { setGTitle(e.target.value); goalForce.current = false; }} />
          <input className="field" placeholder="Why it matters" value={gWhy} onChange={(e) => setGWhy(e.target.value)} />
          <input className="field" type="date" value={gDue} onChange={(e) => setGDue(e.target.value)} />
          <div className="chip-row">
            {[1, 2, 3, 4, 5].map((c) => (
              <button key={c} className={`chip${gCost === c ? " active" : ""}`} onClick={() => setGCost(c)}>COST {c}</button>
            ))}
          </div>
          <select className="field" value={gLane} onChange={(e) => setGLane(e.target.value)}>
            {LANES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="ghost-btn" title="Create the goal — warns if one with this name already exists" onClick={() => void addGoal()}>CARVE IT</button>
        </main>
      )}

      {view === "opps" && (
        <main className="panel">
          <div className="chip-row">
            {["all", "inbox", "applied", "interview", "offer", "won", "rejected", "archived"].map((f) => (
              <button key={f} className={`chip${oppFilter === f ? " active" : ""}`} onClick={() => setOppFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="section-label">Radar — roles found for you</div>
          <button className="ghost-btn" title="Pull fresh roles from all your feeds (auto-capped at once per 4h)" onClick={() => void manualRefresh()}>REFRESH NOW</button>
          {radar.map((d) => (
            <div key={d.id} className="goal-row">
              <h4>{d.title}</h4>
              <div className="goal-meta">
                <span className="src-tag">{d.source}</span>
                {" "}{d.organisation ?? ""}{d.eligibility ? ` · ${d.eligibility}` : " · location unknown"}
              </div>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                <button className="chip" title="Move into your pipeline below" onClick={() => void pinRow(d)}>PIN</button>
                {d.url && <a className="chip" href={d.url} target="_blank" rel="noreferrer" title="Open the original posting">OPEN</a>}
                <button className="chip" title="Hide — it won't come back" onClick={() => void dismissRow(d)}>DISMISS</button>
              </div>
            </div>
          ))}
          {radar.length === 0 && <p className="empty-note">Nothing surfaced yet. Add feeds below, then refresh.</p>}

          <div className="section-label">Feeds — where roles come from</div>
          {feeds.map((f) => (
            <div key={f.id} className="goal-row">
              <h4>{f.label}</h4>
              <div className="goal-meta"><span className="src-tag">{f.source}</span>{f.param ? ` · ${f.param}` : ""}</div>
              <button className="ghost-btn" title="Stop watching this feed" onClick={() => void removeFeedRow(f)}>REMOVE</button>
            </div>
          ))}
          <div className="edit-row">
            <select className="field" style={{ margin: 0 }} aria-label="Feed source" value={fSource}
              title="Where to pull roles from"
              onChange={(e) => setFSource(e.target.value)}>
              {FEED_SOURCES.map(([v, l]) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input className="field" style={{ margin: 0 }} aria-label="Feed slug or keyword" placeholder={fSource === "greenhouse" || fSource === "lever" ? "board-slug" : "keyword (optional)"}
              value={fParam} onChange={(e) => setFParam(e.target.value)} />
          </div>
          <input className="field" placeholder="Name it (e.g. Quant internships)" value={fLabel} onChange={(e) => setFLabel(e.target.value)} />
          <button className="ghost-btn" title="Start watching this source" onClick={() => void addFeedRow()}>WATCH</button>

          <div className="section-label" title="Pinned roles you're acting on — TRIAGE asks the AI to score each against your profile">Pipeline</div>
          {opps.map((o) => (
            <div key={o.id} className="goal-row">
              <h4>{o.title}</h4>
              <div className="goal-meta">
                {KIND_LABEL[o.kind] ?? o.kind.toUpperCase()}{o.organisation ? ` · ${o.organisation}` : ""}
                {o.deadline ? ` · due ${o.deadline}` : ""}
                {o.url ? <> · <a href={o.url} target="_blank" rel="noreferrer">link</a></> : null}
              </div>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                <button className="chip" disabled={triagingId === o.id}
                  title="Ask the AI to score this against your profile — reads the linked page or the Notes field"
                  onClick={() => void runTriage(o)}>{triagingId === o.id ? "…" : "TRIAGE"}</button>
                {o.next_states.map((s) => (
                  <button key={s} className="chip" title={`Move to ${s}`} onClick={() => void advance(o, s)}>{s === "archived" ? "archive" : `→ ${s}`}</button>
                ))}
              </div>
              {insights[o.id] && (() => {
                const ins = insights[o.id];
                return (
                  <div className="ai-panel">
                    <div className="ai-head">
                      <span className={`ai-badge ai-${ins.verdict}`} title="The AI's verdict — chase, maybe, skip, or expired">{ins.verdict.toUpperCase()}</span>
                      <span className="ai-score" title="Honest fit score against your profile">FIT {ins.fit_score}/100</span>
                      {ins.deadline && <span className="ai-deadline" title="Extracted by AI — verify on the posting before trusting it">due {ins.deadline} (AI, unverified)</span>}
                    </div>
                    {(ins.read_title || ins.read_org) && (
                      <div className="ai-read" title="What the AI says it analyzed — if this looks wrong, the page fetch grabbed the wrong thing">AI read: {ins.read_title}{ins.read_org ? ` — ${ins.read_org}` : ""}</div>
                    )}
                    {ins.why_fits.length > 0 && (
                      <>
                        <div className="ai-label">WHY IT FITS</div>
                        <ul>{ins.why_fits.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    )}
                    {ins.concerns.length > 0 && (
                      <>
                        <div className="ai-label">VERIFY FIRST</div>
                        <ul>{ins.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </>
                    )}
                    {ins.documents.length > 0 && (
                      <>
                        <div className="ai-label">NEEDS</div>
                        <p>{ins.documents.join(" · ")}</p>
                      </>
                    )}
                    {ins.actions.length > 0 && (
                      <>
                        <div className="ai-label">DO NEXT</div>
                        {ins.actions.map((a, i) => (
                          <div key={i} className="ai-action">
                            <span>{a}</span>
                            <button className="chip" title="Add this as a block on your wall (warns if one already exists)" onClick={() => void addAiAction(a)}>ADD</button>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="ai-meta" title="Which model produced this, and when">{ins.model} · {ins.created_at.slice(0, 10)}</div>
                  </div>
                );
              })()}
            </div>
          ))}
          {opps.length === 0 && <p className="empty-note">The horizon is clear. Log something below.</p>}

          <div className="section-label">Log opportunity — paste any link</div>
          <input className="field" placeholder="Title" value={oTitle} onChange={(e) => setOTitle(e.target.value)} />
          <input className="field" placeholder="Organisation" value={oOrg} onChange={(e) => setOOrg(e.target.value)} />
          <input className="field" placeholder="URL — e.g. an intern-list or LinkedIn post" value={oUrl} onChange={(e) => setOUrl(e.target.value)} />
          <input className="field" type="date" value={oDeadline} onChange={(e) => setODeadline(e.target.value)} />
          <div className="chip-row">
            {["learn", "compete", "earn", "other"].map((k) => (
              <button key={k} className={`chip${oKind === k ? " active" : ""}`} onClick={() => setOKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <button className="ghost-btn" title="Save it to your pipeline" onClick={() => void addOpp()}>LOG IT</button>
        </main>
      )}

      {view === "more" && (
        <main className="panel">
          <div className="section-label">Today's reflection — one honest line</div>
          <textarea className="field" rows={4} placeholder="What actually happened today? What dragged, what moved?"
            value={reflText} onChange={(e) => { setReflText(e.target.value); setReflSaved(false); }} />
          <div className="chip-row">
            {[["great", "Great"], ["okay", "Okay"], ["rough", "Rough"]].map(([v, l]) => (
              <button key={v} className={`chip${reflMood === v ? " active" : ""}`} title={`Today felt ${l.toLowerCase()}`} onClick={() => { setReflMood(reflMood === v ? null : v); setReflSaved(false); }}>{l}</button>
            ))}
          </div>
          <button className="ghost-btn" title="One entry per day — saving again overwrites today's" onClick={() => void saveRefl()}>{reflSaved ? "UPDATE TODAY" : "SAVE"}</button>
          {reflList.length > 0 && (
            <>
              <div className="section-label">Last {reflList.length} days</div>
              {reflList.map((r) => (
                <div key={r.date} className="refl-item">
                  <div className="goal-meta">{r.date}{r.mood ? ` · ${r.mood}` : ""}</div>
                  <p>{r.body}</p>
                </div>
              ))}
            </>
          )}
          <div className="section-label" title="The AI reads this every time it triages an opportunity — keep it current">Your profile — what the AI knows about you</div>
          <input className="field" placeholder="Education — e.g. BSc Computer Science, Babcock University, 200L, class of 2029" value={profEdu}
            onChange={(e) => setProfEdu(e.target.value)} />
          <input className="field" placeholder="Interests — comma separated, e.g. AI, data science, technical writing" value={profInterests}
            onChange={(e) => setProfInterests(e.target.value)} />
          <input className="field" placeholder="Skills — comma separated, e.g. Python, pandas, Git" value={profSkills}
            onChange={(e) => setProfSkills(e.target.value)} />
          <input className="field" placeholder="Experience — e.g. GDG RADAR co-lead, course rep, projects" value={profExp}
            onChange={(e) => setProfExp(e.target.value)} />
          <input className="field" placeholder="Constraints — e.g. paid or funded only, no roles needing US/EU work authorization" value={profConstraints}
            onChange={(e) => setProfConstraints(e.target.value)} />
          <button className="ghost-btn" title="Save your profile — the AI scores every opportunity against exactly this" onClick={() => void saveProfileCard()}>SAVE PROFILE</button>
          <div className="section-label">Utility</div>
          <button className="ghost-btn" title="Switch between dark and light — saved to your account" onClick={() => switchTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")}>SWITCH THEME</button>
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
                <button key={o.id} className="tray-pill" title="Open the opportunities view" onClick={() => setView("opps")}>
                  <span className="tray-dot" />{o.title}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}

      <nav className="navbar">
        {(["wall", "focus", "goals", "opps", "more"] as View[]).map((v) => {
          const navLocked = Boolean(focus && v !== "focus");
          return (
            <NavButton key={v} active={view === v} locked={navLocked} hint={navLocked ? "Locked in — finish the block before leaving focus." : NAV_HINTS[v]} onGo={() => setView(v)}>
              {GLYPHS[v]}<span className="nav-label">{v === "opps" ? "RADAR" : v.toUpperCase()}</span>
            </NavButton>
          );
        })}
      </nav>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}