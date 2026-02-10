"use client";

import { useState, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { Trash2, Calendar, MapPin, Loader2 } from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => { setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }) },
        error => { console.error("Error getting location", error); }
      );
    }
  }, []);

  const { messages, setMessages, status, sendMessage, addToolOutput } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError(err) {
      console.error("Chat error:", err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    },
    async onToolCall({ toolCall }) {
      // Server-side execution is handled in route.ts
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    localStorage.removeItem("chat_history");
  };

  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    setError(null);
    try {
      await sendMessage({ text: input }, { body: { userLocation } });
      setInput("");
    } catch (err: any) {
      setError(err.message || "Failed to send message");
    }
  };

  const handleRetry = () => {
    if (messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        setError(null);
        sendMessage({ text: (lastUserMessage.parts.find(p => p.type === 'text') as any)?.text || "" }, {
          body: { userLocation }
        });
      }
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Intention Engine</h1>
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            <Trash2 size={16} />
            Clear Chat
          </button>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8 flex justify-between items-center">
          <p className="text-sm">{error}</p>
          <button 
            onClick={handleRetry}
            className="text-xs bg-red-100 hover:bg-red-200 px-3 py-1 rounded font-bold transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <form onSubmit={onFormSubmit} className="space-y-4">
          <label className="block text-sm font-medium mb-2">What is your intent?</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. plan a dinner and add to calendar"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Thinking...
                </>
              ) : (
                "Send"
              )}
            </button>
          </div>
          {userLocation && (<p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12} />Location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>)}
        </form>
      </div>

      <div className="space-y-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-lg border shadow-sm ${
              m.role === 'user' ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200'
            }`}>
              {m.parts.map((part, partIndex) => {
                if (part.type === 'text') {
                  return <p key={partIndex} className="text-sm whitespace-pre-wrap">{part.text}</p>;
                }
                
                if (isToolUIPart(part)) {
                  const toolInvocation = part;
                  const toolName = getToolName(toolInvocation);
                  
                  return (
                    <div key={partIndex} className="mt-4 border-t pt-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-2">
                        {toolName === 'search_restaurant' ? <MapPin size={12} /> : <Calendar size={12} />}
                        {toolName.replace(/_/g, ' ')}
                      </div>
                      
                      {toolInvocation.state === 'output-available' ? (
                        <div className="space-y-2">
                          {(() => {
                            const output = toolInvocation.output as any;
                            return (
                              <>
                                                                {toolName === 'search_restaurant' && output.success && Array.isArray(output.result) ? (
                                                                  <div className="space-y-2">
                                                                    {output.result.map((r: any, i: number) => (
                                                                      <div key={i} className="flex items-center justify-between p-2 border rounded bg-slate-50">
                                                                        <div>
                                                                          <p className="font-bold text-sm">{r.name}</p>
                                                                          <p className="text-xs text-slate-500">{r.address}</p>
                                                                        </div>
                                                                        <button
                                                                          onClick={() => {
                                                                            const time = "7 PM"; // Default or extracted from previous messages
                                                                            sendMessage({ text: `I've selected ${r.name} at ${r.address}. Please add this to my calendar for tonight at ${time}.` }, {
                                                                              body: { userLocation }
                                                                            });
                                                                          }}
                                                                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                                                                        >
                                                                          Select
                                                                        </button>
                                                                      </div>
                                                                    ))}
                                                                  </div>
                                                                ) :
                                 toolName === 'add_calendar_event' && output.success && output.result?.download_url ? (
                                  <div className="py-2">
                                    <a 
                                      href={output.result.download_url}
                                      className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors text-sm"
                                    >
                                      <Calendar size={16} />
                                      Download to Calendar (.ics)
                                    </a>
                                  </div>
                                ) : (
                                  <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-40">
                                    {JSON.stringify(output, null, 2)}
                                  </pre>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : toolInvocation.state === 'output-error' ? (
                        <div className="bg-red-50 border border-red-100 p-4 rounded-lg space-y-3">
                          <div className="text-sm text-red-700 font-medium flex items-center gap-2">
                            <span>Tool Execution Failed</span>
                          </div>
                          <p className="text-xs text-red-600 font-mono bg-white p-2 border border-red-50 rounded">
                            {toolInvocation.errorText}
                          </p>
                          <button
                            onClick={() => {
                              sendMessage({ 
                                text: `The tool "${toolName}" failed with error: "${toolInvocation.errorText}". Please retry the operation with appropriate adjustments or more specific parameters.` 
                              }, {
                                body: { userLocation }
                              });
                            }}
                            className="text-xs bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors font-bold shadow-sm"
                          >
                            Re-try with Context
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-slate-500 animate-pulse">
                          <Loader2 size={14} className="animate-spin" />
                          Running {toolName.replace(/_/g, ' ')}...
                        </div>
                      )}
                    </div>
                  );
                }
                
                return null;
              })}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Thinking...
          </div>
        )}
      </div>
    </main>
  );
}