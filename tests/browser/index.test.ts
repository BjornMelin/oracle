import { describe, expect, test } from "vitest";
import { shouldPreserveBrowserOnErrorForTest } from "../../src/browser/index.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";

describe("shouldPreserveBrowserOnErrorForTest", () => {
  test("preserves the browser for headful cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false, false)).toBe(true);
  });

  test("does not preserve the browser for headless cloudflare challenge errors", () => {
    const error = new BrowserAutomationError("Cloudflare challenge detected.", {
      stage: "cloudflare-challenge",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, true, false)).toBe(false);
  });

  test("preserves the browser for manual-login auth errors", () => {
    const error = new BrowserAutomationError("ChatGPT session not detected.", {
      stage: "login-required",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false, true)).toBe(true);
  });

  test("does not preserve the browser for non-manual auth errors", () => {
    const error = new BrowserAutomationError("ChatGPT session not detected.", {
      stage: "login-required",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false, false)).toBe(false);
  });

  test("does not preserve the browser for unrelated browser errors", () => {
    const error = new BrowserAutomationError("other browser error", {
      stage: "execute-browser",
    });
    expect(shouldPreserveBrowserOnErrorForTest(error, false, false)).toBe(false);
  });
});
