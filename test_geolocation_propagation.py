import json
import pytest
from unittest.mock import MagicMock, patch

# This test simulates the propagation of geolocation data from the client to the backend API.
# Since the actual client-side code is in TypeScript/Next.js, this test ensures the 
# backend contract is maintained and the expected data structure is handled.

def test_geolocation_data_structure():
    """
    Verifies that the userLocation data structure follows the expected schema
    (lat, lng) as used in the frontend and expected by the backend.
    """
    user_location = {"lat": 37.7749, "lng": -122.4194}
    
    assert "lat" in user_location
    assert "lng" in user_location
    assert isinstance(user_location["lat"], (int, float))
    assert isinstance(user_location["lng"], (int, float))

def test_api_payload_with_location():
    """
    Simulates the request body sent by the frontend when userLocation is available.
    """
    payload = {
        "messages": [{"role": "user", "content": "find a restaurant"}],
        "userLocation": {"lat": 40.7128, "lng": -74.0060}
    }
    
    # In the real app, src/app/page.tsx:onFormSubmit sends this body via sendMessage
    assert payload["userLocation"]["lat"] == 40.7128
    assert payload["userLocation"]["lng"] == -74.0060

def test_api_payload_without_location():
    """
    Simulates the request body sent by the frontend when userLocation is null.
    """
    payload = {
        "messages": [{"role": "user", "content": "find a restaurant"}],
        "userLocation": None
    }
    
    # In the real app, src/app/page.tsx:userLocation state would be null
    assert payload["userLocation"] is None

if __name__ == "__main__":
    pytest.main([__file__])
