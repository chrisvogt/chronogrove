import dns from 'dns'

function normalizeDnsName(name: string): string {
  return name.toLowerCase().replace(/\.$/, '')
}

function nodeDnsErrorCode(err: unknown): string | undefined {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

type CnameHopOutcome =
  | { kind: 'target-found' }
  | { kind: 'follow'; next: string }
  | { kind: 'end' }

async function resolveCnameHop(current: string, want: string): Promise<CnameHopOutcome> {
  try {
    const cnames = await dns.promises.resolveCname(current)
    if (cnames.length === 0) {
      return { kind: 'end' }
    }
    for (const c of cnames) {
      if (normalizeDnsName(c) === want) {
        return { kind: 'target-found' }
      }
    }
    return { kind: 'follow', next: normalizeDnsName(cnames[0]) }
  } catch (err: unknown) {
    const code = nodeDnsErrorCode(err)
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { kind: 'end' }
    }
    throw err
  }
}

/**
 * True if `hostname` equals `target` or a CNAME chain from `hostname` reaches `target`.
 * Used for onboarding custom-domain DNS checks.
 */
export async function hostnameCnameChainsTo(
  hostname: string,
  target: string,
  maxHops = 12,
): Promise<boolean> {
  const want = normalizeDnsName(target)
  let current = normalizeDnsName(hostname)
  const seen = new Set<string>()

  for (let hop = 0; hop < maxHops; hop++) {
    if (current === want) return true
    if (seen.has(current)) return false
    seen.add(current)

    const outcome = await resolveCnameHop(current, want)
    if (outcome.kind === 'target-found') return true
    if (outcome.kind === 'end') return false
    current = outcome.next
  }

  return false
}
