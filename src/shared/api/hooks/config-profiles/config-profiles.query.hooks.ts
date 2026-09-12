import { createQueryKeys } from '@lukemorales/query-key-factory'
import {
    GetComputedConfigProfileByUuidCommand,
    GetConfigProfileByUuidCommand,
    GetConfigProfilesCommand,
    GetConfigProfilesTagsCommand,
    GetInboundsByProfileUuidCommand,
    ConfigProfileSchema
} from '@remnawave/backend-contract'
import { z } from 'zod'

import { sToMs } from '@shared/utils/time-utils'

import { createGetQueryHook, errorHandler } from '../../tsq-helpers'

// Compatibility bridge for the locally extended backend contract. The
// published package still strips coreType from otherwise valid responses.
const concurrentConfigProfileSchema = ConfigProfileSchema.extend({
    coreType: z.enum(['xray', 'singbox'])
})
const concurrentConfigProfilesResponseSchema = z.object({
    response: z.object({ configProfiles: z.array(concurrentConfigProfileSchema) })
})
const concurrentConfigProfileResponseSchema = z.object({
    response: concurrentConfigProfileSchema
})

export const configProfilesQueryKeys = createQueryKeys('configProfiles', {
    getConfigProfilesTags: {
        queryKey: null
    },
    getConfigProfiles: {
        queryKey: null
    },
    getConfigProfile: (route: GetConfigProfileByUuidCommand.RequestParam) => ({
        queryKey: [route]
    }),
    getComputedConfigProfile: (route: GetComputedConfigProfileByUuidCommand.RequestParam) => ({
        queryKey: [route]
    }),
    getConfigProfileInbounds: (route: GetConfigProfileByUuidCommand.RequestParam) => ({
        queryKey: [route]
    })
})

export const useGetConfigProfiles = createGetQueryHook({
    endpoint: GetConfigProfilesCommand.TSQ_url,
    responseSchema: concurrentConfigProfilesResponseSchema,
    getQueryKey: () => configProfilesQueryKeys.getConfigProfiles.queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(5)
    },
    errorHandler: (error) => errorHandler(error, 'Get All Config Profiles')
})

export const useGetConfigProfile = createGetQueryHook({
    endpoint: GetConfigProfileByUuidCommand.TSQ_url,
    responseSchema: concurrentConfigProfileResponseSchema,
    routeParamsSchema: GetConfigProfileByUuidCommand.RequestParamSchema,
    getQueryKey: ({ route }) => configProfilesQueryKeys.getConfigProfile(route!).queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get Config Profile')
})

export const useGetConfigProfileInbounds = createGetQueryHook({
    endpoint: GetInboundsByProfileUuidCommand.TSQ_url,
    responseSchema: GetInboundsByProfileUuidCommand.ResponseSchema,
    routeParamsSchema: GetInboundsByProfileUuidCommand.RequestParamSchema,
    getQueryKey: ({ route }) => configProfilesQueryKeys.getConfigProfileInbounds(route!).queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get Config Profile Inbounds')
})

export const useGetComputedConfigProfile = createGetQueryHook({
    endpoint: GetComputedConfigProfileByUuidCommand.TSQ_url,
    responseSchema: GetComputedConfigProfileByUuidCommand.ResponseSchema,
    routeParamsSchema: GetComputedConfigProfileByUuidCommand.RequestParamSchema,
    getQueryKey: ({ route }) => configProfilesQueryKeys.getComputedConfigProfile(route!).queryKey,
    rQueryParams: {
        enabled: false
    },
    errorHandler: (error) => errorHandler(error, 'Get Computed Config Profile')
})

export const useGetConfigProfilesTags = createGetQueryHook({
    endpoint: GetConfigProfilesTagsCommand.TSQ_url,
    responseSchema: GetConfigProfilesTagsCommand.ResponseSchema,
    getQueryKey: () => configProfilesQueryKeys.getConfigProfilesTags.queryKey,
    rQueryParams: {
        refetchOnMount: true,
        staleTime: sToMs(30)
    },
    errorHandler: (error) => errorHandler(error, 'Get ConfigProfiles Tags')
})
