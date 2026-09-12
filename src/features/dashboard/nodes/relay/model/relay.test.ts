import type { QuickDeployNode, QuickDeployProfile } from '../../quick-deploy/model/quick-deploy.ts'

import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createRelayPreview,
    executeRelayDeployment,
    type RelayDeploymentPlan
} from './relay-deployment.ts'
import {
    RelayRoutingConflictError,
    buildRelayOutbound,
    insertRelayRoutingRule,
    mergeRelayIntoConfig,
    parseRelayUri,
    relayOutboundTag,
    relayTargetFingerprint,
    sanitizeRelayUri
} from './relay.ts'

const vlessUuid = '8c14d6f7-2e3b-4a91-9d24-3f7a6b8c1e02'

const baseConfig = {
    log: { loglevel: 'info' },
    inbounds: [
        {
            port: 443,
            protocol: 'vless',
            settings: { clients: [] },
            streamSettings: {
                network: 'raw',
                realitySettings: { minClientVer: '1.8.1' },
                security: 'reality'
            },
            tag: 'entry-reality'
        }
    ],
    outbounds: [
        { protocol: 'freedom', tag: 'DIRECT' },
        { protocol: 'blackhole', tag: 'BLOCK' }
    ],
    routing: {
        rules: [
            { domain: ['geosite:category-ads-all'], outboundTag: 'BLOCK', type: 'field' },
            { outboundTag: 'DIRECT', type: 'field' }
        ]
    },
    unknownFutureSetting: { keep: true }
}

const targetFrom = (uri: string) => parseRelayUri(uri)

const node = {
    address: '198.51.100.20',
    configProfile: {
        activeConfigProfileUuid: 'profile-1',
        activeInbounds: [
            {
                network: 'raw',
                port: 443,
                profileUuid: 'profile-1',
                rawInbound: baseConfig.inbounds[0],
                security: 'reality',
                tag: 'entry-reality',
                type: 'vless',
                uuid: 'inbound-1'
            }
        ]
    },
    isConnected: true,
    isDisabled: false,
    name: 'HK-01',
    updatedAt: '2026-09-12T00:00:00.000Z',
    uuid: 'node-1'
} as unknown as QuickDeployNode

const profile = {
    config: baseConfig,
    inbounds: [node.configProfile.activeInbounds[0]],
    name: 'Profile 1',
    updatedAt: '2026-09-12T00:00:00.000Z',
    uuid: 'profile-1'
} as unknown as QuickDeployProfile

test('parses VLESS TCP TLS URI', () => {
    const target = targetFrom(
        `vless://${vlessUuid}@exit.example.com:443?encryption=none&security=tls&type=tcp&headerType=http&host=cdn.example.com&path=%2Fedge&sni=exit.example.com&fp=chrome&alpn=h2,http%2F1.1`
    )
    assert.equal(target.protocol, 'vless')
    assert.equal(target.network, 'tcp')
    assert.equal(target.security, 'tls')
    assert.equal(target.headerType, 'http')
    assert.equal(target.sni, 'exit.example.com')
    assert.equal(target.fingerprint, 'chrome')
    assert.deepEqual(target.alpn, ['h2', 'http/1.1'])
    const outbound = buildRelayOutbound(target, 'relay-vless-tls')
    assert.ok(outbound.streamSettings)
    assert.equal(
        (outbound.streamSettings.tcpSettings as { header: { type: string } }).header.type,
        'http'
    )
})

test('parses VLESS Reality Vision and keeps client fields only', () => {
    const target = targetFrom(
        `vless://${vlessUuid}@exit.example.com:443?encryption=none&security=reality&type=tcp&sni=www.microsoft.com&fp=chrome&pbk=PUBLIC_KEY&sid=abcd&spx=%2F&flow=xtls-rprx-vision&minClientVer=1.8.1`
    )
    const outbound = buildRelayOutbound(target, 'relay-entry-reality-vision')
    const reality = (outbound.streamSettings?.realitySettings ?? {}) as Record<string, unknown>
    assert.equal(target.flow, 'xtls-rprx-vision')
    assert.equal(reality.publicKey, 'PUBLIC_KEY')
    assert.equal(reality.shortId, 'abcd')
    assert.equal('minClientVer' in reality, false)
})

test('parses VLESS Reality gRPC without inventing Vision flow', () => {
    const target = targetFrom(
        `vless://${vlessUuid}@exit.example.com:443?encryption=none&security=reality&type=grpc&sni=www.example.com&pbk=PUBLIC_KEY&sid=abcd&serviceName=relay-grpc`
    )
    const outbound = buildRelayOutbound(target, 'relay-grpc')
    assert.ok(outbound.streamSettings)
    assert.equal(target.flow, undefined)
    assert.equal(
        (outbound.streamSettings.grpcSettings as { serviceName: string }).serviceName,
        'relay-grpc'
    )
})

