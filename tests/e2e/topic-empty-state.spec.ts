import { expect, test } from '@playwright/test'
import { launchTestApp } from './support/electron'

test('topic empty-state artwork stays at its intended size', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  try {
    const artwork = fixture.page
      .getByRole('region', { name: '话题首页' })
      .locator('.topics-state-container .state-doodle')
    await expect(artwork).toBeVisible()

    const bounds = await artwork.boundingBox()
    expect(bounds).not.toBeNull()
    expect(Math.abs(bounds!.width - 80)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds!.height - 64)).toBeLessThanOrEqual(1)
  } finally {
    await fixture.close()
  }
})
