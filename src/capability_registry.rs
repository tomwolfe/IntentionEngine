use std::collections::HashMap;

/// Represents a third-party service capability
#[derive(Debug, Clone)]
pub struct Capability {
    pub name: String,
    pub description: String,
    pub available: bool,
    pub api_endpoint: String,
    pub required_params: Vec<String>,
    pub optional_params: Vec<String>,
    pub rate_limit: Option<u32>, // Requests per minute
    pub authentication_required: bool,
}

/// Registry of available capabilities/tools
pub struct CapabilityRegistry {
    capabilities: HashMap<String, Capability>,
}

impl CapabilityRegistry {
    /// Creates a new empty capability registry
    pub fn new() -> Self {
        let mut registry = CapabilityRegistry {
            capabilities: HashMap::new(),
        };
        
        // Register default capabilities
        registry.register_default_capabilities();
        registry
    }
    
    /// Registers the default capabilities (Uber, OpenTable, Calendar)
    fn register_default_capabilities(&mut self) {
        // Uber capability
        self.capabilities.insert(
            "uber".to_string(),
            Capability {
                name: "Uber".to_string(),
                description: "Transportation service for booking rides".to_string(),
                available: true, // In a real implementation, this would be checked dynamically
                api_endpoint: "https://api.uber.com/v1".to_string(),
                required_params: vec!["pickup_latitude".to_string(), "pickup_longitude".to_string(), "destination_latitude".to_string(), "destination_longitude".to_string()],
                optional_params: vec!["product_id".to_string(), "surge_confirmation_id".to_string(), "payment_method_id".to_string()],
                rate_limit: Some(100), // 100 requests per minute
                authentication_required: true,
            }
        );
        
        // OpenTable capability
        self.capabilities.insert(
            "opentable".to_string(),
            Capability {
                name: "OpenTable".to_string(),
                description: "Restaurant reservation service".to_string(),
                available: true, // In a real implementation, this would be checked dynamically
                api_endpoint: "https://opentable.herokuapp.com/api".to_string(),
                required_params: vec!["date".to_string(), "time".to_string(), "party_size".to_string(), "postal_code".to_string()],
                optional_params: vec!["restaurant_id".to_string(), "neighborhood_id".to_string(), "cuisine".to_string()],
                rate_limit: Some(1000), // 1000 requests per minute
                authentication_required: false,
            }
        );
        
        // Calendar capability (Google Calendar, Apple Calendar, etc.)
        self.capabilities.insert(
            "calendar".to_string(),
            Capability {
                name: "Calendar".to_string(),
                description: "Calendar service for scheduling events".to_string(),
                available: true, // In a real implementation, this would be checked dynamically
                api_endpoint: "https://www.googleapis.com/calendar/v3".to_string(),
                required_params: vec!["event_title".to_string(), "start_time".to_string(), "end_time".to_string()],
                optional_params: vec!["attendees".to_string(), "location".to_string(), "description".to_string()],
                rate_limit: Some(1000), // 1000 requests per minute
                authentication_required: true,
            }
        );
        
        // Additional capabilities could be added here
        self.capabilities.insert(
            "weather".to_string(),
            Capability {
                name: "Weather".to_string(),
                description: "Weather information service".to_string(),
                available: true,
                api_endpoint: "https://api.openweathermap.org/data/2.5".to_string(),
                required_params: vec!["city".to_string()],
                optional_params: vec!["country".to_string(), "units".to_string()],
                rate_limit: Some(60), // 60 requests per minute for free tier
                authentication_required: true,
            }
        );
        
        self.capabilities.insert(
            "email".to_string(),
            Capability {
                name: "Email".to_string(),
                description: "Email sending service".to_string(),
                available: true,
                api_endpoint: "smtp://email-service.com".to_string(),
                required_params: vec!["to".to_string(), "subject".to_string(), "body".to_string()],
                optional_params: vec!["cc".to_string(), "bcc".to_string(), "attachments".to_string()],
                rate_limit: Some(500), // 500 emails per hour
                authentication_required: true,
            }
        );
    }
    
