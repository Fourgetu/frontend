import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createUserRoutesSequentially,
    getFailedRouteUserIds,
    type RouteBatchResult
} from './user-route-batch.ts'

const input = {
    nodeUuid: 'node',
    inboundUuid: 'inbound',
    hostUuid: 'host',
    speedLimitUuid: 'speed',
    portHoppingConfigUuid: 'hopping',
    externalPort: 32123,
    allowPublicInbound: true,
    internalAddress: '127.0.0.1' as const,
    internalPort: 8443,
    network: 'udp' as const
}
const users = ['1', '2', '3'].map((value) => ({ value, label: `User ${value}` }))

test('awaits each runtime verification, deduplicates users and allocates batch ports on server', async () => {
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
        releaseFirst = resolve
    })
    const calls: number[] = []
    const snapshots: RouteBatchResult[][] = []
    const pending = createUserRoutesSequentially({
        users: [...users, users[0]],
        input,
        create: async (payload) => {
            calls.push(payload.userId)
            assert.equal('externalPort' in payload, false)
            assert.equal(payload.hostUuid, 'host')
            assert.equal(payload.configProfileInboundUuid, 'inbound')
            assert.equal(payload.portHoppingConfigUuid, 'hopping')
            assert.equal(payload.speedLimitUuid, 'speed')
            assert.equal(payload.allowPublicInbound, true)
            assert.equal(payload.network, 'udp')
            if (payload.userId === 1) await first
            return { externalPort: 32000 + payload.userId }
        },
        onProgress: (results) => snapshots.push(results)
    })
    assert.deepEqual(calls, [1])
    assert.deepEqual(
        snapshots.at(-1)?.map((result) => result.status),
        ['creating', 'pending', 'pending']
    )
    releaseFirst()
    const results = await pending
    assert.deepEqual(calls, [1, 2, 3])
    assert.deepEqual(
        results.map((result) => result.status === 'success' && result.externalPort),
        [32001, 32002, 32003]
    )
    assert.deepEqual(
        snapshots[0].map((result) => result.status),
        ['pending', 'pending', 'pending']
    )
    assert.deepEqual(getFailedRouteUserIds(results), [])
})

test('continues after a failed user and retries only the failed selection', async () => {
    const failure = new Error('Runtime could not be applied')
    const results = await createUserRoutesSequentially({
        users,
        input,
        create: async ({ userId }) => {
            if (userId === 2) throw failure
            return { externalPort: 32000 + userId }
        },
        onProgress: () => {}
    })
    assert.deepEqual(
        results.map((result) => result.status),
        ['success', 'failed', 'success']
    )
    assert.equal(results[1].status === 'failed' && results[1].error, failure)
    const failedIds = getFailedRouteUserIds(results)
    assert.deepEqual(failedIds, ['2'])
    const retried: number[] = []
    await createUserRoutesSequentially({
        users: users.filter((user) => failedIds.includes(user.value)),
        input: { ...input, externalPort: '' },
        create: async (payload) => {
            retried.push(payload.userId)
            assert.equal('externalPort' in payload, false)
            return { externalPort: 32002 }
        },
        onProgress: () => {}
    })
    assert.deepEqual(retried, [2])
})

test('preserves a manual port for one user and snapshots settings before asynchronous work', async () => {
    const settings = { ...input }
    const results = await createUserRoutesSequentially({
        users: [users[0]],
        input: settings,
        onProgress: () => {
            settings.hostUuid = 'changed'
        },
        create: async (payload) => {
            assert.equal(payload.hostUuid, 'host')
            assert.equal(payload.externalPort, 32123)
            return { externalPort: payload.externalPort! }
        }
    })
    assert.equal(results[0].status, 'success')
})

test('retains all failed users and submits nothing for an empty selection', async () => {
    const results = await createUserRoutesSequentially({
        users,
        input,
        create: async () => {
            throw new Error('Network disconnected')
        },
        onProgress: () => {}
    })
    assert.deepEqual(getFailedRouteUserIds(results), ['1', '2', '3'])
    const empty = await createUserRoutesSequentially({
        users: [],
        input,
        create: async () => {
            throw new Error('Must not be called')
        },
        onProgress: () => {}
    })
    assert.deepEqual(empty, [])
})
