"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquareCode,
  Plus,
  PencilLine,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface LlmPrompt {
  id: number;
  name: string;
  slug?: string;
  description: string;
  version: string;
  content: string;
  model_routing_key: string;
  is_active: boolean;
  updated_at: string;
}

export default function PromptListPage() {
  const [prompts, setPrompts] = useState<LlmPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchPrompts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts?size=100");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPrompts(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleDelete = async (prompt: LlmPrompt) => {
    if (!confirm(`确认删除提示词「${prompt.name}」？此操作不可撤销。`)) return;
    setDeletingId(prompt.id);
    try {
      const res = await fetch(`/api/prompts/${prompt.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrompts((prev) => prev.filter((p) => p.id !== prompt.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <MessageSquareCode className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">提示词管理</h1>
          </div>
          <p className="text-sm text-slate-500">
            统一维护各 LLM 任务的 System Prompt 与版本演进
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchPrompts}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 text-sm hover:bg-slate-50 transition-colors"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/prompts/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            新建提示词
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white h-40 animate-pulse"
            />
          ))}
        </div>
      ) : prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
          <MessageSquareCode className="h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">暂无提示词，请点击"新建提示词"添加</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {prompts.map((prompt) => (
            <article
              key={prompt.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-800 truncate">
                      {prompt.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
                      {prompt.model_routing_key}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                        prompt.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {prompt.is_active ? "启用" : "停用"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                      {prompt.version}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-6 min-h-10 line-clamp-2">
                  {prompt.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400 truncate">
                    更新于{" "}
                    {prompt.updated_at
                      ? new Date(prompt.updated_at).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(prompt)}
                      disabled={deletingId === prompt.id}
                      className="inline-flex items-center gap-1 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      href={`/prompts/${prompt.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      编辑
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
