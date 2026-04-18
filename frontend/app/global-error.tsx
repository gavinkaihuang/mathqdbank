"use client";

import { AlertOctagon, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh">
      <body className="bg-slate-950 text-slate-50 antialiased">
        <div className="flex min-h-screen items-center justify-center px-6 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-950/40">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
              <AlertOctagon className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold">应用发生未处理异常</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              根布局或全局渲染流程发生错误，已切换到全局错误页。请先重试，若仍失败，再检查最新改动或服务端日志。
            </p>
            {error.message && (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                {error.message}
              </div>
            )}
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" />
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}