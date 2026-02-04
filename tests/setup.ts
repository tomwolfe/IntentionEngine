import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Geolocation
const mockGeolocation = {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
};

global.navigator.geolocation = mockGeolocation as any;
