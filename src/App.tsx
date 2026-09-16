import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Gauge, Keyboard, Lightbulb, RotateCcw, Timer, TriangleAlert, Trophy, X } from "lucide-react";
import { press, nextKeys, typeable, LESSONS, BOOK, LAYOUTS, layoutById, selfCheck, metrics, translitStep, reachable, typeableSearch, onTrack, aksharas, KEY_ROWS, KEY_CAP, FINGER, nfc, ASCII, FINGER_LABEL, FINGER_COLOR, loadProgress, saveProgress, progressKey, doneCount } from "./engine";
import type { LayoutId, Lesson, Chapter, Metrics, PressResult, Layout, ProgressMap } from "./engine";
/* ---------- theme ---------- */

type Theme = { bg: string; panel: string; edge: string; fg: string; muted: string; accent: string; good: string; bad: string };

const theme: Theme = {
  bg: "#12100c",
  panel: "rgba(32, 28, 22, 0.72)",
  edge: "rgba(232, 163, 61, 0.18)",
  fg: "#f2e8d5",
  muted: "#a09480",
  accent: "#e8a33d",
  good: "#7fb069",
  bad: "#e2705f",
};

/* ---------- presentational ---------- */

function Key({
  code, lay, hint, wrong, armed,
}: {
  code: string; lay: Layout; hint: "primary" | "alt" | null; wrong: boolean; armed: boolean;
}) {
  const m = lay.keys[code];
  const base = m ? m[0] : ASCII[code]?.[0] ?? "";
  const shifted = m ? m[1] : ASCII[code]?.[1] ?? "";
  const finger = FINGER[code] ?? 0;
  const isSpace = code === "Space";

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-md border transition-all duration-100"
      style={{
        width: isSpace ? 268 : 54,
        height: 54,
        borderColor: hint ? theme.accent : wrong ? theme.bad : theme.edge,
        background: hint
          ? `linear-gradient(180deg, rgba(232,163,61,0.22), rgba(232,163,61,0.06))`
          : armed
            ? "rgba(232,163,61,0.10)"
            : "rgba(255,255,255,0.028)",
        boxShadow: hint ? `0 0 0 1px ${theme.accent}, 0 0 18px rgba(232,163,61,0.28)` : "none",
      }}
      title={hint ? `${KEY_CAP[code] ?? code} · ${FINGER_LABEL[finger]}` : undefined}
    >
      <span className="absolute left-1 top-0.5 text-[9px] font-medium" style={{ color: theme.muted }}>
        {KEY_CAP[code] ?? code.replace("Key", "")}
      </span>
      {shifted ? (
        <span className="absolute right-1 top-0.5 text-[9px]" style={{ color: theme.muted, opacity: 0.75 }}>
          {shifted}
        </span>
      ) : null}
      <span className="text-[19px] leading-none" style={{ color: hint ? theme.accent : theme.fg }}>
        {base}
      </span>
      <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b" style={{ background: FINGER_COLOR[finger] ?? "transparent", opacity: hint ? 1 : 0.45 }} />
    </div>
  );
}

function VirtualKeyboard({
  lay, hintCode, hintShift, wrongCode, armed,
}: {
  lay: Layout; hintCode: string | null; hintShift: boolean; wrongCode: string | null; armed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {KEY_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1.5" style={{ marginLeft: i === 1 ? 14 : i === 2 ? 22 : i === 3 ? 34 : 0 }}>
          {row.map((code) => (
            <Key
              key={code}
              code={code}
              lay={lay}
              hint={hintCode === code ? "primary" : null}
              wrong={wrongCode === code}
              armed={armed}
            />
          ))}
        </div>
      ))}
      <div className="mt-1 flex items-center gap-3">
        <Key code="Space" lay={lay} hint={hintCode === "Space" ? "primary" : null} wrong={wrongCode === "Space"} armed={armed} />
        {hintShift && hintCode ? (
          <span className="text-xs font-medium" style={{ color: theme.accent }}>
            hold Shift
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: theme.edge, background: "rgba(255,255,255,0.02)" }}>
      <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>{label}</div>
      <div className="font-mono text-xl leading-tight" style={{ color: tone ?? theme.fg }}>{value}</div>
      {sub ? <div className="text-[10px]" style={{ color: theme.muted }}>{sub}</div> : null}
    </div>
  );
}

