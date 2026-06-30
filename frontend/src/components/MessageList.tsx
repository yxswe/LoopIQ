import { useEffect, useRef } from "react";
import { MessageBubble, type Message } from "./MessageBubble";

type MessageListProps = {
  messages: ReadonlyArray<Message>;
};

export const MessageList = ({ messages }: MessageListProps) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the bottom whenever a new message arrives.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-8">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
