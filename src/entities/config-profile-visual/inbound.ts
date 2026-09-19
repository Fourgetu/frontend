import type { JsonObject, VisualCoreType, VisualInbound } from './types.ts'

import {
    appendProtocolPresets,
    type ProtocolPresetBuildOptions,
    type ProtocolPresetId
} from '../../features/dashboard/config-profiles/protocol-presets/model/protocol-presets.ts'
import { appendSingBoxProtocolPresets } from '../../features/dashboard/nodes/quick-deploy/model/singbox-protocol-presets.ts'
import {
    PANEL_CERTIFICATE_URI,
    PANEL_PRIVATE_KEY_URI
} from '../../shared/tls/managed-certificate.ts'
import { collectInboundReferences } from './references.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizedListen = (listen: unknown): string => {
    if (typeof listen !== 'string' || !listen.trim()) return '*'
    const value = listen.trim().toLowerCase()
    return value === '0.0.0.0' || value === '::' ? '*' : value
}

const inboundPort = (value: unknown): number | undefined => {
    if (!isObject(value)) return undefined
    const port = value.port ?? value.listen_port
    return typeof port === 'number' && Number.isInteger(port) ? port : undefined
}

const inboundNetwork = (value: unknown): 'tcp' | 'udp' => {
    if (!isObject(value)) return 'tcp'
    const protocol = String(value.protocol ?? value.type ?? '').toLowerCase()
    const streamSettings = isObject(value.streamSettings) ? value.streamSettings : undefined
    const network = String(streamSettings?.network ?? '').toLowerCase()
    return protocol.includes('hysteria') ||
        protocol.includes('tuic') ||
        network.includes('quic') ||
        network.includes('kcp') ||
        network.includes('hysteria')
        ? 'udp'
        : 'tcp'
}

const addressesOverlap = (left: string, right: string): boolean =>
    left === '*' || right === '*' || left === right

export const getInboundPortConflict = (
    rawInbounds: unknown[],
    candidate: JsonObject,
    ignoreIndex?: number
): string | undefined => {
    const port = inboundPort(candidate)
    if (port === undefined) return undefined
    const listen = normalizedListen(candidate.listen)
    const network = inboundNetwork(candidate)
    for (let index = 0; index < rawInbounds.length; index += 1) {
        if (index === ignoreIndex) continue
        const other = rawInbounds[index]
        if (!isObject(other) || inboundPort(other) !== port) continue
        if (inboundNetwork(other) !== network) continue
        if (addressesOverlap(listen, normalizedListen(other.listen))) {
            const tag = typeof other.tag === 'string' ? other.tag : `Inbound #${index + 1}`
            return `${network.toUpperCase()} ${listen}:${port} conflicts with ${tag}.`
        }
    }
    return undefined
}

export const validateInboundCollection = (
    rawInbounds: unknown[],
    candidate: JsonObject,
    options: { ignoreIndex?: number; existingTag?: string } = {}
): string[] => {
    const errors: string[] = []
    const tag = typeof candidate.tag === 'string' ? candidate.tag.trim() : ''
    if (!tag) errors.push('Inbound tag is required.')
    const duplicate = rawInbounds.some((value, index) => {
        if (index === options.ignoreIndex || !isObject(value)) return false
        return value.tag === tag
    })
    if (duplicate && tag !== options.existingTag)
        errors.push(`Inbound tag "${tag}" is already used.`)
    const conflict = getInboundPortConflict(rawInbounds, candidate, options.ignoreIndex)
    if (conflict) errors.push(conflict)
    return errors
}

export const getInboundReferences = (rawConfig: JsonObject, tag: string) =>
    collectInboundReferences(rawConfig).filter((reference) => reference.tag === tag)

export const getInboundByIndex = (rawConfig: JsonObject, index: number): JsonObject | undefined => {
    const inbounds = rawConfig.inbounds
    if (!Array.isArray(inbounds)) return undefined
    const value = inbounds[index]
    return isObject(value) ? value : undefined
}

export const createInboundFromProtocolPreset = (
    rawConfig: JsonObject,
    coreType: VisualCoreType,
    presetId: ProtocolPresetId | 'singbox-hysteria2' | 'singbox-anytls' | 'singbox-socks5',
    options: ProtocolPresetBuildOptions & {
        singboxTls?: { domain: string; certificateFile: string; keyFile: string }
    }
): JsonObject => {
    if (coreType === 'xray') {
        const result = appendProtocolPresets(rawConfig, [presetId as ProtocolPresetId], options)
        return result.added[0].inbound
    }
    const result = appendSingBoxProtocolPresets(rawConfig, [presetId as never], {
        reservedTags: [],
        reservedPorts: [],
        tls: options.singboxTls ?? {
            domain: '',
            certificateFile: PANEL_CERTIFICATE_URI,
            keyFile: PANEL_PRIVATE_KEY_URI,
            source: 'panel'
        }
    })
    return result.added[0].inbound as unknown as JsonObject
}

export const getInboundDisplay = (inbound: VisualInbound) => ({
    protocol: inbound.protocol,
    listen: inbound.listen || '0.0.0.0',
    port: inbound.port === undefined ? '—' : String(inbound.port),
    transport: inbound.transport ?? '—',
    security: inbound.security ?? '—'
})

export const cloneInbound = (inbound: JsonObject): JsonObject =>
    JSON.parse(JSON.stringify(inbound)) as JsonObject
