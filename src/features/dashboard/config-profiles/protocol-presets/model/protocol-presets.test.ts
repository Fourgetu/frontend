import { decodeURLSafe } from '@stablelib/base64'
import assert from 'node:assert/strict'
import { createPublicKey, createPrivateKey } from 'node:crypto'
import test from 'node:test'

import { appendSingBoxProtocolPresets } from '../../../nodes/quick-deploy/model/singbox-protocol-presets.ts'
import {
    SS2022_METHODS,
    getProtocolPipeline,
    generateSs2022ServerPassword
} from './dual-core-capabilities.ts'
import {
    applyRealityCompatibilityToConfig,
    appendProtocolPresets,
    getRealityClientCompatibility,
    getRecommendedPresetIds,
    getUsedInboundPorts,
    stripRealityServerOnlyFields,
    stripRealityServerOnlyFieldsFromOutbound,
    validateRealityMinClientVersion
} from './protocol-presets.ts'

const tls = {
    domain: 'node.example.com',
    certificateFile: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem',
    keyFile: '/var/lib/remnawave/configs/xray/ssl/privkey.key'
}

for (const core of ['xray', 'singbox'] as const) {
    for (const capability of SS2022_METHODS) {
        test(`${core} SS2022 ${capability.method}: managed capability and key size`, () => {
            const build = () =>
                core === 'xray'
                    ? appendProtocolPresets({}, ['shadowsocks-2022'], {
                          ss2022Method: capability.method
                      }).added[0].inbound
                    : appendSingBoxProtocolPresets({}, ['singbox-shadowsocks-2022'], {
                          tls,
                          ss2022Method: capability.method
                      }).added[0].inbound
            if (!capability.managedUsers) {
                assert.equal(capability.quickDeploy, false)
                assert.equal(capability.quickProtocol, false)
                assert.throws(build, /Managed Users/)
                return
            }
            const inbound = build()
            const server = core === 'xray' ? (inbound.settings as Record<string, unknown>) : inbound
            assert.equal(server.method, capability.method)
            assert.equal(
                Buffer.from(server.password as string, 'base64').length,
                capability.keyBytes
            )
            assert.deepEqual(core === 'xray' ? server.clients : server.users, [])
            assert.notEqual(server.password, generateSs2022ServerPassword(capability.method))
            assert.equal('streamSettings' in inbound, core === 'xray')
            assert.equal('settings' in inbound, core === 'xray')
        })
    }
}

test('sing-box Reality uses native X25519 keys and no Xray compatibility fields', () => {
    const result = appendSingBoxProtocolPresets(
        { keep: { value: true } },
        ['singbox-vless-reality-vision'],
        {
            tls,
            reality: {
                targetDomain: 'handshake.example.com',
                targetPort: 8443,
                serverName: 'sni.example.com',
                minClientVer: '26.3.27'
            }
        }
    )
    const inbound = result.added[0].inbound
    const nativeTls = inbound.tls as {
        server_name: string
        reality: { handshake: object; private_key: string; short_id: string[] }
    }
    assert.equal(inbound.type, 'vless')
    assert.deepEqual(inbound.users, [])
    assert.equal(nativeTls.server_name, 'sni.example.com')
    assert.deepEqual(nativeTls.reality.handshake, {
        server: 'handshake.example.com',
        server_port: 8443
    })
    assert.match(nativeTls.reality.short_id[0], /^[0-9a-f]{16}$/)
    const key = createPrivateKey({
        key: { kty: 'OKP', crv: 'X25519', d: nativeTls.reality.private_key, x: '' },
        format: 'jwk'
    })
    assert.equal(createPublicKey(key).export({ format: 'jwk' }).x, result.added[0].realityPublicKey)
    assert.equal(
        /streamSettings|realitySettings|serverNames|shortIds|minClientVer/.test(
            JSON.stringify(inbound)
        ),
        false
    )
    assert.deepEqual(result.config.keep, { value: true })
})

