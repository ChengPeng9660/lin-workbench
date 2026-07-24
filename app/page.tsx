"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "plan" | "inspiration" | "review";
type Task = { id: string; title: string; duration: string; done: boolean; color: string };
type Idea = { id: string; text: string; createdAt: string };
type Review = { win: string; improve: string; tomorrow: string };
type DiaryEntry = { id: string; category: string; text: string; createdAt: string };
type WorkspaceSnapshot = {
  tasksByDate: Record<string, Task[]>;
  ideas: Idea[];
  reviews: Record<string, Review>;
  diary: Record<string, DiaryEntry[]>;
};

const palette = ["#d97757", "#809b87", "#8293b2", "#b28c62", "#947da7"];
const starterTasks: Task[] = [];

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readTaskArchive(currentKey: string, currentTasks?: Task[]): Record<string, Task[]> {
  if (typeof window === "undefined") return {};
  const archive: Record<string, Task[]> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey?.startsWith("lin-tasks-")) continue;
    archive[storageKey.slice("lin-tasks-".length)] = load(storageKey, []);
  }
  if (currentTasks) archive[currentKey] = currentTasks;
  return archive;
}

function mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
  return Array.from(new Map([...cloud, ...local].map((item) => [item.id, item])).values());
}

const navItems: { id: View; label: string; mark: string }[] = [
  { id: "plan", label: "æ¯æ—¥è®¡åˆ’", mark: "01" },
  { id: "inspiration", label: "çµæ„Ÿ", mark: "02" },
  { id: "review", label: "æ¯æ—¥å¤ç›˜", mark: "03" },
];

