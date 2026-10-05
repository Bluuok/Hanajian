import { describe, expect, it, vi } from 'vitest'
import { AgentMemoryExtractionService } from '../../src/main/services/agent-memory-extraction-service'
import {
  buildAgentMemoryFormatPrompt,
  getAgentMemoryFormat,
  parseAgentMemoryDocument,
  PROFESSIONAL_MEMORY_FORMAT,
  renderAgentMemoryDocument,
  renderAgentMemoryExport
} from '../../src/shared/agent-memory-format'
import type { AgentMemoryFormat } from '../../src/shared/agent-memory-format'

const sources = [
  {
    id: 'private-1',
    time: '2026/9/6 10:00:00',
    sender: 'A',
    type: '文本',
    text: '我周末带孩子去医院。'
  },
  {
    id: 'work-1',
    time: '2026/9/6 10:01:00',
    sender: 'B',
    type: '文本',
    text: 'Agent 的查询工具只开放只读权限。资料：https://example.com/agent?q=tools'
  }
]
function output(sourceId = 'work-1'): {
  title: string
  sections: Array<{
    id: string
    items: Array<{ title?: string; content: string; source_ids: string[] }>
  }>
} {
  return {
    title: 'Agent 工程实践',
    sections: [
      {
        id: 'conclusions',
        items: [{ title: '只读工具', content: '工具调用应保持只读。', source_ids: [sourceId] }]
      },
      {
        id: 'evidence',
        items: [{ content: '“只开放只读权限”表明应限制工具的权限。', source_ids: [sourceId] }]
      },
      {
        id: 'questions',
        items: [{ content: '该框架是否支持工具权限校验，尚待验证。', source_ids: [sourceId] }]
      },
      {
        id: 'keywords',
        items: [{ title: 'Agent', content: '讨论中的智能体与只读工具。', source_ids: [sourceId] }]
      }
    ]
  }
}
function request(
  sourceMessages = sources
): Parameters<AgentMemoryExtractionService['createDraft']>[0] {
  return {
    groupId: 'group-1',
    groupName: '测试群',
    options: { enabled: true, focus: 'Agent 工程' },
    sourceMessages
  }
}

describe('AgentMemoryExtractionService', () => {
  it('uses the selected note format and writing style without losing real source attribution', async () => {
    const chat = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(output()) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft({
      ...request(),
      options: {
        enabled: true,
        focus: 'Agent 工程',
        formatId: 'action-memory-v1',
        writingStyle: '简短条目'
      }
    })
    expect(draft.success).toBe(true)
    expect(chat.mock.calls[0][0][1].content).toContain('表达要求：简短条目')
    expect(draft.markdown).toContain('## 决定与行动')
    expect(draft.markdown).toContain('## 待确认事项')
    expect(draft.markdown).toContain('来源：B，2026/9/6 10:01:00')
    expect(renderAgentMemoryExport(draft)).toContain('- 表达要求：简短条目')
  })
  it('directly selects by focus in one call, without a separate privacy screening pass', async () => {
    const chat = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(output()) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request())
    expect(draft.success).toBe(true)
    expect(chat).toHaveBeenCalledTimes(1)
    expect(chat.mock.calls[0][0][1].content).toContain('private-1')
    expect(chat.mock.calls[0][0][1].content).toContain('Agent 工程')
    expect(chat.mock.calls[0][0][0].content).not.toContain('keep_ids')
    expect(draft.selectedMessageCount).toBe(1)
    expect(draft.excludedMessageCount).toBe(1)
    expect(draft.markdown).not.toContain('医院')
  })

  it('renders four sections in one document and puts every source on a separate paragraph', async () => {
    const chat = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(output()) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request())
    const markdown = renderAgentMemoryExport(draft)
    expect(markdown.match(/^## /gm)).toHaveLength(4)
    expect(markdown).toContain(
      '1. **只读工具**\n\n工具调用应保持只读。\n\n来源：B，2026/9/6 10:01:00'
    )
    expect(markdown).toContain('权限。\n\n来源：B，2026/9/6 10:01:00')
    expect(markdown).toContain('尚待验证。\n\n来源：B，2026/9/6 10:01:00')
    expect(markdown).toContain('只读工具。\n\n来源：B，2026/9/6 10:01:00')
    expect(markdown).toContain('- 来源群聊：测试群')
    expect(markdown).toContain('- 群聊 ID：group-1')
    expect(markdown).toContain(`- 草稿 ID：${draft.id}`)
    expect(markdown).toContain('- 生成时间：')
    expect(markdown).toContain('- 沉淀来源消息：1/2')
    expect(markdown).toContain('- 提取要求：Agent 工程')
    expect(markdown).not.toContain('第一轮')
  })

  it('includes all messages in the read range without the old 180/90 limits or text truncation', async () => {
    const many = Array.from({ length: 250 }, (_, index) => ({
      id: `m-${index}`,
      time: '10:00',
      sender: 'A',
      type: '文本',
      text:
        index === 0
          ? '长正文'.repeat(400) + '最后的技术网址 https://example.com/end'
          : `消息${index}`
    }))
    const chat = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(output('m-0')) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request(many))
    expect(draft.success).toBe(true)
    expect(draft.sourceMessageCount).toBe(250)
    const supplied = JSON.parse(chat.mock.calls[0][0][1].content.split('（JSON 数据）：\n')[1])
    expect(supplied).toHaveLength(250)
    expect(supplied[0].text).toContain('https://example.com/end')
    expect(supplied.at(-1).id).toBe('m-249')
  })

  it('reinjects the format and validation error for one repair, retaining the original messages', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: JSON.stringify(output('invented-id')) })
      .mockResolvedValueOnce({ success: true, data: JSON.stringify(output()) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request())
    expect(draft.success).toBe(true)
    expect(chat).toHaveBeenCalledTimes(2)
    const repair = chat.mock.calls[1][0]
    expect(repair[0].content).toContain('只输出合法 JSON')
    expect(repair[1].content).toContain('work-1')
    expect(repair.at(-1).content).toContain('上一次输出不符合要求')
    expect(repair.at(-1).content).toContain('真实输入消息 ID')
  })

  it('fails safely if both outputs are invalid, rather than saving a partial draft', async () => {
    const chat = vi.fn().mockResolvedValue({ success: true, data: '## 结论\n不符合格式' })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request())
    expect(chat).toHaveBeenCalledTimes(2)
    expect(draft.success).toBe(false)
    expect(draft.markdown).toBe('')
    expect(draft.error).toContain('两次输出')
  })

  it('keeps all four headings for an empty result without invented sources', async () => {
    const empty = output()
    empty.sections.forEach((section) => {
      section.items = []
    })
    const chat = vi.fn().mockResolvedValue({ success: true, data: JSON.stringify(empty) })
    const draft = await new AgentMemoryExtractionService({ chat }).createDraft(request())
    expect(draft.success).toBe(true)
    expect(draft.selectedMessageCount).toBe(0)
    expect(draft.markdown.match(/^## /gm)).toHaveLength(4)
    expect(draft.markdown).not.toContain('来源：')
    expect(draft.warning).toContain('没有找到')
  })

  it('does not call the model when no source messages were read or the format is unknown', async () => {
    const chat = vi.fn()
    const service = new AgentMemoryExtractionService({ chat })
    expect((await service.createDraft(request([]))).success).toBe(false)
    const input = request()
    const invalid = await service.createDraft({
      ...input,
      options: { ...input.options, formatId: 'unknown' }
    })
    expect(invalid.error).toContain('不支持的记忆格式')
    expect(chat).not.toHaveBeenCalled()
  })
})

