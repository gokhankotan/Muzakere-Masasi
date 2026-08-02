/**
 * server/tests/setup.js
 *
 * Vitest Global Setup File for Müzakere Masası Test Suite.
 *
 * 1. Mocks OpenAI client to intercept any network requests to external LLM endpoints.
 * 2. Forces LLM_DRY_RUN = 'true' by default during test execution so rule-based fallbacks
 *    and mocked responses operate deterministically with ZERO network overhead & 0 API quota usage.
 */

import { vi, beforeEach } from 'vitest';

// Force LLM_DRY_RUN mode by default for tests to prevent quota usage & network latency
process.env.LLM_DRY_RUN = 'true';

// Mock OpenAI module globally across all test files
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      constructor(config = {}) {
        this.apiKey = config.apiKey || 'mock-api-key';
        this.baseURL = config.baseURL || 'https://mock.api';
        this.chat = {
          completions: {
            create: vi.fn().mockImplementation(async (params) => {
              // Simulated fast LLM completion response for tests
              return {
                id: 'mock-chatcmpl-test-123',
                object: 'chat.completion',
                created: Date.now(),
                model: params.model || 'gemini-2.5-flash-lite',
                choices: [
                  {
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: JSON.stringify({
                        consensus: "Katılımcılar toplu taşıma ve sürdürülebilirlik konularında yüksek oranda uzlaşmıştır.",
                        summary: "Grup genelinde ortak fikir birliği sağlanmıştır."
                      })
                    },
                    finish_reason: 'stop'
                  }
                ]
              };
            })
          }
        };
      }
    }
  };
});
