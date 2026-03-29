import { Search, SlidersHorizontal, BookOpen } from "lucide-react";

const mockQuestions = [
  {
    id: 1,
    type: "essay",
    difficulty: 75,
    content:
      "设函数 f(x) = sin(x + π/6) + cos(x - π/6)，求其最小正周期及在 [0, π/2] 上的最大值和最小值。",
    tags: ["三角函数", "最值"],
  },
  {
    id: 2,
    type: "choice",
    difficulty: 45,
    content:
      "已知等差数列 {aₙ} 满足 a₁ = 2，公差 d = 3，则前 10 项之和 S₁₀ = （ ）",
    tags: ["数列", "等差数列"],
  },
  {
    id: 3,
    type: "fill",
    difficulty: 55,
    content:
      "曲线 y = x³ − 3x 在点 (1, −2) 处的切线方程为 ________。",
    tags: ["导数", "切线方程"],
  },
  {
    id: 4,
    type: "essay",
    difficulty: 88,
    content:
      "在直角坐标系中，椭圆 C: x²/4 + y² = 1，直线 l: y = kx + 1 与椭圆 C 相交于 A、B 两点，求 |AB| 的取值范围。",
    tags: ["解析几何", "椭圆", "弦长"],
  },
  {
    id: 5,
    type: "choice",
    difficulty: 30,
    content:
      "下列关于虚数的说法正确的是：( A ) 虚数的模为负数 ( B ) 两个复数之积一定是复数 ( C ) 纯虚数的实部为 0 ( D ) 以上均错。",
    tags: ["复数", "基础概念"],
  },
  {
    id: 6,
    type: "fill",
    difficulty: 62,
    content:
      "已知向量 a⃗ = (1, 2)，b⃗ = (3, −1)，则 |a⃗ + b⃗| = ________。",
    tags: ["向量", "模长"],
  },
  {
    id: 7,
    type: "essay",
    difficulty: 80,
    content:
      "一个袋子中有 3 个红球和 2 个白球，每次随机取一个球后放回，连续取 4 次，恰好取到 2 个红球的概率是多少？",
    tags: ["概率统计", "二项分布"],
  },
  {
    id: 8,
    type: "choice",
    difficulty: 50,
    content:
      "不等式 |x − 2| + |x + 1| ≥ 5 的解集为（ ）A. x ≤ −2 或 x ≥ 3  B. −2 ≤ x ≤ 3  C. x ≤ −1 或 x ≥ 4  D. 以上均不正确。",
    tags: ["不等式", "绝对值"],
  },
];

const typeConfig: Record<
  string,
  { label: string; className: string }
> = {
  choice: {
    label: "选择题",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  fill: {
    label: "填空题",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  judge: {
    label: "判断题",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  essay: {
    label: "解答题",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

function DifficultyBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-rose-400"
      : value >= 45
      ? "bg-amber-400"
      : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-400 w-6 text-right">
        {value}
      </span>
    </div>
  );
}

export default function BankPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">活水题库</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            共 {mockQuestions.length} 道题目已入库
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-8 py-3.5 bg-white border-b border-slate-200">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索题目内容…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition appearance-none cursor-pointer">
            <option value="">全部题型</option>
            <option value="choice">选择题</option>
            <option value="fill">填空题</option>
            <option value="judge">判断题</option>
            <option value="essay">解答题</option>
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

        {/* Difficulty filter */}
        <div className="relative">
          <select className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition appearance-none cursor-pointer">
            <option value="">全部难度</option>
            <option value="easy">基础（0 – 44）</option>
            <option value="medium">中等（45 – 69）</option>
            <option value="hard">困难（70 – 100）</option>
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

        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
          <SlidersHorizontal className="h-4 w-4" />
          更多筛选
        </button>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="grid grid-cols-2 gap-4">
          {mockQuestions.map((q) => {
            const type = typeConfig[q.type] ?? typeConfig.essay;
            return (
              <div
                key={q.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
              >
                {/* Card header */}
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${type.className}`}
                  >
                    {type.label}
                  </span>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    #{q.id}
                  </span>
                </div>

                {/* Content */}
                <div className="flex items-start gap-2.5">
                  <BookOpen className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                    {q.content}
                  </p>
                </div>

                {/* Difficulty bar */}
                <DifficultyBar value={q.difficulty} />

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {q.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
