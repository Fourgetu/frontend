import { createQueryKeys } from '@lukemorales/query-key-factory'
import { notifications } from '@mantine/notifications'
import { t } from 'i18next'
import { z } from 'zod'

import { createGetQueryHook, createMutationHook, errorHandler } from '../../tsq-helpers'

export const userRouteSchema = z.object({
    uuid: z.uuid(),
    userId: z.number().int().positive(),
    nodeUuid: z.uuid(),
    configProfileInboundUuid: z.uuid(),
    hostUuid: z.uuid(),
    speedLimitUuid: z.uuid().nullable(),
    portHoppingConfigUuid: z.uuid().nullable(),
    externalPort: z.number().int().min(1).max(65535),
    internalAddress: z.string(),
    internalPort: z.number().int().min(1).max(65535),
    gostForwardId: z.string().nullable(),
    gostServiceName: z.string().nullable(),
    network: z.enum(['tcp', 'udp']),
    enabled: z.boolean(),
    hopStartPort: z.number().int().min(1).max(65535).nullable(),
    hopEndPort: z.number().int().min(1).max(65535).nullable(),
    createdAt: z.iso.datetime().transform((value) => new Date(value)),
    updatedAt: z.iso.datetime().transform((value) => new Date(value))
})

export type UserRoute = z.infer<typeof userRouteSchema>

export const portHoppingConfigSchema = z.object({
    uuid: z.uuid(),
    configProfileInboundUuid: z.uuid(),
    enabled: z.boolean(),
    poolStart: z.number().int().min(1).max(65535),
    poolEnd: z.number().int().min(1).max(65535),
    portsPerUser: z.number().int().min(2).max(1024),
    hopIntervalSeconds: z.number().int().min(1).max(86400),
    createdAt: z.iso.datetime().transform((value) => new Date(value)),
    updatedAt: z.iso.datetime().transform((value) => new Date(value))
})
export type PortHoppingConfig = z.infer<typeof portHoppingConfigSchema>

const createRouteBodySchema = z.object({
    userId: z.number().int().positive(),
    nodeUuid: z.uuid(),
    configProfileInboundUuid: z.uuid(),
    hostUuid: z.uuid(),
    speedLimitUuid: z.uuid().nullable().optional(),
    portHoppingConfigUuid: z.uuid().nullable().optional(),
    externalPort: z.number().int().min(1).max(65535).optional(),
    internalAddress: z.enum(['127.0.0.1', '::1']),
    internalPort: z.number().int().min(1).max(65535),
    network: z.enum(['tcp', 'udp']),
    enabled: z.boolean()
})
const updateRouteBodySchema = z.object({
    uuid: z.uuid(),
    speedLimitUuid: z.uuid().nullable().optional(),
    portHoppingConfigUuid: z.uuid().nullable().optional(),
    externalPort: z.number().int().min(1).max(65535).optional(),
    enabled: z.boolean().optional()
})
const routeResponseSchema = z.object({ response: userRouteSchema })
const routesResponseSchema = z.object({ response: z.array(userRouteSchema) })
const uuidRouteSchema = z.object({ uuid: z.uuid() })

export const userRoutesQueryKeys = createQueryKeys('userRoutes', {
    getAll: { queryKey: null },
    hoppingConfigs: { queryKey: null },
    runtime: (nodeUuid: string) => ({ queryKey: [nodeUuid] })
})

export const useGetUserRoutes = createGetQueryHook({
    endpoint: '/api/user-routes/',
    responseSchema: routesResponseSchema,
    getQueryKey: () => userRoutesQueryKeys.getAll.queryKey,
    rQueryParams: { refetchOnMount: true },
    errorHandler: (error) => errorHandler(error, t('speed-limits.api.get-routes-error'))
})

export const useGetUserRouteRuntime = createGetQueryHook({
    endpoint: '/api/user-routes/runtime/:nodeUuid',
    routeParamsSchema: z.object({ nodeUuid: z.uuid() }),
    responseSchema: z.object({
        response: z.object({
            nodeUuid: z.uuid(),
            running: z.boolean(),
            installed: z.boolean(),
            gostVersion: z.string().nullable(),
            services: z.number().int().nonnegative(),
            configPath: z.string(),
            error: z.string().nullable(),
            portHopping: z.object({
                mode: z.enum(['disabled', 'nftables']),
                available: z.boolean(),
                applied: z.boolean(),
                requiresNetAdmin: z.literal(true),
                rules: z.number().int().nonnegative(),
                error: z.string().nullable()
            })
        })
    }),
    getQueryKey: ({ route }) => userRoutesQueryKeys.runtime(route!.nodeUuid).queryKey,
    rQueryParams: { enabled: false },
    errorHandler: (error) => errorHandler(error, t('speed-limits.api.get-runtime-error'))
})