    /// Checks if a capability exists and is available
    pub fn is_available(&self, capability_name: &str) -> bool {
        if let Some(capability) = self.capabilities.get(capability_name) {
            capability.available
        } else {
            false
        }
    }
    
    /// Gets a capability by name
    pub fn get_capability(&self, capability_name: &str) -> Option<&Capability> {
        self.capabilities.get(capability_name)
    }
    
    /// Lists all available capabilities
    pub fn list_available_capabilities(&self) -> Vec<&Capability> {
        self.capabilities
            .values()
            .filter(|cap| cap.available)
            .collect()
    }
    
    /// Registers a new capability
    pub fn register_capability(&mut self, capability: Capability) {
        self.capabilities.insert(capability.name.to_lowercase(), capability);
    }
    
    /// Updates the availability status of a capability
    pub fn update_availability(&mut self, capability_name: &str, available: bool) {
        if let Some(capability) = self.capabilities.get_mut(capability_name) {
            capability.available = available;
        }
    }
    
    /// Checks if all required capabilities for an intent are available
    pub fn validate_intent_capabilities(&self, intent_name: &str) -> Result<(), String> {
        // Map intent types to required capabilities
        let required_capabilities = match intent_name.to_lowercase().as_str() {
            "transportationrequest" => vec!["uber"],
            "reservationintent" => vec!["opentable"],
            "scheduleintent" => vec!["calendar"],
            "weatherquery" => vec!["weather"],
            _ => vec![], // For custom intents, no specific capabilities required
        };
        
        for capability_name in required_capabilities {
            if !self.is_available(capability_name) {
                return Err(format!("Required capability '{}' is not available", capability_name));
            }
        }
        
        Ok(())
    }
    
    /// Performs a health check on all registered capabilities
    pub fn health_check(&self) -> Vec<(String, bool)> {
        let mut results = Vec::new();
        
        for (name, capability) in &self.capabilities {
            // In a real implementation, this would make actual API calls to check health
            // For now, we'll just return the stored availability status
            results.push((name.clone(), capability.available));
        }
        
        results
    }
    
    /// Gets required parameters for a capability
    pub fn get_required_params(&self, capability_name: &str) -> Option<Vec<String>> {
        self.capabilities
            .get(capability_name)
            .map(|cap| cap.required_params.clone())
    }
    
    /// Gets optional parameters for a capability
    pub fn get_optional_params(&self, capability_name: &str) -> Option<Vec<String>> {
        self.capabilities
            .get(capability_name)
            .map(|cap| cap.optional_params.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_initialization() {
        let registry = CapabilityRegistry::new();
        
        assert!(registry.is_available("uber"));
        assert!(registry.is_available("opentable"));
        assert!(registry.is_available("calendar"));
    }

    #[test]
    fn test_get_capability() {
        let registry = CapabilityRegistry::new();
        
        let uber = registry.get_capability("uber");
        assert!(uber.is_some());
        assert_eq!(uber.unwrap().name, "Uber");
    }

    #[test]
    fn test_validate_intent_capabilities() {
        let registry = CapabilityRegistry::new();
        
        // Transportation intent should require Uber
        assert!(registry.validate_intent_capabilities("TransportationRequest").is_ok());
        
        // If we disable Uber, it should fail
        let mut registry_with_disabled_uber = CapabilityRegistry::new();
        registry_with_disabled_uber.update_availability("uber", false);
        assert!(registry_with_disabled_uber.validate_intent_capabilities("TransportationRequest").is_err());
    }

    #[test]
    fn test_health_check() {
        let registry = CapabilityRegistry::new();
        let health_results = registry.health_check();
        
        assert!(!health_results.is_empty());
        // All default capabilities should be marked as available
        for (_, available) in health_results {
            assert!(available);
        }
    }
}