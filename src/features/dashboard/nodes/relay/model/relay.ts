import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

import { stripRealityServerOnlyFieldsFromOutbound } from '../../../config-profiles/protocol-presets/model/reality-compatibility.ts'

export type RelayProtocol = 'http' | 'shadowsocks' | 'socks' | 'trojan' | 'vless' | 'vmess'

export type RelayNetwork = 'grpc' | 'httpupgrade' | 'kcp' | 'raw' | 'tcp' | 'ws' | 'xhttp'

export interface RelayTarget {
    address: string
    alpn?: string[]
    allowInsecure?: boolean
    encryption?: string
    fingerprint?: string
    flow?: string
    headerType?: 'http' | 'none'
    host?: string
    method?: string
    network: RelayNetwork
    password?: string
    path?: string
    port: number
    protocol: RelayProtocol
    publicKey?: string
    remark?: string
    security: 'none' | 'reality' | 'tls'
    serviceName?: string
    shortId?: string
    spiderX?: string
    sni?: string
    username?: string
    uuid?: string
    vmessSecurity?: string
}

export interface RelayOutbound {
    protocol: RelayProtocol
    settings: Record<string, unknown>
    streamSettings?: Record<string, unknown>
    tag: string
}

export interface RelayRoutingRule {
    inboundTag: string[]
    outboundTag: string
    type: 'field'
}

export interface RelayTargetSummary {
    address: string
    alpn?: string[]
    fingerprint?: string
    flow?: string
    network: RelayNetwork
    port: number
    protocol: RelayProtocol
    security: 'none' | 'reality' | 'tls'
    serverName?: string
    serviceName?: string
}

export type RelayAction = 'create' | 'reuse'

export class RelayUriError extends Error {
    readonly code:
        | 'invalid-uri'
        | 'missing-address'
        | 'missing-credential'
        | 'missing-port'
        | 'unsupported-protocol'
        | 'unsupported-shadowsocks-plugin'

    constructor(code: RelayUriError['code'], message: string) {
        super(message)
        this.name = 'RelayUriError'
        this.code = code
    }
}

const DEFAULT_PORTS: Partial<Record<RelayProtocol, number>> = {
    http: 80,
    shadowsocks: 443,
    socks: 1080,
    trojan: 443,
    vless: 443,
    vmess: 443
}

const RELAY_NETWORKS = new Set<RelayNetwork>([
    'grpc',
    'httpupgrade',
    'kcp',
    'raw',
    'tcp',
    'ws',
    'xhttp'
])

const RELAY_SECURITIES = new Set<RelayTarget['security']>(['none', 'reality', 'tls'])

const asNonEmptyString = (value: string | null | undefined): string | undefined => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
}

const decodeURIComponentSafe = (value: string): string => {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

const decodeBase64Utf8 = (value: string): string => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    try {
        const binary = globalThis.atob(padded)
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
        return new TextDecoder().decode(bytes)
    } catch {
        throw new RelayUriError('invalid-uri', 'The relay URI contains invalid base64 data.')
    }
}

const parsePort = (value: string | null | undefined, fallback?: number): number => {
    const parsed = value ? Number(value) : fallback
    if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new RelayUriError('missing-port', 'The relay URI must contain a valid port.')
    }
    return parsed
}

const parseNetwork = (value: string | null | undefined): RelayNetwork => {
    const normalized = (value ?? 'tcp').toLowerCase() as RelayNetwork
    return RELAY_NETWORKS.has(normalized) ? normalized : 'tcp'
}

const parseSecurity = (
    value: string | null | undefined,
    fallback: RelayTarget['security']
): RelayTarget['security'] => {
    const normalized = (value ?? fallback).toLowerCase() as RelayTarget['security']
    return RELAY_SECURITIES.has(normalized) ? normalized : fallback
}

const parseAlpn = (value: string | null | undefined): string[] | undefined => {
    const values = value
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    return values?.length ? values : undefined
}

const parseCommonTransport = (
    params: URLSearchParams,
    network: RelayNetwork
): Pick<RelayTarget, 'headerType' | 'host' | 'path' | 'serviceName'> => {
    const path = asNonEmptyString(params.get('path'))
    const host = asNonEmptyString(params.get('host')) ?? asNonEmptyString(params.get('authority'))
    const rawHeaderType = asNonEmptyString(params.get('headerType'))?.toLowerCase()
    const headerType: RelayTarget['headerType'] =
        rawHeaderType === 'http' || rawHeaderType === 'none' ? rawHeaderType : undefined
    const serviceName =
        network === 'grpc'
            ? (asNonEmptyString(params.get('serviceName')) ?? path)
            : asNonEmptyString(params.get('serviceName'))

    return { headerType, host, path, serviceName }
}

