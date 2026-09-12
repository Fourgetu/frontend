import type {
    QuickDeployApi,
    QuickDeployInboundRecord,
    QuickDeployNode,
    QuickDeployProfile
} from '../../quick-deploy/model/quick-deploy.ts'

import {
    buildRelayOutbound,
    mergeRelayIntoConfig,
    parseRelayUri,
    redactRelayTarget,
    relayLogicalIdentity,
    relayOutboundTag,
    type RelayAction,
    type RelayOutbound,
    type RelayRoutingRule,
    type RelayTarget,
    type RelayTargetSummary
} from './relay.ts'

export interface RelayPreviewInput {
    entryInboundUuid: string
    node: QuickDeployNode
    profile: QuickDeployProfile
    target: RelayTarget
}

export interface RelayDeploymentPlan {
    config: Record<string, unknown>
    entryInbound: QuickDeployInboundRecord
    entryNode: QuickDeployNode
    logicalIdentity: string
    outbound: RelayOutbound
    outboundAction: RelayAction
    profile: QuickDeployProfile
    profileRevision: string
    routingAction: RelayAction
    routingRule: RelayRoutingRule
    target: RelayTarget
    targetSummary: RelayTargetSummary
}

export type RelayStepStatus =
    | 'created'
    | 'failed'
    | 'pending'
    | 'reused'
    | 'skipped'
    | 'unconfirmed'

export interface RelayStepResult {
    message?: string
    resourceUuid?: string
    status: RelayStepStatus
}

