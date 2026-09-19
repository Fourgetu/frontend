import type { JsonObject } from './types.ts'

import assert from 'node:assert/strict'
import test from 'node:test'

import { supportsInboundProtocol } from './capabilities.ts'
import {
    buildInboundEditorOperations,
    getInboundEditorDraft,
    normalizeTagValues
} from './inbound-editor.ts'
import {
    cloneInbound,
    getInboundReferences,
    getInboundPortConflict,
    validateInboundCollection
} from './inbound.ts'
import {
    cloneOutbound,
    createOutboundTemplate,
    getOutboundEndpointPaths,
    getOutboundReferences,
    hasAdvancedOutboundSelectors,
    validateOutboundCollection
} from './outbound.ts'
import { parseConfigProfile } from './parse.ts'
import { applyVisualPatch } from './patch.ts'
import {
    cloneRoutingRule,
    commonRuleTemplates,
    getRoutingRuleReferencesToTag,
    routeFieldPath,
    splitValues
} from './routing.ts'

const fixture = {
    log: {},
    inbounds: [
        {
            tag: 'inbound-a',
            port: 443,
            protocol: 'vless',
            settings: {},
            customUnknownInboundField: { keep: true }
        }
    ],
    outbounds: [
        {
            tag: 'proxy',
            protocol: 'vless',
            settings: {},
            customUnknownOutboundField: { abc: 123 }
        },
        { tag: 'WARP', snippet: 'warp-outbound', protocol: 'freedom' }
    ],
    routing: {
        rules: [
            { ruleTag: 'rule-a', outboundTag: 'proxy' },
            { ruleTag: 'rule-b', outboundTag: 'proxy', customUnknownRoutingField: 'preserve' }
        ],
        balancers: [{ tag: 'balancer-a', selector: ['proxy'] }]
    },
    dns: { servers: [{ address: '1.1.1.1' }, { address: '8.8.8.8' }] },
    policy: { levels: { '0': { handshake: 4 } } },
    stats: {},
    observatory: {},
    burstObservatory: {},
    reverse: {},
    metrics: {},
    snippets: { 'warp-outbound': { protocol: 'freedom' } },
    customUnknownRoot: { foo: 'bar' }
}

test('parses Xray overview without dropping raw fields', () => {
    const document = parseConfigProfile(fixture, 'xray')

    assert.equal(document.coreType, 'xray')
    assert.equal(document.inbounds.count, 1)
    assert.equal(document.outbounds.count, 2)
    assert.equal(document.routing.count, 2)
    assert.equal(document.dns.count, 2)
    assert.ok(document.unsupportedPaths.includes('policy'))
    assert.ok(document.unsupportedPaths.includes('customUnknownRoot'))
    assert.ok(document.references.snippetPaths.includes('snippets'))
    assert.ok(document.references.snippetPaths.includes('outbounds[1].snippet'))
})

test('fails closed instead of parsing a profile with a missing core type as Xray', () => {
    assert.throws(
        () => parseConfigProfile(fixture, undefined),
        /Unable to determine the config profile core type/
    )
})

test('no-op patch round trip preserves advanced, unknown, snippet and Reality fields', () => {
    const next = applyVisualPatch(fixture, { operations: [] })
    assert.deepEqual(next, fixture)
})

test('targeted patch changes only the requested routing field', () => {
    const next = applyVisualPatch(fixture, {
        operations: [{ op: 'set', path: ['routing', 'rules', 1, 'outboundTag'], value: 'DIRECT' }]
    })

    assert.equal((next.routing as typeof fixture.routing).rules[1].outboundTag, 'DIRECT')
    assert.deepEqual((next.routing as typeof fixture.routing).rules[0], fixture.routing.rules[0])
    assert.deepEqual(next.policy, fixture.policy)
    assert.deepEqual(next.customUnknownRoot, fixture.customUnknownRoot)
    assert.deepEqual((next.outbounds as typeof fixture.outbounds)[0].customUnknownOutboundField, {
        abc: 123
    })
})

