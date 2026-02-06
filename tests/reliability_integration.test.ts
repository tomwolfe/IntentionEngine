import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, withCircuitBreaker, toolBreakers } from '../src/lib/utils/reliability';

describe('Reliability Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear breakers
    for (const key in toolBreakers) {
      delete toolBreakers[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should retry on timeout and eventually fail if all attempts time out', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      // Simulate a long-running task that will be timed out by withRetry's internal timeout
      await new Promise(resolve => setTimeout(resolve, 5000));
      return 'success';
    });

    // We set timeoutMs to 1000, so each call to fn will time out
    const promise = withRetry(fn, 3, 100, 1000);

    // Initial call
    await vi.advanceTimersByTimeAsync(1001); // Trigger first timeout
    
    // Wait for first retry delay (100ms)
    await vi.advanceTimersByTimeAsync(100);
    // Second call starts, wait for it to timeout
    await vi.advanceTimersByTimeAsync(1001);

    // Wait for second retry delay (200ms)
    await vi.advanceTimersByTimeAsync(200);
    // Third call starts, wait for it to timeout
    await vi.advanceTimersByTimeAsync(1001);

    await expect(promise).rejects.toThrow('Request Timeout');
    expect(attempts).toBe(3);
  });

  it('should open the circuit breaker after 3 consecutive failures', async () => {
    const serviceName = 'test-service';
    let callCount = 0;
    const failingFn = async () => {
      callCount++;
      throw new Error('Service Failure');
    };

    // 1st failure
    await expect(withCircuitBreaker(serviceName, failingFn)).rejects.toThrow('Service Failure');
    expect(toolBreakers[serviceName].getState()).toBe('CLOSED');

    // 2nd failure
    await expect(withCircuitBreaker(serviceName, failingFn)).rejects.toThrow('Service Failure');
    expect(toolBreakers[serviceName].getState()).toBe('CLOSED');

    // 3rd failure
    await expect(withCircuitBreaker(serviceName, failingFn)).rejects.toThrow('Service Failure');
    
    // Now it should be OPEN
    expect(toolBreakers[serviceName].getState()).toBe('OPEN');
    expect(callCount).toBe(3);

    // 4th call should not even call the function
    await expect(withCircuitBreaker(serviceName, failingFn)).rejects.toThrow(`Circuit breaker for ${serviceName} is OPEN`);
    expect(callCount).toBe(3);
  });

  it('should transition to HALF-OPEN and then CLOSED on success', async () => {
    const serviceName = 'test-service-reset';
    const failingFn = async () => { throw new Error('Fail'); };
    const successFn = async () => 'success';

    // Trip it
    for(let i=0; i<3; i++) {
      await expect(withCircuitBreaker(serviceName, failingFn)).rejects.toThrow();
    }
    expect(toolBreakers[serviceName].getState()).toBe('OPEN');

    // Advance time past timeout (default 30s)
    await vi.advanceTimersByTimeAsync(30001);

    // Next call should be allowed (HALF-OPEN internally in check())
    const result = await withCircuitBreaker(serviceName, successFn);
    expect(result).toBe('success');
    expect(toolBreakers[serviceName].getState()).toBe('CLOSED');
  });
});
