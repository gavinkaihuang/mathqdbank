"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Tags } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type Task = {
  id: number;
  minio_path: string;
  image_url?: string | null;
  status: string;
  json_result?: Record<string, unknown> | null;
  error_log?: string | null;
  updated_at: string;
};

type TagResult = {
  task_id: number;
  knowledge_point_id: number;
  knowledge_point_title: string;
  knowledge_point_path?: string | null;
  confidence: number;
  reason: string;
};

function toPreviewMarkdown(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText) as {
      items?: Array<{ content_type?: string; latex_content?: string; expert_note?: string }>;
      questions?: Array<{ body?: string; solution?: string; difficulty?: number }>;
    };

    const lines: string[] = [];
    lines.push("## 识别预览");

    if (parsed.items?.length) {
      lines.push("\n### Knowledge Items");
      parsed.items.forEach((item, index) => {
        lines.push(`\n${index + 1}. **${item.content_type ?? "UNKNOWN"}**`);
        if (item.latex_content) {
          lines.push(`\n$$\n${item.latex_content}\n$$`);
        }
        if (item.expert_note) {
          lines.push(`\n- 备注: ${item.expert_note}`);
        }
      });
    }

    if (parsed.questions?.length) {
      lines.push("\n### Questions");
      parsed.questions.forEach((q, index) => {
        lines.push(`\n#### Q${index + 1} (difficulty: ${q.difficulty ?? "N/A"})`);
        if (q.body) {
          lines.push(`\n题干:\n\n${q.body}`);
        }
        if (q.solution) {
          lines.push(`\n解析:\n\n${q.solution}`);
        }
      });
    }

    return lines.join("\n");
  } catch {
    return "## JSON 解析失败\n\n请先修正右侧 JSON 格式后再预览。";
  }
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [jsonText, setJsonText] = useState("{}");
  const [status, setStatus] = useState("DONE");
  const [kpId, setKpId] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [tagLoading, setTagLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState("");
  const [tagResult, setTagResult] = useState<TagResult | null>(null);

  const loadTask = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Task | { detail?: string };
      if (!res.ok) {
        throw new Error((data as { detail?: string }).detail ?? `加载失败 (HTTP ${res.status})`);
      }
      const taskData = data as Task;
      setTask(taskData);
      setStatus(taskData.status || "DONE");
      setJsonText(JSON.stringify(taskData.json_result ?? { items: [], questions: [] }, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setTask(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleRetry = async () => {
    setRetryLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kp_id: kpId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `重试失败 (HTTP ${res.status})`);
      }
      await loadTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试失败");
    } finally {
      setRetryLoading(false);
    }
  };

  const handleAutoTag = async () => {
    setTagLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallback_kp_id: kpId || null,
          source: "sh_math",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as TagResult | { detail?: string };
      if (!res.ok) {
        throw new Error((data as { detail?: string }).detail ?? `自动打标失败 (HTTP ${res.status})`);
      }
      const matched = data as TagResult;
      setTagResult(matched);
      setKpId(String(matched.knowledge_point_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "自动打标失败");
    } finally {
      setTagLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setError("");
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kp_id: kpId,
          status,
          json_result: parsed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `保存失败 (HTTP ${res.status})`);
      }
      await loadTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaveLoading(false);
    }
  };

  const previewMarkdown = useMemo(() => toPreviewMarkdown(jsonText), [jsonText]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/tasks" className="text-sm text-slate-500 hover:text-slate-700">
            ← 返回任务列表
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">任务详情 #{taskId}</h1>
          {task ? <p className="text-sm text-slate-500">{task.minio_path}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={kpId}
            onChange={(e) => setKpId(e.target.value)}
            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            placeholder="kp_id"
          />
          <button
            onClick={handleAutoTag}
            disabled={tagLoading || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {tagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />}
            自动打标
          </button>
          <button
            onClick={handleRetry}
            disabled={retryLoading || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {retryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            重新解析
          </button>
          <button
            onClick={handleSave}
            disabled={saveLoading || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存并入库
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {tagResult ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <div className="font-medium">已自动匹配知识点</div>
          <div>
            kp_id={tagResult.knowledge_point_id} | {tagResult.knowledge_point_title}
            {tagResult.knowledge_point_path ? ` (${tagResult.knowledge_point_path})` : ""}
          </div>
          <div>confidence={tagResult.confidence.toFixed(3)}</div>
          {tagResult.reason ? <div>reason: {tagResult.reason}</div> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载任务详情...
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              原图预览
            </div>
            <div className="relative h-[560px] bg-slate-100">
              {task?.image_url ? (
                <Image
                  src={task.image_url}
                  alt={task.minio_path}
                  fill
                  unoptimized
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  无可预览图片
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700">json_result 编辑</span>
                <select
                  aria-label="任务状态"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="DONE">DONE</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>
              <textarea
                aria-label="任务 JSON 结果"
                placeholder="请在此编辑 json_result"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="h-[320px] w-full resize-none bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none"
              />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                LaTeX 预览 (react-markdown + remark-math)
              </div>
              <div className="prose prose-slate max-w-none px-4 py-3 text-sm [&_.katex-display]:overflow-x-auto">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {previewMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
