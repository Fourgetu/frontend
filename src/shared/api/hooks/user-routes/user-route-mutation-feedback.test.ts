import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { handleRequestError } from '../../helpers/handler-request-error.ts'
import { createUserRouteMutationCallbacks } from './user-route-mutation-feedback.ts'

const locales = {
    en: JSON.parse(
        readFileSync(
            new URL('../../../../../public/locales/en/remnawave.json', import.meta.url),
            'utf8'
        )
    ),
    zh: JSON.parse(
        readFileSync(
            new URL('../../../../../public/locales/zh/remnawave.json', import.meta.url),
            'utf8'
        )
    )
}

const routeQueryKey = ['userRoutes', 'getAll'] as const

const createFeedback = (
    locale: keyof typeof locales = 'zh',
    operation: 'create' | 'update' = 'create'
) => {
    const notifications: { color: string; title: string; message: string }[] = []
    const invalidations: unknown[] = []
    const callbacks = createUserRouteMutationCallbacks({
        operation,
        invalidateRoutes: (data, _variables, _context, queryClient) => {
            invalidations.push(data)
            void queryClient.invalidateQueries({ queryKey: routeQueryKey })
        },
        notify: (notification) => notifications.push(notification),
        translate: (key) =>
            locales[locale]['speed-limits'].api[key.replace('speed-limits.api.', '')]
    })
    return { callbacks, notifications, invalidations }
}

const runtimeAxiosError = () =>
    new AxiosError(
        'Request failed with status code 502',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
            status: 502,
            statusText: 'Bad Gateway',
            headers: {},
            config: { headers: new AxiosHeaders() },
            data: {
                errorCode: 'A271',
                message: 'connect failed: https://sensitive-user:sensitive-password@node.invalid',
                payload: { secretKey: 'sensitive-node-key' }
            }
        }
    )

const normalizeRuntimeError = () => {
    try {
        handleRequestError(runtimeAxiosError())
    } catch (error) {
        return error
    }
}

const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false, gcTime: 0 }
        }
    })

test('create route callback shows Chinese GOST/TLS guidance for normalized HTTP 502/A271', () => {
    const { callbacks, notifications } = createFeedback()
    callbacks.onError(normalizeRuntimeError())

    assert.deepEqual(notifications, [
        {
            color: 'red',
            title: '创建用户线路失败',
            message: 'Node GOST 同步失败，请检查节点连接或 TLS 配置。'
        }
    ])
    assert.doesNotMatch(JSON.stringify(notifications), /sensitive-|node\.invalid|payload/)
})

test('create route callback also recognizes an unwrapped HTTP 502/A271 Axios error', () => {
    const { callbacks, notifications } = createFeedback('en')
    callbacks.onError(runtimeAxiosError())

    assert.deepEqual(notifications, [
        {
            color: 'red',
            title: 'Create user route failed',
            message:
                'Node GOST synchronization failed. Check the node connection or TLS configuration.'
        }
    ])
})

test('unknown create errors always display safe guidance without echoing server or request data', () => {
    const { callbacks, notifications } = createFeedback()
    const errors = [
        new Error('sensitive-password'),
        { response: { status: 500, data: { errorCode: 'A267', message: 'sensitive-secret-key' } } },
        'sensitive-private-key',
        undefined
    ]
    for (const error of errors) callbacks.onError(error)

    assert.equal(notifications.length, errors.length)
    for (const notification of notifications) {
        assert.equal(notification.color, 'red')
        assert.equal(notification.message, '无法完成用户线路操作，请刷新线路列表确认状态后重试。')
    }
    assert.doesNotMatch(JSON.stringify(notifications), /sensitive-/)
})

test('a generic gateway 502 or A271 text without the API code is not mislabeled as Node sync', () => {
    const { callbacks, notifications } = createFeedback('en')
    callbacks.onError({ response: { status: 502, data: '<html>gateway error</html>' } })
    callbacks.onError(new Error('A271 appears in arbitrary server text'))

    for (const notification of notifications) {
        assert.equal(
            notification.message,
            'Unable to complete the user route operation. Refresh the route list to check its status before retrying.'
        )
    }
})

test('failed route mutation ends pending, reports the error once and does not run success actions', async () => {
    const queryClient = createQueryClient()
    const { callbacks, notifications, invalidations } = createFeedback()
    const pending = Promise.withResolvers<unknown>()
    const observer = new MutationObserver(queryClient, {
        mutationFn: () => pending.promise,
        onSuccess: (data, variables, context) =>
            callbacks.onSuccess(data, variables, context, queryClient),
        onError: callbacks.onError
    })

    try {
        const result = observer.mutate()
        assert.equal(observer.getCurrentResult().isPending, true)
        pending.reject(normalizeRuntimeError())
        await assert.rejects(result)

        assert.equal(observer.getCurrentResult().isPending, false)
        assert.equal(observer.getCurrentResult().isError, true)
        assert.equal(notifications.length, 1)
        assert.equal(notifications[0].color, 'red')
        assert.deepEqual(invalidations, [])
    } finally {
        observer.reset()
        queryClient.clear()
    }
})

