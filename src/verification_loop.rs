use crate::intent_schema::*;
use crate::capability_registry::CapabilityRegistry;
use crate::user_preferences::UserPreferenceVector;
use std::collections::HashMap;

/// Represents a possible path for fulfilling the user's intent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifePath {
    pub path_type: PathType,
    pub description: String,
    pub estimated_cost: Option<f64>,
    pub estimated_time: Option<String>, // Duration in ISO 8601 format
    pub steps: Vec<ExecutionStep>,
    pub confidence: f32, // How confident we are this path will work
}

/// Type of path (Efficiency, Luxury, Discovery)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PathType {
    Efficiency,
    Luxury,
    Discovery,
}

/// A single step in the execution plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStep {
    pub action: String, // What action to take
    pub capability: String, // Which capability to use
    pub parameters: HashMap<String, String>, // Parameters for the action
    pub priority: PriorityLevel, // Priority of this step
}

/// The verification loop that generates multiple paths
pub struct VerificationLoop {
    capability_registry: CapabilityRegistry,
}

impl VerificationLoop {
    /// Creates a new verification loop with the given capability registry
    pub fn new(capability_registry: CapabilityRegistry) -> Self {
        Self {
            capability_registry,
        }
    }
    
    /// Generates three distinct life paths based on the user's intent and preferences
    pub fn generate_paths(
        &self,
        intent: &IntentSchema,
        user_preferences: &UserPreferenceVector,
    ) -> Result<Vec<LifePath>, String> {
        let mut paths = Vec::new();
        
        // Generate efficiency path
        if let Some(efficiency_path) = self.generate_efficiency_path(intent, user_preferences) {
            paths.push(efficiency_path);
        }
        
        // Generate luxury path
        if let Some(luxury_path) = self.generate_luxury_path(intent, user_preferences) {
            paths.push(luxury_path);
        }
        
        // Generate discovery path
        if let Some(discovery_path) = self.generate_discovery_path(intent, user_preferences) {
            paths.push(discovery_path);
        }
        
        if paths.is_empty() {
            return Err("Could not generate any viable paths for the given intent".to_string());
        }
        
        Ok(paths)
    }
    
    /// Generates an efficiency-focused path
    fn generate_efficiency_path(
        &self,
        intent: &IntentSchema,
        user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        match &intent.core_intent {
            CoreIntent::TransportationRequest(transport_intent) => {
                self.generate_efficiency_transportation_path(transport_intent, user_preferences)
            },
            CoreIntent::BookReservation(reservation_intent) => {
                self.generate_efficiency_reservation_path(reservation_intent, user_preferences)
            },
            CoreIntent::ScheduleEvent(schedule_intent) => {
                self.generate_efficiency_scheduling_path(schedule_intent, user_preferences)
            },
            CoreIntent::PurchaseItem(purchase_intent) => {
                self.generate_efficiency_purchase_path(purchase_intent, user_preferences)
            },
            _ => None, // Efficiency path not applicable for this intent type
        }
    }
    
    /// Generates a luxury-focused path
    fn generate_luxury_path(
        &self,
        intent: &IntentSchema,
        user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        match &intent.core_intent {
            CoreIntent::TransportationRequest(transport_intent) => {
                self.generate_luxury_transportation_path(transport_intent, user_preferences)
            },
            CoreIntent::BookReservation(reservation_intent) => {
                self.generate_luxury_reservation_path(reservation_intent, user_preferences)
            },
            CoreIntent::ScheduleEvent(schedule_intent) => {
                self.generate_luxury_scheduling_path(schedule_intent, user_preferences)
            },
            CoreIntent::PurchaseItem(purchase_intent) => {
                self.generate_luxury_purchase_path(purchase_intent, user_preferences)
            },
            _ => None, // Luxury path not applicable for this intent type
        }
    }
    
