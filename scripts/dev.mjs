import { spawn } from 'node:child_process'
import process from 'node:process'

const node = process.execPath

const run = (name, args, env = {}) => {
  const child = spawn(node, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      process.exitCode = code
    }
  })
  return child
}

const api = run('api', ['node_modules/tsx/dist/cli.mjs', 'watch', 'api/server.ts'], { PORT: '3001' })
const web = run('web', ['node_modules/vite/bin/vite.js'])

const shutdown = () => {
  api.kill('SIGTERM')
  web.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
