// app/(admin)/raw-papers/upload/page.tsx
// 原卷上传页（Client Component）—— 包含可拖拽 Dropzone + 表单 + 模拟上传
"use client";

import { useState, useRef, useCallback, type DragEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CloudUpload,
  FileImage,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ── 年级选项 ───────────────────────────────────────────────
const GRADE_OPTIONS = [
  "小学一年级",
  "小学二年级",
  "小学三年级",
  "小学四年级",
  "小学五年级",
  "小学六年级",
  "初一",
  "初二",
  "初三",
  "高一",
  "高二",
  "高三",
];

// ── 格式化文件大小 ─────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── 文件类型图标 ───────────────────────────────────────────
function FileTypeIcon({ name }: { name: string }) {
  const isPdf = name.toLowerCase().endsWith(".pdf");
  return isPdf ? (
    <FileText className="h-5 w-5 text-red-400 shrink-0" />
  ) : (
    <FileImage className="h-5 w-5 text-sky-400 shrink-0" />
  );
}

type UploadState = "idle" | "loading" | "success" | "error";

// ── 主页面组件 ─────────────────────────────────────────────
export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 接受的文件类型
  const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  // ── 文件校验 & 添加 ────────────────────────────────────
  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => ACCEPTED.includes(f.type));
    const invalid = incoming.length - valid.length;
    if (invalid > 0) {
      setErrorMsg(`已忽略 ${invalid} 个不支持的文件类型（仅支持 JPG / PNG / PDF）`);
    } else {
      setErrorMsg("");
    }
    setFiles((prev) => {
      // 去重（按名称+大小）
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const unique = valid.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...unique];
    });
  }, []);

  // ── Drag & Drop 处理 ───────────────────────────────────
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  // ── 移除单个文件 ────────────────────────────────────────
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── 表单提交 ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg("");

    // 简单校验
    if (!title.trim()) {
      setErrorMsg("请填写试卷名称");
      return;
    }
    if (!grade) {
      setErrorMsg("请选择适用年级");
      return;
    }
    if (files.length === 0) {
      setErrorMsg("请至少上传一个文件");
      return;
    }

    setUploadState("loading");

    // 模拟异步上传（1.5s 延迟）
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const payload = {
      title: title.trim(),
      grade,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
    };

    console.log("[MathQBank] 上传表单数据:", payload);

    setUploadState("success");
  };

  // ── 成功状态 ─────────────────────────────────────────────
  if (uploadState === "success") {
    return (
      <div className="flex flex-col h-full">
        <PageHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              上传任务已提交！
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              系统正在后台处理试卷，你可以在列表页查看进度。
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/raw-papers"
                className="px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={() => {
                  setTitle("");
                  setGrade("");
                  setFiles([]);
                  setUploadState("idle");
                }}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                继续上传
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader />

      {/* ── 表单区域 ── */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-6"
        >
          {/* ── 试卷名称 ── */}
          <div>
            <label
              htmlFor="paper-title"
              className="block text-sm font-semibold text-slate-700 mb-1.5"
            >
              试卷名称
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              id="paper-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：2024 年高考数学全国甲卷"
              className="w-full px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl placeholder:text-slate-400 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10 transition"
            />
          </div>

          {/* ── 适用年级 ── */}
          <div>
            <label
              htmlFor="paper-grade"
              className="block text-sm font-semibold text-slate-700 mb-1.5"
            >
              适用年级
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="relative">
              <select
                id="paper-grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full appearance-none px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10 transition"
              >
                <option value="">请选择年级</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {/* 下拉箭头 */}
              <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center">
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* ── 文件上传 Dropzone ── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              上传文件
              <span className="text-red-400 ml-0.5">*</span>
              <span className="text-xs font-normal text-slate-400 ml-2">
                支持 JPG / PNG / PDF
              </span>
            </label>

            {/* Dropzone 区域 */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200
                ${
                  dragOver
                    ? "border-slate-900 bg-slate-900/5 scale-[1.01]"
                    : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/60"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                multiple
                className="hidden"
                onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
              />

              {/* 图标 */}
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors
                  ${dragOver ? "bg-slate-900" : "bg-white border border-slate-200"}`}
              >
                <CloudUpload
                  className={`h-6 w-6 transition-colors ${
                    dragOver ? "text-white" : "text-slate-400"
                  }`}
                />
              </div>

              <p className="text-sm font-medium text-slate-700">
                {dragOver
                  ? "松开鼠标以上传"
                  : "拖拽文件到此处，或点击选择文件"}
              </p>
              <p className="text-xs text-slate-400 mt-1.5">
                支持多文件批量上传 · 单文件最大 50 MB
              </p>
            </div>

            {/* 已选文件列表 */}
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl group"
                  >
                    <FileTypeIcon name={file.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── 错误提示 ── */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {errorMsg}
            </div>
          )}

          {/* ── 提交按钮 ── */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={uploadState === "loading"}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {uploadState === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              {uploadState === "loading" ? "上传中…" : "确认上传"}
            </button>

            <Link
              href="/raw-papers"
              className="px-4 py-2.5 border border-slate-200 text-slate-500 text-sm font-medium rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              取消
            </Link>

            {files.length > 0 && uploadState !== "loading" && (
              <span className="text-xs text-slate-400">
                已选 {files.length} 个文件
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 可复用的页面标题栏 ─────────────────────────────────────
function PageHeader() {
  return (
    <div className="flex items-center gap-4 px-8 py-6 bg-white border-b border-slate-100">
      <Link
        href="/raw-papers"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">上传新试卷</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          填写元数据并上传试卷文件以完成入库
        </p>
      </div>
    </div>
  );
}
