"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";

type Task = {
  id: number;
  minio_path: string;
  image_url?: string | null;
  status: string;
  json_result?: Record<string, unknown> | null;
  error_log?: string | null;
  updated_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-sky-50 text-sky-700 border-sky-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const query =
        statusFilter === "ALL" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(`/api/tasks${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail ?? `加载失败 (HTTP ${res.status})`);
      }
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleSync = async () => {
    setSyncLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tasks/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `同步失败 (HTTP ${res.status})`);
      }
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncLoading(false);
    }
  };

  const totals = useMemo(() => {
    const done = tasks.filter((t) => t.status === "DONE").length;
    const failed = tasks.filter((t) => t.status === "FAILED").length;
    return { all: tasks.length, done, failed };
  }, [tasks]);

  return (
    <div className="space-y-5 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Extraction 任务中心</h1>
            <p className="text-sm text-slate-500">
              总计 {totals.all} 条，完成 {totals.done} 条，失败 {totals.failed} 条
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {syncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            同步 MinIO
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">状态筛选</span>
          <select
            aria-label="任务状态筛选"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
          >
            <option value="ALL">全部</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="DONE">DONE</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full table-fixed">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-20 px-4 py-3">ID</th>
              <th className="px-4 py-3">MinIO Path</th>
              <th className="w-36 px-4 py-3">状态</th>
              <th className="w-44 px-4 py-3">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载任务...
                  </span>
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                  暂无任务数据
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className="border-t border-slate-100 text-sm hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">#{task.id}</td>
                  <td className="truncate px-4 py-3">
                    <Link href={`/tasks/${task.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                      {task.minio_path}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        STATUS_STYLE[task.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(task.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
