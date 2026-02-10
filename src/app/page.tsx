"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { Trash2, MapPin, Loader2, Bot, User, Target, CheckCircle2, Circle, Brain } from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { ToolComponentRegistry } from "@/components/tools";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface UserLocation {
  lat: number;
  lng: number;
}

interface GoalStatus {
  objective: string;
  steps_completed: string[];
  next_step?: string;
}

function isToolUIPart(part: any): part is { type: 'tool-invocation'; toolInvocation: any } {
  return part?.type === 'tool-invocation';
}

export default function Home() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [goal, setGoal] = useState<GoalStatus | null>(null);
  const [input, setInput] = useState("");

  const { messages, setMessages, status, sendMessage, addToolResult } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Load context and history
  useEffect(() => {
    const savedChat = localStorage.getItem("chat_history");
    const savedGoal = localStorage.getItem("current_goal");
    if (savedChat) {
      try { setMessages(JSON.parse(savedChat)); } catch (e) { console.error(e); }
    }
    if (savedGoal) {
      try { setGoal(JSON.parse(savedGoal)); } catch (e) { console.error(e); }
    }
  }, [setMessages]);

  // Persist history and handle background tools
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("chat_history", JSON.stringify(messages));
      
      // Check for background tool outputs
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.parts) {
        lastMessage.parts.forEach((part: any) => {
          if (isToolUIPart(part) && part.toolInvocation.state === 'output-available') {
            const { toolName, output } = part.toolInvocation;
            if (toolName === 'update_goal' && output.success) {
              const newGoal = output.result;
              setGoal(newGoal);
              localStorage.setItem("current_goal", JSON.stringify(newGoal));
            }
            if (toolName === 'update_user_context' && output.success) {
              const existingContext = localStorage.getItem("user_context") || "";
              localStorage.setItem("user_context", existingContext + "\n" + output.result.context);
            }
          }
        });
      }
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (err) => console.error("Location error:", err)
      );
    }
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setGoal(null);
    localStorage.removeItem("chat_history");
    localStorage.removeItem("current_goal");
  }, [setMessages]);

  const handleConfirm = useCallback((toolName: string, toolCallId: string) => {
    addToolResult({ tool: toolName, toolCallId, output: { confirmed: true } });
  }, [addToolResult]);

  const handleCancel = useCallback((toolName: string, toolCallId: string) => {
    addToolResult({ tool: toolName, toolCallId, output: { confirmed: false, cancelled: true } });
  }, [addToolResult]);

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ content: input }, { body: { userLocation } });
    setInput("");
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar: Goal Tracker */}
      <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-6 flex-shrink-0">
        <div className="sticky top-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-900 tracking-tight">Engine Status</h2>
          </div>

          {goal ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Current Objective</h3>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">{goal.objective}</p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Steps Completed</h3>
                <ul className="space-y-3">
                  {goal.steps_completed.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{step}</span>
                    </li>
                  ))}
                  {goal.next_step && (
                    <li className="flex items-start gap-2 text-sm text-blue-600 font-medium animate-pulse">
                      <Circle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>{goal.next_step}</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 italic">No active objective.<br/>Start a conversation to set a goal.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Intention Engine</h1>
            <p className="text-sm text-slate-500">GLM-4 Flash • Powered by z.ai</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-2 text-slate-400 hover:text-red-500 text-sm font-medium transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={16} />
              Reset
            </button>
          )}
        </header>
        
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <form onSubmit={onFormSubmit} className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                placeholder="Find a coffee shop near me and add a break to my calendar..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-slate-900 text-white px-6 py-3.5 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold transition-all shadow-sm active:scale-95"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : "Execute"}
              </button>
            </div>
            {userLocation && (
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5 px-1 uppercase tracking-widest font-medium">
                <MapPin size={10} />
                Location Active • {userLocation.lat.toFixed(2)}, {userLocation.lng.toFixed(2)}
              </p>
            )}
          </form>
        </div>

        <div className="space-y-6 pb-20">
          {messages.map((m, messageIndex) => (
            <div 
              key={m.id || messageIndex} 
              className={cn("flex gap-4", m.role === 'user' ? "flex-row-reverse" : "flex-row")}
            >
              <div className={cn(
                "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm",
                m.role === 'user' ? "bg-slate-900" : "bg-white border border-slate-200"
              )}>
                {m.role === 'user' ? <User size={18} className="text-white" /> : <Bot size={18} className="text-blue-600" />}
              </div>
              
              <div className={cn("max-w-[85%] space-y-4", m.role === 'user' ? "items-end" : "items-start")}>
                {m.parts?.map((part: any, partIndex: number) => {
                  if (part.type === 'text' && part.text) {
                    const isThinking = m.role === 'assistant' && partIndex === 0;
                    return (
                      <div 
                        key={partIndex}
                        className={cn(
                          "p-4 rounded-2xl text-sm leading-relaxed",
                          m.role === 'user' 
                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" 
                            : isThinking
                              ? "bg-slate-100/50 border border-slate-200 text-slate-600 font-medium italic"
                              : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                        )}
                      >
                        {isThinking && (
                          <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest font-bold text-slate-400 not-italic">
                            <Brain size={12} /> Thinking Process
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{part.text}</p>
                      </div>
                    );
                  }
                  
                  if (isToolUIPart(part)) {
                    const toolInvocation = part.toolInvocation;
                    const toolName = toolInvocation?.toolName || toolInvocation?.tool;
                    if (['update_goal', 'update_user_context'].includes(toolName)) return null;

                    return (
                      <div key={partIndex} className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {toolName?.replace(/_/g, ' ')}
                          </span>
                          {toolInvocation.state === 'output-available' && <CheckCircle2 size={12} className="text-green-500" />}
                        </div>
                        <div className="p-4">
                          <ToolComponentRegistry
                            invocation={{
                              toolName: toolName || 'unknown',
                              state: toolInvocation.state,
                              output: toolInvocation.output,
                            }}
                            toolCallId={toolInvocation.toolCallId}
                            onConfirm={handleConfirm}
                            onCancel={handleCancel}
                          />
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
            <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                <Loader2 size={18} className="text-blue-600 animate-spin" />
              </div>
              <div className="flex items-center gap-3 bg-slate-100/50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-400 italic font-medium">
                Engine is initializing...
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}