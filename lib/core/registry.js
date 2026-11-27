import { HttpError } from '../http.js'

/**
 * Channel registry. Each channel is fully independent: it owns its own
 * credentials, its own accounts, its own gateway token and its own panel
 * actions. Nothing is shared between channels except this routing table.
 *
 * A channel object looks like:
 *   {
 *     id: 'tokenbank',                 // stable id, used in panel requests
 *     label: 'TokenBank',              // human label for gateway errors
 *     gateway: {                       // what the local gateway needs
 *       token: 'tb-local-...',         // inbound credential that selects this channel
 *       baseUrl: 'https://...',        // upstream origin
 *       ua: 'DeepSeek-Harness/1.0.0',  // optional outbound User-Agent override
 *       routes: ['anthropic', 'chat', 'responses', 'models'],
 *       getPool: async () => ({ accounts, tuning }),
 *     },
 *     dispatch: async (body) => result, // panel actions for this channel
 *     tick: async () => {},             // optional background work
 *   }
 */
export function createRegistry() {
  const channels = new Map()

  function add(channel) {
    if (!channel || typeof channel.id !== 'string' || !channel.id) throw new Error('channel needs an id')
    if (typeof channel.dispatch !== 'function') throw new Error(`channel ${channel.id} needs a dispatch function`)
    channels.set(channel.id, channel)
    return channel
  }

  return {
    add,
    get: (id) => channels.get(id) ?? null,
    list: () => [...channels.values()],
    gatewayChannels: () => [...channels.values()].map((channel) => channel.gateway).filter(Boolean),

    /** Panel requests carry a `channel` field; absent means the original TokenBank channel. */
    async dispatch(body) {
      const requested = typeof body?.channel === 'string' && body.channel ? body.channel : 'tokenbank'
      const channel = channels.get(requested)
      if (!channel) throw new HttpError(404, `unknown channel: ${requested}`, 'unknown_channel')
      return channel.dispatch(body)
    },

    async tick() {
      const results = []
      for (const channel of channels.values()) {
        if (typeof channel.tick !== 'function') continue
        try {
          results.push(await channel.tick())
        } catch {
          results.push(null)
        }
      }
      return results
    },
  }
}
