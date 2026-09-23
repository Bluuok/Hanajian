/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../..')
const fixture = structuredClone(require(path.join(root, 'tests/fixtures/chat-data.json')))
const userData = process.env.WXE_E2E_USER_DATA
if (!userData) throw new Error('WXE_E2E_USER_DATA is required')
app.setPath('userData', userData)
app.setPath('logs', path.join(userData, 'logs'))
app.commandLine.appendSwitch('disable-gpu')

const VALID_KEY = 'a'.repeat(64)
const imageData = `data:image/png;base64,${fs.readFileSync(path.join(root, 'resources/icon.png')).toString('base64')}`
let imageKeyConfigured = process.env.WXE_E2E_IMAGE_KEY_MISSING !== '1'
const voiceData = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
const configuredNow = Number(process.env.WXE_E2E_NOW_MS)
const updateSimulation = process.env.WXE_E2E_UPDATE_SIMULATION === '1'
const unsignedMacUpdate = process.env.WXE_E2E_UNSIGNED_MAC_UPDATE === '1'
const fixtureNowMs =
  Number.isFinite(configuredNow) && configuredNow > 0 ? configuredNow : Date.now()

const formatFixtureDateTime = (timestampSeconds) => {
  const date = new Date(timestampSeconds * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const allFixtureMessages = Object.values(fixture.messages).flat()
const latestFixtureTime = Math.max(...allFixtureMessages.map((message) => message.createTime || 0))
const fixtureTimeOffset = Math.floor(fixtureNowMs / 1000) - 3600 - latestFixtureTime
for (const message of allFixtureMessages) {
  message.createTime = (message.createTime || latestFixtureTime) + fixtureTimeOffset
  message.datetime = formatFixtureDateTime(message.createTime)
}

const fixtureBaseNowSec = Math.floor(fixtureNowMs / 1000)
const topicFixtureTime =
  Math.floor((fixtureBaseNowSec + 28800) / 86400) * 86400 - 28800 - 86400 + 15 * 3600
const regularMessages = fixture.messages['group-regular-md5'] || []
const additionalRegularMessages = [
  {
    id: 'fixture-historical-1',
    from: 'user',
    type: '普通文本',
    datetime: formatFixtureDateTime(fixtureBaseNowSec - 86400 * 30),
    content: '这是一条远古历史消息',
    isSender: false,
    name: '测试成员',
    senderId: 'wxid_fixture_member',
    createTime: fixtureBaseNowSec - 86400 * 30,
    contentData: { type: 'text', content: '这是一条远古历史消息' }
  },
  {
    id: 'fixture-sys-historical',
    from: 'system',
    type: '系统消息',
    datetime: formatFixtureDateTime(fixtureBaseNowSec - 86400 * 10),
    content: '远古系统消息：群名称已更改',
    isSender: false,
    name: '系统',
    senderId: 'system',
    createTime: fixtureBaseNowSec - 86400 * 10,
    contentData: { type: 'text', content: '远古系统消息：群名称已更改' }
  },
  {
    id: 'fixture-dup-1',
    from: 'user',
    type: '普通文本',
    datetime: formatFixtureDateTime(fixtureBaseNowSec - 4000),
    content: '同秒第 1 条消息',
    isSender: false,
    name: '阿杰',
    senderId: 'wxid_ajie',
    createTime: fixtureBaseNowSec - 4000,
    contentData: { type: 'text', content: '同秒第 1 条消息' }
  },
  {
    id: 'fixture-dup-2',
    from: 'user',
    type: '普通文本',
    datetime: formatFixtureDateTime(fixtureBaseNowSec - 4000),
    content: '同秒第 2 条消息（精准定位目标）',
    isSender: false,
    name: '测试成员',
    senderId: 'wxid_fixture_member',
    createTime: fixtureBaseNowSec - 4000,
    contentData: { type: 'text', content: '同秒第 2 条消息（精准定位目标）' }
  },
  {
    id: 'fixture-1',
    from: 'user',
    type: '普通文本',
    datetime: formatFixtureDateTime(topicFixtureTime),
    content: 'craft 项目原定周五上线，因支付问题改为周六。（真实数据库原文）',
    isSender: false,
    name: '测试成员',
    senderId: 'wxid_fixture_member',
    createTime: topicFixtureTime,
    contentData: {
      type: 'text',
      content: 'craft 项目原定周五上线，因支付问题改为周六。（真实数据库原文）'
    }
  },
  {
    id: 'fixture-2',
    from: 'user',
    type: '普通文本',
    datetime: formatFixtureDateTime(topicFixtureTime + 60),
    content:
      '我最近在用 Craft，感觉界面很干净，写文档很舒服。页面之间的关联做得不错，适合整理一些长期的知识内容。',
    isSender: false,
    name: '阿杰',
    senderId: 'wxid_ajie',
    createTime: topicFixtureTime + 60,
    contentData: {
      type: 'text',
      content:
        '我最近在用 Craft，感觉界面很干净，写文档很舒服。页面之间的关联做得不错，适合整理一些长期的知识内容。'
    }
  }
]

fixture.messages['group-regular-md5'] = [...regularMessages, ...additionalRegularMessages].sort(
  (a, b) => (a.createTime || 0) - (b.createTime || 0)
)

const emptyTimings = () => ({
  queryUnderstandingMs: 0,
  contactResolutionMs: 0,
  knowledgeSearchMs: 0,
  workerIpcMs: 0,
  workerBootMs: 0,
  dispatchMs: 0,
  workerSqlMs: 0,
  responseSerializeMs: 0,
  responseTransferMs: 0,
  workerQueueMs: 0,
  workerExecutionMs: 0,
  globalCountMs: 0,
  voiceCoverageMs: 0,
  wcdbQueueMs: 0,
  wcdbExecutionMs: 0,
  senderEnrichmentMs: 0,
  ipcMs: 0,
  serializationMs: 0,
  otherMs: 0,
  ftsMs: 0,
  chunkExpandMs: 0,
  messageLoadMs: 0,
  rankingMs: 0,
  candidateRankingMs: 0,
  evidenceBuildMs: 0,
  aggregationMs: 0,
  contextPreparationMs: 0,
  agentDecisionMs: 0,
  agentToolMs: 0,
  aiGenerationMs: 0,
  totalMs: 1
})

const aiSearchResult = (request) => {
  const failure = process.env.WXE_E2E_AI_FAILURE
  const evidence = [
    {
      id: 'E1',
      chunkId: 'fixture-chunk',
      conversationId: 'group-regular-md5',
      conversationName: '产品测试群',
      conversationType: 'group',
      startTime: fixture.messages['group-regular-md5'][0].createTime * 1000,
      endTime: fixture.messages['group-regular-md5'][0].createTime * 1000,
      messageId: 'msg-text',
      senderId: 'wxid_fixture_member',
      sender: '测试成员',
      timestamp: fixture.messages['group-regular-md5'][0].createTime * 1000,
      messageIds: ['msg-text'],
      sourceKind: 'text',
      text: '这是一条脱敏测试消息',
      score: 1
    }
  ]
  return {
    requestId: request.requestId,
    status: failure ? 'ai_failed' : 'completed',
    plan: {
      intent: 'general',
      keywords: ['测试'],
      variants: [],
      source: 'local',
      scopeLabel: '全局搜索',
      rangeLabel: '近 30 天',
      timeRange: {
        startTime: Math.floor(Date.now() / 1000) - 30 * 86400,
        endTime: Math.floor(Date.now() / 1000),
        label: '近 30 天',
        reason: 'E2E fixture',
        source: 'ui'
      },
      contactNames: []
    },
    knowledge: {
      source: 'knowledge',
      state: 'ready',
      indexedMessageCount: allFixtureMessages.length,
      indexedChunkCount: 1,
      totalMessages: allFixtureMessages.length,
      voiceCoverage: {
        voiceMessageCount: 1,
        transcribedVoiceCount: 1,
        failedVoiceCount: 0,
        voiceCoverageComplete: true
      }
    },
    candidateEvidenceCount: 1,
    retrieval: {
      intent: 'general',
      timeRange: {
        startTime: Math.floor(Date.now() / 1000) - 30 * 86400,
        endTime: Math.floor(Date.now() / 1000),
        label: '近 30 天',
        reason: 'E2E fixture',
        source: 'ui'
      },
      retrievalMode: 'global_fts',
      candidateCount: 1,
      uniqueCandidateCount: 1,
      sourceMessageCount: allFixtureMessages.length,
      sourceCoverage: 'complete',
      isComplete: true,
      fallbackUsed: false,
      suspicious: false
    },
    evidence,
    contextEvidenceCount: 1,
    aggregation: {
      messageCount: 1,
      peopleCount: 1,
      conversationCount: 1,
      people: [],
      conversations: []
    },
    agent: { mode: 'fallback', toolCalls: 0, trace: [], fallbackReason: 'E2E fixture' },
    citationValidation: { status: 'valid', invalidCitationIds: [] },
    timings: emptyTimings(),
    answer: failure ? undefined : '固定假回答：测试数据中的核心流程正常。',
    ai: {
      providerName: '本地假服务',
      modelName: '固定响应模型',
      inputTokens: 10,
      inputTokensEstimated: false
    },
    error: failure ? `本地假服务错误 ${failure}` : undefined,
    errorStage: failure ? 'ai_generating' : undefined,
    elapsedMs: 1
  }
}
const reportJson = JSON.stringify({
  overview: '固定脱敏日报',
  hero: {
    headline: '产品测试群日报',
    summary: '测试消息已完成自动整理。',
    keyTakeaway: '核心流程可用',
    pendingNote: '',
    statusLine: '今日形成 1 个结论'
  },
  topics: [
    {
      title: '自动化测试',
      timeRange: '10:00-10:02',
      heat: '中',
      participants: ['测试成员'],
      summary: '讨论了脱敏自动化测试。',
      conclusions: [{ text: '核心流程可用', sourceMessageIds: ['msg-text'] }],
      keywords: ['测试'],
      sourceMessageIds: ['msg-text']
    }
  ],
  resources: [],
  importantMessages: [],
  quotes: [],
  qa: [],
  todos: [],
  unresolved: [],
  storylines: [],
  reversals: [],
  participantChains: [],
  keywords: ['测试']
})

let connected = process.env.WXE_E2E_MODE !== 'disconnected'
let savedKey = connected ? VALID_KEY : ''
let settings = {
  dbRoot: 'fixture-account',
  apiEnabled: false,
  apiHost: '127.0.0.1',
  apiPort: 5031,
  imageKeyRoot: 'fixture-account',
  ffmpegPath: '',
  recallProtectionEnabled: false,
  debugEnabled: false,
  autoLogin: connected,
  autoLoginPreferenceSet: true,
  appearanceTheme: process.env.WXE_E2E_APPEARANCE_THEME || 'light',
  compactMode: false,
  showStartupProgress: false,
  imageXorKey: '0x40',
  imageAesKey: '0123456789abcdef'
}

const extraContacts = Number(process.env.WXE_E2E_LARGE_CONTACTS || 0)
const contacts = [...fixture.contacts]
for (let index = 0; index < extraContacts; index += 1) {
  contacts.push({
    m_nsUsrName: `fixture_${index}`,
    m_nsNickName: `性能样本 ${index}`,
    md5: `fixture-contact-${index}`,
    type: index % 5 === 0 ? 'group' : 'user'
  })
}

const handlers = new Map()
const handle = (channel, fn) => {
  handlers.set(channel, fn)
  ipcMain.handle(channel, async (event, ...args) => fn(...args))
}

const startupCache = () => ({
  self: fixture.self,
  contacts,
  updatedAt: Date.now()
})

handle('settings:get', () => ({
  settings: { ...settings },
  settingsPath: path.join(userData, 'settings.json')
}))
handle('settings:set', (patch) => {
  settings = { ...settings, ...patch, appearanceTheme: 'light' }
  return { settings, settingsPath: path.join(userData, 'settings.json') }
})
handle('tts:getSettings', () => ({
  success: true,
  settings: {
    provider: 'fish-audio',
    hasApiKey: false,
    hasStoredApiKey: false,
    hasEnvironmentApiKey: false,
    keySource: 'missing',
    encryptionAvailable: true,
    selectedVoiceId: '',
    outputFormat: 'mp3',
    model: 's2.1-pro-free',
    phase: 'ready'
  },
  voices: []
}))
handle('wechat-personal:getRuntimeStatus', () => ({
  version: 'v0.0.18',
  state: 'ready',
  downloadedBytes: 100,
  totalBytes: 100,
  progress: 1,
  platform: 'darwin',
  architecture: 'arm64',
  supported: true,
  removable: true
}))
handle('wechat-personal:getStatus', () => ({
  state: 'online',
  platform: 'darwin',
  arch: 'arm64',
  sipDisabled: true,
  wechatRunning: true,
  wechatPid: 4668,
  boundWechatPid: 4668,
  oneBotPid: 5401,
  endpoint: '127.0.0.1:58080',
  endpointReady: true,
  wechatVersion: '4.1.11.53',
  runtimeReady: true,
  attachReady: true,
  baseAddress: '0x114ef8000',
  baseAddressReady: true,
  textHookInstalled: true,
  textHookReady: true,
  imageHookInstalled: true,
  imageHookReady: true,
  messageListenerReady: true,
  canSend: true,
  canSendText: true,
  canSendImage: true,
  canSendVoice: true,
  message: '个人微信已绑定'
}))
handle('wechat-share:getConfig', () => ({
  success: true,
  configured: true,
  serviceUrl: 'https://share.example.test'
}))
handle('key:getSavedDbKey', () => ({
  success: true,
  key: savedKey || undefined,
  saved: Boolean(savedKey),
  encryptionAvailable: true
}))
handle('key:saveDbKey', (_accountRoot, key) => {
  savedKey = String(key || '')
  return { success: true, key: savedKey, saved: true, encryptionAvailable: true }
})
handle('key:clearSavedDbKey', () => {
  savedKey = ''
  return { success: true }
})
handle('key:getEnvironment', () => ({
  platform: process.platform,
  osVersion: process.platform === 'win32' ? 'Windows fixture' : 'macOS fixture',
  appVersion: 'v2.2.0',
  wechatVersion: '4.1.9.57',
  dataStructureVersion: settings.dbRoot === 'fixture-account' ? '微信 4.x（WCDB）' : '未检测到',
  dataDirectoryDetected: settings.dbRoot === 'fixture-account',
  diagnosticSummary: 'TraceMemo: v2.2.0\n数据目录: 已检测到',
  autoDetectSupported: true,
  wechatRunning: true,
  accountIdentified: connected,
  dbConnected: connected,
  encryptionAvailable: true
}))
handle('key:readClipboardDbKey', () => ({ success: true, value: VALID_KEY }))
handle('key:pasteAndSaveDbKey', () => ({ success: true, key: VALID_KEY }))
handle('key:autoGetDbKey', () => ({ success: true, key: VALID_KEY, saved: false }))
handle('key:autoGetImageKey', () => ({
  success: true,
  xorKey: 64,
  aesKey: '0123456789abcdef',
  verified: true
}))

handle('db:init', (key, accountRoot) => {
  if (settings.dbRoot === 'Z:\\missing-wechat-data') {
    connected = false
    return {
      success: false,
      code: 'ROOT_UNAVAILABLE',
      error: '微信数据目录不存在，请重新选择目录',
      monitoring: false
    }
  }
  if (key !== VALID_KEY) {
    connected = false
    return { success: false, error: '数据库密钥无效', monitoring: false }
  }
  connected = true
  settings.dbRoot = accountRoot || settings.dbRoot
  return { success: true, monitoring: true }
})
handle('db:testConnection', (key) =>
  key === VALID_KEY
    ? { success: true, wxid: fixture.self.wxid, accountRoot: fixture.self.accountRoot }
    : { success: false, code: 'DATABASE_OPEN_FAILED', error: '数据库密钥无效' }
)
handle('db:disconnect', () => {
  connected = false
  return { success: true }
})
handle('db:getStartupCache', () =>
  process.env.WXE_E2E_CORRUPT_CACHE === '1' ? null : startupCache()
)
handle('db:getBootstrapCache', () =>
  process.env.WXE_E2E_CORRUPT_CACHE === '1' ? null : startupCache()
)
handle('db:getContacts', (filter) => {
  const query = String(filter || '').toLowerCase()
  return query
    ? contacts.filter((contact) => contact.m_nsNickName.toLowerCase().includes(query))
    : contacts
})
handle('db:getContactAvatars', (usernames) =>
  Object.fromEntries(
    contacts
      .filter((contact) => usernames.includes(contact.m_nsUsrName) && contact.avatar)
      .map((contact) => [contact.m_nsUsrName, contact.avatar])
  )
)
handle('settings:getSelf', () => ({ ready: true, info: fixture.self }))
handle('db:getCachedMessages', (md5) => fixture.messages[md5] || [])
handle('db:getCachedMessagePage', (md5) => ({
  hit: true,
  messages: fixture.messages[md5] || [],
  groupSnapshot: null
}))
handle('db:getMessages', (md5, startTime, endTime, options) => {
  let messages = fixture.messages[md5] || []
  if (startTime) messages = messages.filter((message) => (message.createTime || 0) >= startTime)
  if (endTime) messages = messages.filter((message) => (message.createTime || 0) <= endTime)
  if (options && options.limit) messages = messages.slice(-options.limit)
  return messages
})
handle('db:getGroupSnapshot', (md5) =>
  md5.startsWith('group-')
    ? {
        roomId: md5,
        memberCount: 1,
        members: [
          {
            wxid: 'wxid_fixture_member',
            nickname: '测试成员',
            groupNickname: '测试成员',
            wechatNickname: '测试成员',
            remark: '',
            avatar: ''
          }
        ]
      }
    : null
)
handle('db:getImage', (md5, datName, sessionId, options) =>
  !imageKeyConfigured
    ? { success: false, error: '未配置图片解密密钥' }
    : md5 === 'unsupported'
      ? { success: false, error: '不支持的 DAT 版本' }
      : {
          success: true,
          data: imageData,
          isThumb: !options?.force,
          filePath: path.join(userData, options?.force ? 'original.png' : 'thumbnail.png')
        }
)
handle('db:getVoiceData', () => ({ success: true, data: voiceData }))
const voiceModelStatus = (state = 'missing') => ({
  modelId: 'sensevoice-small-int8',
  version: '2024-07-17',
  state,
  downloadedBytes: state === 'ready' ? 239549735 : 0,
  totalBytes: 239549735,
  progress: state === 'ready' ? 1 : 0,
  platform: process.platform,
  architecture: process.arch,
  supported: process.platform === 'win32' || process.platform === 'darwin'
})
handle('voice:getModelStatus', () => voiceModelStatus())
handle('voice:downloadModel', () => ({ success: true, status: voiceModelStatus('ready') }))
handle('voice:cancelModelDownload', () => ({ success: true }))
handle('voice:removeModel', () => voiceModelStatus())
handle('voice:openModelDirectory', () => ({ success: true }))
handle('voice:getBatchProgress', () => ({
  accountIdentity: 'fixture-account',
  state: 'idle',
  total: 0,
  processed: 0,
  cached: 0,
  succeeded: 0,
  failed: 0,
  elapsedMs: 0,
  estimatedRemainingMs: null
}))
handle('voice:getBatchConversationSummaries', (request) =>
  request.conversationIds.map((conversationId, index) => ({
    conversationId,
    voiceMessageCount: index + 3
  }))
)
handle('voice:getBatchPreflight', (request) => ({
  accountIdentity: 'fixture-account',
  conversationCount: request.conversationIds.length,
  voiceMessageCount: request.conversationIds.length * 3,
  cachedCount: 0,
  pendingCount: request.conversationIds.length * 3,
  failedCount: 0,
  estimatedDurationMs: null,
  modelReady: false
}))
handle('voice:recognize', () => ({ success: true, transcript: '固定脱敏转写文本', language: 'zh' }))
handle('voice:cancelRecognition', () => ({ success: true }))
handle('db:getSticker', (url) =>
  String(url || '').includes('403')
    ? {
        success: false,
        error: '表情链接已失效或需要微信授权',
        failureCode: 'access_denied',
        httpStatus: 403
      }
    : { success: true, data: imageData }
)
handle('db:parseMessage', (content, messageType) =>
  messageType === 1
    ? { type: 'text', content: String(content) }
    : { type: 'unknown', raw: String(content), messageType }
)

handle('ai:getRuntimeConfig', () => ({
  providerId: 'fixture-provider',
  providerName: '本地假服务',
  model: 'fixture-model',
  modelName: '固定响应模型',
  configured: true,
  status: 'connected',
  timeoutMs: 5000
}))
handle('ai:getVisionRuntimeConfig', () => ({
  providerId: 'fixture-vision-provider',
  providerName: '本地图片假服务',
  model: 'fixture-vision-model',
  modelName: '固定图片识别模型',
  configured: true,
  status: 'connected',
  timeoutMs: 5000,
  source: 'vision-capability'
}))
handle('ai:listProviders', () => ({
  success: true,
  providers: [
    {
      id: 'fixture-provider',
      name: '本地假服务',
      type: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:1/v1',
      auth: { type: 'none' },
      models: [
        {
          id: 'fixture-model',
          name: '固定响应模型',
          capabilities: { chat: true, vision: false, ocr: false, longContext: true }
        },
        {
          id: 'fixture-vision-model',
          name: '固定图片识别模型',
          capabilities: { chat: true, vision: true, ocr: true, longContext: true }
        }
      ],
      defaultModel: 'fixture-model',
      advanced: { timeoutMs: 5000, extraHeaders: {} },
      hasApiKey: true,
      isDefault: true,
      status: 'connected'
    }
  ],
  defaultProviderId: 'fixture-provider'
}))
handle('ai:migrateLegacy', () => ({ success: true, providers: [] }))
handle('ai:chat', (messages) => {
  const failure = process.env.WXE_E2E_AI_FAILURE
  if (failure) return { success: false, error: `本地假服务错误 ${failure}` }
  const system = String(messages?.[0]?.content || '')
  if (system.includes('本地聊天检索规划器')) {
    return {
      success: true,
      data: '{"intent":"general","keywords":["测试"],"variants":[]}'
    }
  }
  if (system.includes('微信群聊日报编辑') || system.includes('JSON 格式修复器')) {
    return { success: true, data: reportJson, usage: { input: 10, output: 20, total: 30 } }
  }
  return { success: true, data: '固定假回答：测试数据中的核心流程正常。' }
})
handle('knowledge:getStatus', () => ({
  accountId: fixture.self.wxid,
  state: 'ready',
  indexedMessageCount: allFixtureMessages.length,
  indexedChunkCount: 1,
  sourceMessageCount: allFixtureMessages.length,
  processedMessages: allFixtureMessages.length,
  totalMessages: allFixtureMessages.length,
  estimatedRemainingMs: 0,
  databaseBytes: 1024,
  walBytes: 0,
  shmBytes: 0
}))
handle('knowledge:startIndex', () => ({ success: true }))
handle('knowledge:search', () => ({
  source: 'knowledge',
  state: 'ready',
  evidence: [],
  indexedMessageCount: allFixtureMessages.length,
  indexedChunkCount: 1,
  totalMessages: allFixtureMessages.length,
  timings: {
    workerIpcMs: 0,
    workerBootMs: 0,
    dispatchMs: 0,
    workerSqlMs: 0,
    responseTransferMs: 0,
    responseSerializeMs: 0,
    ftsMs: 0,
    messageLoadMs: 0,
    chunkExpandMs: 0,
    rankingMs: 0,
    totalMs: 0
  }
}))
handle('ai-search:getProviderStatus', () => ({ configured: true, requiresConsent: false }))
handle('ai-search:authorizeExternalProvider', () => ({ success: true }))
handle('ai-search:run', (request) => aiSearchResult(request))
handle('ai-search:cancel', () => ({ cancelled: true }))

handle('report:export', () => {
  const htmlPath = path.join(userData, 'fixture-report.html')
  const pngPath = path.join(userData, 'fixture-report.png')
  fs.writeFileSync(htmlPath, '<!doctype html><h1>固定脱敏日报</h1>', 'utf8')
  fs.writeFileSync(pngPath, Buffer.from(imageData.split(',')[1], 'base64'))
  return { success: true, imageDataUrl: imageData, htmlPath, pngPath }
})
handle('report:exportSnapshot', () => {
  const htmlPath = path.join(userData, 'fixture-report-snapshot.html')
  const pngPath = path.join(userData, 'fixture-report-snapshot.png')
  fs.writeFileSync(htmlPath, '<!doctype html><h1>固定脱敏模板快照日报</h1>', 'utf8')
  fs.writeFileSync(pngPath, Buffer.from(imageData.split(',')[1], 'base64'))
  return { success: true, imageDataUrl: imageData, htmlPath, pngPath }
})
handle('report:prepareTemplateSwitch', () => ({
  success: true,
  snapshot: {
    groupName: '固定脱敏群',
    reportDate: '2026-08-12',
    values: { REPORT_TITLE: '固定脱敏群日报' }
  }
}))
handle('report:listGenerated', () => ({ success: true, reports: [] }))
handle('report:saveGenerated', (request) => ({
  success: true,
  record: { id: 'fixture-report-record', ...request }
}))
handle('report:updateGeneratedTemplate', (request) => ({
  success: true,
  record: { id: request.reportId, templateId: request.templateId }
}))
handle('report:deleteGenerated', () => ({ success: true }))
handle('report:reveal', () => ({ success: true }))
handle('copy-image', () => ({ success: true }))
handle('api:copyText', () => ({ success: true }))
handle('app-log:write', (entry) => {
  const safe = JSON.stringify(entry)
    .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, '***')
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, '***')
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true })
  fs.appendFileSync(path.join(userData, 'logs', 'e2e.log'), `${safe}\n`, 'utf8')
})
handle('app-log:getPath', () => path.join(userData, 'logs', 'e2e.log'))
handle('app-log:reveal', () => undefined)
const cacheSummary = () => ({
  items: [
    {
      id: 'bootstrap',
      label: '启动缓存',
      description: '联系人和会话的本地启动快照',
      sizeBytes: 4096,
      fileCount: 2
    },
    {
      id: 'electron',
      label: '界面缓存',
      description: 'Electron 页面资源和网络缓存',
      sizeBytes: 2 * 1024 * 1024,
      fileCount: 12
    },
    {
      id: 'knowledge',
      label: '本地知识库索引',
      description: '问问微信使用的本地检索索引',
      sizeBytes: 12 * 1024 * 1024,
      fileCount: 8
    }
  ],
  totalBytes: 14 * 1024 * 1024 + 4096,
  updatedAt: fixtureNowMs
})
handle('cache:getSummary', cacheSummary)
handle('cache:clear', cacheSummary)
handle('api:getStatus', () => ({ running: false, host: settings.apiHost, port: settings.apiPort }))
handle('api:tokenStatus', () => ({
  success: true,
  available: true,
  hasToken: true,
  maskedToken: '••••••••••••••••'
}))
handle('api:revealToken', () => ({
  available: true,
  hasToken: true,
  maskedToken: '••••••••••••••••',
  token: 'fixture-api-token'
}))
handle('api:copyToken', () => ({
  success: true,
  available: true,
  hasToken: true,
  maskedToken: '••••••••••••••••'
}))
handle('api:rotateToken', () => ({
  success: true,
  available: true,
  hasToken: true,
  maskedToken: '••••••••••••••••'
}))
handle('api:copyCurl', () => ({ success: true }))
handle('api:skillStatus', () => ({
  available: true,
  version: 'v1.2',
  filePath: '/fixture/tracememo-reader/SKILL.md',
  directoryPath: '/fixture/tracememo-reader',
  source: 'development',
  githubUrl: 'https://example.test/tracememo-reader'
}))
handle('api:readSkill', () => ({
  success: true,
  content:
    '# TraceMemo Reader\n\n## 能力\n- 读取本地聊天记录\n- 导出群聊日报\n\n仅在用户授权后访问。'
}))
handle('api:start', () => ({ running: true, host: settings.apiHost, port: settings.apiPort }))
handle('api:stop', () => ({ running: false, host: settings.apiHost, port: settings.apiPort }))
handle('api:toggle', (enabled) => ({
  running: enabled,
  host: settings.apiHost,
  port: settings.apiPort
}))
const agentHubStatus = () => ({
  hub: 'offline',
  connector: 'disconnected',
  updatedAt: fixtureNowMs,
  dataApi: 'online',
  databaseReady: true
})
handle('agent-hub:getStatus', agentHubStatus)
handle('agent-hub:getLogs', () => [])
handle('agent-hub:clearLogs', () => ({ success: true }))
handle('agent-hub:getPromptSettings', () => ({ customInstructions: '', maxLength: 4000 }))
handle('agent-hub:savePromptSettings', (customInstructions) => ({
  success: true,
  settings: { customInstructions: String(customInstructions || '').trim(), maxLength: 4000 }
}))
handle('agent-hub:askLocal', (request) => ({
  success: true,
  answer: `测试 AI 已读取“${request.groupName}”：${request.question}`,
  toolCallCount: 1,
  bundle: request.topicQuery
    ? {
        id: 'fixture-topic',
        query: request.topicQuery,
        groupName: request.groupName,
        createdAt: fixtureNowMs,
        scannedCount: 12,
        complete: true,
        warnings: ['合成测试数据，未读取真实微信'],
        review: 'verified',
        evidence: [
          {
            id: 'E1',
            messageId: 'fixture-1',
            sender: '测试成员',
            timestamp: request.topicQuery.startTime,
            text: 'craft 项目原定周五上线，因支付问题改为周六。',
            type: '文本',
            reason: '关键词',
            selected: true
          }
        ],
        claims: [{ kind: '决定', text: '上线推迟到周六。', evidenceIds: ['E1'] }]
      }
    : undefined
}))

