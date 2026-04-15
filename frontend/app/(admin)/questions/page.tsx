// app/(admin)/questions/page.tsx
// 题库大厅 —— 检索与管理已审核发布的题目
"use client";

import { useState, useMemo } from "react";
import {
  Search,
  RotateCcw,
  Filter,
  Copy,
  Pencil,
  CheckCircle2,
  Library,
} from "lucide-react";

// ── 类型定义 ─────────────────────────────────────────────────────────────────
type QuestionType = "单选题" | "填空题" | "解答题";
type Difficulty = "简单" | "中等" | "困难";

interface Question {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  sourcePaper: string;
  stem: string;
  tags: string[];
}

// ── Mock 数据 ─────────────────────────────────────────────────────────────────
const MOCK_QUESTIONS: Question[] = [
  {
    id: "q-20240001",
    type: "单选题",
    difficulty: "中等",
    sourcePaper: "2024 高考全国甲卷",
    stem: "设集合 $A=\\{x \\mid x^2 - 3x + 2 \\leq 0\\}$，$B=\\{x \\mid x > 1\\}$，则 $A \\cap B$ 等于",
    tags: ["集合", "不等式", "交集"],
  },
  {
    id: "q-20240002",
    type: "填空题",
    difficulty: "简单",
    sourcePaper: "2024 高考全国乙卷",
    stem: "已知等差数列 $\\{a_n\\}$ 满足 $a_1 = 2$，公差 $d = 3$，则前 10 项之和 $S_{10} = $___",
    tags: ["数列", "等差数列", "求和"],
  },
  {
    id: "q-20240003",
    type: "解答题",
    difficulty: "困难",
    sourcePaper: "2024 杨浦一模",
    stem: "已知函数 $f(x) = \\ln x + \\frac{a}{x}$，其中 $a \\in \\mathbb{R}$。\\n(1) 讨论函数 $f(x)$ 的单调性；\\n(2) 若 $f(x) \\leq x - 1$ 恒成立，求 $a$ 的取值范围。",
    tags: ["导数", "单调性", "不等式恒成立"],
  },
  {
    id: "q-20240004",
    type: "单选题",
    difficulty: "简单",
    sourcePaper: "2023 高考新课标 I 卷",
    stem: "下列函数中，既是奇函数又在 $(0, +\\infty)$ 上单调递增的是",
    tags: ["函数", "奇偶性", "单调性"],
  },
  {
    id: "q-20240005",
    type: "填空题",
    difficulty: "困难",
    sourcePaper: "2024 浦东一模",
    stem: "在复数范围内，方程 $z^2 + 2z + 4 = 0$ 的根为___，其模为___",
    tags: ["复数", "方程", "模长"],
  },
  {
    id: "q-20240006",
    type: "解答题",
    difficulty: "中等",
    sourcePaper: "2024 高考全国甲卷",
    stem: "如图，在直三棱柱 $ABC-A_1B_1C_1$ 中，$AB=AC=2$，$BC=2\\sqrt{2}$，$AA_1=\\sqrt{2}$。\\n(1) 求二面角 $A-BC-A_1$ 的余弦值；\\n(2) 求点 $B_1$ 到平面 $A_1BC$ 的距离。",
    tags: ["立体几何", "二面角", "点到面距离"],
  },
  {
    id: "q-20240007",
    type: "单选题",
    difficulty: "中等",
    sourcePaper: "2024 徐汇二模",
    stem: "已知抛物线 $C: y^2 = 4x$，过焦点 $F$ 的直线 $l$ 与抛物线交于 $A$、$B$ 两点，若 $|AF| = 3|BF|$，则 $|AB| =$",
    tags: ["圆锥曲线", "抛物线", "焦点弦"],
  },
  {
    id: "q-20240008",
    type: "填空题",
    difficulty: "简单",
    sourcePaper: "2024 上海预测卷",
    stem: "若 $\\sin\\alpha - \\cos\\alpha = \\frac{1}{2}$，则 $\\sin 2\\alpha = $___",
    tags: ["三角函数", "二倍角", "辅助角"],
  },
];

