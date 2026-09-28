const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, '.env.example')
const target = path.join(root, '.env')

if (!fs.existsSync(source) || fs.existsSync(target)) {
  process.exit(0)
}

fs.copyFileSync(source, target)
console.log('[ensure-env] created .env from .env.example')
