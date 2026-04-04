"use client";

import { useEffect, useState } from "react";
import { Upload, FileImage, CheckCircle2, Clock, AlertCircle, Loader2, X } from "lucide-react";

type RawPaper = {
  id: number;
  title: string;
  year: number;
  paper_type?: string | null;
  page_urls: string[];
  status: string;
};

const statusConfig = {
  done: {
    label: "已入库",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  processing: {
    label: "解析中",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Clock,
  },
  pending: {
    label: "待处理",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: AlertCircle,
  },
};

export default function PapersPage() {
  const [papers, setPapers] = useState<RawPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [paperType, setPaperType] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function fetchPapers() {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/raw-papers", { method: "GET" });
      if (!response.ok) {
        throw new Error("获取试卷列表失败");
      }
      const data = (await response.json()) as { items?: RawPaper[] };
      setPapers(data.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取试卷列表失败";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPapers();
  }, []);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!title.trim()) {
      setErrorMessage("请输入试卷标题");
      return;
    }
    if (!year || Number.isNaN(year)) {
      setErrorMessage("请输入正确年份");
      return;
    }
    if (files.length === 0) {
      setErrorMessage("请至少选择一张试卷图片");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("year", String(year));
    if (paperType.trim()) {
      formData.append("paper_type", paperType.trim());
    }
    files.forEach((file) => formData.append("files", file));

    setUploading(true);
    try {
      const response = await fetch("/api/raw-papers/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(errorBody?.detail ?? "上传失败，请稍后重试");
      }

      const created = (await response.json()) as RawPaper;
      setPapers((current) => [created, ...current]);
      setTitle("");
      setPaperType("");
      setFiles([]);
      setShowUploadPanel(false);
      setSuccessMessage(`上传成功，试卷ID: ${created.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败，请稍后重试";
      setErrorMessage(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">试卷控制台</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            管理所有已上传的原始试卷
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowUploadPanel((prev) => !prev);
            setErrorMessage("");
            setSuccessMessage("");
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" />
          上传试卷
        </button>
      </div>

      {showUploadPanel ? (
        <div className="px-8 py-5 border-b border-slate-200 bg-white">
          <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">试卷标题</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="例如：2024 高考数学全国卷 I"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">年份</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">试卷类型（可选）</label>
              <input
                value={paperType}
                onChange={(event) => setPaperType(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                placeholder="national / provincial"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">试卷图片（可多选）</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  setFiles(selected);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
              />
              {files.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span
                      key={`${file.name}-${file.lastModified}`}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                    >
                      <FileImage className="h-3 w-3" />
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="md:col-span-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "上传中..." : "开始上传"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUploadPanel(false);
                  setErrorMessage("");
                }}
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
                取消
              </button>
              {successMessage ? <span className="text-sm text-emerald-600">{successMessage}</span> : null}
              {errorMessage ? <span className="text-sm text-red-600">{errorMessage}</span> : null}
            </div>
          </form>
        </div>
      ) : null}

      {/* Table area */}
      <div className="flex-1 px-8 py-6 overflow-auto">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  试卷名称
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  年份
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  图片页数
                </th>
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    试卷加载中...
                  </td>
                </tr>
              ) : papers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    暂无试卷，请先上传
                  </td>
                </tr>
              ) : (
                papers.map((paper) => {
                  const status =
                    statusConfig[paper.status as keyof typeof statusConfig] ?? statusConfig.pending;
                const StatusIcon = status.icon;
                return (
                  <tr
                    key={paper.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileImage className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800">
                          {paper.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{paper.year}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {paper.page_urls.length} 页
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.className}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-xs text-slate-500 hover:text-slate-900 font-medium hover:underline transition-colors">
                        查看详情
                      </button>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer row */}
        <p className="text-xs text-slate-400 mt-3 px-1">
          共 {papers.length} 份试卷
        </p>
      </div>
    </div>
  );
}