// ── 辅助组件 ──────────────────────────────────────────────────────────────────
const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  简单: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  中等: "bg-amber-50 text-amber-700 border border-amber-200",
  困难: "bg-rose-50 text-rose-700 border border-rose-200",
};

const TYPE_STYLE: Record<QuestionType, string> = {
  单选题: "bg-sky-50 text-sky-700 border border-sky-200",
  填空题: "bg-violet-50 text-violet-700 border border-violet-200",
  解答题: "bg-orange-50 text-orange-700 border border-orange-200",
};

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${DIFFICULTY_STYLE[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}

function TypeBadge({ type }: { type: QuestionType }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${TYPE_STYLE[type]}`}
    >
      {type}
    </span>
  );
}

function CopyButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(id).then(() => {
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
          复制 API ID
        </>
      )}
    </button>
  );
}

function QuestionCard({ q }: { q: Question }) {
  const stemPreview = q.stem.replace(/\n/g, " ").slice(0, 120) + (q.stem.length > 120 ? "…" : "");

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-150 p-4">
      {/* 顶部：题型 + 来源 + 难度 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={q.type} />
          <span className="text-xs text-slate-400 font-medium">
            {q.sourcePaper}
          </span>
        </div>
        <DifficultyBadge difficulty={q.difficulty} />
      </div>

      {/* 中间：题干预览 */}
      <p className="text-sm text-slate-700 leading-relaxed mb-3 font-mono">
        {stemPreview}
      </p>

      {/* 底部：知识点标签 + 操作按钮 */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-50">
        {/* Tags */}
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

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <Pencil className="h-3.5 w-3.5" />
            编辑题目
          </button>
          <CopyButton id={q.id} />
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
const QUESTION_TYPES = ["全部", "单选题", "填空题", "解答题"] as const;
const DIFFICULTIES = ["全部", "简单", "中等", "困难"] as const;

type FilterType = (typeof QUESTION_TYPES)[number];
type FilterDifficulty = (typeof DIFFICULTIES)[number];

interface FilterState {
  keyword: string;
  type: FilterType;
  difficulty: FilterDifficulty;
  sourcePaper: string;
}

const EMPTY_FILTER: FilterState = {
  keyword: "",
  type: "全部",
  difficulty: "全部",
  sourcePaper: "",
};

export default function QuestionBankPage() {
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTER);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTER);

  const filtered = useMemo(() => {
    return MOCK_QUESTIONS.filter((q) => {
      const kw = applied.keyword.trim().toLowerCase();
      if (kw && !q.stem.toLowerCase().includes(kw) && !q.tags.some((t) => t.includes(kw))) {
        return false;
      }
      if (applied.type !== "全部" && q.type !== applied.type) return false;
      if (applied.difficulty !== "全部" && q.difficulty !== applied.difficulty) return false;
      const src = applied.sourcePaper.trim().toLowerCase();
      if (src && !q.sourcePaper.toLowerCase().includes(src)) return false;
      return true;
    });
  }, [applied]);

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
              <span className="ml-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                已发布
              </span>
            </h1>
          </div>
          <p className="text-sm text-slate-400 pl-10.5">
            为 MathRob 前台应用提供高质量的结构化题库 API
          </p>
        </div>
        <div className="text-sm text-slate-400 mt-1">
          共{" "}
          <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
          道题目
        </div>
      </div>

      {/* ── 高级搜索面板 ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            筛选条件
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
                {t === "全部" ? "全部题型" : t}
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

          {/* 来源试卷 */}
          <input
            type="text"
            placeholder="例如：杨浦一模"
            value={draft.sourcePaper}
            onChange={(e) => setDraft((p) => ({ ...p, sourcePaper: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition"
          />
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
      {filtered.length === 0 ? (
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