const parseCommonSecurity = (
    params: URLSearchParams,
    security: RelayTarget['security']
): Pick<
    RelayTarget,
    'alpn' | 'allowInsecure' | 'fingerprint' | 'publicKey' | 'shortId' | 'spiderX' | 'sni'
> => ({
    alpn: parseAlpn(params.get('alpn')),
    allowInsecure:
        params.get('allowInsecure') === 'true' ||
        params.get('insecure') === '1' ||
        params.get('insecure') === 'true'
            ? true
            : undefined,
    fingerprint: asNonEmptyString(params.get('fp')),
    publicKey: security === 'reality' ? asNonEmptyString(params.get('pbk')) : undefined,
    shortId: security === 'reality' ? asNonEmptyString(params.get('sid')) : undefined,
    spiderX: security === 'reality' ? asNonEmptyString(params.get('spx')) : undefined,
    sni: asNonEmptyString(params.get('sni'))
})

const parseUrl = (raw: string, scheme: string): URL => {
    try {
        const url = new URL(raw)
        if (url.protocol !== `${scheme}:`) {
            throw new RelayUriError('invalid-uri', `Expected a ${scheme} relay URI.`)
        }
        return url
    } catch (error) {
        if (error instanceof RelayUriError) throw error
        throw new RelayUriError('invalid-uri', 'The relay URI is not valid.')
    }
}

const requireAddress = (address: string, protocol: RelayProtocol): string => {
    if (!address.trim()) {
        throw new RelayUriError('missing-address', `The ${protocol} relay URI has no address.`)
    }
    return address.trim()
}

const parseVless = (raw: string): RelayTarget => {
    const url = parseUrl(raw, 'vless')
    const uuid = decodeURIComponentSafe(url.username)
    if (!uuid) throw new RelayUriError('missing-credential', 'The VLESS URI has no UUID.')
    const network = parseNetwork(url.searchParams.get('type'))
    const security = parseSecurity(url.searchParams.get('security'), 'none')
    const transport = parseCommonTransport(url.searchParams, network)
    const commonSecurity = parseCommonSecurity(url.searchParams, security)

    return {
        address: requireAddress(url.hostname, 'vless'),
        ...commonSecurity,
        ...transport,
        encryption: asNonEmptyString(url.searchParams.get('encryption')) ?? 'none',
        flow: asNonEmptyString(url.searchParams.get('flow')),
        network,
        password: undefined,
        port: parsePort(url.port, DEFAULT_PORTS.vless),
        protocol: 'vless',
        security,
        uuid,
        remark: asNonEmptyString(url.hash.slice(1))
    }
}

const parseTrojan = (raw: string): RelayTarget => {
    const url = parseUrl(raw, 'trojan')
    const password = decodeURIComponentSafe(url.username || url.password)
    if (!password) throw new RelayUriError('missing-credential', 'The Trojan URI has no password.')
    const network = parseNetwork(url.searchParams.get('type'))
    const security = parseSecurity(url.searchParams.get('security'), 'tls')
    const transport = parseCommonTransport(url.searchParams, network)
    const commonSecurity = parseCommonSecurity(url.searchParams, security)

    return {
        address: requireAddress(url.hostname, 'trojan'),
        ...commonSecurity,
        ...transport,
        network,
        password,
        port: parsePort(url.port, DEFAULT_PORTS.trojan),
        protocol: 'trojan',
        security,
        remark: asNonEmptyString(url.hash.slice(1))
    }
}

