// app/(admin)/_components/ReviewModal.tsx
// 题目预览弹窗 —— 阶段三入口占位组件
"use client";

import { useEffect, useRef } from "react";
import { X, ScanSearch, Sparkles } from "lucide-react";

interface ReviewModalProps {
  paperId: string;
  paperTitle: string;
  onClose: () => void;
}

export default function ReviewModal({
  paperId,
  paperTitle,
  onClose,
}: ReviewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // 按 Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 禁止背景滚动
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    // 遮罩层
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* 弹窗主体 */}
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in"
        style={{
          animation: "modal-in 0.2s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <ScanSearch className="h-4.5 w-4.5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              审核题目
            </p>
            <p className="text-xs text-slate-400 truncate mt-0.5">{paperTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body —— 阶段三占位内容 ── */}
        <div className="px-6 py-12 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-violet-500" />
          </div>

          <div>
            <p className="text-base font-semibold text-slate-700">
              这里将展示切好的题目对比视图
            </p>
            <p className="text-sm text-slate-400 mt-1.5 max-w-sm leading-relaxed">
              AI 已完成 OCR 识别与智能切题。阶段三将在此展示原图裁切对比、
              题目结构化数据、知识点标注与审核操作。
            </p>
          </div>

          <div className="mt-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span className="text-slate-400">Paper ID:</span>
            <span className="text-slate-700 font-semibold">{paperId}</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
          >
            关闭
          </button>
          <button
            disabled
            className="px-4 py-2 text-sm font-medium text-white bg-violet-500 rounded-xl opacity-50 cursor-not-allowed"
            title="阶段三开放后可用"
          >
            进入审核视图
          </button>
        </div>
      </div>

      {/* 弹出动画 keyframes（内联，避免全局 CSS 污染）*/}
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}
