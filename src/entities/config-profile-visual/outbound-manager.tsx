import type { JsonObject, VisualCoreType, VisualDocument, VisualOutbound } from './types.ts'

import {
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Group,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCopy, TbEdit, TbPlus, TbTrash } from 'react-icons/tb'

import {
    applyVisualPatch,
    cloneOutbound,
    createOutboundTemplate,
    getOutboundDisplay,
    getOutboundEndpointPaths,
    getOutboundReferences,
    getOutboundTemplateOptions,
    hasAdvancedOutboundSelectors,
    parseReferencePath,
    validateOutboundCollection,
    type OutboundTemplateId
} from './index.ts'

type OutboundManagerProps = {
    coreType: VisualCoreType
    config: JsonObject
    document: VisualDocument
    onConfigChange: (config: JsonObject, description: string) => void
}

type EditorDraft = { tag: string; server: string; port: string }
type AddDraft = EditorDraft & { templateId: string }

const asString = (value: unknown): string =>
    typeof value === 'number' || typeof value === 'string' ? String(value) : ''

const toPort = (value: string): number | undefined => {
    if (!value.trim()) return undefined
    const port = Number(value)
    return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : undefined
}

const isSnippetManaged = (outbound: VisualOutbound): boolean =>
    typeof outbound.raw.snippet === 'string' && outbound.raw.snippet.length > 0

const nextTag = (base: string, tags: Set<string>): string => {
    let value = `${base}-copy`
    let suffix = 2
    while (tags.has(value)) value = `${base}-copy-${suffix++}`
    return value
}

