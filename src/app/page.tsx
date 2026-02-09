"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";
import { LocalLLMEngine } from "@/lib/local-llm-engine";
import { classifyIntent } from "@/lib/intent-schema";
import { executeTool } from "@/lib/tools";
import { Calendar, Mic } from "lucide-react";

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
  const [auditLogId, setAuditLogId] = useState<string | null>(null);
  const [isExecutingChain, setIsExecutingChain] = useState(false);
  const recognitionRef = useRef<any>(null);

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
              calendarPart.input = {
                ...calendarPart.input,
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

  const { messages, status, sendMessage, setMessages } = useChat({
    transport: customTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted" || (activeIntent?.type === "SIMPLE" && !localResponse) || isExecutingChain;

      const processIntent = async (currentInput: string) => {
        if (!currentInput.trim() || isLoading) return;
  
        // Immediate feedback: Set thinking state and trigger haptic pulse
        setActiveIntent({ type: "THINKING", isSpecialIntent: true });
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(50);
        }

        let classification = await classifyIntent(currentInput);
        
        // Silent Hybrid Classification
        if (classification.confidence < 0.85) {
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
          // For v2.0, we want to capture audit_log_id and plan
          const response: any = await sendMessage(
            { text: currentInput }, 
            { body: { userLocation, isSpecialIntent: finalClassification.isSpecialIntent } }
          );
  
          if (response?.audit_log_id) {
            setAuditLogId(response.audit_log_id);
            if (response.plan) {
              const updatedWithPlan = { ...finalClassification, plan: response.plan };
              setActiveIntent(updatedWithPlan);
  
              if (finalClassification.isSpecialIntent) {
                await runAutomatedChain(response.audit_log_id, response.plan, finalClassification);
              }
            }
          }
        }
      };
  
      const startListening = () => {
        if (isListening && recognitionRef.current) {
          recognitionRef.current.stop();
          return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          return;
        }
  
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
  
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
          setIsListening(false);
          recognitionRef.current = null;
        };
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          processIntent(transcript);
        };
  
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          recognitionRef.current = null;
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
  
      const runAutomatedChain = async (id: string, plan: any, originalClassification: any) => {
        setIsExecutingChain(true);
        setActiveIntent({ type: "THINKING", isSpecialIntent: true });
        setLocalResponse("");
  
        try {
          const toolResults: any[] = [];
          for (let i = 0; i < plan.ordered_steps.length; i++) {
            const step = plan.ordered_steps[i];
            const { result } = await executeTool(id, i);
            
            toolResults.push({
              type: "dynamic-tool",
              toolName: step.tool_name,
              toolCallId: `call_${id}_${i}`,
              state: "output-available",
              input: step.parameters,
              output: result
            });
          }
  
          // Finalize the chain by updating messages to trigger the result card
          setMessages([
            ...messages,
            {
              id: `automated_${id}`,
              role: "assistant",
              parts: [
                { type: "text", text: plan.summary },
                ...toolResults
              ]
            }
          ]);
          
          // Restore the classification state so UI logic (like isSimplified) works correctly
          setActiveIntent({ ...originalClassification, plan });
        } catch (err) {
          console.error("Automated chain failed", err);
          setActiveIntent({ type: "ERROR", isSpecialIntent: true });
        } finally {
          setIsExecutingChain(false);
        }
      };
  
      const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        processIntent(input);
      };
  const outcomeContent = useMemo(() => {
    if (activeIntent?.type === "SIMPLE") {
      if (localResponse) {
        return <p className="text-xl font-light text-slate-800 leading-relaxed">{localResponse}</p>;
      }
      return null;
    }

    if (activeIntent?.type === "ERROR") {
      return (
        <div className="p-8 text-center">
          <p className="text-xl text-slate-600">I'm sorry, I couldn't complete your request. Please try again.</p>
        </div>
      );
    }

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return null;

    // Search for search and calendar results
    const searchPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available');
    const calendarPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available');
    
    // In v2.0, we only show the final card when everything is ready OR the simplified plan
    const isComplete = calendarPart && (calendarPart as any).state === 'output-available';
    const isSimplified = searchPart && !calendarPart && activeIntent?.type !== "COMPLEX_PLAN";
    const isPureCalendar = isComplete && !searchPart;

    if (isPureCalendar) {
      const calendarResult = (calendarPart as any)?.output?.result;
      const downloadUrl = calendarResult?.download_url;
      if (!downloadUrl) return null;

      return (
        <div className="pt-4">
          <a 
            href={downloadUrl}
            className="flex items-center justify-center gap-3 w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-[0.97] shadow-xl shadow-slate-200"
          >
            <Calendar size={24} />
            Download (.ics)
          </a>
        </div>
      );
    }

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
          <div className="p-10 border border-slate-100 rounded-[3rem] bg-white shadow-[0_40px_80px_rgba(0,0,0,0.03)] animate-in zoom-in-95 duration-700">
            <div className="mb-10">
              <h3 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">{restaurant.name}</h3>
              <p className="text-slate-400 text-xl font-light">{restaurant.address}</p>
            </div>

            {restaurant.suggested_wine && (
              <div className="bg-amber-50/30 p-8 rounded-3xl border border-amber-100/50 mb-10 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/50" />
                <p className="text-2xl text-amber-900/80 font-serif italic leading-relaxed">
                  “Pair with {restaurant.suggested_wine} to elevate the evening.”
                </p>
              </div>
            )}

            {downloadUrl && (
              <div className="space-y-6">
                <div className="h-px bg-slate-100 w-full" />
                <a 
                  href={downloadUrl}
                  className="flex items-center justify-center gap-4 w-full py-6 bg-slate-900 text-white rounded-[2rem] font-bold text-xl hover:bg-black transition-all active:scale-[0.98] shadow-2xl shadow-slate-300 group hover:shadow-black/10"
                >
                  <Calendar size={28} className="group-hover:rotate-6 transition-transform" />
                  Finalize & Download (.ics)
                </a>
                <p className="text-center text-slate-400 text-sm font-medium tracking-wide uppercase">The Final Act of Will</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Default "Thinking" state for any non-final state
    return (
      <div className="flex flex-col justify-center items-center py-20 gap-8">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-slate-100 rounded-full" />
          <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-slate-900 rounded-full animate-spin" />
        </div>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-xs animate-pulse">Anticipating your desires</p>
      </div>
    );
  }, [messages, localResponse, activeIntent]);

  const isActuallySubmitted = activeIntent !== null;
  const isThinking = isLoading || activeIntent?.type === "THINKING";
  const hasOutcome = outcomeContent && !outcomeContent.props.className?.includes('flex justify-center');

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6 selection:bg-blue-100">
      {!hasOutcome ? (
        <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <form onSubmit={onFormSubmit} className="relative group mb-16">
            <input
              type="text"
              autoFocus
              className="w-full bg-transparent border-b border-slate-200 py-8 pr-16 text-6xl font-extralight text-slate-800 placeholder-slate-200 outline-none focus:border-slate-900 transition-all duration-700"
              placeholder="What do you desire?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isThinking || isListening}
            />
            <div className="absolute right-0 bottom-8 flex items-center gap-6">
              {isThinking && (
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
              )}
              <button
                type="button"
                onClick={startListening}
                className={`p-4 rounded-full transition-all duration-500 ${isListening ? 'text-blue-500 animate-pulse scale-125' : 'text-slate-300 hover:text-slate-900'}`}
                disabled={isThinking}
              >
                <Mic size={36} />
              </button>
            </div>
          </form>
          {activeIntent && activeIntent.type === "SIMPLE" && outcomeContent && (
             <div className="mt-12 bg-white p-12 md:p-20 rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.04)] border border-slate-50 animate-in fade-in slide-in-from-top-8 duration-1000">
                {outcomeContent}
             </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-16 duration-1000">
          <div className="mb-12 px-6">
            <p className="text-3xl md:text-4xl font-extralight text-slate-800 leading-[1.4] tracking-tight text-center italic">
              {activeIntent?.plan?.summary || messages[messages.length - 1]?.parts?.find(p => p.type === 'text')?.text}
            </p>
          </div>
          <div className="bg-white p-10 md:p-16 rounded-[4rem] shadow-[0_50px_100px_rgba(0,0,0,0.05)] border border-slate-50">
             {outcomeContent}
          </div>
        </div>
      )}
    </main>
  );
}