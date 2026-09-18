import type {
    JsonObject,
    VisualCoreType,
    VisualDocument,
    VisualInbound,
    VisualOutbound,
    VisualRoutingRule,
    VisualRealityDetails,
    VisualSummary
} from './types.ts'

import { dnsSummaryItems, parseDnsDetails } from './dns.ts'
import { collectVisualReferences } from './references.ts'
import { getUnknownFieldPaths, getUnsupportedPaths } from './unknown-fields.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const arrayOfObjects = (value: unknown): JsonObject[] =>
    Array.isArray(value) ? value.filter(isObject) : []

const summary = (values: JsonObject[], kind: string, readOnly = false): VisualSummary => ({
    count: values.length,
    items: values.map((value, index) => {
        const id = typeof value.tag === 'string' ? value.tag : `${kind}-${index}`
        const detail =
            typeof value.protocol === 'string'
                ? value.protocol
                : typeof value.type === 'string'
                  ? value.type
                  : undefined
        return { id, label: id, detail, readOnly }
    })
})

const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const stringValues = (value: unknown): string[] => {
    if (typeof value === 'string') return value ? [value] : []
    if (typeof value === 'number') return [String(value)]
    return stringArray(value)
}

const ruleValues = (value: unknown): string[] =>
    stringValues(value).flatMap((item) =>
        item
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
    )

const ruleSummary = (rule: VisualRoutingRule): string => {
    const condition =
        rule.domains.length > 0
            ? `域名 ${rule.domains.join(', ')}`
            : rule.ips.length > 0
              ? `IP ${rule.ips.join(', ')}`
              : rule.protocols.length > 0
                ? `协议 ${rule.protocols.join(', ')}`
                : rule.inboundTags.length > 0
                  ? `入站 ${rule.inboundTags.join(', ')}`
                  : '高级规则'
    const target = rule.outboundTag
        ? `→ ${rule.outboundTag}`
        : rule.balancerTag
          ? `→ 负载均衡 ${rule.balancerTag}`
          : '→ 未设置目标'
    return `${condition} ${target}`
}

const parseXrayRule = (value: JsonObject, index: number): VisualRoutingRule => {
    const rule: VisualRoutingRule = {
        index,
        id: typeof value.ruleTag === 'string' ? value.ruleTag : `rule-${index + 1}`,
        ruleTag: typeof value.ruleTag === 'string' ? value.ruleTag : undefined,
        domains: stringValues(value.domain),
        ips: stringValues(value.ip),
        ports:
            typeof value.port === 'string' || typeof value.port === 'number'
                ? String(value.port)
                : undefined,
        sourcePorts:
            typeof value.sourcePort === 'string' || typeof value.sourcePort === 'number'
                ? String(value.sourcePort)
                : undefined,
        networks: ruleValues(value.network),
        sources: stringValues(value.source ?? value.sourceIP),
        users: stringValues(value.user),
        inboundTags: stringValues(value.inboundTag),
        protocols: ruleValues(value.protocol),
        attrs: typeof value.attrs === 'string' ? value.attrs : undefined,
        outboundTag: typeof value.outboundTag === 'string' ? value.outboundTag : undefined,
        balancerTag: typeof value.balancerTag === 'string' ? value.balancerTag : undefined,
        targetKind:
            typeof value.outboundTag === 'string'
                ? 'outbound'
                : typeof value.balancerTag === 'string'
                  ? 'balancer'
                  : 'none',
        summary: '',
        raw: value,
        readOnly: typeof value.snippet === 'string' && value.snippet.length > 0,
        readOnlyReason:
            typeof value.snippet === 'string' && value.snippet.length > 0
                ? '此规则由 Snippet 管理。'
                : undefined
    }
    rule.summary = ruleSummary(rule)
    return rule
}

const parseSingboxRule = (value: JsonObject, index: number): VisualRoutingRule => {
    const rule: VisualRoutingRule = {
        index,
        id: `route-rule-${index + 1}`,
        domains: stringValues(
            value.domain ?? value.domain_suffix ?? value.domain_keyword ?? value.domain_regex
        ),
        ips: stringValues(value.ip_cidr),
        ports:
            typeof value.port === 'string' || typeof value.port === 'number'
                ? String(value.port)
                : undefined,
        sourcePorts:
            typeof value.source_port === 'string' || typeof value.source_port === 'number'
                ? String(value.source_port)
                : undefined,
        networks: ruleValues(value.network),
        sources: stringValues(value.source_ip_cidr),
        users: [],
        inboundTags: stringValues(value.inbound),
        protocols: ruleValues(value.protocol),
        attrs: undefined,
        outboundTag: typeof value.outbound === 'string' ? value.outbound : undefined,
        balancerTag: undefined,
        targetKind: typeof value.outbound === 'string' ? 'outbound' : 'none',
        summary: '',
        raw: value,
        readOnly: typeof value.snippet === 'string' && value.snippet.length > 0,
        readOnlyReason:
            typeof value.snippet === 'string' && value.snippet.length > 0
                ? '此规则由 Snippet 管理。'
                : undefined
    }
    rule.summary = ruleSummary(rule)
    return rule
}

