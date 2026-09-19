import type { NormalizedOutboundLink } from './types.ts'

import {
    parseRelayUri,
    RelayUriError,
    type RelayTarget
} from '../../../features/dashboard/nodes/relay/model/relay.ts'

export class ShareLinkError extends Error {
    readonly code: 'invalid-uri' | 'unsupported-core' | 'unsupported-protocol'

    constructor(
        code: 'invalid-uri' | 'unsupported-core' | 'unsupported-protocol',
        message: string
    ) {
        super(message)
        this.name = 'ShareLinkError'
        this.code = code
    }
}

const portOf = (url: URL, fallback = 443): number => {
    const port = Number(url.port || fallback)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new ShareLinkError('invalid-uri', 'The share link contains an invalid port.')
    }
    return port
}

const value = (input: string | null): string | undefined => {
    const normalized = input?.trim()
    return normalized || undefined
}

const parseAlpn = (input: string | null): string[] | undefined => {
    const values = input
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    return values?.length ? values : undefined
}

const decode = (input: string): string => {
    try {
        return decodeURIComponent(input)
    } catch {
        return input
    }
}

const decodeBase64 = (input: string): string => {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    try {
        const binary = globalThis.atob(padded)
        return new TextDecoder().decode(
            Uint8Array.from(binary, (character) => character.charCodeAt(0))
        )
    } catch {
        throw new ShareLinkError('invalid-uri', 'The Shadowsocks link contains invalid base64.')
    }
}

const parseShadowsocks = (raw: string): NormalizedOutboundLink => {
    const hashIndex = raw.indexOf('#')
    const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
    const queryIndex = withoutHash.indexOf('?')
    const withoutQuery = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
    const query = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '')
    const payload = withoutQuery.slice('ss://'.length)
    const at = payload.lastIndexOf('@')
    let credentials: string
    let endpoint: string
    if (at >= 0) {
        const encodedCredentials = decode(payload.slice(0, at))
        credentials = encodedCredentials.includes(':')
            ? encodedCredentials
            : decodeBase64(encodedCredentials)
        endpoint = payload.slice(at + 1)
    } else {
        const decoded = decodeBase64(payload)
        const decodedAt = decoded.lastIndexOf('@')
        if (decodedAt < 0)
            throw new ShareLinkError('invalid-uri', 'The Shadowsocks link has no server.')
        credentials = decoded.slice(0, decodedAt)
        endpoint = decoded.slice(decodedAt + 1)
    }
    const separator = credentials.indexOf(':')
    const endpointMatch = /^\[([^\]]+)\]:(\d+)$|^(.+):(\d+)$/.exec(endpoint)
    if (separator < 1 || !endpointMatch) {
        throw new ShareLinkError('invalid-uri', 'The Shadowsocks link is incomplete.')
    }
    const pluginValue = value(query.get('plugin'))
    const [plugin, ...pluginOptions] = pluginValue?.split(';') ?? []
    return {
        address: endpointMatch[1] ?? endpointMatch[3],
        method: credentials.slice(0, separator),
        network: 'tcp',
        password: credentials.slice(separator + 1),
        plugin,
        pluginOptions: pluginOptions.join(';') || undefined,
        port: Number(endpointMatch[2] ?? endpointMatch[4]),
        protocol: 'shadowsocks',
        remark: hashIndex >= 0 ? value(decode(raw.slice(hashIndex + 1))) : undefined,
        security: 'none'
    }
}

const parseHysteria2 = (raw: string): NormalizedOutboundLink => {
    const url = new URL(raw)
    const password = decode(url.username || url.password)
    if (!url.hostname || !password) {
        throw new ShareLinkError('invalid-uri', 'Hysteria2 requires a server and password.')
    }
    return {
        address: url.hostname,
        alpn: parseAlpn(url.searchParams.get('alpn')),
        allowInsecure: ['1', 'true'].includes(url.searchParams.get('insecure') ?? ''),
        network: 'udp',
        obfs: value(url.searchParams.get('obfs')),
        obfsPassword: value(
            url.searchParams.get('obfs-password') ?? url.searchParams.get('obfsPassword')
        ),
        password,
        port: portOf(url),
        protocol: 'hysteria2',
        remark: value(decode(url.hash.slice(1))),
        security: 'tls',
        sni: value(url.searchParams.get('sni'))
    }
}

const parseTuic = (raw: string): NormalizedOutboundLink => {
    const url = new URL(raw)
    const uuid = decode(url.username)
    const password = decode(url.password)
    if (!url.hostname || !uuid || !password) {
        throw new ShareLinkError('invalid-uri', 'TUIC requires a server, UUID and password.')
    }
    return {
        address: url.hostname,
        alpn: parseAlpn(url.searchParams.get('alpn')),
        allowInsecure: ['1', 'true'].includes(url.searchParams.get('allow_insecure') ?? ''),
        network: 'udp',
        password,
        port: portOf(url),
        protocol: 'tuic',
        remark: value(decode(url.hash.slice(1))),
        security: 'tls',
        sni: value(url.searchParams.get('sni')),
        uuid
    }
}

const relayTarget = (target: RelayTarget): NormalizedOutboundLink => {
    if (!['vless', 'vmess', 'trojan', 'shadowsocks'].includes(target.protocol)) {
        throw new ShareLinkError(
            'unsupported-protocol',
            `The ${target.protocol} share-link protocol is not supported here.`
        )
    }
    return {
        ...target,
        protocol: target.protocol as NormalizedOutboundLink['protocol']
    }
}

export const parseShareLink = (raw: string): NormalizedOutboundLink => {
    const input = raw.trim()
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(input)?.[1].toLowerCase()
    if (!scheme) throw new ShareLinkError('invalid-uri', 'Paste a complete protocol share link.')
    try {
        if (scheme === 'hysteria2' || scheme === 'hy2') return parseHysteria2(input)
        if (scheme === 'tuic') return parseTuic(input)
        if (scheme === 'ss') return parseShadowsocks(input)
        if (!['vless', 'vmess', 'trojan', 'ss'].includes(scheme)) {
            throw new ShareLinkError(
                'unsupported-protocol',
                `The ${scheme} share-link protocol is not supported.`
            )
        }
        const target = parseRelayUri(input)
        if (!['vless', 'vmess', 'trojan', 'shadowsocks'].includes(target.protocol)) {
            throw new ShareLinkError(
                'unsupported-protocol',
                `The ${target.protocol} share-link protocol is not supported here.`
            )
        }
        const normalized = relayTarget(target)
        const hash = new URL(input).hash.slice(1)
        return { ...normalized, remark: hash ? value(decode(hash)) : normalized.remark }
    } catch (error) {
        if (error instanceof ShareLinkError) throw error
        if (error instanceof RelayUriError) {
            throw new ShareLinkError(
                error.code === 'unsupported-protocol' ? 'unsupported-protocol' : 'invalid-uri',
                error.message
            )
        }
        throw new ShareLinkError(
            'invalid-uri',
            error instanceof Error ? error.message : 'The share link is invalid.'
        )
    }
}
