use crate::intent_schema::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use chrono::{DateTime, Utc};

/// Represents a user's preference vector that stores historical choices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferenceVector {
    /// User ID for identification
    pub user_id: String,
    
    /// Historical choices and preferences
    pub preferences: UserPreferences,
    
    /// Past successful actions that influenced preferences
    pub history: Vec<UserActionHistory>,
    
    /// Timestamp of last update
    pub last_updated: DateTime<Utc>,
}

/// Collection of user preferences
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserPreferences {
    /// Preferred quality levels for different categories
    pub quality_preferences: HashMap<String, QualityLevel>,
    
    /// Preferred brands
    pub brand_preferences: HashSet<String>,
    
    /// Brands or services to avoid
    pub brand_exclusions: HashSet<String>,
    
    /// Preferred price ranges for different categories
    pub price_preferences: HashMap<String, (f64, f64)>, // (min, max)
    
    /// Preferred time ranges for different activities
    pub time_preferences: HashMap<String, Vec<String>>, // Activity -> preferred times
    
    /// Preferred locations or location types
    pub location_preferences: HashSet<String>,
    
    /// Preferred transportation modes
    pub transportation_preferences: HashSet<String>,
    
    /// Dietary restrictions
    pub dietary_restrictions: HashSet<String>,
    
    /// Accessibility requirements
    pub accessibility_requirements: Vec<AccessibilityRequirement>,
    
    /// Preferred communication channels
    pub communication_preferences: HashSet<String>,
    
    /// Privacy preferences
    pub privacy_settings: PrivacySettings,
    
    /// Frequency of different types of activities
    pub activity_frequency: HashMap<String, u32>,
    
    /// Preferred vibe for different contexts
    pub vibe_preferences: HashMap<String, Vibe>,
}

/// Privacy settings for the user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySettings {
    /// Share location data
    pub share_location: bool,
    
    /// Share purchase history
    pub share_purchase_history: bool,
    
    /// Allow personalized recommendations
    pub allow_personalized_recommendations: bool,
    
    /// Share with third parties
    pub share_with_third_parties: bool,
}

/// Historical record of user actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserActionHistory {
    /// Unique identifier for the action
    pub action_id: String,
    
    /// Type of action performed
    pub action_type: ActionType,
    
    /// Intent that led to this action
    pub intent: IntentSchema,
    
    /// Selected path type
    pub selected_path: Option<PathType>,
    
    /// Outcome of the action
    pub outcome: ActionOutcome,
    
    /// Satisfaction rating (1-5)
    pub satisfaction_rating: Option<u8>,
    
    /// Timestamp of the action
    pub timestamp: DateTime<Utc>,
    
    /// Associated cost
    pub cost: Option<f64>,
    
    /// Associated time spent
    pub time_spent: Option<String>, // Duration in ISO 8601 format
}

/// Type of action performed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    TransportationBooking,
    ReservationBooking,
    ScheduleEvent,
    Purchase,
    InformationQuery,
    Custom(String),
}

/// Outcome of an action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionOutcome {
    Success,
    PartialSuccess,
    Failure,
    Cancelled,
    Timeout,
}

impl UserPreferenceVector {
    /// Creates a new empty user preference vector
    pub fn new() -> Self {
        Self {
            user_id: "default_user".to_string(),
            preferences: UserPreferences::default(),
            history: Vec::new(),
            last_updated: Utc::now(),
        }
    }
    
    /// Creates a new user preference vector with a specific user ID
    pub fn with_user_id(user_id: String) -> Self {
        Self {
            user_id,
            preferences: UserPreferences::default(),
            history: Vec::new(),
            last_updated: Utc::now(),
        }
    }
    
    /// Updates the preference vector based on a new action
    pub fn update_from_action(&mut self, action_history: UserActionHistory) {
        // Add to history
        self.history.push(action_history.clone());
        
        // Update preferences based on the action
        self.update_preferences_from_action(&action_history);
        
        // Update the last updated timestamp
        self.last_updated = Utc::now();
    }
    
