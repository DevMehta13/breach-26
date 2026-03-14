import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
          R
        </div>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
