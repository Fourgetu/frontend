import { generateX25519 } from '../../../../../shared/utils/crypto/keypair-utils.ts'
import {
    normalizeRealityMinClientVersion,
    REALITY_MIN_CLIENT_VERSION_COMPAT,
    validateRealityMinClientVersion
} from './reality-compatibility.ts'

export {
    applyRealityCompatibilityToConfig,
    getRealityMinClientVersion,
    getRealityClientCompatibility,
    normalizeRealityMinClientVersion,
    REALITY_CLIENT_COMPATIBILITY,
    REALITY_MIN_CLIENT_VERSION_COMPAT,
    stripRealityServerOnlyFields,
    stripRealityServerOnlyFieldsFromOutbound,
    setRealityMinClientVersion,
    validateRealityMinClientVersion
} from './reality-compatibility.ts'

export type ProtocolPresetId =
    | 'vless-reality-vision'
    | 'vless-reality-grpc'
    | 'trojan-tcp-tls'
    | 'vmess-ws-tls'
    | 'hysteria2'

export interface ProtocolPreset {
    id: ProtocolPresetId
    title: string
    transport: string
    security: string
    needsDomain: boolean
    needsCertificate: boolean
    recommended: boolean
    supported: boolean
}

export interface TlsPresetOptions {
    certificateFile: string
    domain: string
    keyFile: string
}

export interface RealityPresetOptions {
    minClientVer?: string
    serverName: string
    target: string
}

export interface XrayInbound extends Record<string, unknown> {
    listen: string
    port: number
    protocol: string
    settings: Record<string, unknown>
    streamSettings: Record<string, unknown>
    tag: string
}

export interface BuiltProtocolPreset {
    inbound: XrayInbound
    preset: ProtocolPreset
    realityPublicKey?: string
}

export interface AppendProtocolPresetsResult {
    added: BuiltProtocolPreset[]
    config: Record<string, unknown>
}

export interface ProtocolPresetBuildOptions {
    reality?: RealityPresetOptions
    reservedTags?: readonly string[]
    tls?: TlsPresetOptions
}

const PORT_MIN = 20_000
const PORT_MAX = 60_000

const REALITY_TARGETS = [
    { serverName: 'www.microsoft.com', target: 'www.microsoft.com:443' },
    { serverName: 'addons.mozilla.org', target: 'addons.mozilla.org:443' },
    { serverName: 'www.cloudflare.com', target: 'www.cloudflare.com:443' }
] as const

export const DEFAULT_REALITY_MIN_CLIENT_VERSION = REALITY_MIN_CLIENT_VERSION_COMPAT

export const PROTOCOL_PRESETS: readonly ProtocolPreset[] = [
    {
        id: 'vless-reality-vision',
        title: 'VLESS Reality Vision',
        transport: 'TCP (raw)',
        security: 'Reality',
        needsDomain: false,
        needsCertificate: false,
        recommended: true,
        supported: true
    },
    {
        id: 'vless-reality-grpc',
        title: 'VLESS Reality gRPC',
        transport: 'gRPC',
        security: 'Reality',
        needsDomain: false,
        needsCertificate: false,
        recommended: true,
        supported: true
    },
    {
        id: 'trojan-tcp-tls',
        title: 'Trojan TCP TLS',
        transport: 'TCP (raw)',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: true,
        supported: true
    },
    {
        id: 'vmess-ws-tls',
        title: 'VMess WebSocket TLS',
        transport: 'WebSocket',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: false,
        supported: false
    },
    {
        id: 'hysteria2',
        title: 'Hysteria2',
        transport: 'QUIC / HTTP3',
        security: 'TLS',
        needsDomain: true,
        needsCertificate: true,
        recommended: true,
        supported: true
    }
] as const

const getWebCrypto = (): Crypto => {
    if (!globalThis.crypto) throw new Error('Web Crypto is unavailable in this browser.')
    return globalThis.crypto
}

const randomBytes = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length)
    getWebCrypto().getRandomValues(bytes)
    return bytes
}

