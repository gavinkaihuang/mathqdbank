// app/(admin)/dashboard/page.tsx
// 仪表盘占位页 (Server Component)
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-8 py-6 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <LayoutDashboard className="h-4.5 w-4.5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">仪表盘</h1>
            <p className="text-sm text-slate-500 mt-0.5">系统运行概览</p>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="flex-1 p-8">
        <div className="max-w-3xl space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            概览
          </h2>

          <Link
            href="/math-ingestion"
            className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div>
              <p className="text-base font-semibold text-slate-800">一本涂书入库</p>
              <p className="text-sm text-slate-500">进入识别任务列表，进行核对与入库</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5 text-slate-500" />
            </div>
          </Link>

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">仪表盘功能开发中</p>
            <p className="text-xs text-slate-400 mt-1">敬请期待</p>
          </div>
        </div>
      </div>
    </div>
  );
}
