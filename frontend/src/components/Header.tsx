import { ChevronDown } from "lucide-react";
import { getBackendUrl } from "../lib/api";

export type BackendStatus = "idle" | "checking" | "ok" | "down";

type HeaderProps = {
  status: BackendStatus;
  uptimeSeconds: number | null;
};

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
};

export const Header = ({ status, uptimeSeconds }: HeaderProps) => {
  const backendUrl = getBackendUrl();

  let dotClass = "bg-dls-active";
  let label = "Idle";
  if (status === "checking") {
    dotClass = "bg-amber-500";
    label = "Checking…";
  } else if (status === "ok") {
    dotClass = "bg-green-500";
    label =
      uptimeSeconds !== null
        ? `Connected · uptime ${formatUptime(uptimeSeconds)}`
        : "Connected";
  } else if (status === "down") {
    dotClass = "bg-red-500";
    label = `Down — ${backendUrl}`;
  }

  return (
    <header className="flex items-center justify-between border-b border-dls-border bg-dls-surface px-6 py-3">
      <div className="flex items-center gap-1 text-[14px] font-medium text-dls-text">
        Default
        <ChevronDown size={14} className="text-dls-secondary" />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-dls-secondary">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotClass}`}
          aria-hidden
        />
        <span>{label}</span>
      </div>
    </header>
  );
};