test('targeted inbound edits preserve unknown fields and other inbounds', () => {
    const next = applyVisualPatch(fixture, {
        operations: [
            { op: 'set', path: ['inbounds', 0, 'tag'], value: 'inbound-a-renamed' },
            { op: 'set', path: ['inbounds', 0, 'port'], value: 8443 }
        ]
    })
    const inbound = (next.inbounds as Array<Record<string, unknown>>)[0]
    assert.equal(inbound.tag, 'inbound-a-renamed')
    assert.equal(inbound.port, 8443)
    assert.deepEqual(inbound.customUnknownInboundField, { keep: true })
    assert.deepEqual(next.outbounds, fixture.outbounds)
    assert.deepEqual(next.routing, fixture.routing)
})

test('snippet-managed objects are read-only for visual patches', () => {
    assert.throws(() =>
        applyVisualPatch(fixture, {
            operations: [{ op: 'set', path: ['outbounds', 1, 'protocol'], value: 'blackhole' }]
        })
    )
    assert.throws(() =>
        applyVisualPatch(fixture, {
            operations: [{ op: 'set', path: ['outbounds', 1], value: { tag: 'replacement' } }]
        })
    )
})

test('sing-box selection is explicit and limited rather than parsed as Xray', () => {
    const document = parseConfigProfile(
        {
            inbounds: [{ type: 'socks', tag: 'singbox-socks' }],
            outbounds: [{ type: 'direct', tag: 'direct' }],
            route: { rules: [{ action: 'route' }] },
            dns: { servers: [{ address: '1.1.1.1' }] }
        },
        'singbox'
    )

    assert.equal(document.coreType, 'singbox')
    assert.equal(document.visualEditingLimited, true)
    assert.equal(document.inbounds.count, 1)
    assert.equal(document.outbounds.count, 1)
    assert.equal(document.routing.count, 1)
    assert.equal(document.inboundDetails[0].port, undefined)
})

test('sing-box Hysteria2 parses and supports a targeted listen_port edit', () => {
    const config = {
        inbounds: [
            {
                type: 'hysteria2',
                tag: 'hy2',
                listen: '0.0.0.0',
                listen_port: 443,
                tls: { enabled: true, server_name: 'example.com' },
                customUnknownInboundField: { keep: true }
            }
        ]
    }
    const document = parseConfigProfile(config, 'singbox')
    assert.equal(document.inboundDetails[0].protocol, 'hysteria2')
    assert.equal(document.inboundDetails[0].port, 443)
    assert.equal(document.inboundDetails[0].security, 'tls')

    const next = applyVisualPatch(config, {
        operations: [{ op: 'set', path: ['inbounds', 0, 'listen_port'], value: 8443 }]
    })
    const inbound = (next.inbounds as Array<Record<string, unknown>>)[0]
    assert.equal(inbound.listen_port, 8443)
    assert.deepEqual(inbound.customUnknownInboundField, { keep: true })
})

test('parses Xray outbound details and targeted server edit preserves unknown fields', () => {
    const config = {
        outbounds: [
            {
                tag: 'HK-EXIT',
                protocol: 'vless',
                settings: {
                    vnext: [{ address: 'hk.example.com', port: 443, users: [{ id: 'secret' }] }]
                },
                streamSettings: { network: 'raw', security: 'reality' },
                customExperimentalField: { keep: true }
            }
        ]
    }
    const document = parseConfigProfile(config, 'xray')
    const outbound = document.outboundDetails[0]
    assert.equal(outbound.protocol, 'vless')
    assert.equal(outbound.server, 'hk.example.com')
    assert.equal(outbound.port, 443)
    assert.equal(outbound.security, 'reality')
    assert.deepEqual(getOutboundEndpointPaths(outbound.raw, 'xray'), {
        serverPath: ['settings', 'vnext', 0, 'address'],
        portPath: ['settings', 'vnext', 0, 'port']
    })
    const next = applyVisualPatch(config, {
        operations: [
            {
                op: 'set',
                path: ['outbounds', 0, 'settings', 'vnext', 0, 'address'],
                value: 'jp.example.com'
            }
        ]
    })
    assert.equal(
        ((next.outbounds as Array<Record<string, unknown>>)[0].settings as Record<string, unknown>)
            .vnext &&
            (
                (
                    (next.outbounds as Array<Record<string, unknown>>)[0].settings as Record<
                        string,
                        unknown
                    >
                ).vnext as Array<Record<string, unknown>>
            )[0].address,
        'jp.example.com'
    )
    assert.deepEqual(
        (next.outbounds as Array<Record<string, unknown>>)[0].customExperimentalField,
        {
            keep: true
        }
    )
})

