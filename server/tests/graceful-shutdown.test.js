import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gracefulShutdown } from '../index.js';

describe('Graceful Shutdown Testleri', () => {
  let originalExit;

  beforeEach(() => {
    originalExit = process.exit;
    // process.exit spy
    process.exit = vi.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it('uncaughtException veya unhandledRejection tetiklendiğinde gracefulShutdown süreci kapatıp exit(1) çağırmalıdır', async () => {
    const error = new Error('Test Critical Crash Error');
    
    // Spied gracefulShutdown trigger
    gracefulShutdown(error, 'test-uncaughtException');

    // Fast-forward timers for the 500ms grace period
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
