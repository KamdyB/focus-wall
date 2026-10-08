import { useEffect, useMemo, useState } from "react";
import { askStudyCoach, deleteLegacyStudySnapshot, getStudyCloudState, saveStudyCloudState } from "./lib/api";
import "./StudyLab.css";

type Resource = { id: string; title: string; url?: string; area: string; note: string };
type StudyRecord = { id: string; date: string; resource: string; minutes: number; evidence: string; steps: string[] };
type StudySaved = { selected: string; completed: string[]; notes: string; records: StudyRecord[]; customResources: Resource[]; updatedAt: number };
const KEY = "fw-study-lab-v1";
const RESOURCES: Resource[] = [
  { id: "spiral-matrix", title: "Spiral Matrix — solve unaided first", url: "https://leetcode.com/problems/spiral-matrix/", area: "Algorithms", note: "Trace four boundaries; handle single rows/columns; explain why each boundary moves inward." },
  { id: "aced", title: "ACEd — system design learning", url: "https://www.aced.io", area: "System design", note: "Choose one concept, write your own explanation, then sketch a design from memory." },
  { id: "python-tutorial", title: "The Python Tutorial", url: "https://docs.python.org/3/tutorial/", area: "Python", note: "Read a small section, close the page, and recreate the example without copying." },
  { id: "python-structures", title: "Python data structures", url: "https://docs.python.org/3/tutorial/datastructures.html", area: "Python", note: "Compare list, tuple, set and dict; implement a tiny example and state trade-offs." },
  { id: "python-packaging", title: "Python Packaging User Guide", url: "https://packaging.python.org/en/latest/", area: "Python", note: "Practise imports, packages, project metadata and a README." },
  { id: "pandas", title: "pandas getting started", url: "https://pandas.pydata.org/docs/getting_started/index.html", area: "Data", note: "Load a small dataset, inspect it, transform it, and explain each operation." },
  { id: "hackerrank", title: "HackerRank Interview Preparation Kit", url: "https://www.hackerrank.com/interview/interview-preparation-kit", area: "Interview practice", note: "Attempt independently; record the pattern and complexity before checking editorial material." },
  { id: "hello-interview", title: "Hello Interview", url: "https://www.hellointerview.com/", area: "Interview practice", note: "Use for interview structure and system-design practice; do the first attempt without AI." },
  { id: "think-python", title: "Think Python — free book", url: "https://greenteapress.com/wp/think-python-3rd-edition/", area: "Book", note: "Read a chapter actively; answer exercises in your own file before looking at solutions." },
  { id: "mit-algorithms", title: "MIT OpenCourseWare — Introduction to Algorithms", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/", area: "Algorithms", note: "Use lecture notes and problem sets to deepen complexity and algorithmic reasoning." },
  { id: "visualgo", title: "VisuAlgo", url: "https://visualgo.net/en", area: "Visualisation", note: "Predict each step before animating it; then reproduce the algorithm on paper." },
  { id: "cs50p", title: "Harvard CS50P — Introduction to Programming with Python", url: "https://cs50.harvard.edu/python/", area: "Python", note: "Use problem sets as closed-book practice. Explain each design choice before checking any hints." },
  { id: "sqlbolt", title: "SQLBolt interactive lessons", url: "https://sqlbolt.com/", area: "SQL / data engineering", note: "Write queries yourself, then explain filtering, joins and aggregation in plain language." },
  { id: "kaggle-learn", title: "Kaggle Learn micro-courses", url: "https://www.kaggle.com/learn", area: "Data / ML", note: "Pair each lesson with an independent notebook and a small written interpretation." },
  { id: "fastai", title: "fast.ai — Practical Deep Learning for Coders", url: "https://course.fast.ai/", area: "AI / ML", note: "Start after Python and data foundations; reproduce one experiment and explain its limits." },
  { id: "ml-book", title: "An Introduction to Statistical Learning — free textbooks", url: "https://www.statlearning.com/", area: "Book / machine learning", note: "Read selectively alongside statistics; work through exercises before reading solutions." },
  { id: "system-design-primer", title: "System Design Primer", url: "https://github.com/donnemartin/system-design-primer", area: "System design", note: "Draw the system from memory, identify bottlenecks, then compare against the guide." },
  { id: "system-design-interview", title: "Hello Interview — system design guides", url: "https://www.hellointerview.com/learn/system-design/in-a-hurry/introduction", area: "System design", note: "Practise requirements, APIs, data model, scaling and trade-offs on paper before reviewing." },
  { id: "podcast-data-skeptic", title: "Data Skeptic podcast", url: "https://dataskeptic.com/", area: "Podcast / research", note: "After an episode, write the claim, evidence, assumptions and one question to investigate." },
  { id: "podcast-softeng", title: "Software Engineering Daily podcast", url: "https://softwareengineeringdaily.com/", area: "Podcast / software engineering", note: "Treat episodes as prompts for follow-up reading and a short technical explanation." },
  { id: "charka", title: "Charka AI — shared in your study group", area: "Interview practice", note: "URL not verified. Add the exact link manually if you want it tracked; do not rely on it for unaided practice." },
];
const PIPELINE = ["Concept", "Understand", "Attempt unaided", "Debug", "Reinforce", "Practise", "Build", "Ship"];
const DURATIONS = [25, 50, 90, 120, 180, 240, 360, 480];

function loadSaved(): StudySaved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const parsed = JSON.parse(raw); return { selected: "spiral-matrix", completed: [], notes: "", records: [], customResources: [], updatedAt: 0, ...parsed }; }
  } catch { /* storage may be unavailable */ }
  return { selected: "spiral-matrix", completed: [], notes: "", records: [], customResources: [], updatedAt: 0 };
}

