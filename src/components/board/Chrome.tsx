import {
  Users, Table, Columns3, Funnel, ArrowUpDown, Zap, Sun, Search,
  SlidersHorizontal, ChevronDown,
} from "lucide-react";
import styles from "./chrome.module.css";

const topAvatars = [
  { c: "#6b7cff", t: "#fff", i: "D" },
  { c: "#cdb4f6", t: "#3a1f6b", i: "U" },
  { c: "#3aa675", t: "#fff", i: "G" },
];

export function Chrome() {
  return (
    <header className={styles.chrome}>
      <div className={styles.topbar}>
        <div className={styles.crumb}>
          <span className={styles.workspace}>🤖 Time de IA</span>
          <span className={styles.sep}>/</span>
          <span className={styles.doc}>Board Time de IA</span>
        </div>
        <div className={styles.topRight}>
          <span className={styles.edited}>Edited just now</span>
          <div className={styles.avatarStack}>
            {topAvatars.map((a) => (
              <span
                key={a.i}
                className={styles.topAvatar}
                style={{ background: a.c, color: a.t }}
              >
                {a.i}
              </span>
            ))}
          </div>
          <span className={styles.more}>+3</span>
          <button className={styles.share}>
            <Users size={14} /> Share
          </button>
        </div>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Board Time de IA</h1>
        <p className={styles.subtitle}>Kanban de tarefas do time de IA</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <span className={styles.tab}>
            <Table size={15} /> Default view
          </span>
          <span className={`${styles.tab} ${styles.tabActive}`}>
            <Columns3 size={15} /> Kanban
          </span>
        </div>
        <div className={styles.toolRight}>
          <Funnel size={16} className={styles.toolIcon} />
          <ArrowUpDown size={16} className={styles.toolIcon} />
          <Zap size={16} className={styles.toolIcon} />
          <Sun size={16} className={styles.toolIcon} />
          <Search size={16} className={styles.toolIcon} />
          <SlidersHorizontal size={16} className={styles.toolIcon} />
          <button className={styles.newBtn}>
            New <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
