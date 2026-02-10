"use client";

import { ReactNode } from "react";
import { RestaurantCard } from "./RestaurantCard";
import { CalendarPreview } from "./CalendarPreview";
import { WeatherCard } from "./WeatherCard";
import { SearchResults } from "./SearchResults";

export type ToolInvocation = {
  toolName: string;
  state: "input-available" | "output-available" | "output-error";
  output?: any;
  errorText?: string;
};

export interface ToolComponentRegistryProps {
  invocation: ToolInvocation;
  onConfirm?: (toolName: string, toolCallId: string) => void;
  onCancel?: (toolName: string, toolCallId: string) => void;
  toolCallId?: string;
  toolName?: string;
}

export function ToolComponentRegistry({
  invocation,
  onConfirm,
  onCancel,
  toolCallId,
  toolName: propToolName
}: ToolComponentRegistryProps): ReactNode {
  const { toolName: invocationToolName, state, output, errorText } = invocation;
  const toolName = propToolName || invocationToolName;

  if (state === "output-error") {
    return (
      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
        <p className="text-sm text-red-600">Error: {errorText}</p>
      </div>
    );
  }

  if (state !== "output-available" || !output) {
    return null;
  }

  switch (toolName) {
    case "search_restaurant":
      if (output.success && Array.isArray(output.result)) {
        return (
          <RestaurantCard 
            results={output.result} 
            reasoning={output.reasoning}
          />
        );
      }
      return (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">{output.error || "No results found"}</p>
        </div>
      );

    case "add_calendar_event":
      if (output.success && output.result) {
        const isDraft = output.draft === true;
        return (
          <CalendarPreview
            event={output.result}
            isDraft={isDraft}
            onConfirm={isDraft && toolCallId && onConfirm ? () => onConfirm(toolName, toolCallId) : undefined}
            onCancel={isDraft && toolCallId && onCancel ? () => onCancel(toolName, toolCallId) : undefined}
          />
        );
      }
      return (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">{output.error || "Unable to create event"}</p>
        </div>
      );

    case "web_search":
      if (output.success && Array.isArray(output.result)) {
        return (
          <SearchResults 
            results={output.result}
            reasoning={output.reasoning}
          />
        );
      }
      return (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">{output.error || "No search results"}</p>
        </div>
      );

    case "get_weather":
      if (output.success && output.result) {
        return <WeatherCard data={output.result} />;
      }
      return (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">{output.error || "Weather data unavailable"}</p>
        </div>
      );

    default:
      return (
        <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-60 border border-slate-200">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}
