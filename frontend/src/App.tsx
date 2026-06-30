import { useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { Header, type BackendStatus } from "./components/Header";
import { MessageList } from "./components/MessageList";
import type { Message } from "./components/MessageBubble";
import { Sidebar } from "./components/Sidebar";
import { getBackendUrl, pingHealth } from "./lib/api";

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
};

const App = () => {
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([]);
  const [status, setStatus] = useState<BackendStatus>("idle");
  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(null);
  const didInitialPing = useRef(false);

  const append = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const checkBackendOnLoad = useCallback(async () => {
    setStatus("checking");
    try {
      const health = await pingHealth();
      setStatus("ok");
      setUptimeSeconds(health.uptime);
      append({
        id: makeId(),
        variant: "system",
        text: `Backend connected — uptime ${formatUptime(health.uptime)}`,
      });
    } catch (err) {
      setStatus("down");
      setUptimeSeconds(null);
      const message =
        err instanceof Error
          ? err.message
          : `Backend unreachable at ${getBackendUrl()}`;
      append({ id: makeId(), variant: "system", text: message });
    }
  }, [append]);

  // Run the initial ping exactly once on mount, even under StrictMode.
  useEffect(() => {
    if (didInitialPing.current) return;
    didInitialPing.current = true;
    void checkBackendOnLoad();
  }, [checkBackendOnLoad]);

  const onSend = useCallback(
    async (text: string) => {
      append({ id: makeId(), variant: "user", text });
      setStatus("checking");
      try {
        const health = await pingHealth();
        setStatus("ok");
        setUptimeSeconds(health.uptime);
        append({
          id: makeId(),
          variant: "assistant",
          text: "pong",
          payload: health,
        });
      } catch (err) {
        setStatus("down");
        const message =
          err instanceof Error
            ? err.message
            : `Backend unreachable at ${getBackendUrl()}`;
        append({
          id: makeId(),
          variant: "assistant",
          text: message,
          isError: true,
        });
      }
    },
    [append],
  );

  const onNewChat = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setUptimeSeconds(null);
    didInitialPing.current = false;
    void checkBackendOnLoad().then(() => {
      didInitialPing.current = true;
    });
  }, [checkBackendOnLoad]);

  return (
    <div className="flex h-dvh bg-dls-surface text-dls-text">
      <Sidebar onNewChat={onNewChat} />
      <main className="flex flex-1 flex-col">
        <Header status={status} uptimeSeconds={uptimeSeconds} />
        <MessageList messages={messages} />
        <Composer disabled={status === "checking"} onSend={onSend} />
      </main>
    </div>
  );
};

export default App;
