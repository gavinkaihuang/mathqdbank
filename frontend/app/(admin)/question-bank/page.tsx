"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Library, Loader2, Search, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type BackendTag = { id: number; name: string; category: string };

type BackendQuestion = {
  id: number;
  raw_paper_id: number;
  question_type: string;
  content_latex: string;
  difficulty: number | null;
  tags: BackendTag[];
};

type QuestionsPageResponse = {
  items?: BackendQuestion[];
  total?: number;
  detail?: string;
};

type QuestionCardData = {
  id: number;
  rawPaperId: number;
  typeLabel: string;
  content: string;
  tags: string[];
  difficultyScore: number;
};

const TYPE_LABEL: Record<string, string> = {
  choice: "选择题",
  fill: "填空题",
  judge: "判断题",
  essay: "解答题",
};

function QuestionCard({ q }: { q: QuestionCardData }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {q.typeLabel}
        </span>
        <span className="text-xs text-slate-400"># {q.id}</span>
      </div>

      <div className="mb-3 text-sm text-slate-700 leading-relaxed [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {q.content}
        </ReactMarkdown>
      </div>

      <div className="mb-2 text-xs text-slate-500">
        原卷 ID: <span className="font-semibold text-slate-700">{q.rawPaperId}</span> · 难度: {q.difficultyScore}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {q.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function QuestionBankPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const paperId = searchParams.get("paper_id");

  const [questions, setQuestions] = useState<QuestionCardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");

  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ page: "1", size: "100" });

      if (paperId) {
        params.set("raw_paper_id", paperId);
      }

      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword) {
        params.set("keyword", trimmedKeyword);
      }

      const res = await fetch(`/api/questions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as QuestionsPageResponse;

      if (!res.ok) {
        throw new Error(data.detail || `加载题库失败 (HTTP ${res.status})`);
      }

      const mapped = (data.items ?? []).map((item) => ({
        id: item.id,
        rawPaperId: item.raw_paper_id,
        typeLabel: TYPE_LABEL[item.question_type] ?? item.question_type,
        content: item.content_latex || "",
        tags: (item.tags ?? []).map((t) => t.name),
        difficultyScore: Math.round(Math.max(0, Math.min(1, item.difficulty ?? 0.5)) * 100),
      }));

      setQuestions(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载题库失败");
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [paperId, keyword]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  const titleDesc = useMemo(() => {
    if (paperId) {
      return `当前按试卷 ID ${paperId} 过滤`;
    }
    return "展示全量题库数据";
  }, [paperId]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <Library className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">题库大厅</h1>
          </div>
          <p className="text-sm text-slate-500">{titleDesc}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="按题干关键词搜索..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void fetchQuestions()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Search className="h-3.5 w-3.5" />
            搜索
          </button>
        </div>

        {paperId ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <span>🎯 当前过滤试卷 ID: {paperId}</span>
            <button
              type="button"
              onClick={() => router.push("/question-bank")}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100"
              aria-label="清除试卷过滤"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载题库数据...
        </div>
      ) : null}

      {!isLoading && !error && questions.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          没有找到符合条件的题目
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {!isLoading &&
          questions.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
      </div>
    </div>
  );
}