export default function Home() {
  const today = useMemo(() => new Date(), []);
  const key = dateKey(today);
  const [view, setView] = useState<View>("plan");
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [diary, setDiary] = useState<Record<string, DiaryEntry[]>>({});
  const [selectedDate, setSelectedDate] = useState(key);
  const [taskName, setTaskName] = useState("");
  const [taskDuration, setTaskDuration] = useState("30 åˆ†é’Ÿ");
  const [ideaText, setIdeaText] = useState("");
  const [diaryText, setDiaryText] = useState("");
  const [diaryCategory, setDiaryCategory] = useState("æ‰€é‡ä¹‹äº‹");
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("æ­£åœ¨è¿žæŽ¥");
  const [syncAccount, setSyncAccount] = useState("");

  useEffect(() => {
    setTasks(load(`lin-tasks-${key}`, starterTasks));
    setIdeas(load("lin-ideas", []));
    setReviews(load("lin-reviews", {}));
    setDiary(load("lin-diary", {}));
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(`lin-tasks-${key}`, JSON.stringify(tasks));
  }, [tasks, key, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("lin-ideas", JSON.stringify(ideas));
  }, [ideas, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("lin-reviews", JSON.stringify(reviews));
  }, [reviews, ready]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("lin-diary", JSON.stringify(diary));
  }, [diary, ready]);

  function applySnapshot(snapshot: WorkspaceSnapshot) {
    Object.entries(snapshot.tasksByDate ?? {}).forEach(([day, dayTasks]) => {
      window.localStorage.setItem(`lin-tasks-${day}`, JSON.stringify(dayTasks));
    });
    setTasks(snapshot.tasksByDate?.[key] ?? starterTasks);
    setIdeas(snapshot.ideas ?? []);
    setReviews(snapshot.reviews ?? {});
    setDiary(snapshot.diary ?? {});
  }

  async function pullCloud(manual = false) {
    if (manual) setSyncStatus("åŒæ­¥ä¸­");
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setSyncStatus("ä»…æœ¬æœº");
        setCloudReady(true);
        return;
      }
      if (!response.ok) throw new Error("sync unavailable");

      const result = await response.json() as { user: string; state: WorkspaceSnapshot | null };
      setSyncAccount(result.user);
      if (result.state) {
        const hasMigrated = window.localStorage.getItem("lin-cloud-migrated") === "1";
        if (hasMigrated) {
          applySnapshot(result.state);
        } else {
          const localTasks = readTaskArchive(key);
          const localDiary = load<Record<string, DiaryEntry[]>>("lin-diary", {});
          const meaningfulTasks = Object.fromEntries(Object.entries(localTasks).filter(([, dayTasks]) =>
            JSON.stringify(dayTasks) !== JSON.stringify(starterTasks),
          ));
          applySnapshot({
            tasksByDate: { ...result.state.tasksByDate, ...meaningfulTasks },
            ideas: mergeById(result.state.ideas ?? [], load("lin-ideas", [])),
            reviews: { ...result.state.reviews, ...load("lin-reviews", {}) },
            diary: Object.fromEntries(Array.from(new Set([
              ...Object.keys(result.state.diary ?? {}),
              ...Object.keys(localDiary),
            ])).map((day) => [
              day,
              mergeById(result.state!.diary?.[day] ?? [], localDiary[day] ?? []),
            ])),
          });
        }
      }
      window.localStorage.setItem("lin-cloud-migrated", "1");
      setSyncStatus("å·²åŒæ­¥");
      setCloudReady(true);
    } catch {
      setSyncStatus("ç¦»çº¿ä¿å­˜");
      setCloudReady(true);
    }
  }

  useEffect(() => {
    if (!ready) return;
    void pullCloud();
    // Cloud state is pulled once after local state has been restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || !cloudReady || syncStatus === "ä»…æœ¬æœº") return;
    const timer = window.setTimeout(async () => {
      setSyncStatus("åŒæ­¥ä¸­");
      const snapshot: WorkspaceSnapshot = {
        tasksByDate: readTaskArchive(key, tasks),
        ideas,
        reviews,
        diary,
      };
      try {
        const response = await fetch("/api/sync", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: snapshot }),
        });
        if (!response.ok) throw new Error("sync failed");
        const result = await response.json() as { user?: string };
        if (result.user) setSyncAccount(result.user);
        setSyncStatus("å·²åŒæ­¥");
      } catch {
        setSyncStatus("ç¦»çº¿ä¿å­˜");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tasks, ideas, reviews, diary, key, ready, cloudReady]);

  const completed = tasks.filter((task) => task.done).length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const selectedReview = reviews[selectedDate] ?? { win: "", improve: "", tomorrow: "" };
  const selectedEntries = diary[selectedDate] ?? [];
  const recentDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    return {
      key: dateKey(date),
      day: new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date),
      date: String(date.getDate()).padStart(2, "0"),
    };
  }), [today]);
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(today);

  function addTask(event: FormEvent) {
    event.preventDefault();
    const title = taskName.trim();
    if (!title) return;
    setTasks((current) => [
      ...current,
      {
        id: `${Date.now()}`,
        title,
        duration: taskDuration,
        done: false,
        color: palette[current.length % palette.length],
      },
    ]);
    setTaskName("");
  }

  function addIdea(event: FormEvent) {
    event.preventDefault();
    const text = ideaText.trim();
    if (!text) return;
    setIdeas((current) => [
      { id: `${Date.now()}`, text, createdAt: new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date()) },
      ...current,
    ]);
    setIdeaText("");
  }

  function addDiaryEntry(event: FormEvent) {
    event.preventDefault();
    const text = diaryText.trim();
    if (!text) return;
    const entry: DiaryEntry = {
      id: `${Date.now()}`,
      category: diaryCategory,
      text,
      createdAt: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
    };
    setDiary((current) => ({ ...current, [selectedDate]: [...(current[selectedDate] ?? []), entry] }));
    setDiaryText("");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-seal">æž—</span>
          <div>
            <strong>æž—çš„å·¥ä½œå°</strong>
            <span>DAILY STUDIO</span>
          </div>
        </div>

        <nav aria-label="å·¥ä½œå°å¯¼èˆª">
          <p className="nav-caption">æˆ‘çš„ç©ºé—´</p>
          {navItems.map((item) => (
            <button
              className={`nav-item ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.label}</span>
              <em>{item.mark}</em>
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>ä»Šæ—¥å¯„è¯­</span>
          <p>å¾®å°çš„æ—¥å¸¸ï¼Œç´¯ç§¯æˆæƒ³è¦çš„ç”Ÿæ´»ã€‚</p>
        </div>
        <div className="profile">
          <span className="avatar">L</span>
          <div><strong>Lin</strong><small>ä¿æŒå¥½å¥‡ï¼ŒæŒç»­è¡ŒåŠ¨</small></div>
          <i className="status-dot" />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">TODAY Â· {key.replaceAll("-", ".")}</span>
            <h1>{view === "plan" ? "æŠŠä»Šå¤©ï¼Œè¿‡å¾—å…·ä½“ä¸€ç‚¹ã€‚" : view === "inspiration" ? "æ•æ‰ä¸€é—ªè€Œè¿‡çš„å¿µå¤´ã€‚" : "ç»™ä»Šå¤©ä¸€ä¸ªæ¸©æŸ”çš„å¥å·ã€‚"}</h1>
          </div>
          <div className="top-actions">
            <button className={`sync-pill ${syncStatus === "å·²åŒæ­¥" ? "synced" : ""}`} onClick={() => void pullCloud(true)} title={syncAccount || "äº‘ç«¯åŒæ­¥"}>
              <i /><span>{syncStatus}</span>
            </button>
            <div className="date-card">
              <span className="date-number">{today.getDate()}</span>
              <div><strong>{dateText.split("æ—¥")[0]}æ—¥</strong><small>{dateText.split("æ—¥")[1]}</small></div>
            </div>
          </div>
        </header>

        {view === "plan" && (
          <div className="plan-layout">
            <section className="main-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">DAILY RHYTHM</span>
                  <h2>ä»Šæ—¥è®¡åˆ’</h2>
                </div>
                <span className="task-count">{completed} / {tasks.length} å·²å®Œæˆ</span>
              </div>

              <div className="task-list">
                {tasks.map((task, index) => (
                  <article className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
                    <button
                      className="check"
                      style={{ "--task-color": task.color } as React.CSSProperties}
                      onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}
                      aria-label={`${task.done ? "å–æ¶ˆå®Œæˆ" : "å®Œæˆ"}${task.title}`}
                    >
                      {task.done && "âœ“"}
                    </button>
                    <span className="task-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="task-info">
                      <strong>{task.title}</strong>
                      <small>ä¸ºè‡ªå·±ä¸“æ³¨æŠ•å…¥</small>
                    </div>
                    <span className="duration">{task.duration}</span>
                    <button className="delete" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`åˆ é™¤${task.title}`}>Ã—</button>
                  </article>
                ))}
                {tasks.length === 0 && <div className="empty-state">ä»Šå¤©è¿˜æ²¡æœ‰ä»»åŠ¡ï¼Œå†™ä¸‹ç¬¬ä¸€ä»¶æƒ³å®Œæˆçš„äº‹å§ã€‚</div>}
              </div>

              <form className="add-task" onSubmit={addTask}>
                <span className="add-mark">ï¼‹</span>
                <input value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="æ–°å¢žä¸€é¡¹ä»Šæ—¥ä»»åŠ¡â€¦" aria-label="ä»»åŠ¡åç§°" />
                <select value={taskDuration} onChange={(event) => setTaskDuration(event.target.value)} aria-label="é¢„è®¡æ—¶é•¿">
                  <option>15 åˆ†é’Ÿ</option><option>30 åˆ†é’Ÿ</option><option>45 åˆ†é’Ÿ</option><option>1 å°æ—¶</option><option>2 å°æ—¶</option>
                </select>
                <button type="submit">æ·»åŠ </button>
              </form>
            </section>

            <aside className="insight-column">
              <section className="progress-card">
                <span className="eyebrow">TODAY&apos;S FLOW</span>
                <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                  <div><strong>{progress}%</strong><span>ä»Šæ—¥è¿›åº¦</span></div>
                </div>
                <p>{progress === 100 ? "æ¼‚äº®ï¼ä»Šå¤©çš„è®¡åˆ’å…¨éƒ¨å®Œæˆã€‚" : progress >= 50 ? "èŠ‚å¥å¾ˆå¥½ï¼Œç»§ç»­ä¿æŒã€‚" : "ä¸å¿…ç€æ€¥ï¼Œä»Žä¸€ä»¶å°äº‹å¼€å§‹ã€‚"}</p>
                <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
              </section>
              <section className="quote-card">
                <span className="quote-mark">â€œ</span>
                <blockquote>è‡ªå¾‹ä¸æ˜¯æŸç¼šï¼Œ<br />è€Œæ˜¯ç»™è‡ªç”±é“ºè·¯ã€‚</blockquote>
                <span className="quote-credit">â€” ä»Šæ—¥æé†’</span>
              </section>
            </aside>
          </div>
        )}

        {view === "inspiration" && (
          <section className="main-card view-card">
            <div className="section-heading">
              <div><span className="eyebrow">IDEA GARDEN</span><h2>çµæ„ŸèŠ±å›­</h2></div>
              <span className="task-count">{ideas.length} æ¡çµæ„Ÿ</span>
            </div>
            <form className="idea-form" onSubmit={addIdea}>
              <textarea value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="è®°ä¸‹æ­¤åˆ»çš„æƒ³æ³•ã€ç”»é¢æˆ–ä¸€å¥è¯â€¦" aria-label="æ–°çµæ„Ÿ" />
              <button type="submit">æ”¶è—çµæ„Ÿ</button>
            </form>
            <div className="idea-grid">
              {ideas.map((idea, index) => (
                <article className="idea-note" key={idea.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{idea.text}</p>
                  <footer><small>{idea.createdAt}</small><button onClick={() => setIdeas((current) => current.filter((item) => item.id !== idea.id))} aria-label="åˆ é™¤çµæ„Ÿ">åˆ é™¤</button></footer>
                </article>
              ))}
              {!ideas.length && <div className="empty-state wide">çµæ„Ÿä¸å¿…å®Œæ•´ã€‚å…ˆæŠŠå®ƒç•™ä¸‹ï¼Œå®ƒä¼šæ…¢æ…¢é•¿å‡ºå½¢çŠ¶ã€‚</div>}
            </div>
          </section>
        )}

        {view === "review" && (
          <section className="main-card view-card">
            <div className="section-heading">
              <div><span className="eyebrow">DAILY ARCHIVE</span><h2>æ¯æ—¥è®°å½•</h2></div>
              <span className="autosave">å·²ä¸ºä½ è‡ªåŠ¨ä¿å­˜</span>
            </div>

            <div className="diary-datebar">
              <div className="date-strip">
                {recentDates.map((date) => (
                  <button className={selectedDate === date.key ? "active" : ""} key={date.key} onClick={() => setSelectedDate(date.key)}>
                    <small>{date.day}</small><strong>{date.date}</strong>
                    {(diary[date.key]?.length || reviews[date.key]) && <i />}
                  </button>
                ))}
              </div>
              <label className="date-picker">
                <span>æŸ¥çœ‹å¾€æ—¥</span>
                <input type="date" value={selectedDate} max={key} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
            </div>

            <div className="diary-ledger">
              <div className="ledger-heading">
                <div><span>{selectedDate.replaceAll("-", " / ")}</span><strong>ç»†å¤§å¿…ä¹¦ï¼Œç§¯çŽ‰ç¢Žé‡‘</strong></div>
                <small>{selectedEntries.length} åˆ™è®°å½•</small>
              </div>
              <form className="diary-form" onSubmit={addDiaryEntry}>
                <select value={diaryCategory} onChange={(event) => setDiaryCategory(event.target.value)} aria-label="è®°å½•ç±»åˆ«">
                  <option>æ‰€é‡ä¹‹äº‹</option><option>æ‰€è§ä¹‹äºº</option><option>æ‰€è¯»ä¹‹ä¹¦</option><option>ä¸€é—ªä¹‹å¿µ</option><option>ä»Šæ—¥é¥®é£Ÿ</option>
                </select>
                <textarea value={diaryText} onChange={(event) => setDiaryText(event.target.value)} placeholder="ä¸€äº‹ä¸€æ¡ï¼Œåªè®°äº‹å®žï¼Œä¸å¿…è¿½æ±‚æ–‡é‡‡â€¦" aria-label="ä»Šæ—¥è®°å½•" />
                <button type="submit">è®°ä¸‹ä¸€åˆ™</button>
              </form>
              <div className="ledger-list">
                {selectedEntries.map((entry, index) => (
                  <article className="ledger-entry" key={entry.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{entry.category} Â· {entry.createdAt}</small><p>{entry.text}</p></div>
                    <button onClick={() => setDiary((current) => ({ ...current, [selectedDate]: current[selectedDate].filter((item) => item.id !== entry.id) }))} aria-label="åˆ é™¤è¿™åˆ™è®°å½•">Ã—</button>
                  </article>
                ))}
                {!selectedEntries.length && <p className="ledger-empty">ä»Šå¤©è¿˜æ²¡æœ‰è®°å½•ã€‚æ—©é¤åƒäº†ä»€ä¹ˆã€è¯»äº†å“ªä¸€é¡µä¹¦ã€è·¯ä¸Šé‡è§äº†è°ï¼Œéƒ½å€¼å¾—å†™ä¸‹ä¸€ç¬”ã€‚</p>}
              </div>
            </div>

            <div className="reflection-title">
              <span className="eyebrow">THREE QUESTIONS</span><h3>ç”¨ä¸‰é—®ï¼Œä¸ºè¿™ä¸€å¤©æ”¶å°¾</h3>
            </div>
            <div className="review-grid">
              {[
                ["win", "01", "ä»Šå¤©åšå¾—æœ€å¥½çš„ä¸€ä»¶äº‹", "å“ªä¸€åˆ»è®©ä½ æ„Ÿåˆ°æ»¡æ„ï¼Ÿ"],
                ["improve", "02", "å¯ä»¥å†è¿›æ­¥ä¸€ç‚¹çš„åœ°æ–¹", "è¯šå®žè®°å½•ï¼Œä¸å¿…è‹›è´£è‡ªå·±ã€‚"],
                ["tomorrow", "03", "æ˜Žå¤©æœ€é‡è¦çš„ä¸€ä»¶äº‹", "æŠŠæ³¨æ„åŠ›ç•™ç»™çœŸæ­£é‡è¦çš„äº‹ã€‚"],
              ].map(([field, number, title, placeholder]) => (
                <label className="review-item" key={field}>
                  <span>{number}</span>
                  <strong>{title}</strong>
                  <textarea
                    value={selectedReview[field as keyof Review]}
                    onChange={(event) => setReviews((current) => ({
                      ...current,
                      [selectedDate]: { ...(current[selectedDate] ?? { win: "", improve: "", tomorrow: "" }), [field]: event.target.value },
                    }))}
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
            <div className="review-footer">
              <span>æœ¬æ—¥å­˜æ¡£</span><strong>{selectedEntries.length}</strong><p>æŠŠæµé€å˜æˆå­˜æ¡£ï¼ŒæŠŠæ¨¡ç³Šå˜æˆç¡®å‡¿ã€‚</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

