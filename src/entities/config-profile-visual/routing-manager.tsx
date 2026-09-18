import type {
    JsonObject,
    VisualCoreType,
    VisualDocument,
    VisualPatchOperation,
    VisualRoutingRule
} from './types.ts'

import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { move } from '@dnd-kit/helpers'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import {
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Group,
    Modal,
    MultiSelect,
    Select,
    SimpleGrid,
    Stack,
    Tabs,
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
    cloneRoutingRule,
    commonRuleTemplates,
    getRoutingRules,
    getRuleTarget,
    routeFieldPath,
    splitValues,
    type RuleTemplate
} from './index.ts'

type RoutingManagerProps = {
    coreType: VisualCoreType
    config: JsonObject
    document: VisualDocument
    onConfigChange: (config: JsonObject, description: string) => void
}

type RuleDraft = {
    ruleTag: string
    domains: string
    ips: string
    ports: string
    sourcePorts: string
    networks: string[]
    sources: string
    users: string
    inboundTags: string[]
    protocols: string[]
    attrs: string
    targetKind: 'outbound' | 'balancer' | 'none'
    target: string
}

type SortableRule = { id: string; raw: JsonObject; rule: VisualRoutingRule }

const valuesText = (values: string[]) => values.join(', ')
const parseJsonObject = (value: string): JsonObject | undefined => {
    if (!value.trim()) return undefined
    try {
        const parsed: unknown = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as JsonObject)
            : undefined
    } catch {
        return undefined
    }
}

const getDraft = (rule: VisualRoutingRule): RuleDraft => ({
    ruleTag: rule.ruleTag ?? '',
    domains: valuesText(rule.domains),
    ips: valuesText(rule.ips),
    ports: rule.ports ?? '',
    sourcePorts: rule.sourcePorts ?? '',
    networks: rule.networks,
    sources: valuesText(rule.sources),
    users: valuesText(rule.users),
    inboundTags: rule.inboundTags,
    protocols: rule.protocols,
    attrs: rule.attrs ?? '',
    targetKind: rule.targetKind,
    target: getRuleTarget(rule) === '—' ? '' : getRuleTarget(rule)
})

