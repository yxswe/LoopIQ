import { Monitor, Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import type { ThemeMode } from "../lib/theme";

type SidebarProps = {
  onNewChat: () => void;
};

const themeOptions: ReadonlyArray<{
  value: ThemeMode;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
  { value: "system", label: "Match system theme", Icon: Monitor },
];

export const Sidebar = ({ onNewChat }: SidebarProps) => {
  const { mode, setMode } = useTheme();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-dls-border bg-dls-sidebar">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="text-[15px] font-semibold tracking-tight text-dls-text">
          LoopIQ
        </div>
        <div className="text-[12px] text-dls-secondary">test client</div>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-[13px] font-medium text-dls-text transition-colors hover:bg-dls-hover"
        >
          <Plus size={14} />
          New chat
        </button>
      </div>

      {/* Sessions */}
      <nav className="flex-1 overflow-y-auto px-3 pt-4">
        <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-dls-secondary">
          Sessions
        </div>
        <ul>
          <li>
            <div className="cursor-default rounded-lg bg-dls-hover px-3 py-2 text-[13px] font-medium text-dls-text">
              Default
            </div>
          </li>
        </ul>
      </nav>

      {/* Theme switcher */}
      <div className="border-t border-dls-border px-4 py-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-dls-secondary">
          Theme
        </div>
        <div className="inline-flex rounded-lg border border-dls-border bg-dls-surface p-1">
          {themeOptions.map(({ value, label, Icon }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={active}
                onClick={() => setMode(value)}
                className={
                  "rounded-md px-2 py-1 transition-colors " +
                  (active
                    ? "bg-dls-hover text-dls-text"
                    : "text-dls-secondary hover:text-dls-text")
                }
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