export default function StudyLab() {
  const [saved, setSaved] = useState<StudySaved>(loadSaved);
  const [minutes, setMinutes] = useState(90);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Saved locally on this device.");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachReply, setCoachReply] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const resources = useMemo(() => [...RESOURCES, ...saved.customResources], [saved.customResources]);
  const current = resources.find((r) => r.id === saved.selected) ?? RESOURCES[0];
  const remaining = Math.max(0, secondsLeft);
  const time = `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* keep the current session usable */ }
  }, [saved]);

  // Load the complete Study Lab record before enabling writes. Merge instead of
  // replacing so a device with offline work cannot erase existing cloud evidence.
  useEffect(() => {
    let alive = true;
    getStudyCloudState().then(({ data, updated_at }) => {
      if (!alive) return;
      if (!data) {
        setCloudStatus("No full cloud study record yet. Your local work is preserved and will sync.");
        setCloudReady(true);
        return;
      }
      const cloud: StudySaved = {
        selected: data.selected || "spiral-matrix",
        completed: Array.isArray(data.completed) ? data.completed : [],
        notes: typeof data.notes === "string" ? data.notes : "",
        records: Array.isArray(data.records) ? data.records : [],
        customResources: Array.isArray(data.customResources) ? data.customResources : [],
        updatedAt: Number(data.updatedAt) || (updated_at ? Date.parse(updated_at) : 0) || 0,
      };
      setSaved((local) => {
        const cloudIsNewer = cloud.updatedAt > local.updatedAt;
        const recordMap = new Map<string, StudyRecord>();
        [...cloud.records, ...local.records].forEach((record) => recordMap.set(record.id, record));
        const resourceMap = new Map<string, Resource>();
        [...cloud.customResources, ...local.customResources].forEach((resource) => resourceMap.set(resource.id, resource));
        return {
          selected: cloudIsNewer ? cloud.selected : local.selected,
          completed: [...new Set([...cloud.completed, ...local.completed])],
          notes: cloudIsNewer ? cloud.notes : local.notes,
          records: [...recordMap.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 100),
          customResources: [...resourceMap.values()].slice(-100),
          updatedAt: Math.max(cloud.updatedAt, local.updatedAt, Date.now()),
        };
      });
      setCloudStatus("Cloud study record loaded. Notes, attempts and evidence are available on this device.");
      setCloudReady(true);
    }).catch(() => {
      if (alive) {
        setCloudStatus("Could not load cloud study data. Local data is preserved; check sign-in/connection before relying on cross-device sync.");
        setCloudReady(true);
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;
    const id = window.setTimeout(() => {
      saveStudyCloudState(saved).then(() => {
        setCloudStatus("Full Study Lab synced across devices, including notes, custom resources and evidence.");
      }).catch((error) => {
        setCloudStatus("Saved locally on this device. Cloud sync failed; export a backup and check sign-in/connection. " + (error instanceof Error ? error.message : ""));
      });
    }, 1400);
    return () => window.clearTimeout(id);
  }, [cloudReady, saved]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSecondsLeft((s) => {
      if (s <= 1) { window.clearInterval(id); setRunning(false); return 0; }
      return s - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  function patchSaved(patch: Partial<typeof saved>) { setSaved((s) => ({ ...s, ...patch, updatedAt: Date.now() })); }
  function startTimer() { if (!running) { if (secondsLeft <= 0) setSecondsLeft(minutes * 60); setRunning(true); } }
  function resetTimer() { setRunning(false); setSecondsLeft(0); }
  function toggleStep(step: string) {
    patchSaved({ completed: saved.completed.includes(step) ? saved.completed.filter((x) => x !== step) : [...saved.completed, step] });
  }
  function logEvidence() {
    const note = evidence.trim() || saved.notes.trim();
    if (!note) return;
    const elapsed = secondsLeft > 0 ? Math.max(1, minutes - Math.ceil(secondsLeft / 60)) : minutes;
    const record: StudyRecord = { id: `${Date.now()}`, date: new Date().toISOString(), resource: current.title, minutes: elapsed, evidence: note, steps: [...saved.completed] };
    patchSaved({ records: [record, ...saved.records].slice(0, 100), notes: saved.notes });
    setEvidence("");
    resetTimer();
  }
  function addResource() {
    const title = customTitle.trim();
    if (!title) return;
    const id = `custom-${Date.now()}`;
    const resource = { id, title, url: customUrl.trim() || undefined, area: "Added by you", note: "Work through it unaided, then record evidence." };
    patchSaved({ selected: id, customResources: [...saved.customResources, resource] });
    setCustomTitle(""); setCustomUrl(""); setShowAdd(false);
  }
  function exportLog() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), saved }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "focus-wall-study-log.json"; a.click();
    URL.revokeObjectURL(url);
  }

  async function removeLegacySnapshot() {
    if (!window.confirm("Delete the old full Study Lab snapshot from Neon, if one exists? This only deletes the old Study Lab snapshot; it does not delete your local data or other Focus Wall data. Export a local backup first if you need that old snapshot.")) return;
    setCloudBusy(true);
    try {
      const result = await deleteLegacyStudySnapshot();
      setCloudStatus(result.deleted ? "Old full Study Lab snapshot deleted from Neon. Local notes and evidence are unchanged." : result.message);
    } catch (error) {
      setCloudStatus("Could not delete the old snapshot. Local data is unchanged. " + (error instanceof Error ? error.message : "check connection/sign-in."));
    } finally { setCloudBusy(false); }
  }

  async function askCoach() {
    const question = coachQuestion.trim();
    if (!question) return;
    setCoachBusy(true);
    setCoachReply("");
    try {
      const result = await askStudyCoach({ question, resource: current.title, stages: saved.completed });
      setCoachReply(result.reply);
    } catch (error) {
      setCoachReply(error instanceof Error ? error.message : "The study coach is unavailable. Continue unaided and try later.");
    } finally { setCoachBusy(false); }
  }


  return (
    <main className="panel study-lab">
      <div className="study-hero">
        <div className="section-label">Study lab · offline-first</div>
        <h2>Struggle first. Understand for real.</h2>
        <p>Your full Study Lab — notes, attempts, custom resources and evidence — syncs across your devices through your private cloud record. Work offline when needed; reconnect to sync. Ask the coach for a hint when stuck, not a full solution.</p>
        <div className="study-hero-meta"><span>{saved.records.length} evidence logs</span><span>{saved.completed.length}/${PIPELINE.length} stages checked</span><span>Local-first</span><span>Full cloud sync</span></div>
      </div>
      <div className="section-label">Today's starting point</div>
      <label className="study-label" htmlFor="study-resource">Resource / problem</label>
      <select id="study-resource" className="field" value={saved.selected} onChange={(e) => { patchSaved({ selected: e.target.value, completed: [], notes: "" }); setEvidence(""); resetTimer(); }}>
        {resources.map((r) => <option key={r.id} value={r.id}>{r.area} — {r.title}</option>)}
      </select>
      <article className="study-resource">
        <div className="study-resource-top"><span className="study-area">{current.area}</span><span className="study-status">START WITH YOUR OWN ATTEMPT</span></div>
        <h3>{current.title}</h3>
        <p>{current.note}</p>
        {current.url ? <a href={current.url} target="_blank" rel="noreferrer">{current.url} ↗</a> : <span className="study-muted">Link not verified — add the exact URL yourself.</span>}
      </article>
      <div className="section-label">Lock-in timer</div>
      <div className="study-timer-card">
        <label className="study-label" htmlFor="study-duration">Session length (breaks are separate)</label>
        <select id="study-duration" className="field" value={minutes} disabled={running} onChange={(e) => setMinutes(Number(e.target.value))}>
          {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
        </select>
        <div className="study-clock" role="timer" aria-live="off">{time}</div>
        <div className="study-actions">
          {!running ? <button className="ghost-btn" onClick={startTimer}>{secondsLeft > 0 ? "RESUME" : "START SESSION"}</button> : <button className="ghost-btn" onClick={() => setRunning(false)}>PAUSE</button>}
          <button className="chip" onClick={resetTimer}>RESET</button>
        </div>
        <p className="study-muted">Timer is a commitment aid, not proof of mastery. Take breaks and stop when your concentration drops.</p>
      </div>
      <div className="section-label">Mastery pipeline</div>
      <p className="study-muted">Check a stage only after doing it. For Spiral Matrix: trace the four boundaries, handle one-row/one-column cases, and explain why the guarded reverse traversals matter.</p>
      <div className="study-pipeline">
        {PIPELINE.map((step, i) => <label key={step} className={saved.completed.includes(step) ? "study-step done" : "study-step"}>
          <input type="checkbox" checked={saved.completed.includes(step)} onChange={() => toggleStep(step)} />
          <span className="study-step-num">{String(i + 1).padStart(2, "0")}</span><span>{step}</span>
        </label>)}
      </div>
      <div className="section-label">Evidence, not vibes</div>
      <label className="study-label" htmlFor="study-notes">Your own explanation / attempt / mistakes</label>
      <textarea id="study-notes" className="field" rows={6} value={saved.notes} onChange={(e) => patchSaved({ notes: e.target.value })} placeholder="Without AI: explain the idea, write your approach, test edge cases, state time/space complexity, record what failed, and write one retrieval question." />
      <label className="study-label" htmlFor="study-evidence">What did you actually finish?</label>
      <textarea id="study-evidence" className="field" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Required evidence: solution/commit, completed practice, or detailed concept note." />
      <div className="study-actions">
        <button className="ghost-btn" onClick={logEvidence} disabled={!evidence.trim() && !saved.notes.trim()}>LOG EVIDENCE</button>
        <button className="chip" onClick={exportLog}>EXPORT LOCAL BACKUP</button>
        <button className="chip" onClick={async () => { setCloudBusy(true); try { await saveStudyCloudState({ ...saved, updatedAt: Date.now() }); setCloudStatus("Full Study Lab synced across devices."); } catch (error) { setCloudStatus("Sync failed; local data remains. " + (error instanceof Error ? error.message : "")); } finally { setCloudBusy(false); } }} disabled={cloudBusy}>{cloudBusy ? "SYNCING…" : "SYNC ALL STUDY DATA"}</button>
        <button className="chip" onClick={removeLegacySnapshot} disabled={cloudBusy}>DELETE OLD CLOUD SNAPSHOT</button>
        <button className="chip" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "CANCEL" : "ADD RESOURCE"}</button>
        <p className="study-muted" role="status" aria-live="polite">{cloudStatus}</p>
      </div>
      {showAdd && <div className="study-add-resource">
        <input className="field" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Resource or exact problem title" />
        <input className="field" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="Exact URL (optional)" inputMode="url" />
        <button className="ghost-btn" onClick={addResource}>SAVE RESOURCE</button>
      </div>}
      <div className="section-label">Ask for a hint</div>
      <div className="study-coach">
        <p className="study-muted">Optional and manual. Only your question, current resource title and checked stages are sent to the configured AI provider. Your notes, code, logs and custom resources are not sent or saved as chat history.</p>
        <label className="study-label" htmlFor="study-coach-question">Where are you stuck?</label>
        <textarea id="study-coach-question" className="field" rows={3} maxLength={1200} value={coachQuestion} onChange={(e) => setCoachQuestion(e.target.value)} placeholder="Describe what you tried and what you don't understand. Do not paste private data." />
        <div className="study-actions"><button className="ghost-btn" onClick={askCoach} disabled={coachBusy || !coachQuestion.trim()}>{coachBusy ? "THINKING…" : "ASK FOR A HINT"}</button><button className="chip" onClick={() => { setCoachQuestion(""); setCoachReply(""); }}>CLEAR</button></div>
        {coachReply && <article className="study-coach-reply" aria-live="polite"><strong>Study coach</strong><p>{coachReply}</p></article>}
      </div>
      <div className="section-label">Recent evidence</div>
      {saved.records.length ? saved.records.slice(0, 10).map((r) => <article className="study-log" key={r.id}>
        <div className="study-log-top"><strong>{r.resource}</strong><span>{new Date(r.date).toLocaleDateString()} · {r.minutes} min</span></div>
        <p>{r.evidence}</p><div className="study-muted">Stages recorded: {r.steps.length ? r.steps.join(" → ") : "none checked"}</div>
      </article>) : <p className="empty-note">No evidence logged yet. Start with one honest attempt.</p>}
    </main>
  );
}
