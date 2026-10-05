import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlatformIntegrationWorkspace } from '../../src/renderer/src/features/platform-integration/PlatformIntegrationWorkspace'
import type { PlatformMarkdownResult, PlatformParseResult, PlatformSaveResult } from '../../src/shared/platform-integration'

const share = '复制打开抖音，看看【浮寻的图文作品】 https://v.douyin.com/sgh2j_pBwbI/ M@J.VY'
const result: PlatformParseResult = {
  success: true,
  resultId: 'preview-token',
  work: {
    platform: 'douyin',
    id: '7686472347373484971',
    kind: 'images',
    author: '浮寻',
    title: '出行讨论',
    sourceUrl: 'https://www.douyin.com/note/7686472347373484971',
    resolvedBy: 'browser',
    warnings: [],
    assets: [
      {
        id: 'image-1',
        kind: 'image',
        urls: [],
        sourceField: 'images.url_list',
        watermark: 'unknown',
        watermarkEvidence: '平台未明确标注水印状态',
        previewUrl: 'tracedigest-platform://media/preview-token/image-1'
      }
    ]
  }
}

function installApi(
  parsed: PlatformParseResult = result
): Record<string, ReturnType<typeof vi.fn>> {
  const api = {
    getPlatformMarkdownDirectory: vi
      .fn()
      .mockResolvedValue({ success: true, directory: 'D:\\notes' }),
    selectPlatformMarkdownDirectory: vi
      .fn()
      .mockResolvedValue({ success: true, directory: 'D:\\new-notes' }),
    writePlatformMarkdown: vi.fn().mockResolvedValue({ success: true, file: 'D:\\notes\\work.md' }),
    getPlatformSaveDirectory: vi
      .fn()
      .mockResolvedValue({ success: true, directory: 'D:\\downloads' }),
    selectPlatformSaveDirectory: vi
      .fn()
      .mockResolvedValue({ success: true, directory: 'D:\\new-downloads' }),
    parsePlatformShare: vi.fn().mockResolvedValue(parsed),
    savePlatformMedia: vi
      .fn()
      .mockResolvedValue({ success: true, files: ['D:\\downloads\\work.webp'] })
  }
  Object.defineProperty(window, 'api', { configurable: true, value: api })
  return api
}

