"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Search,
  Upload,
  GitCompareArrows,
  List,
  BarChart3,
  Activity,
  Settings,
  Briefcase,
  ArrowLeftRight,
  UserPlus,
} from "lucide-react";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/candidates", label: "Candidates", icon: Users },
      { href: "/search", label: "AI Search", icon: Search, ai: true },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/upload", label: "Upload", icon: Upload },
      { href: "/dedup", label: "Dedup Queue", icon: GitCompareArrows },
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/compare", label: "Compare", icon: ArrowLeftRight },
      { href: "/referrals", label: "Referrals", icon: UserPlus },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/shortlists", label: "Shortlists", icon: List },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/activity", label: "Activity", icon: Activity },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-sidebar">
      {/* Logo — links to landing page */}
      <Link href="/" className="flex h-16 items-center gap-2.5 px-5 transition-opacity hover:opacity-80">
        <div className="flex size-8 items-center justify-center rounded-lg bg-terra text-terra-foreground">
          <span className="font-[family-name:var(--font-display)] text-sm font-bold">R</span>
        </div>
        <span className="font-[family-name:var(--font-display)] text-[17px] tracking-tight text-sidebar-primary">
          RecruitAI
        </span>
      </Link>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mt-6 first:mt-2">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, ai }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-terra" />
                    )}
                    <Icon
                      className={cn(
                        "size-[15px] shrink-0 transition-colors",
                        active ? "text-terra" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground"
                      )}
                    />
                    <span>{label}</span>
                    {ai && (
                      <span className="ml-auto rounded bg-terra/15 px-1.5 py-px text-[9px] font-semibold text-terra">
                        AI
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom settings */}
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200",
            pathname === "/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings className="size-[15px] shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
