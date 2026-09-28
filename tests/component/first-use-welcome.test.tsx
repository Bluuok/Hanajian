import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FirstUseWelcome } from '../../src/renderer/src/components/FirstUseWelcome'

describe('FirstUseWelcome', () => {
  it('closes with Escape or the overlay and restores focus to the opener', async () => {
    const user = userEvent.setup()

    function Harness(): React.ReactElement {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            打开新手引导
          </button>
          {open && (
            <FirstUseWelcome
              onDismiss={() => setOpen(false)}
              onOpenReport={vi.fn()}
              onOpenAISettings={vi.fn()}
            />
          )}
        </>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: '打开新手引导' })
    await user.click(opener)
    expect(screen.getByRole('dialog', { name: '开始探索你的微信' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '开始探索你的微信' })).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())

    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: '开始探索你的微信' })
    await user.click(dialog.previousElementSibling as HTMLElement)
    expect(screen.queryByRole('dialog', { name: '开始探索你的微信' })).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('keeps the feature callbacks and guide link intact', async () => {
    const user = userEvent.setup()
    const onOpenReport = vi.fn()
    const onOpenAISettings = vi.fn()
    render(
      <FirstUseWelcome
        onDismiss={vi.fn()}
        onOpenReport={onOpenReport}
        onOpenAISettings={onOpenAISettings}
      />
    )

    await user.click(screen.getByRole('button', { name: /试试 AI 群聊日报/ }))
    expect(onOpenReport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '问问你的微信' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '配置 AI 模型' }))
    expect(onOpenAISettings).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: '查看完整使用教程' })).toHaveAttribute(
      'href',
      'https://github.com/gmll-star/TraceDigest/blob/main/docs/user-guide/getting-started.md'
    )
  })
})