test('central matrix distinguishes protocol support from the managed provisioning pipeline', () => {
    for (const core of ['xray', 'singbox'] as const) {
        assert.equal(getProtocolPipeline(core, 'shadowsocks-2022')?.quickDeploy, true)
        assert.equal(getProtocolPipeline(core, 'vless-reality-vision')?.quickProtocol, true)
    }
    assert.equal(getProtocolPipeline('xray', 'hysteria2')?.quickProtocol, false)
    assert.equal(getProtocolPipeline('singbox', 'hysteria2')?.quickProtocol, true)
    assert.equal(getProtocolPipeline('singbox', 'trojan-tcp-tls')?.quickDeploy, false)
    const chacha = SS2022_METHODS[2]
    assert.equal(chacha.xray && chacha.singbox, true)
    assert.equal(chacha.managedUsers, false)
})

test('SS2022 server keys use Web Crypto random bytes of the required size', (context) => {
    const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    const random = context.mock.method(globalThis.crypto, 'getRandomValues', original)
    generateSs2022ServerPassword('2022-blake3-aes-128-gcm')
    generateSs2022ServerPassword('2022-blake3-aes-256-gcm')
    assert.deepEqual(
        random.mock.calls.map((call) => (call.arguments[0] as Uint8Array).length),
        [16, 32]
    )
})

test('adds Reality Vision to a blank Config Profile', () => {
    const result = appendProtocolPresets({}, ['vless-reality-vision'])

    assert.equal(result.added.length, 1)
    assert.deepEqual(result.config.inbounds, [result.added[0].inbound])
    assert.equal(result.added[0].inbound.protocol, 'vless')
})

