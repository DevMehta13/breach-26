"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      const data = await api<{ url: string }>("/api/auth/google/url");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start Google login");
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel — warm editorial branding */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-sidebar lg:flex">
        {/* Subtle dot grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(212,201,187,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Warm glow */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-terra/10 to-transparent" />

        <div className="relative z-10 max-w-md px-12">
          {/* Logo mark */}
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-terra">
              <span className="font-[family-name:var(--font-display)] text-lg font-bold text-terra-foreground">R</span>
            </div>
          </div>

          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.15] tracking-tight text-sidebar-primary">
            Recruit smarter,<br />
            <span className="terra-accent">not harder.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-sidebar-foreground/80">
            Ingest resumes, deduplicate candidates, and find perfect matches — all powered by semantic AI.
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-wrap gap-2">
            {["LangGraph Pipeline", "pgvector Search", "Gemini AI"].map((f) => (
              <span
                key={f}
                className="rounded-full border border-sidebar-border px-3 py-1 text-[11px] font-medium text-sidebar-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-4 lg:w-1/2 glass-mesh">
        <div className="w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-terra">
              <span className="font-[family-name:var(--font-display)] text-sm font-bold text-terra-foreground">R</span>
            </div>
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              RecruitAI
            </span>
          </div>

          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to continue to your dashboard
          </p>

          {/* Google */}
          <Button
            variant="outline"
            className="mt-6 w-full gap-2.5 rounded-lg border-white/40 bg-white/40 py-5 text-sm font-medium backdrop-blur-sm transition-all hover:bg-white/60 hover:shadow-sm"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
          >
            {googleLoading ? (
              "Redirecting..."
            ) : (
              <>
                <svg className="size-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-foreground/85">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-lg border-white/40 bg-white/40 py-5 backdrop-blur-sm transition-all focus:border-terra/40 focus:bg-white/60 focus:ring-2 focus:ring-terra/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-foreground/85">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-lg border-white/40 bg-white/40 py-5 backdrop-blur-sm transition-all focus:border-terra/40 focus:bg-white/60 focus:ring-2 focus:ring-terra/10"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              className="terra-bg mt-1 w-full gap-2 rounded-lg border-0 py-5 text-sm font-medium shadow-md shadow-[#C4553A]/15 transition-all hover:shadow-lg hover:shadow-[#C4553A]/25"
              disabled={loading || googleLoading}
            >
              {loading ? "Signing in..." : (
                <>
                  Sign in
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
