"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import {
  Briefcase,
  Search,
  Users,
  Zap,
  ThumbsUp,
  CheckCircle2,
  ArrowRight,
  Upload,
  BarChart3,
  Shield,
  ChevronRight,
} from "lucide-react";

/* ── Floating pill data for hero section ──────────── */
const HERO_PILLS = [
  { icon: Briefcase, text: "Mid-Level Content Manager", delay: 0.3 },
  { icon: Search, text: "Search Completed in 2 Days", delay: 0.6 },
  { icon: Zap, text: "12 Vetted Candidates Delivered", delay: 0.9 },
  { icon: ThumbsUp, text: "Found Our Match!", delay: 1.2 },
];

/* ── Stats for dark section ───────────────────────── */
const STATS = [
  { value: "92%", label: "of roles matched\nin under 10 days", position: "left-top" },
  { value: "1,500+", label: "hiring managers\ntrust us globally", position: "right-top" },
  { value: "91%", label: "satisfaction rate\non first shortlist", position: "left-bottom" },
  { value: "40+", label: "industries\nwe serve", position: "right-bottom" },
];

/* ── Features section data ────────────────────────── */
const FEATURES = [
  {
    icon: Upload,
    title: "Smart Ingestion",
    description: "Upload resumes in any format. Our AI extracts structured data from PDFs, DOCX, emails, and HRMS exports automatically.",
  },
  {
    icon: Users,
    title: "Auto Deduplication",
    description: "Intelligent matching catches duplicate candidates across sources — by name, email, phone, and semantic similarity.",
  },
  {
    icon: Search,
    title: "Natural Language Search",
    description: "Search like you think. \"Senior React developer in NYC with 5+ years\" just works, powered by pgvector and AI.",
  },
  {
    icon: BarChart3,
    title: "Pipeline Analytics",
    description: "Track candidates, sources, and hiring velocity. Real-time dashboards give you full pipeline visibility.",
  },
  {
    icon: Shield,
    title: "Confidence Scoring",
    description: "Every candidate gets an AI confidence score based on data completeness, skill match, and experience relevance.",
  },
  {
    icon: Zap,
    title: "LangGraph Workflows",
    description: "Powered by LangGraph orchestration with Gemini for parsing and Groq for fast search — production-grade AI pipeline.",
  },
];

/* ── How it works steps ───────────────────────────── */
const STEPS = [
  { number: "01", title: "Upload", description: "Drop resumes, connect HRMS, or forward recruitment emails." },
  { number: "02", title: "AI Processes", description: "LangGraph pipeline extracts data, deduplicates, and embeds candidates." },
  { number: "03", title: "Search & Match", description: "Natural language queries find the best candidates instantly." },
  { number: "04", title: "Hire", description: "Shortlist, compare, and make confident hiring decisions." },
];

