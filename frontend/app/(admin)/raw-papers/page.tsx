// app/(admin)/raw-papers/page.tsx
// 原卷管理列表页（Client Component）
// 状态流转：pending → processing → completed / failed
// 集成：AI 切题按钮 + 进度看板 + 题目预览弹窗
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Upload,
  FileStack,
  Eye,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Zap,
  ClipboardCheck,
} from "lucide-react";
import AIPipelineBoard from "../_components/AIPipelineBoard";
import type { ProcessingRuntime } from "../_components/AIPipelineBoard";

// ── 类型定义 ──────────────────────────────────────────────
type PaperStatus = "pending" | "processing" | "completed" | "failed";

interface RawPaper {
  id: string;
  title: string;
  grade: string;
  uploadAt: string;
  status: PaperStatus;
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
    return "completed";
  }
  if (normalized === "failed" || normalized === "error") return "failed";
  return "pending";
}

function formatUploadAt(createdAt?: string): string {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
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
  };
}

// ── 状态徽章配置 ───────────────────────────────────────────
const STATUS_CONFIG = {
  pending: {
    label: "待处理",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    icon: Clock,
  },
  processing: {
    label: "处理中",
    className: "bg-blue-50 text-blue-600 border-blue-200",
    icon: AlertCircle,
  },
  completed: {
    label: "已完成",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  failed: {
    label: "失败",
    className: "bg-red-50 text-red-600 border-red-200",
    icon: XCircle,
  },
} satisfies Record<PaperStatus, { label: string; className: string; icon: React.ElementType }>;

// ── 状态徽章组件 ───────────────────────────────────────────
function StatusBadge({ status }: { status: PaperStatus }) {
  const conf = STATUS_CONFIG[status];
  const Icon = conf.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${conf.className}`}
    >
      {status === "processing" ? (
        <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {conf.label}
    </span>
  );
}

// ── 主页面 ────────────────────────────────────────────────
export default function RawPapersPage() {
  const [papers, setPapers] = useState<RawPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [runtimeByPaperId, setRuntimeByPaperId] = useState<Record<string, ProcessingRuntime | undefined>>({});

  const fetchPapers = useCallback(async () => {
    setLoading((prev) => (papers.length === 0 ? true : prev));
    setLoadError("");

    try {
      const response = await fetch("/api/raw-papers", { method: "GET" });
      if (!response.ok) {
        throw new Error("获取试卷列表失败");
      }

      const data = (await response.json()) as { items?: BackendRawPaper[] };
      setPapers((data.items ?? []).map(toViewPaper));
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取试卷列表失败";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [papers.length]);

  useEffect(() => {
    void fetchPapers();
  }, [fetchPapers]);

  // 修改单条试卷状态
  const updateStatus = useCallback((id: string, status: PaperStatus) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
  }, []);

  // 发起 AI 切题：pending / failed → processing
  const handleTriggerAI = useCallback(
    async (id: string) => {
      setActionError("");
      setTriggeringId(id);
      try {
        const response = await fetch(`/api/raw-papers/${id}/extract`, {
          method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
        if (!response.ok) {
          const detail =
            typeof data.detail === "string" ? data.detail : `发起切题失败 (HTTP ${response.status})`;
          throw new Error(detail);
        }

        updateStatus(id, "processing");
        void fetchPapers();
      } catch (error) {
        const message = error instanceof Error ? error.message : "发起切题失败";
        setActionError(message);
      } finally {
        setTriggeringId(null);
      }
    },
    [fetchPapers, updateStatus]
  );

  const handleStopAI = useCallback(
    async (id: string) => {
      setActionError("");
      setStoppingId(id);
      try {
        const response = await fetch(`/api/raw-papers/${id}/extract/stop`, {
          method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
        if (!response.ok) {
          const detail =
            typeof data.detail === "string" ? data.detail : `停止切题失败 (HTTP ${response.status})`;
          throw new Error(detail);
        }
        void fetchPapers();
      } catch (error) {
        const message = error instanceof Error ? error.message : "停止切题失败";
        setActionError(message);
      } finally {
        setStoppingId(null);
      }
    },
    [fetchPapers]
  );

  // 删除
  const handleDelete = useCallback((id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 正在处理的试卷列表（传给看板）
  const processingPapers = useMemo(
    () =>
      papers
        .filter((p) => p.status === "processing")
        .map((p) => ({ id: p.id, title: p.title })),
    [papers]
  );

  // 有进行中的任务时自动轮询列表（降低频率，减少后端访问日志噪声）
  useEffect(() => {
    if (processingPapers.length === 0) return;

    const timer = window.setInterval(() => {
      void fetchPapers();
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [fetchPapers, processingPapers.length]);

  // 运行态轮询：用于实时显示后端是否在工作（step/progress/心跳）
  useEffect(() => {
    if (processingPapers.length === 0) {
      setRuntimeByPaperId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const fetchRuntime = async () => {
      const nextEntries = await Promise.all(
        processingPapers.map(async (paper) => {
          try {
            const res = await fetch(`/api/raw-papers/${paper.id}/runtime`, { method: "GET" });
            if (!res.ok) return [paper.id, undefined] as const;

            const data = (await res.json()) as {
              runtime?: {
                paper_id?: number;
                step?: string;
                progress?: number;
                message?: string;
                updated_at?: string;
                questions_detected?: number;
                images_cropped?: number;
                llm_page_failures?: number;
              } | null;
            };
            const rt = data.runtime;
            if (!rt) return [paper.id, undefined] as const;

            const runtime: ProcessingRuntime = {
              paperId: String(rt.paper_id ?? paper.id),
              step: rt.step ?? "processing",
              progress: typeof rt.progress === "number" ? rt.progress : 0,
              message: rt.message ?? "后台处理中",
              updatedAt: rt.updated_at ?? "",
              questionsDetected:
                typeof rt.questions_detected === "number" ? rt.questions_detected : 0,
              imagesCropped: typeof rt.images_cropped === "number" ? rt.images_cropped : 0,
              llmPageFailures:
                typeof rt.llm_page_failures === "number" ? rt.llm_page_failures : 0,
            };
            return [paper.id, runtime] as const;
          } catch {
            return [paper.id, undefined] as const;
          }
        })
      );

      setRuntimeByPaperId(Object.fromEntries(nextEntries));
    };

    void fetchRuntime();
    const timer = window.setInterval(() => {
      void fetchRuntime();
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [processingPapers]);

  // 统计数字
  const counts = {
    all: papers.length,
    completed: papers.filter((p) => p.status === "completed").length,
    processing: papers.filter((p) => p.status === "processing").length,
    failed: papers.filter((p) => p.status === "failed").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-8 py-6 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <FileStack className="h-4.5 w-4.5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">原卷管理</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              管理所有已入库的原始试卷，共{" "}
              <span className="font-medium text-slate-700">{counts.all}</span> 份
            </p>
          </div>
        </div>

        <Link
          href="/raw-papers/upload"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" />
          上传新试卷
        </Link>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 gap-px bg-slate-100 border-b border-slate-100">
        {(
          [
            { label: "全部", value: counts.all, color: "text-slate-800" },
            { label: "已完成", value: counts.completed, color: "text-emerald-600" },
            { label: "处理中", value: counts.processing, color: "text-blue-600" },
            { label: "失败", value: counts.failed, color: "text-red-500" },
          ] as const
        ).map((stat) => (
          <div key={stat.label} className="bg-white px-8 py-3 flex items-center gap-3">
            <span className={`text-2xl font-bold tabular-nums ${stat.color}`}>
              {stat.value}
            </span>
            <span className="text-xs text-slate-400 font-medium">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* ── AI 任务看板（有正在处理的试卷时显示）── */}
      <AIPipelineBoard processingPapers={processingPapers} runtimeByPaperId={runtimeByPaperId} />

      {/* ── Table ── */}
      <div className="flex-1 px-8 py-6 overflow-auto">
        {loadError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {loadError}
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {actionError}
          </div>
        ) : null}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["试卷名称", "适用年级", "上传时间", "处理状态", "操作"].map(
                  (col, i) => (
                    <th
                      key={col}
                      className={`px-6 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider ${
                        i === 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 text-sm"
                  >
                    试卷加载中...
                  </td>
                </tr>
              ) : null}

              {papers.map((paper) => (
                <tr
                  key={paper.id}
                  className={`transition-colors group ${
                    paper.status === "processing"
                      ? "bg-blue-50/30"
                      : "hover:bg-slate-50/60"
                  }`}
                >
                  {/* 试卷名称 */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <FileStack className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 leading-snug">
                          {paper.title}
                        </p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          {paper.id}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* 适用年级 */}
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                      {paper.grade}
                    </span>
                  </td>

                  {/* 上传时间 */}
                  <td className="px-6 py-4 text-slate-500 text-xs font-mono tabular-nums whitespace-nowrap">
                    {paper.uploadAt}
                  </td>

                  {/* 状态徽章 */}
                  <td className="px-6 py-4">
                    <StatusBadge status={paper.status} />
                  </td>

                  {/* 操作列 */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {(paper.status === "pending" || paper.status === "failed") && (
                        <button
                          type="button"
                          onClick={() => handleTriggerAI(paper.id)}
                          disabled={triggeringId === paper.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                            paper.status === "failed"
                              ? "bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
                              : "bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                          }`}
                          title={paper.status === "failed" ? "重新发起 AI 切题" : "发起 AI 自动切题"}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {triggeringId === paper.id
                            ? "发起中..."
                            : paper.status === "failed"
                            ? "重新切题"
                            : "发起切题"}
                        </button>
                      )}
                      {paper.status === "processing" && (
                        <button
                          type="button"
                          onClick={() => handleStopAI(paper.id)}
                          disabled={stoppingId === paper.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                          title="手动停止当前切题任务"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {stoppingId === paper.id ? "停止中..." : "手动停止"}
                        </button>
                      )}
                      {paper.status === "completed" && (
                        <button
                          type="button"
                          onClick={() => handleTriggerAI(paper.id)}
                          disabled={triggeringId === paper.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          title="重新开始切题"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {triggeringId === paper.id ? "发起中..." : "重新切题"}
                        </button>
                      )}
                      {paper.status === 'completed' && (
                        <Link
                          href={`/raw-papers/${paper.id}/qa`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-semibold text-green-700 hover:bg-green-100 transition-all"
                          title="进入切图质检"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          切图质检
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && papers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 text-sm"
                  >
                    暂无试卷，请先上传
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 mt-3 px-1">共 {papers.length} 份试卷</p>
      </div>
    </div>
  );
}
