import type { JsonObject } from './types.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const XRAY_ROOT_FIELDS = new Set([
    'log',
    'api',
    'dns',
    'routing',
    'policy',
    'inbounds',
    'outbounds',
    'transport',
    'stats',
    'reverse',
    'fakedns',
    'observatory',
    'burstObservatory',
    'metrics',
    'snippets'
])

const XRAY_ITEM_FIELDS = new Set([
    'tag',
    'listen',
    'port',
    'protocol',
    'type',
    'settings',
    'streamSettings',
    'domainStrategy',
    'sendThrough',
    'proxySettings',
    'sniffing',
    'allocate',
    'remark',
    'snippet'
])

const XRAY_DNS_FIELDS = new Set([
    'servers',
    'hosts',
    'clientIp',
    'tag',
    'queryStrategy',
    'disableCache',
    'disableFallback',
    'disableFallbackIfMatch',
    'rules',
    'final',
    'strategy',
    'fakeip',
    'fake_ip',
    'ednsClientSubnet',
    'client_subnet'
])

const XRAY_DNS_SERVER_FIELDS = new Set([
    'address',
    'domains',
    'expectIPs',
    'skipFallback',
    'queryStrategy',
    'tag',
    'strategy',
    'snippet'
])

const addUnknownObjectKeys = (
    value: unknown,
    path: string,
    known: Set<string>,
    result: string[]
) => {
    if (!isObject(value)) return
    Object.keys(value).forEach((key) => {
        if (!known.has(key)) result.push(path ? `${path}.${key}` : key)
    })
}

export const getUnknownFieldPaths = (rawConfig: JsonObject): string[] => {
    const result: string[] = []
    Object.keys(rawConfig).forEach((key) => {
        if (!XRAY_ROOT_FIELDS.has(key)) result.push(key)
    })

    for (const key of ['inbounds', 'outbounds']) {
        const values = rawConfig[key]
        if (!Array.isArray(values)) continue
        values.forEach((value, index) =>
            addUnknownObjectKeys(value, `${key}[${index}]`, XRAY_ITEM_FIELDS, result)
        )
    }

    const dns = rawConfig.dns
    if (isObject(dns)) {
        addUnknownObjectKeys(dns, 'dns', XRAY_DNS_FIELDS, result)
        if (Array.isArray(dns.servers)) {
            dns.servers.forEach((value, index) =>
                addUnknownObjectKeys(value, `dns.servers[${index}]`, XRAY_DNS_SERVER_FIELDS, result)
            )
        }
    }

    const routing = rawConfig.routing
    if (isObject(routing) && Array.isArray(routing.rules)) {
        routing.rules.forEach((value, index) => {
            if (!isObject(value)) return
            const known = new Set([
                'domain',
                'domains',
                'ip',
                'port',
                'sourcePort',
                'network',
                'source',
                'sourceIP',
                'user',
                'inboundTag',
                'protocol',
                'attrs',
                'outboundTag',
                'balancerTag',
                'ruleTag',
                'process',
                'webhook',
                'snippet'
            ])
            addUnknownObjectKeys(value, `routing.rules[${index}]`, known, result)
        })
    }
    return result
}

export const getUnsupportedPaths = (rawConfig: JsonObject, snippetPaths: string[]): string[] => {
    const result = new Set<string>(snippetPaths)
    for (const key of [
        'policy',
        'stats',
        'observatory',
        'burstObservatory',
        'reverse',
        'metrics'
    ]) {
        if (Object.prototype.hasOwnProperty.call(rawConfig, key)) result.add(key)
    }
    getUnknownFieldPaths(rawConfig).forEach((path) => result.add(path))
    return [...result]
}
