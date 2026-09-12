import type { QuickDeployApi, QuickDeployProfile } from '../model/quick-deploy.ts'
import type { AxiosResponse } from 'axios'

import {
    CreateConfigProfileCommand,
    CreateHostCommand,
    GetConfigProfileByUuidCommand,
    GetConfigProfilesCommand,
    GetHostsCommand,
    GetNodeCommand,
    UpdateConfigProfileCommand,
    UpdateNodeCommand
} from '@remnawave/backend-contract'
import { z } from 'zod'

import { instance } from '@shared/api'
import { createUrl, handleRequestError } from '@shared/api/helpers'

const parseResponse = async <Schema extends z.ZodType<{ response: unknown }>>(
    request: Promise<AxiosResponse<unknown>>,
    schema: Schema
): Promise<z.infer<Schema>['response']> => {
    try {
        const response = await request
        const parsed = await schema.safeParseAsync(response.data)
        if (!parsed.success) throw parsed.error
        return parsed.data.response
    } catch (error) {
        return handleRequestError(error)
    }
}

// The released frontend dependency predates concurrent-core fields. Keep this
// narrow local response schema until the next backend-contract package is
// published; using the old schema would silently strip coreType and sing-box.
const inboundSchema = z.looseObject({
    uuid: z.string(),
    profileUuid: z.string(),
    tag: z.string(),
    type: z.string(),
    network: z.string().nullable(),
    security: z.string().nullable(),
    port: z.number().nullable(),
    rawInbound: z.unknown()
})

const profileSchema = z.looseObject({
    uuid: z.string(),
    name: z.string(),
    coreType: z.enum(['xray', 'singbox']),
    config: z.unknown(),
    inbounds: z.array(inboundSchema),
    updatedAt: z.union([z.date(), z.iso.datetime().transform((value) => new Date(value))])
})

const nodeSchema = z.looseObject({
    uuid: z.string(),
    name: z.string(),
    address: z.string(),
    isConnected: z.boolean(),
    isDisabled: z.boolean(),
    updatedAt: z.union([z.date(), z.iso.datetime().transform((value) => new Date(value))]),
    configProfile: z.looseObject({
        activeConfigProfileUuid: z.string().nullable(),
        activeSingBoxConfigProfileUuid: z.string().nullable(),
        activeInbounds: z.array(inboundSchema)
    })
})

const profileResponseSchema = z.object({ response: profileSchema })
const profilesResponseSchema = z.object({
    response: z.object({ configProfiles: z.array(profileSchema) })
})
const nodeResponseSchema = z.object({ response: nodeSchema })

export const quickDeployApi: QuickDeployApi = {
    createProfile: (body) =>
        parseResponse(
            instance.request({
                method: CreateConfigProfileCommand.endpointDetails.REQUEST_METHOD,
                url: CreateConfigProfileCommand.TSQ_url,
                data: body
            }),
            profileResponseSchema
        ),

    getNode: (uuid) =>
        parseResponse(
            instance.get(createUrl(GetNodeCommand.TSQ_url, undefined, { uuid })),
            nodeResponseSchema
        ),

    getProfile: (uuid) =>
        parseResponse(
            instance.get(createUrl(GetConfigProfileByUuidCommand.TSQ_url, undefined, { uuid })),
            profileResponseSchema
        ),

    getProfiles: async () => {
        const response = await parseResponse(
            instance.get(GetConfigProfilesCommand.TSQ_url),
            profilesResponseSchema
        )
        return response.configProfiles as QuickDeployProfile[]
    },

    getHosts: () =>
        parseResponse(instance.get(GetHostsCommand.TSQ_url), GetHostsCommand.ResponseSchema),

    updateProfile: (body) =>
        parseResponse(
            instance.request({
                method: UpdateConfigProfileCommand.endpointDetails.REQUEST_METHOD,
                url: UpdateConfigProfileCommand.TSQ_url,
                data: UpdateConfigProfileCommand.RequestBodySchema.parse(body)
            }),
            profileResponseSchema
        ),

    updateNode: (body) =>
        parseResponse(
            instance.request({
                method: UpdateNodeCommand.endpointDetails.REQUEST_METHOD,
                url: UpdateNodeCommand.TSQ_url,
                data: body
            }),
            nodeResponseSchema
        ),

    createHost: (body) =>
        parseResponse(
            instance.request({
                method: CreateHostCommand.endpointDetails.REQUEST_METHOD,
                url: CreateHostCommand.TSQ_url,
                data: CreateHostCommand.RequestBodySchema.parse(body)
            }),
            CreateHostCommand.ResponseSchema
        )
}
