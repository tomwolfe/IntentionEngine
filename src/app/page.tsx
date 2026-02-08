"use client";

import { useState, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";
import { LocalLLMEngine } from "@/lib/local-llm-engine";
import { classifyIntent } from "@/lib/intent-schema";
import { Calendar, Mic, MicOff } from "lucide-react";

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
  const [loadProgress, setLoadProgress] = useState("");
  const [localResponse, setLocalResponse] = useState("");
  const [activeIntent, setActiveIntent] = useState<any>(null);
  const [isListening, setIsListening] = useState(false);

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

  const customTransport = useMemo(() => {
    const baseTransport = new DefaultChatTransport({
      api: "/api/chat",
    });

    return {
      sendMessages: async (options: any) => {
        // Intercept and fix tool parameters for special intents
        // This ensures data flow between sequential tool calls in the same turn
        const messages = options.messages || [];
        const lastMessage = messages[messages.length - 1];

        if (lastMessage?.role === 'assistant' && activeIntent?.isSpecialIntent) {
          const searchPart = lastMessage.parts.find((p: any) => 
            isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available'
          );
          const calendarPart = lastMessage.parts.find((p: any) => 
            isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'input-available'
          );

          if (searchPart && calendarPart) {
            const restaurant = (searchPart as any).output.result[0];
            if (restaurant) {
              calendarPart.args = {
                ...calendarPart.args,
                restaurant_name: restaurant.name,
                restaurant_address: restaurant.address,
                location: restaurant.address
              };
            }
          }
        }

        return baseTransport.sendMessages(options);
      },
      reconnectToStream: (options: any) => baseTransport.reconnectToStream(options),
    };
  }, [activeIntent]);

  const { messages, status, sendMessage } = useChat({
    transport: customTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted" || (activeIntent?.type === "SIMPLE" && !localResponse);

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.start();
  };

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
    let classification = classifyIntent(currentInput);
    
    // Silent Hybrid Classification
    if (classification.confidence < 0.85) {
      setActiveIntent({ type: "THINKING", isSpecialIntent: true }); // Show "Thinking..." state
      try {
        const engine = await localProvider.getEngine(() => {});
        await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
        const localClassifyPrompt = `Classify this intent: "${currentInput}". 
        Return ONLY a JSON object: {"type": "COMPLEX_PLAN" | "TOOL_SEARCH" | "TOOL_CALENDAR" | "SIMPLE", "isSpecialIntent": boolean}`;
        const response = await engine.generate(localClassifyPrompt);
        const match = response.match(/\{.*\}/s);
        if (match) {
          const localClass = JSON.parse(match[0]);
          classification = {
            ...classification,
            type: localClass.type,
            isSpecialIntent: localClass.isSpecialIntent,
            confidence: 0.95
          };
        }
      } catch (err) {
        console.warn("Local re-classification failed", err);
      }
    }

    const finalClassification = {
      ...classification,
      isSpecialIntent: classification.isSpecialIntent || classification.type === "COMPLEX_PLAN"
    };

    setActiveIntent(finalClassification);
    setInput("");

    if (finalClassification.type === "SIMPLE") {
      setLocalResponse("");
      try {
        const engine = await localProvider.getEngine(setLoadProgress);
        await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
        
        const response = await engine.generateStream(currentInput, [], (text) => {
          setLocalResponse(text);
        });

        await createAuditLog(currentInput, { status: "SUCCESS", message: response });
      } catch (err: any) {
        console.error("Local failed", err);
        await sendMessage({ text: currentInput }, { body: { userLocation, isSpecialIntent: finalClassification.isSpecialIntent } });
      }
    } else {
      await sendMessage({ text: currentInput }, { body: { userLocation, isSpecialIntent: finalClassification.isSpecialIntent } });
    }
  };

  const outcomeContent = useMemo(() => {
    if (activeIntent?.type === "SIMPLE") {
      if (localResponse) {
        return <p className="text-xl font-light text-slate-800 leading-relaxed">{localResponse}</p>;
      }
      return null;
    }

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return null;

    // Search for search and calendar results
    const searchPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available');
    const calendarPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available');
    
    // In v2.0, we only show the final card when everything is ready OR the simplified plan
    const isComplete = calendarPart && calendarPart.state === 'output-available';
    const isSimplified = searchPart && !calendarPart && activeIntent?.type !== "COMPLEX_PLAN";

    if (isComplete || isSimplified) {
      const restaurant = (searchPart as any)?.output?.result?.[0] || { name: "Selected Location", address: "Confirmed" };
      const calendarResult = (calendarPart as any)?.output?.result;
      
      let downloadUrl = calendarResult?.download_url;
      if (restaurant && downloadUrl) {
        try {
          const url = new URL(downloadUrl, window.location.origin);
          url.searchParams.set('location', restaurant.address);
          url.searchParams.set('description', `Restaurant: ${restaurant.name}\nAddress: ${restaurant.address}`);
          downloadUrl = url.pathname + url.search;
        } catch (e) {
          console.warn("Failed to repair download URL", e);
        }
      }

      return (
        <div className="space-y-4 pt-4">
          <div className="p-8 border border-slate-100 rounded-[2rem] bg-white shadow-sm animate-in zoom-in-95 duration-500">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{restaurant.name}</h3>
            <p className="text-slate-500 text-lg mb-6">{restaurant.address}</p>
            {restaurant.suggested_wine && (
              <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50 mb-8">
                <p className="text-xl text-amber-800 font-serif italic">“Pair with {restaurant.suggested_wine} to elevate the evening.”</p>
              </div>
            )}
            {downloadUrl && (
              <a 
                href={downloadUrl}
                className="flex items-center justify-center gap-3 w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-[0.97] shadow-xl shadow-slate-200"
              >
                <Calendar size={24} />
                Download (.ics)
              </a>
            )}
          </div>
        </div>
      );
    }

    // Default "Thinking" state for any non-final state
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-3 h-3 bg-slate-400 rounded-full animate-ping" />
      </div>
    );
  }, [messages, localResponse, activeIntent]);

  const isActuallySubmitted = activeIntent !== null;
  const isThinking = isLoading || activeIntent?.type === "THINKING";
  const hasOutcome = outcomeContent && !outcomeContent.props.className?.includes('flex justify-center');

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6 selection:bg-blue-100">
      {!hasOutcome ? (
        <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <form onSubmit={onFormSubmit} className="relative group">
            <input
              type="text"
              autoFocus
              className="w-full bg-transparent border-b border-slate-200 py-6 pr-16 text-5xl font-light text-slate-800 placeholder-slate-300 outline-none focus:border-slate-900 transition-all duration-500"
              placeholder="What's your intention?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isThinking || isListening}
            />
            <div className="absolute right-0 bottom-6 flex items-center gap-4">
              {isThinking && (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              )}
              <button
                type="button"
                onClick={startListening}
                className={`p-4 rounded-full transition-all duration-300 ${isListening ? 'text-red-500 scale-125' : 'text-slate-300 hover:text-slate-900'}`}
                disabled={isThinking}
              >
                {isListening ? <MicOff size={32} /> : <Mic size={32} />}
              </button>
            </div>
          </form>
          {activeIntent && activeIntent.type === "SIMPLE" && outcomeContent && (
             <div className="mt-12 bg-white p-10 md:p-16 rounded-[3rem] shadow-[0_40px_80px_rgba(0,0,0,0.04)] border border-slate-100 animate-in fade-in slide-in-from-top-4 duration-700">
                {outcomeContent}
             </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-12 duration-700">
          <div className="bg-white p-10 md:p-16 rounded-[3rem] shadow-[0_40px_80px_rgba(0,0,0,0.04)] border border-slate-100">
             {outcomeContent}
          </div>
        </div>
      )}
    </main>
  );
}