const parseVmess = (raw: string): RelayTarget => {
    const encoded = raw.slice('vmess://'.length).split('#')[0]
    const decoded = JSON.parse(decodeBase64Utf8(decodeURIComponentSafe(encoded))) as Record<
        string,
        unknown
    >
    const address = typeof decoded.add === 'string' ? decoded.add : ''
    const uuid = typeof decoded.id === 'string' ? decoded.id : ''
    if (!uuid) throw new RelayUriError('missing-credential', 'The VMess URI has no UUID.')
    const network = parseNetwork(typeof decoded.net === 'string' ? decoded.net : 'tcp')
    const tlsValue = typeof decoded.tls === 'string' ? decoded.tls.toLowerCase() : ''
    const security = parseSecurity(tlsValue === 'tls' ? 'tls' : 'none', 'none')
    const alpn =
        typeof decoded.alpn === 'string'
            ? parseAlpn(decoded.alpn)
            : Array.isArray(decoded.alpn)
              ? decoded.alpn.filter((item): item is string => typeof item === 'string')
              : undefined
    const path = typeof decoded.path === 'string' ? decoded.path : undefined
    const serviceName = network === 'grpc' ? path : undefined
    const rawHeaderType =
        network === 'tcp' && typeof decoded.type === 'string' ? decoded.type.toLowerCase() : ''
    const headerType: RelayTarget['headerType'] =
        rawHeaderType === 'http' || rawHeaderType === 'none' ? rawHeaderType : undefined

    return {
        address: requireAddress(address, 'vmess'),
        alpn,
        allowInsecure:
            decoded.allowInsecure === true ||
            decoded.allowInsecure === 'true' ||
            decoded.allowInsecure === 1
                ? true
                : undefined,
        fingerprint: typeof decoded.fp === 'string' ? asNonEmptyString(decoded.fp) : undefined,
        headerType,
        host: typeof decoded.host === 'string' ? asNonEmptyString(decoded.host) : undefined,
        network,
        path,
        port: parsePort(String(decoded.port ?? ''), DEFAULT_PORTS.vmess),
        protocol: 'vmess',
        security,
        serviceName,
        sni: typeof decoded.sni === 'string' ? asNonEmptyString(decoded.sni) : undefined,
        uuid,
        vmessSecurity:
            typeof decoded.scy === 'string' && decoded.scy.trim() ? decoded.scy.trim() : 'auto',
        remark: typeof decoded.ps === 'string' ? decoded.ps : undefined
    }
}

const parseShadowsocks = (raw: string): RelayTarget => {
    const hashIndex = raw.indexOf('#')
    const withoutRemark = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
    const remark = hashIndex >= 0 ? decodeURIComponentSafe(raw.slice(hashIndex + 1)) : undefined
    const queryIndex = withoutRemark.indexOf('?')
    const withoutQuery = queryIndex >= 0 ? withoutRemark.slice(0, queryIndex) : withoutRemark
    if (queryIndex >= 0) {
        const query = new URLSearchParams(withoutRemark.slice(queryIndex + 1))
        if (query.get('plugin')) {
            throw new RelayUriError(
                'unsupported-shadowsocks-plugin',
                'The current relay does not support Shadowsocks plugins.'
            )
        }
    }

    const payload = withoutQuery.slice('ss://'.length)
    const atIndex = payload.lastIndexOf('@')
    let userInfo: string
    let hostPort: string

    if (atIndex >= 0) {
        const rawUserInfo = payload.slice(0, atIndex)
        userInfo = rawUserInfo.includes(':')
            ? decodeURIComponentSafe(rawUserInfo)
            : decodeBase64Utf8(decodeURIComponentSafe(rawUserInfo))
        hostPort = payload.slice(atIndex + 1)
    } else {
        const decoded = decodeBase64Utf8(payload)
        const decodedAt = decoded.lastIndexOf('@')
        if (decodedAt < 0) {
            throw new RelayUriError('invalid-uri', 'The Shadowsocks URI has no server address.')
        }
        userInfo = decoded.slice(0, decodedAt)
        hostPort = decoded.slice(decodedAt + 1)
    }

    const hostPortMatch = /^\[([^\]]+)\]:(\d+)$|^(.+):(\d+)$/.exec(hostPort)
    if (!hostPortMatch) throw new RelayUriError('missing-port', 'The Shadowsocks URI has no port.')
    const address = hostPortMatch[1] ?? hostPortMatch[3]
    const port = parsePort(hostPortMatch[2] ?? hostPortMatch[4], DEFAULT_PORTS.shadowsocks)
    const separator = userInfo.indexOf(':')
    if (separator < 1) {
        throw new RelayUriError('missing-credential', 'The Shadowsocks URI has no method.')
    }

    const method = userInfo.slice(0, separator).trim()
    const password = userInfo.slice(separator + 1)
    if (!method || !password) {
        throw new RelayUriError(
            'missing-credential',
            'The Shadowsocks URI has incomplete credentials.'
        )
    }

    return {
        address: requireAddress(address, 'shadowsocks'),
        method,
        network: 'tcp',
        password,
        port,
        protocol: 'shadowsocks',
        security: 'none',
        remark
    }
}

