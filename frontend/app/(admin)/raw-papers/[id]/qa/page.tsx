"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RefreshCw, Plus, Scissors, ArrowLeft, Loader2, Trash2 } from "lucide-react";
import ManualCropModal from "@/components/ManualCropModal";

type QaQuestion = {
  id: number;
  problem_number: string | null;
  question_type: string;
  image_url: string | null;
  crop_urls: string[];
};

type QaPaper = {
  id: number;
  title: string;
  original_url: string | null;
  original_urls?: string[];
  recognized_count: number;
  questions: QaQuestion[];
};

type RecropResult = {
  paper_id: number;
  question_id: number;
  problem_number: string;
  image_url: string;
  crop_urls: string[];
};

export default function RawPaperQaPage() {
  const params = useParams<{ id: string }>();
  const paperId = params.id;

  const [paper, setPaper] = useState<QaPaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeProblemNumber, setActiveProblemNumber] = useState("");
  const [focusQuestionId, setFocusQuestionId] = useState<number | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);

  const fetchPaper = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/raw-papers/${paperId}`, { method: "GET", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as QaPaper & { detail?: unknown };
      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : `加载失败 (HTTP ${res.status})`;
        throw new Error(detail);
      }
      setPaper(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    void fetchPaper();
  }, [fetchPaper]);

  const openRecrop = (problemNumber: string) => {
    setActiveProblemNumber(problemNumber);
    setModalOpen(true);
  };

  const handleDeleteQuestion = async (questionId: number, problemNumber: string | null) => {
    const confirmed = window.confirm(`确认删除题号 ${problemNumber || "-"} 的切图吗？`);
    if (!confirmed) return;

    setDeletingQuestionId(questionId);
    setError("");
    try {
      const res = await fetch(`/api/raw-papers/${paperId}/questions/${questionId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : `删除失败 (HTTP ${res.status})`;
        throw new Error(detail);
      }
      await fetchPaper();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingQuestionId(null);
    }
  };

  const nextProblemNumber = useMemo(() => {
    if (!paper?.questions?.length) return "1";
    const nums = paper.questions
      .map((q) => Number(q.problem_number))
      .filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return String((paper.questions.length || 0) + 1);
    return String(Math.max(...nums) + 1);
  }, [paper]);

  const sortedQuestions = useMemo(() => {
    const list = [...(paper?.questions || [])];
    return list.sort((a, b) => {
      const aNum = Number(a.problem_number);
      const bNum = Number(b.problem_number);
      const aIsNum = Number.isFinite(aNum);
      const bIsNum = Number.isFinite(bNum);

      if (aIsNum && bIsNum) {
        return aNum - bNum || a.id - b.id;
      }
      if (aIsNum) return -1;
      if (bIsNum) return 1;

      const aText = (a.problem_number || "").trim();
      const bText = (b.problem_number || "").trim();
      if (!aText && !bText) return a.id - b.id;
      if (!aText) return 1;
      if (!bText) return -1;
      return aText.localeCompare(bText, "zh-Hans-CN", { numeric: true }) || a.id - b.id;
    });
  }, [paper?.questions]);

  useEffect(() => {
    if (!focusQuestionId) return;
    const el = document.getElementById(`qa-question-${focusQuestionId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setFocusQuestionId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [focusQuestionId, sortedQuestions]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <Link href="/raw-papers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft className="w-4 h-4" />
              返回原卷列表
            </Link>
            <h1 className="text-xl font-semibold text-slate-800">切图质检与手动补切</h1>
            <p className="text-sm text-slate-500">
              {paper?.title || "-"} · 已识别题数 <span className="font-semibold text-slate-700">{paper?.recognized_count ?? 0}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchPaper()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" />
              刷新列表
            </button>
            <button
              type="button"
              onClick={() => openRecrop(nextProblemNumber)}
              disabled={!paper?.original_url}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              新增遗漏题目
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 flex items-center gap-2 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在加载质检数据...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sortedQuestions.map((q) => (
              <article
                key={q.id}
                id={`qa-question-${q.id}`}
                className={`relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all ${
                  focusQuestionId === q.id ? "ring-2 ring-blue-300 shadow-md" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => openRecrop(q.problem_number || nextProblemNumber)}
                  className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-blue-700"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  重切
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeleteQuestion(q.id, q.problem_number)}
                  disabled={deletingQuestionId === q.id}
                  className="absolute right-20 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow hover:bg-rose-50 disabled:opacity-60"
                >
                  {deletingQuestionId === q.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  删除
                </button>

                <div className="px-4 py-3 border-b border-slate-100 bg-white/90">
                  <div className="text-sm text-slate-700 font-medium">题号 {q.problem_number || "-"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">题型：{q.question_type || "-"}</div>
                </div>

                <div className="px-4 py-4 bg-slate-50">
                  {q.image_url ? (
                    (() => {
                      const thumbUrl = q.image_url.replace(".png", "_thumb.webp");
                      return (
                        <img
                          src={thumbUrl}
                          alt={`题号 ${q.problem_number || "-"}`}
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.src.endsWith(q.image_url)) {
                              target.src = q.image_url;
                            }
                          }}
                          className="block w-full h-auto object-contain"
                        />
                      );
                    })()
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white py-10 text-center text-xs text-slate-400">
                      暂无切图
                    </div>
                  )}
                </div>
              </article>
            ))}

            {sortedQuestions.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
                暂无已识别题目，可点击“新增遗漏题目”进行手动补切。
              </div>
            )}
          </div>
        )}
      </div>

      {(paper?.original_urls?.length || (paper?.original_url ? 1 : 0)) > 0 && (
        <ManualCropModal
          open={modalOpen}
          paperId={paperId}
          originalUrls={paper?.original_urls?.length ? paper.original_urls : (paper?.original_url ? [paper.original_url] : [])}
          initialProblemNumber={activeProblemNumber || nextProblemNumber}
          onClose={() => setModalOpen(false)}
          onSuccess={(result: RecropResult) => {
            setFocusQuestionId(result.question_id);
            void fetchPaper();
          }}
        />
      )}
    </div>
  );
}
