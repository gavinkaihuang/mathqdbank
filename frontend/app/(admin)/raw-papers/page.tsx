// app/(admin)/raw-papers/page.tsx
// 原卷管理列表页（Client Component）
// 状态流转：pending → processing → completed / failed
// 集成：AI 切题按钮 + 进度看板 + 题目预览弹窗
"use client";

import { useState, useCallback } from "react";
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
import QuestionAuditModal from "../../../components/QuestionAuditModal";

// ── 类型定义 ──────────────────────────────────────────────
type PaperStatus = "pending" | "processing" | "completed" | "failed";

interface RawPaper {
  id: string;
  title: string;
  grade: string;
  uploadAt: string;
  status: PaperStatus;
}

// ── Mock 初始数据 ──────────────────────────────────────────
const INITIAL_PAPERS: RawPaper[] = [
  {
    id: "rp-001",
    title: "2024 年高考数学全国甲卷",
    grade: "高三",
    uploadAt: "2024-06-08 09:12",
    status: "completed",
  },
  {
    id: "rp-002",
    title: "2024 年高考数学全国乙卷",
    grade: "高三",
    uploadAt: "2024-06-08 10:05",
    status: "completed",
  },
  {
    id: "rp-003",
    title: "2023 年高考数学（新课标 I 卷）",
    grade: "高三",
    uploadAt: "2024-05-20 14:30",
    status: "processing",
  },
  {
    id: "rp-004",
    title: "2024 年浙江省高考数学卷",
    grade: "高三",
    uploadAt: "2024-06-10 08:45",
    status: "pending",
  },
  {
    id: "rp-005",
    title: "人教版八年级数学期末模拟卷（上）",
    grade: "初二",
    uploadAt: "2024-05-15 11:00",
    status: "failed",
  },
  {
    id: "rp-006",
    title: "2024 年七年级数学月考卷（第三次）",
    grade: "初一",
    uploadAt: "2024-06-01 16:20",
    status: "completed",
  },
  {
    id: "rp-007",
    title: "2024 年高考数学（新课标 II 卷）",
    grade: "高三",
    uploadAt: "2024-06-09 09:00",
    status: "pending",
  },
];

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

// ── 模拟发起 AI 切题的假请求 ────────────────────────────────
async function mockTriggerAI(_paperId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // 模拟偶发失败（约 10% 概率），可按需开启
  // if (Math.random() < 0.1) throw new Error("模拟请求失败");
}

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
  const [papers, setPapers] = useState<RawPaper[]>(INITIAL_PAPERS);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // 修改单条试卷状态
  const updateStatus = useCallback((id: string, status: PaperStatus) => {
    setPapers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
  }, []);

  // 发起 AI 切题：pending / failed → processing
  const handleTriggerAI = useCallback(
    async (id: string) => {
      await mockTriggerAI(id);
      updateStatus(id, "processing");
    },
    [updateStatus]
  );

  // 模拟 AI 完成（来自任务看板）
  const handleSimulateComplete = useCallback(
    (id: string) => {
      updateStatus(id, "completed");
    },
    [updateStatus]
  );

  // 删除
  const handleDelete = useCallback((id: string) => {
    setPapers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 正在处理的试卷列表（传给看板）
  const processingPapers = papers
    .filter((p) => p.status === "processing")
    .map((p) => ({ id: p.id, title: p.title }));

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
      <AIPipelineBoard
        processingPapers={processingPapers}
        onSimulateComplete={handleSimulateComplete}
      />

      {/* ── Table ── */}
      <div className="flex-1 px-8 py-6 overflow-auto">
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
                      {paper.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleTriggerAI(paper.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-all"
                          title="发起 AI 自动切题"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          发起切题
                        </button>
                      )}
                      {paper.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => setShowPreviewModal(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-semibold text-green-700 hover:bg-green-100 transition-all"
                          title="审核切好的题目"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          审核题目
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {papers.length === 0 && (
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

        <p className="text-xs text-slate-400 mt-3 px-1">
          共 {papers.length} 份试卷 · 使用 Mock 数据展示
        </p>
      </div>

      {/* ── 题目预览弹窗 ── */}
      <QuestionAuditModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
      />
    </div>
  );
}
