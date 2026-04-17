// app/(admin)/_components/AIPipelineBoard.tsx
// AI 切题任务进度看板 —— 嵌入列表页上方的区域，显示正在处理的试卷
"use client";

import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface ProcessingPaper {
  id: string;
  title: string;
}

export interface ProcessingRuntime {
  paperId: string;
  step: string;
  progress: number;
  message: string;
  updatedAt: string;
  questionsDetected: number;
  imagesCropped: number;
  llmPageFailures: number;
}

interface AIPipelineBoardProps {
  processingPapers: ProcessingPaper[];
  runtimeByPaperId: Record<string, ProcessingRuntime | undefined>;
}

// 单条任务卡片
function TaskItem({
  paper,
  runtime,
}: {
  paper: ProcessingPaper;
  runtime?: ProcessingRuntime;
}) {
  const heartbeatText = runtime?.updatedAt
    ? new Date(runtime.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "-";
  const percent = typeof runtime?.progress === "number" ? runtime.progress : null;

  return (
    <div className="flex items-center gap-4 py-3">
      {/* 左侧 Spinner */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">
          {paper.title}
        </p>

        {/* 进度条 */}
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 animate-[progress_2s_ease-in-out_infinite]" />
        </div>

        <p className="mt-1 text-[10px] text-slate-400 animate-pulse">
          {runtime?.message || "AI 正在进行 OCR 识别与智能切题…"}
        </p>
        <p className="mt-1 text-[10px] text-slate-500">
          阶段: {runtime?.step || "processing"} · 进度: {percent !== null ? `${percent}%` : "--"} · 最后心跳: {heartbeatText}
        </p>
        <p className="mt-1 text-[10px] text-slate-500">
          识别题目: {runtime?.questionsDetected ?? 0} · 切图数量: {runtime?.imagesCropped ?? 0} · LLM失败页: {runtime?.llmPageFailures ?? 0}
        </p>
      </div>

      <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
        后台处理中
      </span>
    </div>
  );
}

// 主看板组件
export default function AIPipelineBoard({
  processingPapers,
  runtimeByPaperId,
}: AIPipelineBoardProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (processingPapers.length === 0) return null;

  return (
    <div className="mx-8 mt-5 rounded-2xl border border-blue-200 bg-blue-50/60 overflow-hidden shadow-sm">
      {/* ── Board Header ── */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-blue-100/50 transition-colors"
      >
        {/* Icon + badge */}
        <div className="flex items-center gap-2 flex-1">
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-blue-800">
            AI 切题流水线
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
            {processingPapers.length}
          </span>
          <span className="text-xs text-blue-500 font-medium animate-pulse">
            处理中
          </span>
        </div>

        {/* Collapse toggle */}
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-blue-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-blue-400" />
        )}
      </button>

      {/* ── Task List ── */}
      {!collapsed && (
        <div className="px-5 pb-3 divide-y divide-blue-100">
          {processingPapers.map((paper) => (
            <TaskItem key={paper.id} paper={paper} runtime={runtimeByPaperId[paper.id]} />
          ))}
        </div>
      )}

      {/* 进度条动画 keyframe（内联，无全局污染）*/}
      <style>{`
        @keyframes progress {
          0%   { width: 15%; margin-left: 0%; }
          50%  { width: 55%; margin-left: 25%; }
          100% { width: 15%; margin-left: 85%; }
        }
      `}</style>
    </div>
  );
}
