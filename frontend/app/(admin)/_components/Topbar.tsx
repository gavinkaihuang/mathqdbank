// app/(admin)/_components/Topbar.tsx
// 顶部信息栏（Server Component）
import { Bell, Search } from "lucide-react";

export default function Topbar() {
  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-6 bg-white border-b border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 左侧：全局搜索框 */}
      <div className="relative w-72 hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="搜索卷名、题目关键词…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition"
        />
      </div>

      {/* 右侧：操作区 */}
      <div className="flex items-center gap-3 ml-auto">
        {/* 通知铃 */}
        <button
          type="button"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
        >
          <Bell className="h-4.5 w-4.5" />
          {/* 小红点 */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
        </button>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-slate-200" />

        {/* 用户头像 + 名字 */}
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <span className="text-sm font-medium text-slate-700 hidden sm:block group-hover:text-slate-900 transition-colors">
            Admin
          </span>
        </div>
      </div>
    </header>
  );
}
