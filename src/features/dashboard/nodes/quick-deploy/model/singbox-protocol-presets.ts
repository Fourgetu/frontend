import type { TlsPresetOptions } from '../../../config-profiles/protocol-presets/model/protocol-presets.ts'
import type { QuickDeployProtocolId } from './core-capabilities.ts'

import {
    PANEL_CERTIFICATE_URI,
    PANEL_PRIVATE_KEY_URI
} from '../../../../../shared/tls/managed-certificate.ts'
import {
    deriveX25519PublicKey,
    generateX25519
} from '../../../../../shared/utils/crypto/keypair-utils.ts'
import {
    generateSs2022ServerPassword,
    type Ss2022Method
} from '../../../config-profiles/protocol-presets/model/dual-core-capabilities.ts'
import {
    resolveRealityPresetOptions,
    validateRealityPresetOptions,
    type RealityPresetOptions
} from '../../../config-profiles/protocol-presets/model/protocol-presets.ts'

export interface SingBoxInbound extends Record<string, unknown> {
    listen: string
    listen_port: number
    tag: string
    type: string
    users: Record<string, unknown>[]
}

export interface BuiltSingBoxPreset {
    realityPublicKey?: string
    inbound: SingBoxInbound
    presetId: QuickDeployProtocolId
}

const PORT_MIN = 20_000
const PORT_MAX = 60_000

const randomBytes = (length: number): Uint8Array => {
    if (!globalThis.crypto) throw new Error('Web Crypto is unavailable in this browser.')
    const value = new Uint8Array(length)
    globalThis.crypto.getRandomValues(value)
    return value
}

const randomToken = (length: number): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from(randomBytes(length), (value) => alphabet[value % alphabet.length]).join('')
}

