import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  needs_review: "bg-rose-50 text-rose-700 ring-rose-200/60",
  pending: "bg-stone-50 text-stone-600 ring-stone-200/60",
  ingested: "bg-sky-50 text-sky-700 ring-sky-200/60",
  pending_review: "bg-amber-50 text-amber-700 ring-amber-200/60",
  merged: "bg-violet-50 text-violet-700 ring-violet-200/60",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset",
        style,
        className
      )}
    >
      <span className={cn(
        "mr-1.5 size-1.5 rounded-full",
        status === "completed" && "bg-emerald-500",
        status === "needs_review" && "bg-rose-500",
        status === "pending" && "bg-stone-400",
        status === "ingested" && "bg-sky-500",
        status === "pending_review" && "bg-amber-500",
        status === "merged" && "bg-violet-500",
      )} />
      {label}
    </span>
  );
}
