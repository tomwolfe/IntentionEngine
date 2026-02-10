"use client";

import { Search, ExternalLink } from "lucide-react";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  reasoning?: string;
}

export function SearchResults({ results, reasoning }: SearchResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-600">No search results found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reasoning && (
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
          <p className="text-xs text-purple-700">
            <span className="font-semibold">Search reasoning:</span> {reasoning}
          </p>
        </div>
      )}
      
      <div className="space-y-3">
        {results.map((result, index) => (
          <div
            key={index}
            className="p-3 bg-white rounded-lg border border-slate-200 hover:border-purple-300 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded flex items-center justify-center mt-0.5">
                <Search className="w-3 h-3 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 group"
                >
                  <h3 className="font-medium text-sm text-blue-600 group-hover:underline truncate">
                    {result.title}
                  </h3>
                  <ExternalLink className="w-3 h-3 text-slate-400 flex-shrink-0" />
                </a>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {result.snippet}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
