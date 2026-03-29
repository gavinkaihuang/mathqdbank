"use client";

import { useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Tag, X, ImageOff } from "lucide-react";

const mockQuestion = {
  id: 42,
  paper: "2024 高考数学全国卷 I",
  latex:
    "设函数 $f(x) = \\sin(x + \\frac{\\pi}{6}) + \\cos(x - \\frac{\\pi}{6})$\n\n(1) 求 $f(x)$ 的最小正周期；\n\n(2) 求 $f(x)$ 在区间 $\\left[0, \\frac{\\pi}{2}\\right]$ 上的最大值和最小值。",
  type: "essay",
  difficulty: 60,
  tags: ["三角函数", "最值"],
};

const questionTypes = [
  { value: "choice", label: "选择题" },
  { value: "fill", label: "填空题" },
  { value: "judge", label: "判断题" },
  { value: "essay", label: "解答题" },
];

const suggestedTags = [
  "三角函数",
  "导数",
  "数列",
  "概率统计",
  "解析几何",
  "向量",
  "最值",
  "不等式",
  "极限",
  "复数",
];

export default function ReviewPage() {
  const [latex, setLatex] = useState(mockQuestion.latex);
  const [type, setType] = useState(mockQuestion.type);
  const [difficulty, setDifficulty] = useState(mockQuestion.difficulty);
  const [tags, setTags] = useState<string[]>(mockQuestion.tags);

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) setTags([...tags, tag]);
  };

  const removeTag = (tag: string) =>
    setTags(tags.filter((t) => t !== tag));

  const difficultyLabel =
    difficulty >= 70 ? "困难" : difficulty >= 45 ? "中等" : "基础";
  const difficultyColor =
    difficulty >= 70
      ? "text-rose-600"
      : difficulty >= 45
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">AI 校验台</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            题目 #{mockQuestion.id} · {mockQuestion.paper}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            <ChevronLeft className="h-4 w-4" />
            上一题
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            下一题
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Left: image preview — 40% */}
        <div className="w-2/5 shrink-0 border-r border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-8 gap-4">
          <div className="w-full max-w-xs aspect-[3/4] rounded-xl bg-slate-200 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-3 shadow-inner">
            <div className="w-12 h-12 rounded-full bg-slate-300 flex items-center justify-center">
              <ImageOff className="h-5 w-5 text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-500">题目原图</p>
            <p className="text-xs text-slate-400">第 3 页 / 共 8 页</p>
          </div>
          {/* Page indicator dots */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`rounded-full transition-all ${
                  i === 3
                    ? "w-4 h-2 bg-slate-600"
                    : "w-2 h-2 bg-slate-300"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Right: edit panel — 60% */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto px-8 py-6 space-y-6">
            {/* LaTeX source */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                LaTeX 源码
              </label>
              <textarea
                value={latex}
                onChange={(e) => setLatex(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full font-mono text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition leading-relaxed"
              />
            </div>

            {/* Type + Difficulty row */}
            <div className="flex items-start gap-8">
              {/* Question type */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  题型
                </label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-40 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition appearance-none cursor-pointer"
                  >
                    {questionTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
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

              {/* Difficulty slider */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    难度
                  </label>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-slate-800">
                      {difficulty}
                    </span>
                    <span className={`text-xs font-medium ${difficultyColor}`}>
                      {difficultyLabel}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-slate-800"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                  <span>基础</span>
                  <span>中等</span>
                  <span>困难</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                知识标签
              </label>
              {/* Selected tags */}
              <div className="flex flex-wrap gap-2 p-3 min-h-12 bg-slate-50 border border-slate-200 rounded-lg mb-2">
                {tags.length === 0 && (
                  <span className="text-xs text-slate-400 self-center">
                    点击下方添加标签…
                  </span>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-slate-800 text-white text-xs rounded-full font-medium"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-slate-300 transition-colors"
                      aria-label={`移除 ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              {/* Suggested tags */}
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags
                  .filter((t) => !tags.includes(t))
                  .map((tag) => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-200 bg-white text-xs text-slate-600 rounded-full hover:border-slate-400 hover:text-slate-800 transition-colors"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="px-8 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
            <button className="text-sm text-slate-500 hover:text-rose-600 font-medium transition-colors">
              标记问题
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors shadow-sm">
              <CheckCheck className="h-4 w-4" />
              批准入库
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
