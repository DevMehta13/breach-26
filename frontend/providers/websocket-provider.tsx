"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "./auth-provider";
import type { WsMessage } from "@/lib/types";

interface WsState {
  isConnected: boolean;
  lastMessage: WsMessage | null;
  candidateCount: number;
  incrementCount: () => void;
}

const WsContext = createContext<WsState>({
  isConnected: false,
  lastMessage: null,
  candidateCount: 0,
  incrementCount: () => {},
});

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const incrementCount = useCallback(() => {
    setCandidateCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!token) {
      // Close any existing connection when logged out
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          setLastMessage(msg);

          switch (msg.type) {
            case "INGESTION_COMPLETE": {
              setCandidateCount((c) => c + 1);
              const sourceLabel: Record<string, string> = {
                resume_upload: "Resume",
                linkedin: "LinkedIn",
                bamboohr: "HRMS",
                gmail: "Gmail",
              };
              const src = sourceLabel[msg.source ?? ""] ?? msg.source ?? "unknown";
              const label =
                msg.status === "auto_merged"
                  ? `${src}: Candidate auto-merged`
                  : msg.status === "pending_review"
                    ? `${src}: Candidate queued for review`
                    : `${src}: Candidate ingested`;
              toast.success(label, {
                description: msg.candidate_name
                  ? `${msg.candidate_name}`
                  : `ID: ${msg.candidate_id ?? "—"}`,
              });
              break;
            }

            case "GMAIL_SYNC_PROGRESS": {
              toast.info("Gmail Sync", {
                description: `${msg.synced ?? 0}/${msg.total ?? "?"} attachments processed`,
              });
              break;
            }

            case "HRMS_SYNC_PROGRESS": {
              toast.info("HRMS Sync", {
                description: msg.candidate_name
                  ? `HRMS: ${msg.candidate_name} added to database`
                  : `${msg.synced ?? 0}/${msg.total ?? "?"} records synced`,
              });
              break;
            }

            case "LINKEDIN_PARSED": {
              toast.success("LinkedIn Profile", {
                description: msg.candidate_name
                  ? `${msg.candidate_name} parsed successfully`
                  : `Profile parsed from ${msg.filename ?? "PDF"}`,
              });
              break;
            }

            case "DEDUP_UPDATE": {
              const names =
                msg.new_name && msg.existing_name
                  ? `${msg.new_name} \u2194 ${msg.existing_name}`
                  : "";
              const scoreStr = msg.score
                ? `${(msg.score * 100).toFixed(0)}% match`
                : "";
              if (msg.action === "AUTO_MERGE") {
                toast.success("Duplicate Auto-Merged", {
                  description: names
                    ? `${names} (${scoreStr})`
                    : scoreStr || "Candidates merged automatically",
                });
              } else if (msg.action === "SCAN_MATCH_FOUND") {
                toast.warning("Scan: Duplicate Found", {
                  description: names
                    ? `${names} (${scoreStr})`
                    : scoreStr || "New duplicate pair detected",
                });
              } else {
                toast.info("New Duplicate for Review", {
                  description: names
                    ? `${names} (${scoreStr})`
                    : scoreStr || "Queued for manual review",
                });
              }
              break;
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Reconnect after 3s if we still have a token
        reconnectTimer.current = setTimeout(() => {
          if (token) connect();
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  return (
    <WsContext.Provider value={{ isConnected, lastMessage, candidateCount, incrementCount }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WsContext);
}