test('parses sing-box direct and proxy outbounds without Xray fields', () => {
    const document = parseConfigProfile(
        {
            outbounds: [
                { type: 'direct', tag: 'direct' },
                { type: 'vless', tag: 'jp', server: 'jp.example.com', server_port: 443 }
            ],
            route: { rules: [{ outbound: 'jp' }] }
        },
        'singbox'
    )
    assert.equal(document.outboundDetails[0].protocol, 'direct')
    assert.equal(document.outboundDetails[1].server, 'jp.example.com')
    assert.equal(document.outboundDetails[1].port, 443)
    assert.equal(document.outboundDetails[1].raw.protocol, undefined)
    assert.equal(document.references.outboundReferences[0].tag, 'jp')
})

test('outbound references block rename and delete, while unreferenced tags remain editable', () => {
    const config = {
        outbounds: [
            { tag: 'HK-EXIT', protocol: 'freedom' },
            { tag: 'DIRECT', protocol: 'freedom' }
        ],
        routing: {
            rules: [{ outboundTag: 'HK-EXIT' }],
            balancers: [{ selector: ['HK-EXIT'] }]
        }
    }
    const references = getOutboundReferences(config, 'HK-EXIT')
    assert.equal(references.length, 1)
    assert.ok(references.some((reference) => reference.kind === 'routing'))
    assert.deepEqual(
        validateOutboundCollection(
            config.outbounds,
            { tag: 'DIRECT' },
            { ignoreIndex: 1, existingTag: 'DIRECT' }
        ),
        []
    )
    assert.deepEqual(
        validateOutboundCollection(config.outbounds, { tag: 'HK-EXIT' }, { ignoreIndex: 1 }),
        ['Outbound tag "HK-EXIT" is already used.']
    )
})

test('duplicating an outbound deep-clones credentials and unknown fields', () => {
    const original = {
        tag: 'proxy',
        protocol: 'trojan',
        settings: { servers: [{ address: 'example.com', port: 443, password: 'secret' }] },
        customUnknownField: { keep: true }
    }
    const duplicate = cloneOutbound(original)
    duplicate.tag = 'proxy-copy'
    assert.notEqual(duplicate, original)
    assert.deepEqual(duplicate.customUnknownField, { keep: true })
    assert.deepEqual(validateOutboundCollection([original], duplicate), [])
})

test('outbound templates keep Xray and sing-box schemas separate', () => {
    assert.deepEqual(createOutboundTemplate('xray', 'freedom', 'DIRECT', '', undefined), {
        protocol: 'freedom',
        tag: 'DIRECT'
    })
    assert.deepEqual(createOutboundTemplate('singbox', 'direct', 'direct', '', undefined), {
        type: 'direct',
        tag: 'direct'
    })
    assert.equal(
        (createOutboundTemplate('xray', 'vless', 'proxy', 'example.com', 443) as JsonObject).type,
        undefined
    )
})

test('snippet-managed outbound remains read-only in the parsed document', () => {
    const document = parseConfigProfile(
        { outbounds: [{ tag: 'WARP', protocol: 'freedom', snippet: 'warp-outbound' }] },
        'xray'
    )
    assert.equal(document.outboundDetails[0].readOnly, true)
    assert.equal(document.outboundDetails[0].readOnlyReason, 'Managed by Snippet.')
    assert.throws(() =>
        applyVisualPatch(document.rawSnapshot, {
            operations: [{ op: 'set', path: ['outbounds', 0, 'tag'], value: 'BROKEN' }]
        })
    )
})

