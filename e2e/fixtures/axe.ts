import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

type AxeFixtures = {
  /** Runs axe (WCAG 2.1 A/AA) on the current page and fails on any violation. */
  expectNoA11yViolations: () => Promise<void>;
};

/*
 * Firefox: running axe in the live app crashes the Firefox content process ("Page crashed")
 * on several pages (rules aria-allowed-attr, aria-conditional-attr, aria-prohibited-attr,
 * label-content-name-mismatch, nested-interactive). It does not reproduce with the same
 * HTML + CSS copied into a static page, so it looks like a Firefox bug, not an a11y defect.
 * Until that is resolved the axe check is skipped on Firefox only — the specs themselves still
 * run there, and chromium + webkit keep the full WCAG check. Tracked as an open follow-up.
 */
const AXE_SKIPPED_BROWSERS = new Set(["firefox"]);

export const test = base.extend<AxeFixtures>({
  expectNoA11yViolations: async ({ page, browserName }, use, testInfo) => {
    await use(async () => {
      if (AXE_SKIPPED_BROWSERS.has(browserName)) {
        if (!testInfo.annotations.some((a) => a.type === "axe-skipped")) {
          testInfo.annotations.push({
            type: "axe-skipped",
            description: `axe crashes the ${browserName} content process; checked in chromium/webkit`,
          });
        }
        return;
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  },
});

export { expect };
