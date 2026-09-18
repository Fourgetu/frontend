import type { JsonObject, JsonPath, VisualCoreType, VisualRoutingRule } from './types.ts'

import { collectOutboundReferences } from './references.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const routingRulesPath = (coreType: VisualCoreType): JsonPath =>
    coreType === 'singbox' ? ['route', 'rules'] : ['routing', 'rules']

export const getRoutingRules = (config: JsonObject, coreType: VisualCoreType): JsonObject[] => {
    const root = coreType === 'singbox' ? config.route : config.routing
    if (!isObject(root) || !Array.isArray(root.rules)) return []
    return root.rules.filter(isObject)
}

export const getRoutingRulePath = (coreType: VisualCoreType, index: number): JsonPath => [
    ...(coreType === 'singbox' ? ['route', 'rules'] : ['routing', 'rules']),
    index
]

export const parseReferencePath = (value: string): JsonPath => {
    const path: JsonPath = []
    const matcher = /([^.[\]]+)|\[(\d+)\]/g
    for (const match of value.matchAll(matcher)) {
        if (match[1]) path.push(match[1])
        else if (match[2]) path.push(Number(match[2]))
    }
    return path
}

export const cloneRoutingRule = (rule: JsonObject): JsonObject =>
    JSON.parse(JSON.stringify(rule)) as JsonObject

export const getRoutingRuleReferencesToTag = (
    rawConfig: JsonObject,
    tag: string,
    kind: 'inbound' | 'outbound'
) => {
    if (kind === 'outbound')
        return collectOutboundReferences(rawConfig).filter((item) => item.tag === tag)
    const routing = isObject(rawConfig.routing) ? rawConfig.routing : undefined
    const route = isObject(rawConfig.route) ? rawConfig.route : undefined
    const result: Array<{ path: JsonPath; label: string }> = []
    const xrayRules = routing && Array.isArray(routing.rules) ? routing.rules : []
    xrayRules.forEach((rule, index) => {
        if (!isObject(rule)) return
        const values = Array.isArray(rule.inboundTag) ? rule.inboundTag : [rule.inboundTag]
        if (values.includes(tag))
            result.push({
                path: ['routing', 'rules', index, 'inboundTag'],
                label: `路由规则 #${index + 1}`
            })
    })
    const singboxRules = route && Array.isArray(route.rules) ? route.rules : []
    singboxRules.forEach((rule, index) => {
        if (!isObject(rule)) return
        const values = Array.isArray(rule.inbound) ? rule.inbound : [rule.inbound]
        if (values.includes(tag))
            result.push({
                path: ['route', 'rules', index, 'inbound'],
                label: `路由规则 #${index + 1}`
            })
    })
    return result
}

export const splitValues = (value: string): string[] =>
    value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)

export const serializeValues = (values: string[], original: unknown): unknown => {
    if (Array.isArray(original) || values.length !== 1) return values
    return values[0] ?? ''
}

export const routeFieldPath = (
    coreType: VisualCoreType,
    index: number,
    field:
        | 'ruleTag'
        | 'domain'
        | 'ip'
        | 'port'
        | 'sourcePort'
        | 'network'
        | 'source'
        | 'sourceIP'
        | 'source_ip_cidr'
        | 'user'
        | 'inboundTag'
        | 'inbound'
        | 'protocol'
        | 'attrs'
        | 'outboundTag'
        | 'outbound'
        | 'balancerTag'
): JsonPath => {
    if (coreType === 'singbox') {
        const mapping: Record<string, string> = {
            domain: 'domain_suffix',
            ip: 'ip_cidr',
            source: 'source_ip_cidr',
            sourceIP: 'source_ip_cidr',
            inboundTag: 'inboundTag',
            outboundTag: 'outbound',
            ruleTag: 'rule_tag',
            user: 'user',
            protocol: 'protocol',
            sourcePort: 'source_port',
            network: 'network',
            port: 'port',
            inbound: 'inbound',
            outbound: 'outbound',
            attrs: 'attrs',
            balancerTag: 'balancer'
        }
        return ['route', 'rules', index, mapping[field] ?? field]
    }
    return ['routing', 'rules', index, field]
}

export const commonRuleTemplates = (coreType: VisualCoreType) =>
    coreType === 'singbox'
        ? [
              {
                  id: 'private-direct',
                  label: '私有 IP → 直接连接',
                  field: 'ip',
                  values: ['private']
              },
              { id: 'bt-block', label: 'BT → 阻断', field: 'protocol', values: ['bittorrent'] }
          ]
        : [
              { id: 'cn-direct', label: '中国 IP → 直接连接', field: 'ip', values: ['geoip:cn'] },
              {
                  id: 'private-direct',
                  label: '私有 IP → 直接连接',
                  field: 'ip',
                  values: ['geoip:private']
              },
              { id: 'bt-block', label: 'BT → 阻断', field: 'protocol', values: ['bittorrent'] },
              {
                  id: 'netflix',
                  label: 'Netflix → 指定出口',
                  field: 'domain',
                  values: ['geosite:netflix']
              },
              {
                  id: 'youtube',
                  label: 'YouTube → 指定出口',
                  field: 'domain',
                  values: ['geosite:youtube']
              },
              {
                  id: 'telegram',
                  label: 'Telegram → 指定出口',
                  field: 'domain',
                  values: ['geosite:telegram']
              }
          ]

export type RuleTemplate = ReturnType<typeof commonRuleTemplates>[number]

export const getRuleTarget = (rule: VisualRoutingRule): string =>
    rule.outboundTag ?? rule.balancerTag ?? '—'