    /// Updates preferences based on an action history
    fn update_preferences_from_action(&mut self, action_history: &UserActionHistory) {
        // Update quality preferences based on past selections
        if let Some(path_type) = &action_history.selected_path {
            match path_type {
                PathType::Efficiency => {
                    // User prefers efficiency, so adjust quality preferences accordingly
                    self.adjust_quality_preference_for_efficiency(&action_history.intent);
                },
                PathType::Luxury => {
                    // User prefers luxury, so adjust quality preferences accordingly
                    self.adjust_quality_preference_for_luxury(&action_history.intent);
                },
                PathType::Discovery => {
                    // User prefers discovery, so adjust preferences for novelty
                    self.adjust_preferences_for_discovery(&action_history.intent);
                },
            }
        }
        
        // Update activity frequency
        let activity_type = self.get_activity_type_from_intent(&action_history.intent);
        *self.preferences.activity_frequency.entry(activity_type).or_insert(0) += 1;
        
        // Update time preferences based on when actions were typically scheduled
        if let Some(ref temporal_constraints) = action_history.intent.temporal_constraints {
            if let Some(ref time_range) = temporal_constraints.preferred_time_range {
                let activity_type = self.get_activity_type_from_intent(&action_history.intent);
                self.preferences.time_preferences
                    .entry(activity_type)
                    .or_insert_with(Vec::new)
                    .push(format!("{}-{}", time_range.0, time_range.1));
            }
        }
        
        // Update location preferences
        if let Some(ref location) = action_history.intent.temporal_constraints.as_ref().and_then(|tc| tc.earliest_start.clone()) {
            // Extract location from temporal constraints if available
            // In a real implementation, this would be more sophisticated
        }
        
        // Update based on satisfaction rating
        if let Some(rating) = action_history.satisfaction_rating {
            if rating >= 4 {
                // High satisfaction, reinforce related preferences
                self.reinforce_positive_preferences(&action_history.intent);
            } else if rating <= 2 {
                // Low satisfaction, adjust to avoid similar choices
                self.adjust_for_negative_feedback(&action_history.intent);
            }
        }
    }
    
    /// Adjusts quality preferences for efficiency-oriented selections
    fn adjust_quality_preference_for_efficiency(&mut self, intent: &IntentSchema) {
        let category = self.get_activity_type_from_intent(intent);
        // For efficiency, users typically prefer standard quality
        self.preferences.quality_preferences.insert(category, QualityLevel::Standard);
    }
    
    /// Adjusts quality preferences for luxury-oriented selections
    fn adjust_quality_preference_for_luxury(&mut self, intent: &IntentSchema) {
        let category = self.get_activity_type_from_intent(intent);
        // For luxury, users typically prefer premium or luxury quality
        self.preferences.quality_preferences.insert(category, QualityLevel::Luxury);
    }
    
    /// Adjusts preferences for discovery-oriented selections
    fn adjust_preferences_for_discovery(&mut self, intent: &IntentSchema) {
        let category = self.get_activity_type_from_intent(intent);
        // For discovery, users prefer novel experiences
        self.preferences.vibe_preferences.insert(category, Vibe::Adventurous);
    }
    
    /// Reinforces preferences that led to positive outcomes
    fn reinforce_positive_preferences(&mut self, intent: &IntentSchema) {
        // In a real implementation, this would analyze what aspects of the action
        // contributed to the high satisfaction and reinforce those preferences
        match &intent.core_intent {
            CoreIntent::TransportationRequest(transport_intent) => {
                if let Some(vehicle_pref) = &transport_intent.vehicle_preference {
                    self.preferences.transportation_preferences.insert(format!("{:?}", vehicle_pref));
                }
            },
            CoreIntent::BookReservation(reservation_intent) => {
                if let Some(location) = &reservation_intent.location {
                    self.preferences.location_preferences.insert(location.clone());
                }
            },
            _ => {}
        }
    }
    
    /// Adjusts preferences to avoid choices that led to negative outcomes
    fn adjust_for_negative_feedback(&mut self, intent: &IntentSchema) {
        // In a real implementation, this would analyze what aspects of the action
        // contributed to the low satisfaction and adjust preferences accordingly
        match &intent.core_intent {
            CoreIntent::TransportationRequest(transport_intent) => {
                if let Some(vehicle_pref) = &transport_intent.vehicle_preference {
                    // Maybe avoid this vehicle type in the future
                    // This is a simplified example
                }
            },
            CoreIntent::BookReservation(reservation_intent) => {
                if let Some(location) = &reservation_intent.location {
                    // Maybe add to exclusions temporarily
                    self.preferences.brand_exclusions.insert(location.clone());
                }
            },
            _ => {}
        }
    }
    
