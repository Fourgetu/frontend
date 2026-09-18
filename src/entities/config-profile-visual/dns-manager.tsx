import type {
    JsonObject,
    VisualCoreType,
    VisualDocument,
    VisualDnsHost,
    VisualDnsServer
} from './types.ts'
import type { DragEndEvent } from '@dnd-kit/react'

import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Group,
    Modal,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Textarea
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiDraggable } from 'react-icons/ri'
import { TbCopy, TbEdit, TbPlus, TbTrash } from 'react-icons/tb'

import {
    applyVisualPatch,
    cloneDnsValue,
    dnsServersPath,
    getDnsHosts,
    getDnsRoot,
    getDnsServers,
    serializeDnsHostValue,
    serializeDnsServer,
    supportedDnsQueryStrategies
} from './index.ts'

type Props = {
    config: JsonObject
    coreType: VisualCoreType
    document: VisualDocument
    onConfigChange: (config: JsonObject, description: string) => void
}

type ServerDraft = {
    address: string
    tag: string
    domains: string
    expectIPs: string
    skipFallback: boolean
    queryStrategy: string
}

type HostDraft = { key: string; values: string }

const splitValues = (value: string): string[] =>
    value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)

const ensureDnsConfig = (config: JsonObject): JsonObject => {
    const dns = getDnsRoot(config)
    if (dns) return config
    return { ...config, dns: {} }
}

const serverDraft = (server: VisualDnsServer): ServerDraft => ({
    address: server.address,
    tag: server.tag ?? '',
    domains: server.domains.join(', '),
    expectIPs: server.expectIPs.join(', '),
    skipFallback: server.skipFallback ?? false,
    queryStrategy: server.queryStrategy ?? ''
})

const SortableServer = ({
    server,
    onEdit,
    onDuplicate,
    onDelete
}: {
    server: VisualDnsServer
    onEdit: () => void
    onDuplicate: () => void
    onDelete: () => void
}) => {
    const { t } = useTranslation()
    const { ref, handleRef, isDragging } = useSortable({
        id: `dns-server-${server.index}`,
        index: server.index
    })
    return (
        <Card ref={ref} opacity={isDragging ? 0 : 1} withBorder padding="sm">
            <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Group align="flex-start" gap="sm" wrap="nowrap">
                    <Button
                        aria-label={t('visual-config-builder.dns.drag-server')}
                        color="gray"
                        ref={handleRef}
                        size="sm"
                        style={{ cursor: 'grab' }}
                        variant="subtle"
                    >
                        <RiDraggable size={18} />
                    </Button>
                    <div>
                        <Group gap="xs">
                            <Text fw={600}>#{server.index + 1}</Text>
                            {server.tag && <Badge variant="light">{server.tag}</Badge>}
                            {server.readOnly && (
                                <Badge color="orange">{t('visual-config-builder.read-only')}</Badge>
                            )}
                        </Group>
                        <Text size="sm">
                            {server.address || t('visual-config-builder.dns.address-unset')}
                        </Text>
                        <Text c="dimmed" size="xs">
                            {server.kind === 'object'
                                ? t('visual-config-builder.dns.object-server')
                                : t('visual-config-builder.dns.string-server')}
                            {server.queryStrategy ? ` · ${server.queryStrategy}` : ''}
                        </Text>
                    </div>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <Button
                        disabled={server.readOnly}
                        leftSection={<TbEdit size={15} />}
                        onClick={onEdit}
                        size="xs"
                        variant="light"
                    >
                        {t('visual-config-builder.edit')}
                    </Button>
                    <Button
                        disabled={server.readOnly}
                        leftSection={<TbCopy size={15} />}
                        onClick={onDuplicate}
                        size="xs"
                        variant="light"
                    >
                        {t('visual-config-builder.duplicate')}
                    </Button>
                    <Button
                        color="red"
                        disabled={server.readOnly}
                        leftSection={<TbTrash size={15} />}
                        onClick={onDelete}
                        size="xs"
                        variant="subtle"
                    >
                        {t('visual-config-builder.delete')}
                    </Button>
                </Group>
            </Group>
        </Card>
    )
}