async function parse(): Promise<void> {
  fireEvent.change(screen.getByLabelText('分享文案或链接'), { target: { value: share } })
  fireEvent.click(screen.getByRole('button', { name: '解析与预览' }))
  await screen.findByRole('button', { name: '保存全部图片' })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const replacementResult: PlatformParseResult = {
  ...result,
  resultId: 'replacement-preview',
  work: { ...result.work!, title: '后来解析的作品' }
}

describe('platform integration workspace', () => {
  it('keeps share instructions short while listing supported platforms separately', () => {
    installApi()
    render(<PlatformIntegrationWorkspace />)
    expect(screen.getByPlaceholderText('粘贴完整分享文案或作品链接')).toBeInTheDocument()
    expect(screen.getByText('整段粘贴即可。')).toBeInTheDocument()
    expect(screen.getByText('目前支持：抖音、小红书')).toBeInTheDocument()
    expect(screen.queryByText(/自动提取作品链接/)).not.toBeInTheDocument()
  })

  it('makes media and MD reuse explicit without claiming a new file was created', async () => {
    const api = installApi()
    api.savePlatformMedia.mockResolvedValue({
      success: true,
      files: ['D:\\downloads\\work.webp'],
      reusedFiles: ['D:\\downloads\\work.webp']
    } as never)
    api.writePlatformMarkdown.mockResolvedValue({
      success: true,
      file: 'D:\\notes\\work.md',
      reused: true
    } as never)
    render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('其中 1 个文件已存在，已复用，没有重复下载。')
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    await screen.findByText('MD 已存在，已复用')
    expect(screen.queryByText('MD 已写入')).not.toBeInTheDocument()
  })

  it('uses the same controls for Xiaohongshu and writes MD only after explicit save and write', async () => {
    const api = installApi({
      ...result,
      work: { ...result.work!, platform: 'xiaohongshu', author: '小红书作者' }
    })
    render(<PlatformIntegrationWorkspace />)
    expect(screen.getByText('目前支持：抖音、小红书')).toBeInTheDocument()
    expect(screen.queryByText('固定保存目录')).not.toBeInTheDocument()
    const paragraph = '分享笔记 https://xhslink.com/a/Test 复制打开小红书'
    fireEvent.change(screen.getByLabelText('分享文案或链接'), { target: { value: paragraph } })
    fireEvent.click(screen.getByRole('button', { name: '解析与预览' }))
    await screen.findByRole('button', { name: '保存全部图片' })
    expect(api.parsePlatformShare).toHaveBeenLastCalledWith(paragraph)
    expect(screen.getByRole('button', { name: '写入 MD' })).toBeDisabled()
    expect(api.writePlatformMarkdown).not.toHaveBeenCalled()
    const row = screen
      .getByRole('button', { name: '保存全部图片' })
      .closest('.platform-directory-action-row')!
    expect(row).toHaveTextContent('D:\\downloads')
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('已保存 1 个文件')
    expect(api.writePlatformMarkdown).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    await screen.findByText('D:\\notes\\work.md')
    expect(api.writePlatformMarkdown).toHaveBeenLastCalledWith({
      resultId: 'preview-token',
      linkStyle: 'markdown'
    })
  })

  it('loads a remembered directory and does not clear it on new parses or navigation', async () => {
    const api = installApi()
    const view = render(<PlatformIntegrationWorkspace />)
    await parse()
    expect(screen.getByText('D:\\downloads')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更改目录' }))
    await screen.findByText('D:\\new-downloads')
    expect(api.selectPlatformSaveDirectory).toHaveBeenCalledTimes(1)
    api.getPlatformSaveDirectory.mockResolvedValue({
      success: true,
      directory: 'D:\\new-downloads'
    })
    view.unmount()
    render(<PlatformIntegrationWorkspace />)
    await screen.findByText('D:\\new-downloads')
    expect(api.savePlatformMedia).not.toHaveBeenCalled()
  })
  it('accepts the full share, previews honestly, and saves only after an explicit click', async () => {
    const api = installApi()
    render(<PlatformIntegrationWorkspace />)
    await parse()
    expect(screen.getByRole('link', { name: '查看原作品 ↗' })).toHaveAttribute(
      'href',
      result.work!.sourceUrl
    )
    expect(api.parsePlatformShare).toHaveBeenCalledWith(share)
    expect(screen.queryByText(/优先直接 HTTP/)).not.toBeInTheDocument()
    expect(api.savePlatformMedia).not.toHaveBeenCalled()
    expect(screen.getByText('水印状态未知')).toBeInTheDocument()
    expect(screen.queryByText('平台标明无水印')).not.toBeInTheDocument()
    expect(screen.getByAltText('作品第 1 张图片')).toHaveAttribute(
      'src',
      result.work!.assets[0].previewUrl
    )
    fireEvent.click(screen.getByRole('button', { name: '保存第 1 张' }))
    await screen.findByText('已保存 1 个文件')
    expect(api.savePlatformMedia).toHaveBeenLastCalledWith({
      resultId: 'preview-token',
      assetId: 'image-1'
    })
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await waitFor(() =>
      expect(api.savePlatformMedia).toHaveBeenLastCalledWith({ resultId: 'preview-token' })
    )
  })

  it('keeps earlier successful downloads available for a note when another save fails', async () => {
    const api = installApi()
    render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存第 1 张' }))
    await screen.findByText('已保存 1 个文件')
    api.savePlatformMedia.mockResolvedValue({
      success: false,
      files: [],
      error: '资源已过期'
    } as never)
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('资源已过期')
    expect(screen.getByText('D:\\downloads\\work.webp')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '写入 MD' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    await screen.findByText('D:\\notes\\work.md')
  })

  it('distinguishes identified works without media from a successful parse', async () => {
    const api = installApi({
      success: false,
      error: '作品受限',
      identifiedWork: { id: '7686472347373484971', kind: 'images', sourceUrl: '' }
    })
    render(<PlatformIntegrationWorkspace />)
    fireEvent.change(screen.getByLabelText('分享文案或链接'), { target: { value: share } })
    fireEvent.click(screen.getByRole('button', { name: '解析与预览' }))
    await screen.findByText('作品受限')
    expect(screen.getByText(/尚未获得可下载资源/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存全部图片' })).not.toBeInTheDocument()
    expect(api.savePlatformMedia).not.toHaveBeenCalled()
  })

  it('renders video controls and keeps failed previews explicit', async () => {
    const video = {
      ...result,
      work: {
        ...result.work!,
        kind: 'video' as const,
        assets: [{ ...result.work!.assets[0], id: 'video-1', kind: 'video' as const }]
      }
    }
    installApi(video)
    render(<PlatformIntegrationWorkspace />)
    fireEvent.change(screen.getByLabelText('分享文案或链接'), { target: { value: share } })
    fireEvent.click(screen.getByRole('button', { name: '解析与预览' }))
    await screen.findByRole('button', { name: '保存视频' })
    const preview = screen.getByLabelText('作品视频预览')
    expect(preview).toHaveAttribute('controls')
    fireEvent.error(preview)
    expect(screen.getByText(/视频预览失败/)).toBeInTheDocument()
  })

  it('does not report canceled folder selection as a saved file', async () => {
    const api = installApi()
    api.savePlatformMedia.mockResolvedValue({ success: false, canceled: true, files: [] } as never)
    render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存全部图片' })).not.toBeDisabled()
    )
    expect(screen.queryByText(/已保存 \d+ 个文件/)).not.toBeInTheDocument()
  })

  it.each(['resolve', 'reject'] as const)('keeps the newer preview when an unmounted parse request later %ss', async (outcome) => {
    const pending = deferred<PlatformParseResult>()
    const api = installApi()
    api.parsePlatformShare.mockReturnValueOnce(pending.promise)
    const oldView = render(<PlatformIntegrationWorkspace />)
    fireEvent.change(screen.getByLabelText('分享文案或链接'), { target: { value: share } })
    fireEvent.click(screen.getByRole('button', { name: '解析与预览' }))
    oldView.unmount()

    installApi(replacementResult)
    const newView = render(<PlatformIntegrationWorkspace />)
    await parse()
    await screen.findByRole('heading', { name: '后来解析的作品' })
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(result)
      else pending.reject(new Error('旧解析错误'))
    })
    newView.unmount()
    render(<PlatformIntegrationWorkspace />)
    expect(screen.getByRole('heading', { name: '后来解析的作品' })).toBeInTheDocument()
    expect(screen.queryByText('旧解析错误')).not.toBeInTheDocument()
  })

  it.each(['resolve', 'reject'] as const)('keeps new files and MD when an unmounted media save later %ss', async (outcome) => {
    const pending = deferred<PlatformSaveResult>()
    const oldApi = installApi()
    oldApi.savePlatformMedia.mockReturnValueOnce(pending.promise)
    const oldView = render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    expect(oldApi.savePlatformMedia).toHaveBeenCalledWith({ resultId: result.resultId })
    oldView.unmount()

    const newApi = installApi(replacementResult)
    newApi.savePlatformMedia.mockResolvedValue({ success: true, files: ['D:\\downloads\\current.webp'] })
    newApi.writePlatformMarkdown.mockResolvedValue({ success: true, file: 'D:\\notes\\current.md' })
    const newView = render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('D:\\downloads\\current.webp')
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    await screen.findByText('D:\\notes\\current.md')
    await act(async () => {
      if (outcome === 'resolve') pending.resolve({ success: true, files: ['D:\\downloads\\old.webp'] })
      else pending.reject(new Error('旧素材保存错误'))
    })
    newView.unmount()
    render(<PlatformIntegrationWorkspace />)
    expect(screen.getByText('D:\\downloads\\current.webp')).toBeInTheDocument()
    expect(screen.getByText('D:\\notes\\current.md')).toBeInTheDocument()
    expect(screen.queryByText('D:\\downloads\\old.webp')).not.toBeInTheDocument()
    expect(screen.queryByText('旧素材保存错误')).not.toBeInTheDocument()
    expect(screen.queryByText(/取消/)).not.toBeInTheDocument()
  })

  it.each(['resolve', 'reject'] as const)('keeps new MD when an unmounted MD write later %ss', async (outcome) => {
    const pending = deferred<PlatformMarkdownResult>()
    const oldApi = installApi()
    oldApi.writePlatformMarkdown.mockReturnValueOnce(pending.promise)
    const oldView = render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('D:\\downloads\\work.webp')
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    expect(oldApi.writePlatformMarkdown).toHaveBeenCalledWith({ resultId: result.resultId, linkStyle: 'markdown' })
    oldView.unmount()

    const newApi = installApi(replacementResult)
    newApi.savePlatformMedia.mockResolvedValue({ success: true, files: ['D:\\downloads\\current.webp'] })
    newApi.writePlatformMarkdown.mockResolvedValue({ success: true, file: 'D:\\notes\\current.md' })
    const newView = render(<PlatformIntegrationWorkspace />)
    await parse()
    fireEvent.click(screen.getByRole('button', { name: '保存全部图片' }))
    await screen.findByText('D:\\downloads\\current.webp')
    fireEvent.click(screen.getByRole('button', { name: '写入 MD' }))
    await screen.findByText('D:\\notes\\current.md')
    await act(async () => {
      if (outcome === 'resolve') pending.resolve({ success: true, file: 'D:\\notes\\old.md' })
      else pending.reject(new Error('旧 MD 写入错误'))
    })
    newView.unmount()
    render(<PlatformIntegrationWorkspace />)
    expect(screen.getByText('D:\\notes\\current.md')).toBeInTheDocument()
    expect(screen.queryByText('D:\\notes\\old.md')).not.toBeInTheDocument()
    expect(screen.queryByText('旧 MD 写入错误')).not.toBeInTheDocument()
    expect(screen.queryByText(/取消/)).not.toBeInTheDocument()
  })

  it.each([
    ['selectPlatformSaveDirectory', '更改目录', 'D:\\downloads'],
    ['selectPlatformMarkdownDirectory', '更改 MD 目录', 'D:\\notes']
  ] as const)('ignores an old %s response after navigating back to a new preview', async (method, button, directory) => {
    const pending = deferred<{ success: boolean; directory: string }>()
    const oldApi = installApi()
    oldApi[method].mockReturnValueOnce(pending.promise)
    const oldView = render(<PlatformIntegrationWorkspace />)
    await parse()
    await screen.findByText(directory)
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect(oldApi[method]).toHaveBeenCalledOnce()
    oldView.unmount()

    installApi(replacementResult)
    render(<PlatformIntegrationWorkspace />)
    await parse()
    await screen.findByText(directory)
    await act(async () => pending.resolve({ success: true, directory: 'D:\\old-selection' }))
    expect(screen.getByText(directory)).toBeInTheDocument()
    expect(screen.queryByText('D:\\old-selection')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解析与预览' })).toBeEnabled()
  })
})
