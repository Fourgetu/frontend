import assert from 'node:assert/strict'
import test from 'node:test'

import { CloneHostCommand } from '../../../../api/types/clone-host.command.ts'
import { groupHopsByAs, isTimedOutHop, resolveConnectivity } from './trace.types.ts'

const hop = {
    addr: '192.0.2.1',
    asn: 64500,
    avg_ms: 2,
    best_ms: 1,
    worst_ms: 3,
    ttl: 1,
    recv: 3,
    sent: 3,
    loss: 0
}
const target = {
    id: 'test',
    name: 'Test',
    host: 'example.com',
    hops: [hop],
    excess_ms: 1,
    jitter_ms: 1,
    loss: 0,
    rtt_ms: 2,
    score: 90,
    verdict: 'direct'
}

test('accepts direct and wrapped connectivity reports without changing the raw JSON', () => {
    const report = { targets: [target], score: 90, unknown: { retained: true } }
    const original = structuredClone(report)
    assert.deepEqual(resolveConnectivity(report)?.targets, [target])
    assert.deepEqual(resolveConnectivity({ connectivity: report })?.targets, [target])
    assert.deepEqual(report, original)
    assert.deepEqual(resolveConnectivity({ targets: [] }), { targets: [] })
})

test('old, incomplete and malformed reports fall back instead of reaching numeric renderers', () => {
    for (const report of [
        null,
        [],
        {},
        { targets: [{}] },
        { targets: [{ ...target, hops: null }] },
        { targets: [{ ...target, rtt_ms: 'bad' }] },
        { targets: [{ ...target, notes: [{}] }] },
        { targets: [target], latency_floor_ms: null },
        { targets: [{ ...target, rtt_ms: Infinity }] }
    ]) {
        assert.equal(resolveConnectivity(report), null)
    }
})

test('groups adjacent AS hops and recognizes timeout hops', () => {
    const segments = groupHopsByAs([hop, { ...hop, ttl: 2 }, { ...hop, asn: 64501, ttl: 3 }])
    assert.deepEqual(
        segments.map((segment) => segment.hops.length),
        [2, 1]
    )
    assert.equal(isTimedOutHop({ ...hop, recv: 0 }), true)
    assert.equal(isTimedOutHop(hop), false)
})

test('backported clone command has a canonical URL and validates UUIDs', () => {
    assert.equal(CloneHostCommand.TSQ_url, '/api/hosts/actions/clone')
    assert.equal(
        CloneHostCommand.RequestBodySchema.safeParse({ cloneFromUuid: 'invalid' }).success,
        false
    )
    assert.equal(
        CloneHostCommand.RequestBodySchema.safeParse({
            cloneFromUuid: '00000000-0000-4000-8000-000000000001'
        }).success,
        true
    )
})
