import type { InboundEditorDraft } from './inbound-editor.ts'

import { Alert, Button, Checkbox, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbCopy } from 'react-icons/tb'

import { buildMixedShareLink, resolveMixedShareAddress } from './mixed-share-link.ts'

interface Props {
    draft: InboundEditorDraft
    saved: InboundEditorDraft
}

export function MixedShareLinks({ draft, saved }: Props) {
    const { t } = useTranslation()
    const [address, setAddress] = useState('')
    const [publicPort, setPublicPort] = useState<number | string>(Number(saved.port))
    const [acknowledged, setAcknowledged] = useState(false)
    const socks = useClipboard({ timeout: 1500 })
    const http = useClipboard({ timeout: 1500 })

    const unsaved = (['tag', 'listen', 'port', 'auth', 'username', 'password'] as const).some(
        (key) => draft[key] !== saved[key]
    )
    const input = {
        address,
        auth: saved.auth,
        username: saved.username,
        password: saved.password,
        port: Number(publicPort),
        tag: saved.tag
    }
    const linkSocks = buildMixedShareLink({ ...input, protocol: 'socks5' })
    const linkHttp = buildMixedShareLink({ ...input, protocol: 'http' })
    const canCopy = !unsaved && (saved.auth !== 'noauth' || acknowledged)

    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">
                {t('visual-config-builder.inbound.mixed-share-title')}
            </Text>
            <TextInput
                description={t('visual-config-builder.inbound.mixed-share-address-hint')}
                error={
                    address.trim() && !resolveMixedShareAddress(address)
                        ? t('visual-config-builder.inbound.mixed-share-address-error')
                        : undefined
                }
                label={t('visual-config-builder.inbound.mixed-share-address')}
                onChange={(event) => setAddress(event.currentTarget.value)}
                placeholder="proxy.example.com"
                value={address}
            />
            <NumberInput
                description={t('visual-config-builder.inbound.mixed-share-port-hint')}
                label={t('visual-config-builder.inbound.mixed-share-port')}
                max={65_535}
                min={1}
                onChange={setPublicPort}
                value={publicPort}
            />
            {unsaved && (
                <Text c="orange" size="xs">
                    {t('visual-config-builder.inbound.mixed-share-save-first')}
                </Text>
            )}
            {saved.auth === 'noauth' && (
                <Alert
                    color="red"
                    title={t('visual-config-builder.inbound.mixed-share-open-title')}
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            {t('visual-config-builder.inbound.mixed-share-open-warning')}
                        </Text>
                        <Checkbox
                            checked={acknowledged}
                            label={t('visual-config-builder.inbound.mixed-share-open-confirm')}
                            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                        />
                    </Stack>
                </Alert>
            )}
            <Group gap="xs">
                <Button
                    disabled={!canCopy || !linkSocks}
                    leftSection={socks.copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
                    onClick={() => linkSocks && socks.copy(linkSocks)}
                    size="xs"
                    variant="light"
                >
                    {t('visual-config-builder.inbound.mixed-share-copy-socks')}
                </Button>
                <Button
                    disabled={!canCopy || !linkHttp}
                    leftSection={http.copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
                    onClick={() => linkHttp && http.copy(linkHttp)}
                    size="xs"
                    variant="light"
                >
                    {t('visual-config-builder.inbound.mixed-share-copy-http')}
                </Button>
            </Group>
            <Text c="dimmed" size="xs">
                {t('visual-config-builder.inbound.mixed-share-not-subscription')}
            </Text>
        </Stack>
    )
}
