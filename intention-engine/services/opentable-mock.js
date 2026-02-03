// Mock OpenTable API implementation
export class OpenTableMockAPI {
  static async searchRestaurants(query) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Return mock restaurants based on query
    const mockRestaurants = [
      {
        id: "baritalia_123",
        name: "Bar Italia",
        cuisine: "Italian",
        rating: 4.6,
        location: "Downtown",
        price_range: "$$",
        description: "Authentic Italian cuisine in a cozy atmosphere",
        is_available: true
      },
      {
        id: "mediterraneo_456",
        name: "Mediterraneo",
        cuisine: "Mediterranean",
        rating: 4.4,
        location: "Arts District",
        price_range: "$$$",
        description: "Fresh Mediterranean dishes with a modern twist",
        is_available: true
      }
    ];

    // Filter based on cuisine preference
    if (query.cuisine) {
      return mockRestaurants.filter(r => 
        r.cuisine.toLowerCase().includes(query.cuisine.toLowerCase())
      );
    }

    return mockRestaurants;
  }

  static async makeReservation(reservationDetails) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate a mock reservation
    return {
      success: true,
      reservation_id: `ot_${Math.floor(Math.random() * 1000000)}`,
      restaurant: reservationDetails.restaurant,
      date: reservationDetails.date,
      time: reservationDetails.time,
      party_size: reservationDetails.party_size,
      confirmation_code: `CONF${Math.floor(100000 + Math.random() * 900000)}`,
      special_requests: reservationDetails.special_requests || "",
      status: "confirmed"
    };
  }

  static async getReservationStatus(reservationId) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      reservation_id: reservationId,
      status: "confirmed",
      checked_in: false
    };
  }
}