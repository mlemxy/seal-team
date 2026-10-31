import { expect, mock, test } from 'claude-code/testing'

const COMPOSE = { model: 'claude-test', promptModel: 'claude-test', surfaces: [], tools: [], outputStyle: null, traits: [] }

test('a seal agent shows in the status line while it works and toasts when it finishes', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))

  await $.agent.spawn({
    prompt: 'Fix the grammar in README.md',
    description: 'Fix README grammar',
    subagentType: 'seal-team:quill',
  } as never)
  expect(statuses.at(-1)).toBe('🦭 Quill')

  await $.tool.call({ tool: 'Read', file_path: 'README.md', agentId: 'agent-1' } as never)
  expect(statuses.at(-1)).toBe('🦭 Quill: Read')

  await $.turn.complete({
    answer: 'Fixed 3 typos.',
    durationMs: 1200,
    isAborted: false,
    turnId: 'turn-1',
    agentId: 'agent-1',
    reason: 'answer',
  })
  expect(statuses.at(-1)).toBe(undefined)
  expect(toasts).toEqual(['🦭 Quill finished: Fix README grammar'])
})

test('agents that are not seals leave the team alone', async ($, on) => {
  mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'agent-2' }))

  await $.agent.spawn({ prompt: 'Look around', description: 'Explore', subagentType: 'Explore' } as never)
  expect(statuses).toEqual([])
})

test('the main session is briefed as Mochi, the lead seal', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hello', scope: 'shared' as const }] }))

  const composed = await $.prompt.compose(COMPOSE)
  const team = composed.sections.find(s => s.id === 'seal-team:team')
  expect(composed.sections[0]?.id).toBe('intro')
  expect(team?.text).toContain('You are Mochi')
  expect(team?.text).toContain('load the `seal-team:playbook` skill first')
  expect(team?.text).toContain('pick `model` and `effort` by difficulty')
  expect(team?.text).toContain('Stop at the first rung that holds')
  expect(team?.text).toContain('one small test that fails without the change, even for a one-line fix')
  // The one stop that must hold even when the playbook is never loaded.
  expect(team?.text).toContain("Never deploy, publish, push, send or delete anything without the user's explicit yes")
  // Every file in agents/ is named. Keep this list in step with that folder.
  for (const id of ['nori', 'scout', 'sprinkle', 'bolt', 'tick', 'pebble', 'pip', 'krill', 'rivet', 'squint', 'brick', 'quill']) {
    expect(team?.text).toContain(` ${id} `)
  }
  // Sent with every request, so it must stay small.
  expect((team?.text ?? '').length).toBeLessThan(3000)
})

test('an agent asking for a model above Opus 5.5 runs on Opus 5.5', async ($, on) => {
  mock.clock(on)
  const asked: (string | undefined)[] = []
  on('agent.spawn', (_$, e) => {
    asked.push(e.model)
    return { model: e.model ?? 'inherit', agentId: `agent-${asked.length}` }
  })

  await $.agent.spawn({ prompt: 'Think hard', description: 'Deep plan', subagentType: 'general-purpose', model: 'claude-fable-5-1' } as never)
  await $.agent.spawn({ prompt: 'Review', description: 'Review', subagentType: 'general-purpose', model: 'claude-opus-4-8' } as never)
  await $.agent.spawn({ prompt: 'Plan', description: 'Plan', subagentType: 'seal-team:bolt', model: 'claude-opus-5-5' } as never)
  await $.agent.spawn({ prompt: 'Fix typo', description: 'Typo', subagentType: 'seal-team:quill' } as never)
  await $.agent.spawn({ prompt: 'Look', description: 'Look', subagentType: 'Explore', parentModel: 'claude-fable-5-1' } as never)
  await $.agent.spawn({ prompt: 'Hard bug', description: 'Hard bug', subagentType: 'seal-team:pebble', model: 'opus' } as never)
  await $.agent.spawn({ prompt: 'Rename', description: 'Rename', subagentType: 'seal-team:pebble', model: 'haiku' } as never)

  expect(asked).toEqual(['claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5', undefined, 'claude-opus-5-5', 'claude-opus-5-5', 'haiku'])
})

test('a permission prompt puts the seal in "needs you" until the call goes through', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent-7' }))
  // The first check asks; once you approve, the call's own check allows it.
  let checks = 0
  on('tool.check', () => ({ decision: checks++ === 0 ? ('ask' as const) : ('allow' as const) }))
  on('tool.call', () => ({ result: 'pushed' }))

  await $.agent.spawn({ prompt: 'Push the branch', description: 'Push branch', subagentType: 'seal-team:pebble' } as never)
  await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'tu-1', agentId: 'agent-7' } as never)
  expect(statuses.at(-1)).toBe('🦭 Pebble needs you')
  expect(toasts).toEqual(['🦭 Pebble needs your OK: Bash git push'])

  await $.tool.call({ tool: 'Bash', command: 'git push', agentId: 'agent-7' } as never)
  expect(statuses.at(-1)).toBe('🦭 Pebble: Bash')
})

test('a shell command shows only its program, never its arguments', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent-9' }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.agent.spawn({ prompt: 'Call the API', description: 'Call API', subagentType: 'seal-team:pebble' } as never)
  await $.tool.check({
    tool: 'Bash',
    input: { command: 'curl -H "Authorization: Bearer sk-secret" https://api.example.com' },
    tool_use_id: 'tu-2',
    agentId: 'agent-9',
  } as never)
  await $.tool.check({ tool: 'Bash', input: { command: 'API_KEY=sk-secret npm test' }, tool_use_id: 'tu-3', agentId: 'agent-9' } as never)

  expect(toasts).toEqual(['🦭 Pebble needs your OK: Bash curl -H', '🦭 Pebble needs your OK: Bash npm test'])
  expect(toasts.join(' ')).not.toContain('sk-secret')
})

