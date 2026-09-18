import { createQueryKeys } from '@lukemorales/query-key-factory'
import { notifications } from '@mantine/notifications'
import { t } from 'i18next'
import { z } from 'zod'

import { createGetQueryHook, createMutationHook, errorHandler } from '../../tsq-helpers'

export const speedLimitSchema = z.object({
    uuid: z.uuid(),
    name: z.string(),
    downloadBytesPerSecond: z.number().nonnegative(),
    uploadBytesPerSecond: z.number().nonnegative(),
    enabled: z.boolean(),
    createdAt: z.iso.datetime().transform((value) => new Date(value)),
    updatedAt: z.iso.datetime().transform((value) => new Date(value))
})

export type SpeedLimit = z.infer<typeof speedLimitSchema>

const speedBodySchema = z.object({
    name: z.string().trim().min(1).max(100),
    downloadBytesPerSecond: z.number().int().nonnegative(),
    uploadBytesPerSecond: z.number().int().nonnegative(),
    enabled: z.boolean()
})

const updateSpeedBodySchema = speedBodySchema.partial().extend({ uuid: z.uuid() })
const speedResponseSchema = z.object({ response: speedLimitSchema })
const speedsResponseSchema = z.object({ response: z.array(speedLimitSchema) })
const uuidRouteSchema = z.object({ uuid: z.uuid() })

export const speedLimitsQueryKeys = createQueryKeys('speedLimits', {
    getAll: { queryKey: null }
})

export const useGetSpeedLimits = createGetQueryHook({
    endpoint: '/api/speed-limits/',
    responseSchema: speedsResponseSchema,
    getQueryKey: () => speedLimitsQueryKeys.getAll.queryKey,
    rQueryParams: { refetchOnMount: true },
    errorHandler: (error) => errorHandler(error, t('speed-limits.api.get-policies-error'))
})

const success = (message: string) =>
    notifications.show({ color: 'teal', message, title: t('common.message.success') })

export const useCreateSpeedLimit = createMutationHook({
    endpoint: '/api/speed-limits/',
    requestMethod: 'post',
    bodySchema: speedBodySchema,
    responseSchema: speedResponseSchema,
    rMutationParams: {
        onSuccess: (_data, _variables, _context, queryClient) => {
            void queryClient.invalidateQueries({ queryKey: speedLimitsQueryKeys.getAll.queryKey })
            success(t('speed-limits.api.policy-created'))
        }
    }
})

export const useUpdateSpeedLimit = createMutationHook({
    endpoint: '/api/speed-limits/',
    requestMethod: 'patch',
    bodySchema: updateSpeedBodySchema,
    responseSchema: speedResponseSchema,
    rMutationParams: {
        onSuccess: (_data, _variables, _context, queryClient) => {
            void queryClient.invalidateQueries({ queryKey: speedLimitsQueryKeys.getAll.queryKey })
            success(t('speed-limits.api.policy-updated'))
        }
    }
})

export const useDeleteSpeedLimit = createMutationHook({
    endpoint: '/api/speed-limits/:uuid',
    requestMethod: 'delete',
    routeParamsSchema: uuidRouteSchema,
    rMutationParams: {
        onSuccess: (_data, _variables, _context, queryClient) => {
            void queryClient.invalidateQueries({ queryKey: speedLimitsQueryKeys.getAll.queryKey })
            success(t('speed-limits.api.policy-removed'))
        }
    }
})
