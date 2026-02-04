"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { Trash2, Calendar, MapPin, Loader2, Cpu } from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart, getToolName, Message } from "ai";
import * as webllm from "@mlc-ai/web-llm";
import { detectSimpleTask } from "@/lib/routing";

export default function Home() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Client-side LLM state
  const [selectedModel, setSelectedModel] = useState("SmolLM2-135M-Instruct-q4f16_1-MLC");
  const [engine, setEngine] = useState<webllm.MLCEngineInterface | null>(null);
  const [isLocalModelLoading, setIsLocalModelLoading] = useState(false);
  const [localProgress, setLocalProgress] = useState("");
  const engineRef = useRef<webllm.MLCEngineInterface | null>(null);

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

  const isLoading = status === "streaming" || status === "submitted" || isLocalModelLoading;

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    localStorage.removeItem("chat_history");
  };

  /**
   * HYBRID ARCHITECTURE ROUTING LOGIC:
   * 
   * Simple tasks (greetings, short questions without tool intent) are processed
   * locally on the user's device using Web-LLM (SmolLM2 or Phi-3.5).
   * 
   * Complex tasks (requiring tool execution like restaurant search or calendar
   * management) are routed to the server-side GLM-based intelligence.
   * 
   * This reduces API costs, improves privacy for simple interactions, and
   * provides a responsive local-first experience when possible.
   */
  const handleClientSideExecution = async (text: string) => {
    const userMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      parts: [{ type: 'text', text }],
      createdAt: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLocalModelLoading(true);

    try {
      if (!engineRef.current || engineRef.current.getSelectedModel() !== selectedModel) {
        setLocalProgress("Loading model...");
        const newEngine = await webllm.CreateMLCEngine(selectedModel, {
          initProgressCallback: (report) => {
            setLocalProgress(report.text);
          },
        });
        engineRef.current = newEngine;
        setEngine(newEngine);
      }

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        parts: [{ type: 'text', text: "" }],
        createdAt: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      const chunks = await engineRef.current.chat.completions.create({
        messages: [{ role: "user", content: text }],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullResponse += content;
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { ...m, parts: [{ type: 'text', text: fullResponse }] } 
            : m
        ));
      }
    } catch (err: any) {
      console.error("Local model error:", err);
      setError("Local model error: " + (err.message || "Unknown error"));
    } finally {
      setIsLocalModelLoading(false);
      setLocalProgress("");
    }
  };

  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    setError(null);

    if (detectSimpleTask(input)) {
      console.log("Routing to local model...");
      await handleClientSideExecution(input);
    } else {
      try {
        await sendMessage({ text: input }, { body: { userLocation } });
        setInput("");
      } catch (err: any) {
        setError(err.message || "Failed to send message");
      }
    }
  };

  const handleRetry = () => {
    if (messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        const text = (lastUserMessage.parts.find(p => p.type === 'text') as any)?.text || "";
        setError(null);
        if (detectSimpleTask(text)) {
          handleClientSideExecution(text);
        } else {
          sendMessage({ text }, { body: { userLocation } });
        }
      }
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Intention Engine</h1>
          <p className="text-slate-500 text-sm mt-1">Hybrid Local/Cloud Intelligence</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border">
            <Cpu size={14} className="ml-2 text-slate-500" />
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs bg-transparent border-none focus:ring-0 cursor-pointer pr-8"
              disabled={isLoading}
            >
              <option value="SmolLM2-135M-Instruct-q4f16_1-MLC">SmolLM2-135M</option>
              <option value="Phi-3.5-mini-instruct-q4f16_1-MLC">Phi-3.5-mini</option>
            </select>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              <Trash2 size={16} />
              Clear
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
              placeholder="e.g. Hi there! (local) or plan a dinner (cloud)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isLocalModelLoading ? "Local..." : "Thinking..."}
                </>
              ) : (
                "Send"
              )}
            </button>
          </div>
          <div className="flex justify-between items-center">
            {userLocation && (<p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12} />Location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>)}
            {localProgress && <p className="text-[10px] text-blue-500 font-mono animate-pulse">{localProgress}</p>}
          </div>
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
                        <div className="text-xs text-red-500 font-mono">
                          Error: {toolInvocation.errorText}
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