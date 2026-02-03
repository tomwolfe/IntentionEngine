// Mock Uber API implementation
export class UberMockAPI {
  static async requestRide(rideDetails) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Generate a mock response
    return {
      success: true,
      ride_id: `ub_${Math.floor(Math.random() * 1000000)}`,
      driver: {
        name: "Michael T.",
        rating: 4.9,
        vehicle: "Toyota Camry (ABC123)"
      },
      pickup_time: rideDetails.pickup_time,
      estimated_arrival: "5 minutes",
      destination: rideDetails.destination,
      price_estimate: "$24.50",
      status: "driver_assigned"
    };
  }

  static async getRideStatus(rideId) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      ride_id: rideId,
      status: "arriving_soon",
      driver_eta: "2 minutes",
      driver_location: "2 blocks away"
    };
  }
}