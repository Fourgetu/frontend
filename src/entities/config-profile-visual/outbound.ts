import type {
    JsonObject,
    VisualCoreType,
    VisualOutbound,
    VisualOutboundReference
} from './types.ts'

import { collectOutboundReferences } from './references.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export type OutboundEndpointPaths = {
    serverPath?: Array<string | number>
    portPath?: Array<string | number>
}

const firstObject = (...values: unknown[]): JsonObject | undefined => values.find(isObject)

export const getOutboundEndpointPaths = (
    outbound: JsonObject,
    coreType: VisualCoreType
): OutboundEndpointPaths => {
    if (coreType === 'singbox') {
        return {
            serverPath: typeof outbound.server === 'string' ? ['server'] : undefined,
            portPath:
                typeof outbound.server_port === 'number' || typeof outbound.server_port === 'string'
                    ? ['server_port']
                    : undefined
        }
    }

    const settings = isObject(outbound.settings) ? outbound.settings : undefined
    const vnext = Array.isArray(settings?.vnext) ? settings.vnext[0] : undefined
    const servers = Array.isArray(settings?.servers) ? settings.servers[0] : undefined
    const endpoint = firstObject(vnext, servers, settings?.server)
    if (!endpoint) return {}
    const prefix = vnext
        ? ['settings', 'vnext', 0]
        : servers
          ? ['settings', 'servers', 0]
          : ['settings']
    return {
        serverPath: typeof endpoint.address === 'string' ? [...prefix, 'address'] : undefined,
        portPath:
            typeof endpoint.port === 'number' || typeof endpoint.port === 'string'
                ? [...prefix, 'port']
                : undefined
    }
}

export const getOutboundReferences = (
    rawConfig: JsonObject,
    tag: string
): VisualOutboundReference[] =>
    collectOutboundReferences(rawConfig).filter((item) => item.tag === tag)

export const hasAdvancedOutboundSelectors = (rawConfig: JsonObject): boolean =>
    collectOutboundReferences(rawConfig).some((item) => item.kind === 'advanced')

export const cloneOutbound = (outbound: JsonObject): JsonObject =>
    JSON.parse(JSON.stringify(outbound)) as JsonObject

export const validateOutboundCollection = (
    rawOutbounds: unknown[],
    candidate: JsonObject,
    options: { ignoreIndex?: number; existingTag?: string } = {}
): string[] => {
    const tag = typeof candidate.tag === 'string' ? candidate.tag.trim() : ''
    const errors: string[] = []
    if (!tag) errors.push('Outbound tag is required.')
    const duplicate = rawOutbounds.some((value, index) => {
        if (index === options.ignoreIndex || !isObject(value)) return false
        return value.tag === tag
    })
    if (duplicate && tag !== options.existingTag) {
        errors.push(`Outbound tag "${tag}" is already used.`)
    }
    return errors
}

export const getOutboundDisplay = (outbound: VisualOutbound) => ({
    protocol: outbound.protocol,
    server: outbound.server ?? '—',
    port: outbound.port === undefined ? '—' : String(outbound.port),
    transport: outbound.transport ?? '—',
    security: outbound.security ?? '—'
})

export type OutboundTemplateId =
    | 'freedom'
    | 'blackhole'
    | 'vless'
    | 'vmess'
    | 'trojan'
    | 'shadowsocks'
    | 'socks'
    | 'http'
    | 'direct'
    | 'block'

export const getOutboundTemplateOptions = (coreType: VisualCoreType) =>
    coreType === 'xray'
        ? [
              ['freedom', 'Freedom / Direct'],
              ['blackhole', 'Blackhole / Block']
          ]
        : [
              ['direct', 'direct'],
              ['block', 'block']
          ]

export const createOutboundTemplate = (
    coreType: VisualCoreType,
    templateId: OutboundTemplateId,
    tag: string,
    server: string,
    port: number | undefined
): JsonObject => {
    if (coreType === 'singbox') {
        if (templateId === 'direct' || templateId === 'block') {
            return { type: templateId, tag }
        }
        throw new Error('This sing-box outbound template is not enabled.')
    }

    if (templateId === 'freedom' || templateId === 'blackhole') {
        return { protocol: templateId, tag }
    }
    if (!server.trim() || !port)
        throw new Error('Server and port are required for proxy outbounds.')

    switch (templateId) {
        case 'vless':
            return {
                protocol: 'vless',
                tag,
                settings: {
                    vnext: [
                        { address: server.trim(), port, users: [{ id: '', encryption: 'none' }] }
                    ]
                }
            }
        case 'vmess':
            return {
                protocol: 'vmess',
                tag,
                settings: {
                    vnext: [{ address: server.trim(), port, users: [{ id: '', security: 'auto' }] }]
                }
            }
        case 'trojan':
            return {
                protocol: 'trojan',
                tag,
                settings: { servers: [{ address: server.trim(), port, password: '' }] }
            }
        case 'shadowsocks':
            return {
                protocol: 'shadowsocks',
                tag,
                settings: {
                    servers: [{ address: server.trim(), port, method: 'aes-128-gcm', password: '' }]
                }
            }
        case 'socks':
        case 'http':
            return {
                protocol: templateId,
                tag,
                settings: { servers: [{ address: server.trim(), port, users: [] }] }
            }
        default:
            throw new Error(`Unsupported outbound template: ${templateId}`)
    }
}