const parseSocksOrHttp = (raw: string, protocol: 'http' | 'socks'): RelayTarget => {
    const url = parseUrl(raw, urlProtocol(protocol, raw))
    const username = decodeURIComponentSafe(url.username)
    const password = decodeURIComponentSafe(url.password)
    const security = protocol === 'http' && url.protocol === 'https:' ? 'tls' : 'none'
    const params = url.searchParams
    return {
        address: requireAddress(url.hostname, protocol),
        allowInsecure: params.get('insecure') === '1' || params.get('insecure') === 'true',
        network: 'tcp',
        password: password || undefined,
        port: parsePort(url.port, DEFAULT_PORTS[protocol]),
        protocol,
        security,
        username: username || undefined,
        remark: asNonEmptyString(url.hash.slice(1))
    }
}

const urlProtocol = (protocol: 'http' | 'socks', raw: string): string => {
    if (protocol === 'socks') {
        const scheme = raw.slice(0, raw.indexOf(':')).toLowerCase()
        return scheme === 'socks5' || scheme === 'socks5h' ? scheme : 'socks'
    }
    return raw.startsWith('https://') ? 'https' : 'http'
}

export const parseRelayUri = (raw: string): RelayTarget => {
    const value = raw.trim()
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value)?.[1].toLowerCase()
    if (!scheme) throw new RelayUriError('invalid-uri', 'Paste a complete relay URI.')

    switch (scheme) {
        case 'http':
        case 'https':
            return parseSocksOrHttp(value, 'http')
        case 'ss':
            return parseShadowsocks(value)
        case 'socks':
        case 'socks5':
        case 'socks5h':
            return parseSocksOrHttp(value, 'socks')
        case 'trojan':
            return parseTrojan(value)
        case 'vless':
            return parseVless(value)
        case 'vmess':
            return parseVmess(value)
        default:
            throw new RelayUriError(
                'unsupported-protocol',
                `The relay protocol ${scheme} is not supported.`
            )
    }
}

const transportSettings = (target: RelayTarget): Record<string, unknown> => {
    switch (target.network) {
        case 'grpc':
            return {
                grpcSettings: {
                    ...(target.serviceName ? { serviceName: target.serviceName } : {}),
                    ...(target.host ? { authority: target.host } : {})
                }
            }
        case 'httpupgrade':
            return {
                httpupgradeSettings: {
                    path: target.path ?? '/',
                    ...(target.host ? { host: target.host } : {})
                }
            }
        case 'kcp':
            return { kcpSettings: {} }
        case 'ws':
            return {
                wsSettings: {
                    path: target.path ?? '/',
                    ...(target.host ? { headers: { Host: target.host } } : {})
                }
            }
        case 'xhttp':
            return {
                xhttpSettings: {
                    mode: 'auto',
                    path: target.path ?? '/',
                    ...(target.host ? { host: target.host } : {})
                }
            }
        case 'raw':
        case 'tcp':
        default: {
            const useHttpHeader =
                target.headerType !== undefined
                    ? target.headerType === 'http'
                    : Boolean(target.host || target.path)
            return {
                tcpSettings: {
                    header: {
                        type: useHttpHeader ? 'http' : 'none',
                        ...(useHttpHeader
                            ? {
                                  request: {
                                      headers: target.host ? { Host: [target.host] } : {},
                                      method: 'GET',
                                      path: [target.path ?? '/'],
                                      version: '1.1'
                                  }
                              }
                            : {})
                    }
                }
            }
        }
    }
}

const securitySettings = (target: RelayTarget): Record<string, unknown> => {
    if (target.security === 'tls') {
        return {
            security: 'tls',
            tlsSettings: {
                ...(target.allowInsecure !== undefined
                    ? { allowInsecure: target.allowInsecure }
                    : {}),
                ...(target.alpn ? { alpn: target.alpn } : {}),
                ...(target.fingerprint ? { fingerprint: target.fingerprint } : {}),
                ...(target.sni ? { serverName: target.sni } : {})
            }
        }
    }
    if (target.security === 'reality') {
        return {
            security: 'reality',
            realitySettings: {
                ...(target.fingerprint ? { fingerprint: target.fingerprint } : {}),
                ...(target.publicKey ? { publicKey: target.publicKey } : {}),
                ...(target.shortId ? { shortId: target.shortId } : {}),
                ...(target.sni ? { serverName: target.sni } : {}),
                ...(target.spiderX ? { spiderX: target.spiderX } : {})
            }
        }
    }
    return { security: 'none' }
}

