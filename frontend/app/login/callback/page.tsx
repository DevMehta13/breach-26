"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, loginWithGoogle, linkGoogle } = useAuth();
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Google login denied: ${errorParam}`);
      setProcessing(false);
      return;
    }

    if (!code) {
      setError("No authorization code received from Google.");
      setProcessing(false);
      return;
    }

    // Use a ref-like flag to prevent double execution.
    // Check localStorage directly (not the `token` state) to decide
    // if this is a linking flow, so the effect doesn't re-run when
    // loginWithGoogle updates token state.
    let cancelled = false;
    const existingToken = localStorage.getItem("token");

    if (existingToken) {
      // User is already logged in — this is an account linking flow
      linkGoogle(code)
        .then(() => {
          if (!cancelled) router.push("/upload");
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to link Google account");
            setProcessing(false);
          }
        });
    } else {
      // No existing session — normal login/signup
      loginWithGoogle(code)
        .then(() => {
          if (!cancelled) router.push("/");
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Google login failed");
            setProcessing(false);
          }
        });
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isLinking = !!token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg text-center">
            {processing
              ? isLinking
                ? "Linking Google account..."
                : "Signing you in..."
              : "Error"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {processing ? (
            <div className="flex flex-col items-center gap-3">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                {isLinking
                  ? "Connecting your Google account for Gmail sync..."
                  : "Completing Google sign-in..."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => router.push(isLinking ? "/upload" : "/login")}
                className="text-sm text-primary underline hover:no-underline"
              >
                {isLinking ? "Back to Upload" : "Back to login"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