let topicSubscriptions = []
let topicRuns = []

const topicFixturePackage = (query) => {
  const isAiFailed = process.env.WXE_E2E_TOPIC_AI_FAILED === '1'
  const isUnavailable = process.env.WXE_E2E_TOPIC_DATA_UNAVAILABLE === '1'
  const isDependencyError =
    process.env.WXE_E2E_TOPIC_DEPENDENCY_ERROR === '1' || query.topic === 'error'
  const isEmpty = process.env.WXE_E2E_TOPIC_EMPTY === '1' || query.topic === 'empty'

  if (isDependencyError) {
    return {
      success: false,
      error: {
        code: 'DEPENDENCY_FAILED',
        message: '本地话题生成服务响应超时，请检查服务状态后重试。',
        retryable: true
      }
    }
  }

  if (isUnavailable) {
    return {
      success: false,
      error: {
        code: 'DATA_UNAVAILABLE',
        message: '当前账号无法读取此群聊，请检查数据库连接。',
        retryable: true
      }
    }
  }

  const timestamp = topicFixtureTime

  if (isEmpty) {
    const emptyBundle = {
      id: 'fixture-topic-package-empty',
      query,
      groupName: '产品测试群',
      createdAt: Math.floor(fixtureNowMs / 1000),
      claims: [],
      evidence: [],
      scannedCount: 0,
      complete: true,
      warnings: ['指定时间范围内未找到相关消息'],
      review: 'verified'
    }
    return {
      success: true,
      bundle: emptyBundle,
      package: {
        topicId: emptyBundle.id,
        topic: query.topic,
        groupId: query.groupId,
        groupName: emptyBundle.groupName,
        createdAt: emptyBundle.createdAt,
        dateRange: {
          start: query.startTime,
          end: query.endTime,
          timezone: query.timezone,
          inclusive: true
        },
        summary: {
          title: query.topic,
          abstract: '',
          category: undefined,
          tags: [],
          evidenceCount: 0,
          claims: []
        },
        evidences: [],
        relatedTopics: [],
        capabilities: { relatedTopics: false, categories: false, tags: false },
        review: emptyBundle.review,
        scannedCount: 0,
        complete: true,
        warnings: emptyBundle.warnings,
        notices: []
      },
      fromCache: false
    }
  }

  let bundleEvidence = [
    {
      id: 'E1',
      messageId: 'fixture-1',
      sender: '测试成员',
      timestamp,
      text: 'craft 项目原定周五上线，因支付问题改为周六。',
      type: '文本',
      reason: '关键词匹配',
      selected: true
    },
    {
      id: 'E2',
      messageId: 'fixture-2',
      sender: '阿杰',
      timestamp: timestamp + 60,
      text: '我最近在用 Craft，感觉界面很干净，写文档很舒服。',
      type: '文本',
      reason: '工具体验分享',
      selected: true
    }
  ]

  let packageEvidences = [
    {
      id: 'E1',
      senderId: 'wxid_fixture_member',
      senderName: '测试成员',
      sentAt: timestamp,
      excerpt: 'craft 项目原定周五上线，因支付问题改为周六。',
      selected: true,
      reason: '关键词匹配',
      sourceLocator: { groupId: query.groupId, messageId: 'fixture-1', timestamp }
    },
    {
      id: 'E2',
      senderId: 'wxid_ajie',
      senderName: '阿杰',
      sentAt: timestamp + 60,
      excerpt: '我最近在用 Craft，感觉界面很干净，写文档很舒服。',
      selected: true,
      reason: '工具体验分享',
      sourceLocator: { groupId: query.groupId, messageId: 'fixture-2', timestamp: timestamp + 60 }
    }
  ]

  if (query.topic === 'duplicate') {
    bundleEvidence = [
      {
        id: 'E1',
        messageId: 'fixture-dup-2',
        sender: '测试成员',
        timestamp: fixtureBaseNowSec - 4000,
        text: '同秒第 2 条消息（精准定位目标）',
        type: '文本',
        reason: '同秒消息测试',
        selected: true
      }
    ]
    packageEvidences = [
      {
        id: 'E1',
        senderId: 'wxid_fixture_member',
        senderName: '测试成员',
        sentAt: fixtureBaseNowSec - 4000,
        excerpt: '同秒第 2 条消息（精准定位目标）',
        selected: true,
        reason: '同秒消息测试',
        sourceLocator: {
          groupId: query.groupId,
          messageId: 'fixture-dup-2',
          timestamp: fixtureBaseNowSec - 4000
        }
      }
    ]
  } else if (query.topic === 'historical') {
    bundleEvidence = [
      {
        id: 'E1',
        messageId: 'fixture-historical-1',
        sender: '测试成员',
        timestamp: fixtureBaseNowSec - 86400 * 30,
        text: '这是一条远古历史消息',
        type: '文本',
        reason: '远古消息测试',
        selected: true
      }
    ]
    packageEvidences = [
      {
        id: 'E1',
        senderId: 'wxid_fixture_member',
        senderName: '测试成员',
        sentAt: fixtureBaseNowSec - 86400 * 30,
        excerpt: '这是一条远古历史消息',
        selected: true,
        reason: '远古消息测试',
        sourceLocator: {
          groupId: query.groupId,
          messageId: 'fixture-historical-1',
          timestamp: fixtureBaseNowSec - 86400 * 30
        }
      }
    ]
  } else if (query.topic === 'missing') {
    bundleEvidence = [
      {
        id: 'E1',
        messageId: 'missing',
        sender: '测试成员',
        timestamp,
        text: '这条消息在本地数据库已不存在',
        type: '文本',
        reason: '缺失消息测试',
        selected: true
      }
    ]
    packageEvidences = [
      {
        id: 'E1',
        senderId: 'wxid_fixture_member',
        senderName: '测试成员',
        sentAt: timestamp,
        excerpt: '这条消息在本地数据库已不存在',
        selected: true,
        reason: '缺失消息测试',
        sourceLocator: { groupId: query.groupId, messageId: 'missing', timestamp }
      }
    ]
  }

  const requestedEvidenceCount = Math.min(
    300,
    Math.max(0, Number(process.env.WXE_E2E_TOPIC_EVIDENCE_COUNT) || 0)
  )
  if (query.topic === 'craft' && requestedEvidenceCount > 2) {
    for (let index = 3; index <= requestedEvidenceCount; index += 1) {
      const id = `E${index}`
      bundleEvidence.push({ ...bundleEvidence[1], id })
      packageEvidences.push({ ...packageEvidences[1], id })
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const bundle = {
    id: `fixture-topic-package-${query.topic || 'default'}-${Date.now()}`,
    query,
    groupName: '产品测试群',
    createdAt: nowSeconds,
    claims: isAiFailed ? [] : [{ kind: '决定', text: '上线推迟到周六。', evidenceIds: ['E1'] }],
    evidence: bundleEvidence,
    scannedCount: 12,
    complete: true,
    warnings: ['合成测试数据，未读取真实微信'],
    review: isAiFailed ? 'unavailable' : 'verified'
  }
  return {
    success: true,
    bundle,
    package: {
      topicId: bundle.id,
      topic: query.topic,
      groupId: query.groupId,
      groupName: bundle.groupName,
      createdAt: bundle.createdAt,
      dateRange: {
        start: query.startTime,
        end: query.endTime,
        timezone: query.timezone,
        inclusive: true
      },
      summary: {
        title: query.topic,
        abstract: isAiFailed ? '' : '上线推迟到周六。',
        category: undefined,
        tags: [],
        evidenceCount: bundleEvidence.length,
        claims: bundle.claims
      },
      evidences: packageEvidences,
      relatedTopics: [],
      capabilities: { relatedTopics: false, categories: false, tags: false },
      review: bundle.review,
      scannedCount: 12,
      complete: true,
      warnings: bundle.warnings,
      notices: isAiFailed
        ? [
            {
              code: 'AI_FAILED',
              message: '摘要尚未通过 AI 核对，以下仅为候选原文。',
              retryable: true
            }
          ]
        : []
    },
    fromCache: false
  }
}

handle('topic:generatePackage', (request) => topicFixturePackage(request.query))
handle('topic:locateSource', (locator) => {
  if (locator.messageId === 'missing') {
    return {
      success: false,
      error: { code: 'SOURCE_NOT_FOUND', message: '本机未找到这条原始消息。', retryable: false }
    }
  }
  if (locator.messageId === 'fixture-dup-2') {
    return {
      success: true,
      message: {
        id: 'fixture-dup-2',
        groupId: locator.groupId,
        senderId: 'wxid_fixture_member',
        senderName: '测试成员',
        sentAt: Math.floor(fixtureNowMs / 1000) - 4000,
        content: '同秒第 2 条消息（精准定位目标）',
        type: '文本'
      }
    }
  }
  if (locator.messageId === 'fixture-historical-1') {
    return {
      success: true,
      message: {
        id: 'fixture-historical-1',
        groupId: locator.groupId,
        senderId: 'wxid_fixture_member',
        senderName: '测试成员',
        sentAt: Math.floor(fixtureNowMs / 1000) - 86400 * 30,
        content: '这是一条远古历史消息',
        type: '文本'
      }
    }
  }
  if (locator.messageId === 'fixture-sys-historical') {
    return {
      success: true,
      message: {
        id: 'fixture-sys-historical',
        groupId: locator.groupId,
        senderId: 'system',
        senderName: '系统',
        sentAt: Math.floor(fixtureNowMs / 1000) - 86400 * 10,
        content: '远古系统消息：群名称已更改',
        type: '系统消息'
      }
    }
  }
  if (locator.messageId === 'fixture-2') {
    return {
      success: true,
      message: {
        id: 'fixture-2',
        groupId: locator.groupId,
        senderId: 'wxid_ajie',
        senderName: '阿杰',
        sentAt: locator.timestamp || Math.floor(fixtureNowMs / 1000) - 3540,
        content:
          '我最近在用 Craft，感觉界面很干净，写文档很舒服。页面之间的关联做得不错，适合整理一些长期的知识内容。',
        type: '文本'
      }
    }
  }
  return {
    success: true,
    message: {
      id: locator.messageId || 'fixture-1',
      groupId: locator.groupId,
      senderId: 'wxid_fixture_member',
      senderName: '测试成员',
      sentAt: locator.timestamp || Math.floor(fixtureNowMs / 1000) - 3600,
      content: 'craft 项目原定周五上线，因支付问题改为周六。（真实数据库原文）',
      type: '文本'
    }
  }
})
handle('topic:center', () => ({
  subscriptions: topicSubscriptions,
  runs: topicRuns,
  nativeForward: { supported: false, reason: '当前连接器不支持原生合并转发，投递已阻塞。' }
}))
handle('topic:saveSubscription', (input) => {
  const id = input.id || `sub_${Date.now()}`
  const sub = { ...input, id, createdAt: Math.floor(fixtureNowMs / 1000) }
  topicSubscriptions = [sub, ...topicSubscriptions.filter((s) => s.id !== id)]
  return {
    subscriptions: topicSubscriptions,
    runs: topicRuns,
    nativeForward: { supported: false, reason: '当前连接器不支持原生合并转发，投递已阻塞。' }
  }
})
handle('topic:runSubscription', (id) => {
  topicRuns.push({
    id: `run_${Date.now()}`,
    subscriptionId: id,
    status: 'failed',
    startedAt: Math.floor(fixtureNowMs / 1000),
    message: '投递未启用真实微信'
  })
  return {
    subscriptions: topicSubscriptions,
    runs: topicRuns,
    nativeForward: { supported: false, reason: '当前连接器不支持原生合并转发，投递已阻塞。' }
  }
})
handle('agent-hub:startLogin', () => ({ status: agentHubStatus() }))
handle('agent-hub:cancelLogin', () => ({ status: agentHubStatus() }))
handle('agent-hub:disconnect', () => ({ status: agentHubStatus() }))
handle('image:getConfig', () => ({
  success: true,
  configured: imageKeyConfigured,
  saved: imageKeyConfigured,
  encryptionAvailable: true,
  source: 'secure-storage',
  resourceRoot: settings.imageKeyRoot,
  xorKey: settings.imageXorKey,
  aesKey: settings.imageAesKey
}))
handle('image:saveConfig', (request) => {
  imageKeyConfigured = true
  return {
    success: true,
    configured: true,
    saved: true,
    encryptionAvailable: true,
    source: 'secure-storage',
    ...request
  }
})
handle('image:testConfig', () => ({
  success: true,
  fileFound: true,
  decrypted: true,
  readable: true,
  diagnosticLog: 'TraceMemo 图片解析测试日志（已脱敏）\n测试结果：成功（SUCCESS）'
}))
handle('image:clearConfig', () => {
  imageKeyConfigured = false
  return { success: true }
})
handle('image:getDecoderStatus', () => ({
  installed: true,
  available: true,
  source: 'system',
  selected: false
}))
handle('image:getStatus', () => ({
  configured: imageKeyConfigured,
  saved: imageKeyConfigured,
  encryptionAvailable: true,
  source: 'secure-storage',
  resourceRoot: settings.imageKeyRoot,
  platform: process.platform,
  autoDetectSupported: true,
  wechatRunning: true,
  accountIdentified: true,
  cacheState: 'normal',
  decoder: { installed: true, available: true, source: 'system', selected: false },
  resources: Object.fromEntries(
    ['imageIndex', 'imageDirectory', 'thumbnail', 'original', 'sticker', 'video'].map((name) => [
      name,
      { state: 'available', detail: 'fixture' }
    ])
  )
}))
handle('settings:selectDbRoot', () => ({ canceled: false, path: 'fixture-account' }))
handle('accounts:discover', (inputPath) =>
  inputPath === 'Z:\\missing-wechat-data'
    ? { success: false, accounts: [], error: '微信数据目录不存在，请重新选择目录' }
    : {
        success: true,
        inputKind: 'account',
        preselectedAccountId: 'fixture-account-id',
        accounts: [
          {
            id: 'fixture-account-id',
            accountRoot: inputPath || 'fixture-account',
            directoryName: 'fixture-account',
            wxid: fixture.self.wxid,
            nickname: fixture.self.nickname,
            avatar: fixture.self.avatar,
            hasSavedDbKey: Boolean(savedKey),
            loginStatus: connected ? 'current' : 'unknown',
            selectedByInput: true
          }
        ]
      }
)
let appUpdateState = updateSimulation
  ? {
      status: 'available',
      currentVersion: '1.9.0',
      delivery: 'automatic',
      version: '2.0.0',
      source: 'startup',
      isSimulation: true
    }
  : unsignedMacUpdate
    ? {
        status: 'available',
        currentVersion: '2.2.2',
        delivery: 'release-page',
        version: '2.2.3',
        source: 'startup'
      }
    : { status: 'idle', currentVersion: '2.2.0', delivery: 'automatic' }
let openedUpdateDownloadUrl = ''
handle('app-update:getState', () => appUpdateState)
handle('app-update:openDownloadPage', () => {
  openedUpdateDownloadUrl = 'https://github.com/Bluuok/TraceDigest/releases/latest'
  return { success: true }
})
handle('app-update:getOpenedDownloadUrl', () => openedUpdateDownloadUrl)
handle('app-update:download', async () => {
  if (!updateSimulation) return { success: true, state: appUpdateState }
  const total = 60 * 1024 * 1024
  const steps = [0, 5, 12, 21, 33, 46, 58, 69, 78, 86, 93, 97, 100]
  let previousTransferred = 0
  appUpdateState = {
    ...appUpdateState,
    status: 'downloading',
    percent: 0,
    transferred: 0,
    total,
    bytesPerSecond: 0
  }
  for (const percent of steps.slice(1)) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const transferred = Math.round((total * percent) / 100)
    const bytesPerSecond = Math.round((transferred - previousTransferred) / 0.15)
    previousTransferred = transferred
    appUpdateState = {
      ...appUpdateState,
      status: 'downloading',
      percent,
      transferred,
      total,
      bytesPerSecond
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('app-update:state', appUpdateState)
    }
  }
  appUpdateState = {
    ...appUpdateState,
    status: 'downloaded',
    percent: 100,
    transferred: total,
    total,
    bytesPerSecond: undefined
  }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('app-update:state', appUpdateState)
  }
  return { success: true, state: appUpdateState }
})
handle('app-update:install', async () =>
  updateSimulation
    ? {
        success: true,
        simulated: true,
        message: '开发模拟模式：更新安装动作已模拟，未实际退出应用。'
      }
    : { success: true }
)

for (const channel of [
  'export:start',
  'export:cancel',
  'export:reveal',
  'settings:openAccountRoot',
  'db:reopenWithRoot',
  'api:skillStatus',
  'api:readSkill',
  'api:revealSkill',
  'api:openSkillGithub',
  'api:testLocalRequest',
  'image:selectDecoder',
  'image:openDecoderDownload',
  'app-update:check',
  'agent-hub:clearLogs',
  'agent-hub:startLogin',
  'agent-hub:cancelLogin',
  'agent-hub:reconnect',
  'agent-hub:disconnect',
  'agent-hub:selectTestImage',
  'image:listCandidates',
  'image:analyze',
  'image:getInsight',
  'image:listInsights',
  'db:search',
  'db:getVideo'
]) {
  if (!handlers.has(channel))
    handle(channel, () => ({ success: true, candidates: [], insights: [] }))
}

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(root, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  window.once('ready-to-show', () => window.show())
  window.loadFile(path.join(root, 'out/renderer/index.html'))
})

app.on('window-all-closed', () => app.quit())
