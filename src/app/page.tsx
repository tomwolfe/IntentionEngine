"use client";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";
import { LocalLLMEngine } from "@/lib/local-llm-engine";
import { classifyIntent } from "@/lib/intent-schema";
import { Calendar } from "lucide-react";

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

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [input, setInput] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loadProgress, setLoadProgress] = useState("");
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [localResponse, setLocalResponse] = useState("");
  const [classificationType, setClassificationType] = useState<string | null>(null);

  useEffect(() => {
    // Pre-loaded the Phi-3.5-mini-instruct-q4f16_1-MLC model on app start
    const preload = async () => {
      try {
        const engine = await localProvider.getEngine(() => {});
        await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
      } catch (err) {
        console.warn("Failed to pre-load local model", err);
      }
    };
    preload();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => { setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }) },
        error => { console.error("Error getting location", error); }
      );
    }
  }, []);

  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted" || isLocalLoading;

  const createAuditLog = async (intent: string, outcome: any) => {
    try {
      await fetch("/api/audit", {
        method: "POST",
        body: JSON.stringify({ intent, final_outcome: outcome }),
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      console.warn("Audit log failed", err);
    }
  };

  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input.trim();
    const classification = classifyIntent(currentInput);
    setClassificationType(classification.type);
    setIsSubmitted(true);
    setInput("");

    if (classification.type === "SIMPLE") {
      setIsLocalLoading(true);
      try {
        const engine = await localProvider.getEngine(setLoadProgress);
        await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
        
        const response = await engine.generateStream(currentInput, [], (text) => {
          setLocalResponse(text);
        });

        await createAuditLog(currentInput, { status: "SUCCESS", message: response });
      } catch (err: any) {
        console.error("Local failed", err);
        await sendMessage({ text: currentInput }, { body: { userLocation } });
      } finally {
        setIsLocalLoading(false);
      }
    } else {
      await sendMessage({ text: currentInput }, { body: { userLocation } });
    }
  };

  const outcomeContent = useMemo(() => {
    if (classificationType === "SIMPLE") {
      if (isLocalLoading && !localResponse) {
        return <p className="text-2xl font-light text-slate-400 animate-pulse">Consulting local intelligence...</p>;
      }
      if (localResponse) {
        return <p className="text-xl font-light text-slate-800 leading-relaxed">{localResponse}</p>;
      }
      return null;
    }

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) {
      return status === "submitted" ? <p className="text-2xl font-light text-slate-400 animate-pulse">Orchestrating...</p> : null;
    }

    return (
      <div className="space-y-6">
        {lastAssistantMessage.parts.map((part, i) => {
          if (part.type === 'text') {
            return <p key={i} className="text-xl font-light text-slate-800 leading-relaxed">{part.text}</p>;
          }
          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            if (part.state === 'call') {
              return (
                <p key={i} className="text-lg text-slate-400 italic font-light animate-in fade-in duration-300">
                  {toolName === 'search_restaurant' ? 'Finding the perfect table...' : 
                   toolName === 'add_calendar_event' ? 'Securing your schedule...' : 
                   `Executing ${toolName.replace(/_/g, ' ')}...`}
                </p>
              );
            }
            if (part.state === 'output-available') {
              const output = part.output as any;
              if (toolName === 'search_restaurant' && output.success && Array.isArray(output.result)) {
                return (
                  <div key={i} className="space-y-4 pt-4">
                    {output.result.slice(0, 1).map((r: any, idx: number) => (
                      <div key={idx} className="p-8 border border-slate-100 rounded-[2rem] bg-white shadow-sm animate-in zoom-in-95 duration-500">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{r.name}</h3>
                          <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Recommended</span>
                        </div>
                        <p className="text-slate-500 text-lg mb-6">{r.address}</p>
                        {r.suggested_wine && (
                          <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50 mb-8">
                            <p className="text-xs text-amber-900/60 font-bold uppercase tracking-widest mb-1">Vibe Tuning</p>
                            <p className="text-xl text-amber-800 font-serif italic">“Pair with {r.suggested_wine} to elevate the evening.”</p>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            const nextMessage = `I've selected ${r.name}. Please add this to my calendar.`;
                            sendMessage({ text: nextMessage }, { body: { userLocation } });
                          }}
                          className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-[0.97] shadow-xl shadow-slate-200"
                        >
                          Confirm Selection
                        </button>
                      </div>
                    ))}
                  </div>
                );
              }
              if (toolName === 'add_calendar_event' && output.success && output.result?.download_url) {
                return (
                  <div key={i} className="flex flex-col items-center gap-6 p-10 bg-green-50/50 rounded-[2.5rem] border border-green-100 animate-in zoom-in-95 duration-500 mt-4">
                    <p className="text-green-800 font-bold text-xl text-center leading-tight">Outcome achieved.<br/>Your calendar is updated.</p>
                    <a 
                      href={output.result.download_url}
                      className="flex items-center gap-3 bg-green-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-green-700 transition-all shadow-lg shadow-green-200 active:scale-95"
                    >
                      <Calendar size={24} />
                      Download (.ics)
                    </a>
                  </div>
                );
              }
            }
          }
          return null;
        })}
      </div>
    );
  }, [messages, status, localResponse, isLocalLoading, userLocation, sendMessage, classificationType]);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6 selection:bg-blue-100">
      {!isSubmitted ? (
        <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <form onSubmit={onFormSubmit}>
            <input
              type="text"
              autoFocus
              className="w-full bg-transparent border-b border-slate-200 py-6 text-5xl font-light text-slate-800 placeholder-slate-300 outline-none focus:border-slate-900 transition-all duration-500"
              placeholder="What's your intention?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
          </form>
        </div>
      ) : (
        <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-12 duration-700">
          {outcomeContent ? (
            <div className="bg-white p-10 md:p-16 rounded-[3rem] shadow-[0_40px_80px_rgba(0,0,0,0.04)] border border-slate-100">
               {outcomeContent}
            </div>
          ) : (
            <div className="text-center py-20">
               <p className="text-3xl font-light text-slate-300 animate-pulse tracking-tight">Orchestrating outcome...</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}