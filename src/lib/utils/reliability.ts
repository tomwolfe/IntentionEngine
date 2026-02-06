export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  backoff = 1000,
  timeoutMs = 10000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('Request Timeout')));
          })
        ]);
        clearTimeout(timeoutId);
        return result as T;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error: any) {
      lastError = error;
      const isTimeout = error.message === 'Request Timeout';
      const isRetryable = isTimeout || (error.status >= 500) || (error.status === 429) || !error.status;
      
      if (!isRetryable || attempt === retries - 1) {
        throw error;
      }
      
      const delay = backoff * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
