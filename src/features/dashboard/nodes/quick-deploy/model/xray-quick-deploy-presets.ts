import type { QuickDeployProtocolId } from './core-capabilities.ts'
import type { XrayInbound } from '../../../config-profiles/protocol-presets/model/protocol-presets.ts'

export interface BuiltXrayQuickDeployPreset {
    inbound: XrayInbound
    presetId: QuickDeployProtocolId
}

const randomInteger = (min: number, max: number): number => {
    const values = new Uint32Array(1)
    const span = max - min + 1
    const ceiling = Math.floor(0x1_0000_0000 / span) * span
    do globalThis.crypto.getRandomValues(values)
    while (values[0] >= ceiling)
    return min + (values[0] % span)
}

const randomToken = (): string => {
    const values = new Uint8Array(5)
    globalThis.crypto.getRandomValues(values)
    return Array.from(values, (value) => (value % 36).toString(36)).join('')
}

const collectPorts = (inbounds: unknown[], reservedPorts: readonly number[]): Set<number> => {
    const ports = new Set(reservedPorts)
    for (const value of inbounds) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue
        const inbound = value as Record<string, unknown>
        const port = inbound.port ?? inbound.listen_port
        if (typeof port === 'number' && Number.isInteger(port)) ports.add(port)
    }
    return ports
}

const nextPort = (ports: Set<number>): number => {
    for (let attempt = 0; attempt < 128; attempt += 1) {
        const port = randomInteger(20_000, 60_000)
        if (!ports.has(port)) return port
    }
    throw new Error('Unable to allocate a unique Xray SOCKS port.')
}

export const appendXrayQuickDeployPresets = (
    config: Record<string, unknown>,
    presetIds: readonly QuickDeployProtocolId[],
    options: { reservedPorts?: readonly number[]; reservedTags?: readonly string[] } = {}
): { added: BuiltXrayQuickDeployPreset[]; config: Record<string, unknown> } => {
    if (config.inbounds !== undefined && !Array.isArray(config.inbounds)) {
        throw new Error('The current Xray config has a non-array inbounds field.')
    }
    const inbounds = Array.isArray(config.inbounds) ? config.inbounds : []
    const ports = collectPorts(inbounds, options.reservedPorts ?? [])
    const tags = new Set([
        ...(options.reservedTags ?? []),
        ...inbounds.flatMap((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return []
            const tag = (value as Record<string, unknown>).tag
            return typeof tag === 'string' ? [tag] : []
        })
    ])

    const added = presetIds.map((presetId): BuiltXrayQuickDeployPreset => {
        if (presetId !== 'xray-socks5') {
            throw new Error(`Protocol ${presetId} does not have an Xray Quick Deploy builder.`)
        }
        let tag = `${presetId}-${randomToken()}`
        while (tags.has(tag)) tag = `${presetId}-${randomToken()}`
        tags.add(tag)
        const port = nextPort(ports)
        ports.add(port)
        return {
            presetId,
            inbound: {
                tag,
                listen: '127.0.0.1',
                port,
                protocol: 'socks',
                settings: { auth: 'password', accounts: [], udp: true },
                streamSettings: { network: 'raw', security: 'none' }
            }
        }
    })

    return { config: { ...config, inbounds: [...inbounds, ...added.map((item) => item.inbound)] }, added }
}
