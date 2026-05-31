import { test, expect } from '@playwright/test';

test('landing page renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
});

test('unauthenticated access to a protected route redirects to login', async ({ page }) => {
	await page.goto('/dashboard');
	await expect(page).toHaveURL(/\/login$/);
});

test('login page shows the form', async ({ page }) => {
	await page.goto('/login');
	await expect(page.locator('input[name="email"]')).toBeVisible();
	await expect(page.locator('input[name="password"]')).toBeVisible();
});