export function OutboundVisualManager({
    coreType,
    config,
    document,
    onConfigChange
}: OutboundManagerProps) {
    const { t } = useTranslation()
    const outbounds = useMemo(() => document.outboundDetails, [document.outboundDetails])
    const [editorIndex, setEditorIndex] = useState<number | null>(null)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editorDraft, setEditorDraft] = useState<EditorDraft>({ tag: '', server: '', port: '' })
    const [addOpen, setAddOpen] = useState(false)
    const [addDraft, setAddDraft] = useState<AddDraft>({
        templateId: getOutboundTemplateOptions(coreType)[0]?.[0] ?? '',
        tag: '',
        server: '',
        port: ''
    })

    const editorOutbound = editorIndex === null ? undefined : outbounds[editorIndex]
    const editorDisplay = editorOutbound ? getOutboundDisplay(editorOutbound) : undefined
    const editorReferences = editorOutbound ? getOutboundReferences(config, editorOutbound.tag) : []
    const hasAdvancedSelectors = hasAdvancedOutboundSelectors(config)
    const editorSnippetManaged = editorOutbound ? isSnippetManaged(editorOutbound) : false
    const localizeError = (error: string) => {
        if (error === 'Outbound tag is required.')
            return t('visual-config-builder.errors.outbound-tag-required')
        if (error.startsWith('Outbound tag "') && error.endsWith('" is already used.')) {
            return t('visual-config-builder.errors.outbound-tag-used', {
                tag: error.slice(14, -17)
            })
        }
        if (error === 'Outbound port must be between 1 and 65535.') {
            return t('visual-config-builder.errors.outbound-port-range')
        }
        return error
    }

    const openEditor = (outbound: VisualOutbound) => {
        setEditorIndex(outbound.index)
        setEditorDraft({
            tag: outbound.tag,
            server: outbound.server ?? '',
            port: asString(outbound.port)
        })
        setEditorOpen(true)
    }

    const openAdd = () => {
        setAddDraft((current) => ({
            ...current,
            templateId: getOutboundTemplateOptions(coreType)[0]?.[0] ?? '',
            tag: '',
            server: '',
            port: ''
        }))
        setAddOpen(true)
    }

    const duplicateOutbound = (outbound: VisualOutbound) => {
        if (isSnippetManaged(outbound)) return
        const current = Array.isArray(config.outbounds) ? config.outbounds : []
        const copy = cloneOutbound(outbound.raw)
        const tag = nextTag(outbound.tag, new Set(outbounds.map((item) => item.tag)))
        copy.tag = tag
        onConfigChange(
            applyVisualPatch(config, {
                operations: [{ op: 'set', path: ['outbounds'], value: [...current, copy] }]
            }),
            t('visual-config-builder.outbound.duplicated', { from: outbound.tag, to: tag })
        )
    }

    const deleteOutbound = (outbound: VisualOutbound) => {
        if (isSnippetManaged(outbound)) {
            modals.open({
                title: t('visual-config-builder.outbound.snippet-managed'),
                children: t('visual-config-builder.outbound.snippet-readonly'),
                centered: true
            })
            return
        }
        if (hasAdvancedSelectors) {
            modals.open({
                title: t('visual-config-builder.outbound.advanced-selector-title'),
                children: t('visual-config-builder.outbound.advanced-selector-delete'),
                centered: true
            })
            return
        }
        const references = getOutboundReferences(config, outbound.tag)
        if (references.length > 0) {
            modals.open({
                title: t('visual-config-builder.outbound.cannot-delete', { tag: outbound.tag }),
                children: (
                    <Stack gap="xs">
                        <Text>{t('visual-config-builder.referenced-by')}</Text>
                        {references.map((reference) => (
                            <Text key={`${reference.path}-${reference.tag}`} size="sm">
                                • {reference.label} ({reference.kind})
                            </Text>
                        ))}
                    </Stack>
                ),
                centered: true
            })
            return
        }
        modals.openConfirmModal({
            title: t('visual-config-builder.outbound.delete-confirm', { tag: outbound.tag }),
            children: (
                <Stack gap="xs">
                    <Text>{t('visual-config-builder.outbound.delete-description')}</Text>
                    <Text c="orange" size="sm">
                        {t('visual-config-builder.outbound.delete-warning')}
                    </Text>
                </Stack>
            ),
            labels: {
                confirm: t('visual-config-builder.delete'),
                cancel: t('visual-config-builder.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: () =>
                onConfigChange(
                    applyVisualPatch(config, {
                        operations: [{ op: 'remove', path: ['outbounds', outbound.index] }]
                    }),
                    t('visual-config-builder.outbound.deleted', { tag: outbound.tag })
                )
        })
    }

    const saveEditor = () => {
        if (!editorOutbound || editorSnippetManaged) return
        const candidate = cloneOutbound(editorOutbound.raw)
        candidate.tag = editorDraft.tag.trim()
        const endpointPaths = getOutboundEndpointPaths(editorOutbound.raw, coreType)
        const port = editorDraft.port.trim() ? toPort(editorDraft.port) : undefined
        const errors = validateOutboundCollection(
            Array.isArray(config.outbounds) ? config.outbounds : [],
            candidate,
            { ignoreIndex: editorOutbound.index, existingTag: editorOutbound.tag }
        )
        const renaming = editorDraft.tag.trim() !== editorOutbound.tag
        const exactReferences = editorReferences.filter((reference) => reference.kind === 'routing')
        if (renaming && hasAdvancedSelectors) {
            errors.push(t('visual-config-builder.outbound.advanced-selector-rename'))
        }
        if (editorDraft.port.trim() && port === undefined) {
            errors.push(t('visual-config-builder.errors.outbound-port-range'))
        }
        if (errors.length) {
            modals.open({
                title: t('visual-config-builder.outbound.cannot-save'),
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

        const operations: Array<{ op: 'set'; path: Array<string | number>; value: unknown }> = []
        if (editorDraft.tag.trim() !== editorOutbound.tag) {
            operations.push({
                op: 'set',
                path: ['outbounds', editorOutbound.index, 'tag'],
                value: editorDraft.tag.trim()
            })
        }
        if (
            endpointPaths.serverPath &&
            editorDraft.server.trim() !== (editorOutbound.server ?? '')
        ) {
            operations.push({
                op: 'set',
                path: ['outbounds', editorOutbound.index, ...endpointPaths.serverPath],
                value: editorDraft.server.trim()
            })
        }
        if (
            endpointPaths.portPath &&
            port !== undefined &&
            String(port) !== String(editorOutbound.port)
        ) {
            operations.push({
                op: 'set',
                path: ['outbounds', editorOutbound.index, ...endpointPaths.portPath],
                value: port
            })
        }
        const commit = () => {
            const nextOperations = [...operations]
            if (renaming && exactReferences.length > 0) {
                exactReferences.forEach((reference) => {
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
                    renaming && exactReferences.length > 0
                        ? t('visual-config-builder.outbound.renamed', {
                              from: editorOutbound.tag,
                              to: editorDraft.tag.trim(),
                              count: exactReferences.length
                          })
                        : t('visual-config-builder.outbound.edited', { tag: editorOutbound.tag })
                )
            }
            setEditorOpen(false)
        }
        if (renaming && exactReferences.length > 0) {
            modals.openConfirmModal({
                title: t('visual-config-builder.outbound.rename-confirm'),
                children: (
                    <Stack gap="xs">
                        <Text>
                            {editorOutbound.tag} → {editorDraft.tag.trim()}
                        </Text>
                        <Text size="sm">
                            {t('visual-config-builder.outbound.reference-update', {
                                count: exactReferences.length
                            })}
                        </Text>
                        {exactReferences.map((reference) => (
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

    const createOutbound = () => {
        try {
            const tag = addDraft.tag.trim() || `${addDraft.templateId}-outbound`
            const current = Array.isArray(config.outbounds) ? config.outbounds : []
            const next = createOutboundTemplate(
                coreType,
                addDraft.templateId as OutboundTemplateId,
                tag,
                addDraft.server,
                addDraft.port.trim() ? toPort(addDraft.port) : undefined
            )
            const errors = validateOutboundCollection(current, next)
            if (errors.length) throw new Error(errors.join(' '))
            onConfigChange(
                applyVisualPatch(config, {
                    operations: [{ op: 'set', path: ['outbounds'], value: [...current, next] }]
                }),
                t('visual-config-builder.outbound.created', { tag })
            )
            setAddOpen(false)
        } catch (error) {
            modals.open({
                title: t('visual-config-builder.outbound.cannot-create'),
                children:
                    error instanceof Error
                        ? localizeError(error.message)
                        : t('visual-config-builder.invalid-template'),
                centered: true
            })
        }
    }

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">
                        {t('visual-config-builder.outbounds')}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {t('visual-config-builder.outbound.list-description')}
                    </Text>
                </div>
                <Button leftSection={<TbPlus size={16} />} onClick={openAdd} size="sm">
                    {t('visual-config-builder.add-outbound')}
                </Button>
            </Group>
            <Stack>
                {outbounds.map((outbound) => {
                    const display = getOutboundDisplay(outbound)
                    const snippetManaged = isSnippetManaged(outbound)
                    const references = getOutboundReferences(config, outbound.tag)
                    return (
                        <Card key={`${outbound.index}-${outbound.tag}`} withBorder padding="md">
                            <Group justify="space-between" align="flex-start">
                                <div>
                                    <Group gap="xs">
                                        <Text fw={700}>{outbound.tag}</Text>
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
                                        {references.length > 0 && (
                                            <Badge color="yellow">
                                                {t('visual-config-builder.referenced')}
                                            </Badge>
                                        )}
                                    </Group>
                                    <SimpleGrid cols={{ base: 2, sm: 5 }} mt="sm">
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.protocol-type')}</b>
                                            <br />
                                            {display.protocol}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.server')}</b>
                                            <br />
                                            {display.server}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.port')}</b>
                                            <br />
                                            {display.port}
                                        </Text>
                                        <Text size="sm">
                                            <b>{t('visual-config-builder.transport')}</b>
                                            <br />
                                            {display.transport}
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
                                        onClick={() => openEditor(outbound)}
                                        size="xs"
                                        variant="light"
                                    >
                                        {t('visual-config-builder.edit')}
                                    </Button>
                                    <Button
                                        disabled={snippetManaged}
                                        leftSection={<TbCopy size={15} />}
                                        onClick={() => duplicateOutbound(outbound)}
                                        size="xs"
                                        variant="light"
                                    >
                                        {t('visual-config-builder.duplicate')}
                                    </Button>
                                    <Button
                                        color="red"
                                        disabled={snippetManaged}
                                        leftSection={<TbTrash size={15} />}
                                        onClick={() => deleteOutbound(outbound)}
                                        size="xs"
                                        variant="subtle"
                                    >
                                        {t('visual-config-builder.delete')}
                                    </Button>
                                </Group>
                            </Group>
                            {outbound.sensitiveFields.length > 0 && (
                                <Text c="dimmed" mt="sm" size="xs">
                                    {t('visual-config-builder.outbound.sensitive-masked')}
                                </Text>
                            )}
                        </Card>
                    )
                })}
                {outbounds.length === 0 && (
                    <Text c="dimmed">{t('visual-config-builder.outbound.empty')}</Text>
                )}
            </Stack>

            <Modal
                centered
                onClose={() => setEditorOpen(false)}
                opened={editorOpen}
                size="lg"
                title={`${t('visual-config-builder.edit-outbound')}${editorOutbound ? ` · ${editorOutbound.tag}` : ''}`}
            >
                {editorOutbound && (
                    <Stack>
                        {editorSnippetManaged && (
                            <Alert color="orange" title={t('visual-config-builder.read-only')}>
                                {t('visual-config-builder.outbound.snippet-managed-short')}
                            </Alert>
                        )}
                        {(editorReferences.length > 0 || hasAdvancedSelectors) && (
                            <Alert
                                color="yellow"
                                title={t('visual-config-builder.outbound.tag-referenced')}
                            >
                                {t('visual-config-builder.outbound.rename-warning')}
                                {editorReferences.map((reference) => (
                                    <Text key={reference.path} size="sm">
                                        • {reference.label}
                                    </Text>
                                ))}
                            </Alert>
                        )}
                        <Tabs defaultValue="basic">
                            <Tabs.List>
                                <Tabs.Tab value="basic">
                                    {t('visual-config-builder.basic')}
                                </Tabs.Tab>
                                <Tabs.Tab value="server">
                                    {t('visual-config-builder.server')}
                                </Tabs.Tab>
                                <Tabs.Tab value="transport">
                                    {t('visual-config-builder.transport')}
                                </Tabs.Tab>
                                <Tabs.Tab value="advanced">
                                    {t('visual-config-builder.advanced')}
                                </Tabs.Tab>
                            </Tabs.List>
                            <Tabs.Panel pt="md" value="basic">
                                <Stack>
                                    <TextInput
                                        disabled={editorSnippetManaged || hasAdvancedSelectors}
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
                                        label={t('visual-config-builder.protocol-type')}
                                        readOnly
                                        value={editorOutbound.protocol}
                                    />
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="server">
                                <Stack>
                                    <TextInput
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.server-address')}
                                        value={editorDraft.server}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                server: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <NumberInput
                                        disabled={editorSnippetManaged}
                                        label={t('visual-config-builder.port')}
                                        value={editorDraft.port}
                                        onChange={(value) =>
                                            setEditorDraft({ ...editorDraft, port: String(value) })
                                        }
                                        min={1}
                                        max={65_535}
                                    />
                                    <Text c="dimmed" size="xs">
                                        {t('visual-config-builder.outbound.endpoint-json-only')}
                                    </Text>
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="transport">
                                <Text>
                                    {t('visual-config-builder.transport')}:{' '}
                                    {editorDisplay?.transport ?? '—'}
                                </Text>
                                <Text>
                                    {t('visual-config-builder.security')}:{' '}
                                    {editorDisplay?.security ?? '—'}
                                </Text>
                                <Text c="dimmed" mt="xs" size="sm">
                                    {t('visual-config-builder.outbound.transport-json-only')}
                                </Text>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="advanced">
                                <Alert
                                    color="yellow"
                                    title={t('visual-config-builder.advanced-detected')}
                                >
                                    {t('visual-config-builder.outbound.advanced-preserved')}
                                </Alert>
                                <Divider my="sm" />
                                <Text size="sm">
                                    {t('visual-config-builder.unknown-paths')}{' '}
                                    {document.unknownFields
                                        .filter((path) =>
                                            path.startsWith(`outbounds[${editorOutbound.index}]`)
                                        )
                                        .join(', ') || t('visual-config-builder.none')}
                                </Text>
                            </Tabs.Panel>
                        </Tabs>
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
                title={t('visual-config-builder.add-outbound')}
            >
                <Stack>
                    <Alert color="blue" title={coreType === 'xray' ? 'Xray' : 'sing-box'}>
                        {t('visual-config-builder.outbound.add-description')}
                    </Alert>
                    <Select
                        label={t('visual-config-builder.protocol-template')}
                        data={getOutboundTemplateOptions(coreType).map(([value, label]) => ({
                            value,
                            label
                        }))}
                        value={addDraft.templateId}
                        onChange={(value) => setAddDraft({ ...addDraft, templateId: value ?? '' })}
                    />
                    <TextInput
                        label="Tag"
                        value={addDraft.tag}
                        onChange={(event) =>
                            setAddDraft({ ...addDraft, tag: event.currentTarget.value })
                        }
                        placeholder={t('visual-config-builder.generated-from-template')}
                    />
                    {!['freedom', 'blackhole', 'direct', 'block'].includes(addDraft.templateId) && (
                        <SimpleGrid cols={2}>
                            <TextInput
                                label={t('visual-config-builder.server-address')}
                                value={addDraft.server}
                                onChange={(event) =>
                                    setAddDraft({ ...addDraft, server: event.currentTarget.value })
                                }
                            />
                            <NumberInput
                                label={t('visual-config-builder.port')}
                                value={addDraft.port}
                                onChange={(value) =>
                                    setAddDraft({ ...addDraft, port: String(value) })
                                }
                                min={1}
                                max={65_535}
                            />
                        </SimpleGrid>
                    )}
                    <Text c="dimmed" size="xs">
                        {t('visual-config-builder.outbound.credentials-json-only')}
                    </Text>
                    <Group justify="flex-end">
                        <Button onClick={() => setAddOpen(false)} variant="default">
                            {t('visual-config-builder.cancel')}
                        </Button>
                        <Button onClick={createOutbound}>
                            {t('visual-config-builder.create')}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
