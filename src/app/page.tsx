"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";
import { LocalLLMEngine } from "@/lib/local-llm-engine";
import { classifyIntent } from "@/lib/intent-schema";
import { Check } from "lucide-react";

class LocalProvider {
  private engine: LocalLLMEngine | null = null;
  
  async getEngine() {
    if (!this.engine) {
      this.engine = new LocalLLMEngine(() => {});
    }
    return this.engine;
  }
}

const localProvider = new LocalProvider();

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [activeIntent, setActiveIntent] = useState<any>(null);
  const [showTick, setShowTick] = useState(false);
  const [deliveredUrl, setDeliveredUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const initRecognition = () => {
    if (!('webkitSpeechRecognition' in window) || recognitionRef.current) return;
    
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (transcript.trim()) {
        handleIntent(transcript.trim());
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Prevent rapid flicker by adding a small delay and checking if we still want to listen
      if (recognitionRef.current) {
        setTimeout(() => {
          try { 
            if (recognitionRef.current) recognitionRef.current.start(); 
          } catch (e) { 
            console.error("Auto-restart failed", e); 
          }
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        recognitionRef.current = null;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Initial start failed", e);
    }
  };

  useEffect(() => {
    // Pre-load the Phi-3.5 model instantly on app start
    const preload = async () => {
      try {
        const engine = await localProvider.getEngine();
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

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const customTransport = useMemo(() => {
    const baseTransport = new DefaultChatTransport({
      api: "/api/chat",
    });

    return {
      sendMessages: async (options: any) => {
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

  const { messages, sendMessage } = useChat({
    transport: customTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const handleOutcomeDelivery = async (downloadUrl: string, filename: string) => {
    if (deliveredUrl === downloadUrl) return;
    setDeliveredUrl(downloadUrl);

    if (navigator.share) {
      try {
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'text/calendar' });
        await navigator.share({
          files: [file],
          title: 'Your Outcome',
          text: 'The intention has been manifested.',
        });
        return;
      } catch (err) {
        console.warn("Share failed, falling back to silent download", err);
      }
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleIntent = async (input: string) => {
    const classification = classifyIntent(input);
    setActiveIntent(classification);
    setDeliveredUrl(null);

    if (classification.type === "SIMPLE") {
      try {
        const engine = await localProvider.getEngine();
        await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
        await engine.generateStream(input, [], () => {});
        
        setShowTick(true);
        setTimeout(() => setShowTick(false), 2000);

        await fetch("/api/audit", {
          method: "POST",
          body: JSON.stringify({ intent: input, final_outcome: { status: "SUCCESS", simple: true } }),
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("Local processing failed", err);
      }
    } else {
      await sendMessage({ text: input }, { body: { userLocation: userLocationRef.current, isSpecialIntent: classification.isSpecialIntent } });
    }
  };

  const outcomeContent = useMemo(() => {
    if (!activeIntent?.isSpecialIntent) return null;

    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistantMessage) return null;

    const searchPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available');
    const calendarPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available');

    if (searchPart && calendarPart) {
      const restaurant = (searchPart as any).output.result[0];
      return (
        <div className="p-12 border border-white/40 rounded-[3rem] bg-white/60 backdrop-blur-3xl shadow-[0_32px_64px_rgba(0,0,0,0.06)] animate-in zoom-in-95 duration-1000">
          <h3 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">{restaurant.name}</h3>
          <p className="text-slate-500 text-xl mb-8 font-light">{restaurant.address}</p>
          {restaurant.suggested_wine && (
            <div className="bg-amber-50/40 p-8 rounded-3xl border border-amber-100/50">
              <p className="text-2xl text-amber-900/80 font-serif italic leading-relaxed">
                “Pair with {restaurant.suggested_wine} to elevate the evening. A bottle has been pre-ordered.”
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  }, [messages, activeIntent]);

  // Handle proactive delivery for all tool-based intents
  useEffect(() => {
    if (activeIntent) {
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
      const calendarPart = lastAssistantMessage?.parts.find(p => isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available');
      const searchPart = lastAssistantMessage?.parts.find(p => isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available');
      
      if (calendarPart) {
        const restaurant = searchPart ? (searchPart as any).output.result[0] : null;
        const calendarResult = (calendarPart as any).output.result;
        let downloadUrl = calendarResult.download_url;

        if (restaurant && downloadUrl) {
          try {
            const url = new URL(downloadUrl, window.location.origin);
            url.searchParams.set('location', restaurant.address);
            url.searchParams.set('description', `Restaurant: ${restaurant.name}\nAddress: ${restaurant.address}`);
            downloadUrl = url.pathname + url.search;
          } catch (e) {}
        }

        if (downloadUrl) {
          handleOutcomeDelivery(downloadUrl, 'invitation.ics');
          if (!activeIntent.isSpecialIntent) {
            setShowTick(true);
            setTimeout(() => setShowTick(false), 3000);
          }
        }
      }
    }
  }, [messages, activeIntent]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex items-center justify-center p-8 transition-all duration-1000 overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-40">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-200/30 rounded-full blur-[120px] animate-pulse" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-200/30 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="w-full max-w-3xl flex flex-col items-center z-10">
        {!isListening && !activeIntent && (
          <button 
            onClick={initRecognition}
            className="group relative flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-2xl group-hover:bg-blue-400/40 transition-all duration-1000 animate-pulse" />
            <div className="relative w-32 h-32 bg-white/80 backdrop-blur-xl rounded-full border border-white shadow-2xl flex items-center justify-center transition-transform duration-700 hover:scale-110 active:scale-95">
               <div className="w-4 h-4 bg-slate-200 rounded-full animate-ping" />
            </div>
          </button>
        )}

        {activeIntent?.isSpecialIntent && outcomeContent && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-12 duration-1000">
             {outcomeContent}
          </div>
        )}
      </div>

      {showTick && (
        <div className="fixed bottom-12 right-12 animate-in fade-in zoom-in duration-500">
          <div className="p-4 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-slate-100">
            <Check size={32} className="text-slate-400" />
          </div>
        </div>
      )}
    </main>
  );
}
