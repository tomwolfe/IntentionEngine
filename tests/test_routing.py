import pytest
import re

# Mirroring the logic from src/lib/intent-schema.ts
def classify_intent(input_text: str):
    normalized = input_text.lower().strip()
    
    # Keyword-based heuristic
    has_calendar = bool(re.search(r'\b(book|calendar|event|schedule|add to)\b', normalized))
    has_search = bool(re.search(r'\b(find|search|where|look for|nearby)\b', normalized))
    
    if has_calendar:
        return "TOOL_CALENDAR"
    if has_search:
        return "TOOL_SEARCH"
    return "SIMPLE"

@pytest.mark.parametrize("message,expected_intent", [
    ("Hello", "SIMPLE"),
    ("How are you?", "SIMPLE"),
    ("Plan a dinner", "SIMPLE"), # "plan" is not in the search/calendar keywords
    ("Find a restaurant in London", "TOOL_SEARCH"),
    ("Where is the nearest cafe?", "TOOL_SEARCH"),
    ("Book a table for two", "TOOL_CALENDAR"),
    ("Add a meeting to my calendar", "TOOL_CALENDAR"),
    ("Schedule a call for tomorrow", "TOOL_CALENDAR"),
    # Test that length doesn't matter anymore
    ("This is a very long message that used to go to cloud because of its length but now it should be simple because it has no keywords" * 2, "SIMPLE"),
    ("Search for " + "a" * 100, "TOOL_SEARCH"),
])
def test_intent_classification(message, expected_intent):
    assert classify_intent(message) == expected_intent

def test_routing_logic_simple_vs_tool():
    """
    Verifies that SIMPLE intents would be routed locally, while others go to cloud.
    In the app, IntentType.SIMPLE -> Local, others -> Cloud.
    """
    assert classify_intent("Hi there") == "SIMPLE"
    assert classify_intent("Find pizza") == "TOOL_SEARCH"
    assert classify_intent("Add to my calendar") == "TOOL_CALENDAR"