test('parses Xray routing conditions and preserves rule-specific unknown fields', () => {
    const config = {
        inbounds: [{ tag: 'entry' }],
        outbounds: [
            { tag: 'DIRECT', protocol: 'freedom' },
            { tag: 'BLOCK', protocol: 'blackhole' }
        ],
        routing: {
            rules: [
                {
                    ruleTag: 'Netflix',
                    domain: ['geosite:netflix', 'domain:netflix.com'],
                    ip: ['geoip:private'],
                    port: '80,443',
                    sourcePort: '1000-2000',
                    network: 'tcp,udp',
                    inboundTag: ['entry'],
                    protocol: ['http'],
                    outboundTag: 'DIRECT',
                    customExperimentalRule: true
                }
            ]
        }
    }
    const document = parseConfigProfile(config, 'xray')
    const rule = document.routingDetails[0]
    assert.equal(rule.ruleTag, 'Netflix')
    assert.deepEqual(rule.domains, ['geosite:netflix', 'domain:netflix.com'])
    assert.deepEqual(rule.ips, ['geoip:private'])
    assert.equal(rule.ports, '80,443')
    assert.deepEqual(rule.networks, ['tcp', 'udp'])
    assert.equal(rule.outboundTag, 'DIRECT')
    assert.match(rule.summary, /Netflix|域名/)
    assert.ok(document.unknownFields.includes('routing.rules[0].customExperimentalRule'))
})

test('parses sing-box route rules with sing-box field names only', () => {
    const document = parseConfigProfile(
        {
            inbounds: [{ type: 'hysteria2', tag: 'entry' }],
            outbounds: [{ type: 'direct', tag: 'direct' }],
            route: {
                rules: [
                    {
                        domain_suffix: ['example.com'],
                        ip_cidr: ['192.168.0.0/16'],
                        inbound: ['entry'],
                        outbound: 'direct'
                    }
                ]
            }
        },
        'singbox'
    )
    const rule = document.routingDetails[0]
    assert.deepEqual(rule.domains, ['example.com'])
    assert.deepEqual(rule.ips, ['192.168.0.0/16'])
    assert.deepEqual(rule.inboundTags, ['entry'])
    assert.equal(rule.outboundTag, 'direct')
    assert.equal(rule.raw.outboundTag, undefined)
    assert.deepEqual(routeFieldPath('singbox', 0, 'outbound'), ['route', 'rules', 0, 'outbound'])
})

test('routing targeted edits and reorder keep unknown fields', () => {
    const config = {
        routing: {
            rules: [
                { ruleTag: 'A', domain: ['a'], outboundTag: 'DIRECT', custom: { keep: 1 } },
                {
                    ruleTag: 'B',
                    protocol: ['bittorrent'],
                    outboundTag: 'BLOCK',
                    custom: { keep: 2 }
                },
                { ruleTag: 'C', ip: ['geoip:cn'], outboundTag: 'DIRECT', custom: { keep: 3 } }
            ]
        }
    }
    const edited = applyVisualPatch(config, {
        operations: [{ op: 'set', path: ['routing', 'rules', 1, 'outboundTag'], value: 'DIRECT' }]
    })
    assert.equal(
        (edited.routing as JsonObject).rules &&
            ((edited.routing as JsonObject).rules as JsonObject[])[1].outboundTag,
        'DIRECT'
    )
    const reordered = applyVisualPatch(config, {
        operations: [
            {
                op: 'set',
                path: ['routing', 'rules'],
                value: [
                    ((config.routing as JsonObject).rules as JsonObject[])[2],
                    ((config.routing as JsonObject).rules as JsonObject[])[0],
                    ((config.routing as JsonObject).rules as JsonObject[])[1]
                ]
            }
        ]
    })
    const rules = (reordered.routing as JsonObject).rules as JsonObject[]
    assert.deepEqual(
        rules.map((rule) => rule.ruleTag),
        ['C', 'A', 'B']
    )
    assert.deepEqual(rules[0].custom, { keep: 3 })
})

test('missing inbound and outbound references remain visible to routing helpers', () => {
    const config = {
        routing: { rules: [{ inboundTag: ['old-entry'], outboundTag: 'old-exit' }] }
    }
    assert.deepEqual(getRoutingRuleReferencesToTag(config, 'old-entry', 'inbound'), [
        { path: ['routing', 'rules', 0, 'inboundTag'], label: '路由规则 #1' }
    ])
    assert.deepEqual(getOutboundReferences(config, 'old-exit')[0].tag, 'old-exit')
})

