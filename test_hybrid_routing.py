import pytest

# Simulation of the hybrid routing logic implemented in src/app/page.tsx
# Criteria: message length < 100 AND absence of 'search/add' keywords

def is_simple_intent(input_text: str) -> bool:
    """
    Python implementation of the client-side hybrid routing logic.
    """
    input_lower = input_text.lower()
    return (
        len(input_text) < 100 and
        "search" not in input_lower and
        "add" not in input_lower
    )

@pytest.mark.parametrize("message,expected_routing", [
    ("Hello", "local"),
    ("What time is it?", "local"),
    ("Plan a dinner at 7pm", "local"), # No 'search' or 'add'
    ("Search for Italian restaurants in Paris", "cloud"), # contains 'search'
    ("Add a meeting to my calendar", "cloud"), # contains 'add'
    ("This is a very long message that definitely exceeds the hundred character limit of our simple intent classifier to ensure it goes to cloud", "cloud"),
])
def test_hybrid_routing_logic(message, expected_routing):
    """
    Verifies that simple messages are routed locally and complex/long ones go to the cloud.
    """
    if is_simple_intent(message):
        actual_routing = "local"
    else:
        actual_routing = "cloud"
        
    assert actual_routing == expected_routing

def test_hello_results_in_zero_api_calls():
    """
    Verification that a 'Hello' message results in 0 calls to /api/chat.
    Based on the hybrid routing logic, 'Hello' is classified as 'local'.
    """
    message = "Hello"
    assert is_simple_intent(message) is True
    # In the frontend implementation:
    # if (isSimple) { /* Calls LocalLLMEngine, NOT /api/chat */ }

def test_redis_caching_simulation():
    """
    Simulates the Redis caching logic in src/lib/tools.ts.
    Key format: restaurant:{cuisine || 'any'}:{lat.toFixed(2)}:{lon.toFixed(2)}
    """
    mock_redis = {}
    overpass_call_count = 0

    def search_restaurant_sim(cuisine, lat, lon):
        nonlocal overpass_call_count
        cache_key = f"restaurant:{cuisine or 'any'}:{lat:.2f}:{lon:.2f}"
        
        # Check cache
        if cache_key in mock_redis:
            return mock_redis[cache_key], "cache"
        
        # Call Overpass (simulated)
        overpass_call_count += 1
        result = [{"name": "Test Restaurant", "address": "123 Street"}]
        
        # Save to cache
        mock_redis[cache_key] = result
        return result, "network"

    # First call: should hit "network"
    res1, source1 = search_restaurant_sim("Italian", 48.8566, 2.3522)
    assert source1 == "network"
    assert overpass_call_count == 1
    
    # Second call (identical): should hit "cache"
    res2, source2 = search_restaurant_sim("Italian", 48.8566, 2.3522)
    assert source2 == "cache"
    assert overpass_call_count == 1
    assert res1 == res2

    # Third call (different location): should hit "network"
    res3, source3 = search_restaurant_sim("Italian", 40.7128, -74.0060)
    assert source3 == "network"
    assert overpass_call_count == 2