test('successful route mutation preserves cache invalidation, success notification and pending completion', async () => {
    const queryClient = createQueryClient()
    const { callbacks, notifications, invalidations } = createFeedback()
    const route = { uuid: '00000000-0000-4000-8000-000000000001', externalPort: 32001 }
    const pending = Promise.withResolvers<typeof route>()
    const observer = new MutationObserver(queryClient, {
        mutationFn: () => pending.promise,
        onSuccess: (data, variables, context) =>
            callbacks.onSuccess(data, variables, context, queryClient),
        onError: callbacks.onError
    })
    queryClient.setQueryData(routeQueryKey, [])

    try {
        const result = observer.mutate()
        assert.equal(observer.getCurrentResult().isPending, true)
        pending.resolve(route)
        assert.deepEqual(await result, route)

        assert.equal(observer.getCurrentResult().isPending, false)
        assert.equal(observer.getCurrentResult().isSuccess, true)
        assert.equal(queryClient.getQueryState(routeQueryKey)?.isInvalidated, true)
        assert.deepEqual(invalidations, [route])
        assert.deepEqual(notifications, [
            {
                color: 'teal',
                title: '运行状态已确认',
                message: '仅在 GOST 接受转发配置后，用户线路才会保存。'
            }
        ])
    } finally {
        observer.reset()
        queryClient.clear()
    }
})

test('update route callback shows localized GOST/TLS guidance for normalized HTTP 502/A271', () => {
    const { callbacks, notifications } = createFeedback('zh', 'update')
    callbacks.onError(normalizeRuntimeError())

    assert.deepEqual(notifications, [
        {
            color: 'red',
            title: '更新用户线路失败',
            message: 'Node GOST 同步失败，请检查节点连接或 TLS 配置。'
        }
    ])
    assert.doesNotMatch(JSON.stringify(notifications), /sensitive-|node\.invalid|payload/)
})

test('update route callback recognizes an unwrapped HTTP 502/A271 error in English', () => {
    const { callbacks, notifications } = createFeedback('en', 'update')
    callbacks.onError(runtimeAxiosError())

    assert.deepEqual(notifications, [
        {
            color: 'red',
            title: 'Update user route failed',
            message:
                'Node GOST synchronization failed. Check the node connection or TLS configuration.'
        }
    ])
})

test('unknown update errors display safe guidance without leaking server or request data', () => {
    const { callbacks, notifications } = createFeedback('zh', 'update')
    callbacks.onError({
        response: {
            status: 400,
            data: { errorCode: 'A267', message: 'sensitive-password', secretKey: 'sensitive-key' }
        }
    })

    assert.deepEqual(notifications, [
        {
            color: 'red',
            title: '更新用户线路失败',
            message: '无法完成用户线路操作，请刷新线路列表确认状态后重试。'
        }
    ])
    assert.doesNotMatch(JSON.stringify(notifications), /sensitive-/)
})

test('failed update finishes loading, retains the edit modal and skips cache invalidation', async () => {
    const queryClient = createQueryClient()
    const { callbacks, notifications, invalidations } = createFeedback('zh', 'update')
    const pending = Promise.withResolvers<unknown>()
    let modalOpen = true
    let settled = false
    const observer = new MutationObserver(queryClient, {
        mutationFn: () => pending.promise,
        onSuccess: (data, variables, context) =>
            callbacks.onSuccess(data, variables, context, queryClient),
        onError: callbacks.onError,
        onSettled: () => {
            settled = true
        }
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
        const result = observer.mutate(undefined, {
            onSuccess: () => {
                modalOpen = false
            }
        })
        assert.equal(observer.getCurrentResult().isPending, true)
        pending.reject(normalizeRuntimeError())
        await assert.rejects(result)

        assert.equal(observer.getCurrentResult().isPending, false)
        assert.equal(observer.getCurrentResult().isError, true)
        assert.equal(settled, true)
        assert.equal(modalOpen, true)
        assert.equal(notifications.length, 1)
        assert.equal(notifications[0].color, 'red')
        assert.deepEqual(invalidations, [])
    } finally {
        unsubscribe()
        observer.reset()
        queryClient.clear()
    }
})

test('successful update preserves invalidation, localized feedback and per-call modal close', async () => {
    const queryClient = createQueryClient()
    const { callbacks, notifications, invalidations } = createFeedback('zh', 'update')
    const route = {
        uuid: '00000000-0000-4000-8000-000000000001',
        externalPort: 32000,
        portHoppingConfigUuid: '00000000-0000-4000-8000-000000000002'
    }
    const pending = Promise.withResolvers<typeof route>()
    let modalOpen = true
    const observer = new MutationObserver(queryClient, {
        mutationFn: () => pending.promise,
        onSuccess: (data, variables, context) =>
            callbacks.onSuccess(data, variables, context, queryClient),
        onError: callbacks.onError
    })
    const unsubscribe = observer.subscribe(() => {})
    queryClient.setQueryData(routeQueryKey, [])

    try {
        const result = observer.mutate(undefined, {
            onSuccess: () => {
                modalOpen = false
            }
        })
        assert.equal(observer.getCurrentResult().isPending, true)
        pending.resolve(route)
        assert.deepEqual(await result, route)

        assert.equal(observer.getCurrentResult().isPending, false)
        assert.equal(observer.getCurrentResult().isSuccess, true)
        assert.equal(modalOpen, false)
        assert.equal(queryClient.getQueryState(routeQueryKey)?.isInvalidated, true)
        assert.deepEqual(invalidations, [route])
        assert.deepEqual(notifications, [
            {
                color: 'teal',
                title: '运行状态已确认',
                message: '用户线路已更新并同步，请更新客户端订阅以获取最新端口配置。'
            }
        ])
    } finally {
        unsubscribe()
        observer.reset()
        queryClient.clear()
    }
})
