// app/(admin)/_components/Sidebar.tsx
// 左侧固定侧边栏（Client Component，因为需要 usePathname 判断激活状态）
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  ClipboardCheck,
  Database,
  FileText,
  GraduationCap,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
};

type NavSection = {
  sectionLabel: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    sectionLabel: "概览",
    items: [
      {
        href: "/dashboard",
        label: "仪表盘",
        sublabel: "Dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    sectionLabel: "原卷入库",
    items: [
      {
        href: "/raw-papers",
        label: "原卷管理",
        sublabel: "Raw Papers",
        icon: FileStack,
      },
    ],
  },
  {
    sectionLabel: "题库工作台",
    items: [
      {
        href: "/admin/papers",
        label: "试卷控制台",
        sublabel: "Paper Console",
        icon: FileText,
      },
      {
        href: "/admin/review",
        label: "AI 校验台",
        sublabel: "AI Review",
        icon: ClipboardCheck,
      },
      {
        href: "/admin/bank",
        label: "活水题库",
        sublabel: "Question Bank",
        icon: Database,
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-slate-100 shadow-sm z-10">
      {/* ── Brand ── */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
          <GraduationCap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 leading-none tracking-tight">
            MathQBank
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
            教研中台管理系统
          </p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.sectionLabel} className="mb-4">
            {/* Section Label */}
            <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              {section.sectionLabel}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, sublabel, icon: Icon }) => {
                const active =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                      ${
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                      }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors
                        ${active ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`}
                    />
                    <span className="flex-1 leading-none">
                      {label}
                      {sublabel && (
                        <span
                          className={`block text-[10px] mt-0.5 font-normal ${
                            active ? "text-slate-300" : "text-slate-400"
                          }`}
                        >
                          {sublabel}
                        </span>
                      )}
                    </span>
                    {active && (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">A</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 truncate">
              Admin User
            </p>
            <p className="text-[10px] text-slate-400">超级管理员</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
