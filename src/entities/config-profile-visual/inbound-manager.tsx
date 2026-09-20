import type { JsonObject, VisualCoreType, VisualDocument, VisualInbound } from './types.ts'

import {
    DEFAULT_SS2022_METHOD,
    generateSs2022ServerPassword,
    type Ss2022Method
} from '@features/dashboard/config-profiles/protocol-presets/model/dual-core-capabilities'
import {
    appendProtocolPresets,
    PROTOCOL_PRESETS,
    REALITY_MIN_CLIENT_VERSION_COMPAT,
    type ProtocolPresetBuildOptions,
    type ProtocolPresetId
} from '@features/dashboard/config-profiles/protocol-presets/model/protocol-presets.ts'
import { Ss2022MethodSelect } from '@features/dashboard/config-profiles/protocol-presets/ss2022-method-select'
import { CORE_CAPABILITIES } from '@features/dashboard/nodes/quick-deploy/model/core-capabilities.ts'
import { appendSingBoxProtocolPresets } from '@features/dashboard/nodes/quick-deploy/model/singbox-protocol-presets.ts'
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Divider,
    Group,
    Modal,
    NumberInput,
    PasswordInput,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
    TagsInput,
    Text,
    TextInput
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCopy, TbEdit, TbPlus, TbTrash } from 'react-icons/tb'

import { useGetPanelTlsCertificate } from '@shared/api/hooks'
import { PANEL_CERTIFICATE_URI, PANEL_PRIVATE_KEY_URI, isPanelCertificatePair } from '@shared/tls'
import { deriveX25519PublicKey } from '@shared/utils/crypto/keypair-utils'

import {
    applyVisualPatch,
    buildInboundEditorOperations,
    cloneInbound,
    getInboundEditorDraft,
    getInboundDisplay,
    getInboundReferences,
    getInboundPortConflict,
    parseReferencePath,
    normalizeTagValues,
    supportsInboundProtocol,
    validateInboundCollection,
    type InboundEditorDraft
} from './index.ts'

type InboundManagerProps = {
    coreType: VisualCoreType
    config: JsonObject
    document: VisualDocument
    onConfigChange: (config: JsonObject, description: string) => void
}

type AddDraft = {
    ss2022Method: Ss2022Method
    tag: string
    listen: string
    port: string
    minClientVer: string
    presetId: string
    targetDomain: string
    targetPort: string
    serverName: string
    tlsDomain: string
    certificateFile: string
    keyFile: string
}

const getPresetOptions = (coreType: VisualCoreType) => {
    if (coreType === 'singbox') {
        return CORE_CAPABILITIES.filter(
            (capability) =>
                capability.coreType === 'singbox' && capability.availability === 'enabled'
        )
            .filter(
                (capability) =>
                    capability.id !== 'singbox-mixed' || supportsInboundProtocol(coreType, 'mixed')
            )
            .map((capability) => ({ value: capability.id, label: capability.title }))
    }
    return PROTOCOL_PRESETS.filter((preset) => preset.supported).map((preset) => ({
        value: preset.id,
        label: preset.title
    }))
}

const isSnippetManaged = (inbound: VisualInbound): boolean =>
    typeof inbound.raw.snippet === 'string' && inbound.raw.snippet.length > 0

const nextAvailablePort = (config: JsonObject, network: 'tcp' | 'udp'): number => {
    const inbounds = Array.isArray(config.inbounds) ? config.inbounds : []
    for (let port = 20_000; port <= 60_000; port += 1) {
        const candidate: JsonObject = {
            tag: 'candidate',
            listen: '0.0.0.0',
            port,
            protocol: network === 'udp' ? 'hysteria' : 'vless',
            streamSettings: { network: network === 'udp' ? 'hysteria' : 'raw' }
        }
        if (!getInboundPortConflict(inbounds, candidate)) return port
    }
    throw new Error('No free core listening port is available.')
}

const toNumberPort = (value: string): number | undefined => {
    if (!value.trim()) return undefined
    const port = Number(value)
    return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : undefined
}

