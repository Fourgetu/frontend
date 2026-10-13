import { CreateHostCommand } from '@remnawave/backend-contract'
import { z } from 'zod'

// Local backport of the new endpoint; keep the existing contract dependency until its own upgrade.
export const CloneHostCommand = {
    TSQ_url: `${CreateHostCommand.TSQ_url.replace(/\/$/, '')}/actions/clone`,
    RequestBodySchema: z.object({ cloneFromUuid: z.uuid() }),
    ResponseSchema: CreateHostCommand.ResponseSchema,
    endpointDetails: { REQUEST_METHOD: 'post' as const }
}