const RuleRow = ({
    item,
    onEdit,
    onDuplicate,
    onDelete,
    outboundLabel
}: {
    item: SortableRule
    onEdit: () => void
    onDuplicate: () => void
    onDelete: () => void
    outboundLabel: string
}) => {
    const { t } = useTranslation()
    const { ref, handleRef, isDragging } = useSortable({ id: item.id, index: item.rule.index })
    const rule = item.rule
    return (
        <Card ref={ref} opacity={isDragging ? 0 : 1} withBorder padding="md">
            <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Group align="flex-start" gap="sm" wrap="nowrap">
                    <Button
                        aria-label={t('visual-config-builder.routing.drag-sort')}
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
                            <Text fw={700}>#{rule.index + 1}</Text>
                            <Text fw={700}>
                                {rule.ruleTag || t('visual-config-builder.routing.unnamed')}
                            </Text>
                            {rule.readOnly && (
                                <Badge color="orange">{t('visual-config-builder.read-only')}</Badge>
                            )}
                        </Group>
                        <Text c="dimmed" mt={4} size="sm">
                            {rule.summary}
                        </Text>
                        <Text c="dimmed" size="xs">
                            {outboundLabel}
                        </Text>
                    </div>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <Button
                        disabled={rule.readOnly}
                        leftSection={<TbEdit size={15} />}
                        onClick={onEdit}
                        size="xs"
                        variant="light"
                    >
                        {t('visual-config-builder.edit')}
                    </Button>
                    <Button
                        disabled={rule.readOnly}
                        leftSection={<TbCopy size={15} />}
                        onClick={onDuplicate}
                        size="xs"
                        variant="light"
                    >
                        {t('visual-config-builder.duplicate')}
                    </Button>
                    <Button
                        color="red"
                        disabled={rule.readOnly}
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

export function RoutingVisualManager({
    coreType,
    config,
    document,
    onConfigChange
}: RoutingManagerProps) {
    const { t } = useTranslation()
    const rules = useMemo(() => document.routingDetails, [document.routingDetails])
    const rawRules = useMemo(() => getRoutingRules(config, coreType), [config, coreType])
    const rows = useMemo<SortableRule[]>(
        () =>
            rules.map((rule) => ({
                id: `${coreType}-route-${rule.index}`,
                raw: rawRules[rule.index] ?? rule.raw,
                rule
            })),
        [coreType, rawRules, rules]
    )
    const [editorIndex, setEditorIndex] = useState<number | null>(null)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editorDraft, setEditorDraft] = useState<RuleDraft | null>(null)
    const [addOpen, setAddOpen] = useState(false)
    const [templateId, setTemplateId] = useState('')
    const [templateTarget, setTemplateTarget] = useState('')

    const inboundTags = document.references.inboundTags
    const outboundTags = document.references.outboundTags
    const balancerTags = document.references.balancerTags
    const editorRule = editorIndex === null ? undefined : rules[editorIndex]
    const templates = commonRuleTemplates(coreType)

    const routeRootKey = coreType === 'singbox' ? 'route' : 'routing'
    const rulesPath = [routeRootKey, 'rules'] as Array<string | number>
    const updateRules = (nextRules: JsonObject[], description: string) => {
        if (Array.isArray((config[routeRootKey] as JsonObject | undefined)?.rules)) {
            onConfigChange(
                applyVisualPatch(config, {
                    operations: [{ op: 'set', path: rulesPath, value: nextRules }]
                }),
                description
            )
            return
        }
        const root = config[routeRootKey]
        const nextRoot =
            root && typeof root === 'object' && !Array.isArray(root)
                ? { ...(root as JsonObject), rules: nextRules }
                : { rules: nextRules }
        onConfigChange({ ...config, [routeRootKey]: nextRoot }, description)
    }

    const openEditor = (rule: VisualRoutingRule) => {
        setEditorIndex(rule.index)
        setEditorDraft(getDraft(rule))
        setEditorOpen(true)
    }

    const openAdd = () => {
        setTemplateId(templates[0]?.id ?? '')
        setTemplateTarget(outboundTags[0] ?? '')
        setAddOpen(true)
    }

    const applyTemplate = (template: RuleTemplate) => {
        const target = templateTarget || outboundTags[0] || ''
        const value: JsonObject = {}
        const field = template.field
        if (coreType === 'singbox') {
            value[field === 'domain' ? 'domain_suffix' : field === 'ip' ? 'ip_cidr' : field] =
                template.values
            value.outbound = target
        } else {
            value[field] = template.values
            value.outboundTag = target
        }
        const nextRules = [...rawRules, value]
        if (coreType === 'singbox' && !target) delete value.outbound
        updateRules(
            nextRules,
            t('visual-config-builder.routing.created', { label: template.label })
        )
        setAddOpen(false)
    }

    const duplicateRule = (rule: VisualRoutingRule) => {
        if (rule.readOnly) return
        const next = rawRules.map((item) => cloneRoutingRule(item))
        next.splice(rule.index + 1, 0, cloneRoutingRule(rule.raw))
        updateRules(next, t('visual-config-builder.routing.duplicated', { index: rule.index + 1 }))
    }

    const deleteRule = (rule: VisualRoutingRule) => {
        if (rule.readOnly) return
        modals.openConfirmModal({
            title: t('visual-config-builder.routing.delete-confirm', { index: rule.index + 1 }),
            children: <Text>{t('visual-config-builder.routing.delete-description')}</Text>,
            labels: {
                confirm: t('visual-config-builder.delete'),
                cancel: t('visual-config-builder.cancel')
            },
            confirmProps: { color: 'red' },
            onConfirm: () =>
                updateRules(
                    rawRules.filter((_, index) => index !== rule.index),
                    t('visual-config-builder.routing.deleted', { index: rule.index + 1 })
                )
        })
    }

    const handleDragEnd = (event: DragEndEvent) => {
        if (event.canceled) return
        if (rows.some((item) => item.rule.readOnly)) {
            modals.open({
                title: t('visual-config-builder.routing.reorder-title'),
                children: t('visual-config-builder.routing.reorder-readonly'),
                centered: true
            })
            return
        }
        const nextRows = move(rows, event)
        updateRules(
            nextRows.map((item) => item.raw),
            t('visual-config-builder.routing.reordered')
        )
    }

    const saveEditor = () => {
        if (!editorRule || !editorDraft) return
        const index = editorRule.index
        const operations: VisualPatchOperation[] = []
        const raw = editorRule.raw
        const setOrRemove = (
            field: Parameters<typeof routeFieldPath>[2],
            value: unknown,
            empty = false,
            original: unknown = raw[routeFieldPath(coreType, index, field).at(-1) as string]
        ) => {
            const path = routeFieldPath(coreType, index, field)
            if (empty) {
                if (original !== undefined) operations.push({ op: 'remove', path })
                return
            }
            if (JSON.stringify(original) !== JSON.stringify(value)) {
                operations.push({ op: 'set', path, value })
            }
        }
        const setList = (
            field: Parameters<typeof routeFieldPath>[2],
            text: string,
            original: unknown
        ) => {
            const values = splitValues(text)
            const serialized = values.length === 1 && !Array.isArray(original) ? values[0] : values
            setOrRemove(field, serialized, values.length === 0, original)
        }
        if (coreType === 'xray' && editorDraft.ruleTag.trim() !== (editorRule.ruleTag ?? '')) {
            setOrRemove('ruleTag', editorDraft.ruleTag.trim(), !editorDraft.ruleTag.trim())
        }
        setList('domain', editorDraft.domains, raw.domain)
        setList('ip', editorDraft.ips, raw.ip)
        setOrRemove('port', editorDraft.ports.trim(), !editorDraft.ports.trim())
        setOrRemove('sourcePort', editorDraft.sourcePorts.trim(), !editorDraft.sourcePorts.trim())
        setList('network', editorDraft.networks.join(', '), raw.network)
        const sourceField =
            coreType === 'singbox'
                ? 'source_ip_cidr'
                : raw.sourceIP !== undefined && raw.source === undefined
                  ? 'sourceIP'
                  : 'source'
        setList(sourceField, editorDraft.sources, raw.source ?? raw.sourceIP ?? raw.source_ip_cidr)
        if (coreType === 'xray') {
            setList('user', editorDraft.users, raw.user)
            setList('protocol', editorDraft.protocols.join(', '), raw.protocol)
            if (editorDraft.attrs.trim()) {
                const attrs = parseJsonObject(editorDraft.attrs)
                if (!attrs) {
                    modals.open({
                        title: t('visual-config-builder.routing.attrs-invalid'),
                        children: t('visual-config-builder.routing.attrs-json'),
                        centered: true
                    })
                    return
                }
                setOrRemove('attrs', attrs)
            } else setOrRemove('attrs', undefined, true)
            setList('inboundTag', editorDraft.inboundTags.join(', '), raw.inboundTag)
        } else {
            setList('protocol', editorDraft.protocols.join(', '), raw.protocol)
            setList('inbound', editorDraft.inboundTags.join(', '), raw.inbound)
        }
        const targetField = coreType === 'singbox' ? 'outbound' : 'outboundTag'
        const balancerField = 'balancerTag' as const
        if (editorDraft.targetKind === 'outbound' && editorDraft.target.trim()) {
            setOrRemove(targetField, editorDraft.target.trim())
            if (coreType === 'xray') setOrRemove(balancerField, undefined, true)
        } else if (
            editorDraft.targetKind === 'balancer' &&
            editorDraft.target.trim() &&
            coreType === 'xray'
        ) {
            setOrRemove(balancerField, editorDraft.target.trim())
            setOrRemove('outboundTag', undefined, true)
        } else {
            setOrRemove(targetField, undefined, true)
            if (coreType === 'xray') setOrRemove(balancerField, undefined, true)
        }
        if (operations.length > 0) {
            onConfigChange(
                applyVisualPatch(config, { operations }),
                t('visual-config-builder.routing.edited', { index: index + 1 })
            )
        }
        setEditorOpen(false)
    }

    const missingInbound =
        editorDraft?.inboundTags.filter((tag) => !inboundTags.includes(tag)) ?? []
    const missingOutbound =
        editorDraft &&
        editorDraft.target &&
        !outboundTags.includes(editorDraft.target) &&
        editorDraft.targetKind === 'outbound'
            ? [editorDraft.target]
            : []
    const inboundOptions = [...new Set([...inboundTags, ...missingInbound])].map((tag) => ({
        value: tag,
        label: inboundTags.includes(tag)
            ? tag
            : t('visual-config-builder.missing-reference', { tag })
    }))
    const outboundOptions = [...new Set([...outboundTags, ...missingOutbound])].map((tag) => ({
        value: tag,
        label: outboundTags.includes(tag)
            ? tag
            : t('visual-config-builder.missing-reference', { tag })
    }))

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">
                        {t('visual-config-builder.routing-rules')}
                    </Text>
                    <Text c="dimmed" size="sm">
                        {t('visual-config-builder.routing.list-description')}
                    </Text>
                </div>
                <Button leftSection={<TbPlus size={16} />} onClick={openAdd} size="sm">
                    {t('visual-config-builder.add-rule')}
                </Button>
            </Group>
            <DragDropProvider modifiers={[RestrictToVerticalAxis]} onDragEnd={handleDragEnd}>
                <Stack>
                    {rows.map((item) => (
                        <RuleRow
                            item={item}
                            key={item.id}
                            onDelete={() => deleteRule(item.rule)}
                            onDuplicate={() => duplicateRule(item.rule)}
                            onEdit={() => openEditor(item.rule)}
                            outboundLabel={getRuleTarget(item.rule)}
                        />
                    ))}
                    {rows.length === 0 && (
                        <Text c="dimmed">{t('visual-config-builder.routing.empty')}</Text>
                    )}
                </Stack>
            </DragDropProvider>

            <Modal
                centered
                onClose={() => setEditorOpen(false)}
                opened={editorOpen}
                size="xl"
                title={`${t('visual-config-builder.edit-rule')}${editorRule ? ` #${editorRule.index + 1}` : ''}`}
            >
                {editorRule && editorDraft && (
                    <Stack>
                        {editorRule.readOnly && (
                            <Alert color="orange" title={t('visual-config-builder.read-only')}>
                                {t('visual-config-builder.routing.snippet-readonly')}
                            </Alert>
                        )}
                        <Tabs defaultValue="basic">
                            <Tabs.List>
                                <Tabs.Tab value="basic">
                                    {t('visual-config-builder.routing.basic')}
                                </Tabs.Tab>
                                <Tabs.Tab value="match">
                                    {t('visual-config-builder.routing.match')}
                                </Tabs.Tab>
                                <Tabs.Tab value="target">
                                    {t('visual-config-builder.routing.target')}
                                </Tabs.Tab>
                                <Tabs.Tab value="advanced">
                                    {t('visual-config-builder.routing.advanced')}
                                </Tabs.Tab>
                            </Tabs.List>
                            <Tabs.Panel pt="md" value="basic">
                                <TextInput
                                    disabled={editorRule.readOnly || coreType === 'singbox'}
                                    label={t('visual-config-builder.routing.rule-name')}
                                    value={editorDraft.ruleTag}
                                    onChange={(event) =>
                                        setEditorDraft({
                                            ...editorDraft,
                                            ruleTag: event.currentTarget.value
                                        })
                                    }
                                    placeholder={t(
                                        'visual-config-builder.routing.rule-tag-placeholder'
                                    )}
                                />
                                <Text c="dimmed" mt="xs" size="xs">
                                    {t('visual-config-builder.routing.private-field-note')}
                                </Text>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="match">
                                <Stack>
                                    <Textarea
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.domain')}
                                        description={t(
                                            'visual-config-builder.routing.multi-value-description'
                                        )}
                                        value={editorDraft.domains}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                domains: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <Textarea
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.ip')}
                                        value={editorDraft.ips}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                ips: event.currentTarget.value
                                            })
                                        }
                                    />
                                    <SimpleGrid cols={2}>
                                        <TextInput
                                            disabled={editorRule.readOnly}
                                            label={t('visual-config-builder.port')}
                                            value={editorDraft.ports}
                                            onChange={(event) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    ports: event.currentTarget.value
                                                })
                                            }
                                            placeholder="80,443,8000-9000"
                                        />
                                        <TextInput
                                            disabled={editorRule.readOnly}
                                            label={t('visual-config-builder.routing.source-port')}
                                            value={editorDraft.sourcePorts}
                                            onChange={(event) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    sourcePorts: event.currentTarget.value
                                                })
                                            }
                                        />
                                    </SimpleGrid>
                                    <MultiSelect
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.network')}
                                        data={['tcp', 'udp'].map((value) => ({
                                            value,
                                            label: value
                                        }))}
                                        value={editorDraft.networks}
                                        onChange={(value) =>
                                            setEditorDraft({ ...editorDraft, networks: value })
                                        }
                                    />
                                    <MultiSelect
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.inbounds')}
                                        data={inboundOptions}
                                        value={editorDraft.inboundTags}
                                        onChange={(value) =>
                                            setEditorDraft({ ...editorDraft, inboundTags: value })
                                        }
                                    />
                                    <MultiSelect
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.protocol')}
                                        data={['http', 'tls', 'bittorrent'].map((value) => ({
                                            value,
                                            label: value
                                        }))}
                                        value={editorDraft.protocols}
                                        onChange={(value) =>
                                            setEditorDraft({ ...editorDraft, protocols: value })
                                        }
                                    />
                                    {coreType === 'xray' && (
                                        <>
                                            <Textarea
                                                disabled={editorRule.readOnly}
                                                label={t(
                                                    'visual-config-builder.routing.source-address'
                                                )}
                                                value={editorDraft.sources}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        sources: event.currentTarget.value
                                                    })
                                                }
                                            />
                                            <Textarea
                                                disabled={editorRule.readOnly}
                                                label={t('visual-config-builder.routing.user')}
                                                value={editorDraft.users}
                                                onChange={(event) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        users: event.currentTarget.value
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="target">
                                <Stack>
                                    <Select
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.target-type')}
                                        data={
                                            coreType === 'xray'
                                                ? [
                                                      {
                                                          value: 'outbound',
                                                          label: t(
                                                              'visual-config-builder.outbounds'
                                                          )
                                                      },
                                                      {
                                                          value: 'balancer',
                                                          label: t(
                                                              'visual-config-builder.routing.balancer-label'
                                                          )
                                                      },
                                                      {
                                                          value: 'none',
                                                          label: t(
                                                              'visual-config-builder.routing.none'
                                                          )
                                                      }
                                                  ]
                                                : [
                                                      {
                                                          value: 'outbound',
                                                          label: t(
                                                              'visual-config-builder.outbounds'
                                                          )
                                                      },
                                                      {
                                                          value: 'none',
                                                          label: t(
                                                              'visual-config-builder.routing.none'
                                                          )
                                                      }
                                                  ]
                                        }
                                        value={editorDraft.targetKind}
                                        onChange={(value) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                targetKind:
                                                    (value as RuleDraft['targetKind']) ?? 'none',
                                                target: ''
                                            })
                                        }
                                    />
                                    {editorDraft.targetKind === 'outbound' && (
                                        <Select
                                            disabled={editorRule.readOnly}
                                            label={t('visual-config-builder.routing.outbound')}
                                            data={outboundOptions}
                                            value={editorDraft.target}
                                            onChange={(value) =>
                                                setEditorDraft({
                                                    ...editorDraft,
                                                    target: value ?? ''
                                                })
                                            }
                                            searchable
                                        />
                                    )}
                                    {editorDraft.targetKind === 'balancer' &&
                                        coreType === 'xray' && (
                                            <Select
                                                disabled={editorRule.readOnly}
                                                label={t('visual-config-builder.routing.balancer')}
                                                data={balancerTags.map((tag) => ({
                                                    value: tag,
                                                    label: tag
                                                }))}
                                                value={editorDraft.target}
                                                onChange={(value) =>
                                                    setEditorDraft({
                                                        ...editorDraft,
                                                        target: value ?? ''
                                                    })
                                                }
                                            />
                                        )}
                                    <Text c="dimmed" size="xs">
                                        {t('visual-config-builder.routing.target-mutual-exclusive')}
                                    </Text>
                                </Stack>
                            </Tabs.Panel>
                            <Tabs.Panel pt="md" value="advanced">
                                <Alert
                                    color="yellow"
                                    title={t('visual-config-builder.advanced-preserved')}
                                >
                                    {t('visual-config-builder.routing.advanced-preserved')}
                                </Alert>
                                {coreType === 'xray' && (
                                    <Textarea
                                        disabled={editorRule.readOnly}
                                        label={t('visual-config-builder.routing.attrs-json-label')}
                                        value={editorDraft.attrs}
                                        onChange={(event) =>
                                            setEditorDraft({
                                                ...editorDraft,
                                                attrs: event.currentTarget.value
                                            })
                                        }
                                        placeholder={t(
                                            'visual-config-builder.routing.attrs-empty-placeholder'
                                        )}
                                    />
                                )}
                            </Tabs.Panel>
                        </Tabs>
                        <Group justify="flex-end">
                            <Button onClick={() => setEditorOpen(false)} variant="default">
                                {t('visual-config-builder.cancel')}
                            </Button>
                            <Button disabled={editorRule.readOnly} onClick={saveEditor}>
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
                title={t('visual-config-builder.add-rule')}
            >
                <Stack>
                    <Alert color="blue">{t('visual-config-builder.routing.add-description')}</Alert>
                    <Select
                        label={t('visual-config-builder.routing.common-template')}
                        data={templates.map((template) => ({
                            value: template.id,
                            label: template.label
                        }))}
                        value={templateId}
                        onChange={(value) => setTemplateId(value ?? '')}
                    />
                    <Select
                        label={t('visual-config-builder.routing.optional-outbound')}
                        data={outboundTags.map((tag) => ({ value: tag, label: tag }))}
                        value={templateTarget}
                        onChange={(value) => setTemplateTarget(value ?? '')}
                        searchable
                    />
                    <Divider />
                    <Text size="sm">{t('visual-config-builder.routing.add-to-end')}</Text>
                    <Group justify="flex-end">
                        <Button onClick={() => setAddOpen(false)} variant="default">
                            {t('visual-config-builder.cancel')}
                        </Button>
                        <Button
                            disabled={!templateId}
                            onClick={() => {
                                const template = templates.find((item) => item.id === templateId)
                                if (template) applyTemplate(template)
                            }}
                        >
                            {t('visual-config-builder.add')}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
