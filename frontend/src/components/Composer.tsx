import { ArrowUp } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

type ComposerProps = {
  disabled: boolean;
  onSend: (text: string) => void;
};

export const Composer = ({ disabled, onSend }: ComposerProps) => {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div
      className="sticky bottom-0 z-10 px-6 pb-6 pt-4"
      style={{
        background:
          "linear-gradient(to bottom, transparent 0%, var(--dls-surface) 40%)",
      }}
    >
      <div
        className="mx-auto flex max-w-[820px] items-end gap-2 rounded-[24px] border border-dls-border bg-dls-surface px-4 py-3"
        style={{ boxShadow: "var(--dls-shell-shadow)" }}
      >
        <textarea
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={
            disabled ? "Waiting for backend…" : "Type anything to ping /health"
          }
          className="min-h-[24px] max-h-40 w-full resize-none border-none bg-transparent text-[15px] leading-relaxed text-dls-text outline-none placeholder:text-dls-secondary disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className={
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors " +
            (canSend
              ? "bg-dls-accent text-white hover:bg-[var(--dls-accent-hover)]"
              : "bg-dls-active text-dls-secondary")
          }
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
};
