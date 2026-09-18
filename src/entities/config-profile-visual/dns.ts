import type {
    JsonObject,
    JsonPath,
    VisualCoreType,
    VisualDnsDetails,
    VisualDnsHost,
    VisualDnsServer
} from './types.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const stringArray = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : typeof value === 'string'
          ? [value]
          : []

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const dnsPath = (): JsonPath => ['dns']
export const dnsServersPath = (): JsonPath => ['dns', 'servers']
export const dnsHostsPath = (): JsonPath => ['dns', 'hosts']

export const getDnsRoot = (config: JsonObject): JsonObject | undefined =>
    isObject(config.dns) ? config.dns : undefined

export const getDnsServers = (config: JsonObject): unknown[] => {
    const servers = getDnsRoot(config)?.servers
    return Array.isArray(servers) ? servers : []
}

export const getDnsServerPath = (index: number): JsonPath => ['dns', 'servers', index]

const serverAddress = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (isObject(value) && typeof value.address === 'string') return value.address
    return ''
}

export const parseDnsServer = (
    value: unknown,
    index: number,
    coreType: VisualCoreType
): VisualDnsServer => {
    const objectValue = isObject(value) ? value : undefined
    const snippetManaged = Boolean(objectValue && typeof objectValue.snippet === 'string')
    return {
        index,
        id:
            typeof objectValue?.tag === 'string'
                ? objectValue.tag
                : `${coreType === 'xray' ? 'DNS 服务器' : 'DNS Server'} #${index + 1}`,
        kind: objectValue ? 'object' : 'string',
        address: serverAddress(value),
        tag: typeof objectValue?.tag === 'string' ? objectValue.tag : undefined,
        domains: stringArray(objectValue?.domains),
        expectIPs: stringArray(objectValue?.expectIPs),
        skipFallback:
            typeof objectValue?.skipFallback === 'boolean' ? objectValue.skipFallback : undefined,
        queryStrategy:
            typeof objectValue?.queryStrategy === 'string'
                ? objectValue.queryStrategy
                : typeof objectValue?.strategy === 'string'
                  ? objectValue.strategy
                  : undefined,
        readOnly: snippetManaged,
        readOnlyReason: snippetManaged ? '此 DNS 服务器由 Snippet 管理。' : undefined,
        raw: value
    }
}

export const getDnsHosts = (config: JsonObject): VisualDnsHost[] => {
    const hosts = getDnsRoot(config)?.hosts
    if (!isObject(hosts)) return []
    return Object.entries(hosts).map(([key, value]) => ({
        key,
        values: stringArray(value),
        valueKind: Array.isArray(value) ? 'array' : 'string',
        raw: value
    }))
}

export const parseDnsDetails = (config: JsonObject, coreType: VisualCoreType): VisualDnsDetails => {
    const dns = getDnsRoot(config)
    const servers = getDnsServers(config).map((server, index) =>
        parseDnsServer(server, index, coreType)
    )
    const advancedPaths: string[] = []
    if (dns && Object.prototype.hasOwnProperty.call(dns, 'rules')) advancedPaths.push('dns.rules')
    if (dns && Object.prototype.hasOwnProperty.call(dns, 'fakeip')) advancedPaths.push('dns.fakeip')
    if (dns && Object.prototype.hasOwnProperty.call(dns, 'fake_ip'))
        advancedPaths.push('dns.fake_ip')
    if (dns && Object.prototype.hasOwnProperty.call(dns, 'ednsClientSubnet')) {
        advancedPaths.push('dns.ednsClientSubnet')
    }
    if (dns && Object.prototype.hasOwnProperty.call(dns, 'client_subnet')) {
        advancedPaths.push('dns.client_subnet')
    }
    return {
        servers,
        hosts: getDnsHosts(config),
        clientIp: typeof dns?.clientIp === 'string' ? dns.clientIp : undefined,
        tag: typeof dns?.tag === 'string' ? dns.tag : undefined,
        queryStrategy: typeof dns?.queryStrategy === 'string' ? dns.queryStrategy : undefined,
        final: typeof dns?.final === 'string' ? dns.final : undefined,
        strategy: typeof dns?.strategy === 'string' ? dns.strategy : undefined,
        rulesCount: Array.isArray(dns?.rules) ? dns.rules.length : 0,
        advancedPaths
    }
}

export const dnsSummaryItems = (details: VisualDnsDetails) =>
    details.servers.map((server) => ({
        id: server.id,
        label: server.address || server.id,
        detail: server.tag ?? (server.kind === 'object' ? '对象' : '字符串'),
        readOnly: server.readOnly
    }))

export const serializeDnsServer = (
    original: unknown,
    draft: Pick<
        VisualDnsServer,
        'address' | 'tag' | 'domains' | 'expectIPs' | 'skipFallback' | 'queryStrategy'
    >,
    coreType: VisualCoreType
): unknown => {
    if (typeof original === 'string') return draft.address.trim()
    const next: JsonObject = isObject(original) ? cloneJson(original) : {}
    next.address = draft.address.trim()
    if (coreType === 'singbox') {
        if (draft.tag?.trim()) next.tag = draft.tag.trim()
        else delete next.tag
        if (draft.queryStrategy?.trim()) next.strategy = draft.queryStrategy.trim()
        else if (Object.prototype.hasOwnProperty.call(next, 'strategy')) delete next.strategy
        return next
    }
    if (draft.tag?.trim()) next.tag = draft.tag.trim()
    else if (Object.prototype.hasOwnProperty.call(next, 'tag')) delete next.tag
    if (draft.domains.length) next.domains = [...draft.domains]
    else if (Object.prototype.hasOwnProperty.call(next, 'domains')) delete next.domains
    if (draft.expectIPs.length) next.expectIPs = [...draft.expectIPs]
    else if (Object.prototype.hasOwnProperty.call(next, 'expectIPs')) delete next.expectIPs
    if (typeof draft.skipFallback === 'boolean') next.skipFallback = draft.skipFallback
    else if (Object.prototype.hasOwnProperty.call(next, 'skipFallback')) delete next.skipFallback
    if (draft.queryStrategy?.trim()) next.queryStrategy = draft.queryStrategy.trim()
    else if (Object.prototype.hasOwnProperty.call(next, 'queryStrategy')) delete next.queryStrategy
    return next
}

export const serializeDnsHostValue = (values: string[], original: unknown): unknown =>
    Array.isArray(original) ? [...values] : (values[0] ?? '')

export const cloneDnsValue = <T>(value: T): T => cloneJson(value)

export const supportedDnsQueryStrategies = ['UseIP', 'UseIPv4', 'UseIPv6']

export const singboxDnsServerSummary = (server: VisualDnsServer): string =>
    server.tag ? `${server.tag} · ${server.address}` : server.address