test('parses Trojan TCP, WS and gRPC TLS variants', () => {
    const tcp = targetFrom(
        'trojan://secret@exit.example.com:443?security=tls&type=tcp&sni=exit.example.com'
    )
    const ws = targetFrom(
        'trojan://secret@exit.example.com:443?security=tls&type=ws&path=%2Fws&sni=exit.example.com'
    )
    const grpc = targetFrom(
        'trojan://secret@exit.example.com:443?security=tls&type=grpc&serviceName=relay&sni=exit.example.com'
    )
    assert.equal(tcp.network, 'tcp')
    assert.equal(ws.path, '/ws')
    assert.equal(grpc.serviceName, 'relay')
    const wsOutbound = buildRelayOutbound(ws, 'relay-ws')
    assert.ok(wsOutbound.streamSettings)
    assert.equal((wsOutbound.streamSettings.wsSettings as { path: string }).path, '/ws')
})

test('parses SIP002 and complete-base64 Shadowsocks URI', () => {
    const sip002 = targetFrom(
        'ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpwYXNz@exit.example.com:8388#exit'
    )
    assert.equal(sip002.protocol, 'shadowsocks')
    assert.equal(sip002.method, 'chacha20-ietf-poly1305')
    assert.equal(sip002.password, 'pass')

    const encoded = Buffer.from('aes-256-gcm:secret@exit.example.com:443').toString('base64')
    const complete = targetFrom(`ss://${encoded}`)
    assert.equal(complete.address, 'exit.example.com')
    assert.equal(complete.port, 443)
})

test('rejects a Shadowsocks plugin explicitly', () => {
    assert.throws(
        () => parseRelayUri('ss://YWVzLTI1Ni1nY206c2VjcmV0@exit.example.com:443?plugin=obfs-local'),
        (error: unknown) => error instanceof Error && error.message.includes('Shadowsocks plugins')
    )
})

test('parses VMess outbound link and proxy links', () => {
    const vmessPayload = Buffer.from(
        JSON.stringify({
            add: 'exit.example.com',
            id: vlessUuid,
            net: 'ws',
            path: '/vmess',
            port: '443',
            ps: 'exit',
            tls: 'tls',
            type: 'none',
            host: 'cdn.example.com',
            sni: 'vmess.example.com',
            scy: 'auto'
        })
    ).toString('base64')
    const vmess = targetFrom(`vmess://${vmessPayload}`)
    assert.equal(vmess.protocol, 'vmess')
    assert.equal(vmess.network, 'ws')
    assert.equal(vmess.security, 'tls')
    assert.equal(vmess.sni, 'vmess.example.com')

    const vmessTcpPayload = Buffer.from(
        JSON.stringify({
            add: 'tcp.example.com',
            alpn: 'h2,http/1.1',
            id: vlessUuid,
            net: 'tcp',
            path: '/camouflage',
            port: 443,
            sni: 'tcp.example.com',
            tls: 'tls',
            type: 'http'
        })
    ).toString('base64')
    const vmessTcp = targetFrom(`vmess://${vmessTcpPayload}`)
    assert.equal(vmessTcp.headerType, 'http')
    assert.equal(vmessTcp.sni, 'tcp.example.com')
    const vmessTcpOutbound = buildRelayOutbound(vmessTcp, 'relay-vmess-tcp')
    assert.ok(vmessTcpOutbound.streamSettings)
    assert.equal(
        (vmessTcpOutbound.streamSettings.tcpSettings as { header: { type: string } }).header.type,
        'http'
    )

    const socks = targetFrom('socks://user:pass@127.0.0.1:1080')
    const http = targetFrom('https://user:pass@proxy.example.com:8443?insecure=true')
    assert.equal(socks.username, 'user')
    assert.equal(socks.password, 'pass')
    assert.equal(http.protocol, 'http')
    assert.equal(http.security, 'tls')
    assert.equal(http.allowInsecure, true)
})

test('sanitizes URI and does not expose credentials', () => {
    const sanitized = sanitizeRelayUri(
        `vless://${vlessUuid}:password@exit.example.com:443?pbk=private`
    )
    assert.equal(sanitized, 'vless://exit.example.com:443')
    assert.equal(sanitized.includes(vlessUuid), false)
    assert.equal(sanitized.includes('password'), false)
})

test('stable relay tag changes when the exit changes and hides credentials', () => {
    const first = targetFrom(`vless://${vlessUuid}@one.example.com:443?security=tls`)
    const second = targetFrom(`vless://${vlessUuid}@two.example.com:443?security=tls`)
    assert.notEqual(relayTargetFingerprint(first), relayTargetFingerprint(second))
    assert.match(relayOutboundTag('entry-reality', first), /^relay-entry-reality-[0-9a-f]{16}$/)
    assert.equal(relayOutboundTag('entry-reality', first).includes(vlessUuid), false)

    const sniChanged = targetFrom(
        `vless://${vlessUuid}@one.example.com:443?security=tls&sni=other.example.com`
    )
    assert.notEqual(relayTargetFingerprint(first), relayTargetFingerprint(sniChanged))
})