const randomHex = (length: number): string =>
    Array.from(randomBytes(Math.ceil(length / 2)), (value) => value.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, length)

const randomToken = (length: number): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from(randomBytes(length), (value) => alphabet[value % alphabet.length]).join('')
}

const randomBase64Url = (byteLength: number): string => {
    const binary = Array.from(randomBytes(byteLength), (value) => String.fromCharCode(value)).join(
        ''
    )
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const randomInteger = (min: number, max: number): number => {
    const span = max - min + 1
    const maximum = Math.floor(0x1_0000_0000 / span) * span
    const values = new Uint32Array(1)

    do {
        getWebCrypto().getRandomValues(values)
    } while (values[0] >= maximum)

    return min + (values[0] % span)
}

const getPreset = (id: ProtocolPresetId): ProtocolPreset => {
    const preset = PROTOCOL_PRESETS.find((item) => item.id === id)
    if (!preset) throw new Error(`Unknown protocol preset: ${id}`)
    return preset
}

const addPortValue = (value: unknown, ports: Set<number>): void => {
    if (typeof value === 'number' && Number.isInteger(value)) {
        ports.add(value)
        return
    }

    if (typeof value !== 'string') return

    for (const part of value.split(',')) {
        const trimmed = part.trim()
        const range = /^(\d+)-(\d+)$/.exec(trimmed)

        if (range) {
            const start = Number(range[1])
            const end = Number(range[2])

            if (start <= end && end - start <= 65_535) {
                for (let port = start; port <= end; port += 1) ports.add(port)
            }
            continue
        }

        const port = Number(trimmed)
        if (Number.isInteger(port)) ports.add(port)
    }
}

export const getUsedInboundPorts = (inbounds: readonly unknown[]): Set<number> => {
    const ports = new Set<number>()

    for (const inbound of inbounds) {
        if (inbound && typeof inbound === 'object' && 'port' in inbound) {
            addPortValue((inbound as { port?: unknown }).port, ports)
        }
    }

    return ports
}

const generateUniquePort = (usedPorts: Set<number>): number => {
    for (let attempt = 0; attempt < 128; attempt += 1) {
        const port = randomInteger(PORT_MIN, PORT_MAX)
        if (!usedPorts.has(port)) {
            usedPorts.add(port)
            return port
        }
    }

    for (let port = PORT_MIN; port <= PORT_MAX; port += 1) {
        if (!usedPorts.has(port)) {
            usedPorts.add(port)
            return port
        }
    }

    throw new Error('No free preset port is available.')
}

const generateUniqueTag = (prefix: string, usedTags: Set<string>): string => {
    for (let attempt = 0; attempt < 128; attempt += 1) {
        const tag = `${prefix}-${randomToken(5)}`
        if (!usedTags.has(tag)) {
            usedTags.add(tag)
            return tag
        }
    }

    let suffix = 1
    while (usedTags.has(`${prefix}-${suffix}`)) suffix += 1
    const tag = `${prefix}-${suffix}`
    usedTags.add(tag)
    return tag
}

const baseInbound = (
    prefix: string,
    protocol: string,
    settings: Record<string, unknown>,
    streamSettings: Record<string, unknown>,
    usedPorts: Set<number>,
    usedTags: Set<string>
): XrayInbound => ({
    tag: generateUniqueTag(prefix, usedTags),
    port: generateUniquePort(usedPorts),
    listen: '0.0.0.0',
    protocol,
    settings,
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'] },
    streamSettings
})

const createTlsSettings = (tls: TlsPresetOptions, alpn: string[]): Record<string, unknown> => ({
    alpn,
    serverName: tls.domain.trim(),
    certificates: [
        {
            keyFile: tls.keyFile.trim(),
            certificateFile: tls.certificateFile.trim()
        }
    ]
})

const buildRealityPreset = (
    preset: ProtocolPreset,
    network: 'raw' | 'grpc',
    usedPorts: Set<number>,
    usedTags: Set<string>,
    realityOptions?: RealityPresetOptions
): BuiltProtocolPreset => {
    const target = REALITY_TARGETS[randomInteger(0, REALITY_TARGETS.length - 1)]
    const serverName = realityOptions?.serverName.trim() || target.serverName
    const targetAddress = realityOptions?.target.trim() || target.target
    const minClientVer = normalizeRealityMinClientVersion(realityOptions?.minClientVer)
    const keypair = generateX25519()
    const vision = preset.id === 'vless-reality-vision'
    const transportSettings = vision
        ? { rawSettings: { header: { type: 'none' } } }
        : { grpcSettings: { serviceName: `grpc-${randomToken(12)}` } }

    return {
        preset,
        realityPublicKey: keypair.password,
        inbound: baseInbound(
            preset.id,
            'vless',
            { clients: [], decryption: 'none', flow: vision ? 'xtls-rprx-vision' : '' },
            {
                network,
                security: 'reality',
                ...transportSettings,
                realitySettings: {
                    target: targetAddress,
                    show: false,
                    xver: 0,
                    shortIds: [randomHex(16)],
                    privateKey: keypair.privateKey,
                    serverNames: [serverName],
                    minClientVer
                }
            },
            usedPorts,
            usedTags
        )
    }
}

const buildVlessRealityVisionPreset = (
    preset: ProtocolPreset,
    usedPorts: Set<number>,
    usedTags: Set<string>,
    reality?: RealityPresetOptions
): BuiltProtocolPreset => buildRealityPreset(preset, 'raw', usedPorts, usedTags, reality)

const buildVlessRealityGrpcPreset = (
    preset: ProtocolPreset,
    usedPorts: Set<number>,
    usedTags: Set<string>,
    reality?: RealityPresetOptions
): BuiltProtocolPreset => buildRealityPreset(preset, 'grpc', usedPorts, usedTags, reality)

const buildTrojanTlsPreset = (
    preset: ProtocolPreset,
    tls: TlsPresetOptions,
    usedPorts: Set<number>,
    usedTags: Set<string>
): BuiltProtocolPreset => ({
    preset,
    inbound: baseInbound(
        preset.id,
        'trojan',
        { clients: [] },
        {
            network: 'raw',
            security: 'tls',
            rawSettings: { header: { type: 'none' } },
            tlsSettings: createTlsSettings(tls, ['h2', 'http/1.1'])
        },
        usedPorts,
        usedTags
    )
})

const buildHysteria2Preset = (
    preset: ProtocolPreset,
    tls: TlsPresetOptions,
    usedPorts: Set<number>,
    usedTags: Set<string>
): BuiltProtocolPreset => ({
    preset,
    inbound: baseInbound(
        preset.id,
        'hysteria',
        { clients: [], version: 2 },
        {
            network: 'hysteria',
            security: 'tls',
            finalmask: {
                udp: [
                    {
                        type: 'salamander',
                        settings: { password: randomBase64Url(24) }
                    }
                ],
                quicParams: { debug: false, congestion: 'bbr' }
            },
            tlsSettings: createTlsSettings(tls, ['h3']),
            hysteriaSettings: { version: 2 }
        },
        usedPorts,
        usedTags
    )
})

// Kept as a standalone builder so VMess can be enabled with a small compatibility
// change once Remnawave manages VMess users, hosts and subscription output.
const buildVmessWsTlsPreset = (
    preset: ProtocolPreset,
    tls: TlsPresetOptions,
    usedPorts: Set<number>,
    usedTags: Set<string>
): BuiltProtocolPreset => ({
    preset,
    inbound: baseInbound(
        preset.id,
        'vmess',
        { clients: [], disableInsecureEncryption: false },
        {
            network: 'ws',
            security: 'tls',
            wsSettings: { path: `/${randomToken(12)}` },
            tlsSettings: createTlsSettings(tls, ['h2', 'http/1.1'])
        },
        usedPorts,
        usedTags
    )
})

export const validateTlsPresetOptions = (tls?: TlsPresetOptions): string[] => {
    if (!tls) return ['domain', 'certificateFile', 'keyFile']

    const invalid: string[] = []
    const domain = tls.domain.trim()
    const domainPattern = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i

    if (!domain || !domainPattern.test(domain)) invalid.push('domain')
    if (!tls.certificateFile.trim()) invalid.push('certificateFile')
    if (!tls.keyFile.trim()) invalid.push('keyFile')

    return invalid
}

export const validateRealityPresetOptions = (reality?: RealityPresetOptions): string[] => {
    if (!reality) return []

    const invalid: string[] = []
    const domainPattern = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i
    const targetPattern =
        /^(?=.{1,259}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}:\d{1,5}$/i

    if (!domainPattern.test(reality.serverName.trim())) invalid.push('serverName')
    if (!targetPattern.test(reality.target.trim())) invalid.push('target')
    if (reality.minClientVer && !validateRealityMinClientVersion(reality.minClientVer.trim())) {
        invalid.push('minClientVer')
    }

    return invalid
}

const buildPreset = (
    preset: ProtocolPreset,
    options: ProtocolPresetBuildOptions,
    usedPorts: Set<number>,
    usedTags: Set<string>
): BuiltProtocolPreset => {
    if (!preset.supported) {
        throw new Error(`Protocol preset is not supported by Remnawave backend: ${preset.id}`)
    }

    if (preset.needsCertificate) {
        const invalidTlsFields = validateTlsPresetOptions(options.tls)
        if (invalidTlsFields.length > 0) {
            throw new Error(`TLS preset fields are invalid: ${invalidTlsFields.join(', ')}`)
        }
    }

    if (preset.security === 'Reality') {
        const invalidRealityFields = validateRealityPresetOptions(options.reality)
        if (invalidRealityFields.length > 0) {
            throw new Error(`Reality preset fields are invalid: ${invalidRealityFields.join(', ')}`)
        }
    }

    switch (preset.id) {
        case 'vless-reality-vision':
            return buildVlessRealityVisionPreset(preset, usedPorts, usedTags, options.reality)
        case 'vless-reality-grpc':
            return buildVlessRealityGrpcPreset(preset, usedPorts, usedTags, options.reality)
        case 'trojan-tcp-tls':
            return buildTrojanTlsPreset(preset, options.tls!, usedPorts, usedTags)
        case 'hysteria2':
            return buildHysteria2Preset(preset, options.tls!, usedPorts, usedTags)
        case 'vmess-ws-tls':
            return buildVmessWsTlsPreset(preset, options.tls!, usedPorts, usedTags)
    }
}

export const appendProtocolPresets = (
    config: Record<string, unknown>,
    presetIds: readonly ProtocolPresetId[],
    options: ProtocolPresetBuildOptions = {}
): AppendProtocolPresetsResult => {
    const existingInbounds = config.inbounds
    if (existingInbounds !== undefined && !Array.isArray(existingInbounds)) {
        throw new Error('The current config has a non-array inbounds field.')
    }

    const inbounds = Array.isArray(existingInbounds) ? existingInbounds : []
    const usedPorts = getUsedInboundPorts(inbounds)
    const usedTags = new Set([
        ...(options.reservedTags ?? []),
        ...inbounds.flatMap((inbound) => {
            if (!inbound || typeof inbound !== 'object' || !('tag' in inbound)) return []
            const tag = (inbound as { tag?: unknown }).tag
            return typeof tag === 'string' ? [tag] : []
        })
    ])

    const added = presetIds.map((id) => buildPreset(getPreset(id), options, usedPorts, usedTags))

    return {
        added,
        config: {
            ...config,
            inbounds: [...inbounds, ...added.map(({ inbound }) => inbound)]
        }
    }
}

export const getRecommendedPresetIds = (): ProtocolPresetId[] =>
    PROTOCOL_PRESETS.filter((preset) => preset.recommended && preset.supported).map(
        (preset) => preset.id
    )
