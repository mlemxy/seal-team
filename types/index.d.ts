export type SealStatus = 'idle' | 'working' | 'waiting' | 'done'

export type SealLive = {
  status: SealStatus
  task: string
  tool: string
  target: string
  model: string
  fish: number
  since: number
  /** What the seal is waiting for you to allow, while status is 'waiting'. */
  ask: string
  /** Tokens the seal's requests used this session: input, output and cache. */
  tokens: number
}

export type SealEvent = {
  t: number
  seal: string
  kind: 'START' | 'TOOL' | 'ASK' | 'OK' | 'DONE' | 'STOP'
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'seal-team': {
      seals: Record<string, SealLive>
      events: SealEvent[]
      agents: Record<string, string>
    }
  }
}
