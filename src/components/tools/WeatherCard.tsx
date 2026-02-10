"use client";

import { Cloud, Sun, CloudRain, Wind, Droplets, Thermometer } from "lucide-react";

interface WeatherDay {
  date: string;
  condition: string;
  temperature: {
    high: number;
    low: number;
    unit: string;
  };
  humidity: number;
  wind_speed: number;
}

interface WeatherData {
  location: string;
  current: WeatherDay;
  forecast: WeatherDay[];
}

interface WeatherCardProps {
  data: WeatherData;
}

const getWeatherIcon = (condition: string) => {
  const conditionLower = condition.toLowerCase();
  if (conditionLower.includes('rain')) return <CloudRain className="w-6 h-6 text-blue-500" />;
  if (conditionLower.includes('cloud')) return <Cloud className="w-6 h-6 text-slate-500" />;
  if (conditionLower.includes('sun') || conditionLower.includes('clear')) return <Sun className="w-6 h-6 text-amber-500" />;
  return <Sun className="w-6 h-6 text-amber-500" />;
};

export function WeatherCard({ data }: WeatherCardProps) {
  if (!data || !data.current) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-600">Weather data unavailable.</p>
      </div>
    );
  }

  const { current, forecast, location } = data;

  return (
    <div className="p-4 bg-gradient-to-br from-blue-50 to-sky-50 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">{location}</h3>
          <p className="text-xs text-slate-500">Weather Forecast</p>
        </div>
        <div className="flex items-center gap-2">
          {getWeatherIcon(current.condition)}
          <span className="text-2xl font-bold text-slate-800">
            {current.temperature.high}°
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 bg-white rounded-lg text-center">
          <Thermometer className="w-4 h-4 mx-auto mb-1 text-slate-400" />
          <p className="text-xs text-slate-500">Low</p>
          <p className="text-sm font-semibold text-slate-700">{current.temperature.low}°</p>
        </div>
        <div className="p-2 bg-white rounded-lg text-center">
          <Droplets className="w-4 h-4 mx-auto mb-1 text-blue-400" />
          <p className="text-xs text-slate-500">Humidity</p>
          <p className="text-sm font-semibold text-slate-700">{current.humidity}%</p>
        </div>
        <div className="p-2 bg-white rounded-lg text-center">
          <Wind className="w-4 h-4 mx-auto mb-1 text-slate-400" />
          <p className="text-xs text-slate-500">Wind</p>
          <p className="text-sm font-semibold text-slate-700">{current.wind_speed} km/h</p>
        </div>
      </div>

      {forecast && forecast.length > 0 && (
        <div className="pt-3 border-t border-blue-200">
          <p className="text-xs font-medium text-slate-600 mb-2">Upcoming</p>
          <div className="flex gap-2 overflow-x-auto">
            {forecast.map((day, index) => (
              <div key={index} className="flex-shrink-0 p-2 bg-white rounded-lg min-w-[80px] text-center">
                <p className="text-xs text-slate-500">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <div className="flex justify-center my-1">
                  {getWeatherIcon(day.condition)}
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  {day.temperature.high}° / {day.temperature.low}°
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500 text-center">
        {current.condition}
      </p>
    </div>
  );
}
