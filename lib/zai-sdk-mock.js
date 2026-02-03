// Mock implementation of zai-sdk to simulate the GLM-4.7-flash API
// This follows the required interface with thinking parameter support

class ZAIClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ZAI_API_KEY;
    // Don't throw an error for the mock implementation
    // Just log that it's using mock mode
    if (!this.apiKey) {
      console.log('Using mock ZAI implementation - no API key provided');
    }
  }

  async completion(params) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Extract the thinking parameter from the request
    const { messages, thinking } = params;

    // In a real implementation, this would call the actual Z.AI API
    // For the mock, we'll simulate the response based on the input

    const userMessage = messages.find(msg => msg.role === 'user')?.content || '';

    // Generate a mock response based on the user's intent
    let thinkingSteps = [];
    if (thinking && thinking.type === 'enabled') {
      // Simulate thinking process
      thinkingSteps = [
        `Analyzing user intent: ${userMessage}`,
        "Identifying required services based on the request",
        "Checking user preferences and constraints",
        "Generating action sequence"
      ];
    }

    // Generate mock response based on the input
    let responseContent = '';

    // More sophisticated intent detection
    const intentLower = userMessage.toLowerCase();
    const actions = [];

    // Detect dining/coffee/meeting intent
    if (intentLower.includes('dinner') || intentLower.includes('lunch') || intentLower.includes('breakfast') ||
        intentLower.includes('eat') || intentLower.includes('food') || intentLower.includes('restaurant') ||
        intentLower.includes('sushi') || intentLower.includes('table') || intentLower.includes('coffee') ||
        intentLower.includes('meeting') || intentLower.includes('appointment') || intentLower.includes('brunch')) {

      // Determine party size
      let partySize = 2; // default
      if (intentLower.includes('me and')) {
        partySize = 2;
      } else if (intentLower.match(/\b(\d+)\s+(people|person|guests?)\b/)) {
        partySize = parseInt(intentLower.match(/\b(\d+)\s+(people|person|guests?)\b/)[1]);
      } else if (intentLower.includes('my wife') || intentLower.includes('my husband') ||
                 intentLower.includes('my girlfriend') || intentLower.includes('my boyfriend')) {
        partySize = 2;
      }

      // Determine date
      let date = "tomorrow";
      if (intentLower.includes('friday')) date = "Friday";
      else if (intentLower.includes('saturday')) date = "Saturday";
      else if (intentLower.includes('sunday')) date = "Sunday";
      else if (intentLower.includes('monday')) date = "Monday";
      else if (intentLower.includes('tuesday')) date = "Tuesday";
      else if (intentLower.includes('wednesday')) date = "Wednesday";
      else if (intentLower.includes('thursday')) date = "Thursday";
      else if (intentLower.includes('tonight')) date = "today";
      else if (intentLower.includes('tomorrow')) date = "tomorrow";

      // Determine time
      let time = "7:00 PM";
      if (intentLower.includes('morning')) time = "8:00 AM";
      else if (intentLower.includes('lunch') || intentLower.includes('noon')) time = "12:00 PM";
      else if (intentLower.includes('evening') || intentLower.includes('night')) time = "7:00 PM";
      else if (intentLower.includes('tonight')) time = "7:30 PM";

      // Determine cuisine/venue type
      let restaurant = "Bar Italia";
      if (intentLower.includes('sushi')) restaurant = "Sakura Sushi";
      else if (intentLower.includes('italian')) restaurant = "Bar Italia";
      else if (intentLower.includes('mexican')) restaurant = "Casa Maya";
      else if (intentLower.includes('chinese')) restaurant = "Golden Dragon";
      else if (intentLower.includes('indian')) restaurant = "Taj Mahal";
      else if (intentLower.includes('coffee') || intentLower.includes('cafe') || intentLower.includes('meeting')) restaurant = "Starbucks Downtown";
      else if (intentLower.includes('brunch')) restaurant = "Brunch Place";

      actions.push({
        service: "OpenTable",
        action: "create_reservation",
        params: {
          restaurant: restaurant,
          date: date,
          time: time,
          party_size: partySize,
          special_requests: "None specified"
        }
      });

      // Add transportation if not just booking a table
      if (intentLower.includes('dinner') || intentLower.includes('to') || intentLower.includes('going')) {
        actions.push({
          service: "Uber",
          action: "request_pickup",
          params: {
            pickup_time: `${date} ${time.replace(' PM', '').replace(' AM', '')}:30 ${(time.includes('PM') ? 'PM' : 'AM')}`,
            pickup_location: "Home",
            destination: restaurant,
            vehicle_type: "standard"
          }
        });
      }

      // Add calendar event
      const eventName = intentLower.includes('dinner') ? "Dinner" :
                       intentLower.includes('lunch') ? "Lunch" :
                       intentLower.includes('breakfast') ? "Breakfast" :
                       intentLower.includes('meeting') ? "Meeting" :
                       intentLower.includes('coffee') ? "Coffee Meeting" :
                       intentLower.includes('appointment') ? "Appointment" : "Event";

      let attendees = ["Me"];
      // Check for "and" followed by a person's name
      if (intentLower.includes('and')) {
        const andPart = intentLower.split('and')[1]?.trim().split(' ')[0];
        if (andPart) {
          attendees.push(andPart.charAt(0).toUpperCase() + andPart.slice(1));
        }
      } else {
        // Check for other ways people might be mentioned
        const sMatch = intentLower.match(/(?:with|taking|bringing)\s+(\w+)/);
        if (sMatch && sMatch[1]) {
          const person = sMatch[1];
          if (!['to', 'for', 'at'].includes(person)) { // avoid matching "to dinner" etc
            attendees.push(person.charAt(0).toUpperCase() + person.slice(1));
          }
        }
      }

      actions.push({
        service: "Calendar",
        action: "create_event",
        params: {
          title: `${eventName} with ${attendees.slice(1).join(' and ')}`,
          date: date,
          time: time,
          location: restaurant,
          attendees: attendees,
          notes: "Automatically scheduled"
        }
      });
    }

    responseContent = JSON.stringify({
      actions: actions
    }, null, 2);

    return {
      choices: [{
        message: {
          role: 'assistant',
          content: responseContent
        }
      }],
      thinking: thinkingSteps
    };
  }
}

export default ZAIClient;