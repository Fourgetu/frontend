import type { JsonObject, VisualOutboundReference, VisualReferences } from './types.ts'

const isObject = (value: unknown): value is JsonObject =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const tagOf = (value: unknown): string | undefined =>
    isObject(value) && typeof value.tag === 'string' ? value.tag : undefined

export const collectVisualReferences = (rawConfig: JsonObject): VisualReferences => {
    const snippetPaths: string[] = []
    if (Object.prototype.hasOwnProperty.call(rawConfig, 'snippets')) snippetPaths.push('snippets')

    const collectSnippetArray = (key: 'outbounds' | 'inbounds', values: unknown) => {
        if (!Array.isArray(values)) return
        values.forEach((value, index) => {
            if (isObject(value) && typeof value.snippet === 'string') {
                snippetPaths.push(`${key}[${index}].snippet`)
            }
        })
    }

    collectSnippetArray('outbounds', rawConfig.outbounds)

    const routing = isObject(rawConfig.routing) ? rawConfig.routing : undefined
    if (routing && Array.isArray(routing.rules)) {
        routing.rules.forEach((value, index) => {
            if (isObject(value) && typeof value.snippet === 'string') {
                snippetPaths.push(`routing.rules[${index}].snippet`)
            }
        })
    }
    if (routing && Array.isArray(routing.balancers)) {
        routing.balancers.forEach((value, index) => {
            if (isObject(value) && typeof value.snippet === 'string') {
                snippetPaths.push(`routing.balancers[${index}].snippet`)
            }
        })
    }

    const route = isObject(rawConfig.route) ? rawConfig.route : undefined
    if (route && Array.isArray(route.rules)) {
        route.rules.forEach((value, index) => {
            if (isObject(value) && typeof value.snippet === 'string') {
                snippetPaths.push(`route.rules[${index}].snippet`)
            }
        })
    }

    const dns = isObject(rawConfig.dns) ? rawConfig.dns : undefined
    if (dns && Array.isArray(dns.servers)) {
        dns.servers.forEach((value, index) => {
            if (isObject(value) && typeof value.snippet === 'string') {
                snippetPaths.push(`dns.servers[${index}].snippet`)
            }
        })
    }

    const tags = (key: 'inbounds' | 'outbounds'): string[] =>
        Array.isArray(rawConfig[key])
            ? rawConfig[key].flatMap((value) => {
                  const tag = tagOf(value)
                  return tag ? [tag] : []
              })
            : []

    const balancerTags =
        routing && Array.isArray(routing.balancers)
            ? routing.balancers.flatMap((value) => {
                  const tag = tagOf(value)
                  return tag ? [tag] : []
              })
            : []

    return {
        inboundTags: tags('inbounds'),
        inboundReferences: collectInboundReferences(rawConfig),
        outboundTags: tags('outbounds'),
        outboundReferences: collectOutboundReferences(rawConfig),
        balancerTags,
        snippetPaths
    }
}

const collectTagReferences = (
    references: VisualOutboundReference[],
    value: unknown,
    path: string,
    label: string,
    kind: VisualOutboundReference['kind']
) => {
    if (typeof value === 'string' && value.trim()) {
        references.push({ tag: value, path, label, kind })
        return
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            if (typeof item === 'string' && item.trim()) {
                references.push({ tag: item, path: `${path}[${index}]`, label, kind })
            }
        })
    }
}

const collectAdvancedSelectorReferences = (
    references: VisualOutboundReference[],
    value: unknown,
    path: string,
    label: string
) => {
    const hasSelector =
        (typeof value === 'string' && value.trim().length > 0) ||
        (Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim()))
    if (hasSelector) {
        references.push({ tag: '*', path, label: `${label} (advanced selector)`, kind: 'advanced' })
    }
}

