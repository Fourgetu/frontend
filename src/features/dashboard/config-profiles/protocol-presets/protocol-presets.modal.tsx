import {
    Alert,
    Badge,
    Button,
    Card,
    Code,
    Divider,
    Group,
    ScrollArea,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { t } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle, TbBolt, TbCertificate, TbWorld } from 'react-icons/tb'

import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import {
    appendProtocolPresets,
    AppendProtocolPresetsResult,
    DEFAULT_REALITY_TARGET_DOMAIN,
    DEFAULT_REALITY_TARGET_PORT,
    getRecommendedPresetIds,
    PROTOCOL_PRESETS,
    ProtocolPresetId,
    RealityPresetOptions,
    TlsPresetOptions,
    validateRealityPresetOptions,
    validateTlsPresetOptions
} from './model/protocol-presets'
import {
    applyRealityCompatibilityToConfig,
    getRealityMinClientVersion,
    REALITY_CLIENT_COMPATIBILITY,
    REALITY_MIN_CLIENT_VERSION_COMPAT
} from './model/reality-compatibility.ts'

const MODAL_ID = 'config-profile-protocol-presets'

const DESCRIPTION_KEYS = {
    'vless-reality-vision': 'protocol-presets.description.vless-reality-vision',
    'vless-reality-grpc': 'protocol-presets.description.vless-reality-grpc',
    'trojan-tcp-tls': 'protocol-presets.description.trojan-tcp-tls',
    'vmess-ws-tls': 'protocol-presets.description.vmess-ws-tls',
    hysteria2: 'protocol-presets.description.hysteria2',
    mixed: 'protocol-presets.description.mixed'
} as const

interface Props {
    currentConfig: Record<string, unknown>
    onConfirm: (config: Record<string, unknown>, addedCount: number) => void
}

const resolveServerName = (result: AppendProtocolPresetsResult, index: number): string => {
    const stream = result.added[index].inbound.streamSettings
    const reality = stream.realitySettings as { serverNames?: string[] } | undefined
    const tls = stream.tlsSettings as { serverName?: string } | undefined
    return reality?.serverNames?.[0] ?? tls?.serverName ?? '—'
}

const resolveRealityTarget = (result: AppendProtocolPresetsResult, index: number): string => {
    const stream = result.added[index].inbound.streamSettings
    const reality = stream.realitySettings as { target?: string } | undefined
    return reality?.target ?? '—'
}

const getExistingRealityInbounds = (config: Record<string, unknown>) => {
    if (!Array.isArray(config.inbounds)) return []

    return config.inbounds.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const inbound = value as Record<string, unknown>
        const streamSettings = inbound.streamSettings
        if (
            !streamSettings ||
            typeof streamSettings !== 'object' ||
            Array.isArray(streamSettings) ||
            (streamSettings as Record<string, unknown>).security !== 'reality'
        ) {
            return []
        }
        return [
            {
                minClientVer: getRealityMinClientVersion(streamSettings as Record<string, unknown>),
                tag: typeof inbound.tag === 'string' ? inbound.tag : 'Reality inbound'
            }
        ]
    })
}

