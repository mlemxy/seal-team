import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SealEvent, SealLive } from '../types'
import { TEAM_SECTION } from './brief'
import { afterEdit, clip, droppedIds, MEMORY_CHARS, MEMORY_DIR, PREFERENCES_CHARS } from './memory'

type Seal = { id: string; name: string; role: string; model: string }

// Mochi is the main session itself; the other twelve are the agent files in agents/.
const TEAM: readonly Seal[] = [
  { id: 'mochi', name: 'Mochi', role: 'Project Lead', model: 'session' },
  { id: 'nori', name: 'Nori', role: 'Product Manager', model: 'sonnet' },
  { id: 'scout', name: 'Scout', role: 'Researcher', model: 'sonnet' },
  { id: 'sprinkle', name: 'Sprinkle', role: 'Designer', model: 'sonnet' },
  { id: 'bolt', name: 'Bolt', role: 'Tech Lead', model: 'opus-5.5' },
  { id: 'tick', name: 'Tick', role: 'Tracker', model: 'haiku' },
  { id: 'pebble', name: 'Pebble', role: 'Engineer', model: 'sonnet' },
  { id: 'pip', name: 'Pip', role: 'Junior Engineer', model: 'haiku' },
  { id: 'krill', name: 'Krill', role: 'Data Engineer', model: 'sonnet' },
  { id: 'rivet', name: 'Rivet', role: 'Release Engineer', model: 'sonnet' },
  { id: 'squint', name: 'Squint', role: 'QA', model: 'sonnet' },
  { id: 'brick', name: 'Brick', role: 'Security', model: 'sonnet' },
  { id: 'quill', name: 'Quill', role: 'Reporter', model: 'haiku' },
]
const BY_ID = new Map(TEAM.map(s => [s.id, s]))
const AGENT_PREFIX = 'seal-team:'
const PANE = 'seals'
const MAX_EVENTS = 150

// The ceiling: no subagent runs above Claude Opus 5.5, or above high effort.
const CAP_MODEL = 'claude-opus-5-5'
const OVER_CAP_EFFORT = new Set(['xhigh', 'max'])

const seals = atom({ plugin: 'seal-team', key: 'seals' } as const, {})
const events = atom({ plugin: 'seal-team', key: 'events' } as const, [])
const agents = atom({ plugin: 'seal-team', key: 'agents' } as const, {})

/**
 * Whether a model name or id is above the cap: the Fable and Mythos tiers, and any Opus
 * other than 5.5. The bare `opus` alias counts too, since it follows whatever Opus is newest.
 */
function isOverCap(model: string | undefined): boolean {
  if (!model) return false
  const m = model.toLowerCase()
  if (m.includes('fable') || m.includes('mythos')) return true
  if (m.includes('opus')) return !m.startsWith('claude-opus-5-5')
  return false
}

// `claude-sonnet-5-5` -> `sonnet`, for the narrow panel column.
const shortModel = (model: string): string => model.replace(/^claude-/, '').replace(/[-.]\d.*$/, '')


const blank = (): SealLive => ({ status: 'idle', task: '', tool: '', target: '', model: '', fish: 0, since: 0, ask: '', tokens: 0 })

function sealOfType(subagentType: string): string | undefined {
  if (!subagentType.startsWith(AGENT_PREFIX)) return undefined
  const id = subagentType.slice(AGENT_PREFIX.length)
  return BY_ID.has(id) ? id : undefined
}

let cwdNow = ''

