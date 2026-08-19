/**
 * dsh-thirteen-bg — Host side.
 *
 * Pure client plugin: the Host half is intentionally a no-op. All behaviour
 * (the animated background layer + the settings card) lives in the browser
 * bundle (`./client`). Keeping a real Host entry means the cordis row mounts
 * normally and the client-modules scan picks up the `dsh.client` declaration.
 */
export const name = 'dsh-thirteen-bg'

export function apply() {
  // no host-side work — see lib/client.js
}
