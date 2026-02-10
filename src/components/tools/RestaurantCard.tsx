"use client";

import { MapPin, Star, Navigation } from "lucide-react";

interface Restaurant {
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lon: number;
  };
}

interface RestaurantCardProps {
  results: Restaurant[];
  reasoning?: string;
}

export function RestaurantCard({ results, reasoning }: RestaurantCardProps) {
  if (!results || results.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-600">No restaurants found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reasoning && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Why these results:</span> {reasoning}
          </p>
        </div>
      )}
      
      <div className="grid gap-3">
        {results.map((restaurant, index) => (
          <div
            key={index}
            className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">
                  {restaurant.name}
                </h3>
                <div className="flex items-center gap-1 mt-1 text-slate-500">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <p className="text-xs truncate">{restaurant.address}</p>
                </div>
                {restaurant.coordinates && (
                  <a
                    href={`https://www.google.com/maps?q=${restaurant.coordinates.lat},${restaurant.coordinates.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Navigation className="w-3 h-3" />
                    Open in Maps
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