function short(text: string, max: number): string {
  const one = (text.trim().split('\n')[0] ?? '').replace(/\s+/g, ' ')
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

// What a tool is working on, with paths shown relative to the project.
function targetOf(e: Record<string, unknown>): string {
  for (const key of ['file_path', 'path', 'notebook_path', 'url', 'query', 'pattern', 'command', 'description']) {
    const v = e[key]
    if (typeof v === 'string' && v.trim() !== '') {
      if (key === 'command') return commandName(v)
      const rel = cwdNow !== '' && v.startsWith(cwdNow + '/') ? v.slice(cwdNow.length + 1) : v
      return short(rel, 80)
    }
  }
  return ''
}

// Only the program and its subcommand: the rest of a shell command can hold tokens or passwords.
function commandName(command: string): string {
  const words = command.trim().split(/\s+/).filter(w => !/[=:/'"$]/.test(w))
  return short(words.slice(0, 2).join(' '), 40)
}

// A turn the engine starts itself (a seal's report arriving) has markup, not words.
function turnTask(text: string): string {
  const t = text.trim()
  if (t === '') return 'Thinking'
  if (t.startsWith('<')) return "Reading a seal's report"
  return short(t, 120)
}

let writeQueued = false
let islandDir: string | undefined
let project = ''
let warnedSessionModel = false

async function setSeal($: EngineInterface, id: string, patch: Partial<SealLive>) {
  await update($, seals, m => ({ ...m, [id]: { ...blank(), ...(m[id] ?? {}), ...patch } }))
}

async function logEvent($: EngineInterface, seal: string, kind: SealEvent['kind'], text: string) {
  const t = await $.clock.now()
  await update($, events, list => [...list, { t, seal, kind, text }].slice(-MAX_EVENTS))
}

async function writeLive($: EngineInterface) {
  if (islandDir === undefined) return
  const live = { at: await $.clock.now(), project, seals: await read($, seals), events: await read($, events) }
  await $.fs.write(`${islandDir}/live.js`, `window.__onSealLive && window.__onSealLive(${JSON.stringify(live)});\n`)
}

// Which seal a loop belongs to: the main loop is Mochi, a subagent's loop the seal it was started as.
async function sealOfLoop($: EngineInterface, agentId: string | undefined): Promise<string | undefined> {
  if (agentId === undefined) return 'mochi'
  return (await read($, agents))[agentId]
}

async function refresh($: EngineInterface) {
  const m = await read($, seals)
  const waiting = TEAM.filter(s => m[s.id]?.status === 'waiting')
  const busy = TEAM.filter(s => m[s.id]?.status === 'working')
  const parts = [
    ...waiting.map(s => `${s.name} needs you`),
    ...busy.map(s => `${s.name}${m[s.id]?.tool ? ': ' + m[s.id]?.tool : ''}`),
  ]
  $.ui.status(parts.length === 0 ? undefined : '🦭 ' + parts.join(' · '))
  if (islandDir !== undefined && !writeQueued) {
    writeQueued = true
    $.clock.after(700, () => {
      writeQueued = false
      void writeLive($)
    })
  }
}

async function prepareIsland($: EngineInterface): Promise<string | undefined> {
  const home = await $.env.get('HOME')
  if (!home) return undefined
  // One island per project, so each repo you work in gets its own seals view.
  const cwd = await $.session.cwd()
  cwdNow = cwd
  project = cwd.split('/').filter(Boolean).pop() ?? 'home'
  const slug = project.replace(/[^A-Za-z0-9._-]/g, '-') || 'home'
  const dir = `${home}/.seal-team/islands/${slug}`
  const copy = async (file: string) => $.fs.write(`${dir}/${file}`, await $.fs.read(`${$.plugin.root}/island/${file}`))
  // The page changes between versions, so it is copied every session; the ~600 KB of three.js only once.
  // shortcut: a three.js upgrade won't reach existing islands, delete ~/.seal-team/islands when vendor/ changes.
  const vendor = ['vendor/three.min.js', 'vendor/OrbitControls.js', 'vendor/LICENSE-three.txt']
  const missing = await Promise.all(vendor.map(async f => ((await $.fs.exists(`${dir}/${f}`)) ? undefined : f)))
  await Promise.all(['index.html', ...missing.filter((f): f is string => f !== undefined)].map(copy))
  return dir
}

// Sharing the island with other devices on the same Wi-Fi: a small web server on this computer,
// behind a random path so only someone with the link can open it.
const SHARE_PORT = 8787

async function shareRoot($: EngineInterface): Promise<{ www: string; token: string } | undefined> {
  const home = await $.env.get('HOME')
  if (!home) return undefined
  let token = (await $.store.get('shareToken')) as string | undefined
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    await $.store.set('shareToken', token)
  }
  return { www: `${home}/.seal-team/www`, token }
}

async function shareIsland($: EngineInterface): Promise<string> {
  const root = await shareRoot($)
  const home = await $.env.get('HOME')
  if (!root || !home) return 'Could not find your home folder to share the island.'
  const { www, token } = root
  // A blank page at the top so the server never lists the secret folder.
  await $.fs.write(`${www}/index.html`, '<!doctype html><title>Nothing here</title>')
  await $.process.run(['ln', '-sfn', `${home}/.seal-team/islands`, `${www}/${token}`])
  const running = await $.process.run(['sh', '-c', `pgrep -f "http.server ${SHARE_PORT} --bind 0.0.0.0" >/dev/null`])
  if (running.exitCode !== 0) {
    const started = await $.process.run([
      'sh',
      '-c',
      `command -v python3 >/dev/null || exit 3; nohup python3 -m http.server ${SHARE_PORT} --bind 0.0.0.0 --directory "$1" >/dev/null 2>&1 &`,
      'sh',
      www,
    ])
    if (started.exitCode === 3) return 'Sharing needs python3, which this computer does not have. Install the Xcode command line tools (xcode-select --install) and try again.'
  }
  const host = (await $.process.run(['scutil', '--get', 'LocalHostName']).catch(() => ({ stdout: '' }))).stdout.trim()
  let ip = ''
  for (const iface of ['en0', 'en1']) {
    ip = (await $.process.run(['ipconfig', 'getifaddr', iface]).catch(() => ({ stdout: '' }))).stdout.trim()
    if (ip) break
  }
  // Tailscale joins this computer and your iPad privately, so the island opens from anywhere (work included).
  const tailscale = await $.process
    .run(['sh', '-c', 'T=$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale); "$T" ip -4 2>/dev/null | head -1'])
    .catch(() => ({ stdout: '' }))
  const tsIp = tailscale.stdout.trim()
  const path = `/${token}/${islandDir?.split('/').pop() ?? ''}/`
  const links = [host ? `http://${host}.local:${SHARE_PORT}${path}` : '', ip ? `http://${ip}:${SHARE_PORT}${path}` : ''].filter(Boolean)
  if (links.length === 0 && !tsIp) return `Sharing on port ${SHARE_PORT}, but this computer's network address wasn't found. Is Wi-Fi on?`

  return [
    ...(tsIp ? ['From anywhere, on a device signed in to your Tailscale:', `  http://${tsIp}:${SHARE_PORT}${path}`] : ['Away from home? Install Tailscale on this computer and your iPad, then run /seal-island ipad again for a link that works anywhere.']),
    ...(links.length ? ['On the same Wi-Fi as this computer:', ...links.map(l => '  ' + l)] : []),
    'Keep the link to yourself: anyone on this network who has it can watch. Stop sharing with /seal-island stop.',
    'If macOS asks whether Python may accept incoming connections, choose Allow.',
  ].join('\n')
}

async function stopSharing($: EngineInterface): Promise<string> {
  const r = await $.process.run(['sh', '-c', `pkill -f "http.server ${SHARE_PORT} --bind 0.0.0.0"`])
  // A new secret next time, so an old link stops working for good.
  const home = await $.env.get('HOME')
  const token = (await $.store.get('shareToken')) as string | undefined
  if (home && token) await $.process.run(['rm', '-f', `${home}/.seal-team/www/${token}`])
  await $.store.set('shareToken', '')

  return r.exitCode === 0 ? 'Stopped sharing the seal island.' : 'The seal island was not being shared.'
}

async function readOr($: EngineInterface, path: string, fallback = ''): Promise<string> {
  try {
    return (await $.fs.exists(path)) ? String(await $.fs.read(path)) : fallback
  } catch {
    return fallback
  }
}

// Keeps .seal-team/ out of git through the repo's local exclude file, unless the user chose to share it.
async function keepLocal($: EngineInterface, cwd: string): Promise<void> {
  const exclude = `${cwd}/.git/info/exclude`
  if (!(await $.fs.exists(`${cwd}/.git/info`)) || (await $.fs.exists(`${cwd}/${MEMORY_DIR}/SHARED`))) return
  const text = await readOr($, exclude)
  if (text.split('\n').some(line => line.trim() === `${MEMORY_DIR}/`)) return
  await $.fs.write(exclude, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${MEMORY_DIR}/\n`)
}

// The project memory and the user's own preferences, read fresh for every request.
async function memorySection($: EngineInterface): Promise<{ id: string; scope: 'session'; text: string } | undefined> {
  const [home, cwd] = await Promise.all([$.env.get('HOME'), $.session.cwd()])
  const [rawMemory, rawPreferences] = await Promise.all([
    readOr($, `${cwd}/${MEMORY_DIR}/MEMORY.md`),
    home ? readOr($, `${home}/${MEMORY_DIR}/preferences.md`) : '',
  ])
  const memory = clip(rawMemory, MEMORY_CHARS)
  const preferences = clip(rawPreferences, PREFERENCES_CHARS)
  if (memory === '' && preferences === '') return undefined
  const parts = ['# Seal team memory']
  if (preferences !== '') parts.push("## The user's preferences (~/.seal-team/preferences.md)", preferences)
  if (memory !== '') parts.push('## This project (.seal-team/MEMORY.md)', memory)
  return { id: 'seal-team:memory', scope: 'session', text: parts.join('\n') }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'seals', description: 'Show the seal team and what each seal is doing' })
    await $.command.register({ name: 'seal-island', description: 'Open the live 3D seal island in your browser' })
    const saved = (await $.store.get('fish')) as Record<string, number> | undefined
    await update($, seals, m => {
      const fresh: Record<string, SealLive> = {}
      for (const s of TEAM) fresh[s.id] = { ...blank(), ...(m[s.id] ?? {}), fish: saved?.[s.id] ?? m[s.id]?.fish ?? 0 }
      return fresh
    })
    try {
      await keepLocal($, await $.session.cwd())
    } catch {
      // Not a git repo, or no permission: nothing to keep out.
    }
    try {
      islandDir = await prepareIsland($)
      await writeLive($)
    } catch {
      islandDir = undefined
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    if (!warnedSessionModel && isOverCap(e.model)) {
      warnedSessionModel = true
      $.ui.toast(`🦭 This session runs on ${e.model}, above your Opus 5.5 cap. Switch with /model ${CAP_MODEL}`)
    }
    const composed = await next(e)
    const memory = await memorySection($).catch(() => undefined)

    return { ...composed, sections: [...composed.sections, TEAM_SECTION, ...(memory ? [memory] : [])] }
  })

  // The main loop's turns are Mochi's.
  on('turn.start', async ($, e, next) => {
    await setSeal($, 'mochi', { status: 'working', task: turnTask(e.text), tool: '', target: '', since: await $.clock.now() })
    await refresh($)

    return next(e)
  })

  // Tracks seals as they start, and holds every agent to the Opus 5.5 ceiling.
  on('agent.spawn', async ($, e, next) => {
    const id = sealOfType(e.subagentType)
    const inheritsOverCap = e.model === undefined && !e.fork && id === undefined && isOverCap(e.parentModel)
    const capped = isOverCap(e.model) || inheritsOverCap ? { ...e, model: CAP_MODEL } : e
    const ran = await next(capped)
    if (id !== undefined && ran.deny === undefined) {
      if (ran.agentId) await update($, agents, m => ({ ...m, [ran.agentId as string]: id }))
      await setSeal($, id, { status: 'working', task: e.description, tool: '', target: '', model: ran.model, since: await $.clock.now() })
      await logEvent($, id, 'START', e.description)
      await logEvent($, 'mochi', 'TOOL', `Handed to ${BY_ID.get(id)?.name}: ${e.description}`)
      await refresh($)
    }

    return ran
  })

  // A permission prompt: the seal waves on the island until you answer it in Claude Code.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id !== undefined) {
      const id = await sealOfLoop($, e.agentId)
      if (id !== undefined) {
        const target = targetOf((e.input ?? {}) as Record<string, unknown>)
        const ask = `${e.tool}${target ? ' ' + target : ''}`
        await setSeal($, id, { status: 'waiting', ask, tool: e.tool, target })
        await logEvent($, id, 'ASK', `Wants to run ${ask}`)
        if (id !== 'mochi') $.ui.toast(`🦭 ${BY_ID.get(id)?.name} needs your OK: ${ask}`)
        await refresh($)
      }
    }

    return verdict
  }).catch(($, e, next) => next(e))

  // Every subagent request: hold it to the ceiling, and count the tokens it used against its seal.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) return yield* next(e)
    const capped = {
      ...e,
      ...(isOverCap(e.model) ? { model: CAP_MODEL } : {}),
      ...(typeof e.effort === 'string' && OVER_CAP_EFFORT.has(e.effort) ? { effort: 'high' as const } : {}),
    }
    const ran = yield* next(capped)
    const id = (await read($, agents))[e.agentId]
    if (id !== undefined && ran.usage) {
      const used = ran.usage.input_tokens + ran.usage.output_tokens + ran.usage.cache_read_input_tokens + ran.usage.cache_creation_input_tokens
      await update($, seals, m => ({ ...m, [id]: { ...blank(), ...(m[id] ?? {}), tokens: (m[id]?.tokens ?? 0) + used } }))
    }

    return ran
  })

  // The memory guard: a write to MEMORY.md may not drop a pinned id that ARCHIVE.md doesn't hold.
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = String((e as { file_path?: unknown }).file_path ?? '')
    if (!path.endsWith(`${MEMORY_DIR}/MEMORY.md`)) return next(e)
    const before = await readOr($, path)
    const after =
      e.tool === 'Write'
        ? String((e as { content?: unknown }).content ?? '')
        : afterEdit(before, String((e as { old_string?: unknown }).old_string ?? ''), String((e as { new_string?: unknown }).new_string ?? ''), (e as { replace_all?: unknown }).replace_all === true)
    const dropped = droppedIds(before, after, await readOr($, path.replace(/MEMORY\.md$/, 'ARCHIVE.md')))
    if (dropped.length === 0) return next(e)

    return { deny: `MEMORY.md would lose pinned ${dropped.join(', ')}. Keep them, or move them to ARCHIVE.md first, then write again.` }
  })

  on('tool.call', async ($, e, next) => {
    const id = await sealOfLoop($, e.agentId)
    const tracked = id !== undefined && e.tool !== 'Agent'
    const was = tracked ? (await read($, seals))[id] : undefined
    if (tracked) {
      const target = targetOf(e as unknown as Record<string, unknown>)
      await setSeal($, id, { status: 'working', tool: String(e.tool), target, ask: '' })
      await logEvent($, id, 'TOOL', `${String(e.tool)}${target ? ' ' + target : ''}`)
      await refresh($)
    }
    const ran = await next(e)
    if (tracked) {
      if (was?.status === 'waiting') {
        await logEvent($, id, ran.deny === undefined ? 'OK' : 'STOP', `${ran.deny === undefined ? 'Allowed' : 'Not allowed'}: ${was.ask}`)
        await refresh($)
      }
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) {
      await setSeal($, 'mochi', { status: 'idle', tool: '', target: '', ask: '' })
    } else {
      const map = await read($, agents)
      const id = map[e.agentId]
      if (id !== undefined) {
        const m = await read($, seals)
        const fish = (m[id]?.fish ?? 0) + (e.isAborted ? 0 : 1)
        await setSeal($, id, { status: e.isAborted ? 'idle' : 'done', tool: '', target: '', ask: '', fish })
        await logEvent($, id, e.isAborted ? 'STOP' : 'DONE', m[id]?.task ?? '')
        await update($, agents, all => {
          const rest = { ...all }
          delete rest[e.agentId as string]
          return rest
        })
        const after = await read($, seals)
        const tally: Record<string, number> = {}
        for (const s of TEAM) tally[s.id] = after[s.id]?.fish ?? 0
        await $.store.set('fish', tally)
        if (!e.isAborted) $.ui.toast(`🦭 ${BY_ID.get(id)?.name} finished: ${m[id]?.task ?? 'task'}`)
      }
    }
    await refresh($)

    return ran
  })

  on('session.end', async ($, e, next) => {
    await setSeal($, 'mochi', { status: 'idle', tool: '', target: '' })
    try {
      await writeLive($)
    } catch {
      // The island is a nicety; never hold up the session's end for it.
    }

    return next(e)
  })

  on('command.run', { command: 'seals' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Seal team' })

    return { text: 'Seal team panel opened.' }
  })

  on('command.run', { command: 'seal-island' }, async ($, e) => {
    if (islandDir === undefined) islandDir = await prepareIsland($)
    if (islandDir === undefined) return { text: 'Could not find your home folder to set up the island.' }
    await writeLive($)
    const mode = e.args.trim().toLowerCase()
    if (mode === 'ipad' || mode === 'share') return { text: await shareIsland($) }
    if (mode === 'stop') return { text: await stopSharing($) }
    const page = `${islandDir}/index.html`
    try {
      await $.process.run([page.startsWith('/Users/') ? 'open' : 'xdg-open', page])
    } catch {
      // Opening is a convenience; the path below still works.
    }

    return { text: `Seal island: file://${page}\nTo watch it on your iPad or phone: /seal-island ipad` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, seals)
    const log = await read($, events)
    const room = Math.max(0, (e.viewport?.rows ?? 30) - TEAM.length - 7)

    return (
      <Box flexDirection="column">
        {TEAM.map(s => {
          const live = m[s.id] ?? blank()
          const doing =
            live.status === 'waiting'
              ? `wants to run ${live.ask}`
              : live.status === 'working'
                ? `${live.tool || 'thinking'} ${live.target || live.task}`.trim()
                : ''
          const label = live.status === 'waiting' ? 'needs you' : live.status === 'working' ? 'working' : live.status === 'done' ? 'done' : 'idle'
          return (
            <Box key={s.id}>
              <Text bold>{s.name.padEnd(9)}</Text>
              <Text dimColor>{shortModel(live.model || s.model).padEnd(8)}</Text>
              <Text
                color={live.status === 'waiting' ? 'yellow' : live.status === 'working' ? 'green' : undefined}
                dimColor={live.status !== 'working' && live.status !== 'waiting'}
              >
                {label.padEnd(10)}
              </Text>
              <Text>{`🐟${live.fish} `.padEnd(6)}</Text>
              <Text dimColor>{(live.tokens ? `${Math.round(live.tokens / 1000)}k tok` : '').padEnd(9)}</Text>
              <Text dimColor>{doing.slice(0, 60)}</Text>
            </Box>
          )
        })}
        <Text dimColor>{`Seals used ${Math.round(TEAM.reduce((n, s) => n + (m[s.id]?.tokens ?? 0), 0) / 1000)}k tokens this session.`}</Text>
        {room > 0 && log.length > 0 && <Text dimColor> </Text>}
        {log.slice(-room).map(ev => (
          <Text key={`${ev.t}-${ev.seal}-${ev.kind}`} dimColor>
            {BY_ID.get(ev.seal)?.name ?? ev.seal} {ev.kind} {ev.text.slice(0, 70)}
          </Text>
        ))}
      </Box>
    )
  })
}