export function DnsVisualManager({ config, coreType, document, onConfigChange }: Props) {
    const { t } = useTranslation()
    const details = document.dnsDetails
    const rawServers = useMemo(() => getDnsServers(config), [config])
    const servers = details.servers
    const [serverIndex, setServerIndex] = useState<number | null>(null)
    const [serverOpen, setServerOpen] = useState(false)
    const [serverDraftValue, setServerDraftValue] = useState<ServerDraft | null>(null)
    const [hostOpen, setHostOpen] = useState(false)
    const [hostDraft, setHostDraft] = useState<HostDraft>({ key: '', values: '' })
    const [editingHost, setEditingHost] = useState<VisualDnsHost | null>(null)

    const updateConfig = (next: JsonObject, description: string) =>
        onConfigChange(next, description)

    const openServer = (server?: VisualDnsServer) => {
        setServerIndex(server?.index ?? null)
        setServerDraftValue(
            server
                ? serverDraft(server)
                : {
                      address: '',
                      tag: '',
                      domains: '',
                      expectIPs: '',
                      skipFallback: false,
                      queryStrategy: ''
                  }
        )
        setServerOpen(true)
    }

    const saveServer = () => {
        if (!serverDraftValue || !serverDraftValue.address.trim()) return
        const nextConfig = ensureDnsConfig(config)
        const current = getDnsServers(nextConfig)
        const draft = {
            address: serverDraftValue.address,
            tag: serverDraftValue.tag,
            domains: splitValues(serverDraftValue.domains),
            expectIPs: splitValues(serverDraftValue.expectIPs),
            skipFallback: coreType === 'xray' ? serverDraftValue.skipFallback : undefined,
            queryStrategy: serverDraftValue.queryStrategy
        }
        const original =
            serverIndex === null ? (coreType === 'singbox' ? {} : '') : current[serverIndex]
        const value = serializeDnsServer(original, draft, coreType)
        if (serverIndex === null) {
            const nextServers = [...current, value]
            const nextRoot = { ...getDnsRoot(nextConfig), servers: nextServers }
            updateConfig(
                { ...nextConfig, dns: nextRoot },
                t('visual-config-builder.dns.created', { address: draft.address })
            )
        } else {
            const path = [...dnsServersPath(), serverIndex] as Array<string | number>
            updateConfig(
                applyVisualPatch(nextConfig, { operations: [{ op: 'set', path, value }] }),
                t('visual-config-builder.dns.edited', { index: serverIndex + 1 })
            )
        }
        setServerOpen(false)
    }

    const duplicateServer = (server: VisualDnsServer) => {
        if (server.readOnly) return
        const next = rawServers.map((item) => cloneDnsValue(item))
        next.splice(server.index + 1, 0, cloneDnsValue(server.raw))
        const nextRoot = { ...getDnsRoot(config), servers: next }
        updateConfig(
            { ...ensureDnsConfig(config), dns: nextRoot },
            t('visual-config-builder.dns.duplicated', { index: server.index + 1 })
        )
    }

    const deleteServer = (server: VisualDnsServer) => {
        if (server.readOnly) return
        modals.openConfirmModal({
            title: t('visual-config-builder.dns.delete-confirm', { index: server.index + 1 }),
            children: <Text>{t('visual-config-builder.dns.delete-description')}</Text>,
            labels: {
                confirm: t('visual-config-builder.delete'),
                cancel: t('visual-config-builder.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                const next = rawServers.filter((_, index) => index !== server.index)
                const nextRoot = { ...getDnsRoot(config), servers: next }
                updateConfig(
                    { ...ensureDnsConfig(config), dns: nextRoot },
                    t('visual-config-builder.dns.deleted', { index: server.index + 1 })
                )
            }
        })
    }

    const handleServerDrag = (event: DragEndEvent) => {
        if (event.canceled || servers.some((server) => server.readOnly)) {
            if (!event.canceled && servers.some((server) => server.readOnly)) {
                modals.open({
                    title: t('visual-config-builder.dns.reorder-title'),
                    children: t('visual-config-builder.dns.reorder-readonly')
                })
            }
            return
        }
        const rows = servers.map((server) => ({
            id: `dns-server-${server.index}`,
            raw: server.raw,
            server
        }))
        const nextRows = move(rows, event)
        const nextRoot = {
            ...getDnsRoot(config),
            servers: nextRows.map((row) => cloneDnsValue(row.raw))
        }
        updateConfig(
            { ...ensureDnsConfig(config), dns: nextRoot },
            t('visual-config-builder.dns.reordered')
        )
    }

    const saveSettings = (field: string, value: string) => {
        const nextConfig = ensureDnsConfig(config)
        const path = ['dns', field] as Array<string | number>
        const operation = value
            ? { op: 'set' as const, path, value }
            : { op: 'remove' as const, path }
        updateConfig(
            applyVisualPatch(nextConfig, { operations: [operation] }),
            t('visual-config-builder.dns.setting-edited', { field })
        )
    }

    const openHost = (host?: VisualDnsHost) => {
        setEditingHost(host ?? null)
        setHostDraft({ key: host?.key ?? '', values: host?.values.join(', ') ?? '' })
        setHostOpen(true)
    }

    const saveHost = () => {
        const key = hostDraft.key.trim()
        const values = splitValues(hostDraft.values)
        if (!key || !values.length) return
        const nextConfig = ensureDnsConfig(config)
        const path = ['dns', 'hosts', key] as Array<string | number>
        const operations =
            editingHost && editingHost.key !== key
                ? [
                      { op: 'remove' as const, path: ['dns', 'hosts', editingHost.key] },
                      {
                          op: 'set' as const,
                          path,
                          value: serializeDnsHostValue(values, editingHost.raw)
                      }
                  ]
                : [
                      {
                          op: 'set' as const,
                          path,
                          value: serializeDnsHostValue(values, editingHost?.raw)
                      }
                  ]
        const withHosts = getDnsRoot(nextConfig)?.hosts
        const base = isObjectLike(withHosts)
            ? nextConfig
            : { ...nextConfig, dns: { ...getDnsRoot(nextConfig), hosts: {} } }
        updateConfig(
            applyVisualPatch(base, { operations }),
            editingHost
                ? t('visual-config-builder.dns.host-edited', { key })
                : t('visual-config-builder.dns.host-created', { key })
        )
        setHostOpen(false)
    }

    const deleteHost = (host: VisualDnsHost) => {
        modals.openConfirmModal({
            title: t('visual-config-builder.dns.host-delete-confirm', { key: host.key }),
            labels: {
                confirm: t('visual-config-builder.delete'),
                cancel: t('visual-config-builder.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: () =>
                updateConfig(
                    applyVisualPatch(ensureDnsConfig(config), {
                        operations: [{ op: 'remove', path: ['dns', 'hosts', host.key] }]
                    }),
                    t('visual-config-builder.dns.host-deleted', { key: host.key })
                )
        })
    }

    const hosts = getDnsHosts(config)
    const dnsRoot = getDnsRoot(config)
    const isObjectLike = (value: unknown): value is JsonObject =>
        Boolean(value && typeof value === 'object' && !Array.isArray(value))

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">
                        DNS
                    </Text>
                    <Text c="dimmed" size="sm">
                        {t('visual-config-builder.dns.list-description')}
                    </Text>
                </div>
                <Button leftSection={<TbPlus size={16} />} onClick={() => openServer()} size="sm">
                    {t('visual-config-builder.dns.add-server')}
                </Button>
            </Group>

            {coreType === 'singbox' && (
                <Alert color="yellow" title="sing-box DNS">
                    {t('visual-config-builder.dns.singbox-readonly')}
                </Alert>
            )}

            <Card withBorder padding="md">
                <Group justify="space-between" mb="sm">
                    <Text fw={600}>{t('visual-config-builder.dns.servers')}</Text>
                    <Badge>{servers.length}</Badge>
                </Group>
                <DragDropProvider modifiers={[RestrictToVerticalAxis]} onDragEnd={handleServerDrag}>
                    <Stack>
                        {servers.map((server) => (
                            <SortableServer
                                key={`${server.index}-${server.id}`}
                                server={server}
                                onEdit={() => openServer(server)}
                                onDuplicate={() => duplicateServer(server)}
                                onDelete={() => deleteServer(server)}
                            />
                        ))}
                        {!servers.length && (
                            <Text c="dimmed">{t('visual-config-builder.dns.empty-servers')}</Text>
                        )}
                    </Stack>
                </DragDropProvider>
            </Card>

            <Card withBorder padding="md">
                <Text fw={600} mb="sm">
                    {t('visual-config-builder.dns.query-settings')}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    {coreType === 'xray' ? (
                        <TextInput
                            label={t('visual-config-builder.dns.client-ip')}
                            value={details.clientIp ?? ''}
                            onChange={(event) =>
                                saveSettings('clientIp', event.currentTarget.value)
                            }
                        />
                    ) : (
                        <TextInput
                            label={t('visual-config-builder.dns.default-dns')}
                            value={details.final ?? ''}
                            onChange={(event) => saveSettings('final', event.currentTarget.value)}
                        />
                    )}
                    {coreType === 'xray' ? (
                        <TextInput
                            label={t('visual-config-builder.dns.tag')}
                            value={details.tag ?? ''}
                            onChange={(event) => saveSettings('tag', event.currentTarget.value)}
                        />
                    ) : (
                        <TextInput
                            label={t('visual-config-builder.dns.base-strategy')}
                            value={details.strategy ?? ''}
                            onChange={(event) =>
                                saveSettings('strategy', event.currentTarget.value)
                            }
                        />
                    )}
                    <TextInput
                        label={t('visual-config-builder.dns.query-strategy')}
                        value={
                            coreType === 'xray'
                                ? (details.queryStrategy ?? '')
                                : (details.strategy ?? '')
                        }
                        placeholder={supportedDnsQueryStrategies.join(' / ')}
                        onChange={(event) =>
                            saveSettings(
                                coreType === 'xray' ? 'queryStrategy' : 'strategy',
                                event.currentTarget.value
                            )
                        }
                    />
                </SimpleGrid>
            </Card>

            {coreType === 'xray' && (
                <Card withBorder padding="md">
                    <Group justify="space-between" mb="sm">
                        <Text fw={600}>{t('visual-config-builder.dns.hosts')}</Text>
                        <Button
                            leftSection={<TbPlus size={15} />}
                            onClick={() => openHost()}
                            size="xs"
                            variant="light"
                        >
                            {t('visual-config-builder.dns.add-host')}
                        </Button>
                    </Group>
                    <Stack>
                        {hosts.map((host) => (
                            <Group key={host.key} justify="space-between" wrap="nowrap">
                                <div>
                                    <Text>{host.key}</Text>
                                    <Text c="dimmed" size="sm">
                                        {host.values.join(', ')}
                                    </Text>
                                </div>
                                <Group gap="xs">
                                    <Button
                                        leftSection={<TbEdit size={14} />}
                                        onClick={() => openHost(host)}
                                        size="xs"
                                        variant="subtle"
                                    >
                                        {t('visual-config-builder.edit')}
                                    </Button>
                                    <Button
                                        color="red"
                                        leftSection={<TbTrash size={14} />}
                                        onClick={() => deleteHost(host)}
                                        size="xs"
                                        variant="subtle"
                                    >
                                        {t('visual-config-builder.delete')}
                                    </Button>
                                </Group>
                            </Group>
                        ))}
                        {!hosts.length && (
                            <Text c="dimmed">{t('visual-config-builder.dns.empty-hosts')}</Text>
                        )}
                    </Stack>
                </Card>
            )}

            {(details.advancedPaths.length > 0 ||
                details.rulesCount > 0 ||
                (dnsRoot &&
                    Object.keys(dnsRoot).some(
                        (key) =>
                            ![
                                'servers',
                                'hosts',
                                'clientIp',
                                'tag',
                                'queryStrategy',
                                'final',
                                'strategy'
                            ].includes(key)
                    ))) && (
                <Alert color="yellow" title={t('visual-config-builder.dns.advanced-title')}>
                    {details.rulesCount > 0
                        ? t('visual-config-builder.dns.rules-detected', {
                              count: details.rulesCount
                          })
                        : ''}{' '}
                    {t('visual-config-builder.dns.advanced-preserved')}
                </Alert>
            )}

            <Modal
                centered
                opened={serverOpen}
                onClose={() => setServerOpen(false)}
                size="lg"
                title={
                    serverIndex === null
                        ? t('visual-config-builder.dns.add-server')
                        : t('visual-config-builder.dns.edit-server', {
                              index: (serverIndex ?? 0) + 1
                          })
                }
            >
                {serverDraftValue && (
                    <Stack>
                        <TextInput
                            label={t('visual-config-builder.dns.address')}
                            required
                            value={serverDraftValue.address}
                            onChange={(event) =>
                                setServerDraftValue({
                                    ...serverDraftValue,
                                    address: event.currentTarget.value
                                })
                            }
                        />
                        {coreType === 'singbox' ? (
                            <TextInput
                                label={t('visual-config-builder.dns.tag')}
                                value={serverDraftValue.tag}
                                onChange={(event) =>
                                    setServerDraftValue({
                                        ...serverDraftValue,
                                        tag: event.currentTarget.value
                                    })
                                }
                            />
                        ) : (
                            <>
                                <TextInput
                                    label={t('visual-config-builder.dns.tag-optional')}
                                    value={serverDraftValue.tag}
                                    onChange={(event) =>
                                        setServerDraftValue({
                                            ...serverDraftValue,
                                            tag: event.currentTarget.value
                                        })
                                    }
                                />
                                <Textarea
                                    label={t('visual-config-builder.dns.domains')}
                                    value={serverDraftValue.domains}
                                    onChange={(event) =>
                                        setServerDraftValue({
                                            ...serverDraftValue,
                                            domains: event.currentTarget.value
                                        })
                                    }
                                />
                                <Textarea
                                    label={t('visual-config-builder.dns.expect-ips')}
                                    value={serverDraftValue.expectIPs}
                                    onChange={(event) =>
                                        setServerDraftValue({
                                            ...serverDraftValue,
                                            expectIPs: event.currentTarget.value
                                        })
                                    }
                                />
                                <Checkbox
                                    label={t('visual-config-builder.dns.skip-fallback')}
                                    checked={serverDraftValue.skipFallback}
                                    onChange={(event) =>
                                        setServerDraftValue({
                                            ...serverDraftValue,
                                            skipFallback: event.currentTarget.checked
                                        })
                                    }
                                />
                            </>
                        )}
                        <TextInput
                            label={t('visual-config-builder.dns.query-strategy')}
                            placeholder={supportedDnsQueryStrategies.join(' / ')}
                            value={serverDraftValue.queryStrategy}
                            onChange={(event) =>
                                setServerDraftValue({
                                    ...serverDraftValue,
                                    queryStrategy: event.currentTarget.value
                                })
                            }
                        />
                        <Group justify="flex-end">
                            <Button onClick={() => setServerOpen(false)} variant="default">
                                {t('visual-config-builder.cancel')}
                            </Button>
                            <Button onClick={saveServer}>
                                {t('visual-config-builder.apply-targeted')}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                centered
                opened={hostOpen}
                onClose={() => setHostOpen(false)}
                title={
                    editingHost
                        ? t('visual-config-builder.dns.edit-host')
                        : t('visual-config-builder.dns.add-host')
                }
            >
                <Stack>
                    <TextInput
                        label={t('visual-config-builder.dns.domain')}
                        value={hostDraft.key}
                        onChange={(event) =>
                            setHostDraft({ ...hostDraft, key: event.currentTarget.value })
                        }
                    />
                    <Textarea
                        label={t('visual-config-builder.dns.ip-address')}
                        description={t('visual-config-builder.dns.multi-value-description')}
                        value={hostDraft.values}
                        onChange={(event) =>
                            setHostDraft({ ...hostDraft, values: event.currentTarget.value })
                        }
                    />
                    <Group justify="flex-end">
                        <Button onClick={() => setHostOpen(false)} variant="default">
                            {t('visual-config-builder.cancel')}
                        </Button>
                        <Button onClick={saveHost}>{t('visual-config-builder.save')}</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