describe('Agent memory format module', () => {
  it('rejects missing/duplicate sections, inline sources, missing titles and fabricated URLs', () => {
    const parse = (value: unknown): ReturnType<typeof parseAgentMemoryDocument> =>
      parseAgentMemoryDocument(JSON.stringify(value), PROFESSIONAL_MEMORY_FORMAT, sources)
    const missing = output()
    missing.sections.pop()
    expect(() => parse(missing)).toThrow('分区数量')
    const duplicate = output()
    duplicate.sections[3].id = 'conclusions'
    expect(() => parse(duplicate)).toThrow('重复')
    const inline = output()
    inline.sections[1].items[0].content += '来源：B，10:01'
    expect(() => parse(inline)).toThrow('混入来源')
    const noTitle = output()
    noTitle.sections[0].items[0].title = ''
    expect(() => parse(noTitle)).toThrow('标题')
    const badUrl = output()
    badUrl.sections[3].items[0].content = 'https://fabricated.example/'
    expect(() => parse(badUrl)).toThrow('网址')
    badUrl.sections[3].items[0].content = 'https://example.com/agent'
    expect(() => parse(badUrl)).toThrow('网址')
  })

  it('preserves original URLs and deduplicates repeated citations', () => {
    const data = output()
    data.sections[3].items[0].content = '参考资料：https://example.com/agent?q=tools'
    data.sections[3].items[0].source_ids = ['work-1', 'work-1']
    const doc = parseAgentMemoryDocument(JSON.stringify(data), getAgentMemoryFormat(), sources)
    expect(doc.sections[3].items[0].sourceIds).toEqual(['work-1'])
    expect(renderAgentMemoryDocument(doc, getAgentMemoryFormat(), sources)).toContain(
      'https://example.com/agent?q=tools'
    )
  })

  it('supports a different section layout without changing extraction/validation/rendering code', () => {
    const custom: AgentMemoryFormat = {
      id: 'custom-demo',
      sections: [
        {
          id: 'decisions',
          heading: '决策记录',
          instruction: '收录决策',
          listStyle: 'bulleted',
          emptyText: '暂无决策。'
        }
      ]
    }
    const data = {
      title: '决策',
      sections: [{ id: 'decisions', items: [{ content: '只读工具。', source_ids: ['work-1'] }] }]
    }
    const doc = parseAgentMemoryDocument(JSON.stringify(data), custom, sources)
    const rendered = renderAgentMemoryDocument(doc, custom, sources)
    expect(rendered).toContain('## 决策记录')
    expect(rendered).not.toContain('## 结论与方法')
    expect(buildAgentMemoryFormatPrompt(custom)).toContain('收录决策')
  })
})