    /// Generates a discovery-focused path
    fn generate_discovery_path(
        &self,
        intent: &IntentSchema,
        user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        match &intent.core_intent {
            CoreIntent::TransportationRequest(transport_intent) => {
                self.generate_discovery_transportation_path(transport_intent, user_preferences)
            },
            CoreIntent::BookReservation(reservation_intent) => {
                self.generate_discovery_reservation_path(reservation_intent, user_preferences)
            },
            CoreIntent::ScheduleEvent(schedule_intent) => {
                self.generate_discovery_scheduling_path(schedule_intent, user_preferences)
            },
            CoreIntent::PurchaseItem(purchase_intent) => {
                self.generate_discovery_purchase_path(purchase_intent, user_preferences)
            },
            _ => None, // Discovery path not applicable for this intent type
        }
    }
    
    // Transportation path generators
    fn generate_efficiency_transportation_path(
        &self,
        transport_intent: &TransportationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("uber") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add transportation booking step
        params.insert("pickup_location".to_string(), transport_intent.pickup_location.clone());
        params.insert("destination".to_string(), transport_intent.destination.clone());
        if let Some(departure_time) = &transport_intent.departure_time {
            params.insert("departure_time".to_string(), departure_time.clone());
        }
        if let Some(vehicle_type) = &transport_intent.vehicle_preference {
            params.insert("vehicle_type".to_string(), format!("{:?}", vehicle_type));
        }
        
        steps.push(ExecutionStep {
            action: "book_transportation".to_string(),
            capability: "uber".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Efficiency,
            description: "Direct route with standard vehicle for fastest arrival".to_string(),
            estimated_cost: transport_intent.max_cost,
            estimated_time: Some("PT30M".to_string()), // 30 minutes
            steps,
            confidence: 0.9,
        })
    }
    
    fn generate_luxury_transportation_path(
        &self,
        transport_intent: &TransportationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("uber") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add luxury transportation booking step
        params.insert("pickup_location".to_string(), transport_intent.pickup_location.clone());
        params.insert("destination".to_string(), transport_intent.destination.clone());
        if let Some(departure_time) = &transport_intent.departure_time {
            params.insert("departure_time".to_string(), departure_time.clone());
        }
        // Force luxury vehicle type for luxury path
        params.insert("vehicle_type".to_string(), "Luxury".to_string());
        
        steps.push(ExecutionStep {
            action: "book_transportation".to_string(),
            capability: "uber".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Luxury,
            description: "Luxury vehicle with premium amenities for comfortable journey".to_string(),
            estimated_cost: transport_intent.max_cost.map(|cost| cost * 1.5), // 50% more expensive
            estimated_time: Some("PT30M".to_string()), // 30 minutes
            steps,
            confidence: 0.85,
        })
    }
    
