/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { resolveGoRuntime } = require('./go-runtime.cjs')

const sourceDir = path.resolve(__dirname, '..', 'services', 'wechat-connector')
const goRuntime = resolveGoRuntime()

for (const command of ['test', 'vet']) {
  execFileSync(goRuntime.executable, [command, './...'], {
    cwd: sourceDir,
    env: goRuntime.env,
    stdio: 'inherit'
  })
}
