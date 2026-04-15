"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save,
  RotateCcw,
  FlaskConical,
  BadgeInfo,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Trash2,
} from "lucide-react";

interface LlmPrompt {
  id: number | "new";
  name: string;
  description: string;
  version: string;
  content: string;
  model_routing_key: string;
  is_active: boolean;
  updated_at: string;
}

type FormState = Omit<LlmPrompt, "id" | "updated_at">;

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  version: "v1.0",
  content: "# Role\n你是一个...\n\n# Input\n- data: {{input_data}}\n\n# Output\n请输出 JSON",
  model_routing_key: "tier_flash",
  is_active: false,
};

function bumpPatchVersion(version: string): string {
  const m = /^v(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return version;
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

export default function PromptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";

  const [source, setSource] = useState<FormState>(EMPTY_FORM);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [savedAt, setSavedAt] = useState<string>("-");
  const [promptId, setPromptId] = useState<number | null>(null);

  const [loadingState, setLoadingState] = useState<"idle" | "loading" | "error">(
    isNew ? "idle" : "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const placeholders = useMemo(() => {
    const found = form.content.match(/{{\s*[\w.]+\s*}}/g) ?? [];
    return Array.from(new Set(found));
  }, [form.content]);

  const dirty = useMemo(
    () =>
      (Object.keys(source) as Array<keyof FormState>).some(
        (k) => form[k] !== source[k],
      ),
    [form, source],
  );

  const applyResponse = useCallback(
    (data: LlmPrompt) => {
      const fields: FormState = {
        name: data.name,
        description: data.description,
        version: data.version,
        content: data.content,
        model_routing_key: data.model_routing_key,
        is_active: data.is_active,
      };
      setSource(fields);
      setForm(fields);
      setSavedAt(
        data.updated_at
          ? new Date(data.updated_at).toLocaleString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "-",
      );
      if (typeof data.id === "number") setPromptId(data.id);
    },
    [],
  );

  useEffect(() => {
    if (isNew) return;
    setLoadingState("loading");
    fetch(`/api/prompts/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: LlmPrompt) => {
        applyResponse(data);
        setLoadingState("idle");
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "加载失败");
        setLoadingState("error");
      });
  }, [isNew, params.id, applyResponse]);

  const handleSave = async () => {
    // ── 前端必填校验 ──────────────────────────────────────────
    setNameError(null);
    setSaveError(null);
    if (!form.name.trim()) {
      setNameError("提示词名称不能为空");
      return;
    }

    setSaving(true);
    try {
      const nextVersion = isNew ? form.version : bumpPatchVersion(form.version);
      const body = { ...form, name: form.name.trim(), version: nextVersion };

      let res: Response;
      if (isNew) {
        res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/prompts/${promptId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Pydantic 422 的 detail 可能是数组，也可能是字符串
        const raw = (errData as { detail?: unknown }).detail;
        const message =
          typeof raw === "string"
            ? raw
            : Array.isArray(raw)
            ? (raw as Array<{ msg?: string; loc?: unknown[] }>)
                .map((e) => `${(e.loc ?? []).slice(-1)[0] ?? "field"}: ${e.msg ?? "invalid"}`)
                .join(" | ")
            : `HTTP ${res.status}`;
        throw new Error(message);
      }

      const saved: LlmPrompt = await res.json();
      applyResponse(saved);

      if (isNew) {
        router.replace(`/prompts/${saved.id}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!promptId) return;
    if (!confirm(`确认删除提示词「${form.name}」？此操作不可撤销。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/prompts/${promptId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/prompts");
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const set = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));

  if (loadingState === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  if (loadingState === "error") {
    return (
      <div className="p-6 flex items-center gap-2 text-rose-600">
        <AlertCircle className="h-5 w-5" />
        {loadError ?? "加载失败"}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-5">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => router.push("/prompts")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回提示词列表
        </button>

        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-sm hover:bg-rose-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              删除
            </button>
          )}

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs text-slate-500">
            <BadgeInfo className="h-3.5 w-3.5" />
            最后保存: {savedAt}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* 主体双栏 */}
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5">
        {/* 左侧：信息 + 编辑器 */}
        <section className="2xl:col-span-8 space-y-4">
          {/* 基础信息 */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-4">
            <h1 className="text-lg font-bold text-slate-800">
              {isNew ? "新建提示词" : "提示词工作台"}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">名称 *</span>
                <input
                  value={form.name}
                  onChange={(e) => {
                    setNameError(null);
                    setForm((p) => ({ ...p, name: e.target.value }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 transition ${
                    nameError
                      ? "border-rose-400 focus:ring-rose-200 bg-rose-50"
                      : "border-slate-200 focus:ring-cyan-200"
                  }`}
                  placeholder="例如：标准 OCR 提取"
                />
                {nameError && (
                  <p className="text-xs text-rose-600 mt-0.5 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {nameError}
                  </p>
                )}
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">模型路由键</span>
                <select
                  value={form.model_routing_key}
                  onChange={set("model_routing_key")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="tier_flash">tier_flash</option>
                  <option value="tier_pro">tier_pro</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="md:col-span-2 space-y-1.5">
                <span className="text-xs font-medium text-slate-500">描述</span>
                <input
                  value={form.description}
                  onChange={set("description")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="描述该 Prompt 的用途"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">版本号</span>
                <input
                  value={form.version}
                  onChange={set("version")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="v1.0"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm((p) => ({ ...p, is_active: e.target.checked }))
                }
                className="rounded border-slate-300 accent-cyan-500 h-4 w-4"
              />
              <span className="text-sm text-slate-600">启用该提示词（is_active）</span>
            </label>
          </div>

          {/* 编辑器 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl shadow-slate-900/20 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <FlaskConical className="h-3.5 w-3.5 text-cyan-300" />
                System Prompt Editor
              </div>
              <span className="text-[11px] text-cyan-300 font-mono">
                {form.name || "untitled"}
              </span>
            </div>
            <textarea
              value={form.content}
              onChange={set("content")}
              className="w-full min-h-[460px] resize-y bg-transparent px-4 py-4 text-sm leading-6 font-mono outline-none placeholder:text-slate-500"
              placeholder={"# Role\n你是一个..."}
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setForm(source)}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              放弃修改
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isNew ? "创建" : "保存新版本"}
            </button>
          </div>
        </section>

        {/* 右侧：预览 + 变量说明 */}
        <aside className="2xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">渲染预览</h2>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 max-h-[480px] overflow-auto">
              <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700 font-mono">
                {form.content}
              </pre>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <h3 className="text-sm font-semibold text-cyan-800 mb-2">变量说明</h3>
            {placeholders.length === 0 ? (
              <p className="text-xs text-cyan-700">
                当前提示词未检测到变量占位符
              </p>
            ) : (
              <ul className="space-y-1.5">
                {placeholders.map((token) => (
                  <li
                    key={token}
                    className="text-xs text-cyan-900 font-mono bg-white rounded px-2 py-1 border border-cyan-200"
                  >
                    {token}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-cyan-700 mt-3 leading-5">
              推荐占位符: {`{{image_data}}`}, {`{{paper_meta}}`},{" "}
              {`{{raw_text}}`}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

