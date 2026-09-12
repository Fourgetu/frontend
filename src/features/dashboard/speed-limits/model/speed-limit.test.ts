import assert from 'node:assert/strict'
import test from 'node:test'

import {
    bytesPerSecondToMbps,
    getGostForwardNetwork,
    isLoopbackAddress,
    mbpsToBytesPerSecond
} from './speed-limit.ts'

test('converts decimal Mbps to bytes/sec using SI network units', () => {
    assert.equal(mbpsToBytesPerSecond(20), 2_500_000)
    assert.equal(mbpsToBytesPerSecond(100), 12_500_000)
    assert.equal(bytesPerSecondToMbps(6_250_000), 50)
})

test('keeps zero as the unlimited sentinel in both directions', () => {
    assert.equal(mbpsToBytesPerSecond(0), 0)
    assert.equal(bytesPerSecondToMbps(0), 0)
})

test('rejects invalid or negative rates', () => {
    assert.throws(() => mbpsToBytesPerSecond(-1))
    assert.throws(() => mbpsToBytesPerSecond(Number.NaN))
    assert.throws(() => bytesPerSecondToMbps(Number.POSITIVE_INFINITY))
})

test('accepts only explicit IP loopback listeners', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true)
    assert.equal(isLoopbackAddress('::1'), true)
    assert.equal(isLoopbackAddress('localhost'), false)
    assert.equal(isLoopbackAddress('0.0.0.0'), false)
})

test('maps Hysteria to UDP and transparent Xray protocols to TCP', () => {
    assert.equal(getGostForwardNetwork('hysteria'), 'udp')
    assert.equal(getGostForwardNetwork('Hysteria2'), 'udp')
    assert.equal(getGostForwardNetwork('vless'), 'tcp')
    assert.equal(getGostForwardNetwork('trojan'), 'tcp')
})
