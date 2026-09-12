import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Group,
    Modal,
    Progress,
    Select,
    SimpleGrid,
    Stack,
    Stepper,
    Text,
    Textarea,
    ThemeIcon
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle, TbArrowLeft, TbArrowRight, TbRoute } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { queryClient } from '@shared/api'
import {
    QueryKeys,
    configProfilesQueryKeys,
    useGetConfigProfiles,
    useGetNodes
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import { relayApi } from './api/relay-api.ts'
import {
    createRelayPreview,
    executeRelayDeployment,
    parseRelayUri,
    type RelayDeploymentPlan,
    type RelayDeploymentResult,
    type RelayStepResult,
    type RelayTarget
} from './model'

const statusColor: Record<RelayStepResult['status'], string> = {
    created: 'teal',
    failed: 'red',
    pending: 'blue',
    reused: 'gray',
    skipped: 'yellow',
    unconfirmed: 'orange'
}

const ResultRow = ({ label, result }: { label: string; result: RelayStepResult }) => {
    const { t } = useTranslation()
    return (
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
                <Badge color={statusColor[result.status]}>
                    {t(`relay.status.${result.status}`, { defaultValue: result.status })}
                </Badge>
            </Group>
        </Card>
    )
}

const ActionBadge = ({ action }: { action: 'create' | 'reuse' }) => {
    const { t } = useTranslation()
    return (
        <Badge color={action === 'create' ? 'teal' : 'gray'}>
            {t(`relay.action.${action}`, { defaultValue: action })}
        </Badge>
    )
}

export const RelayNodeModal = NiceModal.create(() => {
    const { t } = useTranslation()
    const modal = useModal()
    const { modalProps, hide } = useNiceMantineModal({
        modal,
        onClose: () => {
            queryClient.invalidateQueries({ queryKey: QueryKeys.nodes.getAllNodes.queryKey })
            queryClient.invalidateQueries({
                queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
            })
        }
    })

    const { data: nodes, isLoading: nodesLoading } = useGetNodes()
    const { data: profilesResponse, isLoading: profilesLoading } = useGetConfigProfiles()
    const profiles = profilesResponse?.configProfiles

    const [activeStep, setActiveStep] = useState(0)
    const [nodeUuid, setNodeUuid] = useState('')
    const [inboundUuid, setInboundUuid] = useState('')
    const [uri, setUri] = useState('')
    const [target, setTarget] = useState<RelayTarget>()
    const [parseError, setParseError] = useState('')
    const [plan, setPlan] = useState<RelayDeploymentPlan>()
    const [result, setResult] = useState<RelayDeploymentResult>()
    const [isDeploying, setIsDeploying] = useState(false)

    const selectedNode = nodes?.find((node) => node.uuid === nodeUuid)
    const selectedProfile = profiles?.find(
        (profile) => profile.uuid === selectedNode?.configProfile.activeConfigProfileUuid
    )
    const activeInbounds = selectedNode?.configProfile.activeInbounds ?? []
    const selectedInbound = activeInbounds.find((item) => item.uuid === inboundUuid)

    const resetPlan = () => {
        setPlan(undefined)
        setResult(undefined)
    }

    const selectNode = (value: string | null) => {
        setNodeUuid(value ?? '')
        setInboundUuid('')
        resetPlan()
    }

    const selectInbound = (value: string | null) => {
        setInboundUuid(value ?? '')
        resetPlan()
    }

    const handleUriChange = (value: string) => {
        setUri(value)
        setTarget(undefined)
        setParseError('')
        resetPlan()
        if (!value.trim()) return
        try {
            setTarget(parseRelayUri(value))
        } catch (error) {
            setParseError(error instanceof Error ? error.message : t('relay.parse-error'))
        }
    }

    const createPreview = () => {
        if (!selectedNode || !selectedProfile || !selectedInbound || !target) return
        try {
            setPlan(
                createRelayPreview({
                    entryInboundUuid: selectedInbound.uuid,
                    node: selectedNode,
                    profile: selectedProfile,
                    target
                })
            )
            setActiveStep(3)
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('relay.preview-failed'),
                message: error instanceof Error ? error.message : t('relay.preview-failed')
            })
        }
    }

    const deploy = async () => {
        if (!plan) return
        setIsDeploying(true)
        try {
            const deploymentResult = await executeRelayDeployment(plan, relayApi)
            if (deploymentResult.outcome === 'review-required' && deploymentResult.refreshedPlan) {
                setPlan(deploymentResult.refreshedPlan)
                notifications.show({
                    color: 'yellow',
                    title: t('relay.profile-changed'),
                    message: t('relay.review-refreshed-preview')
                })
                return
            }
            setResult(deploymentResult)
            setActiveStep(4)
            await Promise.all([
                queryClient.refetchQueries({ queryKey: QueryKeys.nodes.getAllNodes.queryKey }),
                queryClient.refetchQueries({
                    queryKey: configProfilesQueryKeys.getConfigProfiles.queryKey
                })
            ])
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('relay.deploy-failed'),
                message: error instanceof Error ? error.message : t('relay.deploy-failed')
            })
        } finally {
            setIsDeploying(false)
        }
    }

    const next = () => {
        if (activeStep === 0 && (!selectedNode || !selectedProfile)) return
        if (activeStep === 1 && !selectedInbound) return
        if (activeStep === 2) {
            createPreview()
            return
        }
        setActiveStep((step) => Math.min(step + 1, 3))
    }

    const isLoading = nodesLoading || profilesLoading
    const currentProfileName = selectedProfile?.name ?? t('relay.no-profile')
    const selectedTarget = useMemo(() => plan?.targetSummary, [plan])

    return (
        <Modal
            {...modalProps}
            closeOnClickOutside={!isDeploying}
            closeOnEscape={!isDeploying}
            size="xl"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbRoute}
                    iconVariant="soft"
                    title={t('relay.title')}
                />
            }
        >
            {isLoading || !nodes || !profiles ? (
                <LoadingScreen />
            ) : (
                <Stack gap="lg">
                    <Stepper active={Math.min(activeStep, 4)} onStepClick={setActiveStep}>
                        <Stepper.Step label={t('relay.steps.node')} />
                        <Stepper.Step label={t('relay.steps.inbound')} />
                        <Stepper.Step label={t('relay.steps.target')} />
                        <Stepper.Step label={t('relay.steps.preview')} />
                        <Stepper.Completed>{t('relay.steps.result')}</Stepper.Completed>
                    </Stepper>

                    {activeStep === 0 && (
                        <Stack>
                            <Text fw={600}>{t('relay.select-entry-node')}</Text>
                            <Select
                                data={nodes.map((node) => ({
                                    label: `${node.name} · ${node.address} · ${
                                        node.isConnected ? t('relay.online') : t('relay.offline')
                                    }`,
                                    value: node.uuid
                                }))}
                                label={t('relay.node')}
                                onChange={selectNode}
                                placeholder={t('relay.select-node')}
                                searchable
                                value={nodeUuid}
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
                                                ? t('relay.online')
                                                : t('relay.offline')}
                                        </Badge>
                                    </Group>
                                    <Divider my="sm" />
                                    <Text size="sm">
                                        {t('relay.config-profile')}: {currentProfileName}
                                    </Text>
                                </Card>
                            )}
                            {selectedNode && !selectedProfile && (
                                <Alert color="yellow" icon={<TbAlertTriangle />}>
                                    {t('relay.node-has-no-profile')}
                                </Alert>
                            )}
                        </Stack>
                    )}

                    {activeStep === 1 && (
                        <Stack>
                            <Text fw={600}>{t('relay.select-entry-inbound')}</Text>
                            <Select
                                data={activeInbounds.map((inbound) => ({
                                    label: `${inbound.tag} · ${inbound.type} · ${inbound.port ?? '—'}`,
                                    value: inbound.uuid
                                }))}
                                label={t('relay.entry-inbound')}
                                onChange={selectInbound}
                                placeholder={t('relay.select-inbound')}
                                searchable
                                value={inboundUuid}
                            />
                            {selectedInbound && (
                                <Card padding="sm" withBorder>
                                    <SimpleGrid cols={{ base: 1, sm: 4 }}>
                                        <Text size="sm">{selectedInbound.tag}</Text>
                                        <Text size="sm">{selectedInbound.type}</Text>
                                        <Text size="sm">{selectedInbound.network ?? '—'}</Text>
                                        <Text size="sm">{selectedInbound.security ?? '—'}</Text>
                                    </SimpleGrid>
                                </Card>
                            )}
                            {activeInbounds.length === 0 && (
                                <Alert color="yellow">{t('relay.no-active-inbounds')}</Alert>
                            )}
                        </Stack>
                    )}

                    {activeStep === 2 && (
                        <Stack>
                            <Text fw={600}>{t('relay.paste-target')}</Text>
                            <Textarea
                                autosize
                                description={t('relay.supported-protocols')}
                                error={parseError || undefined}
                                label={t('relay.target-uri')}
                                minRows={4}
                                onChange={(event) => handleUriChange(event.currentTarget.value)}
                                placeholder="vless://… / trojan://… / ss://… / socks://… / https://…"
                                value={uri}
                            />
                            {target && (
                                <Card padding="sm" withBorder>
                                    <Group justify="space-between">
                                        <Text fw={600}>{t('relay.parsed-target')}</Text>
                                        <Badge color="teal">{target.protocol.toUpperCase()}</Badge>
                                    </Group>
                                    <Divider my="sm" />
                                    <SimpleGrid cols={{ base: 2, sm: 4 }}>
                                        <Text size="sm">{target.address}</Text>
                                        <Text size="sm">{target.port}</Text>
                                        <Text size="sm">{target.network}</Text>
                                        <Text size="sm">{target.security}</Text>
                                    </SimpleGrid>
                                    <Text c="dimmed" mt="sm" size="xs">
                                        {t('relay.credentials-hidden')}
                                    </Text>
                                </Card>
                            )}
                        </Stack>
                    )}

                    {activeStep === 3 && plan && selectedTarget && (
                        <Stack>
                            <Text fw={600}>{t('relay.preview')}</Text>
                            <Alert color="blue">{t('relay.preview-chain')}</Alert>
                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                <Card padding="sm" withBorder>
                                    <Text c="dimmed" size="xs">
                                        {t('relay.node')}
                                    </Text>
                                    <Text fw={600}>{plan.entryNode.name}</Text>
                                    <Text size="sm">{plan.entryNode.address}</Text>
                                </Card>
                                <Card padding="sm" withBorder>
                                    <Text c="dimmed" size="xs">
                                        {t('relay.config-profile')}
                                    </Text>
                                    <Text fw={600}>{plan.profile.name}</Text>
                                    <Text size="sm">{plan.entryInbound.tag}</Text>
                                </Card>
                            </SimpleGrid>
                            <Card padding="sm" withBorder>
                                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                                    <Text size="sm">{selectedTarget.protocol.toUpperCase()}</Text>
                                    <Text size="sm">
                                        {selectedTarget.address}:{selectedTarget.port}
                                    </Text>
                                    <Text size="sm">{selectedTarget.network}</Text>
                                    <Text size="sm">{selectedTarget.security}</Text>
                                </SimpleGrid>
                                {selectedTarget.serverName && (
                                    <Text c="dimmed" size="xs">
                                        SNI: {selectedTarget.serverName}
                                    </Text>
                                )}
                                {selectedTarget.fingerprint && (
                                    <Text c="dimmed" size="xs">
                                        Fingerprint: {selectedTarget.fingerprint}
                                    </Text>
                                )}
                            </Card>
                            <Group justify="space-between">
                                <Text size="sm">{t('relay.outbound')}</Text>
                                <ActionBadge action={plan.outboundAction} />
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm">{t('relay.routing-rule')}</Text>
                                <ActionBadge action={plan.routingAction} />
                            </Group>
                            <Alert color="yellow" icon={<TbAlertTriangle />}>
                                {t('relay.runtime-warning')}
                            </Alert>
                        </Stack>
                    )}

                    {activeStep === 4 && result && (
                        <Stack>
                            <Group>
                                <ThemeIcon
                                    color={result.outcome === 'failed' ? 'red' : 'yellow'}
                                    radius="xl"
                                >
                                    <TbRoute />
                                </ThemeIcon>
                                <Stack gap={0}>
                                    <Text fw={700}>{t(`relay.outcome.${result.outcome}`)}</Text>
                                    <Text c="dimmed" size="sm">
                                        {t('relay.result-help')}
                                    </Text>
                                </Stack>
                            </Group>
                            <ResultRow
                                label={t('relay.result.outbound')}
                                result={result.outbound}
                            />
                            <ResultRow label={t('relay.result.routing')} result={result.routing} />
                            <ResultRow
                                label={t('relay.result.profile')}
                                result={result.configProfile}
                            />
                            <ResultRow
                                label={t('relay.result.reload')}
                                result={result.nodeReload}
                            />
                            <ResultRow
                                label={t('relay.result.runtime')}
                                result={result.nodeRuntime}
                            />
                            <ResultRow
                                label={t('relay.result.connectivity')}
                                result={result.connectivity}
                            />
                            <Alert color="blue">{t('relay.manual-e2e')}</Alert>
                        </Stack>
                    )}

                    <Group justify="space-between">
                        {activeStep > 0 && activeStep < 4 ? (
                            <Button
                                disabled={isDeploying}
                                leftSection={<TbArrowLeft />}
                                onClick={() => setActiveStep((step) => step - 1)}
                                variant="default"
                            >
                                {t('relay.back')}
                            </Button>
                        ) : (
                            <div />
                        )}
                        {activeStep < 3 && (
                            <Button
                                disabled={
                                    (activeStep === 0 && (!selectedNode || !selectedProfile)) ||
                                    (activeStep === 1 && !selectedInbound) ||
                                    (activeStep === 2 && !target)
                                }
                                onClick={next}
                                rightSection={<TbArrowRight />}
                            >
                                {activeStep === 2
                                    ? t('relay.generate-preview')
                                    : t('common.action.next')}
                            </Button>
                        )}
                        {activeStep === 3 && (
                            <Button loading={isDeploying} onClick={deploy}>
                                {t('relay.confirm')}
                            </Button>
                        )}
                        {activeStep === 4 && (
                            <Button onClick={hide}>{t('common.action.close')}</Button>
                        )}
                    </Group>
                    {activeStep < 4 && <Progress color="teal" value={(activeStep / 4) * 100} />}
                </Stack>
            )}
        </Modal>
    )
})
