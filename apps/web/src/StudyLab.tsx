import { useEffect, useMemo, useState } from "react";
import { askStudyCoach, deleteLegacyStudySnapshot, getStudyCloudState, saveStudyCloudState } from "./lib/api";
import "./StudyLab.css";

type Resource = { id: string; title: string; url?: string; area: string; note: string };
type StudyRecord = { id: string; date: string; resource: string; minutes: number; evidence: string; steps: string[] };
type XpAward = { date: string; points: number; mode: "practice" | "assessment" };
type StudySaved = { selected: string; completed: string[]; mastered: string[]; xpAwards: Record<string, XpAward>; notes: string; records: StudyRecord[]; customResources: Resource[]; updatedAt: number };
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
const ALL_STEPS = ROADMAP.flatMap((phase) => phase.steps.map((step, index) => ({ ...step, phaseId: phase.id, phaseTitle: phase.title, index })));
type Check = { question: string; options: string[]; answer: number; why: string };
const CHECKS: Record<string, Check[]> = {
  "python-core": [
    { question: "Which Python type is a good fit for an ordered collection you need to change?", options: ["tuple", "list", "integer", "boolean"], answer: 1, why: "Lists are mutable sequences." },
    { question: "What does return do in a function?", options: ["Sends a result back to the caller", "Prints every variable", "Stops the whole computer", "Creates a class"], answer: 0, why: "A return value can be reused or tested by the calling code." },
    { question: "A dictionary is most useful when you need to…", options: ["Map keys to values", "Store only numbers", "Prevent all changes", "Sort automatically"], answer: 0, why: "Dictionaries map keys to values." },
    { question: "Why use with open(...) when reading a file?", options: ["It encrypts the file", "It reliably closes the file", "It validates every row", "It prevents all exceptions"], answer: 1, why: "A context manager handles closing even if an error occurs." },
  ],
  "problem-solving": [
    { question: "Before coding a solution, first clarify…", options: ["Input, output and examples", "The final variable names", "The UI colour", "The commit emoji"], answer: 0, why: "Examples and constraints make the problem precise." },
    { question: "Why test empty and one-item arrays?", options: ["They reveal boundary bugs", "They prove optimal complexity", "They make code shorter", "They replace all other tests"], answer: 0, why: "Boundary inputs expose common off-by-one errors." },
    { question: "Average dictionary lookup is commonly described as…", options: ["O(1)", "O(n²)", "O(n log n)", "Always O(n)"], answer: 0, why: "Hash-table lookup is average constant time." },
    { question: "Big-O describes…", options: ["How work scales with input size", "Exact seconds on every laptop", "Number of lines", "Number of bugs"], answer: 0, why: "It describes growth, not machine-specific elapsed time." },
  ],
  engineering: [
    { question: "What helps prevent a fixed bug from returning?", options: ["A regression test", "Deleting the issue", "Renaming the folder", "Skipping tests"], answer: 0, why: "A regression test captures the failure for future runs." },
    { question: "A useful commit usually contains…", options: ["One coherent change", "Every unfinished idea", "A full duplicate repository", "A vague message only"], answer: 0, why: "Focused commits are easier to review and revert." },
    { question: "When a test fails, first…", options: ["Reproduce and reduce the failure", "Remove the assertion", "Rewrite the entire app", "Assume the test is wrong"], answer: 0, why: "A minimal failure narrows the likely cause." },
    { question: "Inspecting git diff helps catch…", options: ["Unrelated edits or accidental secrets", "All future bugs automatically", "Every user need", "Project profitability"], answer: 0, why: "The diff shows exactly what will be committed." },
  ],
  data: [
    { question: "Why inspect missing values before analysis?", options: ["They can bias results or break calculations", "They always improve accuracy", "They prove the data is fake", "They replace validation"], answer: 0, why: "Missingness patterns affect cleaning and conclusions." },
    { question: "Data leakage means…", options: ["Using information unavailable at prediction time", "A chart has too many labels", "Saving a CSV twice", "A column has a long name"], answer: 0, why: "Leakage makes evaluation look better than real-world performance." },
    { question: "Correlation alone lets you conclude…", options: ["The variables are associated in this dataset", "One definitely causes the other", "The result generalises everywhere", "The model is unbiased"], answer: 0, why: "Correlation alone does not establish causation." },
    { question: "Why preserve raw data when cleaning?", options: ["To audit and reproduce transformations", "To avoid documenting choices", "To guarantee no errors", "To make charts unnecessary"], answer: 0, why: "Keeping raw data makes cleaning decisions traceable." },
  ],
  sinopia: [
    { question: "Before applying a published training-load threshold to a new athlete population, you should…", options: ["Check source population, evidence and limitations", "Treat it as a universal medical rule", "Hide the source", "Call it a diagnosis"], answer: 0, why: "Thresholds are context-dependent and are not universal diagnostic rules." },
    { question: "A responsible risk-support tool should provide…", options: ["A transparent estimate with limitations", "A guaranteed diagnosis", "A promise no injury will occur", "A score without explanation"], answer: 0, why: "Risk tools should communicate uncertainty and preserve human judgement." },
    { question: "The best scope-control question is…", options: ["Does this solve the defined user problem?", "Could this look impressive?", "Can I add a dashboard too?", "Can I add more libraries?"], answer: 0, why: "A narrow, validated improvement beats unrelated feature growth." },
    { question: "Athlete-data work should consider…", options: ["Privacy, consent and data provenance", "Only chart colours", "Only model size", "Nothing if data is public"], answer: 0, why: "Public availability does not remove privacy or responsible-use concerns." },
  ],
  ml: [
    { question: "Why create a baseline before tuning a model?", options: ["To have a fair reference point", "To guarantee the model wins", "To avoid tests", "To skip cleaning"], answer: 0, why: "A baseline reveals whether complexity actually helps." },
    { question: "Fit learned preprocessing…", options: ["On training data within the pipeline", "On all data before splitting", "On the final test set", "Only on labels"], answer: 0, why: "This avoids leaking test-set information." },
    { question: "Keep a held-out test set untouched to…", options: ["Estimate unseen-data performance more honestly", "Tune until the score is perfect", "Increase training data after every result", "Replace the baseline"], answer: 0, why: "Repeated test-set tuning turns the test set into training feedback." },
    { question: "High accuracy on imbalanced classes can mislead because…", options: ["A model may ignore the minority class", "Accuracy never works", "It proves leakage", "The data has no labels"], answer: 0, why: "Inspect class balance and suitable precision/recall metrics." },
  ],
  specialise: [
    { question: "An SQL JOIN primarily…", options: ["Combines related rows from tables", "Trains a neural network", "Sorts a Python list", "Creates a commit"], answer: 0, why: "Joins combine records through a relationship." },
    { question: "A sliding window is useful for…", options: ["Contiguous ranges in a sequence", "Every kind of model", "Encrypting files", "Creating schemas"], answer: 0, why: "Window boundaries can update range information efficiently." },
    { question: "Expected value is…", options: ["A probability-weighted average outcome", "Always the most likely outcome", "Always the maximum", "Always the median"], answer: 0, why: "Expectation weights outcomes by their probabilities." },
    { question: "Advanced specialisation makes most sense…", options: ["When foundations and a real project justify it", "Because every track sounds urgent", "Before learning functions", "To avoid current work"], answer: 0, why: "Specialisation should serve a concrete goal and build on foundations." },
  ],
};
function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function calculateStudyStreak(awards: Record<string, XpAward>): number {
  const dates = new Set(Object.values(awards).map((award) => award.date));
  const cursor = new Date();
  if (!dates.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(localDay(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
const DURATIONS = [25, 50, 90, 120, 180, 240, 360, 480];

function loadSaved(): StudySaved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const parsed = JSON.parse(raw); return { selected: "python-tutorial", completed: [], notes: "", records: [], customResources: [], updatedAt: 0, ...parsed, mastered: Array.isArray(parsed.mastered) ? parsed.mastered : [], xpAwards: parsed.xpAwards && typeof parsed.xpAwards === "object" ? parsed.xpAwards : {} }; }
  } catch { /* storage may be unavailable */ }
  return { selected: "python-tutorial", completed: [], mastered: [], xpAwards: {}, notes: "", records: [], customResources: [], updatedAt: 0 };
}

export default function StudyLab() {
  const [saved, setSaved] = useState<StudySaved>(loadSaved);
  const [minutes, setMinutes] = useState(90);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
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
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [lessonMode, setLessonMode] = useState<"practice" | "assessment">("practice");
  const [lessonAnswers, setLessonAnswers] = useState<Record<number, number>>({});
  const [practiceEvidence, setPracticeEvidence] = useState("");
  const [practiceConfirmed, setPracticeConfirmed] = useState(false);
  const [testOutEvidence, setTestOutEvidence] = useState("");
  const [testOutConfirmed, setTestOutConfirmed] = useState(false);
  const [lessonFeedback, setLessonFeedback] = useState("");
  const resources = useMemo(() => [...RESOURCES, ...saved.customResources], [saved.customResources]);
  const current = resources.find((r) => r.id === saved.selected) ?? RESOURCES[0];
  const nextStepId = ALL_STEPS.find((step) => !saved.mastered.includes(step.id))?.id;
  const activeLesson = ALL_STEPS.find((step) => step.id === (activeLessonId || nextStepId)) ?? ALL_STEPS[0];
  const activeChecks = useMemo(() => { const bank = CHECKS[activeLesson.phaseId] ?? CHECKS["python-core"]; const offset = activeLesson.index % bank.length; return [0, 1, 2].map((n) => bank[(offset + n) % bank.length]); }, [activeLesson.id, activeLesson.phaseId, activeLesson.index]);
  const canPractice = activeLesson.id === nextStepId || saved.mastered.includes(activeLesson.id);
  const today = localDay();
  const xpAwards = Object.values(saved.xpAwards);
  const studyXpToday = xpAwards.filter((award) => award.date === today).reduce((sum, award) => sum + award.points, 0);
  const studyXpTotal = xpAwards.reduce((sum, award) => sum + award.points, 0);
  const studyStreakDays = calculateStudyStreak(saved.xpAwards);
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
        mastered: Array.isArray(data.mastered) ? data.mastered : [],
        xpAwards: data.xpAwards && typeof data.xpAwards === "object" ? data.xpAwards : {},
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
          mastered: [...new Set([...(cloud.mastered || []), ...(local.mastered || [])])],
          xpAwards: { ...(cloud.xpAwards || {}), ...(local.xpAwards || {}) },
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
          mastered: [...new Set([...(cloud.mastered || []), ...saved.mastered])],
          xpAwards: { ...(cloud.xpAwards || {}), ...saved.xpAwards },
          notes: cloudUpdatedAt > saved.updatedAt ? cloud.notes : saved.notes,
          records: [...new Map([...(cloud.records || []), ...saved.records].map((record) => [record.id, record])).values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
          customResources: [...new Map([...(cloud.customResources || []), ...saved.customResources].map((resource) => [resource.id, resource])).values()],
          updatedAt: Math.max(cloudUpdatedAt, saved.updatedAt),
        } : {
          ...saved,
          selected: saved.updatedAt > 0 ? saved.selected : (remote.progress?.selected_resource || saved.selected),
          completed: [...new Set([...saved.completed, ...(remote.progress?.completed_stages || [])])],
          mastered: [...new Set(saved.mastered)],
          xpAwards: { ...saved.xpAwards },
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
  function startTimer() { if (!running) { if (secondsLeft <= 0) { setSecondsLeft(minutes * 60); setTimerStarted(true); } setRunning(true); } }
  function resetTimer() { setRunning(false); setSecondsLeft(0); setTimerStarted(false); }
  function openLesson(stepId: string) {
    const target = ALL_STEPS.find((step) => step.id === stepId);
    if (!target) return;
    setActiveLessonId(stepId);
    setLessonMode(saved.mastered.includes(stepId) || stepId === nextStepId ? "practice" : "assessment");
    setLessonAnswers({});
    setPracticeEvidence("");
    setPracticeConfirmed(false);
    setTestOutEvidence("");
    setTestOutConfirmed(false);
    setLessonFeedback("");
  }
  function awardLesson(stepId: string, mode: "practice" | "assessment", points: number) {
    if (saved.mastered.includes(stepId)) {
      setLessonFeedback("Already mastered — no duplicate XP awarded.");
      return;
    }
    const award: XpAward = { date: localDay(), points, mode };
    patchSaved({
      completed: [...new Set([...saved.completed, stepId])],
      mastered: [...new Set([...saved.mastered, stepId])],
      xpAwards: { ...saved.xpAwards, [stepId]: award },
      records: [{
        id: `mastery-${stepId}-${Date.now()}`,
        date: new Date().toISOString(),
        resource: activeLesson.title,
        minutes: timerStarted ? Math.max(1, Math.round((minutes * 60 - secondsLeft) / 60)) : 1,
        evidence: mode === "assessment" ? `Test-out evidence: ${testOutEvidence.trim()}\nPassed the ${activeLesson.phaseTitle} mastery check.` : practiceEvidence.trim(),
        steps: [...new Set([...saved.mastered, stepId])],
      }, ...saved.records],
    });
    setLessonFeedback(mode === "assessment" ? "Assessment passed. Step mastered and next tile unlocked." : "Practice evidence saved. Step mastered and next tile unlocked.");
    setPracticeConfirmed(false);
  }
  function submitAssessment() {
    const answered = activeChecks.every((_, index) => lessonAnswers[index] !== undefined);
    if (!answered) { setLessonFeedback("Answer all three questions before submitting."); return; }
    if (!testOutConfirmed || testOutEvidence.trim().length < 30) { setLessonFeedback("Test-out also requires a short explanation of the evidence that shows you already have this skill."); return; }
    const score = activeChecks.reduce((sum, check, index) => sum + (lessonAnswers[index] === check.answer ? 1 : 0), 0);
    if (score === activeChecks.length) {
      awardLesson(activeLesson.id, "assessment", 15);
    } else {
      setLessonFeedback(`You scored ${score}/${activeChecks.length}. Review the explanations, then retry. This step stays locked until you pass.`);
    }
  }
  function completePracticeLesson() {
    if (saved.mastered.includes(activeLesson.id)) {
      setLessonFeedback("This lesson is already mastered. Choose the next unlocked tile.");
      return;
    }
    if (!practiceConfirmed) {
      setLessonFeedback("Tick the confirmation box to confirm you completed the work yourself.");
      return;
    }
    if (practiceEvidence.trim().length < 30) {
      setLessonFeedback("Add at least 30 characters describing what you tried, the result, or a mistake you fixed.");
      return;
    }
    awardLesson(activeLesson.id, "practice", 10);
  }
  function logEvidence() {
    const note = evidence.trim() || saved.notes.trim();
    if (!note) {
      setCloudStatus("Nothing logged yet. Add evidence or a note first.");
      return;
    }
    const elapsed = timerStarted ? Math.max(1, Math.round((minutes * 60 - secondsLeft) / 60)) : 1;
    const record: StudyRecord = { id: `evidence-${Date.now()}`, date: new Date().toISOString(), resource: current.title, minutes: elapsed, evidence: note, steps: [...saved.completed] };
    patchSaved({ records: [record, ...saved.records], notes: saved.notes });
    setEvidence("");
    setCloudStatus("Evidence saved on this device. Cloud sync will run when connected.");
  }
  function endSession() {
    const elapsedSeconds = timerStarted ? Math.max(0, minutes * 60 - secondsLeft) : 0;
    if (!timerStarted || elapsedSeconds === 0) {
      setLessonFeedback("Start the focus timer before ending a session.");
      setRunning(false);
      return;
    }
    const note = practiceEvidence.trim() || evidence.trim();
    const record: StudyRecord = {
      id: `session-${Date.now()}`,
      date: new Date().toISOString(),
      resource: activeLesson.title,
      minutes: Math.max(1, Math.round(elapsedSeconds / 60)),
      evidence: note || `Focus session completed for “${activeLesson.title}”. Add a short evidence note when you are ready.`,
      steps: [...saved.mastered],
    };
    patchSaved({ records: [record, ...saved.records] });
    setRunning(false);
    setSecondsLeft(0);
    setTimerStarted(false);
    setLessonFeedback(`Session saved: ${record.minutes} minute(s) recorded for “${activeLesson.title}”.`);
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
        mastered: [...new Set([...(cloud.mastered || []), ...saved.mastered])],
        xpAwards: { ...(cloud.xpAwards || {}), ...saved.xpAwards },
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
      const result = await askStudyCoach({ question, resource: activeLesson.title, stages: saved.mastered });
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
        <div className="study-hero-meta"><span>{studyXpToday} STUDY XP TODAY</span><span>{studyXpTotal} TOTAL STUDY XP</span><span>{studyStreakDays} DAY STUDY STREAK</span><span>{saved.mastered.length}/{PIPELINE.length} MASTERED</span></div>
      </div>
      <div className="study-progress-wrap">
        <div className="study-progress-label"><strong>Your learning world</strong><span>{Math.round((saved.mastered.length / PIPELINE.length) * 100)}% complete</span></div>
        <div className="study-progress-track"><span style={{ width: `${(saved.mastered.length / PIPELINE.length) * 100}%` }} /></div>
        <p className="study-muted">Follow the path in order. Every tile is a tiny lesson: learn, practise, prove it. You can test out of a step by passing its assessment. XP is awarded once per mastered tile.</p>
      </div>
      <div className="section-label">The path · tap a tile</div>
      <div className="game-map">
        {ROADMAP.map((phase, phaseIndex) => {
          const phaseDone = phase.steps.every((step) => saved.mastered.includes(step.id));
          const phaseOpen = phaseIndex === 0 || ROADMAP[phaseIndex - 1].steps.every((step) => saved.mastered.includes(step.id));
          return <section className={`game-phase${phaseOpen ? " open" : " locked"}`} key={phase.id}>
            <div className="game-phase-heading"><span className="game-phase-icon">{phaseDone ? "★" : phaseOpen ? String(phaseIndex + 1).padStart(2, "0") : "🔒"}</span><div><span className="study-area">{phaseDone ? "WORLD CLEARED" : phaseOpen ? "CURRENT WORLD" : "LOCKED WORLD"}</span><h3>{phase.title.replace(/^\d+ · /, "")}</h3><p>{phase.goal}</p></div><span className="game-phase-count">{phase.steps.filter((step) => saved.mastered.includes(step.id)).length}/{phase.steps.length}</span></div>
            <div className="game-nodes">
              {phase.steps.map((step, index) => {
                const done = saved.mastered.includes(step.id);
                const unlocked = done || step.id === nextStepId;
                const isActive = step.id === (activeLessonId || nextStepId);
                return <button type="button" key={step.id} onClick={() => openLesson(step.id)} className={`game-node${done ? " mastered" : ""}${isActive ? " selected" : ""}${unlocked ? "" : " locked"}`}><span className="game-node-symbol">{done ? "✓" : unlocked ? (index % 3 === 1 ? "?" : "▶") : "🔒"}</span><span className="game-node-title">{step.title}</span><span className="game-node-xp">{done ? "DONE" : unlocked ? "+10 XP" : "LOCKED"}</span></button>;
              })}
            </div>
          </section>;
        })}
      </div>
      <section className="lesson-panel" aria-live="polite">
        <div className="lesson-panel-top"><span className="study-area">{saved.mastered.includes(activeLesson.id) ? "LESSON COMPLETE" : lessonMode === "assessment" ? "TEST OUT CHALLENGE" : "YOUR NEXT LESSON"}</span><span className="lesson-reward">+{lessonMode === "assessment" ? 15 : 10} XP</span></div>
        <h3>{activeLesson.title}</h3><p>{activeLesson.detail}</p><a href={activeLesson.url} target="_blank" rel="noreferrer">Open lesson resource ↗</a>
        <div className="lesson-mode-switch"><button type="button" disabled={!canPractice} className={lessonMode === "practice" ? "selected" : ""} onClick={() => { setLessonMode("practice"); setLessonAnswers({}); setTestOutEvidence(""); setTestOutConfirmed(false); setLessonFeedback(""); }}>LEARN & PRACTISE</button><button type="button" className={lessonMode === "assessment" ? "selected" : ""} onClick={() => { setLessonMode("assessment"); setLessonAnswers({}); setTestOutEvidence(""); setTestOutConfirmed(false); setLessonFeedback(""); }}>TEST OUT</button></div>
        {lessonMode === "practice" && canPractice ? <><div className="lesson-checklist"><p><strong>1. Learn.</strong> Open the resource and focus only on this lesson.</p><p><strong>2. Try.</strong> Close the reference and solve/build the task yourself.</p><p><strong>3. Prove.</strong> Record what you made, tested, or can explain.</p></div><label className="study-label" htmlFor="practice-evidence">What did you actually do? (required)</label><textarea id="practice-evidence" className="field" rows={4} value={practiceEvidence} onChange={(event) => setPracticeEvidence(event.target.value)} placeholder="Describe your attempt, result, one mistake you fixed, and what you can now explain."/><label className="lesson-confirm"><input type="checkbox" checked={practiceConfirmed} onChange={(event) => setPracticeConfirmed(event.target.checked)}/><span>I did the work myself and can explain the result without copying.</span></label><p className="study-muted">To complete: enter at least 30 characters of evidence and tick the confirmation box. The button will tell you what is missing.</p><button type="button" className="ghost-btn" disabled={saved.mastered.includes(activeLesson.id)} onClick={completePracticeLesson}>{saved.mastered.includes(activeLesson.id) ? "LESSON ALREADY COMPLETE" : "COMPLETE LESSON · +10 XP"}</button></> : <><p className="study-muted">{lessonMode === "practice" ? "This tile is locked for practice. Pass the test-out challenge to demonstrate readiness, or finish the earlier step first." : "Answer all three questions correctly to test out of this step and unlock the next tile."}</p><div className="lesson-quiz">{activeChecks.map((check, index) => <fieldset className="lesson-question" key={`${activeLesson.id}-${index}`}><legend>{index + 1}. {check.question}</legend>{check.options.map((option, optionIndex) => <label className="lesson-option" key={option}><input type="radio" name={`quiz-${activeLesson.id}-${index}`} checked={lessonAnswers[index] === optionIndex} onChange={() => setLessonAnswers((answers) => ({ ...answers, [index]: optionIndex }))}/><span>{option}</span></label>)}{lessonAnswers[index] !== undefined && <p className={lessonAnswers[index] === check.answer ? "lesson-correct" : "lesson-incorrect"}>{lessonAnswers[index] === check.answer ? "Correct. " : "Review: "}{check.why}</p>}</fieldset>)}</div><label className="study-label" htmlFor="test-out-evidence">Show what proves you already know this skill (required)</label><textarea id="test-out-evidence" className="field" rows={3} value={testOutEvidence} onChange={(event) => setTestOutEvidence(event.target.value)} placeholder="Describe a solution, exercise, project, or result you can explain and reproduce. Be specific to this step."/><label className="lesson-confirm"><input type="checkbox" checked={testOutConfirmed} onChange={(event) => setTestOutConfirmed(event.target.checked)}/><span>I can demonstrate this skill without copying a solution.</span></label><button type="button" className="ghost-btn" disabled={saved.mastered.includes(activeLesson.id) || !testOutConfirmed || testOutEvidence.trim().length < 30 || activeChecks.some((_, index) => lessonAnswers[index] === undefined)} onClick={submitAssessment}>SUBMIT MASTERY CHECK</button></>}
        {lessonFeedback && <p className="lesson-feedback" role="status">{lessonFeedback}</p>}
        <div className="lesson-timer"><div><strong>Focus timer</strong><span>{time}</span></div><div className="study-actions">{!running ? <button type="button" className="chip" onClick={startTimer}>{secondsLeft > 0 ? "RESUME" : "START SESSION"}</button> : <button type="button" className="chip" onClick={() => setRunning(false)}>PAUSE</button>}{timerStarted && <button type="button" className="ghost-btn" onClick={endSession}>END SESSION &amp; SAVE</button>}<button type="button" className="chip" onClick={resetTimer}>RESET</button></div></div>
      </section>      <details className="study-extras"><summary>Notes, extra resources & backups (optional)</summary>
      <div className="section-label">Evidence, not vibes</div>
      <label className="study-label" htmlFor="study-notes">Your own explanation / attempt / mistakes</label>
      <textarea id="study-notes" className="field" rows={6} value={saved.notes} onChange={(e) => patchSaved({ notes: e.target.value })} placeholder="Without AI: explain the idea, write your approach, test edge cases, state time/space complexity, record what failed, and write one retrieval question." />
      <label className="study-label" htmlFor="study-evidence">What did you actually finish?</label>
      <textarea id="study-evidence" className="field" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Required evidence: solution/commit, completed practice, or detailed concept note." />
      <div className="study-actions">
        <button type="button" className="ghost-btn" onClick={logEvidence} disabled={!evidence.trim() && !saved.notes.trim()}>LOG EVIDENCE</button>
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
      </details>
      <div className="section-label">Ask for a hint</div>
      <div className="study-coach">
        <p className="study-muted">Optional and manual. Only your question, the active lesson title and mastered steps are sent to the configured AI provider. Your notes, code, logs and custom resources are not sent or saved as chat history.</p>
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
