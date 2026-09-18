import {
    bytesPerSecondToMbps,
    getGostForwardNetwork,
    isLoopbackAddress,
    mbpsToBytesPerSecond
} from '@features/dashboard/speed-limits/model/speed-limit'
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Group,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbGauge, TbPlugConnected, TbRefresh, TbTrash } from 'react-icons/tb'

import {
    PortHoppingConfig,
    SpeedLimit,
    UserRoute,
    useCreatePortHoppingConfig,
    useCreateSpeedLimit,
    useCreateUserRoute,
    useDeletePortHoppingConfig,
    useDeleteSpeedLimit,
    useDeleteUserRoute,
    useGetConfigProfiles,
    useGetHosts,
    useGetNodes,
    useGetPortHoppingConfigs,
    useGetSpeedLimits,
    useGetUserRouteRuntime,
    useGetUserRoutes,
    useGetUsers,
    useReallocateUserRoutePort,
    useUpdatePortHoppingConfig,
    useUpdateSpeedLimit,
    useUpdateUserRoute
} from '@shared/api/hooks'
import { LoadingScreen, Page, PageHeaderShared } from '@shared/ui'

const formatRate = (value: number, unlimitedLabel: string) =>
    value === 0 ? unlimitedLabel : `${bytesPerSecondToMbps(value).toLocaleString()} Mbps`

function RuntimeBadge({ nodeUuid }: { nodeUuid: string }) {
    const { t } = useTranslation()
    const { data, isFetching, refetch } = useGetUserRouteRuntime({
        route: { nodeUuid },
        rQueryParams: { enabled: true, refetchInterval: 15_000, staleTime: 5_000 }
    })

    const color = data?.running && data.installed ? 'teal' : data ? 'red' : 'gray'
    const label =
        isFetching && !data
            ? t('speed-limits.runtime.checking')
            : data?.running
              ? t('speed-limits.runtime.confirmed')
              : t('speed-limits.runtime.unavailable')

    return (
        <Group gap={4} wrap="nowrap">
            <Tooltip
                label={
                    data?.portHopping.error ??
                    data?.error ??
                    data?.gostVersion ??
                    t('speed-limits.runtime.health-unavailable')
                }
            >
                <Badge color={color} variant="light">
                    {label}
                </Badge>
            </Tooltip>
            <ActionIcon
                aria-label={t('speed-limits.runtime.refresh')}
                onClick={() => void refetch()}
                size="sm"
                variant="subtle"
            >
                <TbRefresh size={14} />
            </ActionIcon>
        </Group>
    )
}

