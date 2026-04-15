// app/admin/layout.tsx
// 复用 (admin) 统一布局 —— 让 /admin/* 路由也使用同一套侧边栏
import Sidebar from "@/app/(admin)/_components/Sidebar";
import Topbar from "@/app/(admin)/_components/Topbar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 font-sans antialiased">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
