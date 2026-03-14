import type { Metadata } from "next";
import { DM_Sans, Libre_Baskerville } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/providers/auth-provider";
import { WebSocketProvider } from "@/providers/websocket-provider";
import { CommandPalette } from "@/components/layout/command-palette";
import "./globals.css";

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Libre_Baskerville({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RecruitAI — AI-Powered Recruitment Platform",
  description: "Unified AI-Powered Recruitment Hub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${body.variable} ${display.variable} ${mono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AuthProvider>
            <WebSocketProvider>
              {children}
              <CommandPalette />
              <Toaster position="bottom-right" richColors />
            </WebSocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
