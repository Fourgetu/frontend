import assert from 'node:assert/strict'
import test from 'node:test'

import { adaptShareLinkToOutbound, parseShareLink } from './index.ts'

const base64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64')

test('imports VLESS Reality without losing Reality query parameters', () => {
    const link = parseShareLink(
        'vless://uuid@example.com:443?security=reality&type=tcp&sni=www.example.com&fp=chrome&pbk=public&sid=abcd&spx=%2Fpath&flow=xtls-rprx-vision#Reality%20Exit'
    )
    assert.equal(link.address, 'example.com')
    assert.equal(link.sni, 'www.example.com')
    assert.equal(link.publicKey, 'public')
    assert.equal(link.shortId, 'abcd')
    assert.equal(link.spiderX, '/path')
    assert.equal(link.remark, 'Reality Exit')
    const xray = adaptShareLinkToOutbound(link, 'xray', 'reality')
    const stream = xray.streamSettings as Record<string, unknown>
    assert.equal(stream.security, 'reality')
    assert.equal((stream.realitySettings as Record<string, unknown>).publicKey, 'public')
    const singbox = adaptShareLinkToOutbound(link, 'singbox', 'reality')
    assert.equal(
        ((singbox.tls as Record<string, unknown>).reality as Record<string, unknown>).public_key,
        'public'
    )
})

test('imports VLESS TLS with URL-encoded path and SNI', () => {
    const link = parseShareLink(
        'vless://uuid@example.com:443?security=tls&type=ws&sni=cdn.example.com&path=%2Fedge%2Fws&host=cdn.example.com#TLS%20WS'
    )
    assert.equal(link.path, '/edge/ws')
    assert.equal(link.sni, 'cdn.example.com')
    assert.equal(link.remark, 'TLS WS')
})

test('imports common VMess WebSocket TLS JSON', () => {
    const uri = `vmess://${base64(
        JSON.stringify({
            v: '2',
            ps: 'VMess WS',
            add: 'vmess.example.com',
            port: '443',
            id: 'uuid',
            aid: '0',
            net: 'ws',
            type: 'none',
            host: 'cdn.example.com',
            path: '/ws',
            tls: 'tls',
            sni: 'sni.example.com'
        })
    )}`
    const link = parseShareLink(uri)
    assert.equal(link.protocol, 'vmess')
    assert.equal(link.network, 'ws')
    assert.equal(link.security, 'tls')
    assert.equal(link.path, '/ws')
    const singbox = adaptShareLinkToOutbound(link, 'singbox', 'vmess')
    assert.equal(singbox.alter_id, 0)
})

test('imports Trojan TLS and SIP002 Shadowsocks', () => {
    const trojan = parseShareLink(
        'trojan://secret@trojan.example.com:443?security=tls&sni=trojan.example.com#Trojan'
    )
    assert.equal(trojan.password, 'secret')
    assert.equal(adaptShareLinkToOutbound(trojan, 'xray', 'trojan').protocol, 'trojan')

    const ss = parseShareLink(`ss://${base64('aes-128-gcm:password')}@ss.example.com:8388#SS`)
    assert.equal(ss.method, 'aes-128-gcm')
    assert.equal(ss.password, 'password')
    assert.equal(adaptShareLinkToOutbound(ss, 'singbox', 'ss').type, 'shadowsocks')
})

test('preserves supported Shadowsocks plugins for sing-box and rejects unsafe Xray conversion', () => {
    const ss = parseShareLink(
        `ss://${base64('aes-128-gcm:password')}@ss.example.com:8388?plugin=v2ray-plugin%3Bmode%3Dwebsocket#Plugin`
    )
    const outbound = adaptShareLinkToOutbound(ss, 'singbox', 'plugin')
    assert.equal(outbound.plugin, 'v2ray-plugin')
    assert.equal(outbound.plugin_opts, 'mode=websocket')
    assert.throws(() => adaptShareLinkToOutbound(ss, 'xray', 'plugin'), /not safely/)
})

test('imports Hysteria2/hy2 and TUIC only for sing-box', () => {
    for (const scheme of ['hysteria2', 'hy2']) {
        const link = parseShareLink(
            `${scheme}://password@hy2.example.com:443?sni=hy2.example.com&obfs=salamander&obfs-password=secret#HY2`
        )
        assert.equal(link.protocol, 'hysteria2')
        assert.equal(adaptShareLinkToOutbound(link, 'singbox', 'hy2').type, 'hysteria2')
        assert.throws(() => adaptShareLinkToOutbound(link, 'xray', 'hy2'), /cannot be represented/)
    }
    const tuic = parseShareLink('tuic://uuid:password@tuic.example.com:443?sni=tuic.example.com')
    assert.equal(adaptShareLinkToOutbound(tuic, 'singbox', 'tuic').type, 'tuic')
})

test('malformed and unsupported share links fail explicitly', () => {
    assert.throws(() => parseShareLink('not-a-uri'), /complete protocol share link/)
    assert.throws(() => parseShareLink('wireguard://example.com'), /not supported/)
    assert.throws(() => parseShareLink('vless://@example.com:443'), /UUID/)
})
