"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import ReactCrop, { PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import { Loader2, Scissors, X } from "lucide-react";
import "react-image-crop/dist/ReactCrop.css";

type RecropResponse = {
  paper_id: number;
  question_id: number;
  problem_number: string;
  image_url: string;
  crop_urls: string[];
};

type Props = {
  open: boolean;
  paperId: string;
  originalUrls: string[];
  initialProblemNumber: string;
  onClose: () => void;
  onSuccess: (result: RecropResponse) => void;
};

function toNormalizedBox(crop: PixelCrop, img: HTMLImageElement): [number, number, number, number] {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;

  const x = crop.x * scaleX;
  const y = crop.y * scaleY;
  const w = crop.width * scaleX;
  const h = crop.height * scaleY;

  const ymin = Math.max(0, Math.min(1000, Math.round((y / img.naturalHeight) * 1000)));
  const xmin = Math.max(0, Math.min(1000, Math.round((x / img.naturalWidth) * 1000)));
  const ymax = Math.max(0, Math.min(1000, Math.round(((y + h) / img.naturalHeight) * 1000)));
  const xmax = Math.max(0, Math.min(1000, Math.round(((x + w) / img.naturalWidth) * 1000)));

  return [ymin, xmin, ymax, xmax];
}

export default function ManualCropModal({
  open,
  paperId,
  originalUrls,
  initialProblemNumber,
  onClose,
  onSuccess,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [problemNumber, setProblemNumber] = useState(initialProblemNumber);
  const [pageIndex, setPageIndex] = useState(0);
  const [crop, setCrop] = useState<PixelCrop>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeOriginalUrl = originalUrls[pageIndex] || originalUrls[0] || "";

  useEffect(() => {
    if (!open) return;
    setPageIndex(0);
    setCrop(undefined);
    setError("");
    setProblemNumber(initialProblemNumber);
  }, [initialProblemNumber, open]);

  const canSubmit = useMemo(() => {
    if (!crop) return false;
    return crop.width > 2 && crop.height > 2 && problemNumber.trim().length > 0;
  }, [crop, problemNumber]);

  if (!open) return null;

  const onImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: "%", width: 35 }, 4 / 3, width, height),
      width,
      height
    );
    setCrop({
      unit: "px",
      x: (initial.x / 100) * width,
      y: (initial.y / 100) * height,
      width: (initial.width / 100) * width,
      height: (initial.height / 100) * height,
    });
  };

  const handleSubmit = async () => {
    if (!imgRef.current || !crop || !canSubmit) return;

    setSaving(true);
    setError("");
    try {
      const box_2d = toNormalizedBox(crop, imgRef.current);
      const response = await fetch(`/api/raw-papers/${paperId}/recrop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_number: problemNumber.trim(),
          box_2d,
          page_index: pageIndex,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | (RecropResponse & { detail?: never })
        | { detail?: unknown };
      if (!response.ok) {
        const detail = typeof (data as { detail?: unknown }).detail === "string"
          ? ((data as { detail?: string }).detail as string)
          : `重切失败 (HTTP ${response.status})`;
        throw new Error(detail);
      }

      onSuccess(data as RecropResponse);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重切失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">手动补切题目</h3>
            <p className="text-xs text-slate-500 mt-0.5">在原卷上框选题目区域并提交重切</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="md:col-span-1">
              <span className="text-xs text-slate-500">题号</span>
              <input
                value={problemNumber}
                onChange={(e) => setProblemNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="例如：12"
              />
            </label>
            <label className="md:col-span-1">
              <span className="text-xs text-slate-500">原卷页码</span>
              <select
                value={pageIndex}
                onChange={(e) => {
                  setPageIndex(Number(e.target.value));
                  setCrop(undefined);
                  setError("");
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                {originalUrls.map((_, idx) => (
                  <option key={idx} value={idx}>
                    第 {idx + 1} 页
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2 text-xs text-slate-500 flex items-end pb-2">
              坐标将自动转换为归一化格式 [ymin, xmin, ymax, xmax]（0-1000）
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 overflow-auto max-h-[60vh]">
            <ReactCrop crop={crop} onChange={(next) => setCrop(next as PixelCrop)}>
              <img
                ref={imgRef}
                src={activeOriginalUrl}
                alt="原卷"
                className="max-w-full h-auto rounded"
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
              {saving ? "提交中..." : "提交重切"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
