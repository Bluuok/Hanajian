/** Read the current project prefix, retaining installed/development configuration. */
export function readAppEnv(
  suffix: string,
  environment: NodeJS.ProcessEnv = process.env
): string | undefined {
  for (const prefix of ['HANAJIAN', 'TRACEDIGEST', 'TRACEMEMO', 'WECHATEXPLORER']) {
    const value = environment[`${prefix}_${suffix}`]
    if (value !== undefined) return value
  }
  return undefined
}
