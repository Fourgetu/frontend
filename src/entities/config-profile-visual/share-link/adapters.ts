import type { JsonObject, VisualCoreType } from '../types.ts'
import type { NormalizedOutboundLink } from './types.ts'

import { buildRelayOutbound } from '../../../features/dashboard/nodes/relay/model/relay.ts'
import { ShareLinkError } from './parser.ts'

const transport = (link: NormalizedOutboundLink): JsonObject | undefined => {
    switch (link.network) {
        case 'ws':
            return {
                type: 'ws',
                path: link.path ?? '/',
                ...(link.host ? { headers: { Host: link.host } } : {})
            }
        case 'grpc':
            return { type: 'grpc', service_name: link.serviceName ?? link.path ?? '' }
        case 'httpupgrade':
            return { type: 'httpupgrade', path: link.path ?? '/', host: link.host ?? '' }
        default:
            return undefined
    }
}

const tls = (link: NormalizedOutboundLink): JsonObject | undefined => {
    if (link.security === 'none') return undefined
    return {
        enabled: true,
        server_name: link.sni ?? link.address,
        ...(link.alpn ? { alpn: link.alpn } : {}),
        ...(link.allowInsecure ? { insecure: true } : {}),
        ...(link.fingerprint ? { utls: { enabled: true, fingerprint: link.fingerprint } } : {}),
        ...(link.security === 'reality'
            ? {
                  reality: {
                      enabled: true,
                      public_key: link.publicKey ?? '',
                      short_id: link.shortId ?? ''
                  }
              }
            : {})
    }
}

const buildSingboxOutbound = (link: NormalizedOutboundLink, tag: string): JsonObject => {
    const common = {
        tag,
        server: link.address,
        server_port: link.port,
        ...(transport(link) ? { transport: transport(link) } : {}),
        ...(tls(link) ? { tls: tls(link) } : {})
    }
    switch (link.protocol) {
        case 'vless':
            return {
                type: 'vless',
                ...common,
                uuid: link.uuid ?? '',
                ...(link.flow ? { flow: link.flow } : {})
            }
        case 'vmess':
            return {
                type: 'vmess',
                ...common,
                uuid: link.uuid ?? '',
                security: link.vmessSecurity ?? 'auto',
                alter_id: link.alterId ?? 0
            }
        case 'trojan':
            return { type: 'trojan', ...common, password: link.password ?? '' }
        case 'shadowsocks':
            return {
                type: 'shadowsocks',
                ...common,
                method: link.method ?? '',
                password: link.password ?? '',
                ...(link.plugin
                    ? { plugin: link.plugin, plugin_opts: link.pluginOptions ?? '' }
                    : {})
            }
        case 'hysteria2':
            return {
                type: 'hysteria2',
                ...common,
                password: link.password ?? '',
                ...(link.obfs
                    ? { obfs: { type: link.obfs, password: link.obfsPassword ?? '' } }
                    : {})
            }
        case 'tuic':
            return {
                type: 'tuic',
                ...common,
                uuid: link.uuid ?? '',
                password: link.password ?? '',
                congestion_control: 'bbr'
            }
    }
}

export const getShareLinkCoreSupport = (
    protocol: NormalizedOutboundLink['protocol']
): readonly VisualCoreType[] =>
    protocol === 'hysteria2' || protocol === 'tuic' ? ['singbox'] : ['xray', 'singbox']

export const adaptShareLinkToOutbound = (
    link: NormalizedOutboundLink,
    coreType: VisualCoreType,
    tag: string
): JsonObject => {
    if (!getShareLinkCoreSupport(link.protocol).includes(coreType)) {
        throw new ShareLinkError(
            'unsupported-core',
            `${link.protocol} share links cannot be represented safely by ${coreType}.`
        )
    }
    if (coreType === 'xray' && link.protocol === 'shadowsocks' && link.plugin) {
        throw new ShareLinkError(
            'unsupported-core',
            'This Shadowsocks plugin can be represented by sing-box, but not safely by the Xray adapter.'
        )
    }
    if (coreType === 'singbox') return buildSingboxOutbound(link, tag)
    return buildRelayOutbound(
        link as Parameters<typeof buildRelayOutbound>[0],
        tag
    ) as unknown as JsonObject
}

export const suggestedShareLinkTag = (link: NormalizedOutboundLink): string => {
    const source = link.remark?.trim() || `${link.protocol}-${link.address}`
    return (
        source
            .replace(/[^a-zA-Z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || `${link.protocol}-outbound`
    )
}