export default function LandingPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -60]);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ═══════════════════ NAVBAR ═══════════════════ */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
              <span className="font-[family-name:var(--font-display)] text-sm font-bold text-background">R</span>
            </div>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              RecruitAI
            </span>
          </div>

          <div className="hidden items-center gap-8 text-[13px] font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How It Works</a>
            <a href="#stats" className="transition-colors hover:text-foreground">About</a>
          </div>

          <Link
            href={user ? "/dashboard" : "/login"}
            className="rounded-full border border-foreground/80 px-5 py-1.5 text-[13px] font-medium text-foreground transition-all hover:bg-foreground hover:text-background"
          >
            {user ? "Dashboard" : "Log In"}
          </Link>
        </div>
      </motion.nav>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <motion.section style={{ opacity: heroOpacity, y: heroY }} className="relative">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left — copy */}
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,5vw,4rem)] leading-[1.1] tracking-tight"
              >
                Hire Faster, Smarter,{" "}
                <span className="block">
                  and With{" "}
                  <span className="relative inline-block">
                    Confidence
                    <motion.span
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.6, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-terra"
                    />
                  </span>
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground"
              >
                We deliver pre-vetted candidates in days — not weeks.
                <br />
                No job board clutter. Just great hires, ready to go.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-8 flex items-center gap-4"
              >
                <Link
                  href="/login"
                  className="terra-bg group flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg shadow-[#C4553A]/20 transition-all hover:shadow-xl hover:shadow-[#C4553A]/30"
                >
                  Let&apos;s Find my Match
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#how-it-works"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  See how it works
                </a>
              </motion.div>
            </div>

            {/* Right — floating pills with dashed connector */}
            <div className="relative hidden h-[420px] lg:block">
              {/* Dashed curved path */}
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 500 420"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <motion.path
                  d="M 120 60 C 200 60, 320 100, 340 140 C 360 180, 280 220, 300 260 C 320 300, 400 310, 380 360"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
                />
              </svg>

              {/* Floating pills */}
              {HERO_PILLS.map((pill, i) => {
                const positions = [
                  { top: "5%", left: "15%" },
                  { top: "22%", right: "2%" },
                  { top: "50%", left: "8%" },
                  { top: "72%", right: "5%" },
                ];
                const pos = positions[i];
                return (
                  <motion.div
                    key={pill.text}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      duration: 0.6,
                      delay: pill.delay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="absolute"
                    style={pos}
                  >
                    <motion.div
                      animate={{ y: [0, -6, 0] }}
                      transition={{
                        duration: 3 + i * 0.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.3,
                      }}
                      className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 shadow-md shadow-black/[0.03]"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-secondary">
                        <pill.icon className={`size-3.5 ${i === 2 ? "terra-accent" : i === 3 ? "text-sage" : "text-foreground/85"}`} />
                      </span>
                      <span className="text-[13px] font-medium">{pill.text}</span>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Subtle dot grid decoration */}
        <div className="dot-grid pointer-events-none absolute right-0 top-0 h-full w-1/3 opacity-30" />
      </motion.section>

      {/* ═══════════════════ DARK STATS SECTION ═══════════════════ */}
      <section id="stats" className="relative overflow-hidden bg-sidebar py-24">
        <div className="mx-auto max-w-6xl px-6">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="text-center font-[family-name:var(--font-display)] text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-tight text-sidebar-primary"
          >
            Built for Teams Who Hire{" "}
            <span className="terra-accent">Smarter</span>
          </motion.h2>

          {/* Stats grid with central image area */}
          <div className="relative mt-16 flex min-h-[320px] items-center justify-center">
            {/* Central decorative element */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative z-10 flex size-48 items-center justify-center rounded-3xl border border-sidebar-border bg-sidebar-accent"
            >
              <div className="text-center">
                <Users className="mx-auto size-10 text-terra" />
                <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-sidebar-primary">RecruitAI</p>
                <p className="text-xs text-sidebar-foreground">AI-Powered Pipeline</p>
              </div>
            </motion.div>

            {/* Floating stat badges */}
            {STATS.map((stat, i) => {
              const positionClasses = [
                "left-0 top-0 md:left-[5%]",
                "right-0 top-4 md:right-[5%]",
                "left-0 bottom-0 md:left-[3%]",
                "right-0 bottom-4 md:right-[3%]",
              ];
              return (
                <motion.div
                  key={stat.value}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
                  className={`absolute ${positionClasses[i]}`}
                >
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{
                      duration: 3.5 + i * 0.4,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.5,
                    }}
                    className="rounded-xl border border-sidebar-border bg-sidebar-accent/80 px-5 py-3 backdrop-blur-sm"
                  >
                    <p className="font-[family-name:var(--font-display)] text-xl text-terra">{stat.value}</p>
                    <p className="whitespace-pre-line text-[11px] leading-tight text-sidebar-foreground/80">{stat.label}</p>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(212,201,187,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
      <section id="how-it-works" className="bg-background py-24">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.15em] terra-accent">How It Works</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3vw,2.4rem)] tracking-tight">
              From Resume to Hire in 4 Steps
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="group relative"
              >
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-8 translate-x-full bg-border md:block" />
                )}
                <span className="font-[family-name:var(--font-display)] text-4xl text-muted-foreground/50">{step.number}</span>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ FEATURES GRID ═══════════════════ */}
      <section id="features" className="border-t border-border bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.15em] terra-accent">Features</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3vw,2.4rem)] tracking-tight">
              Everything You Need to Hire Right
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group rounded-2xl border border-border/50 bg-background p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/[0.03]"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-terra/10">
                  <f.icon className="size-5 terra-accent" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ TECH STACK RIBBON ═══════════════════ */}
      <section className="border-t border-border bg-background py-16">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Powered By
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {["LangGraph", "Gemini AI", "Groq", "pgvector", "FastAPI", "Next.js"].map((tech, i) => (
              <motion.span
                key={tech}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="font-[family-name:var(--font-display)] text-lg text-muted-foreground transition-colors hover:text-foreground"
              >
                {tech}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ CTA SECTION ═══════════════════ */}
      <section className="bg-sidebar py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.8rem,3.5vw,2.6rem)] tracking-tight text-sidebar-primary">
              Ready to hire with{" "}
              <span className="terra-accent">confidence</span>?
            </h2>
            <p className="mt-4 text-[15px] text-sidebar-foreground">
              Join teams who have already transformed their recruitment pipeline with AI-powered candidate matching.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/login"
                className="terra-bg group flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold shadow-lg shadow-[#C4553A]/25 transition-all hover:shadow-xl hover:shadow-[#C4553A]/35"
              >
                Get Started Free
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="rounded-full border border-sidebar-border px-6 py-3 text-sm font-medium text-sidebar-foreground/80 transition-all hover:border-sidebar-foreground/30 hover:text-sidebar-primary"
              >
                Learn More
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="border-t border-sidebar-border bg-sidebar py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-terra">
              <span className="font-[family-name:var(--font-display)] text-xs font-bold text-terra-foreground">R</span>
            </div>
            <span className="font-[family-name:var(--font-display)] text-sm text-sidebar-primary">
              RecruitAI
            </span>
          </div>
          <p className="text-xs text-sidebar-foreground">
            &copy; {new Date().getFullYear()} RecruitAI. AI-Powered Recruitment Platform.
          </p>
          <div className="flex gap-6 text-xs text-sidebar-foreground">
            <a href="#" className="transition-colors hover:text-sidebar-primary">Privacy</a>
            <a href="#" className="transition-colors hover:text-sidebar-primary">Terms</a>
            <a href="#" className="transition-colors hover:text-sidebar-primary">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