export const useGetPortHoppingConfigs = createGetQueryHook({
    endpoint: '/api/user-routes/port-hopping-configs',
    responseSchema: z.object({ response: z.array(portHoppingConfigSchema) }),
    getQueryKey: () => userRoutesQueryKeys.hoppingConfigs.queryKey,
    rQueryParams: { refetchOnMount: true },
    errorHandler: (error) => errorHandler(error, t('speed-limits.api.get-hopping-error'))
})

const invalidateRoutes = (
    _data: unknown,
    _variables: unknown,
    _context: unknown,
    queryClient: import('@tanstack/react-query').QueryClient
) => {
    void queryClient.invalidateQueries({ queryKey: userRoutesQueryKeys.getAll.queryKey })
}

const invalidateHoppingConfigs = (
    _data: unknown,
    _variables: unknown,
    _context: unknown,
    queryClient: import('@tanstack/react-query').QueryClient
) => {
    void queryClient.invalidateQueries({ queryKey: userRoutesQueryKeys.hoppingConfigs.queryKey })
    void queryClient.invalidateQueries({ queryKey: userRoutesQueryKeys.getAll.queryKey })
}

const hoppingFieldsSchema = z.object({
    enabled: z.boolean(),
    poolStart: z.number().int().min(1).max(65535),
    poolEnd: z.number().int().min(1).max(65535),
    portsPerUser: z.number().int().min(2).max(1024),
    hopIntervalSeconds: z.number().int().min(1).max(86400)
})

export const useCreatePortHoppingConfig = createMutationHook({
    endpoint: '/api/user-routes/port-hopping-configs',
    requestMethod: 'post',
    bodySchema: hoppingFieldsSchema.extend({ configProfileInboundUuid: z.uuid() }),
    responseSchema: z.object({ response: portHoppingConfigSchema }),
    rMutationParams: { onSuccess: invalidateHoppingConfigs }
})

export const useUpdatePortHoppingConfig = createMutationHook({
    endpoint: '/api/user-routes/port-hopping-configs/:uuid',
    requestMethod: 'patch',
    routeParamsSchema: uuidRouteSchema,
    bodySchema: hoppingFieldsSchema.partial(),
    responseSchema: z.object({ response: portHoppingConfigSchema }),
    rMutationParams: { onSuccess: invalidateHoppingConfigs }
})

export const useDeletePortHoppingConfig = createMutationHook({
    endpoint: '/api/user-routes/port-hopping-configs/:uuid',
    requestMethod: 'delete',
    routeParamsSchema: uuidRouteSchema,
    rMutationParams: { onSuccess: invalidateHoppingConfigs }
})

export const useCreateUserRoute = createMutationHook({
    endpoint: '/api/user-routes/',
    requestMethod: 'post',
    bodySchema: createRouteBodySchema,
    responseSchema: routeResponseSchema,
    rMutationParams: {
        onSuccess: (data, variables, context, queryClient) => {
            invalidateRoutes(data, variables, context, queryClient)
            notifications.show({
                color: 'teal',
                title: t('speed-limits.api.runtime-confirmed'),
                message: t('speed-limits.api.route-created')
            })
        }
    }
})

export const useUpdateUserRoute = createMutationHook({
    endpoint: '/api/user-routes/',
    requestMethod: 'patch',
    bodySchema: updateRouteBodySchema,
    responseSchema: routeResponseSchema,
    rMutationParams: { onSuccess: invalidateRoutes }
})

export const useDeleteUserRoute = createMutationHook({
    endpoint: '/api/user-routes/:uuid',
    requestMethod: 'delete',
    routeParamsSchema: uuidRouteSchema,
    rMutationParams: { onSuccess: invalidateRoutes }
})

export const useReallocateUserRoutePort = createMutationHook({
    endpoint: '/api/user-routes/:uuid/reallocate-port',
    requestMethod: 'post',
    routeParamsSchema: uuidRouteSchema,
    responseSchema: routeResponseSchema,
    rMutationParams: {
        onSuccess: (data, variables, context, queryClient) => {
            invalidateRoutes(data, variables, context, queryClient)
            notifications.show({
                color: 'teal',
                title: t('speed-limits.api.port-reallocated'),
                message: t('speed-limits.api.port-reallocated-message', {
                    port: data.externalPort
                })
            })
        }
    }
})