// A tiny in-memory file system standing in for the engine's.
function files(on: Parameters<typeof mock.clock>[0], seed: Record<string, string>) {
  const fs = { ...seed }
  on('fs.exists', (_$, e) => ({ value: Object.keys(fs).some(k => k === e.path || k.startsWith(e.path + '/')) }))
  on('fs.read', (_$, e) => {
    if (!(e.path in fs)) throw new Error('ENOENT ' + e.path)
    return { value: fs[e.path] as string }
  })
  on('fs.write', (_$, e) => {
    fs[e.path] = e.text
    return { value: undefined }
  })
  return fs
}

test('a write to MEMORY.md that drops a pinned id is refused, unless ARCHIVE.md holds it', async ($, on) => {
  mock.clock(on)
  const memory = '/p/.seal-team/MEMORY.md'
  files(on, { [memory]: '## Pinned\n- D-1 Use Postgres\n- AC-2 Empty cart shows a hint\n', '/p/.seal-team/ARCHIVE.md': '- AC-9 old\n' })
  let wrote = 0
  on('tool.call', () => {
    wrote += 1
    return { result: 'ok' }
  })

  const dropped = await $.tool.call({ tool: 'Write', file_path: memory, content: '## Pinned\n- D-1 Use Postgres\n' } as never)
  expect(String((dropped as { deny?: string; text?: string }).deny ?? (dropped as { text?: string }).text)).toContain('AC-2')
  expect(wrote).toBe(0)

  await $.tool.call({ tool: 'Write', file_path: memory, content: '## Pinned\n- D-1 Use Postgres\n- AC-2 Empty cart shows a hint\n- R-1 New risk\n' } as never)
  await $.tool.call({ tool: 'Edit', file_path: memory, old_string: '- D-1 Use Postgres\n', new_string: '- D-1 Use Postgres 16\n' } as never)
  expect(wrote).toBe(2)
})

test('.seal-team/ is kept out of git unless the project chose to share it', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.cwd', () => ({ value: '/p' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ ...(e as object) }) as never)
  const fs = files(on, { '/p/.git/info/exclude': '# git ls-files --others --exclude-from=.git/info/exclude\n' })

  await $.session.start({ source: 'startup', cwd: '/p' } as never)
  expect(fs['/p/.git/info/exclude']).toContain('.seal-team/\n')

  await $.session.start({ source: 'startup', cwd: '/p' } as never)
  expect((fs['/p/.git/info/exclude'] ?? '').split('.seal-team/').length).toBe(2)
})

test('the island page is refreshed every session, but three.js is copied only once', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.cwd', () => ({ value: '/p' }))
  on('env.get', () => ({ value: '/home' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', (_$, e) => ({ ...(e as object) }) as never)
  // The plugin's own island files, matched by their path inside the plugin, wherever it is installed.
  const source: Record<string, string> = { 'index.html': 'v1 page', 'vendor/three.min.js': 'v1 three', 'vendor/OrbitControls.js': 'v1', 'vendor/LICENSE-three.txt': 'v1' }
  const fs: Record<string, string> = {}
  on('fs.exists', (_$, e) => ({ value: e.path in fs }))
  on('fs.read', (_$, e) => {
    const own = Object.keys(source).find(f => e.path.endsWith(`/island/${f}`))
    if (own !== undefined) return { value: source[own] as string }
    if (!(e.path in fs)) throw new Error('ENOENT ' + e.path)
    return { value: fs[e.path] as string }
  })
  on('fs.write', (_$, e) => {
    fs[e.path] = e.text
    return { value: undefined }
  })
  const dest = '/home/.seal-team/islands/p'

  await $.session.start({ source: 'startup', cwd: '/p' } as never)
  expect(fs[`${dest}/vendor/three.min.js`]).toBe('v1 three')

  source['index.html'] = 'v2 page'
  source['vendor/three.min.js'] = 'v2 three'
  await $.session.start({ source: 'startup', cwd: '/p' } as never)
  expect(fs[`${dest}/index.html`]).toBe('v2 page')
  expect(fs[`${dest}/vendor/three.min.js`]).toBe('v1 three')
})

test('subagent requests are held to Opus 5.5 at high effort; the main session is left alone', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const sent: { model: string; effort?: unknown }[] = []
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'agent-5' }))
  // eslint-disable-next-line require-yield
  on('turn.step', async function* (_$, e) {
    sent.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: e.model, input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })

  await $.agent.spawn({ prompt: 'Plan', description: 'Plan', subagentType: 'seal-team:bolt' } as never)
  // A step is a stream: read it to the end so the hooks run.
  const drain = async (stream: AsyncIterable<unknown>) => {
    for await (const _chunk of stream);
  }
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', effort: 'max', messageCount: 1, agentId: 'agent-5' } as never))
  await drain($.turn.step({ turnId: 't0', index: 0, model: 'claude-fable-5-1', effort: 'max', messageCount: 1 } as never))

  expect(sent).toEqual([{ model: 'claude-opus-5-5', effort: 'high' }, { model: 'claude-fable-5-1', effort: 'max' }])
})
