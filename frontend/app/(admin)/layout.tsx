// app/(admin)/layout.tsx
// 后台统一布局 —— 左侧固定 Sidebar + 顶部 Topbar
// 侧边栏组件抽离到 app/(admin)/_components/Sidebar.tsx

import Sidebar from "./_components/Sidebar";
import Topbar from "./_components/Topbar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 font-sans antialiased">
      {/* 左侧固定导航栏 */}
      <Sidebar />

      {/* 右侧主区域 */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 顶栏 */}
        <Topbar />

        {/* 页面内容滚动区域 */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