const buildStreamSettings = (target: RelayTarget): Record<string, unknown> => ({
    network: target.network,
    ...transportSettings(target),
    ...securitySettings(target)
})

const buildSettings = (target: RelayTarget): Record<string, unknown> => {
    switch (target.protocol) {
        case 'http':
        case 'socks':
            return {
                servers: [
                    {
                        address: target.address,
                        port: target.port,
                        users:
                            target.username || target.password
                                ? [
                                      {
                                          pass: target.password ?? '',
                                          user: target.username ?? ''
                                      }
                                  ]
                                : []
                    }
                ]
            }
        case 'shadowsocks':
            return {
                servers: [
                    {
                        address: target.address,
                        method: target.method,
                        password: target.password,
                        port: target.port
                    }
                ]
            }
        case 'trojan':
            return {
                servers: [
                    {
                        address: target.address,
                        password: target.password,
                        port: target.port
                    }
                ]
            }
        case 'vmess':
            return {
                vnext: [
                    {
                        address: target.address,
                        port: target.port,
                        users: [
                            {
                                id: target.uuid,
                                security: target.vmessSecurity ?? 'auto'
                            }
                        ]
                    }
                ]
            }
        case 'vless':
            return {
                vnext: [
                    {
                        address: target.address,
                        port: target.port,
                        users: [
                            {
                                encryption: target.encryption ?? 'none',
                                flow: target.flow ?? '',
                                id: target.uuid
                            }
                        ]
                    }
                ]
            }
    }
}

export const buildRelayOutbound = (target: RelayTarget, tag: string): RelayOutbound => {
    const outbound = {
        protocol: target.protocol,
        settings: buildSettings(target),
        streamSettings: buildStreamSettings(target),
        tag
    }

    return stripRealityServerOnlyFieldsFromOutbound(outbound)
}

const stableSerialize = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
    if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
        .join(',')}}`
}

export const relayTargetFingerprint = (target: RelayTarget): string =>
    bytesToHex(
        sha256(
            new TextEncoder().encode(
                stableSerialize({
                    address: target.address.toLowerCase(),
                    alpn: target.alpn,
                    allowInsecure: target.allowInsecure,
                    encryption: target.encryption,
                    fingerprint: target.fingerprint,
                    flow: target.flow,
                    host: target.host,
                    method: target.method,
                    network: target.network,
                    password: target.password,
                    path: target.path,
                    port: target.port,
                    protocol: target.protocol,
                    publicKey: target.publicKey,
                    security: target.security,
                    serviceName: target.serviceName,
                    shortId: target.shortId,
                    spiderX: target.spiderX,
                    sni: target.sni,
                    username: target.username,
                    uuid: target.uuid,
                    vmessSecurity: target.vmessSecurity,
                    headerType: target.headerType
                })
            )
        )
    ).slice(0, 16)

const safeTagPart = (value: string): string =>
    value
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'inbound'

export const relayOutboundTag = (entryInboundTag: string, target: RelayTarget): string =>
    `relay-${safeTagPart(entryInboundTag)}-${relayTargetFingerprint(target)}`

export const relayLogicalIdentity = (input: {
    entryInboundUuid: string
    entryNodeUuid: string
    entryProfileUuid: string
    target: RelayTarget
}): string =>
    [
        input.entryNodeUuid,
        input.entryProfileUuid,
        input.entryInboundUuid,
        relayTargetFingerprint(input.target)
    ].join(':')

export const redactRelayTarget = (target: RelayTarget): RelayTargetSummary => ({
    address: target.address,
    alpn: target.alpn,
    fingerprint: target.fingerprint,
    flow: target.flow,
    network: target.network,
    port: target.port,
    protocol: target.protocol,
    security: target.security,
    serverName: target.sni,
    serviceName: target.serviceName
})

export const sanitizeRelayUri = (raw: string): string => {
    const value = raw.trim()
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value)?.[1].toLowerCase()
    if (!scheme) return 'invalid relay URI'
    try {
        const url = new URL(value)
        const host = url.hostname || 'unknown-host'
        const port = url.port ? `:${url.port}` : ''
        return `${scheme}://${host}${port}`
    } catch {
        return `${scheme}://invalid-host`
    }
}

const selectorsPresent = (rule: Record<string, unknown>): boolean =>
    ['attrs', 'domain', 'ip', 'network', 'port', 'protocol', 'source', 'sourcePort'].some(
        (key) => rule[key] !== undefined
    )

