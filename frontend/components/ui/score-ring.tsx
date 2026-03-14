"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function ScoreRing({ score, size = 52, strokeWidth = 4, className = "", label }: ScoreRingProps) {
  const [mounted, setMounted] = useState(false);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  useEffect(() => setMounted(true), []);

  // Terracotta-to-sage gradient based on score
  const color =
    score >= 80 ? "var(--sage)" :
    score >= 60 ? "#8B7355" :
    score >= 40 ? "var(--terra)" : "var(--destructive)";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border"
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#score-ring-${score})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={mounted ? offset : circumference}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id={`score-ring-${score}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--terra)" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold tabular-nums terra-accent">{score}%</span>
        {label && <span className="text-[8px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
