use crate::intent_schema::*;
use crate::intention_parser::IntentionParser;
use crate::capability_registry::CapabilityRegistry;
use crate::verification_loop::VerificationLoop;
use crate::user_preferences::{UserPreferenceVector, UserActionHistory, ActionType, ActionOutcome};
use crate::conflict_checker::ConflictChecker;
use crate::approval_token::ApprovalTokenValidator;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// State of the orchestrator
#[derive(Debug, Clone, PartialEq)]
pub enum OrchestratorState {
    Ingest,
    Validate,
    Draft,
    Check,
    Wait,
    Execute,
    Report,
    Error,
}

/// The Core Orchestrator for the Intention Engine
pub struct CoreOrchestrator {
    /// Current state of the orchestrator
    state: OrchestratorState,
    
    /// Intention parser component
    intention_parser: IntentionParser,
    
    /// Capability registry
    capability_registry: CapabilityRegistry,
    
    /// Verification loop
    verification_loop: VerificationLoop,
    
    /// Conflict checker
    conflict_checker: ConflictChecker,
    
    /// Approval token validator
    approval_validator: ApprovalTokenValidator,
    
    /// User preference vector
    user_preferences: UserPreferenceVector,
    
    /// Current intent being processed
    current_intent: Option<IntentSchema>,
    
    /// Generated paths for the current intent
    current_paths: Vec<crate::verification_loop::LifePath>,
    
    /// Selected path after user approval
    selected_path: Option<crate::verification_loop::LifePath>,
    
    /// Execution results
    execution_results: Option<HashMap<String, String>>,
    
    /// Error message if in error state
    error_message: Option<String>,
}

/// Proposed action plan that gets presented to the user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposedActionPlan {
    pub intent: IntentSchema,
    pub paths: Vec<crate::verification_loop::LifePath>,
    pub conflicts: Vec<String>,
    pub user_preferences_considered: bool,
    pub timestamp: DateTime<Utc>,
}

impl CoreOrchestrator {
    /// Creates a new Core Orchestrator
    pub fn new(user_preferences: UserPreferenceVector) -> Self {
        let capability_registry = CapabilityRegistry::new();
        let verification_loop = VerificationLoop::new(capability_registry.clone());
        let conflict_checker = ConflictChecker::new();
        let approval_validator = ApprovalTokenValidator::new();
        
        Self {
            state: OrchestratorState::Ingest,
            intention_parser: IntentionParser::new(),
            capability_registry,
            verification_loop,
            conflict_checker,
            approval_validator,
            user_preferences,
            current_intent: None,
            current_paths: Vec::new(),
            selected_path: None,
            execution_results: None,
            error_message: None,
        }
    }
    
    /// Process user input through the state machine
    pub fn process_input(&mut self, user_input: &str) -> Result<ProposedActionPlan, String> {
        // Step 1: INGEST - Receive user input and extract intent
        self.ingest(user_input)?;
        
        // Step 2: VALIDATE - Check if we have the tools to fulfill the intent
        self.validate()?;
        
        // Step 3: DRAFT - Generate 3 life paths
        self.draft()?;
        
        // Step 4: CHECK - Run conflict check against calendar and preferences
        self.check()?;
        
        // Step 5: WAIT - Output the proposed action plan and wait for approval
        self.wait()
    }
    
    /// Execute the selected path after user approval
    pub fn execute_with_approval(&mut self, approval_token: &str, path_index: usize) -> Result<String, String> {
        // Validate the approval token
        if !self.approval_validator.validate(approval_token) {
            return Err("Invalid or expired approval token".to_string());
        }
        
        // Select the path based on the index
        if path_index >= self.current_paths.len() {
            return Err("Invalid path index".to_string());
        }
        
        self.selected_path = Some(self.current_paths[path_index].clone());
        
        // Change state to Execute
        self.state = OrchestratorState::Execute;
        
        // Step 6: EXECUTE - Trigger the multi-agent MCP tools in parallel
        self.execute()
    }
    
