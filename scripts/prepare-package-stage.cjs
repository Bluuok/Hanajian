/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const fs = require('node:fs')
const path = require('node:path')

function preparePackageStage(root = path.resolve(__dirname, '..')) {
  root = path.resolve(root)
  const artifacts = path.join(root, '.tmp-test-artifacts')
  const stage = path.join(artifacts, 'hanajian-package-stage')
  const marker = path.join(stage, '.hanajian-stage.json')
  if (path.dirname(stage) !== artifacts || !stage.startsWith(root + path.sep)) {
    throw new Error('Packaging stage escaped the project')
  }
  if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
    throw new Error('Build Hanajian before preparing the application package')
  }
  if (fs.existsSync(stage)) {
    if (fs.lstatSync(stage).isSymbolicLink() || !fs.existsSync(marker)) {
      throw new Error('Refusing to replace an unowned packaging directory')
    }
    const previous = JSON.parse(fs.readFileSync(marker, 'utf8'))
    if (previous.project !== root) throw new Error('Packaging stage owner mismatch')
    const modules = path.join(stage, 'node_modules')
    // Remove the junction itself before cleaning generated files; its target is the installed dependency tree.
    if (fs.existsSync(modules) && fs.lstatSync(modules).isSymbolicLink()) fs.unlinkSync(modules)
    fs.rmSync(stage, { recursive: true, force: true })
  }
  fs.mkdirSync(stage, { recursive: true })
  fs.writeFileSync(marker, JSON.stringify({ project: root, scope: 'compiled application' }) + '\n')
  for (const file of ['package.json', 'pnpm-lock.yaml', 'NOTICE.md']) {
    fs.copyFileSync(path.join(root, file), path.join(stage, file))
  }
  fs.cpSync(path.join(root, 'out'), path.join(stage, 'out'), { recursive: true })
  fs.mkdirSync(path.join(stage, 'docs'), { recursive: true })
  fs.cpSync(path.join(root, 'docs', 'third-party'), path.join(stage, 'docs', 'third-party'), {
    recursive: true
  })
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(stage, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  return stage
}

if (require.main === module) console.log(`Prepared application package: ${preparePackageStage()}`)
module.exports = { preparePackageStage }