test('exact tag rename can update outbound and inbound references in one patch', () => {
    const config = {
        inbounds: [{ tag: 'OLD-IN' }],
        outbounds: [{ tag: 'OLD-OUT', protocol: 'freedom' }],
        routing: { rules: [{ inboundTag: ['OLD-IN'], outboundTag: 'OLD-OUT' }] }
    }
    const next = applyVisualPatch(config, {
        operations: [
            { op: 'set', path: ['inbounds', 0, 'tag'], value: 'NEW-IN' },
            { op: 'set', path: ['outbounds', 0, 'tag'], value: 'NEW-OUT' },
            { op: 'set', path: ['routing', 'rules', 0, 'inboundTag', 0], value: 'NEW-IN' },
            { op: 'set', path: ['routing', 'rules', 0, 'outboundTag'], value: 'NEW-OUT' }
        ]
    })
    const rule = ((next.routing as JsonObject).rules as JsonObject[])[0]
    assert.deepEqual(rule.inboundTag, ['NEW-IN'])
    assert.equal(rule.outboundTag, 'NEW-OUT')
})

test('advanced selectors block unsafe outbound rename', () => {
    assert.equal(
        hasAdvancedOutboundSelectors({
            outbounds: [{ tag: 'proxy', protocol: 'freedom' }],
            routing: { balancers: [{ selector: ['proxy'] }] }
        }),
        true
    )
})

test('routing templates generate Core fields without private template metadata', () => {
    const template = commonRuleTemplates('xray').find((item) => item.id === 'netflix')
    assert.deepEqual(template?.values, ['geosite:netflix'])
    assert.deepEqual(cloneRoutingRule({ domain: ['x'], custom: { keep: true } }), {
        domain: ['x'],
        custom: { keep: true }
    })
    assert.deepEqual(splitValues('80, 443\n8000-9000'), ['80', '443', '8000-9000'])
})

test('sing-box snippet-managed route rules are read-only', () => {
    const config = {
        route: { rules: [{ snippet: 'route-snippet', domain_suffix: ['example.com'] }] }
    }
    const document = parseConfigProfile(config, 'singbox')
    assert.equal(document.routingDetails[0].readOnly, true)
    assert.ok(document.references.snippetPaths.includes('route.rules[0].snippet'))
    assert.throws(() =>
        applyVisualPatch(config, {
            operations: [{ op: 'set', path: ['route', 'rules', 0, 'outbound'], value: 'direct' }]
        })
    )
})

test('Mixed inbound capability follows the audited Xray and sing-box runtimes', () => {
    assert.equal(supportsInboundProtocol('xray', 'mixed'), true)
    assert.equal(supportsInboundProtocol('singbox', 'mixed'), true)
})

test('Reality visual no-op is semantically unchanged and a single SNI edit is targeted', () => {
    const inbound = {
        tag: 'reality',
        listen: '0.0.0.0',
        port: 443,
        protocol: 'vless',
        settings: { clients: [], decryption: 'none' },
        streamSettings: {
            network: 'raw',
            security: 'reality',
            rawSettings: { header: { type: 'none' }, unknownTransport: true },
            realitySettings: {
                show: false,
                xver: 0,
                target: 'example.com:443',
                serverNames: ['a.example.com', 'b.example.com'],
                shortIds: ['abcd'],
                privateKey: 'secret',
                minClientVer: '1.8.1',
                unknownReality: { keep: true }
            }
        },
        customAdvanced: { keep: true }
    }
    const draft = getInboundEditorDraft(inbound, 'xray', '1.8.1')
    assert.deepEqual(buildInboundEditorOperations(inbound, 0, 'xray', draft), [])
    draft.realityServerNames = ['a.example.com', 'c.example.com']
    const next = applyVisualPatch(
        { inbounds: [inbound] },
        {
            operations: buildInboundEditorOperations(inbound, 0, 'xray', draft)
        }
    )
    const edited = (next.inbounds as JsonObject[])[0]
    const stream = edited.streamSettings as JsonObject
    const reality = stream.realitySettings as JsonObject
    assert.deepEqual(reality.serverNames, ['a.example.com', 'c.example.com'])
    assert.deepEqual(reality.unknownReality, { keep: true })
    assert.deepEqual((stream.rawSettings as JsonObject).unknownTransport, true)
    assert.deepEqual(edited.customAdvanced, { keep: true })
})

