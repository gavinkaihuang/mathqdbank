// app/(admin)/questions/page.tsx
// 题库大厅 —— 检索与管理已审核发布的题目
"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Search,
  RotateCcw,
  Filter,
  Copy,
  CheckCircle2,
  Library,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ── 类型定义 ─────────────────────────────────────────────────────────────────
type BackendTag = { id: number; name: string; category: string };

interface BackendQuestion {
  id: number;
  question_type: string;
  content_latex: string;
  difficulty: number | null;
  tags: BackendTag[];
  status: string;
}

interface QuestionsPageResponse {
  items?: BackendQuestion[];
  total?: number;
  detail?: string;
}

interface Question {
  id: number;
  type: string;
  typeLabel: string;
  difficultyValue: number; // 0–100
  difficultyLabel: "简单" | "中等" | "困难";
  stem: string;
  tags: string[];
}

// ── 辅助映射 ──────────────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  choice: "选择题",
  fill: "填空题",
  judge: "判断题",
  essay: "解答题",
};

const TYPE_STYLE: Record<string, string> = {
  choice: "bg-sky-50 text-sky-700 border border-sky-200",
  fill: "bg-violet-50 text-violet-700 border border-violet-200",
  judge: "bg-orange-50 text-orange-700 border border-orange-200",
  essay: "bg-rose-50 text-rose-700 border border-rose-200",
};

const DIFFICULTY_STYLE: Record<string, string> = {
  简单: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  中等: "bg-amber-50 text-amber-700 border border-amber-200",
  困难: "bg-rose-50 text-rose-700 border border-rose-200",
};

function difficultyLabel(v: number): "简单" | "中等" | "困难" {
  if (v >= 70) return "困难";
  if (v >= 45) return "中等";
  return "简单";
}

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
function DifficultyBadge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${DIFFICULTY_STYLE[label] ?? ""}`}
    >
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${TYPE_STYLE[type] ?? "bg-slate-100 text-slate-600 border border-slate-200"}`}
    >
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function CopyButton({ id }: { id: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(id)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-emerald-600">已复制</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          复制 ID
        </>
      )}
    </button>
  );
}

function QuestionCard({ q }: { q: Question }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-150 p-4">
      {/* 顶部：题型 + 难度 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <TypeBadge type={q.type} />
        <DifficultyBadge label={q.difficultyLabel} />
      </div>

      {/* 中间：题干 LaTeX 渲染 */}
      <div className="text-sm text-slate-700 leading-relaxed mb-3 line-clamp-3 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {q.stem}
        </ReactMarkdown>
      </div>

      {/* 底部：知识点标签 + 操作 */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-50">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {q.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-slate-300 font-mono">#{q.id}</span>
          <CopyButton id={q.id} />
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
const QUESTION_TYPES = ["全部", "choice", "fill", "judge", "essay"] as const;
const DIFFICULTIES = ["全部", "简单", "中等", "困难"] as const;

type FilterType = (typeof QUESTION_TYPES)[number];
type FilterDifficulty = (typeof DIFFICULTIES)[number];

interface FilterState {
  keyword: string;
  type: FilterType;
  difficulty: FilterDifficulty;
}

const EMPTY_FILTER: FilterState = { keyword: "", type: "全部", difficulty: "全部" };

export default function QuestionBankPage() {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTER);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTER);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const pageSize = 100;
        const collected: BackendQuestion[] = [];
        let page = 1;
        while (true) {
          const res = await fetch(`/api/questions?page=${page}&size=${pageSize}`, {
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as QuestionsPageResponse;
          if (!res.ok) {
            throw new Error(data.detail || `加载失败 (HTTP ${res.status})`);
          }
          const pageItems = data.items ?? [];
          collected.push(...pageItems);
          if (pageItems.length < pageSize) break;
          page += 1;
        }
        setAllQuestions(
          collected.map((item) => {
            const dv = Math.round(Math.max(0, Math.min(1, item.difficulty ?? 0.5)) * 100);
            return {
              id: item.id,
              type: item.question_type,
              typeLabel: TYPE_LABEL[item.question_type] ?? item.question_type,
              difficultyValue: dv,
              difficultyLabel: difficultyLabel(dv),
              stem: item.content_latex,
              tags: item.tags.map((t) => t.name),
            };
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载题库失败");
      } finally {
        setLoading(false);
      }
    };
    void fetchAll();
  }, []);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return allQuestions.filter((q) => {
      if (kw) {
        const haystack = `${q.stem} ${q.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      if (applied.type !== "全部" && q.type !== applied.type) return false;
      if (applied.difficulty !== "全部" && q.difficultyLabel !== applied.difficulty) return false;
      return true;
    });
  }, [allQuestions, applied]);

  const handleQuery = () => setApplied({ ...draft });
  const handleReset = () => {
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* ── 页面标题 ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <Library className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              题库大厅
            </h1>
          </div>
          <p className="text-sm text-slate-400 pl-10.5">
            共{" "}
            <span className="font-semibold text-slate-600">{filtered.length}</span>{" "}
            道题目
            {loading && <Loader2 className="inline ml-2 h-3.5 w-3.5 animate-spin text-slate-400" />}
          </p>
        </div>
      </div>

      {/* ── 错误提示 ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ── 高级搜索面板 ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            筛选条件
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* 关键字 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索题干或知识点..."
              value={draft.keyword}
              onChange={(e) => setDraft((p) => ({ ...p, keyword: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition"
            />
          </div>

          {/* 题型 */}
          <select
            value={draft.type}
            onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as FilterType }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition"
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "全部" ? "全部题型" : (TYPE_LABEL[t] ?? t)}
              </option>
            ))}
          </select>

          {/* 难度 */}
          <select
            value={draft.difficulty}
            onChange={(e) => setDraft((p) => ({ ...p, difficulty: e.target.value as FilterDifficulty }))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d === "全部" ? "全部难度" : d}
              </option>
            ))}
          </select>
        </div>

        {/* 按钮组 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </button>
          <button
            onClick={handleQuery}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
          >
            <Search className="h-3.5 w-3.5" />
            查询
          </button>
        </div>
      </div>

      {/* ── 题目卡片列表 ─────────────────────────────────────────────────── */}
      {!loading && !error && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Library className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">未找到匹配的题目</p>
          <p className="text-xs mt-1">请调整筛选条件后重新查询</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtered.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}
