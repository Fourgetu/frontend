export type MixedShareProtocol = 'http' | 'socks5'

export interface MixedShareLinkInput {
    address: string
    auth: 'noauth' | 'password'
    password: string
    port: number
    protocol: MixedShareProtocol
    tag: string
    username: string
}

export const resolveMixedShareAddress = (value: string): string | null => {
    const address = value.trim()
    if (!address || /[/?#@\s]/.test(address)) return null

    try {
        const url = new URL(`http://${address}`)
        if (
            !url.hostname ||
            url.port ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.hostname === '0.0.0.0' ||
            url.hostname === '[::]'
        ) {
            return null
        }
        return url.hostname
    } catch {
        return null
    }
}

export const buildMixedShareLink = (input: MixedShareLinkInput): string | null => {
    const host = resolveMixedShareAddress(input.address)
    if (!host || !Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
        return null
    }
    if (input.auth === 'password' && (!input.username || !input.password)) return null

    const credentials =
        input.auth === 'password'
            ? `${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@`
            : ''
    return `${input.protocol}://${credentials}${host}:${input.port}#${encodeURIComponent(input.tag)}`
}