    /// Gets the activity type from an intent for categorization
    fn get_activity_type_from_intent(&self, intent: &IntentSchema) -> String {
        match &intent.core_intent {
            CoreIntent::TransportationRequest(_) => "transportation".to_string(),
            CoreIntent::BookReservation(reservation_intent) => {
                format!("reservation_{:?}", reservation_intent.reservation_type)
            },
            CoreIntent::ScheduleEvent(_) => "scheduling".to_string(),
            CoreIntent::PurchaseItem(_) => "purchase".to_string(),
            CoreIntent::InformationQuery(_) => "information".to_string(),
            CoreIntent::Custom(custom) => format!("custom_{}", custom.chars().take(20).collect::<String>()),
        }
    }
    
    /// Gets the most frequently selected path type for a given intent category
    pub fn get_preferred_path_type(&self, intent_category: &str) -> Option<PathType> {
        let mut path_counts = HashMap::new();
        
        for action in &self.history {
            if let Some(ref path_type) = action.selected_path {
                if self.get_activity_type_from_intent(&action.intent) == intent_category {
                    *path_counts.entry(path_type.clone()).or_insert(0) += 1;
                }
            }
        }
        
        if path_counts.is_empty() {
            return None;
        }
        
        // Return the path type with the highest count
        path_counts.into_iter().max_by_key(|(_, count)| *count).map(|(path, _)| path)
    }
    
    /// Gets the average satisfaction rating for a specific path type
    pub fn get_average_satisfaction_for_path(&self, path_type: &PathType) -> Option<f64> {
        let ratings: Vec<f64> = self.history
            .iter()
            .filter(|action| action.selected_path.as_ref() == Some(path_type))
            .filter_map(|action| action.satisfaction_rating.map(|r| r as f64))
            .collect();
        
        if ratings.is_empty() {
            return None;
        }
        
        Some(ratings.iter().sum::<f64>() / ratings.len() as f64)
    }
    
    /// Checks if a specific preference exists
    pub fn has_preference(&self, category: &str, preference_value: &str) -> bool {
        match category {
            "brand" => self.preferences.brand_preferences.contains(preference_value),
            "location" => self.preferences.location_preferences.contains(preference_value),
            "transportation" => self.preferences.transportation_preferences.contains(preference_value),
            "dietary" => self.preferences.dietary_restrictions.contains(preference_value),
            _ => false,
        }
    }
    
    /// Gets the preferred quality level for a category
    pub fn get_quality_preference(&self, category: &str) -> QualityLevel {
        self.preferences
            .quality_preferences
            .get(category)
            .cloned()
            .unwrap_or(QualityLevel::Standard) // Default to Standard
    }
    
    /// Gets the preferred vibe for a context
    pub fn get_vibe_preference(&self, context: &str) -> Vibe {
        self.preferences
            .vibe_preferences
            .get(context)
            .cloned()
            .unwrap_or(Vibe::Efficient) // Default to Efficient
    }
    
    /// Gets the preferred price range for a category
    pub fn get_price_preference(&self, category: &str) -> Option<(f64, f64)> {
        self.preferences.price_preferences.get(category).cloned()
    }
    
    /// Gets the preferred time ranges for an activity
    pub fn get_time_preference(&self, activity: &str) -> Option<Vec<String>> {
        self.preferences.time_preferences.get(activity).cloned()
    }
    
    /// Gets the frequency of a specific activity type
    pub fn get_activity_frequency(&self, activity: &str) -> u32 {
        *self.preferences.activity_frequency.get(activity).unwrap_or(&0)
    }
    
    /// Adds a brand to the user's preferences
    pub fn add_brand_preference(&mut self, brand: String) {
        self.preferences.brand_preferences.insert(brand);
        self.last_updated = Utc::now();
    }
    
    /// Removes a brand from the user's preferences
    pub fn remove_brand_preference(&mut self, brand: &str) {
        self.preferences.brand_preferences.remove(brand);
        self.last_updated = Utc::now();
    }
    
