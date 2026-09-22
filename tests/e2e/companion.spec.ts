import { expect, test, type Page } from '@playwright/test'
import { launchTestApp } from './support/electron'

async function gaze(page: Page): Promise<number[]> {
  return page.locator('.app-companion-dock canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl')!
    const program = gl.getParameter(gl.CURRENT_PROGRAM)
    return Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'gaze')))
  })
}

test('approved companion follows across all pages, small windows, collapse and fallback', async () => {
  const fixture = await launchTestApp({ initialPage: 'topics' })
  const { page } = fixture
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const dock = page.locator('.app-companion-dock')
    await expect(dock).toHaveAttribute('data-state', 'ready')
    await expect(dock).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const alpha = await dock.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl')!
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const corner = new Uint8Array(4)
      const character = new Uint8Array(4)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner)
      gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, character)
      return [corner[3], character[3]]
    })
    expect(alpha).toEqual([0, 255])
    const originalCanvas = await dock.locator('canvas').elementHandle()
    for (const label of ['问问 AI', '日报', 'Clawbot', '导出', '设置', '话题整理']) {
      await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click()
      await expect(dock).toBeVisible()
      expect(await originalCanvas!.evaluate((canvas) => canvas.isConnected)).toBe(true)
    }
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const { width, height } = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight
    }))
    for (const [name, x, y] of [
      ['left', 0.05, 0.5],
      ['right', 0.95, 0.5],
      ['up', 0.5, 0.05],
      ['down', 0.5, 0.95]
    ] as const) {
      await page.mouse.move(width * x, height * y)
      await expect
        .poll(async () => (await gaze(page))[x === 0.5 ? 1 : 0])
        .toBeCloseTo((x === 0.5 ? y : x) * 2 - 1, 1)
      await dock.screenshot({ path: `test-results/companion-${name}.png` })
    }
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect.poll(async () => (await gaze(page))[1]).toBeCloseTo(0, 2)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.mouse.move(width * 0.9, height * 0.9)
    expect(await gaze(page)).toEqual([0, 0])
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (const [width, height] of [
      [1440, 900],
      [1073, 668],
      [700, 600]
    ]) {
      await fixture.setWindowContentSize({ width, height })
      await expect(dock).toBeInViewport({ ratio: 1 })
      const bounds = await dock.boundingBox()
      const account = await page.locator('.app-rail-account').boundingBox()
      expect(bounds!.y).toBeGreaterThanOrEqual(account!.y + account!.height)
      await page.screenshot({ path: `test-results/companion-app-${width}.png`, scale: 'css' })
    }
    await page.getByRole('button', { name: '收起伙伴' }).click()
    await expect(dock).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: '显示伙伴' })).toBeVisible()
    await expect(dock).toHaveCount(0)
    await page.getByRole('button', { name: '显示伙伴' }).click()
    await expect(dock).toHaveAttribute('data-state', 'ready')
    const contextControl = await dock
      .locator('canvas')
      .evaluateHandle(
        (canvas: HTMLCanvasElement) =>
          canvas.getContext('webgl')!.getExtension('WEBGL_lose_context')!
      )
    await contextControl.evaluate((control) => control.loseContext())
    await expect(dock).toHaveAttribute('data-state', 'fallback')
    await expect(dock.locator('img')).toBeVisible()
    await expect(dock.locator('canvas')).toHaveCSS('opacity', '0')
    await contextControl.evaluate((control) => control.restoreContext())
    await expect(dock).toHaveAttribute('data-state', 'ready')
    await contextControl.dispose()
    expect(errors).toEqual([])
  } finally {
    await fixture.close()
  }
})
