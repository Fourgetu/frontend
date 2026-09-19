import type { QueryClient } from '@tanstack/react-query'

type TranslationKey =
    | 'speed-limits.api.create-route-error'
    | 'speed-limits.api.create-route-unknown-error'
    | 'speed-limits.api.update-route-error'
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

const isRuntimeSyncError = (error: unknown): boolean => {
    const record = asRecord(error)
    const response = asRecord(record?.response)
    const responseBody = asRecord(response?.data)
    const cause = asRecord(record?.cause)

    // handleRequestError retains the API error body as Error.cause.
    return cause?.errorCode === 'A271' || responseBody?.errorCode === 'A271'
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
            message: translate(
                isRuntimeSyncError(error)
                    ? 'speed-limits.api.runtime-sync-failed'
                    : 'speed-limits.api.create-route-unknown-error'
            )
        })
    }
})