    /// Adds a brand to the exclusion list
    pub fn add_brand_exclusion(&mut self, brand: String) {
        self.preferences.brand_exclusions.insert(brand);
        self.last_updated = Utc::now();
    }
    
    /// Adds a dietary restriction
    pub fn add_dietary_restriction(&mut self, restriction: String) {
        self.preferences.dietary_restrictions.insert(restriction);
        self.last_updated = Utc::now();
    }
    
    /// Adds an accessibility requirement
    pub fn add_accessibility_requirement(&mut self, requirement: AccessibilityRequirement) {
        self.preferences.accessibility_requirements.push(requirement);
        self.last_updated = Utc::now();
    }
    
    /// Updates privacy settings
    pub fn update_privacy_settings(&mut self, settings: PrivacySettings) {
        self.preferences.privacy_settings = settings;
        self.last_updated = Utc::now();
    }
}

impl Default for UserPreferenceVector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_create_user_preference_vector() {
        let user_prefs = UserPreferenceVector::new();
        
        assert_eq!(user_prefs.user_id, "default_user");
        assert!(user_prefs.history.is_empty());
        assert!(user_prefs.preferences.brand_preferences.is_empty());
    }

    #[test]
    fn test_update_from_action() {
        let mut user_prefs = UserPreferenceVector::new();
        
        // Create a sample action history
        let action_history = UserActionHistory {
            action_id: "action_1".to_string(),
            action_type: ActionType::TransportationBooking,
            intent: IntentSchema {
                core_intent: CoreIntent::TransportationRequest(TransportationIntent {
                    pickup_location: "Home".to_string(),
                    destination: "Work".to_string(),
                    departure_time: Some("08:00".to_string()),
                    vehicle_preference: Some(VehicleType::Standard),
                    max_cost: Some(20.0),
                }),
                temporal_constraints: None,
                budget_constraints: None,
                preference_constraints: None,
                sentiment_vibe: SentimentVibe {
                    sentiment: Sentiment::Positive,
                    vibe: Vibe::Efficient,
                    urgency_level: UrgencyLevel::High,
                },
                confidence: 0.9,
                raw_input: "Get me to work by 8 AM".to_string(),
            },
            selected_path: Some(PathType::Efficiency),
            outcome: ActionOutcome::Success,
            satisfaction_rating: Some(5),
            timestamp: Utc::now(),
            cost: Some(18.50),
            time_spent: Some("PT25M".to_string()),
        };
        
        user_prefs.update_from_action(action_history);
        
        assert_eq!(user_prefs.history.len(), 1);
        assert!(user_prefs.has_preference("transportation", "Standard"));
    }

    #[test]
    fn test_get_preferred_path_type() {
        let mut user_prefs = UserPreferenceVector::new();
        
        // Add some history with Efficiency path selections
        let action_history = UserActionHistory {
            action_id: "action_1".to_string(),
            action_type: ActionType::TransportationBooking,
            intent: IntentSchema {
                core_intent: CoreIntent::TransportationRequest(TransportationIntent {
                    pickup_location: "Home".to_string(),
                    destination: "Work".to_string(),
                    departure_time: Some("08:00".to_string()),
                    vehicle_preference: Some(VehicleType::Standard),
                    max_cost: Some(20.0),
                }),
                temporal_constraints: None,
                budget_constraints: None,
                preference_constraints: None,
                sentiment_vibe: SentimentVibe {
                    sentiment: Sentiment::Positive,
                    vibe: Vibe::Efficient,
                    urgency_level: UrgencyLevel::High,
                },
                confidence: 0.9,
                raw_input: "Get me to work by 8 AM".to_string(),
            },
            selected_path: Some(PathType::Efficiency),
            outcome: ActionOutcome::Success,
            satisfaction_rating: Some(5),
            timestamp: Utc::now(),
            cost: Some(18.50),
            time_spent: Some("PT25M".to_string()),
        };
        
        user_prefs.update_from_action(action_history);
        
        let preferred_path = user_prefs.get_preferred_path_type("transportation");
        assert_eq!(preferred_path, Some(PathType::Efficiency));
    }
}