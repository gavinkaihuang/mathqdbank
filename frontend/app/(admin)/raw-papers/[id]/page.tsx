"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  FileStack,
  Loader2,
  User,
  X,
} from "lucide-react";

type PaperStatus = "pending" | "processing" | "qc_pending" | "published";

interface RawPaperDetail {
  id: number;
  title: string;
  grade: string;
  upload_time: string;
  status: PaperStatus;
  total_questions: number;
  uploader_name: string;
  preview_urls: string[];
}

type RawPaperDetailApiResponse = {
  id: number;
  title: string;
  year: number;
  paper_type?: string | null;
  status: string;
  created_at?: string;
  questions?: Array<{ id: number }>;
  recognized_count?: number;
  uploader_name?: string | null;
  original_url?: string | null;
  original_urls?: string[];
  page_urls?: string[];
  detail?: string;
};

function mapPaperStatus(status: string): PaperStatus {
  const normalized = status.toLowerCase();
  if (normalized === "processing") return "processing";
  if (normalized === "completed" || normalized === "done" || normalized === "extracted") {
    return "qc_pending";
  }
  if (normalized === "published") return "published";
  return "pending";
}

function formatUploadTime(createdAt?: string): string {
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

function toViewModel(api: RawPaperDetailApiResponse): RawPaperDetail {
  const totalQuestions =
    Array.isArray(api.questions) && api.questions.length > 0
      ? api.questions.length
      : api.recognized_count ?? 0;

  return {
    id: api.id,
    title: api.title,
    grade: api.paper_type?.trim() ? api.paper_type : `${api.year} 年`,
    upload_time: formatUploadTime(api.created_at),
    status: mapPaperStatus(api.status),
    total_questions: totalQuestions,
    uploader_name: api.uploader_name?.trim() ? api.uploader_name : "系统导入",
    preview_urls:
      (Array.isArray(api.original_urls) ? api.original_urls.filter(Boolean) : []) ||
      (api.original_url ? [api.original_url] : []) ||
      (Array.isArray(api.page_urls) ? api.page_urls.filter(Boolean) : []),
  };
}

const statusConfig: Record<
  PaperStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "待处理",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  processing: {
    label: "处理中",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  qc_pending: {
    label: "待校验",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  published: {
    label: "已发布",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

export default function PaperDetailsPage() {
  const params = useParams<{ id: string }>();
  const paperId = params.id;

  const [paper, setPaper] = useState<RawPaperDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  useEffect(() => {
    const fetchPaper = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/raw-papers/${paperId}`, {
          method: "GET",
          cache: "no-store",
        });
        const data =
          (await response.json().catch(() => ({}))) as RawPaperDetailApiResponse;
        if (!response.ok) {
          throw new Error(data.detail || `加载试卷详情失败 (HTTP ${response.status})`);
        }
        const viewPaper = toViewModel(data);
        setPaper(viewPaper);
        setPreviewIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载试卷详情失败");
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId) {
      void fetchPaper();
    }
  }, [paperId]);

  const statusMeta = useMemo(() => {
    if (!paper) {
      return statusConfig.pending;
    }
    return statusConfig[paper.status] ?? statusConfig.pending;
  }, [paper]);

  const currentPreviewUrl = useMemo(() => {
    if (!paper || paper.preview_urls.length === 0) {
      return "";
    }
    const safeIndex = Math.min(Math.max(previewIndex, 0), paper.preview_urls.length - 1);
    return paper.preview_urls[safeIndex] || "";
  }, [paper, previewIndex]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-8">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载试卷档案...
        </div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href="/raw-papers"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回原卷列表
        </Link>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "试卷不存在"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <Link
            href="/raw-papers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回原卷列表
          </Link>

          <h1 className="truncate px-4 text-xl font-semibold tracking-tight text-slate-900">
            {paper.title}
          </h1>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
            {paper.status === "qc_pending" ? (
              <Link
                href={`/ai-review/${paper.id}`}
                className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                进入 AI 校验台
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 inline-flex rounded-lg bg-sky-50 p-2 text-sky-700">
                  <BookOpen className="h-4 w-4" />
                </div>
                <p className="text-xs uppercase tracking-wider text-slate-400">题目总数</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{paper.total_questions}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 inline-flex rounded-lg bg-violet-50 p-2 text-violet-700">
                  <FileStack className="h-4 w-4" />
                </div>
                <p className="text-xs uppercase tracking-wider text-slate-400">适用年级</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{paper.grade}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <User className="h-4 w-4" />
                </div>
                <p className="text-xs uppercase tracking-wider text-slate-400">上传人</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{paper.uploader_name}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 inline-flex rounded-lg bg-amber-50 p-2 text-amber-700">
                  <Calendar className="h-4 w-4" />
                </div>
                <p className="text-xs uppercase tracking-wider text-slate-400">上传时间</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{paper.upload_time}</p>
              </div>
            </div>

            <div className="flex min-h-[360px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="space-y-2">
                <p className="text-base font-semibold text-slate-700">数据可视化占位区</p>
                <p className="text-sm text-slate-500">
                  此处未来可接入 ECharts 渲染该试卷的题型分布与知识点覆盖率图表
                </p>
              </div>
            </div>

          </section>

          <aside className="min-h-[540px] rounded-xl border border-slate-700 bg-slate-800 p-5 text-slate-100">
            <p className="text-sm font-semibold tracking-wide text-slate-200">防伪原卷预览</p>
            {currentPreviewUrl ? (
              <div className="mt-4 flex h-[calc(100%-2rem)] flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowLightbox(true)}
                  className="group relative flex-1 overflow-hidden rounded-lg border border-slate-600 bg-slate-900/60"
                >
                  <img
                    src={currentPreviewUrl}
                    alt={`原卷预览第 ${previewIndex + 1} 页`}
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-end justify-center bg-black/0 pb-3 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-800">
                      点击放大查看
                    </span>
                  </div>
                </button>

                {paper.preview_urls.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {paper.preview_urls.map((url, idx) => (
                      <button
                        type="button"
                        key={`${url}-${idx}`}
                        onClick={() => setPreviewIndex(idx)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border ${
                          idx === previewIndex ? "border-white" : "border-slate-600"
                        }`}
                      >
                        <img
                          src={url}
                          alt={`缩略图 ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex h-[calc(100%-2rem)] items-center justify-center rounded-lg border border-slate-600 bg-slate-900/60 p-4 text-center">
                <p className="text-sm text-slate-300">暂无可预览的原卷图片</p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {showLightbox && currentPreviewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setShowLightbox(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="关闭预览"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={currentPreviewUrl}
            alt="原卷放大预览"
            className="max-h-[92vh] max-w-[92vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
