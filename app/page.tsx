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
const diaryPrompts = [
  { label: "今日事件", description: "去何地、见何人、做何事", placeholder: "例：10点去图书馆写文案。" },
  { label: "今日阅读", description: "书名、页码及核心观点", placeholder: "例：读《万历十五年》P32—45，制度惯性影响个人选择。" },
  { label: "今日美食", description: "吃了什么，口味如何", placeholder: "例：午饭吃番茄牛腩，偏甜，牛肉很软。" },
  { label: "今日新知", description: "冷知识或小技能", placeholder: "例：学会用曝光补偿压暗雪景高光。" },
];

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
  { id: "plan", label: "每日计划", mark: "01" },
  { id: "inspiration", label: "灵感", mark: "02" },
  { id: "review", label: "极简日记", mark: "03" },
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
  const [taskDuration, setTaskDuration] = useState("30 分钟");
  const [ideaText, setIdeaText] = useState("");
  const [diaryText, setDiaryText] = useState("");
  const [diaryCategory, setDiaryCategory] = useState("今日事件");
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("正在连接");
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
    if (manual) setSyncStatus("同步中");
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setSyncStatus("仅本机");
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
      setSyncStatus("已同步");
      setCloudReady(true);
    } catch {
      setSyncStatus("离线保存");
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
    if (!ready || !cloudReady || syncStatus === "仅本机") return;
    const timer = window.setTimeout(async () => {
      setSyncStatus("同步中");
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
        setSyncStatus("已同步");
      } catch {
        setSyncStatus("离线保存");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tasks, ideas, reviews, diary, key, ready, cloudReady]);

  const completed = tasks.filter((task) => task.done).length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const selectedEntries = diary[selectedDate] ?? [];
  const activeDiaryPrompt = diaryPrompts.find((prompt) => prompt.label === diaryCategory) ?? diaryPrompts[0];
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
          <span className="brand-seal">林</span>
          <div>
            <strong>林的工作台</strong>
            <span>DAILY STUDIO</span>
          </div>
        </div>

        <nav aria-label="工作台导航">
          <p className="nav-caption">我的空间</p>
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
          <span>今日寄语</span>
          <p>微小的日常，累积成想要的生活。</p>
        </div>
        <div className="profile">
          <span className="avatar">L</span>
          <div><strong>Lin</strong><small>保持好奇，持续行动</small></div>
          <i className="status-dot" />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">TODAY · {key.replaceAll("-", ".")}</span>
            <h1>{view === "plan" ? "把今天，过得具体一点。" : view === "inspiration" ? "捕捉一闪而过的念头。" : "把今天发生的事，简短记下来。"}</h1>
          </div>
          <div className="top-actions">
            <button className={`sync-pill ${syncStatus === "已同步" ? "synced" : ""}`} onClick={() => void pullCloud(true)} title={syncAccount || "云端同步"}>
              <i /><span>{syncStatus}</span>
            </button>
            <div className="date-card">
              <span className="date-number">{today.getDate()}</span>
              <div><strong>{dateText.split("日")[0]}日</strong><small>{dateText.split("日")[1]}</small></div>
            </div>
          </div>
        </header>

        {view === "plan" && (
          <div className="plan-layout">
            <section className="main-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">DAILY RHYTHM</span>
                  <h2>今日计划</h2>
                </div>
                <span className="task-count">{completed} / {tasks.length} 已完成</span>
              </div>

              <div className="task-list">
                {tasks.map((task, index) => (
                  <article className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
                    <button
                      className="check"
                      style={{ "--task-color": task.color } as React.CSSProperties}
                      onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}
                      aria-label={`${task.done ? "取消完成" : "完成"}${task.title}`}
                    >
                      {task.done && "✓"}
                    </button>
                    <span className="task-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="task-info">
                      <strong>{task.title}</strong>
                      <small>为自己专注投入</small>
                    </div>
                    <span className="duration">{task.duration}</span>
                    <button className="delete" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`删除${task.title}`}>×</button>
                  </article>
                ))}
                {tasks.length === 0 && <div className="empty-state">今天还没有任务，写下第一件想完成的事吧。</div>}
              </div>

              <form className="add-task" onSubmit={addTask}>
                <span className="add-mark">＋</span>
                <input value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="新增一项今日任务…" aria-label="任务名称" />
                <select value={taskDuration} onChange={(event) => setTaskDuration(event.target.value)} aria-label="预计时长">
                  <option>15 分钟</option><option>30 分钟</option><option>45 分钟</option><option>1 小时</option><option>2 小时</option>
                </select>
                <button type="submit">添加</button>
              </form>
            </section>

            <aside className="insight-column">
              <section className="progress-card">
                <span className="eyebrow">TODAY&apos;S FLOW</span>
                <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
                  <div><strong>{progress}%</strong><span>今日进度</span></div>
                </div>
                <p>{progress === 100 ? "漂亮！今天的计划全部完成。" : progress >= 50 ? "节奏很好，继续保持。" : "不必着急，从一件小事开始。"}</p>
                <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
              </section>
              <section className="quote-card">
                <span className="quote-mark">“</span>
                <blockquote>自律不是束缚，<br />而是给自由铺路。</blockquote>
                <span className="quote-credit">— 今日提醒</span>
              </section>
            </aside>
          </div>
        )}

        {view === "inspiration" && (
          <section className="main-card view-card">
            <div className="section-heading">
              <div><span className="eyebrow">IDEA GARDEN</span><h2>灵感花园</h2></div>
              <span className="task-count">{ideas.length} 条灵感</span>
            </div>
            <form className="idea-form" onSubmit={addIdea}>
              <textarea value={ideaText} onChange={(event) => setIdeaText(event.target.value)} placeholder="记下此刻的想法、画面或一句话…" aria-label="新灵感" />
              <button type="submit">收藏灵感</button>
            </form>
            <div className="idea-grid">
              {ideas.map((idea, index) => (
                <article className="idea-note" key={idea.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{idea.text}</p>
                  <footer><small>{idea.createdAt}</small><button onClick={() => setIdeas((current) => current.filter((item) => item.id !== idea.id))} aria-label="删除灵感">删除</button></footer>
                </article>
              ))}
              {!ideas.length && <div className="empty-state wide">灵感不必完整。先把它留下，它会慢慢长出形状。</div>}
            </div>
          </section>
        )}

        {view === "review" && (
          <section className="main-card view-card">
            <div className="section-heading">
              <div><span className="eyebrow">FACTS, NOT FEELINGS</span><h2>马伯庸极简日记</h2></div>
              <span className="autosave">已为你自动保存</span>
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
                <span>查看往日</span>
                <input type="date" value={selectedDate} max={key} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
            </div>

            <div className="minimal-method" aria-label="日记分类">
              {diaryPrompts.map((prompt) => (
                <button
                  type="button"
                  className={diaryCategory === prompt.label ? "method-card active" : "method-card"}
                  aria-pressed={diaryCategory === prompt.label}
                  key={prompt.label}
                  onClick={() => setDiaryCategory(prompt.label)}
                >
                  <strong>{prompt.label}</strong>
                  <span>{prompt.description}</span>
                </button>
              ))}
            </div>
            <p className="method-note">一事一条，越短越好。断了就补，不强迫。</p>

            <div className="diary-ledger">
              <div className="ledger-heading">
                <div><span>{selectedDate.replaceAll("-", " / ")}</span><strong>只记事实，不抒情</strong></div>
                <small>{selectedEntries.length} 则记录</small>
              </div>
              <form className="diary-form" onSubmit={addDiaryEntry}>
                <div className="entry-kind"><span>正在记录</span><strong>{diaryCategory}</strong></div>
                <textarea value={diaryText} onChange={(event) => setDiaryText(event.target.value)} placeholder={activeDiaryPrompt.placeholder} aria-label="今日记录" />
                <button type="submit">记下一则</button>
              </form>
              <div className="ledger-list">
                {selectedEntries.map((entry, index) => (
                  <article className="ledger-entry" key={entry.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{entry.category} · {entry.createdAt}</small><p>{entry.text}</p></div>
                    <button onClick={() => setDiary((current) => ({ ...current, [selectedDate]: current[selectedDate].filter((item) => item.id !== entry.id) }))} aria-label="删除这则记录">×</button>
                  </article>
                ))}
                {!selectedEntries.length && <p className="ledger-empty">今天还没有记录。先写一件实际发生的小事，不必完整，也不必补写感想。</p>}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