test('Reality minClientVer, TLS and sniffing edits preserve unrelated fields', () => {
    const inbound = {
        tag: 'tls-entry',
        listen: '0.0.0.0',
        port: 443,
        protocol: 'trojan',
        streamSettings: {
            network: 'raw',
            security: 'tls',
            rawSettings: { header: { type: 'none' } },
            tlsSettings: {
                serverName: 'old.example.com',
                alpn: ['h2'],
                certificates: [{ certificateFile: '/old.crt', keyFile: '/old.key', keep: true }],
                keep: true
            }
        },
        sniffing: { enabled: false, destOverride: ['http'], keep: true }
    }
    const draft = getInboundEditorDraft(inbound, 'xray', '1.8.1')
    draft.tlsServerName = 'new.example.com'
    draft.sniffEnabled = true
    const next = applyVisualPatch(
        { inbounds: [inbound] },
        {
            operations: buildInboundEditorOperations(inbound, 0, 'xray', draft)
        }
    )
    const edited = (next.inbounds as JsonObject[])[0]
    const stream = edited.streamSettings as JsonObject
    assert.equal((stream.tlsSettings as JsonObject).serverName, 'new.example.com')
    assert.equal((stream.tlsSettings as JsonObject).keep, true)
    assert.equal((edited.sniffing as JsonObject).enabled, true)
    assert.equal((edited.sniffing as JsonObject).keep, true)
})

test('tag inputs split pasted values, deduplicate and preserve first-seen order', () => {
    assert.deepEqual(
        normalizeTagValues(['a.example.com, b.example.com', 'a.example.com\nc.example.com']),
        ['a.example.com', 'b.example.com', 'c.example.com']
    )
})

test('Mixed Xray and sing-box objects remain core-specific and editable', () => {
    const xray = {
        tag: 'mixed-xray',
        listen: '0.0.0.0',
        port: 2080,
        protocol: 'mixed',
        settings: { auth: 'noauth', udp: true, userLevel: 0, keep: true },
        streamSettings: { network: 'raw', security: 'none' }
    }
    const xrayDraft = getInboundEditorDraft(xray, 'xray', '1.8.1')
    xrayDraft.auth = 'password'
    xrayDraft.username = 'alice'
    xrayDraft.password = 'secret'
    const xrayNext = applyVisualPatch(
        { inbounds: [xray] },
        {
            operations: buildInboundEditorOperations(xray, 0, 'xray', xrayDraft)
        }
    )
    const settings = (xrayNext.inbounds as JsonObject[])[0].settings as JsonObject
    assert.deepEqual(settings.accounts, [{ user: 'alice', pass: 'secret' }])
    assert.equal(settings.keep, true)

    const singbox = {
        tag: 'mixed-singbox',
        type: 'mixed',
        listen: '0.0.0.0',
        listen_port: 2080,
        users: []
    }
    const singboxDraft = getInboundEditorDraft(singbox, 'singbox', '1.8.1')
    assert.equal(singboxDraft.protocol, 'mixed')
    assert.equal(buildInboundEditorOperations(singbox, 0, 'singbox', singboxDraft).length, 0)
})

test('parses inbound detail fields for Xray Reality', () => {
    const document = parseConfigProfile(
        {
            inbounds: [
                {
                    tag: 'reality',
                    listen: '0.0.0.0',
                    port: 443,
                    protocol: 'vless',
                    settings: { clients: [] },
                    streamSettings: {
                        network: 'raw',
                        security: 'reality',
                        realitySettings: {
                            target: 'example.com:443',
                            serverNames: ['example.com'],
                            shortIds: ['abcd'],
                            privateKey: 'secret',
                            minClientVer: '1.8.1'
                        }
                    }
                }
            ]
        },
        'xray'
    )
    const inbound = document.inboundDetails[0]
    assert.equal(inbound.protocol, 'vless')
    assert.equal(inbound.transport, 'raw')
    assert.equal(inbound.security, 'reality')
    assert.equal(inbound.reality?.minClientVer, '1.8.1')
    assert.equal(inbound.reality?.privateKeyPresent, true)
    assert.equal(inbound.readOnly, true)
})

