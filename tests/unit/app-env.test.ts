import { describe, expect, it } from 'vitest'
import { readAppEnv } from '../../src/main/app-env'

describe('project environment compatibility', () => {
  it('gives the current prefix precedence even for an explicit disabled value', () => {
    expect(
      readAppEnv('DISABLE_GPU', { HANAJIAN_DISABLE_GPU: '0', TRACEDIGEST_DISABLE_GPU: '1' })
    ).toBe('0')
    expect(
      readAppEnv('DEBUG_IMAGE', { HANAJIAN_DEBUG_IMAGE: '', TRACEMEMO_DEBUG_IMAGE: '1' })
    ).toBe('')
  })
  it('retains installed and development legacy values when the new variable is absent', () => {
    expect(readAppEnv('DISABLE_GPU', { TRACEDIGEST_DISABLE_GPU: '1' })).toBe('1')
    expect(readAppEnv('UPDATE_SIMULATION', { TRACEMEMO_UPDATE_SIMULATION: 'true' })).toBe('true')
    expect(readAppEnv('DEBUG_IMAGE', { WECHATEXPLORER_DEBUG_IMAGE: '1' })).toBe('1')
    expect(readAppEnv('DEBUG_IMAGE', {})).toBeUndefined()
  })
})
