/**
 * Visual Test for ResearchHistory Component
 *
 * This file demonstrates the component in action with mock data.
 * To run this test with visual inspection:
 *
 * 1. Start the dev server: npm start
 * 2. Run Playwright tests: npx playwright test
 * 3. View the test report: npx playwright show-report
 */

import { test, expect } from '@playwright/test';

test.describe('ResearchHistory Component Visual Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to a page that includes the ResearchHistory component
    // Note: This assumes the component is integrated into a route
    await page.goto('http://localhost:4200');
  });

  test('should display empty state correctly', async ({ page }) => {
    // Wait for the component to load
    await page.waitForSelector('.research-history');

    // Check for empty state
    const emptyState = page.locator('.research-history__empty');
    await expect(emptyState).toBeVisible();

    // Verify empty state text
    await expect(emptyState).toContainText('No research history yet');

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'test-results/research-history-empty.png',
      fullPage: true
    });
  });

  test('should display history items correctly', async ({ page }) => {
    // Assuming there is data loaded, check for history items
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      // Verify first item structure
      const firstItem = historyItems.first();

      // Check for query heading
      await expect(firstItem.locator('.history-item__query')).toBeVisible();

      // Check for timestamp
      await expect(firstItem.locator('.meta-timestamp')).toBeVisible();

      // Check for "View details" link
      await expect(firstItem.locator('.meta-link')).toBeVisible();

      // Take screenshot
      await page.screenshot({
        path: 'test-results/research-history-with-items.png',
        fullPage: true
      });
    }
  });

  test('should expand and collapse items', async ({ page }) => {
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      const firstItem = historyItems.first();
      const toggleButton = firstItem.locator('.history-item__toggle');

      // Initially should not be expanded
      await expect(firstItem).not.toHaveClass(/history-item--expanded/);

      // Click to expand
      await toggleButton.click();

      // Should now be expanded
      await expect(firstItem).toHaveClass(/history-item--expanded/);

      // Verify chevron changed
      const chevron = firstItem.locator('.toggle-icon');
      await expect(chevron).toContainText('▼');

      // Take screenshot of expanded state
      await page.screenshot({
        path: 'test-results/research-history-expanded.png',
        fullPage: true
      });

      // Click to collapse
      await toggleButton.click();

      // Should be collapsed again
      await expect(firstItem).not.toHaveClass(/history-item--expanded/);

      // Verify chevron changed back
      await expect(chevron).toContainText('▶');
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      const firstItem = historyItems.first();
      const toggleButton = firstItem.locator('.history-item__toggle');

      // Focus the toggle button
      await toggleButton.focus();

      // Verify it has focus
      await expect(toggleButton).toBeFocused();

      // Press Enter to expand
      await page.keyboard.press('Enter');

      // Should be expanded
      await expect(firstItem).toHaveClass(/history-item--expanded/);

      // Press Space to collapse (need to focus again)
      await toggleButton.focus();
      await page.keyboard.press('Space');

      // Should be collapsed
      await expect(firstItem).not.toHaveClass(/history-item--expanded/);
    }
  });

  test('should display error states correctly', async ({ page }) => {
    // Check for items with error status
    const errorItems = page.locator('.meta-status--error');
    const count = await errorItems.count();

    if (count > 0) {
      // Verify error indicator is visible
      await expect(errorItems.first()).toBeVisible();

      // Verify error text
      await expect(errorItems.first()).toContainText('Failed');

      // Take screenshot
      await page.screenshot({
        path: 'test-results/research-history-with-errors.png',
        fullPage: true
      });
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for component to load
    await page.waitForSelector('.research-history');

    // Take screenshot
    await page.screenshot({
      path: 'test-results/research-history-mobile.png',
      fullPage: true
    });

    // Verify component is still functional
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      // Verify items are still clickable
      const firstItem = historyItems.first();
      const toggleButton = firstItem.locator('.history-item__toggle');
      await toggleButton.click();
      await expect(firstItem).toHaveClass(/history-item--expanded/);
    }
  });

  test('should have proper accessibility attributes', async ({ page }) => {
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      const firstItem = historyItems.first();
      const toggleButton = firstItem.locator('.history-item__toggle');

      // Check ARIA attributes
      await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
      await expect(toggleButton).toHaveAttribute('aria-controls');
      await expect(toggleButton).toHaveAttribute('aria-label');

      // Expand and check updated ARIA
      await toggleButton.click();
      await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('should navigate to details page when link clicked', async ({ page }) => {
    const historyItems = page.locator('.history-item');
    const count = await historyItems.count();

    if (count > 0) {
      const firstItem = historyItems.first();
      const detailsLink = firstItem.locator('.meta-link');

      // Click the "View details" link
      await detailsLink.click();

      // Should navigate to logs page with logId parameter
      await page.waitForURL(/\/logs\?logId=/);

      // Verify URL contains logId
      const url = page.url();
      expect(url).toContain('logs');
      expect(url).toContain('logId=');
    }
  });
});

/**
 * Integration Note:
 *
 * This visual test assumes the ResearchHistory component is integrated
 * into the application. To use this component in your app:
 *
 * 1. Import it into your feature component:
 *    import { ResearchHistoryComponent } from './components/research-history/research-history.component';
 *
 * 2. Add it to your template:
 *    <app-research-history [maxItems]="20" />
 *
 * 3. Ensure LogsService is available (it's provided in root, so no extra setup needed)
 *
 * The component will automatically:
 * - Load sessions from LogsService
 * - Display them in a chat-like interface
 * - Handle empty, loading, and error states
 * - Provide navigation to detailed logs
 */
