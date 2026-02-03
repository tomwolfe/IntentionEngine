use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Core Intent Schema that maps natural language to structured data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntentSchema {
    /// The primary action the user wants to perform
    pub core_intent: CoreIntent,
    
    /// Temporal constraints (when the action should happen)
    pub temporal_constraints: Option<TemporalConstraints>,
    
    /// Budget or cost constraints
    pub budget_constraints: Option<BudgetConstraints>,
    
    /// Quality or preference constraints
    pub preference_constraints: Option<PreferenceConstraints>,
    
    /// Sentiment/vibe extracted from the request
    pub sentiment_vibe: SentimentVibe,
    
    /// Confidence score of the parsed intent (0.0 to 1.0)
    pub confidence: f32,
    
    /// Raw user input for reference
    pub raw_input: String,
}

/// The primary action the user wants to perform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoreIntent {
    BookReservation(ReservationIntent),
    ScheduleEvent(ScheduleIntent),
    TransportationRequest(TransportationIntent),
    PurchaseItem(PurchaseIntent),
    InformationQuery(QueryIntent),
    Custom(String), // For unrecognized intents
}

/// Reservation intent (restaurants, hotels, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReservationIntent {
    pub reservation_type: ReservationType,
    pub location: Option<String>,
    pub party_size: Option<u32>,
    pub preferred_time: Option<String>,
    pub special_requests: Vec<String>,
}

/// Types of reservations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReservationType {
    Restaurant,
    Hotel,
    Event,
    Service,
}

/// Scheduling intent (calendar events, appointments)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleIntent {
    pub event_title: String,
    pub start_time: String,
    pub end_time: String,
    pub location: Option<String>,
    pub attendees: Vec<String>,
    pub priority: PriorityLevel,
}

/// Transportation intent (Uber, taxi, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportationIntent {
    pub pickup_location: String,
    pub destination: String,
    pub departure_time: Option<String>,
    pub vehicle_preference: Option<VehicleType>,
    pub max_cost: Option<f64>,
}

/// Vehicle type preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VehicleType {
    Standard,
    Luxury,
    Pool,
    Bike,
}

/// Purchase intent (buying goods/services)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseIntent {
    pub item_description: String,
    pub quantity: u32,
    pub max_price: Option<f64>,
    pub delivery_preference: Option<DeliveryMethod>,
}

/// Delivery method preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeliveryMethod {
    Standard,
    Express,
    Pickup,
}

/// Query intent (information requests)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryIntent {
    pub query_topic: String,
    pub query_details: HashMap<String, String>,
}

/// Temporal constraints (time-related limitations)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalConstraints {
    pub earliest_start: Option<String>,  // ISO 8601 format
    pub latest_end: Option<String>,      // ISO 8601 format
    pub preferred_time_range: Option<(String, String)>, // (start, end) in ISO 8601
    pub duration: Option<String>,        // Duration in ISO 8601 duration format
}

/// Budget constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetConstraints {
    pub max_amount: f64,
    pub currency: String,
    pub flexibility_percentage: f32, // How much over budget is acceptable (0.0 to 1.0)
}

/// Preference constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreferenceConstraints {
    pub quality_preference: QualityLevel,
    pub brand_preferences: Vec<String>,
    pub exclusion_list: Vec<String>, // Things to avoid
    pub accessibility_needs: Vec<AccessibilityRequirement>,
}

/// Quality levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QualityLevel {
    Basic,
    Standard,
    Premium,
    Luxury,
}

/// Accessibility requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AccessibilityRequirement {
    WheelchairAccessible,
    HearingAssistance,
    VisualAssistance,
    DietaryRestrictions(Vec<String>),
}

/// Sentiment/Vibe classification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentimentVibe {
    pub sentiment: Sentiment,
    pub vibe: Vibe,
    pub urgency_level: UrgencyLevel,
}

/// Sentiment classification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Sentiment {
    Positive,
    Neutral,
    Negative,
}

/// Vibe classification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Vibe {
    Efficient,
    Relaxing,
    Luxurious,
    Adventurous,
    Minimalist,
    Social,
    Private,
}

/// Urgency level
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UrgencyLevel {
    Low,
    Medium,
    High,
    Immediate,
}

/// Priority level for scheduling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PriorityLevel {
    Low,
    Medium,
    High,
    Critical,
}