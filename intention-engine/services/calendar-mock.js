// Mock Calendar API implementation
export class CalendarMockAPI {
  static async createEvent(eventDetails) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Generate a mock event
    return {
      success: true,
      event_id: `cal_${Math.floor(Math.random() * 1000000)}`,
      title: eventDetails.title,
      date: eventDetails.date,
      time: eventDetails.time,
      location: eventDetails.location,
      attendees: eventDetails.attendees || [],
      notes: eventDetails.notes || "",
      status: "scheduled",
      calendar_link: `https://calendar.example.com/event/${Math.random().toString(36).substring(2, 10)}`
    };
  }

  static async getEvents(dateRange) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return [
      {
        id: `event_${Math.floor(Math.random() * 1000000)}`,
        title: "Dinner with Sarah",
        date: "Friday",
        time: "7:00 PM",
        location: "Bar Italia",
        attendees: ["Sarah"],
        status: "confirmed"
      }
    ];
  }

  static async updateEvent(eventId, updates) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 250));
    
    return {
      success: true,
      event_id: eventId,
      updates: updates,
      status: "updated"
    };
  }
}