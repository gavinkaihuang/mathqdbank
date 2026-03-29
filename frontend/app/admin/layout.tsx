"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ClipboardCheck, Database } from "lucide-react";

const navItems = [
  { href: "/admin/papers", label: "试卷控制台", icon: FileText },
  { href: "/admin/review", label: "AI 校验台", icon: ClipboardCheck },
  { href: "/admin/bank", label: "活水题库", icon: Database },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-white border-r border-slate-200">
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 gap-2">
          <span className="text-lg font-semibold text-slate-800 tracking-tight">
            MathQBank
          </span>
          <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-slate-700" : "text-slate-400"
                  }`}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200">
          <p className="text-xs text-slate-400">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
