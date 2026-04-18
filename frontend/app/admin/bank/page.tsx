"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, BookOpen, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type BackendLiveQuestion = {
  id: number;
  parent_question_id: number;
  question_type: string;
  irt_difficulty: number;
  content_latex: string;
  status: string;
};

type LiveQuestionsPageResponse = {
  items?: BackendLiveQuestion[];
  total?: number;
  detail?: string;
};

type BankQuestion = {
  id: number;
  parentId: number;
  type: string;
  difficulty: number;
  content: string;
};

const typeConfig: Record<
  string,
  { label: string; className: string }
> = {
  choice: {
    label: "选择题",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  fill: {
    label: "填空题",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  judge: {
    label: "判断题",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  essay: {
    label: "解答题",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

function DifficultyBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-rose-400"
      : value >= 45
      ? "bg-amber-400"
      : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-400 w-6 text-right">
        {value}
      </span>
    </div>
  );
}

export default function BankPage() {
  const [allQuestions, setAllQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");

  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      setError("");
      try {
        const pageSize = 100;
        const allItems: BackendLiveQuestion[] = [];
        let page = 1;

        while (true) {
          const response = await fetch(`/api/live-questions?page=${page}&size=${pageSize}`, {
            method: "GET",
            cache: "no-store",
          });
          const data = (await response.json().catch(() => ({}))) as LiveQuestionsPageResponse;
          if (!response.ok) {
            throw new Error(data.detail || `加载活水题库失败 (HTTP ${response.status})`);
          }

          const pageItems = data.items || [];
          allItems.push(...pageItems);

          if (pageItems.length < pageSize) {
            break;
          }
          page += 1;
        }

        const mapped = allItems.map((item) => ({
          id: item.id,
          parentId: item.parent_question_id,
          type: item.question_type || "essay",
          difficulty: Math.round(Math.max(0, Math.min(1, item.irt_difficulty ?? 0.5)) * 100),
          content: item.content_latex || "",
        }));

        setAllQuestions(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载活水题库失败");
        setAllQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchQuestions();
  }, []);

  const questions = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allQuestions.filter((q) => {
      if (kw) {
        if (!q.content.toLowerCase().includes(kw)) return false;
      }

      if (selectedType && q.type !== selectedType) return false;

      if (selectedDifficulty === "easy" && q.difficulty >= 45) return false;
      if (selectedDifficulty === "medium" && (q.difficulty < 45 || q.difficulty >= 70)) return false;
      if (selectedDifficulty === "hard" && q.difficulty < 70) return false;

      return true;
    });
  }, [allQuestions, keyword, selectedDifficulty, selectedType]);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">活水题库</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            共 {questions.length} 道题目已入库
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-8 py-3.5 bg-white border-b border-slate-200">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索题目内容…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition appearance-none cursor-pointer"
          >
            <option value="">全部题型</option>
            <option value="choice">选择题</option>
            <option value="fill">填空题</option>
            <option value="judge">判断题</option>
            <option value="essay">解答题</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg
              className="h-4 w-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* Difficulty filter */}
        <div className="relative">
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition appearance-none cursor-pointer"
          >
            <option value="">全部难度</option>
            <option value="easy">基础（0 – 44）</option>
            <option value="medium">中等（45 – 69）</option>
            <option value="hard">困难（70 – 100）</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <svg
              className="h-4 w-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
          <SlidersHorizontal className="h-4 w-4" />
          更多筛选
        </button>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载活水变式题数据...
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          {!loading && questions.map((q) => {
            const type = typeConfig[q.type] ?? typeConfig.essay;
            return (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
              >
                {/* Card header */}
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${type.className}`}
                  >
                    {type.label}
                  </span>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    #{q.id} · 原题 #{q.parentId}
                  </span>
                </div>

                {/* Content */}
                <div className="flex items-start gap-2.5">
                  <BookOpen className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-slate-700 leading-relaxed line-clamp-3 min-w-0 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {q.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Difficulty bar */}
                <DifficultyBar value={q.difficulty} />
              </div>
            );
          })}

          {!loading && !error && questions.length === 0 ? (
            <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              当前没有符合条件的活水变式题
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