    /// INGEST: Receive user input, extract core intent, constraints, and sentiment/vibe
    fn ingest(&mut self, user_input: &str) -> Result<(), String> {
        self.state = OrchestratorState::Ingest;
        
        // Parse the user input into a structured intent
        let intent = self.intention_parser.parse(user_input);
        
        // Store the parsed intent
        self.current_intent = Some(intent);
        
        Ok(())
    }
    
    /// VALIDATE: Consult the Capability Registry to check if tools are available
    fn validate(&mut self) -> Result<(), String> {
        self.state = OrchestratorState::Validate;
        
        let intent = self.current_intent.as_ref().ok_or("No intent to validate")?;
        
        // Determine the intent type for validation
        let intent_type = match &intent.core_intent {
            CoreIntent::BookReservation(_) => "ReservationIntent",
            CoreIntent::ScheduleEvent(_) => "ScheduleIntent",
            CoreIntent::TransportationRequest(_) => "TransportationRequest",
            CoreIntent::PurchaseItem(_) => "PurchaseItem",
            CoreIntent::InformationQuery(_) => "InformationQuery",
            CoreIntent::Custom(_) => "Custom",
        };
        
        // Validate that required capabilities are available
        self.capability_registry.validate_intent_capabilities(intent_type)
    }
    
    /// DRAFT: Generate 3 life paths (Efficiency, Luxury, Discovery)
    fn draft(&mut self) -> Result<(), String> {
        self.state = OrchestratorState::Draft;
        
        let intent = self.current_intent.as_ref().ok_or("No intent to draft paths for")?;
        
        // Generate the three distinct paths
        let paths = self.verification_loop.generate_paths(intent, &self.user_preferences)?;
        
        if paths.len() != 3 {
            return Err("Failed to generate all three required paths".to_string());
        }
        
        self.current_paths = paths;
        
        Ok(())
    }
    
    /// CHECK: Run conflict check against the user's calendar and preference vector
    fn check(&mut self) -> Result<(), String> {
        self.state = OrchestratorState::Check;
        
        let intent = self.current_intent.as_ref().ok_or("No intent to check for conflicts")?;
        
        // Check for conflicts with calendar and preferences
        let conflicts = self.conflict_checker.check_conflicts(intent, &self.user_preferences);
        
        // For now, we'll just log conflicts but continue processing
        // In a real implementation, we might want to modify paths based on conflicts
        println!("Detected conflicts: {:?}", conflicts);
        
        Ok(())
    }
    
    /// WAIT: Output the structured ProposedActionPlan JSON and wait for USER_CONFIRM
    fn wait(&mut self) -> Result<ProposedActionPlan, String> {
        self.state = OrchestratorState::Wait;
        
        let intent = self.current_intent.as_ref().ok_or("No intent available")?;
        let conflicts = self.conflict_checker.check_conflicts(intent, &self.user_preferences);
        
        let plan = ProposedActionPlan {
            intent: intent.clone(),
            paths: self.current_paths.clone(),
            conflicts,
            user_preferences_considered: true, // We always consider user preferences
            timestamp: Utc::now(),
        };
        
        Ok(plan)
    }
    
    /// EXECUTE: Trigger the multi-agent MCP tools in parallel upon user confirmation
    fn execute(&mut self) -> Result<String, String> {
        self.state = OrchestratorState::Execute;
        
        let selected_path = self.selected_path.as_ref().ok_or("No path selected for execution")?;
        
        // Execute the steps in the selected path
        let mut results = HashMap::new();
        
        for (index, step) in selected_path.steps.iter().enumerate() {
            println!("Executing step {}: {} using {}", index + 1, step.action, step.capability);
            
            // In a real implementation, this would call the actual capability
            // For now, we'll simulate execution
            let result = self.execute_step(step)?;
            results.insert(format!("step_{}", index + 1), result);
        }
        
        self.execution_results = Some(results.clone());
        
        // Record the action in user preferences
        if let Some(ref intent) = self.current_intent {
            let action_history = UserActionHistory {
                action_id: format!("action_{}", Utc::now().timestamp()),
                action_type: self.get_action_type_from_intent(intent),
                intent: intent.clone(),
                selected_path: Some(selected_path.path_type.clone()),
                outcome: ActionOutcome::Success,
                satisfaction_rating: None, // Would come from user feedback
                timestamp: Utc::now(),
                cost: selected_path.estimated_cost,
                time_spent: selected_path.estimated_time.clone(),
            };
            
            self.user_preferences.update_from_action(action_history);
        }
        
        Ok("Execution completed successfully".to_string())
    }
    
