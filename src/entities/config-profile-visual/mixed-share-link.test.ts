import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMixedShareLink, resolveMixedShareAddress } from './mixed-share-link.ts'

const input = {
    address: 'proxy.example.com',
    auth: 'password' as const,
    password: 'p:@/?#',
    port: 34903,
    tag: 'mixed 测试',
    username: 'a:b@c'
}

test('Mixed exports separate SOCKS5 and HTTP links with encoded credentials', () => {
    assert.equal(
        buildMixedShareLink({ ...input, protocol: 'socks5' }),
        'socks5://a%3Ab%40c:p%3A%40%2F%3F%23@proxy.example.com:34903#mixed%20%E6%B5%8B%E8%AF%95'
    )
    assert.equal(
        buildMixedShareLink({ ...input, protocol: 'http' }),
        'http://a%3Ab%40c:p%3A%40%2F%3F%23@proxy.example.com:34903#mixed%20%E6%B5%8B%E8%AF%95'
    )
})

test('Mixed noauth links do not invent credentials', () => {
    assert.equal(
        buildMixedShareLink({
            ...input,
            auth: 'noauth',
            username: '',
            password: '',
            protocol: 'socks5',
            address: '203.0.113.10'
        }),
        'socks5://203.0.113.10:34903#mixed%20%E6%B5%8B%E8%AF%95'
    )
})

test('Mixed links support bracketed IPv6 and reject a listening wildcard or URL', () => {
    assert.equal(resolveMixedShareAddress('[2001:db8::1]'), '[2001:db8::1]')
    assert.equal(
        buildMixedShareLink({ ...input, address: '[2001:db8::1]', protocol: 'http' }),
        'http://a%3Ab%40c:p%3A%40%2F%3F%23@[2001:db8::1]:34903#mixed%20%E6%B5%8B%E8%AF%95'
    )
    for (const address of [
        '',
        '0.0.0.0',
        '[::]',
        'proxy.example.com:8080',
        'https://proxy.example.com',
        'proxy.example.com/path',
        'user@proxy.example.com'
    ]) {
        assert.equal(resolveMixedShareAddress(address), null, address)
    }
})

test('Mixed links are unavailable for incomplete authentication or invalid ports', () => {
    assert.equal(buildMixedShareLink({ ...input, username: '', protocol: 'http' }), null)
    assert.equal(buildMixedShareLink({ ...input, password: '', protocol: 'http' }), null)
    assert.equal(buildMixedShareLink({ ...input, port: 0, protocol: 'http' }), null)
    assert.equal(buildMixedShareLink({ ...input, port: 65_536, protocol: 'http' }), null)
})