export const collectOutboundReferences = (rawConfig: JsonObject): VisualOutboundReference[] => {
    const references: VisualOutboundReference[] = []
    const routing = isObject(rawConfig.routing) ? rawConfig.routing : undefined
    const route = isObject(rawConfig.route) ? rawConfig.route : undefined

    const xrayRules = routing && Array.isArray(routing.rules) ? routing.rules : []
    xrayRules.forEach((value, index) => {
        if (!isObject(value)) return
        collectTagReferences(
            references,
            value.outboundTag,
            `routing.rules[${index}].outboundTag`,
            `Routing Rule #${index + 1}`,
            'routing'
        )
    })

    const singboxRules = route && Array.isArray(route.rules) ? route.rules : []
    singboxRules.forEach((value, index) => {
        if (!isObject(value)) return
        collectTagReferences(
            references,
            value.outbound,
            `route.rules[${index}].outbound`,
            `Route Rule #${index + 1}`,
            'routing'
        )
    })

    const balancers = routing && Array.isArray(routing.balancers) ? routing.balancers : []
    balancers.forEach((value, index) => {
        if (!isObject(value)) return
        collectAdvancedSelectorReferences(
            references,
            value.selector,
            `routing.balancers[${index}].selector`,
            `Balancer #${index + 1}`
        )
    })

    for (const key of ['observatory', 'burstObservatory'] as const) {
        const value = isObject(rawConfig[key]) ? rawConfig[key] : undefined
        if (!value) continue
        collectAdvancedSelectorReferences(
            references,
            value.subjectSelector,
            `${key}.subjectSelector`,
            key === 'observatory' ? 'Observatory' : 'Burst Observatory'
        )
    }

    return references
}

export const collectInboundReferences = (
    rawConfig: JsonObject
): Array<{ tag: string; path: string; label: string }> => {
    const routing = isObject(rawConfig.routing) ? rawConfig.routing : undefined
    const rules = routing && Array.isArray(routing.rules) ? routing.rules : []
    const references: Array<{ tag: string; path: string; label: string }> = []
    rules.forEach((value, index) => {
        if (!isObject(value)) return
        const inboundTags = Array.isArray(value.inboundTag)
            ? value.inboundTag.filter((tag): tag is string => typeof tag === 'string')
            : typeof value.inboundTag === 'string'
              ? [value.inboundTag]
              : []
        inboundTags.forEach((tag) =>
            references.push({
                tag,
                path: `routing.rules[${index}].inboundTag`,
                label: `Routing Rule #${index + 1}`
            })
        )
    })
    const route = isObject(rawConfig.route) ? rawConfig.route : undefined
    const routeRules = route && Array.isArray(route.rules) ? route.rules : []
    routeRules.forEach((value, index) => {
        if (!isObject(value)) return
        const inboundTags = Array.isArray(value.inbound)
            ? value.inbound.filter((tag): tag is string => typeof tag === 'string')
            : typeof value.inbound === 'string'
              ? [value.inbound]
              : []
        inboundTags.forEach((tag) =>
            references.push({
                tag,
                path: `route.rules[${index}].inbound`,
                label: `路由规则 #${index + 1}`
            })
        )
    })
    return references
}

export const pathToString = (path: Array<string | number>): string =>
    path.reduce<string>((result, segment) => {
        if (typeof segment === 'number') return `${result}[${segment}]`
        return result ? `${result}.${segment}` : segment
    }, '')

export const isSnippetManagedPath = (
    rawConfig: JsonObject,
    path: Array<string | number>
): boolean => {
    if (path[0] === 'snippets') return true
    const [root, index] = path
    if ((root === 'outbounds' || root === 'inbounds') && typeof index === 'number') {
        const item = Array.isArray(rawConfig[root]) ? rawConfig[root][index] : undefined
        return isObject(item) && typeof item.snippet === 'string'
    }
    if (root === 'routing' && path[1] === 'rules' && typeof path[2] === 'number') {
        const rules = isObject(rawConfig.routing) ? rawConfig.routing.rules : undefined
        const item = Array.isArray(rules) ? rules[path[2]] : undefined
        return isObject(item) && typeof item.snippet === 'string'
    }
    if (root === 'routing' && path[1] === 'balancers' && typeof path[2] === 'number') {
        const balancers = isObject(rawConfig.routing) ? rawConfig.routing.balancers : undefined
        const item = Array.isArray(balancers) ? balancers[path[2]] : undefined
        return isObject(item) && typeof item.snippet === 'string'
    }
    if (root === 'route' && path[1] === 'rules' && typeof path[2] === 'number') {
        const rules = isObject(rawConfig.route) ? rawConfig.route.rules : undefined
        const item = Array.isArray(rules) ? rules[path[2]] : undefined
        return isObject(item) && typeof item.snippet === 'string'
    }
    if (root === 'dns' && path[1] === 'servers' && typeof path[2] === 'number') {
        const servers = isObject(rawConfig.dns) ? rawConfig.dns.servers : undefined
        const item = Array.isArray(servers) ? servers[path[2]] : undefined
        return isObject(item) && typeof item.snippet === 'string'
    }
    return false
}