export const ProtocolPresetsModal = ({ currentConfig, onConfirm }: Props) => {
    const { t } = useTranslation()
    const [tls, setTls] = useState<TlsPresetOptions>({
        domain: '',
        certificateFile: '/var/lib/remnawave/configs/xray/ssl/fullchain.pem',
        keyFile: '/var/lib/remnawave/configs/xray/ssl/privkey.key'
    })
    const [realityMinClientVer, setRealityMinClientVer] = useState<string>(
        REALITY_MIN_CLIENT_VERSION_COMPAT
    )
    const [reality, setReality] = useState<RealityPresetOptions>({
        targetDomain: DEFAULT_REALITY_TARGET_DOMAIN,
        targetPort: DEFAULT_REALITY_TARGET_PORT,
        serverName: DEFAULT_REALITY_TARGET_DOMAIN
    })
    const [invalidFields, setInvalidFields] = useState<string[]>([])
    const [preview, setPreview] = useState<AppendProtocolPresetsResult | null>(null)
    const existingRealityInbounds = getExistingRealityInbounds(currentConfig)
    const realityWithoutExplicitVersion = existingRealityInbounds.filter(
        (inbound) => !inbound.minClientVer
    )

    const applyCompatibilitySetting = () => {
        const updatedConfig = applyRealityCompatibilityToConfig(
            currentConfig,
            REALITY_MIN_CLIENT_VERSION_COMPAT,
            new Set(realityWithoutExplicitVersion.map((inbound) => inbound.tag))
        )
        onConfirm(updatedConfig, 0)
        modals.close(MODAL_ID)
    }

    const updateTlsField = (field: keyof TlsPresetOptions, value: string) => {
        setTls((current) => ({ ...current, [field]: value }))
        setInvalidFields((current) => current.filter((item) => item !== field))
        setPreview(null)
    }

    const updateRealityField = (field: keyof RealityPresetOptions, value: string) => {
        setReality((current) => ({
            ...current,
            [field]: value,
            ...(field === 'targetDomain' && current.serverName === current.targetDomain
                ? { serverName: value }
                : {})
        }))
        setInvalidFields((current) => current.filter((item) => item !== field))
        setPreview(null)
    }

    const buildPreview = (presetIds: ProtocolPresetId[]) => {
        const needsTls = presetIds.some(
            (id) => PROTOCOL_PRESETS.find((preset) => preset.id === id)?.needsCertificate
        )

        const needsReality = presetIds.some(
            (id) => PROTOCOL_PRESETS.find((preset) => preset.id === id)?.security === 'Reality'
        )
        const invalid = [
            ...(needsTls ? validateTlsPresetOptions(tls) : []),
            ...(needsReality ? validateRealityPresetOptions(reality) : [])
        ]
        setInvalidFields(invalid)
        if (invalid.length > 0) return

        try {
            setPreview(
                appendProtocolPresets(currentConfig, presetIds, {
                    reality: needsReality
                        ? {
                              ...reality,
                              minClientVer: realityMinClientVer
                          }
                        : undefined,
                    tls
                })
            )
        } catch (error) {
            notifications.show({
                color: 'red',
                title: t('common.message.error'),
                message:
                    error instanceof Error ? error.message : t('protocol-presets.generation-failed')
            })
        }
    }

    const confirmPreview = () => {
        if (!preview) return
        onConfirm(preview.config, preview.added.length)
        modals.close(MODAL_ID)
    }

    return (
        <Stack gap="lg">
            <Text c="dimmed" size="sm">
                {t('protocol-presets.intro')}
            </Text>

            <Alert color="yellow" icon={<TbAlertTriangle size={18} />} variant="light">
                {t('protocol-presets.vmess-compatibility')}
            </Alert>

            {realityWithoutExplicitVersion.length > 0 && (
                <Alert color="orange" icon={<TbAlertTriangle size={18} />} variant="light">
                    <Stack gap="xs">
                        <Text size="sm">
                            {t('protocol-presets.reality-missing-version-warning')}
                        </Text>
                        <Text c="dimmed" size="xs">
                            {realityWithoutExplicitVersion.map((inbound) => inbound.tag).join(', ')}
                        </Text>
                        <Button onClick={applyCompatibilitySetting} size="xs" variant="light">
                            {t('protocol-presets.apply-compatibility-setting')}
                        </Button>
                    </Stack>
                </Alert>
            )}

            <Stack gap="sm">
                <Group justify="space-between">
                    <Text fw={600}>{t('protocol-presets.reality-settings')}</Text>
                    <Text c="dimmed" size="xs">
                        {t('protocol-presets.reality-settings-help')}
                    </Text>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <TextInput
                        error={
                            invalidFields.includes('targetDomain')
                                ? t('protocol-presets.invalid-domain')
                                : undefined
                        }
                        label={t('protocol-presets.reality-target-domain')}
                        onChange={(event) =>
                            updateRealityField('targetDomain', event.currentTarget.value)
                        }
                        value={reality.targetDomain}
                    />
                    <TextInput
                        error={
                            invalidFields.includes('targetPort')
                                ? t('protocol-presets.invalid-port')
                                : undefined
                        }
                        inputMode="numeric"
                        label={t('protocol-presets.reality-target-port')}
                        onChange={(event) =>
                            updateRealityField('targetPort', event.currentTarget.value)
                        }
                        value={reality.targetPort}
                    />
                    <TextInput
                        error={
                            invalidFields.includes('serverName')
                                ? t('protocol-presets.invalid-domain')
                                : undefined
                        }
                        label={t('protocol-presets.server-name')}
                        onChange={(event) =>
                            updateRealityField('serverName', event.currentTarget.value)
                        }
                        value={reality.serverName}
                    />
                </SimpleGrid>
                <Select
                    data={[
                        {
                            label: `${t('protocol-presets.compatibility-compatible')} (${REALITY_CLIENT_COMPATIBILITY.compatible})`,
                            value: REALITY_CLIENT_COMPATIBILITY.compatible
                        },
                        {
                            label: `${t('protocol-presets.compatibility-mihomo')} (${REALITY_CLIENT_COMPATIBILITY.mihomo})`,
                            value: REALITY_CLIENT_COMPATIBILITY.mihomo
                        },
                        {
                            label: `${t('protocol-presets.compatibility-xray')} (${REALITY_CLIENT_COMPATIBILITY.xray})`,
                            value: REALITY_CLIENT_COMPATIBILITY.xray
                        },
                        {
                            label: `${t('protocol-presets.compatibility-unrestricted')} (${REALITY_CLIENT_COMPATIBILITY.unrestricted})`,
                            value: REALITY_CLIENT_COMPATIBILITY.unrestricted
                        }
                    ]}
                    description={t('protocol-presets.reality-compatibility-help')}
                    label={t('protocol-presets.reality-min-client-version')}
                    onChange={(value) => value && setRealityMinClientVer(value)}
                    value={realityMinClientVer}
                />
                {realityMinClientVer === REALITY_CLIENT_COMPATIBILITY.mihomo && (
                    <Alert color="yellow" icon={<TbAlertTriangle size={18} />}>
                        {t('protocol-presets.reality-warning-mihomo')}
                    </Alert>
                )}
                {realityMinClientVer === REALITY_CLIENT_COMPATIBILITY.xray && (
                    <Alert color="red" icon={<TbAlertTriangle size={18} />}>
                        {t('protocol-presets.reality-warning-xray')}
                    </Alert>
                )}
                {realityMinClientVer === REALITY_CLIENT_COMPATIBILITY.unrestricted && (
                    <Alert color="orange" icon={<TbAlertTriangle size={18} />}>
                        {t('protocol-presets.reality-warning-unrestricted')}
                    </Alert>
                )}
                <Group justify="space-between">
                    <Text fw={600}>{t('protocol-presets.tls-settings')}</Text>
                    <Text c="dimmed" size="xs">
                        {t('protocol-presets.tls-settings-help')}
                    </Text>
                </Group>
                <TextInput
                    error={
                        invalidFields.includes('domain')
                            ? t('protocol-presets.invalid-domain')
                            : undefined
                    }
                    label={t('protocol-presets.domain')}
                    onChange={(event) => updateTlsField('domain', event.currentTarget.value)}
                    placeholder="node.example.com"
                    value={tls.domain}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                        error={
                            invalidFields.includes('certificateFile')
                                ? t('protocol-presets.required-field')
                                : undefined
                        }
                        label={t('protocol-presets.certificate-file')}
                        onChange={(event) =>
                            updateTlsField('certificateFile', event.currentTarget.value)
                        }
                        value={tls.certificateFile}
                    />
                    <TextInput
                        error={
                            invalidFields.includes('keyFile')
                                ? t('protocol-presets.required-field')
                                : undefined
                        }
                        label={t('protocol-presets.key-file')}
                        onChange={(event) => updateTlsField('keyFile', event.currentTarget.value)}
                        value={tls.keyFile}
                    />
                </SimpleGrid>
            </Stack>

            <Group justify="space-between">
                <Text fw={600}>{t('protocol-presets.available-presets')}</Text>
                <Button
                    leftSection={<TbBolt size={16} />}
                    onClick={() => buildPreview(getRecommendedPresetIds())}
                    variant="light"
                >
                    {t('protocol-presets.add-all-recommended')}
                </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {PROTOCOL_PRESETS.map((preset) => (
                    <Card key={preset.id} padding="md" radius="md" withBorder>
                        <Stack gap="sm" h="100%">
                            <Group gap="xs" justify="space-between" wrap="nowrap">
                                <Text fw={600}>{preset.title}</Text>
                                {preset.recommended && (
                                    <Badge color="teal" size="sm" variant="light">
                                        {t('protocol-presets.recommended')}
                                    </Badge>
                                )}
                                {!preset.supported && (
                                    <Badge color="gray" size="sm" variant="light">
                                        {t('protocol-presets.unsupported')}
                                    </Badge>
                                )}
                            </Group>

                            <Group gap="xs">
                                <Badge variant="outline">{preset.transport}</Badge>
                                <Badge color={preset.security === 'TLS' ? 'blue' : 'grape'}>
                                    {preset.security}
                                </Badge>
                            </Group>

                            <Group gap="md">
                                <Group gap={4}>
                                    <TbWorld size={14} />
                                    <Text size="xs">
                                        {preset.needsDomain
                                            ? t('protocol-presets.needs-domain')
                                            : t('protocol-presets.no-domain-required')}
                                    </Text>
                                </Group>
                                <Group gap={4}>
                                    <TbCertificate size={14} />
                                    <Text size="xs">
                                        {preset.needsCertificate
                                            ? t('protocol-presets.needs-certificate')
                                            : t('protocol-presets.no-certificate-required')}
                                    </Text>
                                </Group>
                            </Group>

                            <Text c="dimmed" size="sm">
                                {t(DESCRIPTION_KEYS[preset.id])}
                            </Text>

                            <Button
                                disabled={!preset.supported}
                                mt="auto"
                                onClick={() => buildPreview([preset.id])}
                                variant="soft"
                            >
                                {t('protocol-presets.preview-this-preset')}
                            </Button>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>

            {preview && (
                <>
                    <Divider />
                    <Stack gap="sm">
                        <Group justify="space-between">
                            <Text fw={600}>{t('protocol-presets.configuration-preview')}</Text>
                            <Badge color="teal" variant="light">
                                {t('protocol-presets.will-add-count', {
                                    count: preview.added.length
                                })}
                            </Badge>
                        </Group>
                        <ScrollArea>
                            <Table striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t('protocol-presets.protocol')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.tag')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.port')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.reality-target')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.server-name')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.transport')}</Table.Th>
                                        <Table.Th>{t('protocol-presets.security')}</Table.Th>
                                        <Table.Th>
                                            {t('protocol-presets.reality-min-client-version')}
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {preview.added.map(({ inbound, preset }, index) => (
                                        <Table.Tr key={inbound.tag}>
                                            <Table.Td>{preset.title}</Table.Td>
                                            <Table.Td>
                                                <Code>{inbound.tag}</Code>
                                            </Table.Td>
                                            <Table.Td>{inbound.port}</Table.Td>
                                            <Table.Td>
                                                {preset.security === 'Reality'
                                                    ? resolveRealityTarget(preview, index)
                                                    : '—'}
                                            </Table.Td>
                                            <Table.Td>{resolveServerName(preview, index)}</Table.Td>
                                            <Table.Td>{preset.transport}</Table.Td>
                                            <Table.Td>{preset.security}</Table.Td>
                                            <Table.Td>
                                                {preset.security === 'Reality'
                                                    ? ((
                                                          preview.added[index].inbound
                                                              .streamSettings.realitySettings as {
                                                              minClientVer?: string
                                                          }
                                                      )?.minClientVer ?? '—')
                                                    : '—'}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Stack>
                </>
            )}

            <Group justify="flex-end">
                <Button onClick={() => modals.close(MODAL_ID)} variant="default">
                    {t('common.action.cancel')}
                </Button>
                <Button disabled={!preview} onClick={confirmPreview}>
                    {t('protocol-presets.confirm-add')}
                </Button>
            </Group>
        </Stack>
    )
}

export const openProtocolPresetsModal = (props: Props) => {
    modals.open({
        modalId: MODAL_ID,
        size: 'xl',
        title: (
            <BaseOverlayHeader
                iconColor="teal"
                IconComponent={TbBolt}
                iconVariant="soft"
                title={t('protocol-presets.title')}
            />
        ),
        children: <ProtocolPresetsModal {...props} />
    })
}