test('adds Reality Vision without changing existing config sections', () => {
    const existingInbound = { tag: 'existing', port: 30_000, protocol: 'vless', custom: true }
    const source = {
        inbounds: [existingInbound],
        outbounds: [{ protocol: 'freedom', tag: 'DIRECT' }],
        customRootField: { preserved: true }
    }

    const result = appendProtocolPresets(source, ['vless-reality-vision'])
    const inbound = result.added[0].inbound
    const reality = inbound.streamSettings.realitySettings as Record<string, unknown>

    assert.equal((result.config.inbounds as unknown[])[0], existingInbound)
    assert.deepEqual(result.config.outbounds, source.outbounds)
    assert.deepEqual(result.config.customRootField, source.customRootField)
    assert.equal(inbound.protocol, 'vless')
    assert.equal(inbound.settings.flow, 'xtls-rprx-vision')
    assert.equal(inbound.streamSettings.network, 'raw')
    assert.equal(inbound.streamSettings.security, 'reality')
    assert.match(reality.privateKey as string, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(decodeURLSafe(`${reality.privateKey}=`).length, 32)
    assert.match(result.added[0].realityPublicKey!, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(decodeURLSafe(`${result.added[0].realityPublicKey}=`).length, 32)
    assert.match((reality.shortIds as string[])[0], /^[a-f0-9]{16}$/)
})

test('adds every supported recommendation with unique ports and tags', () => {
    const source = {
        inbounds: [
            { tag: 'vless-reality-vision-fixed', port: 20_000 },
            { tag: 'range', port: '25000-25010,26000' }
        ]
    }
    const result = appendProtocolPresets(source, getRecommendedPresetIds(), { tls })
    const ports = result.added.map(({ inbound }) => inbound.port)
    const tags = result.added.map(({ inbound }) => inbound.tag)

    assert.equal(result.added.length, 3)
    assert.equal(new Set(ports).size, ports.length)
    assert.equal(new Set(tags).size, tags.length)
    assert.ok(ports.every((port) => port >= 20_000 && port <= 60_000))
    assert.ok(ports.every((port) => !getUsedInboundPorts(source.inbounds).has(port)))
})

test('consecutive additions cannot collide with earlier generated inbounds', () => {
    const first = appendProtocolPresets({}, getRecommendedPresetIds(), { tls })
    const second = appendProtocolPresets(first.config, getRecommendedPresetIds(), { tls })
    const all = second.config.inbounds as Array<{ port: number; tag: string }>

    assert.equal(new Set(all.map(({ port }) => port)).size, all.length)
    assert.equal(new Set(all.map(({ tag }) => tag)).size, all.length)
})

test('Reality gRPC has no Vision flow and receives a valid service name', () => {
    const result = appendProtocolPresets({}, ['vless-reality-grpc'])
    const inbound = result.added[0].inbound
    const grpc = inbound.streamSettings.grpcSettings as Record<string, unknown>

    assert.equal(inbound.settings.flow, '')
    assert.equal(inbound.streamSettings.network, 'grpc')
    assert.match(grpc.serviceName as string, /^grpc-[a-z0-9]{12}$/)
})

test('new Reality Vision and gRPC presets share the explicit Intel default', () => {
    for (const presetId of ['vless-reality-vision', 'vless-reality-grpc'] as const) {
        const result = appendProtocolPresets({}, [presetId])
        const reality = result.added[0].inbound.streamSettings.realitySettings as Record<
            string,
            unknown
        >

        assert.equal(reality.target, 'www.intel.com:443')
        assert.deepEqual(reality.serverNames, ['www.intel.com'])
        assert.equal(reality.minClientVer, '1.8.1')
        assert.equal(JSON.stringify(result.config).includes('www.microsoft.com'), false)
    }
})

test('custom Reality Target and SNI override defaults for Vision and gRPC', () => {
    for (const presetId of ['vless-reality-vision', 'vless-reality-grpc'] as const) {
        const result = appendProtocolPresets({}, [presetId], {
            reality: {
                targetDomain: 'swdist.apple.com',
                targetPort: 443,
                serverName: 'swdist.apple.com'
            }
        })
        const reality = result.added[0].inbound.streamSettings.realitySettings as Record<
            string,
            unknown
        >

        assert.equal(reality.target, 'swdist.apple.com:443')
        assert.deepEqual(reality.serverNames, ['swdist.apple.com'])
        assert.equal(reality.minClientVer, '1.8.1')
        const serialized = JSON.stringify(result.config)
        assert.equal(serialized.includes('www.intel.com'), false)
        assert.equal(serialized.includes('www.microsoft.com'), false)
    }
})

test('Reality Target and Server Name remain independently configurable', () => {
    const reality = appendProtocolPresets({}, ['vless-reality-vision'], {
        reality: {
            targetDomain: 'target.example.com',
            targetPort: 8443,
            serverName: 'sni.example.com'
        }
    }).added[0].inbound.streamSettings.realitySettings as Record<string, unknown>

    assert.equal(reality.target, 'target.example.com:8443')
    assert.deepEqual(reality.serverNames, ['sni.example.com'])
})

test('TLS presets require complete TLS input and new Xray Hysteria2 provisioning is closed', () => {
    assert.throws(() => appendProtocolPresets({}, ['trojan-tcp-tls']))

    const result = appendProtocolPresets({}, ['trojan-tcp-tls'], { tls })
    const trojan = result.added[0].inbound

    assert.equal(trojan.protocol, 'trojan')
    assert.deepEqual(trojan.settings.clients, [])
    assert.throws(() => appendProtocolPresets({}, ['hysteria2'], { tls }), /not supported/)
})

test('VMess is visible as a compatibility item but cannot create a broken config', () => {
    assert.throws(
        () => appendProtocolPresets({}, ['vmess-ws-tls'], { tls }),
        /not supported|not managed/i
    )
})

test('Mixed quick protocol creates a real Xray mixed listener without a share link', () => {
    const result = appendProtocolPresets({}, ['mixed'])
    const inbound = result.added[0].inbound
    assert.equal(inbound.protocol, 'mixed')
    assert.equal(inbound.listen, '0.0.0.0')
    assert.deepEqual(inbound.settings, { auth: 'noauth', udp: true, userLevel: 0 })
    assert.equal(inbound.streamSettings.network, 'raw')
    assert.equal(inbound.streamSettings.security, 'none')
    assert.match(inbound.tag, /^mixed-/)
})

test('Reality Vision defaults to the shared 1.8.1 compatibility version', () => {
    const reality = appendProtocolPresets({}, ['vless-reality-vision']).added[0].inbound
        .streamSettings.realitySettings as Record<string, unknown>

    assert.equal(reality.minClientVer, '1.8.1')
})

test('Reality gRPC defaults to the same 1.8.1 compatibility version', () => {
    const reality = appendProtocolPresets({}, ['vless-reality-grpc']).added[0].inbound
        .streamSettings.realitySettings as Record<string, unknown>

    assert.equal(reality.minClientVer, '1.8.1')
})

test('non-Reality presets do not receive minClientVer', () => {
    const result = appendProtocolPresets({}, ['trojan-tcp-tls'], { tls })

    for (const item of result.added) {
        const streamSettings = item.inbound.streamSettings as Record<string, unknown>
        assert.equal(streamSettings.security, 'tls')
        assert.equal('minClientVer' in streamSettings, false)
        assert.equal('minClientVer' in (streamSettings.tlsSettings as object), false)
    }
})

test('TLS-only VLESS stream settings do not receive Reality minClientVer', () => {
    const tlsStream = stripRealityServerOnlyFields({
        network: 'raw',
        security: 'tls',
        tlsSettings: { serverName: 'node.example.com' }
    })

    assert.equal('minClientVer' in tlsStream, false)
    assert.equal('minClientVer' in (tlsStream.tlsSettings as object), false)
})

test('Reality compatibility presets and custom version are preserved', () => {
    for (const minClientVer of ['1.8.2', '26.3.27', '0.0.0']) {
        const reality = appendProtocolPresets({}, ['vless-reality-vision'], {
            reality: {
                minClientVer,
                serverName: 'www.example.com',
                targetDomain: 'www.example.com',
                targetPort: 443
            }
        }).added[0].inbound.streamSettings.realitySettings as Record<string, unknown>
        assert.equal(reality.minClientVer, minClientVer)
    }
})

test('invalid Reality minClientVer values are rejected', () => {
    for (const value of ['abc', '1.8', '1', '', '-1.8.1']) {
        assert.equal(validateRealityMinClientVersion(value), false)
        assert.throws(() =>
            appendProtocolPresets({}, ['vless-reality-vision'], {
                reality: {
                    minClientVer: value,
                    serverName: 'www.example.com',
                    targetDomain: 'www.example.com',
                    targetPort: 443
                }
            })
        )
    }
})

test('compatibility helper compares semantic versions numerically', () => {
    assert.deepEqual(getRealityClientCompatibility('1.8.1'), {
        mihomo: true,
        singbox: true,
        xray: true
    })
    assert.deepEqual(getRealityClientCompatibility('1.8.2'), {
        mihomo: true,
        singbox: false,
        xray: true
    })
    assert.deepEqual(getRealityClientCompatibility('26.3.27'), {
        mihomo: false,
        singbox: false,
        xray: true
    })
    assert.deepEqual(getRealityClientCompatibility('0.0.0'), {
        mihomo: true,
        singbox: true,
        xray: true
    })
})

test('existing Reality config is changed only by an explicit compatibility update', () => {
    const source = {
        inbounds: [
            {
                tag: 'existing-reality',
                streamSettings: {
                    network: 'raw',
                    security: 'reality',
                    realitySettings: { serverNames: ['www.example.com'] }
                }
            },
            {
                tag: 'existing-tls',
                streamSettings: { network: 'raw', security: 'tls' }
            }
        ],
        customField: { keep: true }
    }
    const unchanged = applyRealityCompatibilityToConfig(source, '1.8.1', new Set(['other']))
    assert.equal(
        (
            (unchanged.inbounds as Array<Record<string, unknown>>)[0].streamSettings as Record<
                string,
                unknown
            >
        ).realitySettings &&
            'minClientVer' in
                ((
                    (unchanged.inbounds as Array<Record<string, unknown>>)[0]
                        .streamSettings as Record<string, unknown>
                ).realitySettings as object),
        false
    )
    const updated = applyRealityCompatibilityToConfig(
        source,
        '1.8.1',
        new Set(['existing-reality'])
    )
    assert.equal(
        (
            (
                (updated.inbounds as Array<Record<string, unknown>>)[0].streamSettings as Record<
                    string,
                    unknown
                >
            ).realitySettings as Record<string, unknown>
        ).minClientVer,
        '1.8.1'
    )
    assert.deepEqual(updated.customField, source.customField)
})

test('REALITY server-only minClientVer is stripped from client outbound settings', () => {
    const outbound = stripRealityServerOnlyFieldsFromOutbound({
        protocol: 'vless',
        streamSettings: {
            security: 'reality',
            realitySettings: {
                publicKey: 'public',
                shortId: 'short',
                minClientVer: '1.8.1'
            }
        }
    })
    const realitySettings = (outbound.streamSettings as Record<string, unknown>)
        .realitySettings as Record<string, unknown>
    assert.equal('minClientVer' in realitySettings, false)
    assert.equal(realitySettings.publicKey, 'public')
})