export interface RelayDeploymentResult {
    configProfile: RelayStepResult
    connectivity: RelayStepResult
    nodeReload: RelayStepResult
    nodeRuntime: RelayStepResult
    logicalIdentity: string
    outbound: RelayStepResult
    outcome: 'failed' | 'partial' | 'review-required' | 'success'
    refreshedPlan?: RelayDeploymentPlan
    routing: RelayStepResult
}

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} must be a JSON object.`)
    }
    return value as Record<string, unknown>
}

const revisionOf = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const findActiveInbound = (
    node: QuickDeployNode,
    entryInboundUuid: string
): QuickDeployInboundRecord => {
    const inbound = node.configProfile.activeInbounds.find((item) => item.uuid === entryInboundUuid)
    if (!inbound) throw new Error('The selected Inbound is no longer active on this Node.')
    return inbound
}

const ensureActiveProfile = (node: QuickDeployNode, profile: QuickDeployProfile): void => {
    if (!node.configProfile.activeConfigProfileUuid) {
        throw new Error('The selected Node has no active Config Profile.')
    }
    if (node.configProfile.activeConfigProfileUuid !== profile.uuid) {
        throw new Error('The selected Config Profile is not active on this Node.')
    }
}

export const createRelayPreview = (input: RelayPreviewInput): RelayDeploymentPlan => {
    ensureActiveProfile(input.node, input.profile)
    const entryInbound = findActiveInbound(input.node, input.entryInboundUuid)
    const config = asRecord(input.profile.config, 'Config Profile config')
    const tag = relayOutboundTag(entryInbound.tag, input.target)
    const outbound = buildRelayOutbound(input.target, tag)
    const routingRule: RelayRoutingRule = {
        inboundTag: [entryInbound.tag],
        outboundTag: outbound.tag,
        type: 'field'
    }
    const merged = mergeRelayIntoConfig({ config, outbound, rule: routingRule })

    return {
        config: merged.config,
        entryInbound,
        entryNode: input.node,
        logicalIdentity: relayLogicalIdentity({
            entryInboundUuid: entryInbound.uuid,
            entryNodeUuid: input.node.uuid,
            entryProfileUuid: input.profile.uuid,
            target: input.target
        }),
        outbound,
        outboundAction: merged.outbound,
        profile: input.profile,
        profileRevision: revisionOf(input.profile.updatedAt),
        routingAction: merged.routing,
        routingRule,
        target: input.target,
        targetSummary: redactRelayTarget(input.target)
    }
}

export const createRelayPreviewFromUri = (input: {
    entryInboundUuid: string
    node: QuickDeployNode
    profile: QuickDeployProfile
    uri: string
}): RelayDeploymentPlan =>
    createRelayPreview({
        entryInboundUuid: input.entryInboundUuid,
        node: input.node,
        profile: input.profile,
        target: parseRelayUri(input.uri)
    })

const pendingResult = (logicalIdentity: string): RelayDeploymentResult => ({
    configProfile: { status: 'pending' },
    connectivity: { status: 'pending' },
    logicalIdentity,
    nodeReload: { status: 'pending' },
    nodeRuntime: { status: 'pending' },
    outbound: { status: 'pending' },
    outcome: 'failed',
    routing: { status: 'pending' }
})

const failedStep = (error: unknown): RelayStepResult => ({
    message: error instanceof Error ? error.message : 'The relay operation failed.',
    status: 'failed'
})

const skippedStep = (message: string): RelayStepResult => ({ message, status: 'skipped' })

const sameRevision = (profile: QuickDeployProfile, plan: RelayDeploymentPlan): boolean =>
    revisionOf(profile.updatedAt) === plan.profileRevision

const unchangedPlan = (
    plan: RelayDeploymentPlan,
    latestNode: QuickDeployNode,
    latestProfile: QuickDeployProfile
) =>
    createRelayPreview({
        entryInboundUuid: plan.entryInbound.uuid,
        node: latestNode,
        profile: latestProfile,
        target: plan.target
    })

export const executeRelayDeployment = async (
    plan: RelayDeploymentPlan,
    api: Pick<QuickDeployApi, 'getNode' | 'getProfile' | 'updateProfile'>
): Promise<RelayDeploymentResult> => {
    const result = pendingResult(plan.logicalIdentity)
    let latestNode: QuickDeployNode
    let latestProfile: QuickDeployProfile

    try {
        ;[latestNode, latestProfile] = await Promise.all([
            api.getNode(plan.entryNode.uuid),
            api.getProfile(plan.profile.uuid)
        ])
    } catch (error) {
        result.configProfile = failedStep(error)
        result.outbound = skippedStep('The Config Profile was not changed.')
        result.routing = skippedStep('The Config Profile was not changed.')
        result.nodeReload = skippedStep('Node reload was not queued.')
        result.nodeRuntime = skippedStep('Runtime verification was not attempted.')
        result.connectivity = skippedStep('Connectivity was not tested.')
        return result
    }

    let freshPlan: RelayDeploymentPlan
    try {
        freshPlan = unchangedPlan(plan, latestNode, latestProfile)
    } catch (error) {
        result.configProfile = failedStep(error)
        result.outbound = skippedStep('The refreshed relay plan is invalid.')
        result.routing = skippedStep('The refreshed relay plan is invalid.')
        result.nodeReload = skippedStep('Node reload was not queued.')
        result.nodeRuntime = skippedStep('Runtime verification was not attempted.')
        result.connectivity = skippedStep('Connectivity was not tested.')
        return result
    }

    if (!sameRevision(latestProfile, plan)) {
        return {
            ...result,
            configProfile: skippedStep(
                'Config Profile changed after preview. Review the refreshed plan before writing.'
            ),
            connectivity: skippedStep('Connectivity was not tested.'),
            nodeReload: skippedStep('Node reload was not queued.'),
            nodeRuntime: skippedStep('Runtime verification was not attempted.'),
            outbound: skippedStep('Waiting for refreshed preview confirmation.'),
            outcome: 'review-required',
            refreshedPlan: freshPlan,
            routing: skippedStep('Waiting for refreshed preview confirmation.')
        }
    }

    result.outbound = {
        message:
            freshPlan.outboundAction === 'create'
                ? 'Relay outbound will be added to the Config Profile.'
                : 'Matching relay outbound already exists.',
        status: freshPlan.outboundAction === 'create' ? 'created' : 'reused'
    }
    result.routing = {
        message:
            freshPlan.routingAction === 'create'
                ? 'Relay routing rule will be inserted without removing existing rules.'
                : 'Matching relay routing rule already exists.',
        status: freshPlan.routingAction === 'create' ? 'created' : 'reused'
    }

    const hasConfigChange =
        freshPlan.outboundAction === 'create' || freshPlan.routingAction === 'create'
    if (!hasConfigChange) {
        result.configProfile = skippedStep('The same relay is already present in this Profile.')
        result.nodeReload = skippedStep('No reload was needed because nothing changed.')
    } else {
        try {
            const updated = await api.updateProfile({
                config: freshPlan.config,
                uuid: freshPlan.profile.uuid
            })
            result.configProfile = {
                message: 'Config Profile updated; the existing Node reload queue was used.',
                resourceUuid: updated.uuid,
                status: 'created'
            }
            result.nodeReload = {
                message: 'Node reload queued by Config Profile update.',
                status: 'created'
            }
        } catch (error) {
            result.configProfile = failedStep(error)
            result.nodeReload = skippedStep('Node reload was not queued.')
            result.outcome = 'failed'
            result.connectivity = skippedStep('Connectivity was not tested.')
            result.nodeRuntime = skippedStep('Runtime verification was not attempted.')
            return result
        }
    }

    result.connectivity = {
        message:
            'Entry Node → Exit probing is not exposed by the current Remnawave API. Only manual E2E verification can confirm the public exit IP.',
        status: 'skipped'
    }

    try {
        const verifiedNode = await api.getNode(latestNode.uuid)
        result.nodeRuntime = {
            message: verifiedNode.isConnected
                ? 'Config associations are visible and the Node is online; Xray runtime ACK is unavailable.'
                : 'Config associations are saved, but the Node is offline; Xray runtime ACK is unavailable.',
            status: 'unconfirmed',
            resourceUuid: verifiedNode.uuid
        }
    } catch (error) {
        result.nodeRuntime = {
            message: `Node status could not be refreshed: ${failedStep(error).message}`,
            status: 'unconfirmed'
        }
    }

    result.outcome = 'partial'
    return result
}
