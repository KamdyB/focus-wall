import { useEffect, useMemo, useState } from "react";
import { askStudyCoach, deleteLegacyStudySnapshot, getStudyCloudState, saveStudyCloudState } from "./lib/api";
import "./StudyLab.css";

type Resource = { id: string; title: string; url?: string; area: string; note: string };
type StudyRecord = { id: string; date: string; resource: string; minutes: number; evidence: string; steps: string[] };
type StudySaved = { selected: string; completed: string[]; notes: string; records: StudyRecord[]; customResources: Resource[]; updatedAt: number };
const KEY = "fw-study-lab-v1";
const RESOURCES: Resource[] = [
  { id: "python-tutorial", title: "The Python Tutorial — core chapters", url: "https://docs.python.org/3/tutorial/", area: "Python foundations", note: "Read one small section, close it, rebuild the example from memory, then change the inputs and explain the result." },
  { id: "python-classes", title: "Python classes and objects", url: "https://docs.python.org/3/tutorial/classes.html", area: "Python foundations", note: "Start only after functions, data structures, modules and exceptions are comfortable." },
  { id: "spiral-matrix", title: "LeetCode 54 — Spiral Matrix", url: "https://leetcode.com/problems/spiral-matrix/", area: "Algorithms", note: "Draw the boundaries first, attempt a brute-force approach, then handle one-row and one-column cases." },
  { id: "kaggle-python", title: "Kaggle Learn — Python", url: "https://www.kaggle.com/learn/python", area: "Data foundations", note: "Complete the exercises yourself; translate techniques into a separate notebook without copying." },
  { id: "pandas", title: "Kaggle Learn — Pandas", url: "https://www.kaggle.com/learn/pandas", area: "Data foundations", note: "Load, inspect, clean, group and combine data; write one sentence explaining each result." },
  { id: "kaggle-ml", title: "Kaggle Learn — Intro to Machine Learning", url: "https://www.kaggle.com/learn/intro-to-machine-learning", area: "Machine learning", note: "Start after Python and pandas. Build a baseline and explain validation and error before improving the model." },
  { id: "mit-algorithms", title: "MIT OCW — Introduction to Algorithms", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/", area: "Algorithms", note: "Use lectures and problem sets to deepen algorithmic reasoning after the first implementation attempts." },
  { id: "sinopia", title: "Sinopia — your actual project", url: "https://github.com/KamdyB/sinopia", area: "Project work", note: "Work from the real youth-sports injury-risk problem and existing codebase; do not replace it with an unrelated xG demo." },
  { id: "git-commits", title: "GitHub Docs — commits", url: "https://docs.github.com/en/pull-requests/reference/commits", area: "Engineering practice", note: "Make small, meaningful commits that explain one coherent change; run relevant checks before committing." },
];
const ROADMAP = [
  { id: "python-core", title: "01 · Python foundations", goal: "Write small programs without needing a tutorial open beside you.", gate: "Build a small command-line program from a blank file, explain every function, and fix a bug without asking AI for the solution.", steps: [
    { id: "py-read", title: "Read, close, recreate", detail: "Read the official tutorial on syntax, control flow, functions and data structures. After each small section, close it and recreate two examples.", url: "https://docs.python.org/3/tutorial/" },
    { id: "py-types", title: "Practise core data types", detail: "Write exercises using strings, lists, tuples, dictionaries and sets. Include empty inputs, duplicates and missing keys.", url: "https://docs.python.org/3/tutorial/datastructures.html" },
    { id: "py-functions", title: "Write functions from scratch", detail: "Create eight small functions with clear parameters and return values. Trace at least three by hand.", url: "https://docs.python.org/3/tutorial/controlflow.html#defining-functions" },
    { id: "py-files", title: "Read files and handle errors", detail: "Read a text or JSON file, validate its contents, and handle a missing file or malformed record.", url: "https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files" },
    { id: "py-modules", title: "Split code into modules", detail: "Move related functions into a module, import them from a separate entry point, and write run instructions.", url: "https://docs.python.org/3/tutorial/modules.html" },
    { id: "py-mini-build", title: "Build, test and commit a mini-program", detail: "Build a small command-line tracker or CSV summary tool. Test normal and edge cases, write a README, inspect the diff, then commit.", url: "https://docs.github.com/en/pull-requests/reference/commits" },
  ]},
  { id: "problem-solving", title: "02 · Independent problem-solving", goal: "Turn a problem statement into a plan, code, tests and an explanation.", gate: "Solve a fresh easy problem unaided, explain the approach and complexity, then reproduce it from memory on another day.", steps: [
    { id: "dsa-trace", title: "Trace before coding", detail: "Write the input, expected output, a hand-worked example and the simplest correct approach before opening the editor.", url: "https://leetcode.com/studyplan/programming-skills/" },
    { id: "dsa-arrays", title: "Solve array and string problems", detail: "Solve five beginner problems on indexing, loops, counting and string manipulation. Save your first attempt and the bug you fixed.", url: "https://leetcode.com/problemset/" },
    { id: "dsa-hash", title: "Use sets and dictionaries to solve problems", detail: "Solve three counting or lookup problems. Explain why a set or dictionary helps and its time-cost trade-off.", url: "https://www.hackerrank.com/interview/interview-preparation-kit" },
    { id: "dsa-spiral", title: "Attempt Spiral Matrix", detail: "Try independently first. Draw four boundaries, test a single row and column, and consult hints only after a genuine attempt.", url: "https://leetcode.com/problems/spiral-matrix/" },
    { id: "dsa-retry", title: "Re-solve without looking", detail: "Close the editorial and solve it again on a later day. Record what you recalled and what you could not derive.", url: "https://leetcode.com/problems/spiral-matrix/" },
    { id: "dsa-commit", title: "Commit the solution and explanation", detail: "Add tests, complexity, edge cases and a short explanation to your learning repo. Review the diff before committing.", url: "https://docs.github.com/en/pull-requests/reference/commits" },
  ]},
  { id: "engineering", title: "03 · Software engineering habits", goal: "Make work reproducible, testable and reviewable—not just code that works once.", gate: "Someone else can follow your README, run the tests and understand your latest commit.", steps: [
    { id: "eng-git", title: "Practise the Git loop", detail: "Create a branch, make one focused change, inspect the diff, commit with a descriptive message and push it.", url: "https://docs.github.com/en/get-started/using-git/about-git" },
    { id: "eng-tests", title: "Test behaviour and edge cases", detail: "Add tests for normal cases, boundaries and invalid input. Fix the implementation rather than weakening a valid test.", url: "https://docs.pytest.org/en/stable/getting-started.html" },
    { id: "eng-debug", title: "Debug deliberately", detail: "Reproduce a bug, reduce it to the smallest failing case, inspect state, fix the cause and add a regression test.", url: "https://docs.python.org/3/library/pdb.html" },
    { id: "eng-review", title: "Review before every commit", detail: "Run relevant tests, inspect the diff for secrets or unrelated edits, and commit one coherent change.", url: "https://docs.github.com/en/pull-requests/how-tos/committing-changes-to-your-project" },
  ]},
  { id: "data", title: "04 · Data foundations", goal: "Take a real dataset from raw rows to a defensible, explained result.", gate: "Deliver a rerunnable notebook or script that explains its findings and limitations.", steps: [
    { id: "data-python", title: "Complete Kaggle Python exercises", detail: "Practise functions, conditionals, lists, loops, strings/dictionaries and external libraries. Rebuild one exercise outside Kaggle.", url: "https://www.kaggle.com/learn/python" },
    { id: "data-pandas", title: "Learn pandas in order", detail: "Practise reading data, selecting rows/columns, grouping, sorting, missing values and combining tables.", url: "https://www.kaggle.com/learn/pandas" },
    { id: "data-clean", title: "Audit a real dataset", detail: "Inspect schema, duplicates, missingness, invalid values and sampling limitations. Keep raw data unchanged and document cleaning choices.", url: "https://pandas.pydata.org/docs/getting_started/index.html" },
    { id: "data-viz", title: "Make one useful visual", detail: "Create a chart that answers one question. Label units, describe the pattern and state what the chart cannot establish.", url: "https://matplotlib.org/stable/tutorials/" },
    { id: "data-commit", title: "Ship a reproducible analysis", detail: "Include source attribution, setup instructions, a clear result, limitations and a meaningful Git commit.", url: "https://docs.github.com/en/pull-requests/reference/commits" },
  ]},
  { id: "sinopia", title: "05 · Apply it to Sinopia", goal: "Improve the actual youth-sports injury-risk project without expanding its scope.", gate: "One evidence-backed improvement is tested, documented, reviewed and shipped; no feature is added just because it sounds impressive.", steps: [
    { id: "sino-map", title: "Map the existing project first", detail: "Read the README, issue list, data flow and current tests. Write down what works and the single highest-value gap.", url: "https://github.com/KamdyB/sinopia" },
    { id: "sino-question", title: "Define one answerable question", detail: "State the user, decision, input data, output and limitation in plain language. Preserve Sinopia's actual injury-risk purpose.", url: "https://github.com/KamdyB/sinopia" },
    { id: "sino-evidence", title: "Cross-check evidence and claims", detail: "Trace thresholds and claims to credible sports-medicine research. Record population, data provenance and uncertainty; do not present a risk estimate as a diagnosis.", url: "https://bjsm.bmj.com/content/52/24/1537" },
    { id: "sino-small", title: "Build the smallest valid slice", detail: "Implement one narrow change in a branch. Test boundary values and missing/invalid inputs before adding another feature.", url: "https://docs.pytest.org/en/stable/getting-started.html" },
    { id: "sino-review", title: "Cross-check, commit and request feedback", detail: "Run relevant checks after the final edit, inspect the diff, document limitations, commit, and ask testers a specific question.", url: "https://docs.github.com/en/pull-requests/reference/commits" },
  ]},
  { id: "ml", title: "06 · Statistics and machine learning", goal: "Understand why a model works and when it fails before reaching for advanced AI.", gate: "Compare a baseline with a model on held-out data, explain the metric, and identify leakage and limitations.", steps: [
    { id: "ml-course", title: "Complete Intro to Machine Learning", detail: "Learn validation, decision trees, random forests and evaluation. Reproduce the workflow on a separate dataset.", url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
    { id: "ml-baseline", title: "Build a baseline before tuning", detail: "Choose a target and metric, split data correctly, compare with a simple baseline, and keep held-out data out of training decisions.", url: "https://scikit-learn.org/stable/model_selection.html" },
    { id: "ml-errors", title: "Analyse errors and leakage", detail: "Inspect false positives/negatives, class balance, missing data and generalisation. Explain what evidence would change your conclusion.", url: "https://scikit-learn.org/stable/common_pitfalls.html" },
    { id: "ml-explain", title: "Write a model limitations note", detail: "Document intended use, data source, evaluation design, performance, failure cases and claims the model cannot support.", url: "https://www.statlearning.com/" },
    { id: "ml-ship", title: "Reproduce and commit the experiment", detail: "Document the environment and run steps, save only necessary artefacts, and commit code plus a short findings note.", url: "https://docs.github.com/en/pull-requests/reference/commits" },
  ]},
  { id: "specialise", title: "07 · Specialise after foundations", goal: "Choose a deeper track based on evidence and actual opportunities—not fear of missing out.", gate: "Start after Python, independent problem-solving and one reproducible data project are complete.", steps: [
    { id: "spec-sql", title: "Add SQL for data work", detail: "Learn filtering, joins, aggregation and window functions; practise on a real schema and explain each query.", url: "https://sqlbolt.com/" },
    { id: "spec-dsa", title: "Expand DSA in order", detail: "Move through two pointers/sliding window, stacks/queues, binary search, linked lists, trees, heaps, graphs and dynamic programming. Do not grind hundreds of problems at once.", url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/" },
    { id: "spec-quant", title: "Add probability and linear algebra for quant/ML", detail: "Study probability, expectation, linear algebra and statistical inference alongside exercises. This is a later track, not today's competing priority.", url: "https://ocw.mit.edu/" },
    { id: "spec-branch", title: "Choose the next branch from project needs", detail: "Pick sports analytics, ML engineering, data engineering or quant after reviewing your strengths, target roles and the next real project need.", url: "https://www.kaggle.com/learn" },
  ]},
];
const PIPELINE = ROADMAP.flatMap((phase) => phase.steps.map((step) => step.id));
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
  const nextStepId = ROADMAP.flatMap((phase) => phase.steps).find((step) => !saved.completed.includes(step.id))?.id;
  const remaining = Math.max(0, secondsLeft);
  const time = `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* keep the current session usable */ }
  }, [saved]);

  // Load the complete Study Lab record before enabling writes. Merge instead of
  // replacing so a device with offline work cannot erase existing cloud evidence.
  useEffect(() => {
    let alive = true;
    getStudyCloudState().then(({ data, updated_at, progress }) => {
      if (!alive) return;
      if (!data) {
        if (progress) {
          setSaved((local) => ({
            ...local,
            selected: local.updatedAt > 0 ? local.selected : (progress.selected_resource || local.selected),
            completed: [...new Set([...local.completed, ...(progress.completed_stages || [])])],
            updatedAt: Math.max(local.updatedAt, updated_at ? Date.parse(updated_at) || 0 : 0, Date.now()),
          }));
          setCloudStatus("Recovered earlier cloud progress. Full notes and evidence will now sync across devices.");
        } else {
          setCloudStatus("No full cloud study record yet. Your local work is preserved and will sync.");
        }
        setCloudReady(true);
        return;
      }
      const cloud: StudySaved = {
        selected: data.selected || "spiral-matrix",
        completed: [...new Set([...(Array.isArray(data.completed) ? data.completed : []), ...(progress?.completed_stages || [])])],
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
          records: [...recordMap.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
          customResources: [...resourceMap.values()],
          updatedAt: Math.max(cloud.updatedAt, local.updatedAt, Date.now()),
        };
      });
      setCloudStatus("Cloud study record loaded. Notes, attempts and evidence are available on this device.");
      setCloudReady(true);
    }).catch(() => {
      if (alive) {
        // Never write after a failed read: we cannot safely know what is already in the cloud.
        setCloudStatus("Cloud read failed. Local data is safe; reconnect/sign in, then use SYNC ALL STUDY DATA to merge safely.");
      }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;
    const id = window.setTimeout(async () => {
      try {
        // Read before every write so a second device's newer evidence is merged, not blindly overwritten.
        const remote = await getStudyCloudState();
        const cloud = remote.data;
        const cloudUpdatedAt = cloud ? (Number(cloud.updatedAt) || (remote.updated_at ? Date.parse(remote.updated_at) : 0)) : 0;
        const merged: StudySaved = cloud ? {
          selected: cloudUpdatedAt > saved.updatedAt ? cloud.selected : saved.selected,
          completed: [...new Set([...(cloud.completed || []), ...saved.completed, ...(remote.progress?.completed_stages || [])])],
          notes: cloudUpdatedAt > saved.updatedAt ? cloud.notes : saved.notes,
          records: [...new Map([...(cloud.records || []), ...saved.records].map((record) => [record.id, record])).values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
          customResources: [...new Map([...(cloud.customResources || []), ...saved.customResources].map((resource) => [resource.id, resource])).values()],
          updatedAt: Math.max(cloudUpdatedAt, saved.updatedAt),
        } : {
          ...saved,
          selected: saved.updatedAt > 0 ? saved.selected : (remote.progress?.selected_resource || saved.selected),
          completed: [...new Set([...saved.completed, ...(remote.progress?.completed_stages || [])])],
          updatedAt: saved.updatedAt,
        };
        if (JSON.stringify(merged) !== JSON.stringify(saved)) setSaved(merged);
        await saveStudyCloudState(merged);
        setCloudStatus("Full Study Lab synced across devices, including notes, attempts and evidence.");
      } catch (error) {
        setCloudStatus("Saved locally on this device. Cloud read/sync failed; no unsafe overwrite was attempted. Export a backup and retry when online. " + (error instanceof Error ? error.message : ""));
      }
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
    patchSaved({ records: [record, ...saved.records], notes: saved.notes });
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

  async function syncAllNow() {
    setCloudBusy(true);
    setCloudStatus("Reading cloud data before merging…");
    try {
      const remote = await getStudyCloudState();
      const cloud = remote.data;
      const cloudUpdatedAt = cloud ? (Number(cloud.updatedAt) || (remote.updated_at ? Date.parse(remote.updated_at) : 0)) : 0;
      const merged: StudySaved = cloud ? {
        selected: cloudUpdatedAt > saved.updatedAt ? cloud.selected : saved.selected,
        completed: [...new Set([...(cloud.completed || []), ...saved.completed, ...(remote.progress?.completed_stages || [])])],
        notes: cloudUpdatedAt > saved.updatedAt ? cloud.notes : saved.notes,
        records: [...new Map([...(cloud.records || []), ...saved.records].map((record) => [record.id, record])).values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
        customResources: [...new Map([...(cloud.customResources || []), ...saved.customResources].map((resource) => [resource.id, resource])).values()],
        updatedAt: Math.max(cloudUpdatedAt, saved.updatedAt, Date.now()),
      } : {
        ...saved,
        selected: saved.updatedAt > 0 ? saved.selected : (remote.progress?.selected_resource || saved.selected),
        completed: [...new Set([...saved.completed, ...(remote.progress?.completed_stages || [])])],
        updatedAt: Math.max(saved.updatedAt, Date.now()),
      };
      setSaved(merged);
      await saveStudyCloudState(merged);
      setCloudReady(true);
      setCloudStatus("Full Study Lab synced across devices. Local and cloud evidence were merged.");
    } catch (error) {
      setCloudStatus("Sync failed; local data is safe. Check connection/sign-in before retrying. " + (error instanceof Error ? error.message : ""));
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
        <div className="study-hero-meta"><span>{saved.records.length} evidence logs</span><span>{PIPELINE.filter((id) => saved.completed.includes(id)).length}/{PIPELINE.length} steps complete</span><span>One step at a time</span><span>Local-first + cloud sync</span></div>
      </div>
      <div className="section-label">Today's starting point</div>
      <label className="study-label" htmlFor="study-resource">Resource / problem</label>
      <select id="study-resource" className="field" value={saved.selected} onChange={(e) => { patchSaved({ selected: e.target.value }); setEvidence(""); resetTimer(); }}>
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
      <div className="section-label">Your mastery roadmap · follow in order</div>
      <p className="study-muted">Do not try to finish the whole roadmap today. Open the first unfinished step, do the work, save evidence, and only then check it. Every phase has a gate: move forward when you can demonstrate the skill, not just when you have watched a video.</p>
      <div className="roadmap">
        {ROADMAP.map((phase) => {
          const completed = phase.steps.filter((step) => saved.completed.includes(step.id)).length;
          const active = phase.steps.find((step) => step.id === nextStepId);
          return <section className="roadmap-phase" key={phase.id}>
            <div className="roadmap-phase-head">
              <div><span className="study-area">{completed === phase.steps.length ? "PHASE COMPLETE" : "ORDERED LEARNING PATH"}</span><h3>{phase.title}</h3><p>{phase.goal}</p></div>
              <span className="roadmap-count">{completed}/{phase.steps.length}</span>
            </div>
            <div className="roadmap-steps">
              {phase.steps.map((step, index) => {
                const done = saved.completed.includes(step.id);
                const isNext = !done && step.id === active?.id;
                return <article className={`roadmap-step${done ? " done" : ""}${isNext ? " next" : ""}`} key={step.id}>
                  <label className="roadmap-check">
                    <input type="checkbox" checked={done} disabled={!done && step.id !== nextStepId} onChange={() => toggleStep(step.id)} aria-label={`Mark ${step.title} ${done ? "not complete" : "complete"}`} />
                    <span className="study-step-num">{String(index + 1).padStart(2, "0")}</span>
                  </label>
                  <div className="roadmap-step-body"><strong>{step.title}</strong><p>{step.detail}</p><a href={step.url} target="_blank" rel="noreferrer">Open exact resource ↗</a></div>
                  {isNext && <span className="roadmap-next-label">START HERE</span>}
                </article>;
              })}
            </div>
            <p className="roadmap-gate"><strong>Mastery gate:</strong> {phase.gate}</p>
          </section>;
        })}
      </div>
      <div className="section-label">Evidence, not vibes</div>
      <label className="study-label" htmlFor="study-notes">Your own explanation / attempt / mistakes</label>
      <textarea id="study-notes" className="field" rows={6} value={saved.notes} onChange={(e) => patchSaved({ notes: e.target.value })} placeholder="Without AI: explain the idea, write your approach, test edge cases, state time/space complexity, record what failed, and write one retrieval question." />
      <label className="study-label" htmlFor="study-evidence">What did you actually finish?</label>
      <textarea id="study-evidence" className="field" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Required evidence: solution/commit, completed practice, or detailed concept note." />
      <div className="study-actions">
        <button className="ghost-btn" onClick={logEvidence} disabled={!evidence.trim() && !saved.notes.trim()}>LOG EVIDENCE</button>
        <button className="chip" onClick={exportLog}>EXPORT LOCAL BACKUP</button>
        <button className="chip" onClick={syncAllNow} disabled={cloudBusy}>{cloudBusy ? "SYNCING…" : "SYNC ALL STUDY DATA"}</button>
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