const getRealityDetails = (
    streamSettings: JsonObject | undefined
): VisualRealityDetails | undefined => {
    if (streamSettings?.security !== 'reality' || !isObject(streamSettings.realitySettings)) {
        return undefined
    }
    const reality = streamSettings.realitySettings
    return {
        target: typeof reality.target === 'string' ? reality.target : undefined,
        serverNames: stringArray(reality.serverNames),
        shortIds: stringArray(reality.shortIds),
        minClientVer: typeof reality.minClientVer === 'string' ? reality.minClientVer : undefined,
        privateKeyPresent: typeof reality.privateKey === 'string' && reality.privateKey.length > 0
    }
}

const parseXrayInbound = (value: JsonObject, index: number): VisualInbound => {
    const streamSettings = isObject(value.streamSettings) ? value.streamSettings : undefined
    const protocol = typeof value.protocol === 'string' ? value.protocol : 'unknown'
    const tag = typeof value.tag === 'string' ? value.tag : `inbound-${index}`
    const settings = isObject(value.settings) ? value.settings : undefined
    const readOnly = Boolean(settings && Array.isArray(settings.clients))
    return {
        index,
        id: tag,
        tag,
        protocol,
        listen: typeof value.listen === 'string' ? value.listen : '',
        port:
            typeof value.port === 'number' || typeof value.port === 'string'
                ? value.port
                : undefined,
        transport: typeof streamSettings?.network === 'string' ? streamSettings.network : undefined,
        security:
            typeof streamSettings?.security === 'string' ? streamSettings.security : undefined,
        reality: getRealityDetails(streamSettings),
        raw: value,
        readOnly,
        readOnlyReason: readOnly ? 'Users are managed by Remnawave.' : undefined
    }
}

const parseSingboxInbound = (value: JsonObject, index: number): VisualInbound => {
    const type = typeof value.type === 'string' ? value.type : 'unknown'
    const tag = typeof value.tag === 'string' ? value.tag : `inbound-${index}`
    const users = Array.isArray(value.users) || Array.isArray(value.user)
    return {
        index,
        id: tag,
        tag,
        protocol: type,
        listen: typeof value.listen === 'string' ? value.listen : '',
        port:
            typeof value.listen_port === 'number' || typeof value.listen_port === 'string'
                ? value.listen_port
                : undefined,
        transport: type,
        security: isObject(value.tls) ? 'tls' : undefined,
        raw: value,
        readOnly: users,
        readOnlyReason: users ? 'Users are managed by Remnawave.' : undefined
    }
}

const sensitiveKeyPattern = /(password|uuid|private.?key|secret|credential|token|psk)/i

const collectSensitiveFields = (value: unknown, path = ''): string[] => {
    if (!isObject(value) && !Array.isArray(value)) return []
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => collectSensitiveFields(item, `${path}[${index}]`))
    }
    return Object.entries(value).flatMap(([key, nested]) => {
        const nextPath = path ? `${path}.${key}` : key
        const current = sensitiveKeyPattern.test(key) ? [nextPath] : []
        return [...current, ...collectSensitiveFields(nested, nextPath)]
    })
}

const firstObject = (...values: unknown[]): JsonObject | undefined => values.find(isObject)

const parseXrayOutbound = (value: JsonObject, index: number): VisualOutbound => {
    const protocol = typeof value.protocol === 'string' ? value.protocol : 'unknown'
    const tag = typeof value.tag === 'string' ? value.tag : `outbound-${index}`
    const settings = isObject(value.settings) ? value.settings : undefined
    const endpoint = firstObject(
        Array.isArray(settings?.vnext) ? settings.vnext[0] : undefined,
        Array.isArray(settings?.servers) ? settings.servers[0] : undefined,
        settings?.server
    )
    const streamSettings = isObject(value.streamSettings) ? value.streamSettings : undefined
    const snippetManaged = typeof value.snippet === 'string' && value.snippet.length > 0
    return {
        index,
        id: tag,
        tag,
        protocol,
        server:
            typeof endpoint?.address === 'string'
                ? endpoint.address
                : typeof endpoint?.server === 'string'
                  ? endpoint.server
                  : undefined,
        port:
            typeof endpoint?.port === 'number' || typeof endpoint?.port === 'string'
                ? endpoint.port
                : undefined,
        transport: typeof streamSettings?.network === 'string' ? streamSettings.network : undefined,
        security:
            typeof streamSettings?.security === 'string' ? streamSettings.security : undefined,
        sensitiveFields: collectSensitiveFields(value),
        raw: value,
        readOnly: snippetManaged,
        readOnlyReason: snippetManaged ? 'Managed by Snippet.' : undefined
    }
}

