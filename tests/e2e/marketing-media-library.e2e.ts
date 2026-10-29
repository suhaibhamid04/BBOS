import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

function mp4Box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function syntheticMp4(): Buffer {
  const ftyp = mp4Box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isom')]));
  const mvhd = Buffer.alloc(40); mvhd.writeUInt32BE(1_000, 12); mvhd.writeUInt32BE(3_000, 16);
  const tkhd = Buffer.alloc(40); tkhd.writeUInt32BE(640 * 65_536, 32); tkhd.writeUInt32BE(360 * 65_536, 36);
  return Buffer.concat([ftyp, mp4Box('moov', Buffer.concat([mp4Box('mvhd', mvhd), mp4Box('trak', mp4Box('tkhd', tkhd))])), mp4Box('mdat', Buffer.alloc(2_048, 5))]);
}

async function switchPersona(page: import('@playwright/test').Page, employeeId: string) {
  await page.locator('#header-role-switcher-trigger').click();
  await page.locator(`#persona-option-${employeeId}`).click();
}

test('Marketing uploads, resumes, previews, tags and submits rights for Founder review', async ({ page, request }) => {
  test.setTimeout(120_000);
  const photo = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#7056ee' } }).png().toBuffer();
  const video = syntheticMp4();
  const noisy = await sharp(randomBytes(2_048 * 2_048 * 3), { raw: { width: 2_048, height: 2_048, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();

  await page.route('**/upload-sessions/*/chunks', async route => {
    await new Promise(resolve => setTimeout(resolve, 35));
    await route.continue();
  });
  await page.goto('/');
  await switchPersona(page, 'emp-mkt-01');
  await page.getByRole('button', { name: 'Media Library' }).click();
  await expect(page.getByTestId('media-library')).toBeVisible();

  const input = page.getByTestId('media-file-input');
  await input.setInputFiles({ name: 'synthetic-photo.png', mimeType: 'image/png', buffer: photo });
  const photoUpload = page.getByTestId('upload-item').filter({ hasText: 'synthetic-photo.png' });
  await expect(photoUpload.getByText('complete', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('synthetic-photo.png', { exact: true }).last()).toBeVisible();
  await page.getByText('synthetic-photo.png', { exact: true }).last().click();
  await expect(page.getByAltText('Preview of synthetic-photo.png')).toBeVisible();
  await page.getByPlaceholder('kashmir, winter, hotel').fill('kashmir, synthetic, winter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByPlaceholder('Search filename, tag, contributor or rights status').fill('winter');
  await expect(page.getByText('synthetic-photo.png', { exact: true }).last()).toBeVisible();
  await page.getByPlaceholder('Search filename, tag, contributor or rights status').fill('');

  await input.setInputFiles({ name: 'resume-photo.png', mimeType: 'image/png', buffer: noisy });
  const pause = page.getByRole('button', { name: 'Pause resume-photo.png' });
  await expect(pause).toBeVisible({ timeout: 10_000 });
  await pause.click();
  const resumeUpload = page.getByTestId('upload-item').filter({ hasText: 'resume-photo.png' });
  await expect(resumeUpload.getByText('paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume resume-photo.png' }).click();
  await expect(resumeUpload.getByText('complete', { exact: true })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText('resume-photo.png', { exact: true }).last()).toBeVisible({ timeout: 40_000 });

  await input.setInputFiles({ name: 'synthetic-video.mp4', mimeType: 'video/mp4', buffer: video });
  const videoUpload = page.getByTestId('upload-item').filter({ hasText: 'synthetic-video.mp4' });
  await expect(videoUpload.getByText('complete', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('synthetic-video.mp4', { exact: true }).last()).toBeVisible({ timeout: 30_000 });
  const libraryResponse = await request.get('/api/marketing/media/library', { headers: { 'X-Demo-User-Id': 'emp-mkt-01' } });
  expect(libraryResponse.ok()).toBeTruthy();
  const library = (await libraryResponse.json()).data as Array<{ asset: { id: string; displayFilename: string } }>;
  const videoAsset = library.find(item => item.asset.displayFilename === 'synthetic-video.mp4');
  expect(videoAsset).toBeTruthy();
  const previewResponse = await request.post(`/api/marketing/media/assets/${videoAsset!.asset.id}/preview`, {
    headers: { 'X-Demo-User-Id': 'emp-mkt-01', 'Content-Type': 'image/png' }, data: photo,
  });
  expect(previewResponse.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Refresh media' }).click();
  await page.getByText('synthetic-video.mp4', { exact: true }).last().click();
  await expect(page.getByAltText('Preview of synthetic-video.mp4')).toBeVisible();
  if (process.env.BBOS_CAPTURE_M1B_SCREENSHOTS === 'true') {
    await page.screenshot({ path: 'docs/marketing/screenshots/m1b-media-library.png', fullPage: true });
  }

  await page.getByText('synthetic-photo.png', { exact: true }).last().click();
  await page.getByPlaceholder('Source owner or contributor').fill('Booking Bridge synthetic fixture');
  await page.getByPlaceholder('Evidence reference (agreement/consent ID)').fill('SYNTHETIC-CONSENT-001');
  await page.getByLabel('Evidence explicitly permits commercial advertising').check();
  await page.getByRole('button', { name: 'Submit exact rights version for review' }).click();
  await expect(page.getByText('SUBMITTED', { exact: true }).last()).toBeVisible();

  const denied = await request.get('/api/marketing/media/library', { headers: { 'X-Demo-User-Id': 'emp-sales-01' } });
  expect(denied.status()).toBe(403);

  await switchPersona(page, 'emp-founder-01');
  await page.getByText('synthetic-photo.png', { exact: true }).last().click();
  await page.getByPlaceholder('Required decision reason').fill('Synthetic consent evidence and commercial scope verified.');
  await page.getByRole('button', { name: 'Verify rights' }).click();
  await expect(page.getByText('VERIFIED', { exact: true }).last()).toBeVisible();
  if (process.env.BBOS_CAPTURE_M1B_SCREENSHOTS === 'true') {
    await page.screenshot({ path: 'docs/marketing/screenshots/m1b-rights-review.png', fullPage: true });
  }

  await input.setInputFiles({ name: 'hostile.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') });
  const hostileUpload = page.getByTestId('upload-item').filter({ hasText: 'hostile.jpg' });
  await expect(hostileUpload).toHaveAttribute('data-status', 'FAILED', { timeout: 30_000 });
  await expect(page.getByText('REJECTED', { exact: true }).last()).toBeVisible();
});