const randomBase64Url = (length: number): string => {
    const binary = Array.from(randomBytes(length), (value) => String.fromCharCode(value)).join('')
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const randomInteger = (min: number, max: number): number => {
    const values = new Uint32Array(1)
    const span = max - min + 1
    const ceiling = Math.floor(0x1_0000_0000 / span) * span
    do globalThis.crypto.getRandomValues(values)
    while (values[0] >= ceiling)
    return min + (values[0] % span)
}

const nextPort = (usedPorts: Set<number>): number => {
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

const nextTag = (prefix: string, usedTags: Set<string>): string => {
    for (let attempt = 0; attempt < 128; attempt += 1) {
        const tag = `${prefix}-${randomToken(5)}`
        if (!usedTags.has(tag)) {
            usedTags.add(tag)
            return tag
        }
    }
    throw new Error(`Unable to allocate a unique ${prefix} tag.`)
}

const validateTls = (tls: TlsPresetOptions): void => {
    if (
        !tls.domain.trim() ||
        (tls.source !== 'panel' && (!tls.certificateFile.trim() || !tls.keyFile.trim()))
    ) {
        throw new Error('TLS preset fields are invalid: domain, certificateFile, keyFile')
    }
}

const tlsConfig = (tls: TlsPresetOptions, alpn: string[]): Record<string, unknown> => ({
    enabled: true,
    server_name: tls.domain.trim(),
    alpn,
    certificate_path: tls.source === 'panel' ? PANEL_CERTIFICATE_URI : tls.certificateFile.trim(),
    key_path: tls.source === 'panel' ? PANEL_PRIVATE_KEY_URI : tls.keyFile.trim()
})

const buildInbound = (
    id: QuickDeployProtocolId,
    tls: TlsPresetOptions,
    usedPorts: Set<number>,
    usedTags: Set<string>,
    options: { reality?: RealityPresetOptions; ss2022Method?: Ss2022Method }
): SingBoxInbound => {
    const common = {
        tag: nextTag(id, usedTags),
        listen: '127.0.0.1',
        listen_port: nextPort(usedPorts),
        users: []
    }

    switch (id) {
        case 'singbox-vless-reality-vision': {
            const nativeOptions = {
                targetDomain: options.reality?.targetDomain,
                targetPort: options.reality?.targetPort,
                serverName: options.reality?.serverName
            }
            if (validateRealityPresetOptions(nativeOptions).length)
                throw new Error('Invalid Reality handshake.')
            const reality = resolveRealityPresetOptions(nativeOptions)
            return {
                ...common,
                type: 'vless',
                tls: {
                    enabled: true,
                    server_name: reality.serverName,
                    reality: {
                        enabled: true,
                        handshake: {
                            server: reality.targetDomain,
                            server_port: reality.targetPort
                        },
                        private_key: generateX25519().privateKey,
                        short_id: [
                            Array.from(randomBytes(8), (b) => b.toString(16).padStart(2, '0')).join(
                                ''
                            )
                        ]
                    }
                }
            }
        }
        case 'singbox-shadowsocks-2022':
            return {
                ...common,
                type: 'shadowsocks',
                method: options.ss2022Method ?? '2022-blake3-aes-128-gcm',
                password: generateSs2022ServerPassword(options.ss2022Method)
            }
        case 'singbox-hysteria2':
            validateTls(tls)
            return {
                ...common,
                type: 'hysteria2',
                obfs: { type: 'salamander', password: randomBase64Url(24) },
                tls: tlsConfig(tls, ['h3'])
            }
        case 'singbox-anytls':
            validateTls(tls)
            return {
                ...common,
                type: 'anytls',
                tls: tlsConfig(tls, ['h2', 'http/1.1'])
            }
        case 'singbox-socks5':
            return { ...common, type: 'socks' }
        case 'singbox-mixed':
            return { ...common, type: 'mixed' }
        default:
            throw new Error(`Protocol ${id} does not have a sing-box builder.`)
    }
}

const getInboundPort = (value: unknown): number | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const inbound = value as Record<string, unknown>
    const port = inbound.listen_port ?? inbound.port
    return typeof port === 'number' && Number.isInteger(port) ? port : undefined
}

export const createMinimalSingBoxConfig = (): Record<string, unknown> => ({
    log: { level: 'warn' },
    inbounds: [],
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: { final: 'direct' }
})

export const appendSingBoxProtocolPresets = (
    config: Record<string, unknown>,
    presetIds: readonly QuickDeployProtocolId[],
    options: {
        reservedTags?: readonly string[]
        reservedPorts?: readonly number[]
        tls: TlsPresetOptions
        reality?: RealityPresetOptions
        ss2022Method?: Ss2022Method
    }
): { added: BuiltSingBoxPreset[]; config: Record<string, unknown> } => {
    if (config.inbounds !== undefined && !Array.isArray(config.inbounds)) {
        throw new Error('The current sing-box config has a non-array inbounds field.')
    }
    const inbounds = Array.isArray(config.inbounds) ? config.inbounds : []
    const usedPorts = new Set(options.reservedPorts ?? [])
    const usedTags = new Set(options.reservedTags ?? [])
    for (const inbound of inbounds) {
        const port = getInboundPort(inbound)
        if (port) usedPorts.add(port)
        if (inbound && typeof inbound === 'object' && !Array.isArray(inbound)) {
            const tag = (inbound as Record<string, unknown>).tag
            if (typeof tag === 'string') usedTags.add(tag)
        }
    }

    const added = presetIds.map((presetId) => {
        const inbound = buildInbound(presetId, options.tls, usedPorts, usedTags, options)
        const tls = inbound.tls as { reality?: { private_key?: string } } | undefined
        return {
            presetId,
            inbound,
            ...(tls?.reality?.private_key
                ? { realityPublicKey: deriveX25519PublicKey(tls.reality.private_key) }
                : {})
        }
    })
    return {
        added,
        config: { ...config, inbounds: [...inbounds, ...added.map((item) => item.inbound)] }
    }
}
