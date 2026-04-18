"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Reminder: install markdown/math rendering deps:
// npm install react-markdown remark-math rehype-katex

type Props = {
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
};

export default function QuestionStemEditorPanel({ value, disabled, onChange }: Props) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800">题干 LaTeX</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        disabled={disabled}
        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
        placeholder="例如：$$\\int_0^{\\pi} \\sin(x) dx = ?$$"
      />

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500">
          👁️ 实时预览
        </div>
        <div className="prose prose-sm max-w-none text-slate-800">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {value?.trim() || "_请输入题干内容进行预览_"}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