test('routing insertion keeps BLOCK before relay and relay before catch-all', () => {
    const result = insertRelayRoutingRule(
        [
            { outboundTag: 'BLOCK', type: 'field' },
            { domain: ['geosite:cn'], outboundTag: 'DIRECT', type: 'field' },
            { outboundTag: 'DIRECT', type: 'field' }
        ],
        { inboundTag: ['entry-reality'], outboundTag: 'relay-entry', type: 'field' }
    )
    assert.equal(result.action, 'create')
    assert.equal((result.rules[0] as { outboundTag: string }).outboundTag, 'BLOCK')
    assert.equal((result.rules[2] as { outboundTag: string }).outboundTag, 'relay-entry')
})

test('routing conflict is detected for the same inbound and unknown rules', () => {
    assert.throws(
        () =>
            insertRelayRoutingRule(
                [{ inboundTag: ['entry-reality'], outboundTag: 'DIRECT', type: 'field' }],
                { inboundTag: ['entry-reality'], outboundTag: 'relay-entry', type: 'field' }
            ),
        RelayRoutingConflictError
    )
    assert.throws(
        () =>
            insertRelayRoutingRule([{}], {
                inboundTag: ['entry'],
                outboundTag: 'relay',
                type: 'field'
            }),
        RelayRoutingConflictError
    )
})

test('merge preserves inbounds, outbounds, routing and unknown fields', () => {
    const target = targetFrom(
        `vless://${vlessUuid}@exit.example.com:443?security=reality&sni=exit.example.com&pbk=PUBLIC_KEY&sid=1234`
    )
    const outbound = buildRelayOutbound(target, 'relay-entry-reality')
    const rule = {
        inboundTag: ['entry-reality'],
        outboundTag: outbound.tag,
        type: 'field' as const
    }
    const merged = mergeRelayIntoConfig({ config: baseConfig, outbound, rule })
    assert.equal(merged.config.inbounds, baseConfig.inbounds)
    assert.equal((merged.config.unknownFutureSetting as { keep: boolean }).keep, true)
    assert.equal((merged.config.outbounds as unknown[]).length, 3)
    assert.equal((merged.config.routing as { rules: unknown[] }).rules.length, 3)
})

test('repeating the same merge reuses both outbound and rule', () => {
    const target = targetFrom(`vless://${vlessUuid}@exit.example.com:443?security=tls`)
    const outbound = buildRelayOutbound(target, 'relay-entry-reality')
    const rule = {
        inboundTag: ['entry-reality'],
        outboundTag: outbound.tag,
        type: 'field' as const
    }
    const first = mergeRelayIntoConfig({ config: baseConfig, outbound, rule })
    const second = mergeRelayIntoConfig({ config: first.config, outbound, rule })
    assert.equal(second.outbound, 'reuse')
    assert.equal(second.routing, 'reuse')
    assert.equal((second.config.outbounds as unknown[]).length, 3)
    assert.equal((second.config.routing as { rules: unknown[] }).rules.length, 3)
})

test('preview and execution reject profile races without writing', async () => {
    const target = targetFrom(`vless://${vlessUuid}@exit.example.com:443?security=tls`)
    const plan = createRelayPreview({
        entryInboundUuid: 'inbound-1',
        node,
        profile,
        target
    })
    const calls: string[] = []
    const api = {
        getNode: async () => node,
        getProfile: async () => ({ ...profile, updatedAt: '2026-09-12T00:00:01.000Z' }),
        updateProfile: async () => {
            calls.push('update')
            return profile
        }
    }
    const result = await executeRelayDeployment(plan as RelayDeploymentPlan, api)
    assert.equal(result.outcome, 'review-required')
    assert.deepEqual(calls, [])
})

test('execution queues reload through Profile PATCH and keeps runtime unconfirmed', async () => {
    const target = targetFrom(`vless://${vlessUuid}@exit.example.com:443?security=tls`)
    const plan = createRelayPreview({
        entryInboundUuid: 'inbound-1',
        node,
        profile,
        target
    })
    const calls: string[] = []
    const api = {
        getNode: async () => node,
        getProfile: async () => profile,
        updateProfile: async () => {
            calls.push('update')
            return profile
        }
    }
    const result = await executeRelayDeployment(plan as RelayDeploymentPlan, api)
    assert.equal(result.outcome, 'partial')
    assert.equal(result.nodeReload.status, 'created')
    assert.equal(result.nodeRuntime.status, 'unconfirmed')
    assert.equal(result.connectivity.status, 'skipped')
    assert.deepEqual(calls, ['update'])
})