export function InboundVisualManager({
    coreType,
    config,
    document,
    onConfigChange
}: InboundManagerProps) {
    const { t } = useTranslation()
    const { data: panelTlsCertificate } = useGetPanelTlsCertificate()
    const [editorIndex, setEditorIndex] = useState<number | null>(null)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editorDraft, setEditorDraft] = useState<InboundEditorDraft>(() =>
        getInboundEditorDraft({}, coreType, REALITY_MIN_CLIENT_VERSION_COMPAT)
    )
    const [addOpen, setAddOpen] = useState(false)
    const [addDraft, setAddDraft] = useState<AddDraft>({
        ss2022Method: DEFAULT_SS2022_METHOD,
        tag: '',
        listen: '0.0.0.0',
        port: '',
        minClientVer: REALITY_MIN_CLIENT_VERSION_COMPAT,
        presetId: getPresetOptions(coreType)[0]?.value ?? '',
        targetDomain: 'www.intel.com',
        targetPort: '443',
        serverName: 'www.intel.com',
        tlsDomain: '',
        certificateFile:
            coreType === 'singbox'
                ? PANEL_CERTIFICATE_URI
                : '/var/lib/remnawave/configs/xray/ssl/fullchain.pem',
        keyFile:
            coreType === 'singbox'
                ? PANEL_PRIVATE_KEY_URI
                : '/var/lib/remnawave/configs/xray/ssl/privkey.key'
    })

    const inbounds = useMemo(() => document.inboundDetails, [document.inboundDetails])
    const editorInbound = editorIndex === null ? undefined : inbounds[editorIndex]
    const editorSnippetManaged = editorInbound ? isSnippetManaged(editorInbound) : false
    const editorReferences = editorInbound ? getInboundReferences(config, editorInbound.tag) : []

    const localizeError = (error: string) => {
        if (error === 'This method is unavailable for SS2022 Managed Users.')
            return t('dual-core.chacha-managed-unavailable')
        if (error.startsWith('Server key must encode ')) return t('dual-core.invalid-server-key')
        if (error.startsWith('Invalid Reality ')) return t('dual-core.invalid-reality')
        if (error === 'Inbound tag is required.')
            return t('visual-config-builder.errors.inbound-tag-required')
        if (error.startsWith('Inbound tag "') && error.endsWith('" is already used.')) {
            return t('visual-config-builder.errors.inbound-tag-used', { tag: error.slice(13, -17) })
        }
        if (error === 'Core listening port must be between 1 and 65535.') {
            return t('visual-config-builder.errors.core-port-range')
        }
        return error
    }
    const localizeReadOnlyReason = (reason: string) => {
        if (reason === 'Users are managed by Remnawave.') {
            return t('visual-config-builder.users-managed')
        }
        if (reason === 'Managed by Snippet.') {
            return t('visual-config-builder.managed-by-snippet')
        }
        return reason
    }

    const openEditor = (inbound: VisualInbound) => {
        setEditorIndex(inbound.index)
        const draft = getInboundEditorDraft(
            inbound.raw,
            coreType,
            REALITY_MIN_CLIENT_VERSION_COMPAT
        )
        const primaryDomain =
            coreType === 'singbox' &&
            panelTlsCertificate?.status === 'ready' &&
            panelTlsCertificate.primaryDomain
                ? panelTlsCertificate.primaryDomain
                : ''
        setEditorDraft(
            isPanelCertificatePair(draft.certificateFile, draft.keyFile) &&
                !draft.tlsServerName.trim() &&
                primaryDomain
                ? { ...draft, tlsServerName: primaryDomain }
                : draft
        )
        setEditorOpen(true)
    }

    const openDuplicate = (inbound: VisualInbound) => {
        const copy = cloneInbound(inbound.raw)
        const existingTags = new Set(inbounds.map((item) => item.tag))
        let tag = `${inbound.tag}-copy`
        let suffix = 2
        while (existingTags.has(tag)) tag = `${inbound.tag}-copy-${suffix++}`
        copy.tag = tag
        const network = String(inbound.transport ?? '')
            .toLowerCase()
            .includes('hysteria')
            ? 'udp'
            : 'tcp'
        const port = nextAvailablePort(config, network)
        if ('listen_port' in copy) copy.listen_port = port
        else copy.port = port
        const current = Array.isArray(config.inbounds) ? config.inbounds : []
        onConfigChange(
            applyVisualPatch(config, {
                operations: [{ op: 'set', path: ['inbounds'], value: [...current, copy] }]
            }),
            t('visual-config-builder.inbound.duplicated', { from: inbound.tag, to: tag })
        )
    }

    const deleteInbound = (inbound: VisualInbound) => {
        if (isSnippetManaged(inbound)) {
            modals.open({
                title: t('visual-config-builder.inbound.snippet-managed'),
                children: t('visual-config-builder.inbound.snippet-readonly'),
                centered: true
            })
            return
        }
        const references = getInboundReferences(config, inbound.tag)
        if (references.length > 0) {
            modals.open({
                title: t('visual-config-builder.inbound.cannot-delete'),
                children: (
                    <Stack gap="xs">
                        <Text>{t('visual-config-builder.referenced-by')}</Text>
                        {references.map((reference) => (
                            <Text key={reference.path} size="sm">
                                • {reference.label}
                            </Text>
                        ))}
                    </Stack>
                ),
                centered: true
            })
            return
        }
        modals.openConfirmModal({
            title: t('visual-config-builder.inbound.delete-confirm', { tag: inbound.tag }),
            children: (
                <Stack gap="xs">
                    <Text>{t('visual-config-builder.inbound.delete-description')}</Text>
                    <Text c="orange" size="sm">
                        {t('visual-config-builder.inbound.delete-warning')}
                    </Text>
                </Stack>
            ),
            labels: {
                confirm: t('visual-config-builder.delete'),
                cancel: t('visual-config-builder.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                onConfigChange(
                    applyVisualPatch(config, {
                        operations: [{ op: 'remove', path: ['inbounds', inbound.index] }]
                    }),
                    t('visual-config-builder.inbound.deleted', { tag: inbound.tag })
                )
            }
        })
    }

    const saveEditor = () => {
        if (!editorInbound || editorSnippetManaged) return
        const port = toNumberPort(editorDraft.port)
        const candidate = cloneInbound(editorInbound.raw)
        candidate.tag = editorDraft.tag.trim()
        candidate.listen = editorDraft.listen.trim()
        if (coreType === 'singbox') candidate.listen_port = port
        else candidate.port = port
        const errors = validateInboundCollection(
            Array.isArray(config.inbounds) ? config.inbounds : [],
            candidate,
            { ignoreIndex: editorInbound.index, existingTag: editorInbound.tag }
        )
        if (!port) errors.push(t('visual-config-builder.errors.core-port-range'))
        if (errors.length) {
            modals.open({
                title: t('visual-config-builder.inbound.cannot-save'),
                children: (
                    <Stack gap="xs">
                        {errors.map((error) => (
                            <Text key={error} size="sm">
                                {localizeError(error)}
                            </Text>
                        ))}
                    </Stack>
                ),
                centered: true
            })
            return
        }

        let operations: ReturnType<typeof buildInboundEditorOperations>
        try {
            operations = buildInboundEditorOperations(
                editorInbound.raw,
                editorInbound.index,
                coreType,
                editorDraft
            )
        } catch (error) {
            modals.open({
                title: t('visual-config-builder.inbound.cannot-save'),
                children: (
                    <Text>
                        {error instanceof Error
                            ? localizeError(error.message)
                            : t('common.message.error')}
                    </Text>
                )
            })
            return
        }
        const renaming = editorDraft.tag.trim() !== editorInbound.tag
        const commit = () => {
            const nextOperations = [...operations]
            if (renaming && editorReferences.length > 0) {
                editorReferences.forEach((reference) => {
                    nextOperations.push({
                        op: 'set',
                        path: parseReferencePath(reference.path),
                        value: editorDraft.tag.trim()
                    })
                })
            }
            if (nextOperations.length > 0) {
                onConfigChange(
                    applyVisualPatch(config, { operations: nextOperations }),
                    renaming && editorReferences.length > 0
                        ? t('visual-config-builder.inbound.renamed', {
                              from: editorInbound.tag,
                              to: editorDraft.tag.trim(),
                              count: editorReferences.length
                          })
                        : t('visual-config-builder.inbound.edited', { tag: editorInbound.tag })
                )
            }
            setEditorOpen(false)
        }
        if (renaming && editorReferences.length > 0) {
            modals.openConfirmModal({
                title: t('visual-config-builder.inbound.rename-confirm'),
                children: (
                    <Stack gap="xs">
                        <Text>
                            {editorInbound.tag} → {editorDraft.tag.trim()}
                        </Text>
                        <Text size="sm">
                            {t('visual-config-builder.inbound.reference-update', {
                                count: editorReferences.length
                            })}
                        </Text>
                        {editorReferences.map((reference) => (
                            <Text key={reference.path} size="sm">
                                • {reference.label}
                            </Text>
                        ))}
                    </Stack>
                ),
                labels: {
                    confirm: t('visual-config-builder.update-and-save'),
                    cancel: t('visual-config-builder.cancel')
                },
                onConfirm: commit
            })
        } else commit()
    }

    const openAdd = () => {
        const presetId = getPresetOptions(coreType)[0]?.value ?? ''
        const primaryDomain =
            coreType === 'singbox' &&
            panelTlsCertificate?.status === 'ready' &&
            panelTlsCertificate.primaryDomain
                ? panelTlsCertificate.primaryDomain
                : ''
        setAddDraft((current) => ({
            ...current,
            presetId,
            tag: '',
            port: '',
            tlsDomain:
                isPanelCertificatePair(current.certificateFile, current.keyFile) &&
                !current.tlsDomain.trim() &&
                primaryDomain
                    ? primaryDomain
                    : current.tlsDomain
        }))
        setAddOpen(true)
    }

    const createInbound = () => {
        try {
            const presetId = addDraft.presetId
            let next: JsonObject
            const current = Array.isArray(config.inbounds) ? config.inbounds : []
            if (coreType === 'xray') {
                const xrayOptions: ProtocolPresetBuildOptions = {
                    ss2022Method: addDraft.ss2022Method,
                    reality: {
                        minClientVer: addDraft.minClientVer,
                        targetDomain: addDraft.targetDomain,
                        targetPort: addDraft.targetPort,
                        serverName: addDraft.serverName
                    },
                    tls: {
                        domain: addDraft.tlsDomain,
                        certificateFile: addDraft.certificateFile,
                        keyFile: addDraft.keyFile
                    }
                }
                const result = appendProtocolPresets(
                    config,
                    [presetId as ProtocolPresetId],
                    xrayOptions
                )
                next = result.added[0].inbound
            } else {
                const result = appendSingBoxProtocolPresets(config, [presetId as never], {
                    reality: {
                        targetDomain: addDraft.targetDomain,
                        targetPort: addDraft.targetPort,
                        serverName: addDraft.serverName
                    },
                    ss2022Method: addDraft.ss2022Method,
                    reservedTags: inbounds.map((item) => item.tag),
                    reservedPorts: inbounds.flatMap((item) =>
                        typeof item.port === 'number' ? [item.port] : []
                    ),
                    tls: {
                        domain: addDraft.tlsDomain,
                        certificateFile: PANEL_CERTIFICATE_URI,
                        keyFile: PANEL_PRIVATE_KEY_URI,
                        source: 'panel'
                    }
                })
                next = result.added[0].inbound as unknown as JsonObject
            }
            if (addDraft.tag.trim()) next.tag = addDraft.tag.trim()
            next.listen = addDraft.listen.trim() || String(next.listen ?? '')
            const port = addDraft.port.trim() ? toNumberPort(addDraft.port) : undefined
            if (port !== undefined) {
                if (coreType === 'singbox') next.listen_port = port
                else next.port = port
            }
            const errors = validateInboundCollection(current, next)
            if (errors.length) throw new Error(errors.join(' '))
            onConfigChange(
                applyVisualPatch(config, {
                    operations: [{ op: 'set', path: ['inbounds'], value: [...current, next] }]
                }),
                `Created inbound ${String(next.tag)}`
            )
            setAddOpen(false)
        } catch (error) {
            modals.open({
                title: t('visual-config-builder.inbound.cannot-create'),
                children:
                    error instanceof Error
                        ? localizeError(error.message)
                        : t('visual-config-builder.invalid-preset'),
                centered: true
            })
        }
    }

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">
                        {t('visual-config-builder.inbounds')}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {t('visual-config-builder.inbound.list-description')}
                    </Text>
                </div>
                <Button leftSection={<TbPlus size={16} />} onClick={openAdd} size="sm">
                    {t('visual-config-builder.add-inbound')}
                </Button>
            </Group>
            <Stack>
                {inbounds.map((inbound) => {
                    const display = getInboundDisplay(inbound)
                    const snippetManaged = isSnippetManaged(inbound)
                    return (
                        <Card key={`${inbound.index}-${inbound.tag}`} withBorder padding="md">
                            <Group justify="space-between" align="flex-start">
                                <div>
                                    <Group gap="xs">
                                        <Text fw={700}>{inbound.tag}</Text>
                                        <Badge
                                            color={coreType === 'xray' ? 'blue' : 'grape'}
                                            variant="light"
                                        >
                                            {display.protocol}
                                        </Badge>
                                        {snippetManaged && (
                                            <Badge color="orange">
                                                {t('visual-config-builder.read-only')}
                                            </Badge>
                                        )}
                                    </Group>
                                    <SimpleGrid cols={{ base: 2, sm: 5 }} mt="sm">
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.listen')}</b>
                                            <br />
                                            {display.listen || '0.0.0.0'}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.core-port')}</b>
                                            <br />
                                            {display.port}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.transport')}</b>
                                            <br />
                                            {display.transport}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.security')}</b>
                                            <br />
                                            {display.security}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.core')}</b>
                                            <br />
                                            {coreType === 'xray' ? 'Xray' : 'sing-box'}
                                        </Text>
                                    </SimpleGrid>
                                </div>
                                <Group gap="xs">
                                    <Button
                                        disabled={snippetManaged}
                                        leftSection={<TbEdit size={15} />}
                                        onClick={() => openEditor(inbound)}
                                        size="xs"
                                        variant="light"
                                    >
                                        {t('visual-config-builder.edit')}
                                    </Button>
                                    <Button
                                        disabled={snippetManaged}
                                        leftSection={<TbCopy size={15} />}
                                        onClick={() => openDuplicate(inbound)}
                                        size="xs"
                                        variant="light"
                                    >
                                        {t('visual-config-builder.duplicate')}
                                    </Button>
                                    <Button
                                        color="red"
                                        disabled={snippetManaged}
                                        leftSection={<TbTrash size={15} />}
                                        onClick={() => deleteInbound(inbound)}
                                        size="xs"
                                        variant="subtle"
                                    >
                                        {t('visual-config-builder.delete')}
                                    </Button>
                                </Group>
                            </Group>
                            {inbound.readOnlyReason && !snippetManaged && (
                                <Text c="dimmed" mt="sm" size="xs">
                                    {localizeReadOnlyReason(inbound.readOnlyReason)}
                                </Text>
                            )}
                        </Card>
                    )
                })}
                {inbounds.length === 0 && (
                    <Text c="dimmed">{t('visual-config-builder.inbound.empty')}</Text>
                )}
            </Stack>

            <Modal
                centered
                onClose={() => setEditorOpen(false)}
                opened={editorOpen}
                size="lg"
                title={`${t('visual-config-builder.edit-inbound')}${editorInbound ? ` · ${editorInbound.tag}` : ''}`}
            >
                {editorInbound && (
                    <Stack>
                        {editorSnippetManaged && (
                            <Alert color="orange" title={t('visual-config-builder.read-only')}>
                                {t('visual-config-builder.inbound.snippet-managed-short')}
                            </Alert>
                        )}
                        {editorInbound.readOnlyReason && (
                            <Alert color="blue" title="Managed clients">
                                {localizeReadOnlyReason(editorInbound.readOnlyReason)}
                            </Alert>
                        )}
                        <Tabs defaultValue="basic" keepMounted={false}>
                            <Tabs.List>
                                <Tabs.Tab value="basic">
                                    {t('visual-config-builder.basic')}
                                </Tabs.Tab>
                                <Tabs.Tab value="protocol">
                                    {t('visual-config-builder.inbound.protocol-tab')}
                                </Tabs.Tab>
                                <Tabs.Tab value="transport">
                                    {t('visual-config-builder.transport')}
                                </Tabs.Tab>
                                <Tabs.Tab value="security">
                                    {t('visual-config-builder.security')}
                                </Tabs.Tab>
                                <Tabs.Tab value="sniffing">
                                    {t('visual-config-builder.inbound.sniffing')}
                                </Tabs.Tab>
                                <Tabs.Tab value="advanced">
                                    {t('visual-config-builder.advanced')}
                                </Tabs.Tab>
                            </Tabs.List>
                            <Tabs.Panel pt="md" value="basic">
                                <Stack>
                                    <TextInput
                                        disabled={editorSnippetManaged}
                                        label="Tag"
                                        value={editorDraft.tag}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                tag: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <TextInput
                                        label={t('visual-config-builder.core')}
                                        value={coreType === 'xray' ? 'Xray' : 'sing-box'}
                                        readOnly
                                    />
                                    <TextInput
                                        label={t('visual-config-builder.protocol-type')}
                                        value={editorDraft.protocol}
                                        readOnly
                                    />
                                    <TextInput
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.listen')}
                                        value={editorDraft.listen}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                listen: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <NumberInput
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.core-port')}
                                        value={editorDraft.port}
                                        onChange={(value) =>
                                            setEditorDraft({ ...editorDraft, port: String(value) })
                                        }
                                        min={1}
                                        max={65_535}
                                    />
                                    <Text c="dimmed" size="xs">
                                        {t('visual-config-builder.inbound.nat-description')}
                                    </Text>
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="protocol">
                                {editorDraft.protocol === 'mixed' ? (
                                    <Stack>
                                        <Select
                                            disabled={editorSnippetManaged}
                                            label={t('visual-config-builder.inbound.auth')}
                                            data={[
                                                { value: 'noauth', label: 'noauth' },
                                                { value: 'password', label: 'password' }
                                            ]}
                                            value={editorDraft.auth}
                                            onChange={(value) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    auth:
                                                        value === 'password' ? 'password' : 'noauth'
                                                })
                                            }
                                        />
                                        {coreType === 'xray' && (
                                            <SimpleGrid cols={2}>
                                                <Checkbox
                                                    checked={editorDraft.udp}
                                                    disabled={editorSnippetManaged}
                                                    label="UDP"
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            udp: event.currentTarget.checked
                                                        })
                                                    }
                                                />
                                                <NumberInput
                                                    disabled={editorSnippetManaged}
                                                    label="userLevel"
                                                    value={editorDraft.userLevel}
                                                    onChange={(value) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            userLevel: String(value)
                                                        })
                                                    }
                                                    min={0}
                                                />
                                            </SimpleGrid>
                                        )}
                                        {editorDraft.auth === 'password' && (
                                            <SimpleGrid cols={2}>
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label={t(
                                                        'visual-config-builder.inbound.username'
                                                    )}
                                                    value={editorDraft.username}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            username: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label={t(
                                                        'visual-config-builder.inbound.password'
                                                    )}
                                                    type="password"
                                                    value={editorDraft.password}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            password: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                            </SimpleGrid>
                                        )}
                                    </Stack>
                                ) : (
                                    <Alert color="blue">
                                        {t('visual-config-builder.inbound.managed-protocol-fields')}
                                    </Alert>
                                )}
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="transport">
                                <Stack>
                                    <Select
                                        disabled={editorSnippetManaged || coreType === 'singbox'}
                                        label={t('visual-config-builder.transport')}
                                        data={[
                                            'raw',
                                            'tcp',
                                            'ws',
                                            'grpc',
                                            'httpupgrade',
                                            'xhttp',
                                            'kcp'
                                        ]}
                                        value={editorDraft.transport || null}
                                        onChange={(value) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                transport: value ?? ''
                                            })
                                        }
                                    />
                                    {['raw', 'tcp', 'kcp'].includes(editorDraft.transport) && (
                                        <Select
                                            disabled={editorSnippetManaged}
                                            label={t('visual-config-builder.inbound.header-type')}
                                            data={['none', 'http']}
                                            value={editorDraft.headerType || 'none'}
                                            onChange={(value) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    headerType: value ?? 'none'
                                                })
                                            }
                                        />
                                    )}
                                    {['ws', 'httpupgrade', 'xhttp'].includes(
                                        editorDraft.transport
                                    ) && (
                                        <SimpleGrid cols={2}>
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label={t('visual-config-builder.inbound.path')}
                                                value={editorDraft.path}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        path: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label="Host"
                                                value={editorDraft.host}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        host: event.currentTarget.value
                                                    })
                                                }
                                            />
                                        </SimpleGrid>
                                    )}
                                    {editorDraft.transport === 'grpc' && (
                                        <>
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label="serviceName"
                                                value={editorDraft.serviceName}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        serviceName: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <Checkbox
                                                checked={editorDraft.multiMode}
                                                disabled={editorSnippetManaged}
                                                label="multiMode"
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        multiMode: event.currentTarget.checked
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                    {editorDraft.transport === 'xhttp' && (
                                        <TextInput
                                            disabled={editorSnippetManaged}
                                            label="mode"
                                            value={editorDraft.xhttpMode}
                                            onChange={(event) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    xhttpMode: event.currentTarget.value
                                                })
                                            }
                                        />
                                    )}
                                    {coreType === 'singbox' && (
                                        <Text c="dimmed" size="sm">
                                            {t('visual-config-builder.inbound.transport-core-note')}
                                        </Text>
                                    )}
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="security">
                                <Stack>
                                    <Select
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.security')}
                                        data={
                                            coreType === 'xray' || editorDraft.protocol === 'vless'
                                                ? ['none', 'tls', 'reality']
                                                : ['none', 'tls']
                                        }
                                        value={editorDraft.security}
                                        onChange={(value) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                security:
                                                    value === 'reality'
                                                        ? 'reality'
                                                        : value === 'tls'
                                                          ? 'tls'
                                                          : 'none'
                                            })
                                        }
                                    />
                                    {editorDraft.protocol === 'shadowsocks' &&
                                        editorDraft.ssMethod.startsWith('2022-') && (
                                            <Stack>
                                                <Ss2022MethodSelect
                                                    value={editorDraft.ssMethod}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(ssMethod) =>
                                                        setEditorDraft({ ...editorDraft, ssMethod })
                                                    }
                                                />
                                                <Alert color="yellow">
                                                    {t('dual-core.cipher-change')}
                                                </Alert>
                                                <PasswordInput
                                                    label={t('dual-core.server-password')}
                                                    value={editorDraft.ssServerPassword}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            ssServerPassword:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <Button
                                                    disabled={
                                                        editorSnippetManaged ||
                                                        editorDraft.ssMethod.includes('chacha20')
                                                    }
                                                    onClick={() =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            ssServerPassword:
                                                                generateSs2022ServerPassword(
                                                                    editorDraft.ssMethod
                                                                )
                                                        })
                                                    }
                                                >
                                                    {t('dual-core.generate-key')}
                                                </Button>
                                                <Select
                                                    label="TCP / UDP"
                                                    value={editorDraft.ssNetwork}
                                                    data={['tcp,udp', 'tcp', 'udp']}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(value) =>
                                                        value &&
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            ssNetwork: value
                                                        })
                                                    }
                                                />
                                                <Text>{t('dual-core.managed-users')}</Text>
                                            </Stack>
                                        )}
                                    {editorDraft.security === 'reality' &&
                                        coreType === 'singbox' && (
                                            <Stack>
                                                <Text>{t('dual-core.flow')}</Text>
                                                <TextInput
                                                    label={t(
                                                        'visual-config-builder.inbound.reality-target'
                                                    )}
                                                    value={editorDraft.realityTarget}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityTarget: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    label="SNI"
                                                    value={editorDraft.realityServerNames[0] ?? ''}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityServerNames: [
                                                                event.currentTarget.value
                                                            ]
                                                        })
                                                    }
                                                />
                                                <PasswordInput
                                                    label={t('dual-core.private-key')}
                                                    value={editorDraft.realityPrivateKey}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityPrivateKey:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    label={t('dual-core.public-key')}
                                                    readOnly
                                                    value={deriveX25519PublicKey(
                                                        editorDraft.realityPrivateKey
                                                    )}
                                                />
                                                <TagsInput
                                                    label="shortId"
                                                    value={editorDraft.realityShortIds}
                                                    disabled={editorSnippetManaged}
                                                    onChange={(value) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityShortIds:
                                                                normalizeTagValues(value)
                                                        })
                                                    }
                                                />
                                            </Stack>
                                        )}
                                    {editorDraft.security === 'reality' && coreType === 'xray' && (
                                        <Stack>
                                            <SimpleGrid cols={2}>
                                                <Checkbox
                                                    checked={editorDraft.realityShow}
                                                    disabled={editorSnippetManaged}
                                                    label="show"
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityShow: event.currentTarget.checked
                                                        })
                                                    }
                                                />
                                                <NumberInput
                                                    disabled={editorSnippetManaged}
                                                    label="xver"
                                                    value={editorDraft.realityXver}
                                                    onChange={(value) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityXver: String(value)
                                                        })
                                                    }
                                                    min={0}
                                                />
                                            </SimpleGrid>
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label={t(
                                                    'visual-config-builder.inbound.reality-target'
                                                )}
                                                value={editorDraft.realityTarget}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        realityTarget: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="SNI / serverNames"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.realityServerNames}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        realityServerNames:
                                                            normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label="privateKey"
                                                type="password"
                                                value={editorDraft.realityPrivateKey}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        realityPrivateKey: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="shortIds"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.realityShortIds}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        realityShortIds: normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                            <SimpleGrid cols={2}>
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label="spiderX"
                                                    value={editorDraft.realitySpiderX}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realitySpiderX:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label="fingerprint / uTLS"
                                                    value={editorDraft.realityFingerprint}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityFingerprint:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <NumberInput
                                                    disabled={editorSnippetManaged}
                                                    label="maxTimeDiff"
                                                    value={editorDraft.realityMaxTimeDiff}
                                                    onChange={(value) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            realityMaxTimeDiff: String(value)
                                                        })
                                                    }
                                                    min={0}
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label={t(
                                                        'visual-config-builder.minimum-client-version'
                                                    )}
                                                    value={editorDraft.minClientVer}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            minClientVer: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label={t(
                                                        'visual-config-builder.inbound.maximum-client-version'
                                                    )}
                                                    value={editorDraft.maxClientVer}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            maxClientVer: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                            </SimpleGrid>
                                        </Stack>
                                    )}
                                    {editorDraft.security === 'tls' && (
                                        <Stack>
                                            <TextInput
                                                disabled={editorSnippetManaged}
                                                label="serverName / SNI"
                                                value={editorDraft.tlsServerName}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        tlsServerName: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="ALPN"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.tlsAlpn}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        tlsAlpn: normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                            {coreType === 'singbox' && (
                                                <Select
                                                    label={t(
                                                        'visual-config-builder.certificate-source'
                                                    )}
                                                    data={[
                                                        {
                                                            value: 'panel',
                                                            label: t(
                                                                'visual-config-builder.panel-certificate'
                                                            )
                                                        },
                                                        {
                                                            value: 'manual',
                                                            label: t(
                                                                'visual-config-builder.custom-certificate'
                                                            )
                                                        }
                                                    ]}
                                                    value={
                                                        isPanelCertificatePair(
                                                            editorDraft.certificateFile,
                                                            editorDraft.keyFile
                                                        )
                                                            ? 'panel'
                                                            : 'manual'
                                                    }
                                                    onChange={(value) => {
                                                        const primaryDomain =
                                                            panelTlsCertificate?.status === 'ready'
                                                                ? (panelTlsCertificate.primaryDomain ??
                                                                  '')
                                                                : ''
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            certificateFile:
                                                                value === 'panel'
                                                                    ? PANEL_CERTIFICATE_URI
                                                                    : '',
                                                            keyFile:
                                                                value === 'panel'
                                                                    ? PANEL_PRIVATE_KEY_URI
                                                                    : '',
                                                            tlsServerName:
                                                                value === 'panel' &&
                                                                !editorDraft.tlsServerName.trim()
                                                                    ? primaryDomain
                                                                    : editorDraft.tlsServerName
                                                        })
                                                    }}
                                                />
                                            )}
                                            <SimpleGrid cols={2}>
                                                {!isPanelCertificatePair(
                                                    editorDraft.certificateFile,
                                                    editorDraft.keyFile
                                                ) && (
                                                    <>
                                                        <TextInput
                                                            disabled={editorSnippetManaged}
                                                            label={t(
                                                                'visual-config-builder.certificate-file'
                                                            )}
                                                            value={editorDraft.certificateFile}
                                                            onChange={(event) =>
                                                                setEditorDraft({
                                                                    ...editorDraft,
                                                                    certificateFile:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                        />
                                                        <TextInput
                                                            disabled={editorSnippetManaged}
                                                            label={t(
                                                                'visual-config-builder.key-file'
                                                            )}
                                                            value={editorDraft.keyFile}
                                                            onChange={(event) =>
                                                                setEditorDraft({
                                                                    ...editorDraft,
                                                                    keyFile:
                                                                        event.currentTarget.value
                                                                })
                                                            }
                                                        />
                                                    </>
                                                )}
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label="minVersion"
                                                    value={editorDraft.tlsMinVersion}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            tlsMinVersion: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label="maxVersion"
                                                    value={editorDraft.tlsMaxVersion}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            tlsMaxVersion: event.currentTarget.value
                                                        })
                                                    }
                                                />
                                                <TextInput
                                                    disabled={editorSnippetManaged}
                                                    label="fingerprint / uTLS"
                                                    value={editorDraft.tlsFingerprint}
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            tlsFingerprint:
                                                                event.currentTarget.value
                                                        })
                                                    }
                                                />
                                            </SimpleGrid>
                                        </Stack>
                                    )}
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="sniffing">
                                <Stack>
                                    <Checkbox
                                        checked={editorDraft.sniffEnabled}
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.inbound.sniff-enabled')}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                sniffEnabled: event.currentTarget.checked
                                            })
                                        }
                                    />
                                    {coreType === 'xray' ? (
                                        <>
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="destOverride"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.sniffDestOverride}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        sniffDestOverride: normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                            <SimpleGrid cols={2}>
                                                <Checkbox
                                                    checked={editorDraft.sniffMetadataOnly}
                                                    disabled={editorSnippetManaged}
                                                    label="metadataOnly"
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            sniffMetadataOnly:
                                                                event.currentTarget.checked
                                                        })
                                                    }
                                                />
                                                <Checkbox
                                                    checked={editorDraft.sniffRouteOnly}
                                                    disabled={editorSnippetManaged}
                                                    label="routeOnly"
                                                    onChange={(event) =>
                                                        setEditorDraft({
                                                            ...editorDraft,
                                                            sniffRouteOnly:
                                                                event.currentTarget.checked
                                                        })
                                                    }
                                                />
                                            </SimpleGrid>
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="domainsExcluded"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.sniffDomainsExcluded}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        sniffDomainsExcluded:
                                                            normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                            <TagsInput
                                                disabled={editorSnippetManaged}
                                                label="ipsExcluded"
                                                splitChars={[',', '\n']}
                                                value={editorDraft.sniffIpsExcluded}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        sniffIpsExcluded: normalizeTagValues(value)
                                                    })
                                                }
                                            />
                                        </>
                                    ) : (
                                        <Checkbox
                                            checked={editorDraft.sniffDestOverride.includes(
                                                'destination'
                                            )}
                                            disabled={editorSnippetManaged}
                                            label="sniff_override_destination"
                                            onChange={(event) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    sniffDestOverride: event.currentTarget.checked
                                                        ? ['destination']
                                                        : []
                                                })
                                            }
                                        />
                                    )}
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="advanced">
                                <Alert
                                    color="yellow"
                                    title={t('visual-config-builder.advanced-detected')}
                                >
                                    {t('visual-config-builder.advanced-preserved-json')}
                                </Alert>
                                <Divider my="sm" />
                                <Text size="sm">
                                    {t('visual-config-builder.unknown-paths')}{' '}
                                    {document.unknownFields
                                        .filter((path) =>
                                            path.startsWith(`inbounds[${editorInbound.index}]`)
                                        )
                                        .join(', ') || t('visual-config-builder.none')}
                                </Text>
                            </Tabs.Panel>
                        </Tabs>
                        {editorReferences.length > 0 && (
                            <Alert
                                color="yellow"
                                title={t('visual-config-builder.referenced-by-routing')}
                            >
                                {editorReferences.map((reference) => (
                                    <Text key={reference.path} size="sm">
                                        {reference.label}
                                    </Text>
                                ))}
                            </Alert>
                        )}
                        <Group justify="flex-end">
                            <Button onClick={() => setEditorOpen(false)} variant="default">
                                {t('visual-config-builder.cancel')}
                            </Button>
                            <Button disabled={editorSnippetManaged} onClick={saveEditor}>
                                {t('visual-config-builder.apply-targeted')}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                centered
                onClose={() => setAddOpen(false)}
                opened={addOpen}
                size="lg"
                title={t('visual-config-builder.add-inbound')}
            >
                <Stack>
                    <Alert color="blue" title={coreType === 'xray' ? 'Xray' : 'sing-box'}>
                        {t('visual-config-builder.inbound.add-description')}
                    </Alert>
                    <Select
                        label={t('visual-config-builder.protocol-template')}
                        data={getPresetOptions(coreType)}
                        value={addDraft.presetId}
                        onChange={(value) => setAddDraft({ ...addDraft, presetId: value ?? '' })}
                    />
                    <TextInput
                        label={t('visual-config-builder.tag-optional')}
                        value={addDraft.tag}
                        onChange={(event) =>
                            setAddDraft({ ...addDraft, tag: event.currentTarget.value })
                        }
                        placeholder={t('visual-config-builder.generated-by-preset')}
                    />
                    <TextInput
                        label={t('visual-config-builder.listen')}
                        value={addDraft.listen}
                        onChange={(event) =>
                            setAddDraft({ ...addDraft, listen: event.currentTarget.value })
                        }
                    />
                    <NumberInput
                        label={t('visual-config-builder.core-port-optional')}
                        value={addDraft.port}
                        onChange={(value) => setAddDraft({ ...addDraft, port: String(value) })}
                        min={1}
                        max={65_535}
                        placeholder={t('visual-config-builder.preset-free-port')}
                    />
                    {addDraft.presetId.includes('shadowsocks-2022') && (
                        <Ss2022MethodSelect
                            value={addDraft.ss2022Method}
                            onChange={(ss2022Method) => setAddDraft({ ...addDraft, ss2022Method })}
                        />
                    )}
                    {addDraft.presetId.includes('vless-reality') && (
                        <SimpleGrid cols={2}>
                            <NumberInput
                                label={t('dual-core.handshake-port')}
                                min={1}
                                max={65535}
                                value={addDraft.targetPort}
                                onChange={(value) =>
                                    setAddDraft({ ...addDraft, targetPort: String(value) })
                                }
                            />
                            <TextInput
                                label={t('visual-config-builder.reality-target-domain')}
                                value={addDraft.targetDomain}
                                onChange={(event) =>
                                    setAddDraft({
                                        ...addDraft,
                                        targetDomain: event.currentTarget.value
                                    })
                                }
                            />
                            <TextInput
                                label={t('visual-config-builder.reality-server-name')}
                                value={addDraft.serverName}
                                onChange={(event) =>
                                    setAddDraft({
                                        ...addDraft,
                                        serverName: event.currentTarget.value
                                    })
                                }
                            />
                            {coreType === 'xray' && (
                                <TextInput
                                    label={t('visual-config-builder.minimum-client-version')}
                                    value={addDraft.minClientVer}
                                    onChange={(event) =>
                                        setAddDraft({
                                            ...addDraft,
                                            minClientVer: event.currentTarget.value
                                        })
                                    }
                                />
                            )}
                        </SimpleGrid>
                    )}
                    {((coreType === 'xray' &&
                        ['trojan-tcp-tls', 'hysteria2'].includes(addDraft.presetId)) ||
                        (coreType === 'singbox' &&
                            ['singbox-hysteria2', 'singbox-anytls'].includes(
                                addDraft.presetId
                            ))) && (
                        <Stack>
                            <TextInput
                                label={t('visual-config-builder.tls-domain')}
                                value={addDraft.tlsDomain}
                                onChange={(event) =>
                                    setAddDraft({
                                        ...addDraft,
                                        tlsDomain: event.currentTarget.value
                                    })
                                }
                            />
                            {coreType === 'singbox' && (
                                <Select
                                    label={t('visual-config-builder.certificate-source')}
                                    data={[
                                        {
                                            value: 'panel',
                                            label: t('visual-config-builder.panel-certificate')
                                        },
                                        {
                                            value: 'manual',
                                            label: t('visual-config-builder.custom-certificate')
                                        }
                                    ]}
                                    value={
                                        isPanelCertificatePair(
                                            addDraft.certificateFile,
                                            addDraft.keyFile
                                        )
                                            ? 'panel'
                                            : 'manual'
                                    }
                                    onChange={(value) => {
                                        const primaryDomain =
                                            panelTlsCertificate?.status === 'ready'
                                                ? (panelTlsCertificate.primaryDomain ?? '')
                                                : ''
                                        setAddDraft({
                                            ...addDraft,
                                            certificateFile:
                                                value === 'panel' ? PANEL_CERTIFICATE_URI : '',
                                            keyFile: value === 'panel' ? PANEL_PRIVATE_KEY_URI : '',
                                            tlsDomain:
                                                value === 'panel' && !addDraft.tlsDomain.trim()
                                                    ? primaryDomain
                                                    : addDraft.tlsDomain
                                        })
                                    }}
                                />
                            )}
                            {!isPanelCertificatePair(
                                addDraft.certificateFile,
                                addDraft.keyFile
                            ) && (
                                <>
                                    <TextInput
                                        label={t('visual-config-builder.certificate-file')}
                                        value={addDraft.certificateFile}
                                        onChange={(event) =>
                                            setAddDraft({
                                                ...addDraft,
                                                certificateFile: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <TextInput
                                        label={t('visual-config-builder.key-file')}
                                        value={addDraft.keyFile}
                                        onChange={(event) =>
                                            setAddDraft({
                                                ...addDraft,
                                                keyFile: event.currentTarget.value
                                            })
                                        }
                                    />
                                </>
                            )}
                        </Stack>
                    )}
                    <Group justify="flex-end">
                        <Button onClick={() => setAddOpen(false)} variant="default">
                            {t('visual-config-builder.cancel')}
                        </Button>
                        <Button onClick={createInbound}>{t('visual-config-builder.create')}</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
