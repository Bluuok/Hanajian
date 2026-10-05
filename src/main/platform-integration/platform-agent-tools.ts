import type { AIToolCall, AIToolDefinition } from '../../shared/ai-provider'
import { platformIntegrationService } from './platform-integration-service'

export const PLATFORM_AGENT_READ_TOOLS: AIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'parse_platform_share',
      description:
        '统一解析抖音、小红书分享文案或作品链接，自动识别平台，获取对应公开作品的作者、文案、媒体类型和资源。只读，不保存文件、不操作微信；未知水印状态不得说成无水印。保存由用户在平台集成页面确认。',
      parameters: {
        type: 'object',
        properties: {
          share_text: { type: 'string', description: '完整分享文案或单个抖音/小红书作品链接' }
        },
        required: ['share_text'],
        additionalProperties: false
      }
    }
  }
]

export async function executePlatformAgentReadTool(
  call: AIToolCall
): Promise<Record<string, unknown>> {
  if (!['parse_platform_share', 'parse_douyin_share'].includes(call.function.name))
    return { success: false, error: '不支持的平台工具' }
  try {
    const args = JSON.parse(call.function.arguments || '{}')
    if (
      !args ||
      Array.isArray(args) ||
      typeof args.share_text !== 'string' ||
      Object.keys(args).some((key) => key !== 'share_text')
    ) {
      return { success: false, error: '参数必须是仅包含 share_text 文本的 JSON 对象' }
    }
    const result = await platformIntegrationService.parseShare(args.share_text)
    if (!result.success || !result.work) return { ...result }
    return {
      success: true,
      result_id: result.resultId,
      work: {
        ...result.work,
        title: result.work.title.slice(0, 4000),
        assets: result.work.assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          sourceField: asset.sourceField,
          watermark: asset.watermark,
          watermarkEvidence: asset.watermarkEvidence,
          previewUrl: asset.previewUrl
        }))
      },
      note: '以上是作品文案及资源信息，不是视频转录或图片识别结果。请勿声称已观看画面或已经保存文件。可在内容收藏中粘贴文案后预览与手动保存。'
    }
  } catch {
    return { success: false, error: '平台工具参数无效或解析失败' }
  }
}