export function SpeedLimitsPage() {
    const { t } = useTranslation()
    const { data: speedLimits, isLoading: speedsLoading } = useGetSpeedLimits()
    const { data: routes, isLoading: routesLoading } = useGetUserRoutes()
    const { data: hoppingConfigs, isLoading: hoppingLoading } = useGetPortHoppingConfigs()
    const { data: nodes } = useGetNodes()
    const { data: profilesResponse } = useGetConfigProfiles()
    const { data: hosts } = useGetHosts()
    const { data: usersData } = useGetUsers({ query: { size: 100, start: 0 } })

    const createSpeed = useCreateSpeedLimit()
    const updateSpeed = useUpdateSpeedLimit()
    const deleteSpeed = useDeleteSpeedLimit()
    const createRoute = useCreateUserRoute()
    const updateRoute = useUpdateUserRoute()
    const deleteRoute = useDeleteUserRoute()
    const reallocatePort = useReallocateUserRoutePort()
    const createHopping = useCreatePortHoppingConfig()
    const updateHopping = useUpdatePortHoppingConfig()
    const deleteHopping = useDeletePortHoppingConfig()

    const [speedModalOpened, speedModal] = useDisclosure(false)
    const [routeModalOpened, routeModal] = useDisclosure(false)
    const [hoppingModalOpened, hoppingModal] = useDisclosure(false)
    const [editingSpeed, setEditingSpeed] = useState<SpeedLimit | null>(null)
    const [speedName, setSpeedName] = useState('')
    const [downloadMbps, setDownloadMbps] = useState(20)
    const [uploadMbps, setUploadMbps] = useState(20)
    const [speedEnabled, setSpeedEnabled] = useState(true)

    const [userId, setUserId] = useState<string | null>(null)
    const [nodeUuid, setNodeUuid] = useState<string | null>(null)
    const [inboundUuid, setInboundUuid] = useState<string | null>(null)
    const [hostUuid, setHostUuid] = useState<string | null>(null)
    const [speedLimitUuid, setSpeedLimitUuid] = useState<string | null>(null)
    const [externalPort, setExternalPort] = useState<number | string>('')
    const [network, setNetwork] = useState<'tcp' | 'udp'>('tcp')
    const [safetyConfirmed, setSafetyConfirmed] = useState(false)
    const [portHoppingConfigUuid, setPortHoppingConfigUuid] = useState<string | null>(null)

    const [editingHopping, setEditingHopping] = useState<PortHoppingConfig | null>(null)
    const [hoppingInboundUuid, setHoppingInboundUuid] = useState<string | null>(null)
    const [poolStart, setPoolStart] = useState<number | string>(20_000)
    const [poolEnd, setPoolEnd] = useState<number | string>(29_999)
    const [portsPerUser, setPortsPerUser] = useState<number | string>(20)
    const [hopIntervalSeconds, setHopIntervalSeconds] = useState<number | string>(30)
    const [hoppingEnabled, setHoppingEnabled] = useState(true)

    const userMap = useMemo(
        () => new Map(usersData?.users.map((user) => [user.id, user.username]) ?? []),
        [usersData]
    )
    const nodeMap = useMemo(
        () => new Map(nodes?.map((node) => [node.uuid, node.name]) ?? []),
        [nodes]
    )
    const hostMap = useMemo(
        () => new Map(hosts?.map((host) => [host.uuid, host.remark]) ?? []),
        [hosts]
    )
    const profiles = profilesResponse?.configProfiles
    const selectedNode = nodes?.find((node) => node.uuid === nodeUuid)
    const selectedNodeProfiles = profiles?.filter(
        (profile) =>
            profile.uuid === selectedNode?.configProfile.activeConfigProfileUuid ||
            profile.uuid === selectedNode?.configProfile.activeSingBoxConfigProfileUuid
    )
    const selectedNodeInbounds =
        selectedNodeProfiles?.flatMap((profile) =>
            profile.inbounds.map((inbound) => ({
                ...inbound,
                coreType: profile.coreType
            }))
        ) ?? []
    const selectedInbound = selectedNodeInbounds.find((inbound) => inbound.uuid === inboundUuid)
    const inboundOptions = selectedNodeInbounds
        .filter((inbound) => inbound.port !== null)
        .map((inbound) => ({
            label: `${inbound.coreType} · ${inbound.tag} · ${inbound.type} · :${inbound.port}`,
            value: inbound.uuid
        }))
    const hostOptions =
        hosts
            ?.filter(
                (host) =>
                    nodeUuid &&
                    host.nodes.includes(nodeUuid) &&
                    host.inbound.configProfileInboundUuid === inboundUuid
            )
            .map((host) => ({
                label: `${host.remark} · ${host.address}:${host.port}`,
                value: host.uuid
            })) ?? []
    const rawInbound = selectedInbound?.rawInbound as { listen?: unknown } | null | undefined
    const inboundIsLoopback = isLoopbackAddress(rawInbound?.listen)
    const hoppingInboundOptions = useMemo(() => {
        const options = new Map<string, { label: string; value: string }>()
        for (const node of nodes ?? []) {
            const profile = profiles?.find(
                (item) => item.uuid === node.configProfile.activeSingBoxConfigProfileUuid
            )
            for (const inbound of profile?.inbounds ?? []) {
                const raw = inbound.rawInbound as { type?: unknown } | null | undefined
                if (raw?.type !== 'hysteria2') continue
                options.set(inbound.uuid, {
                    label: `${node.name} · ${inbound.tag} · :${inbound.port ?? t('speed-limits.common.dynamic')}`,
                    value: inbound.uuid
                })
            }
        }
        return [...options.values()]
    }, [nodes, profiles, t])
    const hoppingInboundMap = useMemo(
        () => new Map(hoppingInboundOptions.map((option) => [option.value, option.label])),
        [hoppingInboundOptions]
    )
    const routeHoppingOptions =
        hoppingConfigs
            ?.filter((config) => config.enabled && config.configProfileInboundUuid === inboundUuid)
            .map((config) => ({
                label: t('speed-limits.hopping.route-option', {
                    start: config.poolStart,
                    end: config.poolEnd,
                    ports: config.portsPerUser,
                    seconds: config.hopIntervalSeconds
                }),
                value: config.uuid
            })) ?? []

    const openSpeedModal = (speed?: SpeedLimit) => {
        setEditingSpeed(speed ?? null)
        setSpeedName(speed?.name ?? '')
        setDownloadMbps(speed ? bytesPerSecondToMbps(speed.downloadBytesPerSecond) : 20)
        setUploadMbps(speed ? bytesPerSecondToMbps(speed.uploadBytesPerSecond) : 20)
        setSpeedEnabled(speed?.enabled ?? true)
        speedModal.open()
    }

    const saveSpeed = () => {
        if (!speedName.trim()) return
        const values = {
            name: speedName.trim(),
            downloadBytesPerSecond: mbpsToBytesPerSecond(downloadMbps),
            uploadBytesPerSecond: mbpsToBytesPerSecond(uploadMbps),
            enabled: speedEnabled
        }
        const onSuccess = () => speedModal.close()
        if (editingSpeed) {
            updateSpeed.mutate({
                variables: { uuid: editingSpeed.uuid, ...values },
                mutationFns: { onSuccess }
            })
        } else {
            createSpeed.mutate({ variables: values, mutationFns: { onSuccess } })
        }
    }

    const openHoppingModal = (config?: PortHoppingConfig) => {
        setEditingHopping(config ?? null)
        setHoppingInboundUuid(config?.configProfileInboundUuid ?? null)
        setPoolStart(config?.poolStart ?? 20_000)
        setPoolEnd(config?.poolEnd ?? 29_999)
        setPortsPerUser(config?.portsPerUser ?? 20)
        setHopIntervalSeconds(config?.hopIntervalSeconds ?? 30)
        setHoppingEnabled(config?.enabled ?? true)
        hoppingModal.open()
    }

    const saveHopping = () => {
        if (
            !hoppingInboundUuid ||
            typeof poolStart !== 'number' ||
            typeof poolEnd !== 'number' ||
            typeof portsPerUser !== 'number' ||
            typeof hopIntervalSeconds !== 'number'
        ) {
            return
        }
        if (poolStart >= poolEnd || poolEnd - poolStart + 1 < portsPerUser) {
            notifications.show({
                color: 'red',
                title: t('speed-limits.notifications.invalid-pool-title'),
                message: t('speed-limits.notifications.invalid-pool-message')
            })
            return
        }

        const values = {
            poolStart,
            poolEnd,
            portsPerUser,
            hopIntervalSeconds,
            enabled: hoppingEnabled
        }
        const mutationFns = { onSuccess: hoppingModal.close }
        if (editingHopping) {
            updateHopping.mutate({
                route: { uuid: editingHopping.uuid },
                variables: values,
                mutationFns
            })
        } else {
            createHopping.mutate({
                variables: { configProfileInboundUuid: hoppingInboundUuid, ...values },
                mutationFns
            })
        }
    }

    const resetRouteForm = () => {
        setUserId(null)
        setNodeUuid(null)
        setInboundUuid(null)
        setHostUuid(null)
        setSpeedLimitUuid(null)
        setPortHoppingConfigUuid(null)
        setExternalPort('')
        setNetwork('tcp')
        setSafetyConfirmed(false)
    }

    const saveRoute = () => {
        if (!userId || !nodeUuid || !inboundUuid || !hostUuid || !selectedInbound?.port) return
        if (!inboundIsLoopback || !safetyConfirmed) {
            notifications.show({
                color: 'red',
                title: t('speed-limits.notifications.loopback-required-title'),
                message: t('speed-limits.notifications.loopback-required-message')
            })
            return
        }

        createRoute.mutate({
            variables: {
                userId: Number(userId),
                nodeUuid,
                configProfileInboundUuid: inboundUuid,
                hostUuid,
                speedLimitUuid: speedLimitUuid || null,
                portHoppingConfigUuid: portHoppingConfigUuid || null,
                ...(typeof externalPort === 'number' ? { externalPort } : {}),
                internalAddress: rawInbound.listen as '127.0.0.1' | '::1',
                internalPort: selectedInbound.port,
                network,
                enabled: true
            },
            mutationFns: {
                onSuccess: () => {
                    routeModal.close()
                    resetRouteForm()
                }
            }
        })
    }

    if (speedsLoading || routesLoading || hoppingLoading) return <LoadingScreen />

    return (
        <Page title={t('speed-limits.title')}>
            <PageHeaderShared
                actions={
                    <Button onClick={() => openSpeedModal()}>
                        {t('speed-limits.policies.new')}
                    </Button>
                }
                icon={<TbGauge size={24} />}
                title={t('speed-limits.title')}
            />

            <Alert color="orange" mb="lg" title={t('speed-limits.alerts.explicit-title')}>
                {t('speed-limits.alerts.explicit-description')}
            </Alert>

            <Alert color="yellow" mb="lg" title={t('speed-limits.alerts.assignment-title')}>
                {t('speed-limits.alerts.assignment-description')}
            </Alert>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
                <Card withBorder>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Text fw={600}>{t('speed-limits.policies.title')}</Text>
                            <Text c="dimmed" size="sm">
                                {t('speed-limits.policies.description')}
                            </Text>
                        </div>
                    </Group>
                    <Table.ScrollContainer minWidth={620}>
                        <Table striped withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('common.field.name')}</Table.Th>
                                    <Table.Th>{t('speed-limits.fields.download')}</Table.Th>
                                    <Table.Th>{t('speed-limits.fields.upload')}</Table.Th>
                                    <Table.Th>{t('common.field.status')}</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {speedLimits?.map((speed) => (
                                    <Table.Tr
                                        key={speed.uuid}
                                        onDoubleClick={() => openSpeedModal(speed)}
                                    >
                                        <Table.Td>{speed.name}</Table.Td>
                                        <Table.Td>
                                            {formatRate(
                                                speed.downloadBytesPerSecond,
                                                t('speed-limits.common.unlimited')
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            {formatRate(
                                                speed.uploadBytesPerSecond,
                                                t('speed-limits.common.unlimited')
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge color={speed.enabled ? 'teal' : 'gray'}>
                                                {speed.enabled
                                                    ? t('speed-limits.common.enabled')
                                                    : t('speed-limits.policies.unlimited-fallback')}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button
                                                    onClick={() => openSpeedModal(speed)}
                                                    size="xs"
                                                    variant="subtle"
                                                >
                                                    {t('common.action.edit')}
                                                </Button>
                                                <ActionIcon
                                                    color="red"
                                                    onClick={() =>
                                                        deleteSpeed.mutate({
                                                            route: { uuid: speed.uuid }
                                                        })
                                                    }
                                                    variant="subtle"
                                                >
                                                    <TbTrash size={16} />
                                                </ActionIcon>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Card>

                <Card withBorder>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Text fw={600}>{t('speed-limits.routes.title')}</Text>
                            <Text c="dimmed" size="sm">
                                {t('speed-limits.routes.description')}
                            </Text>
                        </div>
                        <Button leftSection={<TbPlugConnected />} onClick={routeModal.open}>
                            {t('speed-limits.routes.new')}
                        </Button>
                    </Group>
                    <Table.ScrollContainer minWidth={980}>
                        <Table striped withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('speed-limits.routes.user-node')}</Table.Th>
                                    <Table.Th>{t('speed-limits.fields.ports')}</Table.Th>
                                    <Table.Th>{t('speed-limits.fields.policy')}</Table.Th>
                                    <Table.Th>{t('speed-limits.fields.runtime')}</Table.Th>
                                    <Table.Th>{t('speed-limits.common.enabled')}</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {routes?.map((route: UserRoute) => (
                                    <Table.Tr key={route.uuid}>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>
                                                {userMap.get(route.userId) ??
                                                    t('speed-limits.routes.user-fallback', {
                                                        id: route.userId
                                                    })}
                                            </Text>
                                            <Text c="dimmed" size="xs">
                                                {nodeMap.get(route.nodeUuid) ?? route.nodeUuid} ·{' '}
                                                {hostMap.get(route.hostUuid) ?? route.hostUuid}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">
                                                :{route.externalPort} → {route.internalAddress}:
                                                {route.internalPort}/{route.network}
                                            </Text>
                                            {route.hopStartPort !== null &&
                                                route.hopEndPort !== null && (
                                                    <Text c="dimmed" size="xs">
                                                        {t('speed-limits.routes.hy2-hopping', {
                                                            start: route.hopStartPort,
                                                            end: route.hopEndPort
                                                        })}
                                                    </Text>
                                                )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Select
                                                allowDeselect
                                                data={[
                                                    {
                                                        label: t('speed-limits.common.unlimited'),
                                                        value: ''
                                                    },
                                                    ...(speedLimits?.map((speed) => ({
                                                        label: speed.name,
                                                        value: speed.uuid
                                                    })) ?? [])
                                                ]}
                                                onChange={(value) =>
                                                    updateRoute.mutate({
                                                        variables: {
                                                            uuid: route.uuid,
                                                            speedLimitUuid: value || null
                                                        }
                                                    })
                                                }
                                                size="xs"
                                                value={route.speedLimitUuid ?? ''}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <RuntimeBadge nodeUuid={route.nodeUuid} />
                                        </Table.Td>
                                        <Table.Td>
                                            <Switch
                                                checked={route.enabled}
                                                onChange={(event) =>
                                                    updateRoute.mutate({
                                                        variables: {
                                                            uuid: route.uuid,
                                                            enabled: event.currentTarget.checked
                                                        }
                                                    })
                                                }
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap={2} justify="flex-end" wrap="nowrap">
                                                <Tooltip
                                                    label={t('speed-limits.routes.reallocate-port')}
                                                >
                                                    <ActionIcon
                                                        onClick={() =>
                                                            reallocatePort.mutate({
                                                                route: { uuid: route.uuid }
                                                            })
                                                        }
                                                        variant="subtle"
                                                    >
                                                        <TbRefresh size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip
                                                    label={t(
                                                        'speed-limits.routes.remove-and-restore'
                                                    )}
                                                >
                                                    <ActionIcon
                                                        color="red"
                                                        onClick={() =>
                                                            deleteRoute.mutate({
                                                                route: { uuid: route.uuid }
                                                            })
                                                        }
                                                        variant="subtle"
                                                    >
                                                        <TbTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Card>
            </SimpleGrid>

            <Card mt="lg" withBorder>
                <Group justify="space-between" mb="md">
                    <div>
                        <Text fw={600}>{t('speed-limits.hopping.title')}</Text>
                        <Text c="dimmed" size="sm">
                            {t('speed-limits.hopping.description')}
                        </Text>
                    </div>
                    <Button onClick={() => openHoppingModal()}>
                        {t('speed-limits.hopping.new')}
                    </Button>
                </Group>
                <Alert color="blue" mb="md" title={t('speed-limits.hopping.ingress-title')}>
                    {t('speed-limits.hopping.ingress-description')}
                </Alert>
                <Table.ScrollContainer minWidth={760}>
                    <Table striped withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('speed-limits.hopping.inbound')}</Table.Th>
                                <Table.Th>{t('speed-limits.hopping.pool')}</Table.Th>
                                <Table.Th>{t('speed-limits.hopping.allocation')}</Table.Th>
                                <Table.Th>{t('common.field.status')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {hoppingConfigs?.map((config) => (
                                <Table.Tr key={config.uuid}>
                                    <Table.Td>
                                        {hoppingInboundMap.get(config.configProfileInboundUuid) ??
                                            config.configProfileInboundUuid}
                                    </Table.Td>
                                    <Table.Td>
                                        {config.poolStart}–{config.poolEnd} UDP
                                    </Table.Td>
                                    <Table.Td>
                                        {t('speed-limits.hopping.allocation-value', {
                                            ports: config.portsPerUser,
                                            seconds: config.hopIntervalSeconds
                                        })}
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge color={config.enabled ? 'teal' : 'gray'}>
                                            {config.enabled
                                                ? t('speed-limits.common.enabled')
                                                : t('speed-limits.common.disabled')}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button
                                                onClick={() => openHoppingModal(config)}
                                                size="xs"
                                                variant="subtle"
                                            >
                                                {t('common.action.edit')}
                                            </Button>
                                            <Tooltip
                                                label={t('speed-limits.hopping.delete-tooltip')}
                                            >
                                                <ActionIcon
                                                    color="red"
                                                    onClick={() =>
                                                        deleteHopping.mutate({
                                                            route: { uuid: config.uuid }
                                                        })
                                                    }
                                                    variant="subtle"
                                                >
                                                    <TbTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Card>

            <Modal
                onClose={speedModal.close}
                opened={speedModalOpened}
                title={
                    editingSpeed
                        ? t('speed-limits.policies.edit')
                        : t('speed-limits.policies.create')
                }
            >
                <Stack>
                    <TextInput
                        label={t('common.field.name')}
                        onChange={(event) => setSpeedName(event.currentTarget.value)}
                        required
                        value={speedName}
                    />
                    <NumberInput
                        decimalScale={3}
                        label={t('speed-limits.fields.download-mbps')}
                        min={0}
                        onChange={(value) => setDownloadMbps(typeof value === 'number' ? value : 0)}
                        value={downloadMbps}
                    />
                    <NumberInput
                        decimalScale={3}
                        label={t('speed-limits.fields.upload-mbps')}
                        min={0}
                        onChange={(value) => setUploadMbps(typeof value === 'number' ? value : 0)}
                        value={uploadMbps}
                    />
                    <Switch
                        checked={speedEnabled}
                        label={t('speed-limits.policies.enabled-description')}
                        onChange={(event) => setSpeedEnabled(event.currentTarget.checked)}
                    />
                    <Button
                        loading={createSpeed.isPending || updateSpeed.isPending}
                        onClick={saveSpeed}
                    >
                        {t('common.action.save')}
                    </Button>
                </Stack>
            </Modal>

            <Modal
                onClose={routeModal.close}
                opened={routeModalOpened}
                size="lg"
                title={t('speed-limits.routes.create')}
            >
                <Stack>
                    <Select
                        data={
                            usersData?.users.map((user) => ({
                                label: `${user.username} (#${user.id})`,
                                value: String(user.id)
                            })) ?? []
                        }
                        label={t('speed-limits.fields.user')}
                        onChange={setUserId}
                        required
                        searchable
                        value={userId}
                    />
                    <Select
                        data={nodes?.map((node) => ({ label: node.name, value: node.uuid })) ?? []}
                        label={t('speed-limits.fields.node')}
                        onChange={(value) => {
                            setNodeUuid(value)
                            setInboundUuid(null)
                            setHostUuid(null)
                            setPortHoppingConfigUuid(null)
                        }}
                        required
                        searchable
                        value={nodeUuid}
                    />
                    <Select
                        data={inboundOptions}
                        label={t('speed-limits.fields.proxy-core-inbound')}
                        onChange={(value) => {
                            setInboundUuid(value)
                            setHostUuid(null)
                            setPortHoppingConfigUuid(null)
                            const inbound = selectedNodeInbounds.find((item) => item.uuid === value)
                            setNetwork(getGostForwardNetwork(inbound?.type ?? ''))
                        }}
                        required
                        value={inboundUuid}
                    />
                    {selectedInbound && !inboundIsLoopback && (
                        <Alert color="red">{t('speed-limits.routes.public-inbound-warning')}</Alert>
                    )}
                    <Select
                        data={hostOptions}
                        disabled={!inboundUuid}
                        label={t('speed-limits.fields.host')}
                        onChange={setHostUuid}
                        required
                        searchable
                        value={hostUuid}
                    />
                    <Select
                        clearable
                        data={
                            speedLimits?.map((speed) => ({
                                label: speed.name,
                                value: speed.uuid
                            })) ?? []
                        }
                        label={t('speed-limits.fields.speed-policy')}
                        onChange={setSpeedLimitUuid}
                        placeholder={t('speed-limits.common.unlimited')}
                        value={speedLimitUuid}
                    />
                    <Select
                        clearable
                        data={routeHoppingOptions}
                        description={
                            routeHoppingOptions.length > 0
                                ? t('speed-limits.routes.hopping-available-description')
                                : t('speed-limits.routes.hopping-unavailable-description')
                        }
                        disabled={routeHoppingOptions.length === 0}
                        label={t('speed-limits.hopping.title')}
                        onChange={setPortHoppingConfigUuid}
                        placeholder={t('speed-limits.routes.canonical-port-only')}
                        value={portHoppingConfigUuid}
                    />
                    <SimpleGrid cols={2}>
                        <Select
                            data={[
                                { label: 'TCP', value: 'tcp' },
                                { label: 'UDP', value: 'udp' }
                            ]}
                            description={t('speed-limits.routes.network-derived')}
                            disabled
                            label={t('speed-limits.fields.forward-network')}
                            value={network}
                        />
                        <NumberInput
                            label={t('speed-limits.fields.external-port')}
                            max={65535}
                            min={1}
                            onChange={setExternalPort}
                            placeholder={t('speed-limits.routes.automatic-port')}
                            value={externalPort}
                        />
                    </SimpleGrid>
                    <Checkbox
                        checked={safetyConfirmed}
                        label={t('speed-limits.routes.safety-confirmation')}
                        onChange={(event) => setSafetyConfirmed(event.currentTarget.checked)}
                    />
                    <Button
                        disabled={!inboundIsLoopback || !safetyConfirmed}
                        loading={createRoute.isPending}
                        onClick={saveRoute}
                    >
                        {t('speed-limits.routes.create-and-verify')}
                    </Button>
                </Stack>
            </Modal>

            <Modal
                onClose={hoppingModal.close}
                opened={hoppingModalOpened}
                size="lg"
                title={
                    editingHopping
                        ? t('speed-limits.hopping.edit')
                        : t('speed-limits.hopping.create')
                }
            >
                <Stack>
                    <Select
                        data={hoppingInboundOptions}
                        description={t('speed-limits.hopping.eligible-description')}
                        disabled={editingHopping !== null}
                        label={t('speed-limits.hopping.inbound')}
                        onChange={setHoppingInboundUuid}
                        required
                        searchable
                        value={hoppingInboundUuid}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <NumberInput
                            allowDecimal={false}
                            label={t('speed-limits.hopping.pool-start')}
                            max={65_535}
                            min={1}
                            onChange={setPoolStart}
                            value={poolStart}
                        />
                        <NumberInput
                            allowDecimal={false}
                            label={t('speed-limits.hopping.pool-end')}
                            max={65_535}
                            min={1}
                            onChange={setPoolEnd}
                            value={poolEnd}
                        />
                        <NumberInput
                            allowDecimal={false}
                            description={t('speed-limits.hopping.ports-per-user-description')}
                            label={t('speed-limits.hopping.ports-per-user')}
                            max={1_024}
                            min={2}
                            onChange={setPortsPerUser}
                            value={portsPerUser}
                        />
                        <NumberInput
                            allowDecimal={false}
                            description={t('speed-limits.hopping.interval-description')}
                            label={t('speed-limits.hopping.interval')}
                            max={86_400}
                            min={1}
                            onChange={setHopIntervalSeconds}
                            value={hopIntervalSeconds}
                        />
                    </SimpleGrid>
                    <Switch
                        checked={hoppingEnabled}
                        label={t('speed-limits.common.enabled')}
                        onChange={(event) => setHoppingEnabled(event.currentTarget.checked)}
                    />
                    <Button
                        disabled={!hoppingInboundUuid}
                        loading={createHopping.isPending || updateHopping.isPending}
                        onClick={saveHopping}
                    >
                        {t('speed-limits.hopping.save-and-validate')}
                    </Button>
                </Stack>
            </Modal>
        </Page>
    )
}
