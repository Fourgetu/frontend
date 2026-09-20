import type { QueryClient } from '@tanstack/react-query'

type TranslationKey =
    | 'speed-limits.api.create-route-error'
    | 'speed-limits.api.create-route-unknown-error'
    | 'speed-limits.api.update-route-error'
    | 'speed-limits.api.hopping-allocation-failed'
    | 'speed-limits.api.hopping-config-incompatible'
    | 'speed-limits.api.hopping-runtime-failed'
    | 'speed-limits.api.runtime-sync-failed'
    | 'speed-limits.api.runtime-confirmed'
    | 'speed-limits.api.route-created'
    | 'speed-limits.api.route-updated'

interface RouteNotification {
    color: 'red' | 'teal'
    title: string
    message: string
}

interface RouteMutationFeedback {
    operation?: 'create' | 'update'
    invalidateRoutes: (
        data: unknown,
        variables: unknown,
        context: unknown,
        queryClient: QueryClient
    ) => void
    notify: (notification: RouteNotification) => unknown
    translate: (key: TranslationKey) => string
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined

const getApiErrorBody = (error: unknown): Record<string, unknown> | undefined => {
    const record = asRecord(error)
    const response = asRecord(record?.response)
    const responseBody = asRecord(response?.data)
    const cause = asRecord(record?.cause)

    return cause ?? responseBody
}

const resolveErrorMessageKey = (error: unknown): TranslationKey => {
    const body = getApiErrorBody(error)
    const errorCode = body?.errorCode
    const message = typeof body?.message === 'string' ? body.message : ''

    if (errorCode === 'A271' && /port hopping|nftables|net_admin|ingress/i.test(message)) {
        return 'speed-limits.api.hopping-runtime-failed'
    }
    if (errorCode === 'A271') return 'speed-limits.api.runtime-sync-failed'
    if (
        errorCode === 'A266' &&
        /unable to (allocate|update) (?:a |the )?hysteria2 hopping/i.test(message)
    ) {
        return 'speed-limits.api.hopping-allocation-failed'
    }
    if (errorCode === 'A266' && /port hopping requires/i.test(message)) {
        return 'speed-limits.api.hopping-config-incompatible'
    }

    return 'speed-limits.api.create-route-unknown-error'
}

export const createUserRouteMutationCallbacks = ({
    operation = 'create',
    invalidateRoutes,
    notify,
    translate
}: RouteMutationFeedback) => ({
    onSuccess: (data: unknown, variables: unknown, context: unknown, queryClient: QueryClient) => {
        invalidateRoutes(data, variables, context, queryClient)
        notify({
            color: 'teal',
            title: translate('speed-limits.api.runtime-confirmed'),
            message: translate(
                operation === 'update'
                    ? 'speed-limits.api.route-updated'
                    : 'speed-limits.api.route-created'
            )
        })
    },
    onError: (error: unknown) => {
        notify({
            color: 'red',
            title: translate(
                operation === 'update'
                    ? 'speed-limits.api.update-route-error'
                    : 'speed-limits.api.create-route-error'
            ),
            message: translate(resolveErrorMessageKey(error))
        })
    }
})