const isBlockRule = (rule: Record<string, unknown>): boolean => {
    const outboundTag = rule.outboundTag
    return (
        typeof outboundTag === 'string' &&
        ['BLOCK', 'blackhole', 'block'].includes(outboundTag.toLowerCase())
    )
}

const isCatchAllRule = (rule: Record<string, unknown>): boolean =>
    !selectorsPresent(rule) &&
    (typeof rule.outboundTag === 'string' || typeof rule.balancerTag === 'string')

export class RelayRoutingConflictError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'RelayRoutingConflictError'
    }
}

export interface RelayRoutingInsertion {
    action: RelayAction
    rules: unknown[]
}

export const insertRelayRoutingRule = (
    rules: unknown[] | undefined,
    relayRule: RelayRoutingRule
): RelayRoutingInsertion => {
    const existingRules = rules ? [...rules] : []
    let firstCatchAll = -1
    let lastBlock = -1

    for (let index = 0; index < existingRules.length; index += 1) {
        const value = existingRules[index]
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new RelayRoutingConflictError(
                'Routing contains a rule that cannot be classified.'
            )
        }
        const rule = value as Record<string, unknown>
        if (Object.keys(rule).length === 0) {
            throw new RelayRoutingConflictError(
                'Routing contains an empty rule that cannot be classified.'
            )
        }
        const inboundTags = Array.isArray(rule.inboundTag)
            ? rule.inboundTag.filter((item): item is string => typeof item === 'string')
            : []

        if (inboundTags.includes(relayRule.inboundTag[0])) {
            if (rule.outboundTag === relayRule.outboundTag) {
                return { action: 'reuse', rules: existingRules }
            }
            throw new RelayRoutingConflictError(
                `Inbound ${relayRule.inboundTag[0]} is already routed to another outbound.`
            )
        }

        if (isBlockRule(rule)) lastBlock = index
        if (firstCatchAll < 0 && !isBlockRule(rule) && isCatchAllRule(rule)) {
            firstCatchAll = index
        }
    }

    if (firstCatchAll >= 0 && lastBlock > firstCatchAll) {
        throw new RelayRoutingConflictError(
            'A BLOCK rule appears after a catch-all rule; routing order needs manual review.'
        )
    }

    const insertionIndex =
        firstCatchAll >= 0 ? firstCatchAll : Math.max(lastBlock + 1, existingRules.length)
    const nextRules = [...existingRules]
    nextRules.splice(insertionIndex, 0, relayRule)
    return { action: 'create', rules: nextRules }
}

export interface RelayConfigMergeResult {
    config: Record<string, unknown>
    outbound: RelayAction
    routing: RelayAction
}

const outboundEquivalent = (left: Record<string, unknown>, right: RelayOutbound): boolean =>
    stableSerialize({ ...left, tag: undefined }) === stableSerialize({ ...right, tag: undefined })

export const mergeRelayIntoConfig = (input: {
    config: Record<string, unknown>
    outbound: RelayOutbound
    rule: RelayRoutingRule
}): RelayConfigMergeResult => {
    const outbounds = Array.isArray(input.config.outbounds) ? [...input.config.outbounds] : []
    const matchingOutbound = outbounds.find(
        (value) =>
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            (value as Record<string, unknown>).tag === input.outbound.tag
    ) as Record<string, unknown> | undefined

    let outboundAction: RelayAction = 'create'
    if (matchingOutbound) {
        if (!outboundEquivalent(matchingOutbound, input.outbound)) {
            throw new RelayRoutingConflictError(
                `Outbound tag ${input.outbound.tag} is already used by a different outbound.`
            )
        }
        outboundAction = 'reuse'
    } else {
        outbounds.push(input.outbound)
    }

    const routingResult = insertRelayRoutingRule(
        Array.isArray((input.config.routing as Record<string, unknown> | undefined)?.rules)
            ? ((input.config.routing as Record<string, unknown>).rules as unknown[])
            : undefined,
        input.rule
    )
    const routingRecord =
        input.config.routing &&
        typeof input.config.routing === 'object' &&
        !Array.isArray(input.config.routing)
            ? (input.config.routing as Record<string, unknown>)
            : undefined
    const routing = {
        ...routingRecord,
        rules: routingResult.rules
    }

    return {
        config: { ...input.config, outbounds, routing },
        outbound: outboundAction,
        routing: routingResult.action
    }
}