/** Target text rendered akshara by akshara. */
function AksharaText({ target, typed, errored }: { target: string; typed: string; errored: boolean }) {
  const units = useMemo(() => aksharas(target), [target]);
  let consumed = 0;
  const active = units.findIndex((u) => {
    consumed += u.length;
    return consumed >= nfc(typed).length;
  });
  let offset = 0;
  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-2" style={{ fontFamily: "'Noto Sans Tamil', system-ui, sans-serif" }}>
      {units.map((u, i) => {
        const start = offset;
        offset += u.length;
        const done = nfc(typed).length >= offset;
        const isActive = i === active;
        return (
          <span key={i} className="relative">
            <span
              className="text-[34px] leading-[1.35] transition-colors duration-100"
              style={{
                color: done ? theme.good : isActive ? (errored ? theme.bad : theme.fg) : "rgba(242,232,213,0.28)",
              }}
            >
              {u}
            </span>
            {isActive ? (
              <span
                className="absolute -bottom-1 left-0 right-0 h-[2px]"
                style={{ background: errored ? theme.bad : theme.accent }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* ============================================================================
   The app
   ========================================================================== */

const EXAM_TEXT = "தமிழ் மொழி மிகவும் பழமையானது. அது இனிமையானது.";
const EXAM_SECONDS = 60;

type Phase = "idle" | "typing" | "done";


function CertIssue({ m, errors, strokes, layoutId, lessonId, itemIndex, target, elapsedMs, theme }: {
  m: Metrics; errors: number; strokes: number; layoutId: LayoutId; lessonId: string;
  itemIndex: number; target: string; elapsedMs: number; theme: Theme;
}) {
  const [server, setServer] = useState(() => localStorage.getItem("kalappai.certServer") ?? "");
  const [alias, setAlias] = useState(() => localStorage.getItem("kalappai.certAlias") ?? "");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg?: string; url?: string }>({ kind: "idle" });

  const issue = async () => {
    let base = server.trim();
    if (!base || !alias.trim()) { setState({ kind: "err", msg: "Both an alias and a certification server URL are needed." }); return; }
    if (!base.startsWith("http")) base = "https://" + base;
    if (!base.endsWith("/")) base += "/";
    localStorage.setItem("kalappai.certServer", base);
    localStorage.setItem("kalappai.certAlias", alias.trim());
    setState({ kind: "busy" });
    try {
      const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nfc(target)));
      const passageHash = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const res = await fetch(base + "api/certificates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alias: alias.trim(), layoutId, passageId: `${lessonId}:${itemIndex}`, targetHash: passageHash,
          stats: { grossWpm: m.gross, netWpm: m.net, accuracy: m.accuracy, errors, strokes,
                   kdph: m.kdph, elapsedMs, chars: nfc(target).length },
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setState({ kind: "err", msg: j.error === "attempt does not meet pass rules"
          ? "Below the pass rules (accuracy ≥ 90 %, ≥ 30 s, ≥ 120 characters)."
          : (j.error ?? res.statusText) });
        return;
      }
      setState({ kind: "ok", url: j.verifyUrl ?? `${base}certs/${j.id}` });
    } catch (e) { setState({ kind: "err", msg: (e as Error).message }); }
  };

  const inp = "rounded-md border px-2.5 py-1.5 text-sm w-full";
  const st = { borderColor: theme.edge, background: "rgba(0,0,0,0.3)", color: theme.fg } as const;

  return (
    <div className="mt-4 rounded-lg border px-3.5 py-3" style={{ borderColor: theme.edge }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
          verifiable practice certificate · optional
        </span>
        <button onClick={() => setOpen((o) => !o)} className="text-xs underline" style={{ color: theme.accent }}>
          {open ? "hide" : "issue one"}
        </button>
      </div>
      {open ? (
        <div className="mt-2.5 space-y-2">
          <input className={inp} style={st} placeholder="Name on certificate (alias)" value={alias}
            onChange={(e) => setAlias(e.target.value)} maxLength={60} />
          <input className={inp} style={st} placeholder="Certification server URL (e.g. https://certs.example.org)"
            value={server} onChange={(e) => setServer(e.target.value)} />
          <button onClick={issue} disabled={state.kind === "busy"}
            className="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: theme.accent, color: "#1a1408" }}>
            {state.kind === "busy" ? "issuing…" : "Issue & sign"}
          </button>
          {state.kind === "err" ? <p className="text-xs" style={{ color: theme.bad }}>{state.msg}</p> : null}
          {state.kind === "ok" ? (
            <p className="text-xs" style={{ color: theme.good }}>
              Issued. Anyone can verify it at{" "}
              <a className="underline" href={state.url} target="_blank" rel="noreferrer">{state.url}</a>
            </p>
          ) : null}
          <p className="text-[11px]" style={{ color: theme.muted }}>
            The server re-checks pass rules and signs the record. Kalappai certificates are practice records, not
            government qualifications.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function Kalappai() {
  const [layoutId, setLayoutId] = useState<LayoutId>("tamil99");
  const [lessonId, setLessonId] = useState("L1");
  const [itemIndex, setItemIndex] = useState(0);
  const [mode, setMode] = useState<"learn" | "exam">("learn");
  const [buf, setBuf] = useState("");
  const [strokes, setStrokes] = useState(0);
  const [errors, setErrors] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [last, setLast] = useState<PressResult | null>(null);
  const [wrongCode, setWrongCode] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [showWhy, setShowWhy] = useState(true);
  const [view, setView] = useState<"book" | "practice">("book");
  const [progress, setProgress] = useState<ProgressMap>(loadProgress);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* Real keystrokes arrive as separate tasks, but never let the handler act on a
     stale closure: the committed line lives in a ref alongside its state copy. */
  const bufRef = useRef("");
  const deadRef = useRef(false);

  const lay = layoutById(layoutId);
  const lesson = LESSONS.find((l) => l.id === lessonId)!;
  const target = mode === "exam" ? EXAM_TEXT : lesson.items[Math.min(itemIndex, lesson.items.length - 1)];
  const targetNfc = useMemo(() => nfc(target), [target]);
  const check = useMemo(() => selfCheck(), []);

  /* layout switching must not leave a half-typed line from another layout */
  useEffect(() => {
    bufRef.current = "";
    deadRef.current = false;
    setBuf("");
    setStrokes(0);
    setErrors(0);
    setPhase("idle");
    setStartedAt(null);
    setDead(false);
    setLast(null);
  }, [layoutId, lessonId, mode]);

  useEffect(() => {
    if (lesson.layouts && !lesson.layouts.includes(layoutId)) {
      const ok = LESSONS.find((l) => !l.layouts || l.layouts.includes(layoutId));
      if (ok) setLessonId(ok.id);
    }
  }, [layoutId, lesson]);

  const elapsedMs = startedAt ? Math.max(now - startedAt, 0) : 0;
  const m = useMemo(() => metrics(buf.length, errors, strokes, elapsedMs), [buf.length, errors, strokes, elapsedMs]);
  /* Speed means nothing in the first second or two. Show a dash, not a fantasy. */
  const warm = elapsedMs >= 2000 || phase === "done";
  const rate = (v: number, dp = 1) => (warm ? v.toFixed(dp) : "—");
  const accText = (dp = 0) => (strokes >= 5 || phase === "done" ? `${m.accuracy.toFixed(dp)}%` : "—");
  const examLeft = mode === "exam" ? Math.max(EXAM_SECONDS - Math.floor(elapsedMs / 1000), 0) : 0;

  useEffect(() => {
    if (phase !== "typing") return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(() => setPhase("done"), []);

  useEffect(() => {
    if (mode === "exam" && phase === "typing" && examLeft <= 0) finish();
  }, [mode, phase, examLeft, finish]);

  useEffect(() => {
    if (phase === "typing" && nfc(buf) === targetNfc) {
      if (mode === "exam") {
        finish();
        return;
      }
      setProgress((p) => {
        const np = { ...p, [progressKey(layoutId, lessonId, itemIndex)]: 1 as const };
        saveProgress(np);
        return np;
      });
      setPhase("done");
    }
  }, [buf, targetNfc, phase, mode, layoutId, lessonId, itemIndex, finish]);

  const nextKey = useMemo(
    () => (phase === "done" ? [] : nextKeys(lay, buf, targetNfc, dead)),
    [lay, buf, targetNfc, dead, phase],
  );
  const hint = nextKey[0] ?? null;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["Tab", "F5", "F12", "ContextMenu"].includes(e.key)) return;
      if (e.key === "Escape") {
        bufRef.current = "";
        deadRef.current = false;
        setBuf("");
        setStrokes(0);
        setErrors(0);
        setPhase("idle");
        setStartedAt(null);
        setLast(null);
        setDead(false);
        return;
      }
      if (phase === "done") return;

      if (e.key === "Backspace") {
        e.preventDefault();
        bufRef.current = bufRef.current.slice(0, -1);
        setBuf(bufRef.current);
        return;
      }
      /* only intercept keys this layout actually claims — leave browser keys alone */
      if (!(e.code in lay.keys) && !(e.code in ASCII)) return;
      e.preventDefault();

      const cur = bufRef.current;
      const r = press(lay, cur, e.code, e.shiftKey, deadRef.current);
      const rep = r.replace ?? 0;
      const nb = rep ? cur.slice(0, cur.length - rep) + r.out : cur + r.out;

      if (phase === "idle") {
        setPhase("typing");
        setStartedAt(Date.now());
        setNow(Date.now());
      }
      setStrokes((s) => s + 1);
      setLast(r);

      if (!r.dead && !onTrack(nfc(nb), targetNfc) && !reachable(lay, nfc(nb), targetNfc, r.dead)) {
        /* wrong key: counted, never printed — the line stays correct */
        setErrors((x) => x + 1);
        setWrongCode(e.code);
        window.setTimeout(() => setWrongCode(null), 220);
        deadRef.current = false;
        setDead(false);
        return;
      }
      bufRef.current = nb;
      deadRef.current = r.dead;
      setBuf(nb);
      setDead(r.dead);
    },
    [lay, phase, targetNfc],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const restart = () => {
    bufRef.current = "";
    deadRef.current = false;
    setBuf("");
    setStrokes(0);
    setErrors(0);
    setPhase("idle");
    setStartedAt(null);
    setLast(null);
    setDead(false);
  };

  const nextItem = () => {
    if (mode === "exam") return restart();
    setItemIndex((i) => (i + 1) % lesson.items.length);
    restart();
  };

  const markDoneAndAdvance = () => {
    const next = itemIndex + 1;
    if (next < lesson.items.length) {
      setItemIndex(next);
      restart();
    } else {
      setView("book");
    }
  };

  const openLesson = (id: string) => {
    setLessonId(id);
    setItemIndex(0);
    setMode("learn");
    setView("practice");
    restart();
  };

  const chapterOf = BOOK.find((c) => c.lessons.some((l) => l.id === lessonId));

  const units = aksharas(target);
  const doneUnits = aksharas(nfc(buf)).length;
  const isLast = itemIndex >= lesson.items.length - 1;

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-8"
      style={{ background: theme.bg, color: theme.fg }}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&display=swap" />

      <div className="mx-auto max-w-[1220px]">
        {/* header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Noto Sans Tamil', system-ui, sans-serif" }}>
                கலப்பை
              </h1>
              <span className="rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.18em]" style={{ borderColor: theme.edge, color: theme.muted }}>
                Kalappai · demo
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: theme.muted }}>
              Tamil-first typing tutor. Nothing is installed on your computer — the page reads physical keys and runs
              each layout's own rule machine, so Tamil appears in three incompatible layouts from one window.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.muted }}>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: theme.edge }}>
              <span className="size-1.5 rounded-full" style={{ background: check.ok ? theme.good : theme.bad }} />
              engine self-check {check.ok ? "pass" : "fail"} · {check.lines.length} line×layout pairs
            </span>
          </div>
        </header>

        {/* controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border p-0.5" style={{ borderColor: theme.edge }}>
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayoutId(l.id)}
                className="rounded-md px-3.5 py-1.5 text-sm transition-colors"
                style={{
                  background: layoutId === l.id ? "rgba(232,163,61,0.16)" : "transparent",
                  color: layoutId === l.id ? theme.accent : theme.muted,
                  fontWeight: layoutId === l.id ? 600 : 400,
                }}
              >
                <span style={{ fontFamily: "'Noto Sans Tamil', system-ui, sans-serif" }}>{l.tamilName}</span>
                <span className="ml-2 text-[11px] opacity-70">{l.name}</span>
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border p-0.5" style={{ borderColor: theme.edge }}>
            {(["learn", "exam"] as const).map((mm) => (
              <button
                key={mm}
                onClick={() => setMode(mm)}
                className="rounded-md px-3.5 py-1.5 text-sm capitalize transition-colors"
                style={{
                  background: mode === mm ? "rgba(232,163,61,0.16)" : "transparent",
                  color: mode === mm ? theme.accent : theme.muted,
                  fontWeight: mode === mm ? 600 : 400,
                }}
              >
                {mm}
              </button>
            ))}
          </div>

          <button
            onClick={() => setView((v) => (v === "book" ? "practice" : "book"))}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: view === "book" ? theme.accent : theme.edge, color: view === "book" ? theme.accent : theme.muted }}
          >
            <BookOpen className="size-3.5" /> lesson book
          </button>
          <button
            onClick={restart}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: theme.edge, color: theme.muted }}
          >
            <RotateCcw className="size-3.5" /> reset
          </button>
          <button
            onClick={() => setShowWhy((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: showWhy ? theme.accent : theme.edge, color: showWhy ? theme.accent : theme.muted }}
          >
            <Lightbulb className="size-3.5" /> rule explainer
          </button>

          <span className="text-xs" style={{ color: theme.muted }}>
            {lay.blurb}
          </span>
        </div>

        <div className={view === "book" ? "flex flex-col gap-6" : "grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)_260px]"}>
          {/* lessons */}
          <aside className={view === "book" ? "" : "order-2 lg:order-1"}>
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
              <BookOpen className="size-3.5" /> {view === "book" ? "the lesson book" : "lessons"}
            </div>
            {view === "book" ? (
              <div className="flex flex-col gap-8">
                <p className="max-w-3xl text-sm" style={{ color: theme.muted }}>
                  Thirteen lessons in five chapters — {LESSONS.reduce((n, l) => n + l.items.length, 0)} exercises in all.
                  Finish an exercise and the next one unlocks; progress is saved on this device, per layout. Pick a lesson:
                </p>
                {BOOK.map((ch) => (
                  <div key={ch.id}>
                    <div className="mb-2 flex items-baseline gap-3">
                      <span className="text-lg font-semibold" style={{ fontFamily: "'Noto Sans Tamil', system-ui, sans-serif", color: theme.accent }}>
                        {ch.tamil}
                      </span>
                      <span className="text-sm font-medium" style={{ color: theme.fg }}>{ch.title}</span>
                      <span className="text-[11px]" style={{ color: theme.muted }}>
                        {ch.lessons.reduce((n, l) => n + doneCount(progress, layoutId, l.id, l.items.length), 0)} /{" "}
                        {ch.lessons.reduce((n, l) => n + l.items.length, 0)} done
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {ch.lessons.map((l) => {
                        const avail = !l.layouts || l.layouts.includes(layoutId);
                        const done = doneCount(progress, layoutId, l.id, l.items.length);
                        const complete = done >= l.items.length;
                        return (
                          <button
                            key={l.id}
                            disabled={!avail}
                            onClick={() => openLesson(l.id)}
                            className="rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-35"
                            style={{ borderColor: complete ? theme.good : theme.edge, background: "rgba(255,255,255,0.015)" }}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span style={{ color: theme.fg }}>{l.title}</span>
                              <span className="font-mono text-[10px]" style={{ color: complete ? theme.good : theme.muted }}>
                                {done}/{l.items.length}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px]" style={{ color: theme.muted, fontFamily: "'Noto Sans Tamil', system-ui, sans-serif" }}>
                              {l.tamil}{!avail ? " · InScript only" : ""}
                            </div>
                            <div className="mt-1.5 h-[3px] rounded" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="h-full rounded" style={{ width: `${(done / l.items.length) * 100}%`, background: complete ? theme.good : theme.accent }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="flex flex-col gap-1.5">
              {LESSONS.map((l) => {
                const avail = !l.layouts || l.layouts.includes(layoutId);
                const active = l.id === lessonId && mode === "learn";
                return (
                  <button
                    key={l.id}
                    disabled={!avail}
                    onClick={() => {
                      setLessonId(l.id);
                      setItemIndex(0);
                      setMode("learn");
                      restart();
                    }}
                    className="rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-35"
                    style={{
                      borderColor: active ? theme.accent : theme.edge,
                      background: active ? "rgba(232,163,61,0.10)" : "transparent",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ color: active ? theme.accent : theme.fg }}>{l.title}</span>
                      <span className="font-mono text-[10px]" style={{ color: theme.muted }}>
                        {doneCount(progress, layoutId, l.id, l.items.length)}/{l.items.length}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: theme.muted, fontFamily: "'Noto Sans Tamil', system-ui, sans-serif" }}>
                      {l.tamil}
                      {!avail ? " · InScript only" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </aside>

          {view === "practice" ? (
          <>
          {/* stage */}
          <section className="order-1 lg:order-2">
            <div className="rounded-2xl border p-5" style={{ borderColor: theme.edge, background: theme.panel }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                  <Keyboard className="size-3.5" />
                  {mode === "exam" ? "timed examination" : `${lesson.id} · ${lesson.title} · exercise ${itemIndex + 1}/${lesson.items.length}`}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: theme.muted }}>
                  <span>
                    akshara <span className="font-mono">{Math.min(doneUnits, units.length)}</span> / {units.length}
                  </span>
                  {mode === "exam" && phase === "typing" ? (
                    <span className="inline-flex items-center gap-1 font-mono" style={{ color: theme.accent }}>
                      <Timer className="size-3.5" /> {examLeft}s
                    </span>
                  ) : null}
                  {dead ? <span style={{ color: theme.accent }}>caret armed ^</span> : null}
                </div>
              </div>

              {phase === "done" && mode === "learn" ? (
                <div className="rounded-xl border p-4" style={{ borderColor: theme.good }}>
                  <div className="flex items-center gap-2" style={{ color: theme.good }}>
                    <Check className="size-4" /> <span className="font-semibold">Line complete</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="net speed" value={elapsedMs < 2000 ? "—" : m.net.toFixed(1)} sub="wpm (net)" />
                    <Stat label="accuracy" value={`${m.accuracy.toFixed(1)}%`} sub={`${errors} error${errors === 1 ? "" : "s"}`} />
                    <Stat label="keystrokes" value={elapsedMs < 2000 ? "—" : m.kdph.toFixed(0)} sub="kdpH" />
                    <Stat label="akshara/min" value={elapsedMs < 2000 ? "—" : ((doneUnits / Math.max(elapsedMs, 1)) * 60000).toFixed(0)} sub="grapheme rate" />
                  </div>
                  {elapsedMs < 2000 && (
                    <p className="mt-2 text-xs" style={{ color: theme.muted }}>
                      Speed counts only from two seconds onward — tap-through runs don't produce a number.
                    </p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <button onClick={markDoneAndAdvance} className="rounded-lg px-3.5 py-1.5 text-sm font-medium" style={{ background: theme.accent, color: "#1a1408" }}>
                      {isLast ? "Lesson done — back to book" : "Next exercise"}
                    </button>
                    <button onClick={restart} className="rounded-lg border px-3.5 py-1.5 text-sm" style={{ borderColor: theme.edge, color: theme.muted }}>
                      Repeat
                    </button>
                    <button onClick={() => setView("book")} className="rounded-lg border px-3.5 py-1.5 text-sm" style={{ borderColor: theme.edge, color: theme.muted }}>
                      Book
                    </button>
                  </div>
                </div>
              ) : phase === "done" && mode === "exam" ? (
                <div className="rounded-xl border p-4" style={{ borderColor: theme.accent }}>
                  <div className="flex items-center gap-2" style={{ color: theme.accent }}>
                    <Trophy className="size-4" /> <span className="font-semibold">Practice record</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="gross" value={`${m.gross.toFixed(1)}`} sub="wpm" />
                    <Stat label="net" value={`${m.net.toFixed(1)}`} sub="wpm" tone={theme.accent} />
                    <Stat label="accuracy" value={`${m.accuracy.toFixed(1)}%`} sub={`${strokes} strokes`} />
                    <Stat label="errors" value={`${errors}`} sub="wrong keys" tone={errors ? theme.bad : theme.good} />
                  </div>
                  <p className="mt-3 text-xs" style={{ color: theme.muted }}>
                    Net = (characters − errors) ÷ 5 ÷ minutes. A practice record only — it is not a TNDTE or TNPSC
                    certificate, and this passage is not an official question paper.
                  </p>
                  <CertIssue m={m} errors={errors} strokes={strokes} layoutId={layoutId}
                    lessonId={lessonId} itemIndex={itemIndex} target={target} elapsedMs={elapsedMs} theme={theme} />
                  <button onClick={restart} className="mt-3 rounded-lg px-3.5 py-1.5 text-sm font-medium" style={{ background: theme.accent, color: "#1a1408" }}>
                    Again
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
                    <span>type this</span>
                    <span>{mode === "exam" ? "metrics hidden until the bell" : lesson.teaches}</span>
                  </div>
                  <AksharaText target={target} typed={buf} errored={wrongCode !== null} />

                  <div className="mt-5 rounded-xl border px-4 py-3" style={{ borderColor: theme.edge, background: "rgba(0,0,0,0.22)" }}>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
                      what you have actually typed
                    </div>
                    <div
                      className="min-h-[38px] text-[26px] leading-[1.4]"
                      style={{ fontFamily: "'Noto Sans Tamil', system-ui, sans-serif", color: buf ? theme.good : "rgba(160,148,128,0.5)" }}
                    >
                      {buf ? nfc(buf) : "—"}
                    </div>
                  </div>

                  {phase === "idle" ? (
                    <p className="mt-4 text-sm" style={{ color: theme.muted }}>
                      Start typing — your first keystroke begins the clock. Press <span className="font-mono">Esc</span> to
                      reset, <span className="font-mono">Backspace</span> to undo.
                    </p>
                  ) : null}

                  {nextKey.length === 0 && phase !== "done" ? (
                    <p className="mt-4 flex items-center gap-2 text-sm" style={{ color: theme.bad }}>
                      <TriangleAlert className="size-4" /> No key in this layout produces the next character — a real
                      coverage gap, not a mistake.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {/* explainer */}
            {showWhy ? (
              <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: theme.edge, background: "rgba(0,0,0,0.18)" }}>
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                  <Lightbulb className="size-3.5" /> why that key did that
                </div>
                {last ? (
                  <div className="text-sm">
                    <div
                      className="mb-1 inline-flex items-center gap-2 rounded px-2 py-0.5 font-mono text-[11px]"
                      style={{
                        background:
                          last.tone === "auto" ? "rgba(232,163,61,0.16)" : last.tone === "taught" ? "rgba(95,160,196,0.16)" : "rgba(255,255,255,0.06)",
                        color: last.tone === "auto" ? theme.accent : last.tone === "taught" ? "#8fc4e0" : theme.muted,
                      }}
                    >
                      {last.rule}
                    </div>
                    <p style={{ color: theme.fg }}>{last.note || "—"}</p>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: theme.muted }}>
                    Each keystroke is explained here using the rule name from the layout's own source file.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <VirtualKeyboard
                lay={lay}
                hintCode={hint?.code ?? null}
                hintShift={hint?.shift ?? false}
                wrongCode={wrongCode}
                armed={dead}
              />
            </div>
          </section>

          {/* right rail */}
          <aside className="order-3">
            <div className="rounded-2xl border p-4" style={{ borderColor: theme.edge, background: theme.panel }}>
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                <Gauge className="size-3.5" /> live
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="gross" value={mode === "exam" && phase === "typing" ? "••" : rate(m.gross, 0)} sub="wpm" />
                <Stat label="net" value={mode === "exam" && phase === "typing" ? "••" : rate(m.net, 0)} sub="wpm" />
                <Stat label="accuracy" value={mode === "exam" && phase === "typing" ? "••" : accText(0)} sub={`${errors} err`} />
                <Stat label="kdpH" value={mode === "exam" && phase === "typing" ? "••" : rate(m.kdph, 0)} sub="keys/hr" />
              </div>
              <div className="mt-3 space-y-1 text-[11px]" style={{ color: theme.muted }}>
                <div className="flex justify-between"><span>characters</span><span className="font-mono">{buf.length}</span></div>
                <div className="flex justify-between"><span>strokes</span><span className="font-mono">{strokes}</span></div>
                <div className="flex justify-between"><span>elapsed</span><span className="font-mono">{(elapsedMs / 1000).toFixed(1)}s</span></div>
                <div className="flex justify-between"><span>error policy</span><span className="font-mono">block</span></div>
              </div>
              <p className="mt-3 text-[11px]" style={{ color: theme.muted }}>
                A wrong key is counted and never printed, so your output stays correct. WPM uses the standard
                5-character word.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: theme.edge, background: "rgba(0,0,0,0.18)" }}>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: theme.muted }}>
                layout provenance
              </div>
              <p className="text-xs" style={{ color: theme.fg }}>{lay.source}</p>
              <p className="mt-1 text-[11px]" style={{ color: theme.muted }}>{lay.license}</p>
              <a href={lay.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] underline" style={{ color: theme.accent }}>
                source
              </a>
              {lay.divergences.length ? (
                <>
                  <div className="mt-3 mb-1 text-[11px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>
                    divergence ledger
                  </div>
                  <ul className="space-y-1.5 text-[11px]" style={{ color: theme.muted }}>
                    {lay.divergences.map((d, i) => (
                      <li key={i} className="border-l pl-2" style={{ borderColor: theme.edge }}>{d}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border p-4 text-[11px]" style={{ borderColor: theme.edge, color: theme.muted }}>
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em]">fingers</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(FINGER_LABEL).map(([n, label]) => (
                  <span key={n} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: FINGER_COLOR[Number(n)] }} />
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-3">
                Tamil in this page renders with Noto Sans Tamil, so the glyphs are the same on every machine — a
                typewriter font is not smuggled in.
              </p>
            </div>
          </aside>
          </>
          ) : null}
        </div>

        <footer className="mt-8 border-t pt-4 text-[11px]" style={{ borderColor: theme.edge, color: theme.muted }}>
          <p>
            Layout data derived from open sources: Keyman <span className="font-mono">thamizha_tamil99_ext</span> v2.2.1
            (MIT © thamizha.com and SIL Global) · xkb-data 2.35.1 <span className="font-mono">symbols/in</span> variants{" "}
            <span className="font-mono">tam</span> and <span className="font-mono">tam_tamilnet</span> ·{" "}
            wikimedia/jquery.ime rules (GPL-2.0-or-later OR MIT) used for cross-validation only.
          </p>
          <p className="mt-1">
            Kalappai is the working demo of the spec at{" "}
            <span className="font-mono">ThamizhKanimai/input-methods/tamil-typing-tutor/</span> — requirements and
            technical specification, Phases M0–M6.
          </p>
        </footer>
      </div>
    </main>
  );
}
