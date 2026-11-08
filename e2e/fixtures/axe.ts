import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "@playwright/test";

type AxeFixtures = {
  /** Runs axe (WCAG 2.1 A/AA) on the current page and fails on any violation. */
  expectNoA11yViolations: () => Promise<void>;
};

export const test = base.extend<AxeFixtures>({
  expectNoA11yViolations: async ({ page }, use) => {
    await use(async () => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  },
});

export { expect };
