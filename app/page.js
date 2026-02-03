'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, CheckCircle, AlertCircle, Clock, MapPin, Calendar, Users } from 'lucide-react';

export default function Home() {
  const [intent, setIntent] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    // Auto-focus the textarea when component mounts
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!intent.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intent }),
      });

      if (!response.ok) {
        throw new Error('Failed to process intent');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to render action parameters with appropriate icons
  const renderActionParams = (params) => {
    return Object.entries(params).map(([key, value]) => {
      let icon = null;

      switch(key.toLowerCase()) {
        case 'time':
        case 'date':
          icon = <Clock className="h-4 w-4 text-gray-500" />;
          break;
        case 'location':
        case 'destination':
        case 'pickup_location':
          icon = <MapPin className="h-4 w-4 text-gray-500" />;
          break;
        case 'party_size':
        case 'attendees':
          icon = <Users className="h-4 w-4 text-gray-500" />;
          break;
        default:
          icon = <div className="w-4 h-4" />; // Empty space to align
      }

      return (
        <div key={key} className="flex items-start mt-1">
          <div className="mr-2 mt-0.5">{icon}</div>
          <div>
            <span className="font-medium text-gray-700 capitalize">{key}:</span>
            <span className="ml-1 text-gray-600">
              {typeof value === 'object'
                ? JSON.stringify(value)
                : Array.isArray(value)
                  ? value.join(', ')
                  : String(value)}
            </span>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl font-semibold text-gray-900">Intention Engine</h1>
          <p className="mt-2 text-gray-600">Transform natural language into orchestrated actions</p>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Input Section */}
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative rounded-lg shadow-sm">
                <textarea
                  ref={textareaRef}
                  rows={4}
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  disabled={isLoading}
                  placeholder="Describe your intent... (e.g., 'I'm taking Sarah to dinner Friday')"
                  className="block w-full px-4 py-4 pr-12 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
                />
                <button
                  type="submit"
                  disabled={!intent.trim() || isLoading}
                  className={`absolute right-3 bottom-3 p-2 rounded-md ${
                    !intent.trim() || isLoading
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isLoading ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>

            {/* Loading State - Pulsing Animation Instead of Loading Bar */}
            {isLoading && (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
            )}
          </div>

          {/* Results Section */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Completed Outcomes</h2>

              {result.execution_results && result.execution_results.length > 0 ? (
                <div className="space-y-4">
                  {result.execution_results.map((execution, index) => {
                    const action = execution.action;
                    const isSuccess = execution.status === 'success';

                    return (
                      <div
                        key={index}
                        className={`p-4 border rounded-lg bg-white shadow-sm transition-all duration-300 ${
                          isSuccess
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-start">
                          <div className={`mr-3 mt-1 ${isSuccess ? 'text-green-600' : 'text-red-600'}`}>
                            {isSuccess ? (
                              <CheckCircle className="h-5 w-5" />
                            ) : (
                              <AlertCircle className="h-5 w-5" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center">
                              <h3 className="text-lg font-medium text-gray-900">{action.service}</h3>
                              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isSuccess
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {isSuccess ? 'Completed' : 'Failed'}
                              </span>
                            </div>

                            <div className="mt-2 text-sm text-gray-600">
                              <div className="flex items-center mb-1">
                                <span className="font-medium">Action:</span>
                                <span className="ml-1">{action.action.replace('_', ' ')}</span>
                              </div>

                              {renderActionParams(action.params)}

                              {isSuccess && execution.result && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Execution Result</div>
                                  <div className="text-xs bg-gray-100 p-2 rounded">
                                    {execution.result.success !== undefined && (
                                      <div>Success: {execution.result.success.toString()}</div>
                                    )}
                                    {execution.result.reservation_id && (
                                      <div>Reservation ID: {execution.result.reservation_id}</div>
                                    )}
                                    {execution.result.ride_id && (
                                      <div>Ride ID: {execution.result.ride_id}</div>
                                    )}
                                    {execution.result.event_id && (
                                      <div>Event ID: {execution.result.event_id}</div>
                                    )}
                                    {execution.result.confirmation_code && (
                                      <div>Confirmation: {execution.result.confirmation_code}</div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {!isSuccess && execution.error && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="text-xs uppercase tracking-wide text-red-500 mb-1">Error</div>
                                  <div className="text-xs text-red-700 bg-red-100 p-2 rounded">
                                    {execution.error}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-700">No actions were executed for this intent.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-3xl mx-auto text-center text-sm text-gray-500">
          <p>Intention Engine • Powered by GLM-4.7-flash simulation</p>
        </div>
      </footer>
    </div>
  );
}