"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Maximize2, Minimize2, RefreshCcw, RotateCcw, Save, SkipForward } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type Task = {
  id: number;
  minio_path: string;
  image_url?: string | null;
  image_presigned_url?: string | null;
  is_ignored?: boolean;
  ignored_at?: string | null;
  status: string;
  json_result?: Record<string, unknown> | null;
  error_log?: string | null;
  updated_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-sky-50 text-sky-700 border-sky-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-rose-100 text-rose-800 border-rose-300",
  SKIPPED: "bg-slate-100 text-slate-700 border-slate-300",
};

function buildPreviewFromJson(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText) as {
      items?: Array<{ content_type?: string; latex_content?: string; expert_note?: string }>;
      questions?: Array<{ body?: string; solution?: string; difficulty?: number }>;
    };

    const lines: string[] = ["## LaTeX 识别预览"];

    if (parsed.items?.length) {
      lines.push("\n### Knowledge Items");
      for (const [index, item] of parsed.items.entries()) {
        lines.push(`\n#### Item ${index + 1} · ${item.content_type ?? "UNKNOWN"}`);
        if (item.latex_content) {
          lines.push(`\n$$\n${item.latex_content}\n$$`);
        }
        if (item.expert_note) {
          lines.push(`\n- expert_note: ${item.expert_note}`);
        }
      }
    }

    if (parsed.questions?.length) {
      lines.push("\n### Questions");
      for (const [index, q] of parsed.questions.entries()) {
        lines.push(`\n#### Q${index + 1} (difficulty: ${q.difficulty ?? "N/A"})`);
        if (q.body) {
          lines.push(`\n题干:\n\n${q.body}`);
        }
        if (q.solution) {
          lines.push(`\n解析:\n\n${q.solution}`);
        }
      }
    }

    return lines.join("\n");
  } catch {
    return "## JSON 格式错误\n\n请先修正右侧 JSON，再进行 LaTeX 预览。";
  }
}

