import { Upload, FileImage, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const mockPapers = [
  {
    id: 1,
    title: "2024 高考数学全国卷 I",
    year: 2024,
    pages: 8,
    status: "done",
  },
  {
    id: 2,
    title: "2024 高考数学全国卷 II",
    year: 2024,
    pages: 7,
    status: "processing",
  },
  {
    id: 3,
    title: "2023 高考数学北京卷",
    year: 2023,
    pages: 9,
    status: "done",
  },
  {
    id: 4,
    title: "2023 高考数学上海卷",
    year: 2023,
    pages: 6,
    status: "pending",
  },
  {
    id: 5,
    title: "2022 高考数学全国甲卷",
    year: 2022,
    pages: 8,
    status: "done",
  },
  {
    id: 6,
    title: "2022 高考数学全国乙卷",
    year: 2022,
    pages: 8,
    status: "pending",
  },
];

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
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors shadow-sm">
          <Upload className="h-4 w-4" />
          上传试卷
        </button>
      </div>

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
              {mockPapers.map((paper) => {
                const status =
                  statusConfig[paper.status as keyof typeof statusConfig];
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
                      {paper.pages} 页
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
              })}
            </tbody>
          </table>
        </div>

        {/* Footer row */}
        <p className="text-xs text-slate-400 mt-3 px-1">
          共 {mockPapers.length} 份试卷
        </p>
      </div>
    </div>
  );
}
