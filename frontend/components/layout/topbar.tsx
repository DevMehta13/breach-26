"use client";

import { useAuth } from "@/providers/auth-provider";
import { useWebSocket } from "@/providers/websocket-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Command } from "lucide-react";

export function Topbar() {
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/30 bg-[rgba(245,240,235,0.5)] px-6 backdrop-blur-xl shadow-[inset_0_-1px_0_rgba(255,255,255,0.3)] dark:bg-[rgba(26,26,24,0.5)] dark:border-white/[0.06]">
      {/* Left: Cmd+K hint */}
      <button
        onClick={() => {
          const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
          document.dispatchEvent(event);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/30 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/50 hover:shadow-sm"
      >
        <Command className="size-3" />
        <span>Search...</span>
        <kbd className="ml-2 rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Right: Status + User */}
      <div className="flex items-center gap-4">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${
              isConnected
                ? "bg-sage shadow-[0_0_6px_rgba(90,124,101,0.4)]"
                : "bg-destructive shadow-[0_0_6px_rgba(179,58,58,0.4)]"
            }`}
          />
          <span className="text-[11px] font-medium text-muted-foreground">
            {isConnected ? "Live" : "Offline"}
          </span>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* User */}
        <div className="flex items-center gap-2.5">
          <Avatar className="size-7 ring-1 ring-border">
            <AvatarFallback className="bg-secondary text-[10px] font-semibold text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{user?.full_name ?? "User"}</span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={logout}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