export default function MathIngestionPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [jsonText, setJsonText] = useState("{\n  \"items\": [],\n  \"questions\": []\n}");
  const [kpId, setKpId] = useState("1");
  const [status, setStatus] = useState("DONE");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [updatingIgnore, setUpdatingIgnore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [runningAction, setRunningAction] = useState<"retry" | "save" | "skip" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusPane, setFocusPane] = useState<"split" | "image" | "text">("split");
  const [imageZoomIndex, setImageZoomIndex] = useState(0);
  const [error, setError] = useState("");
  const pageSize = 40;
  const zoomLevels = [100, 125, 150, 200, 300];

  const fetchList = async () => {
    setLoadingList(true);
    setError("");
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail ?? `加载任务失败 (HTTP ${res.status})`);
      }
      const rows = Array.isArray(data) ? (data as Task[]) : [];
      setTasks(rows);
      setCurrentPage(1);
      setSelectedIds((prev) => prev.filter((id) => rows.some((row) => row.id === id)));
      if (rows.length === 0) {
        setSelectedId(null);
        setSelectedTask(null);
        return;
      }

      if (!selectedId || !rows.some((row) => row.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载任务失败");
      setTasks([]);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setLoadingDetail(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `加载详情失败 (HTTP ${res.status})`);
      }
      const task = data as Task;
      setSelectedTask(task);
      setStatus(task.status || "DONE");
      setJsonText(JSON.stringify(task.json_result ?? { items: [], questions: [] }, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载详情失败");
      setSelectedTask(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    void fetchDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleRetry = async () => {
    if (!selectedTask) return;
    if (selectedTask.is_ignored) {
      setError("当前任务处于“忽略”状态，不能重新解析。");
      return;
    }
    setRunningAction("retry");
    setError("");
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kp_id: kpId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `重新解析失败 (HTTP ${res.status})`);
      }
      await fetchList();
      await fetchDetail(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新解析失败");
    } finally {
      setRunningAction(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/tasks/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `同步失败 (HTTP ${res.status})`);
      }
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleIgnoreOne = async (taskId: number, ignore: boolean) => {
    setUpdatingIgnore(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ignore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `${ignore ? "忽略" : "启用"}失败 (HTTP ${res.status})`);
      }
      await fetchList();
      if (selectedId === taskId) {
        await fetchDetail(taskId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${ignore ? "忽略" : "启用"}失败`);
    } finally {
      setUpdatingIgnore(false);
    }
  };

  const handleToggleIgnoreSelected = async (ignore: boolean) => {
    if (selectedIds.length === 0) {
      return;
    }

    setUpdatingIgnore(true);
    setError("");
    try {
      const res = await fetch("/api/tasks/ignore-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ignore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `批量${ignore ? "忽略" : "启用"}失败 (HTTP ${res.status})`);
      }

      if (selectedId && selectedIds.includes(selectedId)) {
        await fetchDetail(selectedId);
      }
      await fetchList();
    } catch (err) {
      setError(err instanceof Error ? err.message : `批量${ignore ? "忽略" : "启用"}失败`);
    } finally {
      setUpdatingIgnore(false);
    }
  };

  const sortedTasks = useMemo(() => {
    const copied = [...tasks];
    copied.sort((a, b) => {
      const cmp = a.minio_path.localeCompare(b.minio_path, "zh-Hans-CN");
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copied;
  }, [tasks, sortOrder]);

  useEffect(() => {
    if (sortedTasks.length === 0) {
      setSelectedId(null);
      setSelectedTask(null);
      return;
    }
    if (!selectedId || !sortedTasks.some((task) => task.id === selectedId)) {
      setCurrentPage(1);
      setSelectedId(sortedTasks[0].id);
    }
  }, [sortedTasks, selectedId]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTasks.slice(start, start + pageSize);
  }, [sortedTasks, currentPage]);

  const pageTaskIds = useMemo(() => pageTasks.map((task) => task.id), [pageTasks]);
  const allChecked =
    pageTaskIds.length > 0 && pageTaskIds.every((id) => selectedIds.includes(id));

  const handleSave = async () => {
    if (!selectedTask) return;
    if (selectedTask.is_ignored) {
      setError("当前任务处于“忽略”状态，不能保存入库。");
      return;
    }
    setRunningAction("save");
    setError("");
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch(`/api/tasks/${selectedTask.id}`, {
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
        throw new Error(data?.detail ?? `保存并入库失败 (HTTP ${res.status})`);
      }
      await fetchList();
      await fetchDetail(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存并入库失败");
    } finally {
      setRunningAction(null);
    }
  };

  const handleSkip = async () => {
    if (!selectedTask) return;
    setRunningAction("skip");
    setError("");
    try {
      const parsed = JSON.parse(jsonText);
      const res = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kp_id: kpId,
          status: "SKIPPED",
          json_result: parsed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail ?? `跳过失败 (HTTP ${res.status})`);
      }
      await fetchList();
      await fetchDetail(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "跳过失败");
    } finally {
      setRunningAction(null);
    }
  };

  const previewMarkdown = useMemo(() => buildPreviewFromJson(jsonText), [jsonText]);

  const showImagePane = focusPane !== "text";
  const showTextPane = focusPane !== "image";
  const zoomWidthClassMap: Record<number, string> = {
    100: "w-full",
    125: "w-[125%]",
    150: "w-[150%]",
    200: "w-[200%]",
    300: "w-[300%]",
  };
  const currentZoom = zoomLevels[imageZoomIndex] ?? 100;
  const imageWidthClass = zoomWidthClassMap[currentZoom] ?? "w-full";

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    setImageZoomIndex(0);
  }, [selectedTask?.id]);

  const renderDetailWorkspace = (fullscreen: boolean) => {
    if (!selectedTask) {
      return null;
    }
    const isTaskIgnored = Boolean(selectedTask.is_ignored);

    const imageHeightClass = fullscreen ? "h-[calc(100vh-240px)]" : "h-[calc(100vh-330px)]";
    const editorHeightClass = fullscreen ? "h-[44vh]" : "h-[36vh]";
    const previewHeightClass = fullscreen ? "h-[calc(100vh-520px)]" : "h-[calc(100vh-620px)]";
    const gridClass = showImagePane && showTextPane
      ? "grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
      : "grid-cols-1";

    return (
      <div className={`grid gap-4 ${gridClass}`}>
        {showImagePane ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">MinIO 图片（预签名 URL）</p>
                  <p className="mt-1 text-xs text-slate-500">数据库ID: {selectedTask.id}</p>
                  <p className="truncate text-xs text-slate-600">图片名: {selectedTask.minio_path}</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                  <button
                    onClick={() => setImageZoomIndex((prev) => Math.max(0, prev - 1))}
                    disabled={imageZoomIndex === 0}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    缩小
                  </button>
                  <span className="min-w-[56px] text-center text-xs font-semibold text-slate-700">{currentZoom}%</span>
                  <button
                    onClick={() => setImageZoomIndex((prev) => Math.min(zoomLevels.length - 1, prev + 1))}
                    disabled={imageZoomIndex >= zoomLevels.length - 1}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    放大
                  </button>
                  <button
                    onClick={() => setImageZoomIndex(0)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>
            <div className={`min-h-[460px] overflow-auto bg-slate-100 ${imageHeightClass}`}>
              {selectedTask.image_presigned_url || selectedTask.image_url ? (
                <div
                  className={`flex min-h-full min-w-full p-3 ${currentZoom === 100 ? "items-center justify-center" : "items-start justify-start"}`}
                >
                  <Image
                    src={selectedTask.image_presigned_url || selectedTask.image_url || ""}
                    alt={selectedTask.minio_path}
                    width={1600}
                    height={2200}
                    unoptimized
                    className={`h-auto max-w-none rounded-md bg-white shadow ${imageWidthClass}`}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  无图片可预览
                </div>
              )}
            </div>
          </div>
        ) : null}

        {showTextPane ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <span className="text-sm font-semibold text-slate-800">JSON 编辑器</span>
                <div className="flex items-center gap-2">
                  <input
                    value={kpId}
                    onChange={(e) => setKpId(e.target.value)}
                    placeholder="kp_id"
                    className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs"
                  />
                  <select
                    aria-label="任务状态"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="DONE">DONE</option>
                    <option value="FAILED">FAILED</option>
                    <option value="SKIPPED">SKIPPED</option>
                  </select>
                </div>
              </div>

              {isTaskIgnored ? (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                  当前图片已忽略，AI OCR 操作已禁用（重新解析、保存并入库不可用）。
                </div>
              ) : null}

              <textarea
                aria-label="识别 JSON 编辑器"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className={`w-full resize-none bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none ${editorHeightClass}`}
              />

              <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                <button
                  onClick={handleRetry}
                  disabled={runningAction !== null || isTaskIgnored}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {runningAction === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  重新解析
                </button>
                <button
                  onClick={handleSave}
                  disabled={runningAction !== null || isTaskIgnored}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {runningAction === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存并入库
                </button>
                <button
                  onClick={handleSkip}
                  disabled={runningAction !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                >
                  {runningAction === "skip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />}
                  跳过此页
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                LaTeX 实时预览
              </div>
              <div
                className={`prose prose-slate max-w-none min-h-[220px] overflow-auto px-4 py-3 text-sm [&_.katex-display]:overflow-x-auto ${previewHeightClass}`}
              >
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {previewMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">任务列表</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              名字{sortOrder === "asc" ? "升序" : "降序"}
            </button>
            <button
              onClick={() => void handleToggleIgnoreSelected(true)}
              disabled={selectedIds.length === 0 || updatingIgnore}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              {updatingIgnore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              忽略选中
            </button>
            <button
              onClick={() => void handleToggleIgnoreSelected(false)}
              disabled={selectedIds.length === 0 || updatingIgnore}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {updatingIgnore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              启用选中
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              同步
            </button>
            <button
              onClick={() => void fetchList()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {loadingList ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              刷新
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">暂无任务数据</p>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => Array.from(new Set([...prev, ...pageTaskIds])));
                      } else {
                        setSelectedIds((prev) => prev.filter((id) => !pageTaskIds.includes(id)));
                      }
                    }}
                  />
                  本页全选
                </label>
              </div>

              {pageTasks.map((task) => {
                const isFailed = task.status === "FAILED";
                const active = selectedId === task.id;
                const checked = selectedIds.includes(task.id);
                const isIgnored = Boolean(task.is_ignored);
                return (
                  <div
                    key={task.id}
                    className={`border-b border-slate-100 px-4 py-3 transition ${
                      active
                        ? "border-l-4 border-l-sky-500 bg-sky-50/70 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.25)]"
                        : "hover:bg-slate-50"
                    } ${isFailed ? "bg-rose-50/70" : ""} ${isIgnored ? "opacity-70" : ""}`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== task.id));
                            }
                          }}
                        />
                        <span className="text-xs font-semibold text-slate-700">#{task.id}</span>
                      </label>

                      <div className="flex items-center gap-1">
                        {isIgnored ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            已忽略
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            STATUS_STYLE[task.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {task.status}
                        </span>
                        <button
                          onClick={() => void handleToggleIgnoreOne(task.id, !isIgnored)}
                          disabled={updatingIgnore}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold disabled:opacity-60 ${
                            isIgnored
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          }`}
                        >
                          {isIgnored ? "启用" : "忽略"}
                        </button>
                      </div>
                    </div>

                    <button onClick={() => setSelectedId(task.id)} className="w-full text-left">
                      <p className={`truncate text-xs ${active ? "font-semibold text-sky-800" : "text-slate-600"}`}>
                        {task.minio_path}
                      </p>
                    </button>
                  </div>
                );
              })}

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                <span>
                  第 {currentPage}/{totalPages} 页 · 每页 {pageSize} 条
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loadingDetail ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载详情...
            </span>
          </div>
        ) : !selectedTask ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">
            <p className="mb-2">暂无可查看任务。</p>
            <p className="text-xs text-slate-400">点击左上“同步”从 MinIO 拉取图片任务，或在“解析任务”页面先同步。</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-xs text-slate-600">
                校验视图：可切换分栏/单栏；全屏模式下按 ESC 可退出
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFocusPane("split")}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    focusPane === "split"
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  分栏
                </button>
                <button
                  onClick={() => setFocusPane("image")}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    focusPane === "image"
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  仅图片
                </button>
                <button
                  onClick={() => setFocusPane("text")}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    focusPane === "text"
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  仅文字
                </button>
                <button
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {isFullscreen ? "退出全屏" : "全屏校验"}
                </button>
              </div>
            </div>

            {!isFullscreen ? renderDetailWorkspace(false) : null}

            {isFullscreen ? (
              <div className="fixed inset-3 z-50 overflow-auto rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-slate-800">全屏校验模式</p>
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    退出全屏
                  </button>
                </div>
                {renderDetailWorkspace(true)}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
