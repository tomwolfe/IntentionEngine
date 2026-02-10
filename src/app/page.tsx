"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName } from "ai";
import { LocalLLMEngine } from "@/lib/local-llm-engine";
import { classifyIntent } from "@/lib/intent-schema";
import { executeTool } from "@/lib/tools";
import { Calendar, Mic, AlertCircle } from "lucide-react";

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

function GenericOutcomeCard({ result, toolName }: { result: any, toolName: string }) {
  const data = result?.result || result;
  
  if (!data) return null;

  const renderValue = (val: any): string => {
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return String(val);
  };

  const entries = typeof data === 'object' && data !== null 
    ? Object.entries(data).filter(([key]) => key !== 'success' && key !== 'error')
    : [['Result', renderValue(data)]];

  return (
    <div className="p-8 border border-slate-100 rounded-[2.5rem] bg-slate-50/50 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">{toolName.replace(/_/g, ' ')}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map(([key, value]) => (
          <div key={key} className="space-y-1">
            <p className="text-xs text-slate-400 capitalize">{key.replace(/_/g, ' ')}</p>
            <p className="text-slate-700 font-medium break-words">{renderValue(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [input, setInput] = useState("");
  const [loadProgress, setLoadProgress] = useState("");
  const [localResponse, setLocalResponse] = useState("");
  const [activeIntent, setActiveIntent] = useState<any>(null);
  const [isListening, setIsListening] = useState(false);
      const [auditLogId, setAuditLogId] = useState<string | null>(null);
  const [isExecutingChain, setIsExecutingChain] = useState(false);
  const [hasChainFailure, setHasChainFailure] = useState(false);
  const [showFailureDetails, setShowFailureDetails] = useState(false);
  const [clientAuditLog, setClientAuditLog] = useState<any>(null);
  const [whisperData, setWhisperData] = useState<{show: boolean, restaurant: any, wineShopResult: any, sessionContext: any}>({
    show: false, 
    restaurant: null, 
    wineShopResult: null,
    sessionContext: {}
  });
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Restore session context from sessionStorage if available
    const savedContext = sessionStorage.getItem('intent-session-context');
    if (savedContext) {
      setWhisperData(prev => ({ ...prev, sessionContext: JSON.parse(savedContext) }));
    }
    
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

  const updateSessionContext = (newContext: any) => {
    const updated = { ...whisperData.sessionContext, ...newContext };
    setWhisperData(prev => ({ ...prev, sessionContext: updated }));
    sessionStorage.setItem('intent-session-context', JSON.stringify(updated));
  };

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
                title: restaurant.name,
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

        const dnaCuisine = typeof window !== 'undefined' ? sessionStorage.getItem('intent-dna-cuisine') || undefined : undefined;

        let classification = await classifyIntent(currentInput, whisperData.sessionContext);
        
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
            { body: { 
                userLocation, 
                isSpecialIntent: finalClassification.isSpecialIntent, 
                dnaCuisine,
                session_context: whisperData.sessionContext
              } 
            }
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
        setHasChainFailure(false);
        setClientAuditLog(null);
        
        // Offline Mode: Check if offline
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        const toolResults: any[] = [];
        let restaurantData: any = null;
        let hasCalendarEvent = false;
        let wineShopResult: any = null;
        let failedStepIndex: number | null = null;
        let failureError: string | null = null;

        try {
          for (let i = 0; i < plan.ordered_steps.length; i++) {
            const step = plan.ordered_steps[i];
            
            // Autonomous Wine Shop: Trigger in background after restaurant search
            if (restaurantData?.cuisine && step.tool_name === 'add_calendar_event') {
              try {
                const res = await executeTool('find_event', {
                  location: restaurantData.address,
                  query: 'wine shop'
                });
                if (res?.success && res?.result?.[0]) {
                  wineShopResult = res.result[0];
                }
              } catch (e) {
                console.warn("Silent wine shop search failed", e);
              }
            }

            try {
              const { result } = await executeTool(id, i);
              
              toolResults.push({
                type: "dynamic-tool",
                toolName: step.tool_name,
                toolCallId: `call_${id}_${i}`,
                state: "output-available",
                input: step.parameters,
                output: result
              });
              
              // Track restaurant data for whisper and session context
              if (step.tool_name === 'search_restaurant' && result?.success && result?.result?.[0]) {
                restaurantData = result.result[0];
                updateSessionContext({
                  cuisine: restaurantData.cuisine,
                  ambiance: originalClassification.isSpecialIntent ? 'romantic' : 'standard',
                  occasion: originalClassification.metadata?.isDateNight ? 'date_night' : undefined
                });
              }
              
              // Track if we have a calendar event
              if (step.tool_name === 'add_calendar_event') {
                hasCalendarEvent = true;
              }
            } catch (stepErr: any) {
              console.error(`Step ${i} (${step.tool_name}) failed:`, stepErr);
              failedStepIndex = i;
              failureError = stepErr.message;
              setHasChainFailure(true);
              break; // Halt execution on critical step failure
            }
          }
  
          // Propagation: Ensure restaurant details flow into the calendar part for UI/ICS consistency
          const searchPart = toolResults.find(p => p.toolName === 'search_restaurant');
          const calendarPart = toolResults.find(p => p.toolName === 'add_calendar_event');

          if (searchPart && calendarPart) {
            const restaurant = searchPart.output.result[0];
            if (restaurant) {
              calendarPart.input = {
                ...calendarPart.input,
                title: restaurant.name,
                location: restaurant.address,
                restaurant_name: restaurant.name,
                restaurant_address: restaurant.address,
                wine_shop: wineShopResult ? { name: wineShopResult.name, address: wineShopResult.location } : undefined
              };
            }
          }
          
          // Pre-emptive Whisper Validation
          let finalSummary = plan.summary;
          if (failedStepIndex !== null) {
            finalSummary = "We encountered a minor issue while preparing your plans. Please review the details below.";
          } else {
            const forbiddenWords = ["found", "searched", "scheduled", "prepared", "I've"];
            const isBadWhisper = !finalSummary || finalSummary.length > 100 || forbiddenWords.some(word => finalSummary.toLowerCase().includes(word));

            if (isBadWhisper || isOffline) {
              try {
                const engine = await localProvider.getEngine(() => {});
                await engine.loadModel("Phi-3.5-mini-instruct-q4f16_1-MLC");
                const whisperPrompt = `Describe this in one poetic sentence under 100 chars: ${originalClassification.reason}. No AI words.`;
                finalSummary = await engine.generate(whisperPrompt);
                if (finalSummary.length > 100) finalSummary = "Your arrangements are ready.";
              } catch (err) {
                finalSummary = "A bottle of wine has been suggested for your evening.";
              }
            }
          }

          setWhisperData(prev => ({ ...prev, show: false, restaurant: restaurantData, wineShopResult }));

          // Finalize the chain by updating messages to trigger the result card
          setMessages([
            ...messages,
            {
              id: `automated_${id}`,
              role: "assistant",
              parts: [
                { type: "text", text: finalSummary },
                ...toolResults
              ]
            }
          ]);
          
          // Capture client-side audit log if failure occurred
          if (failedStepIndex !== null) {
            setClientAuditLog({
              id: id,
              timestamp: new Date().toISOString(),
              plan: plan,
              steps: [
                ...toolResults.map((tr, idx) => ({
                  step_index: idx,
                  tool_name: tr.toolName,
                  status: "executed",
                  input: tr.input,
                  output: tr.output
                })),
                {
                  step_index: failedStepIndex,
                  tool_name: plan.ordered_steps[failedStepIndex].tool_name,
                  status: "failed",
                  input: plan.ordered_steps[failedStepIndex].parameters,
                  error: failureError
                }
              ],
              final_outcome: {
                status: "FAILURE",
                message: `Execution failed at step ${failedStepIndex}: ${failureError}`
              }
            });
          }

          // Restore the classification state so UI logic (like isSimplified) works correctly
          setActiveIntent({ ...originalClassification, plan: { ...plan, summary: finalSummary } });
        } catch (err) {
          console.error("Automated chain failed", err);
          setActiveIntent({ type: "ERROR", isSpecialIntent: true });
        } finally {
          setIsExecutingChain(false);
        }
      };
      
      const handleWhisperYes = async () => {
        if (!whisperData.restaurant) return;
        
        try {
          // Execute find_event to search for wine shops near the restaurant
          const result = await executeTool('find_event', {
            location: whisperData.restaurant.address,
            query: 'wine shop'
          });
          
          if (result?.success && result?.result?.[0]) {
            setWhisperData(prev => ({
              ...prev,
              show: false,
              wineShopResult: result.result[0]
            }));
          }
        } catch (err) {
          console.error("Wine shop whisper failed", err);
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

    // Search for specialized tool results
    const searchPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'search_restaurant' && p.state === 'output-available');
    const eventPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'find_event' && p.state === 'output-available');
    const calendarPart = lastAssistantMessage.parts.find(p => isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available');
    
    // Identify other tool results that need generic cards
    const specializedToolNames = ['search_restaurant', 'find_event', 'add_calendar_event'];
    const genericParts = lastAssistantMessage.parts.filter(p => 
      isToolUIPart(p) && 
      p.state === 'output-available' && 
      !specializedToolNames.includes(getToolName(p))
    );

    // In v2.0, we only show the final card when everything is ready OR the simplified plan
    const isComplete = calendarPart && (calendarPart as any).state === 'output-available';
    const isSimplified = searchPart && !calendarPart && activeIntent?.type !== "COMPLEX_PLAN";
    const hasAnyResults = genericParts.length > 0;
    const isFailed = hasChainFailure;

    if (isComplete || isSimplified || isFailed || hasAnyResults) {
      const restaurant = (searchPart as any)?.output?.result?.[0] || { 
        name: (calendarPart as any)?.input?.title || "Selected Location", 
        address: (calendarPart as any)?.input?.location || "Confirmed" 
      };
      
      const event = (eventPart as any)?.output?.result?.[0];
      
      // Intent Fusion: Check for multiple calendar events
      const allCalendarParts = lastAssistantMessage?.parts?.filter((p: any) => 
        isToolUIPart(p) && getToolName(p) === 'add_calendar_event' && p.state === 'output-available'
      ) || [];
      
      const isFused = allCalendarParts.length >= 2 || event !== undefined;
      
      let downloadUrl: string | undefined;
      
      // Get time from first calendar event for display
      const firstCalendarPart = allCalendarParts[0] || calendarPart;
      const startTime = (firstCalendarPart as any)?.output?.result?.start_iso || (firstCalendarPart as any)?.input?.start_time;
      
      let formattedTime = null;
      if (startTime) {
        const date = new Date(startTime);
        if (!isNaN(date.getTime())) {
          formattedTime = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
      }
      
      if (allCalendarParts.length >= 2) {
        // Generate fused ICS URL with multiple events
        const events = allCalendarParts.map((part: any) => ({
          title: part.input?.title || 'Event',
          start: part.input?.start_time,
          end: part.input?.end_time,
          location: part.input?.location || part.input?.restaurant_address || '',
          description: part.input?.description || `Restaurant: ${part.input?.restaurant_name || 'N/A'}\nAddress: ${part.input?.restaurant_address || 'N/A'}`
        }));
        
        const params = new URLSearchParams({
          multiple_events: 'true',
          events: encodeURIComponent(JSON.stringify(events))
        });
        downloadUrl = `/api/download-ics?${params.toString()}`;
      } else if (calendarPart && (calendarPart as any).state === 'output-available') {
        const calendarResult = (calendarPart as any)?.output?.result;
        downloadUrl = calendarResult?.download_url;
        if (searchPart && downloadUrl) {
          const r = (searchPart as any)?.output?.result?.[0];
          if (r) {
            try {
              const url = new URL(downloadUrl, window.location.origin);
              url.searchParams.set('title', r.name);
              url.searchParams.set('location', r.address);
              url.searchParams.set('description', `Restaurant: ${r.name}\nAddress: ${r.address}`);
              if (event) {
                const existingDesc = url.searchParams.get('description');
                url.searchParams.set('description', `${existingDesc}\n\nEvent: ${event.name}\nLocation: ${event.location}`);
              }
              downloadUrl = url.pathname + url.search;
            } catch (e) {
              console.warn("Failed to repair download URL", e);
            }
          }
        }
      }

      const handleIcsClick = () => {
        if ((restaurant as any)?.cuisine) {
          sessionStorage.setItem('intent-dna-cuisine', (restaurant as any).cuisine);
        }
      };

              return (
                <div className="space-y-4 pt-4">
                  {/* Generic results like weather or directions */}
                              {genericParts.map((p, i) => (
                                <GenericOutcomeCard key={i} result={(p as any).output} toolName={getToolName(p as any)} />
                              ))}      
                  {(isComplete || isSimplified || isFailed) && (
                    <div className="p-10 border border-slate-100 rounded-[3rem] bg-white shadow-[0_40px_80px_rgba(0,0,0,0.03)] animate-in zoom-in-95 duration-700">
                      {allCalendarParts.length >= 2 ? (
                      // Intent Fusion: Unified card for multiple events
                      <div className="mb-10">
                        {allCalendarParts.map((part: any, index: number) => {
                          const eventStart = part.output?.result?.start_iso || part.input?.start_time;
                          let eventTime = null;
                          if (eventStart) {
                            const date = new Date(eventStart);
                            if (!isNaN(date.getTime())) {
                              eventTime = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                            }
                          }
                          const isMainEvent = index === 0;
                          
                          return (
                            <div key={index}>
                              <div className={isMainEvent ? "mb-8" : "mt-8"}>
                                <h3 className={`font-bold tracking-tight mb-3 ${isMainEvent ? 'text-4xl text-slate-900' : 'text-2xl text-slate-700'}`}>
                                  {part.input?.title || 'Event'}
                                </h3>
                                <div className="flex flex-col gap-2">
                                  <p className="text-slate-400 text-xl font-light">{part.input?.location || part.input?.restaurant_address || 'Location TBD'}</p>
                                  {eventTime && (
                                    <p className={`font-semibold mt-2 ${isMainEvent ? 'text-2xl text-slate-900' : 'text-xl text-slate-600'}`}>
                                      {eventTime}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {index === 0 && allCalendarParts.length > 1 && (
                                <div className="h-px bg-slate-100 w-full my-8" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Standard single event card (possibly fused with event)
                      <div className="mb-10">
                        <h3 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">{restaurant.name}</h3>
                        <div className="flex flex-col gap-2">
                          <p className="text-slate-400 text-xl font-light">{restaurant.address}</p>
                          {formattedTime && (
                            <p className="text-slate-900 text-2xl font-semibold mt-2">{formattedTime}</p>
                          )}
                        </div>
      
                        {event && (
                          <>
                            <div className="h-px bg-slate-100 w-full my-8" />
                            <h4 className="text-2xl font-bold text-slate-700 mb-2">{event.name}</h4>
                            <p className="text-slate-400 text-xl font-light">{event.location}</p>
                          </>
                        )}
                      </div>
                    )}
      
                    {restaurant.suggested_wine && !isFused && (
                      <div className="bg-amber-50/30 p-8 rounded-3xl border border-amber-100/50 mb-10 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/50" />
                        <p className="text-2xl text-amber-900/80 font-serif italic leading-relaxed">
                          "Pair with {restaurant.suggested_wine} to elevate the evening."
                        </p>
                      </div>
                    )}
      
                    {downloadUrl && (
                      <div className="space-y-6">
                        <div className="h-px bg-slate-100 w-full" />
                        <a 
                          href={downloadUrl}
                          onClick={handleIcsClick}
                          className="flex items-center justify-center gap-4 w-full py-6 px-8 bg-slate-900 text-white rounded-[2rem] font-bold text-xl hover:bg-black transition-all active:scale-[0.98] shadow-2xl shadow-slate-300 group hover:shadow-black/10"
                        >
                          <Calendar size={28} className="group-hover:rotate-6 transition-transform" />
                          Finalize & Download (.ics)
                        </a>
                        <p className="text-center text-slate-400 text-sm font-medium tracking-wide uppercase">The Final Act of Will</p>
                      </div>
                    )}
                  </div>
                )}
      
                {hasChainFailure && (
                  <div className="mt-10 p-8 border border-amber-100 bg-amber-50/30 rounded-[2.5rem] flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-4">
                      <AlertCircle size={24} />
                    </div>
                    <p className="text-amber-900 text-lg font-medium mb-6">
                      We encountered a minor issue while preparing your plans. Please review the details below.
                    </p>
                    <button 
                      onClick={() => setShowFailureDetails(true)}
                      className="px-8 py-3 bg-amber-200/50 hover:bg-amber-200 text-amber-800 rounded-full text-sm font-bold transition-all active:scale-95"
                    >
                      View Details
                    </button>
                  </div>
                )}
                
                {/* Contextual Completion Whisper */}
                {whisperData.show && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="text-slate-500 text-sm italic mb-3">
                      Would you like me to find a nearby wine shop for a bottle to bring?
                    </p>
                    <button
                      onClick={handleWhisperYes}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
                    >
                      Yes
                    </button>
                  </div>
                )}
                
                {/* Wine Shop Result */}
                {whisperData.wineShopResult && (
                  <div className="mt-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Suggested Wine Shop</p>
                    <h4 className="text-lg font-semibold text-slate-800">{whisperData.wineShopResult.name}</h4>
                    <p className="text-slate-500 text-sm">{whisperData.wineShopResult.location}</p>
                    {whisperData.wineShopResult.url && (
                      <a 
                        href={whisperData.wineShopResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 text-sm mt-2 inline-block hover:underline"
                      >
                        View Details
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          }    // Default "Thinking" state for any non-final state - Now silent and subtle
    return (
      <div className="flex flex-col justify-center items-center py-24">
        <div className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-pulse" />
      </div>
    );
  }, [messages, localResponse, activeIntent, hasChainFailure]);

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
      
      {showFailureDetails && clientAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-900">Execution Diagnostics</h3>
              <button 
                onClick={() => setShowFailureDetails(false)}
                className="text-slate-400 hover:text-slate-900 p-2 transition-colors"
              >
                <span className="text-sm font-bold uppercase tracking-widest">Close</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-slate-900">
              <pre className="text-xs font-mono text-emerald-400/90 whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(clientAuditLog, null, 2)}
              </pre>
            </div>
            <div className="p-6 bg-slate-50 text-center">
              <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Immutable Audit Record • {clientAuditLog.id}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}