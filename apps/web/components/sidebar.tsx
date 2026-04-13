"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  Users,
  Mail,
  BarChart3,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/map", icon: Map, label: "Map" },
  { href: "/leads", icon: Users, label: "Leads" },
  { href: "/outreach", icon: Mail, label: "Outreach" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex w-16 flex-col items-center bg-brand-navy-900 py-4">
      {/* Logo */}
      <div className="mb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-teal text-xs font-bold tracking-wider text-brand-navy-900">
          R
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                isActive
                  ? "bg-brand-teal/10 text-brand-teal"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full ml-2 rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <Link
        href="/settings"
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          pathname === "/settings"
            ? "text-brand-teal"
            : "text-slate-500 hover:text-slate-300"
        }`}
      >
        <Settings className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}
