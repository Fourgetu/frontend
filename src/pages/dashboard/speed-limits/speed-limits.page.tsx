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

const formatRate = (value: number) =>
    value === 0 ? 'Unlimited' : `${bytesPerSecondToMbps(value).toLocaleString()} Mbps`

function RuntimeBadge({ nodeUuid }: { nodeUuid: string }) {
    const { data, isFetching, refetch } = useGetUserRouteRuntime({
        route: { nodeUuid },
        rQueryParams: { enabled: true, refetchInterval: 15_000, staleTime: 5_000 }
    })

    const color = data?.running && data.installed ? 'teal' : data ? 'red' : 'gray'
    const label =
        isFetching && !data ? 'Checking' : data?.running ? 'Runtime confirmed' : 'Unavailable'

    return (
        <Group gap={4} wrap="nowrap">
            <Tooltip
                label={
                    data?.portHopping.error ??
                    data?.error ??
                    data?.gostVersion ??
                    'GOST health is not available'
                }
            >
                <Badge color={color} variant="light">
                    {label}
                </Badge>
            </Tooltip>
            <ActionIcon
                aria-label="Refresh runtime status"
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
                    label: `${node.name} · ${inbound.tag} · :${inbound.port ?? 'dynamic'}`,
                    value: inbound.uuid
                })
            }
        }
        return [...options.values()]
    }, [nodes, profiles])
    const hoppingInboundMap = useMemo(
        () => new Map(hoppingInboundOptions.map((option) => [option.value, option.label])),
        [hoppingInboundOptions]
    )
    const routeHoppingOptions =
        hoppingConfigs
            ?.filter((config) => config.enabled && config.configProfileInboundUuid === inboundUuid)
            .map((config) => ({
                label: `${config.poolStart}–${config.poolEnd} · ${config.portsPerUser} ports/user · ${config.hopIntervalSeconds}s`,
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
                title: 'Invalid port pool',
                message: 'The pool must contain at least one complete per-user allocation.'
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
                title: 'Loopback required',
                message: 'The selected Xray inbound must explicitly listen on 127.0.0.1 or ::1.'
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
        <Page title="User route speed limits">
            <PageHeaderShared
                actions={<Button onClick={() => openSpeedModal()}>New speed policy</Button>}
                icon={<TbGauge size={24} />}
                title="User route speed limits"
            />

            <Alert color="orange" mb="lg" title="Explicit GOST limiter mode only">
                Existing public proxy-core inbounds are never migrated automatically. A route can be
                created only when the selected inbound already listens explicitly on loopback;
                removing the route restores the subscription to the Host port.
            </Alert>

            <Alert color="yellow" mb="lg" title="Route-assigned limit, not identity-bound">
                GOST selects the limiter bucket from the external destination port before Xray or
                sing-box authenticates the protocol credential. A user who knows another route port
                targeting the same inbound may select that route&apos;s bucket. Treat external route
                ports as sensitive assignment data; this mode is not a cryptographic quota boundary
                between mutually hostile users.
            </Alert>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
                <Card withBorder>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Text fw={600}>Speed policies</Text>
                            <Text c="dimmed" size="sm">
                                Values are displayed in Mbps and stored as bytes/sec. Zero means
                                unlimited.
                            </Text>
                        </div>
                    </Group>
                    <Table.ScrollContainer minWidth={620}>
                        <Table striped withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th>Download</Table.Th>
                                    <Table.Th>Upload</Table.Th>
                                    <Table.Th>Status</Table.Th>
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
                                            {formatRate(speed.downloadBytesPerSecond)}
                                        </Table.Td>
                                        <Table.Td>
                                            {formatRate(speed.uploadBytesPerSecond)}
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge color={speed.enabled ? 'teal' : 'gray'}>
                                                {speed.enabled ? 'Enabled' : 'Unlimited fallback'}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button
                                                    onClick={() => openSpeedModal(speed)}
                                                    size="xs"
                                                    variant="subtle"
                                                >
                                                    Edit
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
                            <Text fw={600}>Per-user routes</Text>
                            <Text c="dimmed" size="sm">
                                Each row owns an independent external port and GOST limiter bucket.
                            </Text>
                        </div>
                        <Button leftSection={<TbPlugConnected />} onClick={routeModal.open}>
                            New route
                        </Button>
                    </Group>
                    <Table.ScrollContainer minWidth={980}>
                        <Table striped withTableBorder>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>User / Node</Table.Th>
                                    <Table.Th>Ports</Table.Th>
                                    <Table.Th>Policy</Table.Th>
                                    <Table.Th>Runtime</Table.Th>
                                    <Table.Th>Enabled</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {routes?.map((route: UserRoute) => (
                                    <Table.Tr key={route.uuid}>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>
                                                {userMap.get(route.userId) ??
                                                    `User #${route.userId}`}
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
                                                        HY2 hopping: {route.hopStartPort}–
                                                        {route.hopEndPort} UDP
                                                    </Text>
                                                )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Select
                                                allowDeselect
                                                data={[
                                                    { label: 'Unlimited', value: '' },
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
                                                <Tooltip label="Reallocate external port">
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
                                                <Tooltip label="Remove route and restore Host port">
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
                        <Text fw={600}>Hysteria2 port hopping</Text>
                        <Text c="dimmed" size="sm">
                            Stable per-user UDP ranges for active sing-box Hysteria2 inbounds.
                        </Text>
                    </div>
                    <Button onClick={() => openHoppingModal()}>New hopping config</Button>
                </Group>
                <Alert color="blue" mb="md" title="Node ingress requirement">
                    Port hopping uses nftables before the canonical per-user GOST UDP service. The
                    Node container requires NET_ADMIN; the canonical GOST port remains the fallback
                    if hopping ingress is unavailable.
                </Alert>
                <Table.ScrollContainer minWidth={760}>
                    <Table striped withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>sing-box Hysteria2 inbound</Table.Th>
                                <Table.Th>Pool</Table.Th>
                                <Table.Th>Allocation</Table.Th>
                                <Table.Th>Status</Table.Th>
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
                                        {config.portsPerUser} ports/user ·{' '}
                                        {config.hopIntervalSeconds}s
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge color={config.enabled ? 'teal' : 'gray'}>
                                            {config.enabled ? 'Enabled' : 'Disabled'}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button
                                                onClick={() => openHoppingModal(config)}
                                                size="xs"
                                                variant="subtle"
                                            >
                                                Edit
                                            </Button>
                                            <Tooltip label="Delete config and release its route ranges">
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
                title={editingSpeed ? 'Edit speed policy' : 'Create speed policy'}
            >
                <Stack>
                    <TextInput
                        label="Name"
                        onChange={(event) => setSpeedName(event.currentTarget.value)}
                        required
                        value={speedName}
                    />
                    <NumberInput
                        decimalScale={3}
                        label="Download (Mbps)"
                        min={0}
                        onChange={(value) => setDownloadMbps(typeof value === 'number' ? value : 0)}
                        value={downloadMbps}
                    />
                    <NumberInput
                        decimalScale={3}
                        label="Upload (Mbps)"
                        min={0}
                        onChange={(value) => setUploadMbps(typeof value === 'number' ? value : 0)}
                        value={uploadMbps}
                    />
                    <Switch
                        checked={speedEnabled}
                        label="Enabled (disabled policies behave as unlimited)"
                        onChange={(event) => setSpeedEnabled(event.currentTarget.checked)}
                    />
                    <Button
                        loading={createSpeed.isPending || updateSpeed.isPending}
                        onClick={saveSpeed}
                    >
                        Save
                    </Button>
                </Stack>
            </Modal>

            <Modal
                onClose={routeModal.close}
                opened={routeModalOpened}
                size="lg"
                title="Create per-user GOST route"
            >
                <Stack>
                    <Select
                        data={
                            usersData?.users.map((user) => ({
                                label: `${user.username} (#${user.id})`,
                                value: String(user.id)
                            })) ?? []
                        }
                        label="User"
                        onChange={setUserId}
                        required
                        searchable
                        value={userId}
                    />
                    <Select
                        data={nodes?.map((node) => ({ label: node.name, value: node.uuid })) ?? []}
                        label="Node"
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
                        label="Proxy-core inbound"
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
                        <Alert color="red">
                            This inbound is public or has no explicit listen address. Edit its core
                            config to listen on 127.0.0.1/::1 before creating a limited route.
                        </Alert>
                    )}
                    <Select
                        data={hostOptions}
                        disabled={!inboundUuid}
                        label="Host"
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
                        label="Speed policy"
                        onChange={setSpeedLimitUuid}
                        placeholder="Unlimited"
                        value={speedLimitUuid}
                    />
                    <Select
                        clearable
                        data={routeHoppingOptions}
                        description={
                            routeHoppingOptions.length > 0
                                ? 'Allocates a stable per-user UDP range; subscription formats without hopping support use the canonical external port.'
                                : 'Available only for an active sing-box Hysteria2 inbound with an enabled hopping config.'
                        }
                        disabled={routeHoppingOptions.length === 0}
                        label="Hysteria2 port hopping"
                        onChange={setPortHoppingConfigUuid}
                        placeholder="Canonical external port only"
                        value={portHoppingConfigUuid}
                    />
                    <SimpleGrid cols={2}>
                        <Select
                            data={[
                                { label: 'TCP', value: 'tcp' },
                                { label: 'UDP', value: 'udp' }
                            ]}
                            description="Derived from the selected proxy-core inbound"
                            disabled
                            label="Forward network"
                            value={network}
                        />
                        <NumberInput
                            label="External port"
                            max={65535}
                            min={1}
                            onChange={setExternalPort}
                            placeholder="Automatic (32000–32999)"
                            value={externalPort}
                        />
                    </SimpleGrid>
                    <Checkbox
                        checked={safetyConfirmed}
                        label="I confirm this inbound is intentionally in GOST limiter mode and direct public access to its proxy-core port is blocked."
                        onChange={(event) => setSafetyConfirmed(event.currentTarget.checked)}
                    />
                    <Button
                        disabled={!inboundIsLoopback || !safetyConfirmed}
                        loading={createRoute.isPending}
                        onClick={saveRoute}
                    >
                        Create and verify runtime
                    </Button>
                </Stack>
            </Modal>

            <Modal
                onClose={hoppingModal.close}
                opened={hoppingModalOpened}
                size="lg"
                title={editingHopping ? 'Edit port hopping config' : 'Create port hopping config'}
            >
                <Stack>
                    <Select
                        data={hoppingInboundOptions}
                        description="Only active sing-box Hysteria2 inbounds are eligible."
                        disabled={editingHopping !== null}
                        label="sing-box Hysteria2 inbound"
                        onChange={setHoppingInboundUuid}
                        required
                        searchable
                        value={hoppingInboundUuid}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <NumberInput
                            allowDecimal={false}
                            label="Pool start"
                            max={65_535}
                            min={1}
                            onChange={setPoolStart}
                            value={poolStart}
                        />
                        <NumberInput
                            allowDecimal={false}
                            label="Pool end"
                            max={65_535}
                            min={1}
                            onChange={setPoolEnd}
                            value={poolEnd}
                        />
                        <NumberInput
                            allowDecimal={false}
                            description="Each user receives one stable, non-overlapping range."
                            label="Ports per user"
                            max={1_024}
                            min={2}
                            onChange={setPortsPerUser}
                            value={portsPerUser}
                        />
                        <NumberInput
                            allowDecimal={false}
                            description="Emitted as hop_interval / hop-interval in supported clients."
                            label="Hop interval (seconds)"
                            max={86_400}
                            min={1}
                            onChange={setHopIntervalSeconds}
                            value={hopIntervalSeconds}
                        />
                    </SimpleGrid>
                    <Switch
                        checked={hoppingEnabled}
                        label="Enabled"
                        onChange={(event) => setHoppingEnabled(event.currentTarget.checked)}
                    />
                    <Button
                        disabled={!hoppingInboundUuid}
                        loading={createHopping.isPending || updateHopping.isPending}
                        onClick={saveHopping}
                    >
                        Save and validate allocations
                    </Button>
                </Stack>
            </Modal>
        </Page>
    )
}
