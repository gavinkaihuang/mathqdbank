"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle, Database, Upload } from "lucide-react";

// ── 类型定义 ──────────────────────────────────────────────
type PaperStatus = "pending" | "processing" | "qc_pending" | "published";

interface RawPaper {
  id: string;
  title: string;
  grade: string;
  uploadAt: string;
  status: PaperStatus;
  progress?: number;
}

interface BackendRawPaper {
  id: number;
  title: string;
  year: number;
  paper_type?: string | null;
  status: string;
  created_at?: string;
}

function mapPaperStatus(status: string): PaperStatus {
  const normalized = status.toLowerCase();
  if (normalized === "processing") return "processing";
  if (normalized === "completed" || normalized === "done" || normalized === "extracted") {
    return "qc_pending";
  }
  if (normalized === "published") return "published";
  return "pending";
}

function formatUploadAt(createdAt?: string): string {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toViewPaper(paper: BackendRawPaper): RawPaper {
  return {
    id: String(paper.id),
    title: paper.title,
    grade: paper.paper_type?.trim() ? paper.paper_type : `${paper.year} 年`,
    uploadAt: formatUploadAt(paper.created_at),
    status: mapPaperStatus(paper.status),
    progress: Math.floor(Math.random() * 100) + 1,
  };
}

function MicroStepper({ status }: { status: PaperStatus }) {
  const steps = ["上传成功", "AI 切题", "人工质检", "题库入库"];
  const statusMap: Record<PaperStatus, number> = {
    pending: 0,
    processing: 1,
    qc_pending: 2,
    published: 3,
  };
  const currentIndex = statusMap[status];

  return (
    <div className="flex items-center gap-2">
      {steps.map((_, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div
            className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
              idx <= currentIndex ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-500"
            }`}
          >
            {idx < currentIndex ? "✓" : idx + 1}
          </div>
          {idx < steps.length - 1 && (
            <div className={`h-0.5 w-5 ${idx < currentIndex ? "bg-blue-500" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ActionButton({ paper, onTriggered }: { paper: RawPaper; onTriggered: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleTriggerAI = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/raw-papers/${paper.id}/extract`, { method: "POST" });
      if (response.ok) onTriggered();
    } finally {
      setLoading(false);
    }
  };

  if (paper.status === "pending") {
    return (
      <button
        type="button"
        onClick={() => void handleTriggerAI()}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        <Play className="h-4 w-4" />
        启动 AI 切题
      </button>
    );
  }

  if (paper.status === "processing") {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        处理中 {paper.progress ?? 45}%
      </button>
    );
  }

  if (paper.status === "qc_pending") {
    return (
      <Link
        href={`/ai-review/${paper.id}`}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <CheckCircle className="h-4 w-4" />
        进入切图质检
      </Link>
    );
  }

  return (
    <Link
      href={`/question-bank?paper_id=${paper.id}`}
      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
    >
      <Database className="h-4 w-4" />
      前往题库
    </Link>
  );
}

export default function RawPapersPage() {
  const [papers, setPapers] = useState<RawPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPapers = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/raw-papers");
      if (!response.ok) throw new Error("获取试卷列表失败");
      const data = (await response.json()) as { items?: BackendRawPaper[] };
      setPapers((data.items ?? []).map(toViewPaper));
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取试卷列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPapers();
    const timer = setInterval(() => {
      void fetchPapers();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchPapers]);

  if (loading && papers.length === 0) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">原卷管理</h1>
          <p className="mt-1 text-sm text-slate-500">状态机驱动调度：上传 → AI 切题 → 人工质检 → 入库</p>
        </div>
        <Link
          href="/raw-papers/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Upload className="h-4 w-4" />
          上传试卷
        </Link>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">试卷名称</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">年级</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">上传时间</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">处理状态</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((paper) => (
              <tr key={paper.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                <td className="px-5 py-4 text-sm">
                  <Link href={`/raw-papers/${paper.id}`} className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
                    {paper.title}
                  </Link>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">{paper.grade}</td>
                <td className="px-5 py-4 text-sm text-slate-500">{paper.uploadAt}</td>
                <td className="px-5 py-4">
                  <MicroStepper status={paper.status} />
                </td>
                <td className="px-5 py-4">
                  <ActionButton paper={paper} onTriggered={() => void fetchPapers()} />
                </td>
              </tr>
            ))}

            {!loading && papers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-slate-300" />
                    暂无试卷，请先上传
                    <Link
                      href="/raw-papers/upload"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                    >
                      <Upload className="h-4 w-4" />
                      去上传
                    </Link>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
