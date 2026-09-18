import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    DEFAULT_REALITY_TARGET_DOMAIN,
    DEFAULT_REALITY_TARGET_PORT,
    getRealityClientCompatibility,
    getRealityMinClientVersion,
    REALITY_CLIENT_COMPATIBILITY,
    REALITY_MIN_CLIENT_VERSION_COMPAT
} from '@features/dashboard/config-profiles/protocol-presets'
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Divider,
    Group,
    Modal,
    Progress,
    Select,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    ThemeIcon
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle, TbArrowLeft, TbArrowRight, TbRocket } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import {
    QueryKeys,
    configProfilesQueryKeys,
    useGetConfigProfiles,
    useGetHosts,
    useGetNodes
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import { quickDeployApi } from './api/quick-deploy-api.ts'
import {
    getCoreCapabilities,
    getQuickDeployCapability,
    getRecommendedQuickDeployProtocolIds,
    type ProxyCoreType,
    type QuickDeployProtocolId
} from './model/core-capabilities.ts'
import {
    AUTO_PROFILE_UUID,
    createVirtualQuickDeployProfile,
    createQuickDeploymentPlan,
    executeQuickDeployment,
    type DeploymentItemStatus,
    type DeploymentResult,
    type QuickDeploymentPlan,
    type QuickDeployHost,
    type QuickDeployNode,
    type QuickDeployParameters,
    type QuickDeployProfile
} from './model/quick-deploy.ts'

const DEFAULT_PARAMETERS: QuickDeployParameters = {
    coreType: 'xray',
    nodeUuid: '',
    profileUuid: '',
    presetIds: getRecommendedQuickDeployProtocolIds('xray'),
    hostAddress: '',
    reality: {
        minClientVer: REALITY_MIN_CLIENT_VERSION_COMPAT,
        serverName: DEFAULT_REALITY_TARGET_DOMAIN,
        targetDomain: DEFAULT_REALITY_TARGET_DOMAIN,
        targetPort: DEFAULT_REALITY_TARGET_PORT
    },
    tls: {
        domain: '',
        certificateFile: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem',
        keyFile: '/var/lib/remnawave/configs/xray/ssl/privkey.key'
    },
    serverDescription: ''
}

const statusColor: Record<DeploymentItemStatus, string> = {
    success: 'teal',
    failed: 'red',
    skipped: 'gray',
    pending: 'blue',
    unconfirmed: 'yellow'
}

const StatusBadge = ({ status }: { status: DeploymentItemStatus }) => {
    const { t } = useTranslation()
    return <Badge color={statusColor[status]}>{t(`quick-deploy.status.${status}`)}</Badge>
}

const ResultRow = ({
    label,
    result
}: {
    label: string
    result: { message?: string; status: DeploymentItemStatus }
}) => (
    <Card padding="sm" radius="md" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack gap={2}>
                <Text fw={600} size="sm">
                    {label}
                </Text>
                {result.message && (
                    <Text c="dimmed" size="xs">
                        {result.message}
                    </Text>
                )}
            </Stack>
            <StatusBadge status={result.status} />
        </Group>
    </Card>
)

export const QuickDeployNodeModal = NiceModal.create(() => {
    const { t } = useTranslation()
    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        onClose: () => {
            queryClient.invalidateQueries({ queryKey: QueryKeys.nodes.getAllNodes.queryKey })
            queryClient.invalidateQueries({ queryKey: QueryKeys.hosts.getAllHosts.queryKey })
            queryClient.invalidateQueries({
                queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
            })
        }
    })

    const { data: nodes, isLoading: nodesLoading } = useGetNodes()
    const { data: profilesResponse, isLoading: profilesLoading } = useGetConfigProfiles()
    const { data: hosts, isLoading: hostsLoading } = useGetHosts()

    const [activeStep, setActiveStep] = useState(0)
    const [parameters, setParameters] = useState<QuickDeployParameters>(DEFAULT_PARAMETERS)
    const [plan, setPlan] = useState<QuickDeploymentPlan>()
    const [result, setResult] = useState<DeploymentResult>()
    const [isDeploying, setIsDeploying] = useState(false)

    const profiles = profilesResponse?.configProfiles
    const selectedNode = nodes?.find((node) => node.uuid === parameters.nodeUuid)
    const availableProfiles = profiles?.filter(
        (profile) => profile.coreType === parameters.coreType
    )
    const selectedProfile = availableProfiles?.find(
        (profile) => profile.uuid === parameters.profileUuid
    )
    const effectiveSelectedProfile =
        selectedProfile ??
        (parameters.profileUuid === AUTO_PROFILE_UUID && selectedNode
            ? createVirtualQuickDeployProfile(parameters.coreType, selectedNode)
            : undefined)
    const currentProfileUuid = selectedNode
        ? parameters.coreType === 'xray'
            ? selectedNode.configProfile.activeConfigProfileUuid
            : selectedNode.configProfile.activeSingBoxConfigProfileUuid
        : null
    const currentProfile = profiles?.find((profile) => profile.uuid === currentProfileUuid)
    const capabilities = useMemo(
        () => getCoreCapabilities(parameters.coreType),
        [parameters.coreType]
    )
    const selectedPresets = useMemo(
        () => capabilities.filter((preset) => parameters.presetIds.includes(preset.id)),
        [capabilities, parameters.presetIds]
    )
    const needsTls = selectedPresets.some((preset) => preset.needsCertificate)
    const needsReality = selectedPresets.some((preset) => preset.security === 'Reality')
    const existingRealityInbounds = selectedProfile?.inbounds.filter((inbound) => {
        if (!inbound.rawInbound || typeof inbound.rawInbound !== 'object') return false
        const rawInbound = inbound.rawInbound as Record<string, unknown>
        const streamSettings = rawInbound.streamSettings
        return (
            !!streamSettings &&
            typeof streamSettings === 'object' &&
            !Array.isArray(streamSettings) &&
            (streamSettings as Record<string, unknown>).security === 'reality'
        )
    })
    const selectedExistingReality = existingRealityInbounds?.filter((inbound) =>
        parameters.presetIds.some((presetId) => inbound.tag.startsWith(`${presetId}-`))
    )
    const selectedExistingRealityWithoutVersion = selectedExistingReality?.filter((inbound) => {
        const rawInbound = inbound.rawInbound as Record<string, unknown>
        const streamSettings = rawInbound.streamSettings as Record<string, unknown>
        return !getRealityMinClientVersion(streamSettings)
    })
    const realityCompatibility = getRealityClientCompatibility(parameters.reality.minClientVer)

    const setParameter = <Key extends keyof QuickDeployParameters>(
        key: Key,
        value: QuickDeployParameters[Key]
    ) => setParameters((current) => ({ ...current, [key]: value }))

    const setRealityTargetDomain = (targetDomain: string) =>
        setParameters((current) => ({
            ...current,
            reality: {
                ...current.reality,
                targetDomain,
                ...(current.reality.serverName === current.reality.targetDomain
                    ? { serverName: targetDomain }
                    : {})
            }
        }))

    const selectNode = (nodeUuid: null | string) => {
        if (!nodeUuid || !nodes) return
        const node = nodes.find((item) => item.uuid === nodeUuid)
        if (!node) return

        const activeProfileUuid =
            parameters.coreType === 'xray'
                ? node.configProfile.activeConfigProfileUuid
                : node.configProfile.activeSingBoxConfigProfileUuid
        const nextProfileUuid =
            activeProfileUuid ??
            profiles?.find((profile) => profile.coreType === parameters.coreType)?.uuid ??
            AUTO_PROFILE_UUID
        setParameters((current) => ({
            ...current,
            nodeUuid,
            profileUuid: nextProfileUuid,
            hostAddress: node.address
        }))
        setPlan(undefined)
        setResult(undefined)
    }

    const selectCore = (coreType: ProxyCoreType) => {
        const node = nodes?.find((item) => item.uuid === parameters.nodeUuid)
        const activeProfileUuid = node
            ? coreType === 'xray'
                ? node.configProfile.activeConfigProfileUuid
                : node.configProfile.activeSingBoxConfigProfileUuid
            : null
        const nextProfileUuid =
            activeProfileUuid ??
            profiles?.find((profile) => profile.coreType === coreType)?.uuid ??
            AUTO_PROFILE_UUID
        setParameters((current) => ({
            ...current,
            coreType,
            profileUuid: nextProfileUuid,
            presetIds: getRecommendedQuickDeployProtocolIds(coreType)
        }))
        setPlan(undefined)
        setResult(undefined)
    }

    const togglePreset = (id: QuickDeployProtocolId, checked: boolean) => {
        const preset = getQuickDeployCapability(id)
        if (preset.availability !== 'enabled') return

        setParameters((current) => ({
            ...current,
            presetIds: checked
                ? Array.from(new Set([...current.presetIds, id]))
                : current.presetIds.filter((item) => item !== id)
        }))
        setPlan(undefined)
    }

    const createPreview = () => {
        if (!selectedNode || !effectiveSelectedProfile || !profiles || !hosts) return

        try {
            const nextPlan = createQuickDeploymentPlan({
                node: selectedNode as QuickDeployNode,
                profile: effectiveSelectedProfile as QuickDeployProfile,
                allProfiles: profiles as QuickDeployProfile[],
                hosts: hosts as QuickDeployHost[],
                parameters
            })
            setPlan(nextPlan)
            setActiveStep(3)
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('quick-deploy.generation-failed'),
                message: error instanceof Error ? error.message : String(error)
            })
        }
    }

    const deploy = async () => {
        if (!plan) return
        setIsDeploying(true)

        try {
            const deploymentResult = await executeQuickDeployment(plan, quickDeployApi)
            if (deploymentResult.outcome === 'review-required' && deploymentResult.refreshedPlan) {
                setPlan(deploymentResult.refreshedPlan)
                notifications.show({
                    color: 'yellow',
                    title: t('quick-deploy.profile-changed'),
                    message: t('quick-deploy.review-refreshed-preview')
                })
                return
            }

            setResult(deploymentResult)
            setActiveStep(4)
            await Promise.all([
                queryClient.refetchQueries({ queryKey: QueryKeys.nodes.getAllNodes.queryKey }),
                queryClient.refetchQueries({ queryKey: QueryKeys.hosts.getAllHosts.queryKey }),
                queryClient.refetchQueries({
                    queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
                })
            ])
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('quick-deploy.deployment-failed'),
                message: error instanceof Error ? error.message : String(error)
            })
        } finally {
            setIsDeploying(false)
        }
    }

    const goNext = () => {
        if (activeStep === 0 && (!parameters.nodeUuid || !parameters.profileUuid)) return
        if (activeStep === 1 && parameters.presetIds.length === 0) return
        if (activeStep === 2) {
            createPreview()
            return
        }
        setActiveStep((current) => Math.min(current + 1, 3))
    }

    const isLoading = nodesLoading || profilesLoading || hostsLoading

    return (
        <Modal
            {...modalProps}
            closeOnClickOutside={!isDeploying}
            closeOnEscape={!isDeploying}
            size="xl"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbRocket}
                    iconVariant="soft"
                    title={t('quick-deploy.title')}
                />
            }
        >
            {isLoading || !nodes || !profiles || !hosts ? (
                <LoadingScreen />
            ) : (
                <Stack gap="lg">
                    <Group gap="xs" grow>
                        {[0, 1, 2, 3].map((step) => (
                            <Progress
                                color="teal"
                                key={step}
                                radius="sm"
                                size="sm"
                                value={activeStep >= step ? 100 : 0}
                            />
                        ))}
                    </Group>

                    {activeStep === 0 && (
                        <Stack>
                            <Text fw={600}>{t('quick-deploy.steps.node')}</Text>
                            <Select
                                data={nodes.map((node) => ({
                                    value: node.uuid,
                                    label: `${node.name} · ${node.address} · ${
                                        node.isConnected
                                            ? t('quick-deploy.online')
                                            : t('quick-deploy.offline')
                                    }`
                                }))}
                                label={t('quick-deploy.node')}
                                onChange={selectNode}
                                placeholder={t('quick-deploy.select-node')}
                                searchable
                                value={parameters.nodeUuid}
                            />

                            {selectedNode && (
                                <Card padding="sm" withBorder>
                                    <Group justify="space-between">
                                        <Stack gap={2}>
                                            <Text fw={600} size="sm">
                                                {selectedNode.name}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {selectedNode.address}
                                            </Text>
                                        </Stack>
                                        <Badge color={selectedNode.isConnected ? 'teal' : 'gray'}>
                                            {selectedNode.isConnected
                                                ? t('quick-deploy.online')
                                                : t('quick-deploy.offline')}
                                        </Badge>
                                    </Group>
                                    <Divider my="sm" />
                                    <Text size="sm">
                                        {t('quick-deploy.current-profile')}:{' '}
                                        {currentProfile?.name ?? t('quick-deploy.no-profile')}
                                    </Text>
                                </Card>
                            )}

                            <SegmentedControl
                                data={[
                                    { value: 'xray', label: 'Xray' },
                                    { value: 'singbox', label: 'sing-box' }
                                ]}
                                fullWidth
                                onChange={(value) => selectCore(value as ProxyCoreType)}
                                value={parameters.coreType}
                            />

                            <Select
                                data={[
                                    ...(availableProfiles ?? []).map((profile) => ({
                                        value: profile.uuid,
                                        label: profile.name
                                    })),
                                    {
                                        value: AUTO_PROFILE_UUID,
                                        label: `Auto-create ${parameters.coreType === 'xray' ? 'Xray' : 'sing-box'} Profile`
                                    }
                                ]}
                                disabled={!selectedNode}
                                label={t('quick-deploy.config-profile')}
                                onChange={(value) => value && setParameter('profileUuid', value)}
                                placeholder={t('quick-deploy.select-profile')}
                                searchable
                                value={parameters.profileUuid}
                            />

                            {selectedNode && !currentProfileUuid && (
                                <Alert color="yellow" icon={<TbAlertTriangle />}>
                                    {t('quick-deploy.node-has-no-profile')}
                                </Alert>
                            )}
                            {selectedNode &&
                                currentProfileUuid &&
                                parameters.profileUuid !== currentProfileUuid && (
                                    <Alert color="yellow" icon={<TbAlertTriangle />}>
                                        {t('quick-deploy.profile-switch-warning')}
                                    </Alert>
                                )}
                        </Stack>
                    )}

                    {activeStep === 1 && (
                        <Stack>
                            <Group justify="space-between">
                                <Text fw={600}>{t('quick-deploy.steps.protocols')}</Text>
                                <Button
                                    onClick={() =>
                                        setParameter(
                                            'presetIds',
                                            getRecommendedQuickDeployProtocolIds(
                                                parameters.coreType
                                            )
                                        )
                                    }
                                    size="xs"
                                    variant="light"
                                >
                                    {t('quick-deploy.select-all-recommended')}
                                </Button>
                            </Group>
                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                {capabilities.map((preset) => (
                                    <Card key={preset.id} padding="md" withBorder>
                                        <Group
                                            align="flex-start"
                                            justify="space-between"
                                            wrap="nowrap"
                                        >
                                            <Checkbox
                                                checked={parameters.presetIds.includes(preset.id)}
                                                disabled={preset.availability !== 'enabled'}
                                                label={preset.title}
                                                onChange={(event) =>
                                                    togglePreset(
                                                        preset.id,
                                                        event.currentTarget.checked
                                                    )
                                                }
                                            />
                                            <Badge
                                                color={
                                                    preset.status === 'supported'
                                                        ? 'teal'
                                                        : preset.status === 'experimental'
                                                          ? 'yellow'
                                                          : 'gray'
                                                }
                                            >
                                                {preset.availability === 'enabled'
                                                    ? t('quick-deploy.available')
                                                    : preset.status.toUpperCase()}
                                            </Badge>
                                        </Group>
                                        <Text c="dimmed" mt="xs" size="xs">
                                            {preset.transport} · {preset.security}
                                        </Text>
                                        {preset.udpStatus && (
                                            <Group gap="xs" mt="xs">
                                                <Badge
                                                    color={
                                                        preset.status === 'supported'
                                                            ? 'teal'
                                                            : 'yellow'
                                                    }
                                                    size="xs"
                                                    variant="light"
                                                >
                                                    TCP: {preset.status.toUpperCase()}
                                                </Badge>
                                                <Badge
                                                    color={
                                                        preset.udpStatus === 'supported'
                                                            ? 'teal'
                                                            : 'yellow'
                                                    }
                                                    size="xs"
                                                    variant="light"
                                                >
                                                    UDP: {preset.udpStatus.toUpperCase()}
                                                </Badge>
                                            </Group>
                                        )}
                                    </Card>
                                ))}
                            </SimpleGrid>
                            <Alert color="yellow" icon={<TbAlertTriangle />}>
                                {t('quick-deploy.vmess-disabled')}
                            </Alert>
                        </Stack>
                    )}

                    {activeStep === 2 && (
                        <Stack>
                            <Text fw={600}>{t('quick-deploy.steps.parameters')}</Text>
                            <TextInput
                                label={t('quick-deploy.host-address')}
                                onChange={(event) =>
                                    setParameter('hostAddress', event.currentTarget.value)
                                }
                                required
                                value={parameters.hostAddress}
                            />
                            <TextInput
                                label={t('quick-deploy.server-description')}
                                maxLength={30}
                                onChange={(event) =>
                                    setParameter('serverDescription', event.currentTarget.value)
                                }
                                value={parameters.serverDescription}
                            />

                            {needsReality && (
                                <Card padding="md" withBorder>
                                    <Stack>
                                        <Text fw={600} size="sm">
                                            {t('quick-deploy.reality-settings')}
                                        </Text>
                                        <TextInput
                                            label={t('quick-deploy.reality-target-domain')}
                                            onChange={(event) =>
                                                setRealityTargetDomain(event.currentTarget.value)
                                            }
                                            required
                                            value={parameters.reality.targetDomain}
                                        />
                                        <TextInput
                                            inputMode="numeric"
                                            label={t('quick-deploy.reality-target-port')}
                                            onChange={(event) =>
                                                setParameter('reality', {
                                                    ...parameters.reality,
                                                    targetPort: event.currentTarget.value
                                                })
                                            }
                                            required
                                            value={parameters.reality.targetPort}
                                        />
                                        <TextInput
                                            label={t('quick-deploy.server-name')}
                                            onChange={(event) =>
                                                setParameter('reality', {
                                                    ...parameters.reality,
                                                    serverName: event.currentTarget.value
                                                })
                                            }
                                            required
                                            value={parameters.reality.serverName}
                                        />
                                        <Select
                                            data={[
                                                {
                                                    label: `${t('quick-deploy.compatibility-compatible')} (${REALITY_CLIENT_COMPATIBILITY.compatible})`,
                                                    value: REALITY_CLIENT_COMPATIBILITY.compatible
                                                },
                                                {
                                                    label: `${t('quick-deploy.compatibility-mihomo')} (${REALITY_CLIENT_COMPATIBILITY.mihomo})`,
                                                    value: REALITY_CLIENT_COMPATIBILITY.mihomo
                                                },
                                                {
                                                    label: `${t('quick-deploy.compatibility-xray')} (${REALITY_CLIENT_COMPATIBILITY.xray})`,
                                                    value: REALITY_CLIENT_COMPATIBILITY.xray
                                                },
                                                {
                                                    label: `${t('quick-deploy.compatibility-unrestricted')} (${REALITY_CLIENT_COMPATIBILITY.unrestricted})`,
                                                    value: REALITY_CLIENT_COMPATIBILITY.unrestricted
                                                }
                                            ]}
                                            description={t(
                                                'quick-deploy.reality-compatibility-help'
                                            )}
                                            label={t('quick-deploy.reality-min-client-version')}
                                            onChange={(value) =>
                                                value &&
                                                setParameter('reality', {
                                                    ...parameters.reality,
                                                    minClientVer: value
                                                })
                                            }
                                            value={parameters.reality.minClientVer}
                                        />
                                        {parameters.reality.minClientVer ===
                                            REALITY_CLIENT_COMPATIBILITY.mihomo && (
                                            <Alert color="yellow" icon={<TbAlertTriangle />}>
                                                {t('quick-deploy.reality-warning-mihomo')}
                                            </Alert>
                                        )}
                                        {parameters.reality.minClientVer ===
                                            REALITY_CLIENT_COMPATIBILITY.xray && (
                                            <Alert color="red" icon={<TbAlertTriangle />}>
                                                {t('quick-deploy.reality-warning-xray')}
                                            </Alert>
                                        )}
                                        {parameters.reality.minClientVer ===
                                            REALITY_CLIENT_COMPATIBILITY.unrestricted && (
                                            <Alert color="orange" icon={<TbAlertTriangle />}>
                                                {t('quick-deploy.reality-warning-unrestricted')}
                                            </Alert>
                                        )}
                                        {selectedExistingRealityWithoutVersion?.length ? (
                                            <Checkbox
                                                checked={Boolean(
                                                    parameters.updateExistingRealityCompatibility
                                                )}
                                                label={t(
                                                    'quick-deploy.apply-existing-reality-compatibility'
                                                )}
                                                onChange={(event) =>
                                                    setParameter(
                                                        'updateExistingRealityCompatibility',
                                                        event.currentTarget.checked
                                                    )
                                                }
                                            />
                                        ) : null}
                                        {selectedExistingRealityWithoutVersion?.length ? (
                                            <Alert color="orange" icon={<TbAlertTriangle />}>
                                                {t(
                                                    'quick-deploy.existing-reality-missing-version',
                                                    {
                                                        tags: selectedExistingRealityWithoutVersion
                                                            .map((inbound) => inbound.tag)
                                                            .join(', ')
                                                    }
                                                )}
                                            </Alert>
                                        ) : null}
                                        <Text c="dimmed" size="xs">
                                            {t('quick-deploy.current-reality-compatibility', {
                                                mihomo: realityCompatibility.mihomo
                                                    ? t('quick-deploy.compatible')
                                                    : t('quick-deploy.may-not-connect'),
                                                singbox: realityCompatibility.singbox
                                                    ? t('quick-deploy.compatible')
                                                    : t('quick-deploy.may-not-connect')
                                            })}
                                        </Text>
                                    </Stack>
                                </Card>
                            )}

                            {needsTls && (
                                <Card padding="md" withBorder>
                                    <Stack>
                                        <Text fw={600} size="sm">
                                            {t('quick-deploy.tls-settings')}
                                        </Text>
                                        <TextInput
                                            label={t('quick-deploy.domain')}
                                            onChange={(event) =>
                                                setParameter('tls', {
                                                    ...parameters.tls,
                                                    domain: event.currentTarget.value
                                                })
                                            }
                                            required
                                            value={parameters.tls.domain}
                                        />
                                        <TextInput
                                            label={t('quick-deploy.certificate-file')}
                                            onChange={(event) =>
                                                setParameter('tls', {
                                                    ...parameters.tls,
                                                    certificateFile: event.currentTarget.value
                                                })
                                            }
                                            required
                                            value={parameters.tls.certificateFile}
                                        />
                                        <TextInput
                                            label={t('quick-deploy.key-file')}
                                            onChange={(event) =>
                                                setParameter('tls', {
                                                    ...parameters.tls,
                                                    keyFile: event.currentTarget.value
                                                })
                                            }
                                            required
                                            value={parameters.tls.keyFile}
                                        />
                                    </Stack>
                                </Card>
                            )}
                        </Stack>
                    )}

                    {activeStep === 3 && plan && (
                        <Stack>
                            <Text fw={600}>{t('quick-deploy.steps.preview')}</Text>
                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                <Card padding="sm" withBorder>
                                    <Text c="dimmed" size="xs">
                                        {t('quick-deploy.node')}
                                    </Text>
                                    <Text fw={600}>{plan.node.name}</Text>
                                </Card>
                                <Card padding="sm" withBorder>
                                    <Text c="dimmed" size="xs">
                                        {t('quick-deploy.config-profile')}
                                    </Text>
                                    <Text fw={600}>{plan.profile.name}</Text>
                                </Card>
                            </SimpleGrid>
                            {plan.nodeWillSwitchProfile && (
                                <Alert color="yellow" icon={<TbAlertTriangle />}>
                                    {t('quick-deploy.profile-switch-preview')}
                                </Alert>
                            )}
                            {plan.hosts.some((item) => item.security === 'reality') && (
                                <Alert color="blue" icon={<TbAlertTriangle />}>
                                    {t('quick-deploy.preview-reality-compatibility', {
                                        version: plan.parameters.reality.minClientVer
                                    })}
                                </Alert>
                            )}
                            <Text size="sm">
                                {t('quick-deploy.preview-summary', {
                                    inbounds: plan.inbounds.filter((item) => item.willCreateInbound)
                                        .length,
                                    hosts: plan.hosts.filter((item) => item.willCreateHost).length
                                })}
                            </Text>
                            <Table.ScrollContainer minWidth={760}>
                                <Table striped withTableBorder>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>{t('quick-deploy.protocol')}</Table.Th>
                                            <Table.Th>Tag</Table.Th>
                                            <Table.Th>{t('quick-deploy.port')}</Table.Th>
                                            <Table.Th>{t('quick-deploy.transport')}</Table.Th>
                                            <Table.Th>{t('quick-deploy.security')}</Table.Th>
                                            <Table.Th>
                                                {t('quick-deploy.reality-min-client-version')}
                                            </Table.Th>
                                            <Table.Th>{t('quick-deploy.domain-or-sni')}</Table.Th>
                                            <Table.Th>Host</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {plan.inbounds.map((item, index) => (
                                            <Table.Tr key={item.presetId}>
                                                <Table.Td>{item.preset.title}</Table.Td>
                                                <Table.Td>{item.inbound.tag}</Table.Td>
                                                <Table.Td>{plan.hosts[index].port}</Table.Td>
                                                <Table.Td>{plan.hosts[index].transport}</Table.Td>
                                                <Table.Td>{plan.hosts[index].security}</Table.Td>
                                                <Table.Td>
                                                    {plan.hosts[index].security === 'reality'
                                                        ? (((
                                                              item.inbound as {
                                                                  streamSettings?: {
                                                                      realitySettings?: {
                                                                          minClientVer?: string
                                                                      }
                                                                  }
                                                              }
                                                          ).streamSettings?.realitySettings
                                                              ?.minClientVer as
                                                              | string
                                                              | undefined) ?? '—')
                                                        : '—'}
                                                </Table.Td>
                                                <Table.Td>
                                                    {item.domainOrServerName || '—'}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={
                                                            plan.hosts[index].willCreateHost
                                                                ? 'teal'
                                                                : 'gray'
                                                        }
                                                    >
                                                        {plan.hosts[index].willCreateHost
                                                            ? t('quick-deploy.create')
                                                            : t('quick-deploy.skip-existing')}
                                                    </Badge>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                            <Alert color="blue">{t('quick-deploy.no-runtime-ack-warning')}</Alert>
                        </Stack>
                    )}

                    {activeStep === 4 && result && (
                        <Stack>
                            <Group>
                                <ThemeIcon
                                    color={result.outcome === 'success' ? 'teal' : 'yellow'}
                                    radius="xl"
                                    size="lg"
                                >
                                    <TbRocket />
                                </ThemeIcon>
                                <Stack gap={0}>
                                    <Text fw={700}>
                                        {t(`quick-deploy.outcome.${result.outcome}`)}
                                    </Text>
                                    <Text c="dimmed" size="sm">
                                        {t('quick-deploy.result-help')}
                                    </Text>
                                </Stack>
                            </Group>
                            <ResultRow
                                label={t('quick-deploy.result.profile')}
                                result={result.configProfile}
                            />
                            <ResultRow
                                label={t('quick-deploy.result.node-inbounds')}
                                result={result.nodeInbounds}
                            />
                            {result.hosts.map((hostResult) => (
                                <ResultRow
                                    key={hostResult.presetId}
                                    label={`${t('quick-deploy.result.host')}: ${
                                        getQuickDeployCapability(hostResult.presetId).title
                                    }`}
                                    result={hostResult}
                                />
                            ))}
                            <ResultRow
                                label={t('quick-deploy.result.node-apply')}
                                result={result.nodeApply}
                            />
                            <ResultRow
                                label={t('quick-deploy.result.rollback')}
                                result={result.rollback}
                            />
                            <Alert color="yellow" icon={<TbAlertTriangle />}>
                                {t('quick-deploy.squad-phase-warning')}
                            </Alert>
                        </Stack>
                    )}

                    <Group justify="space-between">
                        {activeStep > 0 && activeStep < 4 ? (
                            <Button
                                disabled={isDeploying}
                                leftSection={<TbArrowLeft />}
                                onClick={() => setActiveStep((current) => current - 1)}
                                variant="default"
                            >
                                {t('quick-deploy.back')}
                            </Button>
                        ) : (
                            <div />
                        )}

                        {activeStep < 3 && (
                            <Button
                                disabled={
                                    (activeStep === 0 &&
                                        (!parameters.nodeUuid || !parameters.profileUuid)) ||
                                    (activeStep === 1 && parameters.presetIds.length === 0)
                                }
                                onClick={goNext}
                                rightSection={<TbArrowRight />}
                            >
                                {activeStep === 2
                                    ? t('quick-deploy.generate-preview')
                                    : t('common.action.next')}
                            </Button>
                        )}
                        {activeStep === 3 && (
                            <Button loading={isDeploying} onClick={deploy}>
                                {t('quick-deploy.confirm-deploy')}
                            </Button>
                        )}
                        {activeStep === 4 && (
                            <Button onClick={hide}>{t('common.action.close')}</Button>
                        )}
                    </Group>
                </Stack>
            )}
        </Modal>
    )
})
