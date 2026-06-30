export type MessageVariant = "user" | "assistant" | "system";

export type Message = {
  id: string;
  variant: MessageVariant;
  text: string;
  /** Optional raw JSON payload to display beneath assistant text. */
  payload?: unknown;
  /** Marks assistant errors so we can style them distinctly. */
  isError?: boolean;
};

type MessageBubbleProps = {
  message: Message;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  if (message.variant === "system") {
    return (
      <div className="flex justify-center">
        <span className="inline-flex rounded-full border border-dls-border bg-dls-sidebar px-3 py-1 text-[12px] text-dls-secondary">
          {message.text}
        </span>
      </div>
    );
  }

  if (message.variant === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[24px] border border-dls-border bg-dls-sidebar px-5 py-3 text-[15px] leading-relaxed text-dls-text whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[760px] space-y-3">
        <div
          className={
            message.isError
              ? "text-[15px] leading-[1.7] italic text-red-500"
              : "text-[15px] leading-[1.7] text-dls-text"
          }
        >
          {message.text}
        </div>
        {message.payload !== undefined ? (
          <pre className="overflow-x-auto rounded-[18px] border border-dls-border bg-dls-surface px-4 py-3 text-[12px] font-mono text-dls-secondary">
            {JSON.stringify(message.payload, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
};
