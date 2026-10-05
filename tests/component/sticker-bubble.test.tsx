import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RichMessageBubble } from '../../src/renderer/src/components/RichMessageBubble'

const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const getSticker = vi.fn()

describe('encrypted StickerBubble', () => {
  beforeEach(() => {
    getSticker.mockReset()
    window.api = { getSticker } as unknown as typeof window.api
  })

  it('loads stickers whose only available identity is an encrypted URL', async () => {
    getSticker.mockResolvedValue({ success: true, data: gif })
    render(
      <RichMessageBubble
        contentData={{
          type: 'sticker',
          encryptUrl: 'https://synthetic.test/encrypted-only',
          aeskey: 'synthetic-key'
        }}
      />
    )

    expect(await screen.findByRole('img')).toHaveAttribute('src', gif)
    expect(getSticker).toHaveBeenCalledWith(
      '',
      undefined,
      'synthetic-key',
      'https://synthetic.test/encrypted-only'
    )
  })

  it('passes the ordinary URL, MD5, AES key and encrypted fallback together', async () => {
    getSticker.mockResolvedValue({ success: true, data: gif })
    render(
      <RichMessageBubble
        contentData={{
          type: 'sticker',
          md5: 'encrypted-sticker-fixture',
          url: 'https://synthetic.test/plain',
          thumbUrl: 'https://synthetic.test/thumb',
          aeskey: 'synthetic-key',
          encryptUrl: 'https://synthetic.test/encrypted'
        }}
      />
    )

    expect(await screen.findByRole('img')).toHaveAttribute('src', gif)
    expect(getSticker).toHaveBeenCalledWith(
      'https://synthetic.test/plain',
      'encrypted-sticker-fixture',
      'synthetic-key',
      'https://synthetic.test/encrypted'
    )
  })

  it('retries after an AES key becomes available instead of retaining the earlier failure', async () => {
    const contentData = {
      type: 'sticker' as const,
      md5: 'sticker-key-arrival-fixture',
      encryptUrl: 'https://synthetic.test/key-arrival'
    }
    getSticker.mockResolvedValueOnce({ success: false, error: 'Synthetic AES failure' })
    const { rerender } = render(<RichMessageBubble contentData={contentData} />)
    expect(await screen.findByText('Synthetic AES failure')).toBeVisible()

    getSticker.mockResolvedValueOnce({ success: true, data: gif })
    rerender(<RichMessageBubble contentData={{ ...contentData, aeskey: 'synthetic-key' }} />)
    expect(await screen.findByRole('img')).toHaveAttribute('src', gif)
    expect(getSticker).toHaveBeenLastCalledWith(
      '',
      'sticker-key-arrival-fixture',
      'synthetic-key',
      'https://synthetic.test/key-arrival'
    )
  })

  it('ignores a late response from the preceding sticker when the bubble is reused', async () => {
    let resolvePrevious!: (result: { success: boolean; data: string }) => void
    getSticker.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePrevious = resolve
        })
    )
    const { rerender } = render(
      <RichMessageBubble
        contentData={{ type: 'sticker', encryptUrl: 'https://synthetic.test/previous' }}
      />
    )
    await waitFor(() => expect(getSticker).toHaveBeenCalledOnce())

    const nextImage = 'data:image/png;base64,iVBORw0KGgo='
    getSticker.mockResolvedValueOnce({ success: true, data: nextImage })
    rerender(
      <RichMessageBubble
        contentData={{ type: 'sticker', encryptUrl: 'https://synthetic.test/next' }}
      />
    )
    expect(await screen.findByRole('img')).toHaveAttribute('src', nextImage)
    resolvePrevious({ success: true, data: gif })
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', nextImage))
  })
})