    /// REPORT: Provide a concise summary of bookings/actions taken
    fn report(&mut self) -> Result<String, String> {
        self.state = OrchestratorState::Report;
        
        let results = self.execution_results.as_ref().ok_or("No execution results to report")?;
        
        let mut report = "Execution Summary:\n".to_string();
        for (step, result) in results {
            report.push_str(&format!("  {}: {}\n", step, result));
        }
        
        Ok(report)
    }
    
    /// Execute a single step in the plan
    fn execute_step(&self, step: &crate::verification_loop::ExecutionStep) -> Result<String, String> {
        // In a real implementation, this would call the actual capability API
        // For simulation purposes, we'll return a success message
        Ok(format!("Successfully executed {} using {}", step.action, step.capability))
    }
    
    /// Get the action type from an intent
    fn get_action_type_from_intent(&self, intent: &IntentSchema) -> ActionType {
        match &intent.core_intent {
            CoreIntent::TransportationRequest(_) => ActionType::TransportationBooking,
            CoreIntent::BookReservation(_) => ActionType::ReservationBooking,
            CoreIntent::ScheduleEvent(_) => ActionType::ScheduleEvent,
            CoreIntent::PurchaseItem(_) => ActionType::Purchase,
            CoreIntent::InformationQuery(_) => ActionType::InformationQuery,
            CoreIntent::Custom(_) => ActionType::Custom("custom".to_string()),
        }
    }
    
    /// Get the current state
    pub fn get_state(&self) -> OrchestratorState {
        self.state.clone()
    }
    
    /// Get the current intent
    pub fn get_current_intent(&self) -> Option<&IntentSchema> {
        self.current_intent.as_ref()
    }
    
    /// Get the generated paths
    pub fn get_generated_paths(&self) -> &Vec<crate::verification_loop::LifePath> {
        &self.current_paths
    }
    
    /// Get the user preferences
    pub fn get_user_preferences(&self) -> &UserPreferenceVector {
        &self.user_preferences
    }
    
    /// Update user preferences
    pub fn update_user_preferences(&mut self, new_preferences: UserPreferenceVector) {
        self.user_preferences = new_preferences;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_orchestration_process() {
        let user_prefs = UserPreferenceVector::new();
        let mut orchestrator = CoreOrchestrator::new(user_prefs);
        
        // Test the full process with a transportation request
        let input = "Get me an Uber from downtown to the airport tomorrow morning";
        
        // Process the input through the state machine
        let plan = orchestrator.process_input(input).expect("Failed to process input");
        
        // Verify we have the expected components
        assert!(matches!(orchestrator.get_state(), OrchestratorState::Wait));
        assert_eq!(plan.paths.len(), 3); // Should have 3 paths
        assert!(matches!(plan.intent.core_intent, CoreIntent::TransportationRequest(_)));
        
        // Simulate user approval and execute
        let approval_token = "valid_token_123";
        let execution_result = orchestrator.execute_with_approval(approval_token, 0);
        
        assert!(execution_result.is_ok());
        assert!(matches!(orchestrator.get_state(), OrchestratorState::Execute));
    }

    #[test]
    fn test_validation_failure() {
        let user_prefs = UserPreferenceVector::new();
        let mut orchestrator = CoreOrchestrator::new(user_prefs);
        
        // Disable a required capability
        orchestrator.capability_registry.update_availability("uber", false);
        
        // Try to process a transportation request
        let input = "Get me an Uber from downtown to the airport tomorrow morning";
        
        // This should fail validation
        let result = orchestrator.process_input(input);
        
        assert!(result.is_err());
        assert!(result.err().unwrap().contains("Required capability"));
    }
}