const parseSingboxOutbound = (value: JsonObject, index: number): VisualOutbound => {
    const protocol = typeof value.type === 'string' ? value.type : 'unknown'
    const tag = typeof value.tag === 'string' ? value.tag : `outbound-${index}`
    const snippetManaged = typeof value.snippet === 'string' && value.snippet.length > 0
    return {
        index,
        id: tag,
        tag,
        protocol,
        server:
            typeof value.server === 'string'
                ? value.server
                : typeof value.address === 'string'
                  ? value.address
                  : undefined,
        port:
            typeof value.server_port === 'number' || typeof value.server_port === 'string'
                ? value.server_port
                : undefined,
        transport: protocol,
        security: isObject(value.tls) ? 'tls' : undefined,
        sensitiveFields: collectSensitiveFields(value),
        raw: value,
        readOnly: snippetManaged,
        readOnlyReason: snippetManaged ? 'Managed by Snippet.' : undefined
    }
}

const xrayDocument = (rawConfig: JsonObject): VisualDocument => {
    const references = collectVisualReferences(rawConfig)
    const inboundValues = Array.isArray(rawConfig.inbounds)
        ? rawConfig.inbounds.filter(isObject)
        : []
    const inboundDetails = inboundValues.map(parseXrayInbound)
    const outboundValues = arrayOfObjects(rawConfig.outbounds)
    const outboundDetails = outboundValues.map(parseXrayOutbound)
    const routingValues = isObject(rawConfig.routing) ? arrayOfObjects(rawConfig.routing.rules) : []
    const routingDetails = routingValues.map(parseXrayRule)
    const dnsDetails = parseDnsDetails(rawConfig, 'xray')
    return {
        coreType: 'xray',
        rawSnapshot: rawConfig,
        inbounds: {
            count: inboundDetails.length,
            items: inboundDetails.map((inbound) => ({
                id: inbound.id,
                label: inbound.tag,
                detail: inbound.protocol,
                readOnly: inbound.readOnly
            }))
        },
        inboundDetails,
        outboundDetails,
        routingDetails,
        outbounds: {
            count: outboundDetails.length,
            items: outboundDetails.map((outbound) => ({
                id: outbound.id,
                label: outbound.tag,
                detail: outbound.protocol,
                readOnly: outbound.readOnly
            }))
        },
        routing: summary(routingValues, 'rule'),
        dns: { count: dnsDetails.servers.length, items: dnsSummaryItems(dnsDetails) },
        dnsDetails,
        references,
        unsupportedPaths: getUnsupportedPaths(rawConfig, references.snippetPaths),
        unknownFields: getUnknownFieldPaths(rawConfig),
        visualEditingLimited: false
    }
}

export const parseSingboxConfig = (rawConfig: JsonObject): VisualDocument => {
    const references = collectVisualReferences(rawConfig)
    const inboundValues = Array.isArray(rawConfig.inbounds)
        ? rawConfig.inbounds.filter(isObject)
        : []
    const inboundDetails = inboundValues.map(parseSingboxInbound)
    const outboundValues = arrayOfObjects(rawConfig.outbounds)
    const outboundDetails = outboundValues.map(parseSingboxOutbound)
    const routingValues = isObject(rawConfig.route) ? arrayOfObjects(rawConfig.route.rules) : []
    const routingDetails = routingValues.map(parseSingboxRule)
    const dnsDetails = parseDnsDetails(rawConfig, 'singbox')
    return {
        coreType: 'singbox',
        rawSnapshot: rawConfig,
        inbounds: {
            count: inboundDetails.length,
            items: inboundDetails.map((inbound) => ({
                id: inbound.id,
                label: inbound.tag,
                detail: inbound.protocol,
                readOnly: inbound.readOnly
            }))
        },
        inboundDetails,
        outboundDetails,
        routingDetails,
        outbounds: {
            count: outboundDetails.length,
            items: outboundDetails.map((outbound) => ({
                id: outbound.id,
                label: outbound.tag,
                detail: outbound.protocol,
                readOnly: outbound.readOnly
            }))
        },
        routing: summary(routingValues, 'rule', true),
        dns: {
            count: dnsDetails.servers.length,
            items: dnsSummaryItems(dnsDetails).map((item) => ({ ...item, readOnly: false }))
        },
        dnsDetails,
        references,
        unsupportedPaths: getUnsupportedPaths(rawConfig, references.snippetPaths),
        unknownFields: getUnknownFieldPaths(rawConfig),
        visualEditingLimited: true
    }
}

export const parseXrayConfig = (rawConfig: JsonObject): VisualDocument => xrayDocument(rawConfig)

export const parseConfigProfile = (
    rawConfig: JsonObject,
    coreType: VisualCoreType | undefined
): VisualDocument => {
    switch (coreType) {
        case 'xray':
            return parseXrayConfig(rawConfig)
        case 'singbox':
            return parseSingboxConfig(rawConfig)
        default:
            throw new Error('Unable to determine the config profile core type.')
    }
}
