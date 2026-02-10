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

  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [confirmation, setConfirmation] = useState<{ id: string; toolName: string; parameters: any } | null>(null);

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
      // Server-side execution is handled in route.ts, but we could handle client-side confirmation here if needed.
      // However, the AI SDK handles tool execution on the server by default if execute is provided in the tool definition.
      // For confirmation, we might need a more complex setup where we don't provide 'execute' on the server for some tools.
    },
  });

  const handleFeedback = (messageId: string, type: 'up' | 'down') => {
    setFeedback(prev => ({ ...prev, [messageId]: type }));
    // In a real app, send this to the backend
    console.log(`Feedback for ${messageId}: ${type}`);
  };

  const handleConfirm = async () => {
    if (!confirmation) return;
    // For this prototype, we'll just assume the server handles it, 
    // but in a full implementation, we'd send the confirmation back to the server.
    setConfirmation(null);
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      {/* ... header and form ... */}

      {confirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="text-blue-500" />
              Confirm Action
            </h2>
            <p className="text-slate-600">
              The AI wants to execute <span className="font-mono font-bold text-blue-600">{confirmation.toolName}</span> with the following details:
            </p>
            <pre className="bg-slate-50 p-3 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(confirmation.parameters, null, 2)}
            </pre>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setConfirmation(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ... rest of the UI ... */}

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
            <div className={`max-w-[80%] p-4 rounded-lg border shadow-sm relative group ${
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
                    <div key={partIndex} className={`mt-4 border rounded-lg p-3 ${
                      toolInvocation.state === 'output-available' ? 'bg-green-50 border-green-100' :
                      toolInvocation.state === 'output-error' ? 'bg-red-50 border-red-100' :
                      'bg-slate-50 border-slate-100 animate-pulse'
                    }`}>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                        {toolName === 'search_restaurant' && <MapPin size={12} className="text-blue-500" />}
                        {toolName === 'add_calendar_event' && <Calendar size={12} className="text-purple-500" />}
                        {toolName === 'send_email' && <Loader2 size={12} className="text-green-500" />}
                        {toolName === 'generate_document' && <Loader2 size={12} className="text-orange-500" />}
                        {toolName === 'lookup_data' && <Loader2 size={12} className="text-cyan-500" />}
                        {toolName.replace(/_/g, ' ')}
                        {toolInvocation.state === 'output-available' && <span className="text-green-600 ml-auto">Completed</span>}
                        {toolInvocation.state === 'output-error' && <span className="text-red-600 ml-auto">Failed</span>}
                      </div>
                      
                      {toolInvocation.state === 'output-available' ? (
                        <div className="space-y-2">
                          {(() => {
                            const output = toolInvocation.output as any;
                            return (
                              <>
                                {toolName === 'search_restaurant' && output.success && Array.isArray(output.result) ? (
                                  <div className="space-y-2">
                                    {output.result.length > 0 ? output.result.map((r: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between p-2 border rounded bg-white shadow-sm">
                                        <div>
                                          <p className="font-bold text-sm">{r.name}</p>
                                          <p className="text-xs text-slate-500">{r.address}</p>
                                        </div>
                                        <button
                                          onClick={() => {
                                            const time = "7 PM"; 
                                            sendMessage({ text: `I've selected ${r.name} at ${r.address}. Please add this to my calendar for tonight at ${time}.` }, {
                                              body: { userLocation }
                                            });
                                          }}
                                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                                        >
                                          Select
                                        </button>
                                      </div>
                                    )) : <p className="text-xs text-slate-500 italic">No restaurants found in this area.</p>}
                                  </div>
                                ) :
                                 toolName === 'add_calendar_event' && output.success && output.result?.download_url ? (
                                  <div className="py-2">
                                    <p className="text-xs text-slate-600 mb-2">Event created successfully!</p>
                                    <a 
                                      href={output.result.download_url}
                                      className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors text-sm w-full justify-center"
                                    >
                                      <Calendar size={16} />
                                      Download to Calendar (.ics)
                                    </a>
                                  </div>
                                ) : toolName === 'send_email' && output.success ? (
                                  <div className="text-xs p-2 bg-white rounded border border-green-200">
                                    <p className="text-green-700 font-bold">✓ Email Sent</p>
                                    <p className="text-slate-500 mt-1">Message ID: {output.result.messageId}</p>
                                  </div>
                                ) : toolName === 'generate_document' && output.success ? (
                                  <div className="py-2">
                                    <a 
                                      href={output.result.downloadUrl}
                                      className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors text-sm w-full justify-center"
                                    >
                                      Download Document
                                    </a>
                                  </div>
                                ) : (
                                  <div className="text-xs bg-white p-2 rounded border border-slate-200">
                                    {output.error ? (
                                      <p className="text-red-600 font-medium">Error: {output.error}</p>
                                    ) : (
                                      <pre className="overflow-auto max-h-40">
                                        {JSON.stringify(output.result || output, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : toolInvocation.state === 'output-error' ? (
                        <div className="text-xs text-red-600 bg-white p-2 rounded border border-red-200">
                          <p className="font-bold mb-1">Execution Error</p>
                          <p>{toolInvocation.errorText || "The tool failed to execute. Please try a different request or provide more details."}</p>
                          <button 
                            onClick={() => handleRetry()}
                            className="mt-2 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded font-bold transition-colors"
                          >
                            Retry Operation
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 size={14} className="animate-spin text-blue-500" />
                          <span>Searching for details...</span>
                        </div>
                      )}
                    </div>
                  );
                }
                
                return null;
              })}
              
              {m.role === 'assistant' && (
                <div className="absolute -bottom-8 left-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleFeedback(m.id, 'up')}
                    className={`p-1 rounded hover:bg-slate-100 ${feedback[m.id] === 'up' ? 'text-green-600' : 'text-slate-400'}`}
                  >
                    Was this helpful? 👍
                  </button>
                  <button 
                    onClick={() => handleFeedback(m.id, 'down')}
                    className={`p-1 rounded hover:bg-slate-100 ${feedback[m.id] === 'down' ? 'text-red-600' : 'text-slate-400'}`}
                  >
                    👎
                  </button>
                </div>
              )}
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