"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { Trash2, MapPin, Loader2, Bot, User } from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { ToolComponentRegistry } from "@/components/tools";

interface UserLocation {
  lat: number;
  lng: number;
}

// Type guard for tool UI parts
function isToolUIPart(part: any): part is { type: 'tool-invocation'; toolInvocation: any } {
  return part?.type === 'tool-invocation';
}

export default function Home() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");

  const { messages, setMessages, status, sendMessage, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    const savedChat = localStorage.getItem("chat_history");
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
  }, [setMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("chat_history", JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (err) => {
          console.error("Error getting location:", err);
        }
      );
    }
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("chat_history");
    setPendingConfirmations(new Set());
  }, [setMessages]);

  const handleConfirm = useCallback((toolName: string, toolCallId: string) => {
    addToolResult({
      tool: toolName,
      toolCallId,
      output: { confirmed: true },
    });
    setPendingConfirmations((prev) => {
      const next = new Set(prev);
      next.delete(toolCallId);
      return next;
    });
  }, [addToolResult]);

  const handleCancel = useCallback((toolName: string, toolCallId: string) => {
    addToolResult({
      tool: toolName,
      toolCallId,
      output: { confirmed: false, cancelled: true },
    });
    setPendingConfirmations((prev) => {
      const next = new Set(prev);
      next.delete(toolCallId);
      return next;
    });
  }, [addToolResult]);

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    sendMessage({ 
      text: input 
    }, {
      body: {
        userLocation
      }
    });
    setInput("");
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Intention Engine</h1>
            <p className="text-sm text-slate-500 mt-1">AI-powered assistant with multi-step reasoning</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={16} />
              Clear
            </button>
          )}
        </div>
        
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
          <form onSubmit={onFormSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              What would you like to do?
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="e.g., Find Italian restaurants nearby and add dinner to my calendar"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span className="hidden sm:inline">Thinking...</span>
                  </>
                ) : (
                  "Send"
                )}
              </button>
            </div>
            {userLocation && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin size={12} />
                Location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </p>
            )}
          </form>
        </div>

        <div className="space-y-4">
          {messages.map((m, messageIndex) => (
            <div 
              key={m.id || messageIndex} 
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                m.role === 'user' ? 'bg-blue-600' : 'bg-slate-200'
              }`}>
                {m.role === 'user' ? (
                  <User size={16} className="text-white" />
                ) : (
                  <Bot size={16} className="text-slate-600" />
                )}
              </div>
              
              <div className={`max-w-[85%] space-y-3 ${
                m.role === 'user' ? 'items-end' : 'items-start'
              }`}>
                {m.parts?.map((part: any, partIndex: number) => {
                  if (part.type === 'text' && part.text) {
                    return (
                      <div 
                        key={partIndex}
                        className={`p-4 rounded-2xl ${
                          m.role === 'user' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-white border border-slate-200 text-slate-800'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{part.text}</p>
                      </div>
                    );
                  }
                  
                  if (isToolUIPart(part)) {
                    const toolInvocation = part.toolInvocation;
                    const toolName = toolInvocation?.toolName || toolInvocation?.tool;
                    const toolCallId = toolInvocation?.toolCallId;
                    
                    return (
                      <div 
                        key={partIndex} 
                        className="w-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                      >
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              {toolName?.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {toolInvocation.state === 'input-available' && (
                              <span className="text-xs text-slate-400">Preparing...</span>
                            )}
                            {toolInvocation.state === 'output-available' && (
                              <span className="text-xs text-green-600 font-medium">Complete</span>
                            )}
                            {toolInvocation.state === 'output-error' && (
                              <span className="text-xs text-red-600 font-medium">Error</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="p-4">
                          {toolInvocation.state === 'output-available' && (
                            <ToolComponentRegistry
                              invocation={{
                                toolName: toolName || 'unknown',
                                state: toolInvocation.state,
                                output: toolInvocation.output,
                              }}
                              toolCallId={toolCallId}
                              toolName={toolName || 'unknown'}
                              onConfirm={handleConfirm}
                              onCancel={handleCancel}
                            />
                          )}
                          
                          {toolInvocation.state === 'output-error' && (
                            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                              <p className="text-sm text-red-600">
                                {toolInvocation.errorText || "An error occurred"}
                              </p>
                            </div>
                          )}
                          
                          {toolInvocation.state === 'input-available' && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 size={14} className="animate-spin" />
                              Executing {toolName?.replace(/_/g, ' ')}...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  
                  return null;
                })}
              </div>
            </div>
          ))}
          
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                <Bot size={16} className="text-slate-600" />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                <Loader2 size={16} className="animate-spin" />
                Thinking...
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
