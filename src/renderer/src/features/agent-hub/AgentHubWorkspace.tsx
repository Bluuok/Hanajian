import React from 'react'
import type { AgentHubLogEntry, AgentHubLogSource } from '../../../../shared/agent-hub'
import { AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../../../shared/agent-hub'
import booksCorner from '../../assets/hanajian/decor/books-corner.png'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea
} from '../../components/ui'

const LOG_SOURCE_LABELS: Record<AgentHubLogSource, string> = {
  system: '系统',
  'agent-hub': '问问 AI'
}

export function AIAssistantSettingsWorkspace(): React.ReactElement {
  const [logs, setLogs] = React.useState<AgentHubLogEntry[]>([])
  const [logSource, setLogSource] = React.useState<'all' | AgentHubLogSource>('all')
  const [customInstructions, setCustomInstructions] = React.useState('')
  const [savedCustomInstructions, setSavedCustomInstructions] = React.useState('')
  const [promptMaxLength, setPromptMaxLength] = React.useState(
    AGENT_HUB_CUSTOM_INSTRUCTIONS_MAX_LENGTH
  )
  const [promptBusy, setPromptBusy] = React.useState(false)
  const [promptNotice, setPromptNotice] = React.useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)
  const logBodyRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let mounted = true
    void window.api.getAgentHubLogs().then((entries) => {
      if (mounted) setLogs(entries)
    })
    void window.api
      .getAgentHubPromptSettings()
      .then((settings) => {
        if (!mounted) return
        setCustomInstructions(settings.customInstructions)
        setSavedCustomInstructions(settings.customInstructions)
        setPromptMaxLength(settings.maxLength)
      })
      .catch((error) => {
        if (mounted) {
          setPromptNotice({
            kind: 'error',
            text: error instanceof Error ? error.message : '自定义总结指令读取失败'
          })
        }
      })
    const unsubscribeLog = window.api.onAgentHubLog((entry) => {
      if (mounted) setLogs((current) => [...current.slice(-799), entry])
    })
    return () => {
      mounted = false
      unsubscribeLog()
    }
  }, [])

  const visibleLogs = logs.filter((entry) => logSource === 'all' || entry.source === logSource)

  React.useEffect(() => {
    const body = logBodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [visibleLogs.length])

  const copyLogs = async (): Promise<void> => {
    const text = visibleLogs
      .map(
        (entry) =>
          `${new Date(entry.timestamp).toLocaleTimeString()} [${LOG_SOURCE_LABELS[entry.source]}] [${entry.level}] ${entry.message}`
      )
      .join('\n')
    await window.api.copyText(text)
  }

  const clearLogs = async (): Promise<void> => {
    await window.api.clearAgentHubLogs()
    setLogs([])
  }

  const savePrompt = async (value = customInstructions): Promise<void> => {
    setPromptBusy(true)
    setPromptNotice(null)
    try {
      const result = await window.api.saveAgentHubPromptSettings(value)
      if (!result.success) {
        setPromptNotice({ kind: 'error', text: result.error || '自定义总结指令保存失败' })
        return
      }
      setCustomInstructions(result.settings.customInstructions)
      setSavedCustomInstructions(result.settings.customInstructions)
      setPromptMaxLength(result.settings.maxLength)
      setPromptNotice({
        kind: 'success',
        text: result.settings.customInstructions ? '自定义总结指令已保存' : '已恢复默认总结规则'
      })
    } catch (error) {
      setPromptNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : '自定义总结指令保存失败'
      })
    } finally {
      setPromptBusy(false)
    }
  }

  return (
    <div className="agent-hub-workspace">
      <header className="agent-hub-header">
        <div>
          <div className="agent-hub-eyebrow">问问 AI</div>
          <h1>AI 助手设置</h1>
          <p>管理总结提示词并查看本机 AI 的运行日志。</p>
        </div>
        <div className="agent-hub-header-aside">
          <span className="agent-hub-prompt-guard">仅使用本机只读聊天工具</span>
          <img src={booksCorner} alt="" aria-hidden="true" />
        </div>
      </header>

      <section className="agent-hub-card agent-hub-prompt-card">
        <div className="agent-hub-prompt-heading">
          <div>
            <span className="agent-hub-card-kicker">回答偏好</span>
            <h2>自定义总结指令</h2>
            <p>调整总结的重点、结构、篇幅和表达方式，不会改变工具权限。</p>
          </div>
          <span className="agent-hub-prompt-guard">只读规则始终生效</span>
        </div>
        <div className="agent-hub-prompt-guardrail">
          内置安全 Prompt 不可编辑：AI 只能读取本地群聊，不能删除、修改或发送微信消息。
        </div>
        <label className="agent-hub-prompt-field" htmlFor="ai-assistant-custom-instructions">
          <span>附加指令</span>
          <Textarea
            id="ai-assistant-custom-instructions"
            value={customInstructions}
            maxLength={promptMaxLength}
            onChange={(event) => {
              setCustomInstructions(event.target.value)
              setPromptNotice(null)
            }}
            placeholder="例如：总结时先给出三行摘要，再按主要话题、决定、待办和未解决问题分段；重要结论注明发言人与时间。"
          />
        </label>
        <div className="agent-hub-prompt-footer">
          <div>
            <span>
              {customInstructions.length} / {promptMaxLength}
            </span>
            {promptNotice ? (
              <strong className={promptNotice.kind}>{promptNotice.text}</strong>
            ) : null}
          </div>
          <div className="agent-hub-prompt-actions">
            <Button
              variant="outline"
              disabled={promptBusy || (!customInstructions && !savedCustomInstructions)}
              onClick={() => void savePrompt('')}
            >
              恢复默认
            </Button>
            <Button
              disabled={
                promptBusy ||
                customInstructions.trim() === savedCustomInstructions ||
                customInstructions.length > promptMaxLength
              }
              onClick={() => void savePrompt()}
            >
              {promptBusy ? '保存中…' : '保存指令'}
            </Button>
          </div>
        </div>
      </section>

      <section className="agent-hub-card agent-hub-log-card">
        <div className="agent-hub-log-heading">
          <div>
            <span className="agent-hub-card-kicker">故障诊断</span>
            <h2>AI 运行日志</h2>
          </div>
          <div className="agent-hub-log-actions">
            <Select
              value={logSource}
              onValueChange={(value) => setLogSource(value as 'all' | AgentHubLogSource)}
            >
              <SelectTrigger aria-label="筛选日志来源" className="h-8 min-w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="system">系统</SelectItem>
                <SelectItem value="agent-hub">问问 AI</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void copyLogs()}
              disabled={visibleLogs.length === 0}
            >
              复制日志
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void clearLogs()}>
              清空
            </Button>
          </div>
        </div>
        <div className="agent-hub-log-body" ref={logBodyRef}>
          {visibleLogs.length === 0 ? (
            <div className="agent-hub-log-empty">
              暂无运行日志。在“问问 AI”中提问后，这里会显示处理到哪一步。
            </div>
          ) : (
            visibleLogs.map((entry) => (
              <div className={`agent-hub-log-line ${entry.level}`} key={entry.id}>
                <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                <span className={`source ${entry.source}`}>{LOG_SOURCE_LABELS[entry.source]}</span>
                <code>{entry.message}</code>
              </div>
            ))
          )}
        </div>
        <p className="agent-hub-log-note">日志会隐藏 Token，不保存发送能力，也不记录微信密码。</p>
      </section>
    </div>
  )
}
