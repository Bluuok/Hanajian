import React from 'react'
import type {
  PlatformParseResult,
  PlatformMarkdownResult,
  PlatformSaveResult
} from '../../../../shared/platform-integration'
import { PLATFORM_WATERMARK_LABELS } from '../../../../shared/platform-integration'
import { Button, Textarea } from '../../components/ui'
import recorderScene from '../../assets/hanajian/hero/topic-recorder-scene.png'
import booksCorner from '../../assets/hanajian/decor/books-corner.png'

// Preserve completed previews across navigation without persisting this cache to disk.
const session: {
  shareText: string
  result?: PlatformParseResult
  saved?: PlatformSaveResult
  markdown?: PlatformMarkdownResult
} = {
  shareText: ''
}

export function PlatformStandaloneWorkspace({
  theme,
  onBack
}: {
  theme: 'system' | 'light' | 'dark'
  onBack: () => void
}): React.ReactElement {
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [theme])
  return (
    <main className={`app-shell theme-${theme} platform-integration-standalone`}>
      <div className="platform-integration-back">
        <Button variant="outline" onClick={onBack}>
          返回花笺
        </Button>
      </div>
      <PlatformIntegrationWorkspace />
    </main>
  )
}

export function PlatformIntegrationWorkspace(): React.ReactElement {
  const [shareText, setShareText] = React.useState(session.shareText)
  const [result, setResult] = React.useState(session.result)
  const [saved, setSaved] = React.useState(session.saved)
  const [parsing, setParsing] = React.useState(false)
  const [saving, setSaving] = React.useState<string | null>(null)
  const [directory, setDirectory] = React.useState('')
  const [markdownDirectory, setMarkdownDirectory] = React.useState('')
  const [markdown, setMarkdown] = React.useState(session.markdown)
  const [writingMarkdown, setWritingMarkdown] = React.useState(false)
  const [linkStyle, setLinkStyle] = React.useState<'markdown' | 'obsidian'>('markdown')
  const [directoryError, setDirectoryError] = React.useState('')
  const [selectingDirectory, setSelectingDirectory] = React.useState(false)
  const [previewErrors, setPreviewErrors] = React.useState<Record<string, boolean>>({})
  const mountedRef = React.useRef(true)
  const busy = parsing || !!saving || selectingDirectory || writingMarkdown
  const work = result?.success ? result.work : undefined

  React.useEffect(() => {
    mountedRef.current = true
    let active = true
    void window.api
      .getPlatformSaveDirectory()
      .then((value) => {
        if (!active) return
        if (value.success) setDirectory(value.directory || '')
        else setDirectoryError(value.error || '读取保存目录失败')
      })
      .catch(() => {
        if (active) setDirectoryError('读取保存目录失败')
      })
    void window.api
      .getPlatformMarkdownDirectory()
      .then((value) => {
        if (!active) return
        if (value.success) setMarkdownDirectory(value.directory || '')
        else setDirectoryError(value.error || '读取 MD 目录失败')
      })
      .catch(() => {
        if (active) setDirectoryError('读取 MD 目录失败')
      })
    return () => {
      active = false
      // Ignore late presentation updates; downloads and MD writes may still finish on disk.
      mountedRef.current = false
    }
  }, [])

  const selectDirectory = async (forMarkdown = false): Promise<void> => {
    if (busy) return
    setSelectingDirectory(true)
    setDirectoryError('')
    try {
      const selected = await (forMarkdown
        ? window.api.selectPlatformMarkdownDirectory()
        : window.api.selectPlatformSaveDirectory())
      if (!mountedRef.current) return
      if (selected.success)
        (forMarkdown ? setMarkdownDirectory : setDirectory)(selected.directory || '')
      else if (!selected.canceled) setDirectoryError(selected.error || '选择保存目录失败')
    } catch (error) {
      if (!mountedRef.current) return
      setDirectoryError(error instanceof Error ? error.message : '选择保存目录失败')
    } finally {
      if (mountedRef.current) setSelectingDirectory(false)
    }
  }

  const parse = async (): Promise<void> => {
    if (busy || !shareText.trim()) return
    setParsing(true)
    setResult(undefined)
    setSaved(undefined)
    setMarkdown(undefined)
    session.markdown = undefined
    setPreviewErrors({})
    session.result = undefined
    session.saved = undefined
    try {
      const next = await window.api.parsePlatformShare(shareText)
      if (!mountedRef.current) return
      session.result = next
      setResult(next)
    } catch (error) {
      if (!mountedRef.current) return
      const failed = {
        success: false,
        error: error instanceof Error ? error.message : '解析失败，请重试'
      }
      session.result = failed
      setResult(failed)
    } finally {
      if (mountedRef.current) setParsing(false)
    }
  }

  const save = async (assetId?: string): Promise<void> => {
    if (busy || !result?.resultId) return
    setSaving(assetId || 'all')
    try {
      const next = await window.api.savePlatformMedia({
        resultId: result.resultId,
        ...(assetId ? { assetId } : {})
      })
      if (!mountedRef.current) return
      if (!next.canceled) {
        setMarkdown(undefined)
        session.markdown = undefined
        if (next.directory) setDirectory(next.directory)
        const combined = {
          ...next,
          files: [...new Set([...(saved?.files || []), ...next.files])]
        }
        session.saved = combined
        setSaved(combined)
      }
    } catch (error) {
      if (!mountedRef.current) return
      const failed = {
        success: false,
        files: saved?.files || [],
        error: error instanceof Error ? error.message : '保存失败'
      }
      session.saved = failed
      setSaved(failed)
    } finally {
      if (mountedRef.current) setSaving(null)
    }
  }

  const writeMarkdown = async (): Promise<void> => {
    if (busy || !result?.resultId || !saved?.files.length) return
    setWritingMarkdown(true)
    try {
      const next = await window.api.writePlatformMarkdown({ resultId: result.resultId, linkStyle })
      if (!mountedRef.current) return
      if (!next.canceled) {
        if (next.directory) setMarkdownDirectory(next.directory)
        session.markdown = next
        setMarkdown(next)
      }
    } catch (error) {
      if (!mountedRef.current) return
      const failed = {
        success: false,
        error: error instanceof Error ? error.message : 'MD 写入失败'
      }
      session.markdown = failed
      setMarkdown(failed)
    } finally {
      if (mountedRef.current) setWritingMarkdown(false)
    }
  }

  return (
    <section
      className={`platform-integration-workspace${work ? ' has-preview' : ''}`}
      aria-label="内容收藏工作台"
    >
      <header className="platform-integration-header">
        <div className="platform-integration-heading">
          <div className="platform-integration-heading-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h6l2 2h8v11H4zM4 7V4h7l2 3M12 12v5m-2-2 2 2 2-2" />
            </svg>
          </div>
          <div>
            <p>花笺 · 本地收藏</p>
            <h1>内容收藏</h1>
            <span>把喜欢的内容，轻轻收好。粘贴分享链接，保存为本地素材与笔记。</span>
            <span className="platform-integration-tag">目前支持：抖音、小红书</span>
          </div>
        </div>
        <img
          className="platform-integration-artwork"
          src={recorderScene}
          alt=""
          aria-hidden="true"
        />
        <ol className="platform-integration-steps" aria-label="收藏步骤">
          <li>
            <span>1</span>粘贴分享
          </li>
          <li>
            <span>2</span>预览作品
          </li>
          <li>
            <span>3</span>保存素材与笔记
          </li>
        </ol>
      </header>
      <div className="platform-integration-content">
        <div className="platform-integration-input">
          <label htmlFor="platform-share-text">分享文案或链接</label>
          <Textarea
            id="platform-share-text"
            value={shareText}
            disabled={busy}
            maxLength={16000}
            placeholder="粘贴完整分享文案或作品链接"
            onChange={(event) => {
              session.shareText = event.target.value
              setShareText(event.target.value)
            }}
          />
          <div className="platform-integration-actions">
            <small>整段粘贴即可。</small>
            <Button disabled={busy || !shareText.trim()} onClick={() => void parse()}>
              {parsing ? '正在解析…' : '解析与预览'}
            </Button>
          </div>
        </div>
        {directoryError ? (
          <p className="platform-integration-error" role="alert">
            {directoryError}
          </p>
        ) : null}
        <label className="platform-link-style">
          <span>笔记链接格式</span>
          <select
            aria-label="笔记链接格式"
            value={linkStyle}
            disabled={busy}
            onChange={(event) => setLinkStyle(event.target.value as 'markdown' | 'obsidian')}
          >
            <option value="markdown">Markdown 超链接</option>
            <option value="obsidian">Obsidian 双链</option>
          </select>
          <small>
            {linkStyle === 'markdown'
              ? '使用相对路径，媒体和笔记可以放在不同文件夹。'
              : '媒体需放在同一个 Obsidian 仓库内。'}
          </small>
        </label>
        {parsing ? <p role="status">正在获取作品详情，浏览器后备解析可能需要几十秒…</p> : null}
        {result && !result.success ? (
          <div className="platform-integration-error" role="alert">
            <strong>解析未完成</strong>
            <p>{result.error}</p>
            {result.identifiedWork ? (
              <small>
                已识别作品 ID：{result.identifiedWork.id}
                {result.identifiedWork.kind === 'images' ? ' · 图文作品' : ''}；尚未获得可下载资源。
              </small>
            ) : null}
          </div>
        ) : null}
        {work ? (
          <article className="platform-integration-result" aria-label="作品预览">
            <header>
              <div>
                <span>
                  {work.platform === 'douyin' ? '抖音' : '小红书'} ·{' '}
                  {work.kind === 'images' ? '图文作品' : '视频作品'} · {work.author}
                </span>
                <h2>{work.title}</h2>
                <small>
                  作品 ID：{work.id} · {work.assets.length} 个资源
                </small>
              </div>
              <a
                className="platform-source-link"
                href={work.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                查看原作品 ↗
              </a>
            </header>
            <div className="platform-integration-result-body">
              <aside className="platform-work-actions" aria-label="保存素材与笔记">
                <div className="platform-directory-action-row">
                  <div className="platform-directory-inline">
                    <strong>媒体目录</strong>
                    <span title={directory}>{directory || '首次保存时选择，之后自动记住'}</span>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void selectDirectory()}
                    >
                      {directory ? '更改目录' : '选择保存目录'}
                    </Button>
                  </div>
                  <Button disabled={busy} onClick={() => void save()}>
                    {saving === 'all'
                      ? '正在保存…'
                      : work.kind === 'images'
                        ? '保存全部图片'
                        : '保存视频'}
                  </Button>
                </div>
                <div className="platform-directory-action-row">
                  <div className="platform-directory-inline">
                    <strong>MD 目录</strong>
                    <span title={markdownDirectory}>
                      {markdownDirectory || '选择本地笔记保存目录'}
                    </span>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void selectDirectory(true)}
                    >
                      {markdownDirectory ? '更改 MD 目录' : '选择 MD 目录'}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || !saved?.files.length}
                    onClick={() => void writeMarkdown()}
                  >
                    {writingMarkdown ? '正在写入…' : '写入 MD'}
                  </Button>
                </div>
                <small>
                  目录会记住。先保存媒体，再写入笔记；选择 Obsidian 双链时，媒体与 MD
                  需在同一仓库内。
                </small>
              </aside>
              <div className={`platform-integration-media ${work.kind}`}>
                {work.assets.map((asset, index) => (
                  <figure key={asset.id}>
                    {previewErrors[asset.id] ? (
                      <div className="platform-integration-preview-error">
                        {asset.kind === 'video'
                          ? '视频预览失败，可能是媒体请求或编码兼容问题；仍可尝试保存视频。'
                          : '图片预览失败，请重新解析或尝试保存。'}
                      </div>
                    ) : asset.kind === 'video' ? (
                      <video
                        controls
                        preload="metadata"
                        src={asset.previewUrl}
                        aria-label="作品视频预览"
                        onError={() =>
                          setPreviewErrors((previous) => ({ ...previous, [asset.id]: true }))
                        }
                      />
                    ) : (
                      <img
                        loading="lazy"
                        src={asset.previewUrl}
                        alt={`作品第 ${index + 1} 张图片`}
                        onError={() =>
                          setPreviewErrors((previous) => ({ ...previous, [asset.id]: true }))
                        }
                      />
                    )}
                    <figcaption>
                      <div>
                        <strong>
                          {asset.kind === 'video' ? '视频' : `第 ${index + 1} 张图片`}
                        </strong>
                        <span
                          className={`platform-watermark ${asset.watermark}`}
                          title={asset.watermarkEvidence}
                        >
                          {PLATFORM_WATERMARK_LABELS[asset.watermark]}
                        </span>
                      </div>
                      {asset.kind === 'image' ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void save(asset.id)}
                        >
                          {saving === asset.id ? '正在保存…' : `保存第 ${index + 1} 张`}
                        </Button>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
            {work.warnings.map((warning) => (
              <p key={warning} className="platform-integration-notice">
                {warning}
              </p>
            ))}
            <p className="platform-integration-notice">
              预览与保存使用同一资源。解析结果在本次应用会话保留 30 分钟；资源过期后请重新解析。
            </p>
          </article>
        ) : null}
        {!result && !parsing ? (
          <div className="platform-integration-empty">
            <img src={booksCorner} alt="" aria-hidden="true" />
            <div>
              <strong>喜欢的作品，也可以成为自己的笔记。</strong>
              <p>先预览，再保存图片或视频；写入笔记时，会一起收好原链接与本地素材。</p>
            </div>
          </div>
        ) : null}
        {saved ? (
          <div
            className={saved.success ? 'platform-integration-saved' : 'platform-integration-error'}
            role={saved.success ? 'status' : 'alert'}
          >
            <strong>{saved.success ? `已保存 ${saved.files.length} 个文件` : saved.error}</strong>
            {saved.reusedFiles?.length ? (
              <p>其中 {saved.reusedFiles.length} 个文件已存在，已复用，没有重复下载。</p>
            ) : null}
            {saved.files.map((file) => (
              <p key={file}>
                <code>{file}</code>
              </p>
            ))}
            {saved.errors?.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        {markdown ? (
          <div
            className={
              markdown.success ? 'platform-integration-saved' : 'platform-integration-error'
            }
            role={markdown.success ? 'status' : 'alert'}
          >
            <strong>
              {markdown.success
                ? markdown.reused
                  ? 'MD 已存在，已复用'
                  : 'MD 已写入'
                : markdown.error}
            </strong>
            {markdown.file ? (
              <p>
                <code>{markdown.file}</code>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
