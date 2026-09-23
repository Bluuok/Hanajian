/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const localRuntimePath = path.resolve(__dirname, '..', '.go-runtime.json')

function resolveGoRuntime() {
  const localRuntime = fs.existsSync(localRuntimePath)
    ? JSON.parse(fs.readFileSync(localRuntimePath, 'utf8'))
    : {}
  const executable = process.env.TRACEDIGEST_GO_EXE || localRuntime.goExecutable || 'go'
  const goPath = process.env.GOPATH || localRuntime.goPath
  const env = { ...process.env }
  if (goPath) env.GOPATH = goPath
  try {
    execFileSync(executable, ['version'], { env, stdio: 'pipe' })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Go executable not found: ${executable}. Add Go to PATH, set TRACEDIGEST_GO_EXE, or configure .go-runtime.json.`
      )
    }
    throw error
  }
  return { executable, env }
}

module.exports = { resolveGoRuntime }
