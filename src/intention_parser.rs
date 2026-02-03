use crate::intent_schema::*;
use regex::Regex;
use std::collections::HashMap;

/// The Intention Parser middleware that transforms natural language into structured IntentSchema
pub struct IntentionParser {
    /// Regex patterns for identifying different intent types
    intent_patterns: HashMap<String, Regex>,
    
    /// Keywords for sentiment analysis
    positive_keywords: Vec<String>,
    negative_keywords: Vec<String>,
    
    /// Keywords for vibe detection
    vibe_keywords: HashMap<Vibe, Vec<String>>,
}

impl IntentionParser {
    /// Creates a new IntentionParser with initialized patterns
    pub fn new() -> Self {
        let mut intent_patterns = HashMap::new();
        
        // Reservation patterns
        intent_patterns.insert(
            "reservation".to_string(),
            Regex::new(r"(book|reserve|table|restaurant|hotel|appointment)").unwrap(),
        );
        
        // Transportation patterns
        intent_patterns.insert(
            "transportation".to_string(),
            Regex::new(r"(uber|taxi|ride|car|pickup|drive|get me to)").unwrap(),
        );
        
        // Scheduling patterns
        intent_patterns.insert(
            "schedule".to_string(),
            Regex::new(r"(schedule|calendar|meeting|appointment|event|set up|arrange)").unwrap(),
        );
        
        // Purchase patterns
        intent_patterns.insert(
            "purchase".to_string(),
            Regex::new(r"(buy|purchase|order|get|deliver|send|shop)").unwrap(),
        );
        
        // Query patterns
        intent_patterns.insert(
            "query".to_string(),
            Regex::new(r"(what|where|when|who|how|find|search|tell me|know)").unwrap(),
        );
        
        let positive_keywords = vec![
            "happy".to_string(),
            "great".to_string(),
            "love".to_string(),
            "amazing".to_string(),
            "perfect".to_string(),
            "excellent".to_string(),
            "fantastic".to_string(),
            "wonderful".to_string(),
        ];
        
        let negative_keywords = vec![
            "hate".to_string(),
            "terrible".to_string(),
            "awful".to_string(),
            "horrible".to_string(),
            "disappointed".to_string(),
            "bad".to_string(),
            "annoying".to_string(),
            "frustrating".to_string(),
        ];
        
        let mut vibe_keywords = HashMap::new();
        vibe_keywords.insert(
            Vibe::Efficient,
            vec![
                "quick".to_string(),
                "fast".to_string(),
                "efficient".to_string(),
                "time-saving".to_string(),
                "straightforward".to_string(),
                "direct".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Relaxing,
            vec![
                "relaxing".to_string(),
                "calming".to_string(),
                "peaceful".to_string(),
                "chill".to_string(),
                "unwind".to_string(),
                "rest".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Luxurious,
            vec![
                "luxury".to_string(),
                "premium".to_string(),
                "high-end".to_string(),
                "upscale".to_string(),
                "exclusive".to_string(),
                "posh".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Adventurous,
            vec![
                "adventure".to_string(),
                "explore".to_string(),
                "discover".to_string(),
                "new".to_string(),
                "different".to_string(),
                "exciting".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Minimalist,
            vec![
                "simple".to_string(),
                "minimal".to_string(),
                "basic".to_string(),
                "clean".to_string(),
                "straight".to_string(),
                "no frills".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Social,
            vec![
                "social".to_string(),
                "friends".to_string(),
                "group".to_string(),
                "party".to_string(),
                "together".to_string(),
                "community".to_string(),
            ],
        );
        vibe_keywords.insert(
            Vibe::Private,
            vec![
                "private".to_string(),
                "quiet".to_string(),
                "personal".to_string(),
                "intimate".to_string(),
                "alone".to_string(),
                "personal space".to_string(),
            ],
        );
        
        Self {
            intent_patterns,
            positive_keywords,
            negative_keywords,
            vibe_keywords,
        }
    }
    
    /// Parses natural language input into a structured IntentSchema
    pub fn parse(&self, input: &str) -> IntentSchema {
        let lower_input = input.to_lowercase();
        
        // Extract core intent
        let core_intent = self.extract_core_intent(&lower_input);
        
        // Extract temporal constraints
        let temporal_constraints = self.extract_temporal_constraints(&input);
        
        // Extract budget constraints
        let budget_constraints = self.extract_budget_constraints(&input);
        
        // Extract preference constraints
        let preference_constraints = self.extract_preference_constraints(&input);
        
        // Extract sentiment and vibe
        let sentiment_vibe = self.extract_sentiment_vibe(&lower_input);
        
        // Calculate confidence based on how many elements we could extract
        let confidence = self.calculate_confidence(
            &core_intent,
            &temporal_constraints,
            &budget_constraints,
            &preference_constraints,
        );
        
        IntentSchema {
            core_intent,
            temporal_constraints,
            budget_constraints,
            preference_constraints,
            sentiment_vibe,
            confidence,
            raw_input: input.to_string(),
        }
    }
    
    /// Extracts the core intent from the input text
    fn extract_core_intent(&self, input: &str) -> CoreIntent {
        // Check for reservation intent
        if self.intent_patterns.get("reservation").unwrap().is_match(input) {
            return CoreIntent::BookReservation(self.extract_reservation_intent(input));
        }
        
        // Check for transportation intent
        if self.intent_patterns.get("transportation").unwrap().is_match(input) {
            return CoreIntent::TransportationRequest(self.extract_transportation_intent(input));
        }
        
        // Check for scheduling intent
        if self.intent_patterns.get("schedule").unwrap().is_match(input) {
            return CoreIntent::ScheduleEvent(self.extract_schedule_intent(input));
        }
        
        // Check for purchase intent
        if self.intent_patterns.get("purchase").unwrap().is_match(input) {
            return CoreIntent::PurchaseItem(self.extract_purchase_intent(input));
        }
        
        // Check for query intent
        if self.intent_patterns.get("query").unwrap().is_match(input) {
            return CoreIntent::InformationQuery(self.extract_query_intent(input));
        }
        
        // Default to custom intent if none match
        CoreIntent::Custom(input.to_string())
    }
    
    /// Extracts reservation intent details
    fn extract_reservation_intent(&self, input: &str) -> ReservationIntent {
        let reservation_type = if input.contains("restaurant") || input.contains("eat") {
            ReservationType::Restaurant
        } else if input.contains("hotel") || input.contains("stay") {
            ReservationType::Hotel
        } else if input.contains("event") {
            ReservationType::Event
        } else {
            ReservationType::Service
        };
        
        // Extract location
        let location = self.extract_location(input);
        
        // Extract party size
        let party_size = self.extract_party_size(input);
        
        // Extract preferred time
        let preferred_time = self.extract_time(input);
        
        // Extract special requests
        let special_requests = self.extract_special_requests(input);
        
        ReservationIntent {
            reservation_type,
            location,
            party_size,
            preferred_time,
            special_requests,
        }
    }
    
    /// Extracts transportation intent details
    fn extract_transportation_intent(&self, input: &str) -> TransportationIntent {
        // Extract pickup location (usually comes after "from" or "pickup")
        let pickup_location = self.extract_location_from_phrase(input, &["from", "pickup"]);
        
        // Extract destination (usually comes after "to" or "destination")
        let destination = self.extract_location_from_phrase(input, &["to", "destination"]);
        
        // Extract departure time
        let departure_time = self.extract_time(input);
        
        // Extract vehicle preference
        let vehicle_preference = self.extract_vehicle_preference(input);
        
        // Extract max cost
        let max_cost = self.extract_budget_amount(input);
        
        TransportationIntent {
            pickup_location: pickup_location.unwrap_or_else(|| "Current location".to_string()),
            destination: destination.unwrap_or_else(|| "Unknown destination".to_string()),
            departure_time,
            vehicle_preference,
            max_cost,
        }
    }
    
    /// Extracts schedule intent details
    fn extract_schedule_intent(&self, input: &str) -> ScheduleIntent {
        // Extract event title (everything that looks like it could be an event name)
        let event_title = self.extract_event_title(input);
        
        // Extract start time
        let start_time = self.extract_time(input).unwrap_or_else(|| "Not specified".to_string());
        
        // Extract end time (if specified)
        let end_time = self.extract_end_time(input).unwrap_or_else(|| start_time.clone());
        
        // Extract location
        let location = self.extract_location(input);
        
        // Extract attendees
        let attendees = self.extract_attendees(input);
        
        // Extract priority
        let priority = self.extract_priority(input);
        
        ScheduleIntent {
            event_title,
            start_time,
            end_time,
            location,
            attendees,
            priority,
        }
    }
    
    /// Extracts purchase intent details
    fn extract_purchase_intent(&self, input: &str) -> PurchaseIntent {
        // Extract item description
        let item_description = self.extract_item_description(input);
        
        // Extract quantity
        let quantity = self.extract_quantity(input).unwrap_or(1);
        
        // Extract max price
        let max_price = self.extract_budget_amount(input);
        
        // Extract delivery preference
        let delivery_preference = self.extract_delivery_method(input);
        
        PurchaseIntent {
            item_description,
            quantity,
            max_price,
            delivery_preference,
        }
    }
    
    /// Extracts query intent details
    fn extract_query_intent(&self, input: &str) -> QueryIntent {
        // Extract topic and details
        let query_topic = self.extract_query_topic(input);
        let query_details = self.extract_query_details(input);
        
        QueryIntent {
            query_topic,
            query_details,
        }
    }
    
    /// Extracts temporal constraints
    fn extract_temporal_constraints(&self, input: &str) -> Option<TemporalConstraints> {
        // Look for time expressions in the input
        let time_expr = self.extract_time(input);
        
        if time_expr.is_some() {
            Some(TemporalConstraints {
                earliest_start: time_expr.clone(),
                latest_end: None, // Would need more complex parsing for this
                preferred_time_range: None, // Would need more complex parsing for this
                duration: None, // Would need more complex parsing for this
            })
        } else {
            None
        }
    }
    
    /// Extracts budget constraints
    fn extract_budget_constraints(&self, input: &str) -> Option<BudgetConstraints> {
        let amount = self.extract_budget_amount(input);
        
        if let Some(max_amount) = amount {
            Some(BudgetConstraints {
                max_amount,
                currency: "USD".to_string(), // Default to USD, could be improved
                flexibility_percentage: 0.1, // Default 10% flexibility
            })
        } else {
            None
        }
    }
    
    /// Extracts preference constraints
    fn extract_preference_constraints(&self, input: &str) -> Option<PreferenceConstraints> {
        // Determine quality preference
        let quality_preference = self.extract_quality_preference(input);
        
        // Extract brand preferences
        let brand_preferences = self.extract_brand_preferences(input);
        
        // Extract exclusion list
        let exclusion_list = self.extract_exclusions(input);
        
        // Extract accessibility needs
        let accessibility_needs = self.extract_accessibility_needs(input);
        
        Some(PreferenceConstraints {
            quality_preference,
            brand_preferences,
            exclusion_list,
            accessibility_needs,
        })
    }
    
    /// Extracts sentiment and vibe
    fn extract_sentiment_vibe(&self, input: &str) -> SentimentVibe {
        // Determine sentiment
        let sentiment = self.determine_sentiment(input);
        
        // Determine vibe
        let vibe = self.determine_vibe(input);
        
        // Determine urgency level
        let urgency_level = self.determine_urgency(input);
        
        SentimentVibe {
            sentiment,
            vibe,
            urgency_level,
        }
    }
    
    /// Calculates confidence score based on extracted elements
    fn calculate_confidence(
        &self,
        core_intent: &CoreIntent,
        temporal_constraints: &Option<TemporalConstraints>,
        budget_constraints: &Option<BudgetConstraints>,
        preference_constraints: &Option<PreferenceConstraints>,
    ) -> f32 {
        let mut score = 0.5; // Base confidence
        
        // Increase confidence if we have a recognized core intent (not custom)
        if !matches!(core_intent, CoreIntent::Custom(_)) {
            score += 0.3;
        }
        
        // Increase confidence if we have temporal constraints
        if temporal_constraints.is_some() {
            score += 0.1;
        }
        
        // Increase confidence if we have budget constraints
        if budget_constraints.is_some() {
            score += 0.05;
        }
        
        // Increase confidence if we have preference constraints
        if preference_constraints.is_some() {
            score += 0.05;
        }
        
        // Cap at 1.0
        score.min(1.0)
    }
    
    // Helper methods for extracting various components
    
    fn extract_location(&self, input: &str) -> Option<String> {
        // Simple location extraction - would need more sophisticated NLP in practice
        // Look for phrases like "at [location]", "in [location]", "near [location]"
        let re = Regex::new(r"(?:at|in|near|by)\s+([A-Z][^,\.\s]+(?:\s+[A-Z][^,\.\s]+)*)").unwrap();
        if let Some(caps) = re.captures(input) {
            if let Some(location) = caps.get(1) {
                return Some(location.as_str().to_string());
            }
        }
        None
    }
    
    fn extract_location_from_phrase(&self, input: &str, prefixes: &[&str]) -> Option<String> {
        for prefix in prefixes {
            if let Some(pos) = input.find(prefix) {
                let after_prefix = &input[pos + prefix.len()..];
                let re = Regex::new(r"^\s+([A-Z][^,\.\s]+(?:\s+[A-Z][^,\.\s]+)*)").unwrap();
                if let Some(caps) = re.captures(after_prefix) {
                    if let Some(location) = caps.get(1) {
                        return Some(location.as_str().to_string());
                    }
                }
            }
        }
        None
    }
    
    fn extract_party_size(&self, input: &str) -> Option<u32> {
        let re = Regex::new(r"for\s+(\d+)\s+(?:people|person|ppl|guests?)").unwrap();
        if let Some(caps) = re.captures(input) {
            if let Ok(size) = caps[1].parse::<u32>() {
                return Some(size);
            }
        }
        None
    }
    
    fn extract_time(&self, input: &str) -> Option<String> {
        // Look for time expressions
        let time_re = Regex::new(r"\b(?:at|on|by|for)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b").unwrap();
        if let Some(caps) = time_re.captures(input) {
            return Some(caps[1].to_string());
        }
        
        // Look for date expressions
        let date_re = Regex::new(r"\b(\d{1,2}/\d{1,2}(?:/\d{2,4})?|\d{4}-\d{2}-\d{2})\b").unwrap();
        if let Some(caps) = date_re.captures(input) {
            return Some(caps[1].to_string());
        }
        
        None
    }
    
    fn extract_end_time(&self, input: &str) -> Option<String> {
        // Look for end time expressions (after "until", "to", etc.)
        let re = Regex::new(r"(?:until|to)\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)").unwrap();
        if let Some(caps) = re.captures(input) {
            return Some(caps[1].to_string());
        }
        None
    }
    
    fn extract_special_requests(&self, input: &str) -> Vec<String> {
        let mut requests = Vec::new();
        
        if input.contains("window seat") || input.contains("window table") {
            requests.push("Window seating".to_string());
        }
        
        if input.contains("non-smoking") {
            requests.push("Non-smoking area".to_string());
        }
        
        if input.contains("vegetarian") || input.contains("vegan") {
            requests.push("Vegetarian/Vegan options".to_string());
        }
        
        requests
    }
    
    fn extract_vehicle_preference(&self, input: &str) -> Option<VehicleType> {
        if input.contains("luxury") || input.contains("premium") {
            Some(VehicleType::Luxury)
        } else if input.contains("bike") || input.contains("motorcycle") {
            Some(VehicleType::Bike)
        } else if input.contains("pool") || input.contains("shared") {
            Some(VehicleType::Pool)
        } else {
            Some(VehicleType::Standard)
        }
    }
    
    fn extract_budget_amount(&self, input: &str) -> Option<f64> {
        let re = Regex::new(r"\$(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s+dollars|budget\s+of\s+(\d+(?:\.\d{2})?)").unwrap();
        if let Some(caps) = re.captures(input) {
            for i in 1..=caps.len() {
                if let Some(matched) = caps.get(i) {
                    if let Ok(amount) = matched.as_str().parse::<f64>() {
                        return Some(amount);
                    }
                }
            }
        }
        None
    }
    
    fn extract_event_title(&self, input: &str) -> String {
        // Simple heuristic: take the part of the sentence that follows scheduling keywords
        let re = Regex::new(r"(?:schedule|set up|arrange|plan|book)\s+(.+?)(?:\s+for|\s+on|\s+at|$)").unwrap();
        if let Some(caps) = re.captures(input) {
            return caps[1].to_string();
        }
        
        // If no match, return the whole input as a fallback
        input.to_string()
    }
    
    fn extract_attendees(&self, input: &str) -> Vec<String> {
        let mut attendees = Vec::new();
        
        // Look for mentions of people
        let re = Regex::new(r"(?:with|and|meet)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)").unwrap();
        for caps in re.captures_iter(input) {
            if let Some(person) = caps.get(1) {
                attendees.push(person.as_str().to_string());
            }
        }
        
        attendees
    }
    
    fn extract_priority(&self, input: &str) -> PriorityLevel {
        if input.contains("urgent") || input.contains("critical") || input.contains("emergency") {
            PriorityLevel::Critical
        } else if input.contains("important") || input.contains("high priority") {
            PriorityLevel::High
        } else if input.contains("low priority") {
            PriorityLevel::Low
        } else {
            PriorityLevel::Medium
        }
    }
    
    fn extract_quantity(&self, input: &str) -> Option<u32> {
        let re = Regex::new(r"(\d+)\s+(?:item|items|piece|pieces|quantity)").unwrap();
        if let Some(caps) = re.captures(input) {
            if let Ok(quantity) = caps[1].parse::<u32>() {
                return Some(quantity);
            }
        }
        None
    }
    
    fn extract_item_description(&self, input: &str) -> String {
        // Extract the item being purchased
        let re = Regex::new(r"(?:buy|purchase|order|get)\s+(.+?)(?:\s+for|\s+with|\s+that|$)").unwrap();
        if let Some(caps) = re.captures(input) {
            return caps[1].to_string();
        }
        
        input.to_string()
    }
    
    fn extract_delivery_method(&self, input: &str) -> Option<DeliveryMethod> {
        if input.contains("express") || input.contains("fast") || input.contains("urgent") {
            Some(DeliveryMethod::Express)
        } else if input.contains("pickup") || input.contains("collect") {
            Some(DeliveryMethod::Pickup)
        } else {
            Some(DeliveryMethod::Standard)
        }
    }
    
    fn extract_query_topic(&self, input: &str) -> String {
        // Extract the main topic of the query
        let re = Regex::new(r"(?:what|where|when|who|how|find|search|tell me|know)\s+(?:is|are|was|were|about|regarding|concerning)?\s*(.+?)(?:\?|$)").unwrap();
        if let Some(caps) = re.captures(input) {
            return caps[1].trim().to_string();
        }
        
        input.to_string()
    }
    
    fn extract_query_details(&self, input: &str) -> HashMap<String, String> {
        let mut details = HashMap::new();
        
        // Extract location context for queries
        if let Some(location) = self.extract_location(input) {
            details.insert("location".to_string(), location);
        }
        
        // Extract time context for queries
        if let Some(time) = self.extract_time(input) {
            details.insert("time".to_string(), time);
        }
        
        details
    }
    
    fn extract_quality_preference(&self, input: &str) -> QualityLevel {
        if input.contains("premium") || input.contains("high-end") || input.contains("luxury") {
            QualityLevel::Premium
        } else if input.contains("basic") || input.contains("simple") || input.contains("minimal") {
            QualityLevel::Basic
        } else if input.contains("deluxe") || input.contains("top") || input.contains("best") {
            QualityLevel::Luxury
        } else {
            QualityLevel::Standard
        }
    }
    
    fn extract_brand_preferences(&self, input: &str) -> Vec<String> {
        let mut brands = Vec::new();
        
        // This would need a comprehensive list of known brands in a real implementation
        if input.contains("starbucks") {
            brands.push("Starbucks".to_string());
        }
        
        if input.contains("mcdonald's") || input.contains("mcdonalds") {
            brands.push("McDonald's".to_string());
        }
        
        if input.contains("whole foods") || input.contains("wholefoods") {
            brands.push("Whole Foods".to_string());
        }
        
        brands
    }
    
    fn extract_exclusions(&self, input: &str) -> Vec<String> {
        let mut exclusions = Vec::new();
        
        if input.contains("no peanuts") || input.contains("peanut free") {
            exclusions.push("Peanuts".to_string());
        }
        
        if input.contains("no seafood") || input.contains("seafood free") {
            exclusions.push("Seafood".to_string());
        }
        
        if input.contains("not too loud") || input.contains("quiet place") {
            exclusions.push("Loud environments".to_string());
        }
        
        exclusions
    }
    
    fn extract_accessibility_needs(&self, input: &str) -> Vec<AccessibilityRequirement> {
        let mut needs = Vec::new();
        
        if input.contains("wheelchair accessible") || input.contains("wheelchair") {
            needs.push(AccessibilityRequirement::WheelchairAccessible);
        }
        
        if input.contains("hearing impaired") || input.contains("hearing assistance") {
            needs.push(AccessibilityRequirement::HearingAssistance);
        }
        
        if input.contains("visual impairment") || input.contains("seeing assistance") {
            needs.push(AccessibilityRequirement::VisualAssistance);
        }
        
        // Dietary restrictions
        let mut dietary_restrictions = Vec::new();
        if input.contains("vegetarian") {
            dietary_restrictions.push("vegetarian".to_string());
        }
        if input.contains("vegan") {
            dietary_restrictions.push("vegan".to_string());
        }
        if input.contains("gluten free") || input.contains("gluten-free") {
            dietary_restrictions.push("gluten-free".to_string());
        }
        if input.contains("kosher") {
            dietary_restrictions.push("kosher".to_string());
        }
        if input.contains("halal") {
            dietary_restrictions.push("halal".to_string());
        }
        
        if !dietary_restrictions.is_empty() {
            needs.push(AccessibilityRequirement::DietaryRestrictions(dietary_restrictions));
        }
        
        needs
    }
    
    fn determine_sentiment(&self, input: &str) -> Sentiment {
        let mut pos_count = 0;
        let mut neg_count = 0;
        
        for word in self.positive_keywords.iter() {
            if input.contains(word) {
                pos_count += 1;
            }
        }
        
        for word in self.negative_keywords.iter() {
            if input.contains(word) {
                neg_count += 1;
            }
        }
        
        if neg_count > pos_count {
            Sentiment::Negative
        } else if pos_count > neg_count {
            Sentiment::Positive
        } else {
            Sentiment::Neutral
        }
    }
    
    fn determine_vibe(&self, input: &str) -> Vibe {
        let mut vibe_scores = HashMap::new();
        
        for (vibe, keywords) in self.vibe_keywords.iter() {
            let mut score = 0;
            for keyword in keywords {
                if input.contains(keyword) {
                    score += 1;
                }
            }
            vibe_scores.insert(vibe, score);
        }
        
        // Find the vibe with the highest score
        let mut max_vibe = Vibe::Efficient;
        let mut max_score = 0;
        
        for (vibe, score) in vibe_scores.iter() {
            if *score > max_score {
                max_score = *score;
                max_vibe = (*vibe).clone();
            }
        }
        
        max_vibe
    }
    
    fn determine_urgency(&self, input: &str) -> UrgencyLevel {
        if input.contains("now") || input.contains("immediately") || input.contains("right away") || input.contains("asap") || input.contains("urgent") {
            UrgencyLevel::Immediate
        } else if input.contains("soon") || input.contains("today") || input.contains("tonight") {
            UrgencyLevel::High
        } else if input.contains("sometime") || input.contains("whenever") || input.contains("whenever works") {
            UrgencyLevel::Low
        } else {
            UrgencyLevel::Medium
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_reservation() {
        let parser = IntentionParser::new();
        let input = "I want to book a table for 4 people at a nice restaurant tonight at 7pm";
        
        let result = parser.parse(input);
        
        assert!(matches!(result.core_intent, CoreIntent::BookReservation(_)));
        assert_eq!(result.confidence, 1.0); // Should have high confidence
    }

    #[test]
    fn test_parse_transportation_request() {
        let parser = IntentionParser::new();
        let input = "Get me an Uber from downtown to the airport tomorrow morning";
        
        let result = parser.parse(input);
        
        assert!(matches!(result.core_intent, CoreIntent::TransportationRequest(_)));
    }
}