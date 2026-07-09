import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, User } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/chatbot")({
  ssr: false,
  component: ChatbotPage,
});

function ChatbotPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input.trim() });
    setInput("");
  }

  return (
    <>
      <PageHeader
        title="Support Chatbot"
        description="Ticket no, mobile ya customer code daaliye — saari details turant"
      />
      <div className="p-6 grid lg:grid-cols-[1fr_280px] gap-4 h-[calc(100vh-120px)]">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                <Bot className="mx-auto h-10 w-10 mb-2 opacity-60" />
                Try: <span className="font-mono">T-00001</span> ya kisi customer ka mobile number
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role !== "user" && <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>}
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.parts.map((p, i) => {
                    if (p.type === "text") return <span key={i}>{p.text}</span>;
                    if (p.type.startsWith("tool-")) {
                      const tp = p as any;
                      return (
                        <div key={i} className="text-xs italic opacity-70">
                          🔍 Looking up {tp.input?.query ?? "…"}{tp.state === "output-available" ? " ✓" : "…"}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
                {m.role === "user" && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3"><div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Bot className="h-4 w-4" /></div><div className="bg-muted rounded-lg px-3 py-2 text-sm">Thinking…</div></div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={submit} className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Ticket no, mobile ya query likhiye…"
              rows={1}
              className="resize-none"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}><Send className="h-4 w-4" /></Button>
          </form>
        </Card>

        <Card className="p-4 text-sm space-y-3 h-fit">
          <div className="font-semibold">Examples</div>
          {["T-00001", "Mobile 98XXXXXXXX ka status", "Customer code RNC-001 ki history"].map((s) => (
            <button key={s} onClick={() => setInput(s)} className="block text-left w-full text-xs hover:bg-muted rounded px-2 py-1.5">{s}</button>
          ))}
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Bot customer details, recharges, expiry aur tickets ki processing ka data dega.
          </div>
        </Card>
      </div>
    </>
  );
}
