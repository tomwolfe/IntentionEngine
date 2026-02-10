"use client";

import { Calendar, Clock, MapPin, Download, CheckCircle, AlertCircle } from "lucide-react";

interface CalendarEvent {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  status?: string;
  message?: string;
  download_url?: string;
}

interface CalendarPreviewProps {
  event: CalendarEvent;
  isDraft?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function CalendarPreview({ 
  event, 
  isDraft = false, 
  onConfirm, 
  onCancel 
}: CalendarPreviewProps) {
  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const start = formatDateTime(event.start_time);
  const end = formatDateTime(event.end_time);

  return (
    <div className={`p-4 rounded-lg border ${isDraft ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        {isDraft ? (
          <AlertCircle className="w-5 h-5 text-amber-600" />
        ) : (
          <CheckCircle className="w-5 h-5 text-green-600" />
        )}
        <span className={`text-sm font-semibold ${isDraft ? 'text-amber-800' : 'text-green-800'}`}>
          {isDraft ? 'Draft Event' : 'Event Confirmed'}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{event.title}</h3>
            <p className="text-sm text-slate-600">{start.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>{start.time} - {end.time}</span>
        </div>

        {event.location && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin className="w-4 h-4 text-slate-400" />
            <span>{event.location}</span>
          </div>
        )}
      </div>

      {isDraft && onConfirm && onCancel && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-amber-200">
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-white text-slate-700 rounded-lg font-medium border border-slate-300 hover:bg-slate-50 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {!isDraft && event.download_url && (
        <div className="mt-4 pt-3 border-t border-green-200">
          <a
            href={event.download_url}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Download .ics
          </a>
        </div>
      )}

      {event.message && (
        <p className="mt-3 text-xs text-slate-500">{event.message}</p>
      )}
    </div>
  );
}
