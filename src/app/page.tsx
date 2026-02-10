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
                        {toolName === 'search_restaurant' ? <MapPin size={12} /> : 
                         toolName === 'geocode_location' ? <MapPin size={12} /> :
                         <Calendar size={12} />}
                        {toolName.replace(/_/g, ' ')}
                      </div>
                      
                      {toolInvocation.state === 'output-available' ? (
                        <div className="space-y-2">
                          {(() => {
                            const output = toolInvocation.output as any;
                            
                            if (toolName === 'geocode_location' && output.success) {
                              return (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-4">
                                  <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                                    <MapPin size={24} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold">Coordinates Found</p>
                                    <p className="text-xs text-slate-500">Lat: {output.result.lat.toFixed(4)}, Lon: {output.result.lon.toFixed(4)}</p>
                                  </div>
                                </div>
                              );
                            }

                            if (toolName === 'search_restaurant' && output.success && Array.isArray(output.result)) {
                              return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {output.result.length === 0 ? (
                                    <p className="text-sm text-slate-500 col-span-2 italic">No restaurants found.</p>
                                  ) : output.result.map((r: any, i: number) => (
                                    <div key={i} className="group relative flex flex-col p-3 border rounded-lg bg-white hover:border-blue-300 hover:shadow-md transition-all">
                                      <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-sm leading-tight pr-4">{r.name}</h4>
                                        <div className="flex items-center text-amber-500">
                                          <span className="text-xs font-bold mr-1">{r.rating || (4 + Math.random()).toFixed(1)}</span>
                                          <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                        </div>
                                      </div>
                                      <p className="text-xs text-slate-500 mb-4 flex-1">{r.address}</p>
                                      <button
                                        onClick={() => {
                                          const time = "7 PM";
                                          sendMessage({ text: `I've selected ${r.name} at ${r.address}. Please add this to my calendar for tonight at ${time}.` }, {
                                            body: { userLocation }
                                          });
                                        }}
                                        className="w-full py-1.5 bg-blue-50 text-blue-600 rounded text-xs font-bold group-hover:bg-blue-600 group-hover:text-white transition-colors"
                                      >
                                        Select Restaurant
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              );
                            }

                            if (toolName === 'add_calendar_event' && output.success && output.result?.download_url) {
                              const details = output.result.event_details;
                              return (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                  <div className="flex items-start gap-3 mb-4">
                                    <div className="bg-white p-2 rounded border border-green-200 text-green-600">
                                      <Calendar size={20} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-green-800">Ready to Schedule</p>
                                      <p className="text-xs text-green-700">A calendar invite has been generated.</p>
                                    </div>
                                  </div>
                                  
                                  {details && (
                                    <div className="bg-white/50 p-3 rounded border border-green-200 mb-4 space-y-2">
                                      <p className="text-sm font-bold text-slate-800">{details.title}</p>
                                      <div className="flex flex-col gap-1">
                                        <p className="text-xs text-slate-600 flex items-center gap-1">
                                          <Calendar size={12} /> {new Date(details.start_time).toLocaleString()}
                                        </p>
                                        {details.location && (
                                          <p className="text-xs text-slate-600 flex items-center gap-1">
                                            <MapPin size={12} /> {details.location}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  <a 
                                    href={output.result.download_url}
                                    className="w-full flex justify-center items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors text-sm shadow-sm"
                                  >
                                    <Calendar size={16} />
                                    Download (.ics)
                                  </a>
                                </div>
                              );
                            }

                            return (
                              <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-40">
                                {JSON.stringify(output, null, 2)}
                              </pre>
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