test('inbound tag and port validation distinguish TCP and UDP', () => {
    const inbounds = [
        {
            tag: 'tcp',
            listen: '0.0.0.0',
            port: 443,
            protocol: 'vless',
            streamSettings: { network: 'raw' }
        },
        {
            tag: 'udp',
            listen: '0.0.0.0',
            port: 443,
            protocol: 'hysteria',
            streamSettings: { network: 'hysteria' }
        }
    ]
    assert.equal(
        getInboundPortConflict(inbounds, {
            tag: 'new',
            listen: '0.0.0.0',
            port: 443,
            protocol: 'vless',
            streamSettings: { network: 'raw' }
        }),
        'TCP *:443 conflicts with tcp.'
    )
    assert.equal(
        getInboundPortConflict(inbounds, {
            tag: 'new',
            listen: '0.0.0.0',
            port: 443,
            protocol: 'hysteria',
            streamSettings: { network: 'hysteria' }
        }),
        'UDP *:443 conflicts with udp.'
    )
    assert.deepEqual(
        validateInboundCollection(
            inbounds,
            {
                tag: 'tcp',
                listen: '0.0.0.0',
                port: 443,
                protocol: 'vless',
                streamSettings: { network: 'raw' }
            },
            { ignoreIndex: 0, existingTag: 'tcp' }
        ),
        []
    )
})

test('routing references block deleting an inbound', () => {
    const config = {
        inbounds: [{ tag: 'reality', port: 443 }],
        routing: { rules: [{ inboundTag: ['reality'], outboundTag: 'proxy' }] }
    }
    assert.deepEqual(getInboundReferences(config, 'reality'), [
        { tag: 'reality', path: 'routing.rules[0].inboundTag', label: 'Routing Rule #1' }
    ])
})

test('duplicating an inbound deep-clones unknown fields and allows a unique tag and port', () => {
    const original = fixture.inbounds[0] as Record<string, unknown>
    const duplicate = cloneInbound(original)
    duplicate.tag = 'inbound-a-copy'
    duplicate.port = 8443
    assert.notEqual(duplicate, original)
    assert.deepEqual(duplicate.customUnknownInboundField, { keep: true })
    assert.deepEqual(validateInboundCollection(fixture.inbounds, duplicate), [])
})

test('unreferenced inbound can be removed without rebuilding other config sections', () => {
    const next = applyVisualPatch(fixture, {
        operations: [{ op: 'remove', path: ['inbounds', 0] }]
    })
    assert.deepEqual(next.inbounds, [])
    assert.deepEqual(next.outbounds, fixture.outbounds)
    assert.deepEqual(next.routing, fixture.routing)
})

test('Reality minClientVer and core listen port remain untouched by no-op patch', () => {
    const reality = {
        inbounds: [
            {
                tag: 'reality',
                listen: '0.0.0.0',
                port: 443,
                protocol: 'vless',
                streamSettings: { security: 'reality', realitySettings: { minClientVer: '1.8.1' } }
            }
        ],
        userRoutePublicPort: 32001
    }
    const next = applyVisualPatch(reality, { operations: [] })
    assert.equal(
        (
            (next.inbounds as Array<Record<string, unknown>>)[0].streamSettings as Record<
                string,
                unknown
            >
        ).realitySettings &&
            (
                (
                    (next.inbounds as Array<Record<string, unknown>>)[0].streamSettings as Record<
                        string,
                        unknown
                    >
                ).realitySettings as Record<string, unknown>
            ).minClientVer,
        '1.8.1'
    )
    assert.equal((next.inbounds as Array<Record<string, unknown>>)[0].port, 443)
    assert.equal(next.userRoutePublicPort, 32001)
})
