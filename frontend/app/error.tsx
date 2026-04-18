"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-rose-100 bg-white p-8 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">页面加载失败</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          当前页面在渲染时发生异常。你可以重试一次；如果问题持续存在，再检查接口返回或最近的页面改动。
        </p>
        {error.message && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {error.message}
          </div>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          重新加载
        </button>
      </div>
    </div>
  );
}