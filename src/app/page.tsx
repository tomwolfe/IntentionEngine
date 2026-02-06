"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { Trash2, Calendar, MapPin, Loader2, Settings, Zap, Brain } from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName, UIMessage } from "ai";
import { LocalLLMEngine, LocalModel } from "@/lib/local-llm-engine";
import { classifyIntent, IntentType } from "@/lib/intent-schema";
import { AuditOutcome } from "@/lib/audit";

class LocalProvider {
  private engine: LocalLLMEngine | null = null;
  
  async getEngine(onProgress: (text: string) => void) {
    if (!this.engine) {
      this.engine = new LocalLLMEngine((report) => {
        onProgress(report.text);
      });
    }
    return this.engine;
  }
}

const localProvider = new LocalProvider();

function ModelSettings({ 
  selectedModel, 
  setSelectedModel, 
  onClose 
}: { 
  selectedModel: LocalModel, 
  setSelectedModel: (m: LocalModel) => void, 
  onClose: () => void 
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l shadow-2xl z-40 p-6 animate-in slide-in-from-right">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings size={20} /> Settings
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">Local Model Engine</label>
          <div className="grid gap-3">
            <button
              onClick={() => setSelectedModel("phi-2-q4f16_1-MLC")}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                selectedModel === "phi-2-q4f16_1-MLC" 
                ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200" 
                : "border-slate-200 hover:border-slate-300 bg-slate-50"
              }`}
            >
              <Brain size={18} />
              <div>
                <div className="font-bold text-sm">Phi-2</div>
                <div className="text-xs opacity-70">Strong reasoning, small size</div>
              </div>
            </button>
            
            <button
              onClick={() => setSelectedModel("Phi-3.5-mini-instruct-q4f16_1-MLC")}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                selectedModel === "Phi-3.5-mini-instruct-q4f16_1-MLC" 
                ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200" 
                : "border-slate-200 hover:border-slate-300 bg-slate-50"
              }`}
            >
              <Brain size={18} />
              <div>
                <div className="font-bold text-sm">Phi-3.5-mini</div>
                <div className="text-xs opacity-70">Higher intelligence</div>
              </div>
            </button>
          </div>
        </div>

        <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Note:</strong> Local models run entirely in your browser. The first load may take a moment to download weights (~100MB - 2GB).
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<LocalModel>("phi-2-q4f16_1-MLC");
  const [loadProgress, setLoadProgress] = useState("");
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      console.log("Tool call received on client:", toolCall.toolName);
      // For server-executed tools, this is mainly for client-side side-effects
      // The actual rendering is handled in the message loop below.
    },
  });

  const isLoading = status === "streaming" || status === "submitted" || isLocalLoading;

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    localStorage.removeItem("chat_history");
  };

  const createAuditLog = async (intent: string, outcome: AuditOutcome | string) => {
    try {
      await fetch("/api/audit", {
        method: "POST",
        body: JSON.stringify({ intent, final_outcome: outcome }),
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.warn("Failed to create audit log for local execution", err);
    }
  };

  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input.trim();
    setInput("");
    setError(null);

    const classification = classifyIntent(currentInput);

    if (classification.type === "SIMPLE") {
      setIsLocalLoading(true);
      try {
        const userMsg: UIMessage = { 
          id: Math.random().toString(), 
          role: 'user', 
          parts: [{ type: 'text', text: currentInput }] 
        };
        setMessages(prev => [...prev, userMsg]);

        const engine = await localProvider.getEngine(setLoadProgress);
        await engine.loadModel(selectedModel);
        
        const assistantId = Math.random().toString();
        let fullText = "";
        
        const response = await engine.generateStream(currentInput, messages.map(m => ({
          role: m.role,
          content: m.parts.filter(p => p.type === 'text').map(p => (p as any).text).join('')
        })), (text) => {
          fullText = text;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.id === assistantId) {
              return [...prev.slice(0, -1), { ...last, parts: [{ type: 'text', text }] }];
            }
            return [...prev, { id: assistantId, role: 'assistant', parts: [{ type: 'text', text }] }];
          });
        });

        await createAuditLog(currentInput, {
          status: "SUCCESS",
          message: response
        });
      } catch (err: any) {
        console.error("Local execution failed:", err);
        setError(`Local execution failed: ${err.message}. Falling back to cloud...`);
        // Fallback to cloud if local fails (optional, but good for UX)
        await sendMessage({ text: currentInput }, { body: { userLocation } });
      } finally {
        setIsLocalLoading(false);
        setLoadProgress("");
      }
    } else {
      try {
        await sendMessage({ text: currentInput }, { body: { userLocation } });
      } catch (err: any) {
        setError(err.message || "Failed to send message");
      }
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
    <main className="max-w-4xl mx-auto p-8 relative">
      {/* Sidebar Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-8 right-8 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-50"
      >
        <Settings size={20} className={isSidebarOpen ? "animate-spin-slow" : ""} />
      </button>

      {/* Settings Sidebar */}
      {isSidebarOpen && (
        <ModelSettings 
          selectedModel={selectedModel} 
          setSelectedModel={setSelectedModel} 
          onClose={() => setIsSidebarOpen(false)} 
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Intention Engine</h1>
        <div className="flex items-center gap-4">
          {loadProgress && (
            <div className="text-[10px] font-mono text-slate-400 max-w-[200px] truncate">
              {loadProgress}
            </div>
          )}
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
                                    <div className="text-xs text-slate-500 mb-1">Found {output.result.length} romantic options:</div>
                                    {output.result.map((r: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                        <div>
                                          <p className="font-bold text-sm text-slate-800">{r.name}</p>
                                          <p className="text-xs text-slate-500">{r.address}</p>
                                        </div>
                                        <button
                                          onClick={() => {
                                            // Extract time from conversation context if possible, otherwise default
                                            const time = "7:00 PM"; 
                                            sendMessage({ text: `I've selected ${r.name} at ${r.address}. Please add this to my calendar for tomorrow at ${time}.` }, {
                                              body: { userLocation }
                                            });
                                          }}
                                          className="text-xs bg-blue-600 text-white px-4 py-2 rounded-md font-bold hover:bg-blue-700 transition-all shadow-sm"
                                        >
                                          Select
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) :
                                 toolName === 'add_calendar_event' && output.success && output.result?.download_url ? (
                                  <div className="py-2">
                                    <div className="bg-green-50 border border-green-100 p-4 rounded-lg flex flex-col items-center gap-3">
                                      <p className="text-sm text-green-800 font-medium text-center">Calendar event generated successfully!</p>
                                      <a 
                                        href={output.result.download_url}
                                        className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition-all shadow-md text-sm"
                                      >
                                        <Calendar size={18} />
                                        Download (.ics)
                                      </a>
                                    </div>
                                  </div>
                                ) : (
                                  <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-40 border border-slate-200">
                                    {JSON.stringify(output, null, 2)}
                                  </pre>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : toolInvocation.state === 'output-error' ? (
                        <div className="text-xs text-red-500 font-mono bg-red-50 p-2 rounded border border-red-100">
                          Error: {toolInvocation.errorText}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-blue-600 font-medium animate-pulse py-2">
                          <Loader2 size={16} className="animate-spin" />
                          {toolName === 'search_restaurant' ? 'Searching for restaurants...' : 
                           toolName === 'add_calendar_event' ? 'Generating calendar event...' : 
                           `Running ${toolName.replace(/_/g, ' ')}...`}
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