    fn generate_discovery_transportation_path(
        &self,
        transport_intent: &TransportationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("uber") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add discovery-focused transportation booking step
        params.insert("pickup_location".to_string(), transport_intent.pickup_location.clone());
        params.insert("destination".to_string(), transport_intent.destination.clone());
        if let Some(departure_time) = &transport_intent.departure_time {
            params.insert("departure_time".to_string(), departure_time.clone());
        }
        // Use shared/pool option for discovery path
        params.insert("vehicle_type".to_string(), "Pool".to_string());
        
        steps.push(ExecutionStep {
            action: "book_transportation".to_string(),
            capability: "uber".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        // Add a step to explore nearby points of interest
        let mut explore_params = HashMap::new();
        explore_params.insert("location".to_string(), transport_intent.destination.clone());
        explore_params.insert("category".to_string(), "attractions".to_string());
        explore_params.insert("radius".to_string(), "2000".to_string()); // 2km radius
        
        steps.push(ExecutionStep {
            action: "explore_nearby".to_string(),
            capability: "local_discovery".to_string(),
            parameters: explore_params,
            priority: PriorityLevel::Medium,
        });
        
        Some(LifePath {
            path_type: PathType::Discovery,
            description: "Shared ride with stops at interesting places along the way".to_string(),
            estimated_cost: transport_intent.max_cost.map(|cost| cost * 0.7), // 30% cheaper
            estimated_time: Some("PT45M".to_string()), // 45 minutes (longer due to stops)
            steps,
            confidence: 0.8,
        })
    }
    
    // Reservation path generators
    fn generate_efficiency_reservation_path(
        &self,
        reservation_intent: &ReservationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("opentable") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add reservation booking step
        params.insert("reservation_type".to_string(), format!("{:?}", reservation_intent.reservation_type));
        if let Some(location) = &reservation_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        if let Some(party_size) = reservation_intent.party_size {
            params.insert("party_size".to_string(), party_size.to_string());
        }
        if let Some(preferred_time) = &reservation_intent.preferred_time {
            params.insert("preferred_time".to_string(), preferred_time.clone());
        }
        
        steps.push(ExecutionStep {
            action: "book_reservation".to_string(),
            capability: "opentable".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Efficiency,
            description: "Quick reservation at the most convenient available time".to_string(),
            estimated_cost: None,
            estimated_time: Some("PT1H".to_string()), // 1 hour reservation
            steps,
            confidence: 0.9,
        })
    }
    
    fn generate_luxury_reservation_path(
        &self,
        reservation_intent: &ReservationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("opentable") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add luxury reservation booking step
        params.insert("reservation_type".to_string(), format!("{:?}", reservation_intent.reservation_type));
        if let Some(location) = &reservation_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        if let Some(party_size) = reservation_intent.party_size {
            params.insert("party_size".to_string(), party_size.to_string());
        }
        if let Some(preferred_time) = &reservation_intent.preferred_time {
            params.insert("preferred_time".to_string(), preferred_time.clone());
        }
        // Request premium seating/amenities
        params.insert("preference".to_string(), "premium".to_string());
        
        steps.push(ExecutionStep {
            action: "book_reservation".to_string(),
            capability: "opentable".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Luxury,
            description: "Premium reservation with best available seating and amenities".to_string(),
            estimated_cost: None,
            estimated_time: Some("PT2H".to_string()), // 2 hour reservation for extended experience
            steps,
            confidence: 0.85,
        })
    }
    
    fn generate_discovery_reservation_path(
        &self,
        reservation_intent: &ReservationIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("opentable") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add discovery-focused reservation booking step
        params.insert("reservation_type".to_string(), format!("{:?}", reservation_intent.reservation_type));
        if let Some(location) = &reservation_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        if let Some(party_size) = reservation_intent.party_size {
            params.insert("party_size".to_string(), party_size.to_string());
        }
        if let Some(preferred_time) = &reservation_intent.preferred_time {
            params.insert("preferred_time".to_string(), preferred_time.clone());
        }
        // Request adventurous/experimental cuisine
        params.insert("preference".to_string(), "experimental".to_string());
        
        steps.push(ExecutionStep {
            action: "book_reservation".to_string(),
            capability: "opentable".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        // Add a step to discover new cuisines
        let mut discover_params = HashMap::new();
        discover_params.insert("cuisine_type".to_string(), "unknown".to_string());
        discover_params.insert("location".to_string(), reservation_intent.location.clone().unwrap_or_default());
        
        steps.push(ExecutionStep {
            action: "discover_cuisine".to_string(),
            capability: "cuisine_discovery".to_string(),
            parameters: discover_params,
            priority: PriorityLevel::Medium,
        });
        
        Some(LifePath {
            path_type: PathType::Discovery,
            description: "Reservation at an experimental venue with unique culinary experience".to_string(),
            estimated_cost: None,
            estimated_time: Some("PT2H30M".to_string()), // 2.5 hours for full experience
            steps,
            confidence: 0.8,
        })
    }
    
    // Scheduling path generators
    fn generate_efficiency_scheduling_path(
        &self,
        schedule_intent: &ScheduleIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("calendar") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add scheduling step
        params.insert("event_title".to_string(), schedule_intent.event_title.clone());
        params.insert("start_time".to_string(), schedule_intent.start_time.clone());
        params.insert("end_time".to_string(), schedule_intent.end_time.clone());
        if let Some(location) = &schedule_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        
        steps.push(ExecutionStep {
            action: "create_calendar_event".to_string(),
            capability: "calendar".to_string(),
            parameters: params,
            priority: schedule_intent.priority.clone(),
        });
        
        Some(LifePath {
            path_type: PathType::Efficiency,
            description: "Straightforward calendar entry with minimal setup".to_string(),
            estimated_cost: Some(0.0), // No cost for calendar event
            estimated_time: Some("PT5M".to_string()), // 5 minutes to set up
            steps,
            confidence: 0.95,
        })
    }
    
    fn generate_luxury_scheduling_path(
        &self,
        schedule_intent: &ScheduleIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("calendar") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add scheduling step
        params.insert("event_title".to_string(), schedule_intent.event_title.clone());
        params.insert("start_time".to_string(), schedule_intent.start_time.clone());
        params.insert("end_time".to_string(), schedule_intent.end_time.clone());
        if let Some(location) = &schedule_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        
        steps.push(ExecutionStep {
            action: "create_calendar_event".to_string(),
            capability: "calendar".to_string(),
            parameters: params,
            priority: schedule_intent.priority.clone(),
        });
        
        // Add luxury coordination step
        let mut coord_params = HashMap::new();
        coord_params.insert("event_id".to_string(), "{{event_id}}".to_string()); // Placeholder
        coord_params.insert("service_type".to_string(), "concierge".to_string());
        
        steps.push(ExecutionStep {
            action: "coordinate_luxury_services".to_string(),
            capability: "concierge_service".to_string(),
            parameters: coord_params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Luxury,
            description: "Calendar event with luxury coordination services".to_string(),
            estimated_cost: Some(100.0), // Estimated cost for concierge services
            estimated_time: Some("PT10M".to_string()), // 10 minutes to set up
            steps,
            confidence: 0.9,
        })
    }
    
    fn generate_discovery_scheduling_path(
        &self,
        schedule_intent: &ScheduleIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        if !self.capability_registry.is_available("calendar") {
            return None;
        }
        
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        // Add scheduling step
        params.insert("event_title".to_string(), schedule_intent.event_title.clone());
        params.insert("start_time".to_string(), schedule_intent.start_time.clone());
        params.insert("end_time".to_string(), schedule_intent.end_time.clone());
        if let Some(location) = &schedule_intent.location {
            params.insert("location".to_string(), location.clone());
        }
        
        steps.push(ExecutionStep {
            action: "create_calendar_event".to_string(),
            capability: "calendar".to_string(),
            parameters: params,
            priority: schedule_intent.priority.clone(),
        });
        
        // Add discovery step
        let mut discover_params = HashMap::new();
        discover_params.insert("event_topic".to_string(), schedule_intent.event_title.clone());
        discover_params.insert("location".to_string(), schedule_intent.location.clone().unwrap_or_default());
        
        steps.push(ExecutionStep {
            action: "discover_related_activities".to_string(),
            capability: "activity_discovery".to_string(),
            parameters: discover_params,
            priority: PriorityLevel::Medium,
        });
        
        Some(LifePath {
            path_type: PathType::Discovery,
            description: "Calendar event with discovery of related activities".to_string(),
            estimated_cost: Some(0.0),
            estimated_time: Some("PT15M".to_string()), // 15 minutes to set up and discover
            steps,
            confidence: 0.85,
        })
    }
    
    // Purchase path generators
    fn generate_efficiency_purchase_path(
        &self,
        purchase_intent: &PurchaseIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        // For efficiency, we'll just return a basic purchase path
        // In a real implementation, this would connect to an e-commerce capability
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        params.insert("item_description".to_string(), purchase_intent.item_description.clone());
        params.insert("quantity".to_string(), purchase_intent.quantity.to_string());
        if let Some(max_price) = purchase_intent.max_price {
            params.insert("max_price".to_string(), max_price.to_string());
        }
        
        steps.push(ExecutionStep {
            action: "purchase_item".to_string(),
            capability: "ecommerce_platform".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Efficiency,
            description: "Direct purchase from the most cost-effective vendor".to_string(),
            estimated_cost: purchase_intent.max_price,
            estimated_time: Some("PT2H".to_string()), // 2 hours for standard shipping
            steps,
            confidence: 0.85,
        })
    }
    
    fn generate_luxury_purchase_path(
        &self,
        purchase_intent: &PurchaseIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        params.insert("item_description".to_string(), purchase_intent.item_description.clone());
        params.insert("quantity".to_string(), purchase_intent.quantity.to_string());
        if let Some(max_price) = purchase_intent.max_price {
            params.insert("max_price".to_string(), (max_price * 1.5).to_string()); // 50% higher for premium
        }
        
        steps.push(ExecutionStep {
            action: "purchase_item".to_string(),
            capability: "premium_ecommerce".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        // Add premium delivery
        let mut delivery_params = HashMap::new();
        delivery_params.insert("item_id".to_string(), "{{item_id}}".to_string()); // Placeholder
        delivery_params.insert("delivery_type".to_string(), "express_premium".to_string());
        
        steps.push(ExecutionStep {
            action: "arrange_premium_delivery".to_string(),
            capability: "premium_delivery".to_string(),
            parameters: delivery_params,
            priority: PriorityLevel::High,
        });
        
        Some(LifePath {
            path_type: PathType::Luxury,
            description: "Premium purchase with express delivery and gift wrapping".to_string(),
            estimated_cost: purchase_intent.max_price.map(|price| price * 1.7), // Higher cost
            estimated_time: Some("PT1H".to_string()), // 1 hour for express delivery
            steps,
            confidence: 0.8,
        })
    }
    
    fn generate_discovery_purchase_path(
        &self,
        purchase_intent: &PurchaseIntent,
        _user_preferences: &UserPreferenceVector,
    ) -> Option<LifePath> {
        let mut steps = Vec::new();
        let mut params = HashMap::new();
        
        params.insert("item_description".to_string(), purchase_intent.item_description.clone());
        params.insert("quantity".to_string(), purchase_intent.quantity.to_string());
        if let Some(max_price) = purchase_intent.max_price {
            params.insert("max_price".to_string(), max_price.to_string());
        }
        
        steps.push(ExecutionStep {
            action: "purchase_item".to_string(),
            capability: "discovery_ecommerce".to_string(),
            parameters: params,
            priority: PriorityLevel::High,
        });
        
        // Add discovery step
        let mut discover_params = HashMap::new();
        discover_params.insert("item_category".to_string(), purchase_intent.item_description.clone());
        discover_params.insert("user_preferences".to_string(), "exploration".to_string());
        
        steps.push(ExecutionStep {
            action: "discover_similar_items".to_string(),
            capability: "recommendation_engine".to_string(),
            parameters: discover_params,
            priority: PriorityLevel::Medium,
        });
        
        Some(LifePath {
            path_type: PathType::Discovery,
            description: "Purchase with discovery of similar or complementary items".to_string(),
            estimated_cost: purchase_intent.max_price,
            estimated_time: Some("PT24H".to_string()), // 24 hours to explore options
            steps,
            confidence: 0.75,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::user_preferences::UserPreferenceVector;

    #[test]
    fn test_generate_paths_for_transportation() {
        let registry = CapabilityRegistry::new();
        let verification_loop = VerificationLoop::new(registry);
        let user_prefs = UserPreferenceVector::new();
        
        // Create a transportation intent
        let transport_intent = TransportationIntent {
            pickup_location: "Downtown".to_string(),
            destination: "Airport".to_string(),
            departure_time: Some("14:30".to_string()),
            vehicle_preference: Some(VehicleType::Standard),
            max_cost: Some(50.0),
        };
        
        let intent = IntentSchema {
            core_intent: CoreIntent::TransportationRequest(transport_intent),
            temporal_constraints: None,
            budget_constraints: None,
            preference_constraints: None,
            sentiment_vibe: SentimentVibe {
                sentiment: Sentiment::Neutral,
                vibe: Vibe::Efficient,
                urgency_level: UrgencyLevel::Medium,
            },
            confidence: 0.9,
            raw_input: "Get me an Uber from downtown to the airport".to_string(),
        };
        
        let paths = verification_loop.generate_paths(&intent, &user_prefs).unwrap();
        
        assert_eq!(paths.len(), 3); // Should have 3 paths: Efficiency, Luxury, Discovery
        assert!(paths.iter().any(|p| matches!(p.path_type, PathType::Efficiency)));
        assert!(paths.iter().any(|p| matches!(p.path_type, PathType::Luxury)));
        assert!(paths.iter().any(|p| matches!(p.path_type, PathType::Discovery)));
    }
}