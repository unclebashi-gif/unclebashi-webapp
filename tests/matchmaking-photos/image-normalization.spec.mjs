import { expect, test } from '@playwright/test';

test('photo image normalization outputs bounded WebP and rejects unsupported input', async ({ page }) => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
  const response = await page.goto(baseUrl);
  expect(response && response.status() < 500, 'The local Vite app must be available for browser utility tests.').toBeTruthy();
  const result = await page.evaluate(async () => {
    const module = await import('/src/lib/matchmakingPhotoImage.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 1000;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create PNG fixture.');
    const normalized = await module.normalizeMatchmakingPhoto(new File([blob], 'input.png', { type: 'image/png' }));
    const decoded = await createImageBitmap(normalized);
    const maxEdge = Math.max(decoded.width, decoded.height);
    decoded.close();
    let rejectsHeic = false;
    try { await module.normalizeMatchmakingPhoto(new File(['x'], 'input.heic', { type: 'image/heic' })); }
    catch { rejectsHeic = true; }
    return { type: normalized.type, size: normalized.size, maxEdge, rejectsHeic };
  });
  expect(result.type).toBe('image/webp');
  expect(result.size).toBeLessThanOrEqual(3 * 1024 * 1024);
  expect(result.maxEdge).toBeLessThanOrEqual(1600);
  expect(result.rejectsHeic).toBeTruthy();
});
