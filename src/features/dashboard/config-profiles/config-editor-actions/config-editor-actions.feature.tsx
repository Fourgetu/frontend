import { ActionIcon, Button, CopyButton, Group, Menu, Text } from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { KeypairGeneratorWidget } from '@widgets/dashboard/config-profiles/keypair-generator/keypair-generator.widget'
import consola from 'consola/browser'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCheck, PiCheckSquareOffset, PiCopy, PiFloppyDisk } from 'react-icons/pi'
import {
    TbBolt,
    TbClipboardCopy,
    TbClipboardText,
    TbCut,
    TbDownload,
    TbMenuDeep,
    TbSelectAll,
    TbTools
} from 'react-icons/tb'

import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateConfigProfile } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { useDownloadTemplate } from '@shared/ui/load-templates/use-download-template'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

import { preserveKnownCoreType } from '../config-validation/core-validation.ts'
import { validateVisualSave } from '../config-validation/visual-draft.ts'
import { openProtocolPresetsModal } from '../protocol-presets'
import classes from './config-editor-actions.module.css'
import { Props } from './interfaces'

export function ConfigEditorActionsFeature(props: Props) {
    const {
        editorRef,
        isConfigValid,
        setResult,
        setIsConfigValid,
        configProfile,
        coreType,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        setOriginalValue
    } = props
    const { t } = useTranslation()

    const isMobile = useIsMobile()
    const clipboard = useClipboard({ timeout: 500 })

    const [opened, handlers] = useDisclosure(false)
    const saveInFlight = useRef(false)
    const [isValidating, setIsValidating] = useState(false)

    const { mutateAsync: updateConfig, isPending: isUpdating } = useUpdateConfigProfile({
        mutationFns: {
            onSuccess: async (updatedConfigProfile) => {
                const cachedConfigProfile = preserveKnownCoreType(coreType, updatedConfigProfile)

                setIsConfigValid(true)

                const newValue = JSON.stringify(cachedConfigProfile.config, null, 2)

                if (editorRef.current) {
                    const instance = editorRef.current

                    if (instance.getValue() !== newValue) {
                        const viewState = instance.saveViewState()

                        instance.setValue(newValue)
                        instance.restoreViewState(viewState)
                    }
                }
                setOriginalValue(newValue)
                props.onSaved?.(newValue)
                setHasUnsavedChanges(false)

                await queryClient.setQueryData(
                    QueryKeys.configProfiles.getConfigProfile({
                        uuid: configProfile.uuid
                    }).queryKey,
                    cachedConfigProfile
                )

                await Promise.all([
                    queryClient.refetchQueries({
                        queryKey: QueryKeys.configProfiles.getConfigProfiles.queryKey
                    }),
                    queryClient.refetchQueries({
                        queryKey: QueryKeys.configProfiles.getConfigProfile({
                            uuid: configProfile.uuid
                        }).queryKey
                    })
                ])
            },
            onError: (error) => {
                setIsConfigValid(false)
                setResult(error.message)
            }
        }
    })

    const { openDownloadModal } = useDownloadTemplate({
        editorType: 'XRAY_CORE',
        templateType: 'XRAY_JSON',
        editorRef
    })

    const handleSave = async () => {
        if (saveInFlight.current || props.saveDisabled) return
        const currentValue = props.getSaveValue?.() ?? editorRef.current?.getValue()
        if (!currentValue) return
        try {
            JSON.parse(currentValue)
        } catch (error) {
            consola.error(error)
            notifications.show({
                color: 'red',
                message: t('config-editor-actions.feature.failed-to-save-invalid-json'),
                title: t('common.message.error')
            })
            return
        }

        saveInFlight.current = true
        setIsValidating(true)
        props.onSavingChange?.(true)
        try {
            const save = (config: Record<string, unknown>) =>
                updateConfig({ variables: { uuid: configProfile.uuid, config } })
            if (props.validateBeforeSave) {
                const saved = await validateVisualSave(currentValue, props.validateBeforeSave, save)
                if (!saved) {
                    notifications.show({
                        color: 'red',
                        title: t('common.message.error'),
                        message: t('visual-config-builder.save-validation-failed')
                    })
                }
            } else {
                await save(JSON.parse(currentValue))
            }
        } catch {
            // The mutation already reports API failures. Validation errors remain visible
            // in the graphical status area; do not clear or replace the unsaved draft.
        } finally {
            saveInFlight.current = false
            setIsValidating(false)
            props.onSavingChange?.(false)
        }
    }

    const handleCopyConfig = () => {
        if (!editorRef.current) return

        const currentValue = editorRef.current.getValue()
        clipboard.copy(currentValue)
    }

    const handleSelectAll = () => {
        if (!editorRef.current) return

        const model = editorRef.current.getModel()
        if (!model) return

        editorRef.current.setSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: model.getLineCount(),
            endColumn: model.getLineMaxColumn(model.getLineCount())
        })
    }

    const handleCut = () => {
        if (!editorRef.current) return

        const selection = editorRef.current.getSelection()
        const model = editorRef.current.getModel()
        if (!selection || !model) return

        const selectedText = model.getValueInRange(selection)
        clipboard.copy(selectedText)

        editorRef.current.executeEdits('', [{ range: selection, text: '' }])
    }

    const handlePaste = () => {
        if (!editorRef.current) return

        const position = editorRef.current.getPosition()
        if (!position) return

        navigator.clipboard.readText().then((text) => {
            if (!editorRef.current) return
            editorRef.current.executeEdits('', [
                {
                    range: {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    },
                    text
                }
            ])
        })
    }

    const formatDocument = () => {
        if (!editorRef.current) return

        editorRef.current.getAction('editor.action.formatDocument')?.run()
    }

    const openProtocolPresets = () => {
        if (!editorRef.current) return

        let currentConfig: unknown
        try {
            currentConfig = JSON.parse(editorRef.current.getValue())
        } catch {
            notifications.show({
                color: 'red',
                title: t('common.message.error'),
                message: t('protocol-presets.invalid-current-config')
            })
            return
        }

        if (!currentConfig || typeof currentConfig !== 'object' || Array.isArray(currentConfig)) {
            notifications.show({
                color: 'red',
                title: t('common.message.error'),
                message: t('protocol-presets.invalid-current-config')
            })
            return
        }

        openProtocolPresetsModal({
            currentConfig: currentConfig as Record<string, unknown>,
            onConfirm: (nextConfig, addedCount) => {
                if (!editorRef.current) return

                const nextValue = JSON.stringify(nextConfig, null, 2)
                editorRef.current.setValue(nextValue)
                setHasUnsavedChanges(nextValue !== props.originalValue)

                notifications.show({
                    color: 'teal',
                    title: t('protocol-presets.generation-successful'),
                    message:
                        addedCount > 0
                            ? t('protocol-presets.added-count', { count: addedCount })
                            : t('protocol-presets.compatibility-updated')
                })
            }
        })
    }

    if (props.saveOnly) {
        return (
            <Button
                disabled={props.saveDisabled || !hasUnsavedChanges}
                leftSection={<PiFloppyDisk size={16} />}
                loading={isUpdating || isValidating}
                onClick={() => void handleSave()}
                variant="filled"
            >
                {t('common.action.save')}
            </Button>
        )
    }

    return (
        <Group grow={isMobile} preventGrowOverflow={false} wrap="wrap">
            <Button
                color={!hasUnsavedChanges ? 'gray' : 'teal'}
                disabled={!isConfigValid && !hasUnsavedChanges}
                leftSection={<PiFloppyDisk size={16} />}
                loading={isUpdating || isValidating}
                onClick={() => void handleSave()}
                variant="soft"
            >
                {t('common.action.save')}
            </Button>

            <Button
                leftSection={<TbBolt size={16} />}
                onClick={openProtocolPresets}
                variant="light"
            >
                {t('protocol-presets.quick-add')}
            </Button>

            {!isConfigValid && !isUpdating && (
                <Button
                    color="red"
                    disabled={isConfigValid || isUpdating}
                    leftSection={<PiFloppyDisk size={16} />}
                    loading={isUpdating}
                    onClick={() => {
                        modals.openConfirmModal({
                            title: t('common.action.confirm-action'),
                            children: (
                                <Text>
                                    {t('config-editor-actions.feature.save-anyway-description')}
                                </Text>
                            ),
                            centered: true,
                            labels: {
                                confirm: t('common.action.save'),
                                cancel: t('common.action.cancel')
                            },
                            confirmProps: {
                                color: 'red'
                            },
                            onConfirm: handleSave
                        })
                    }}
                >
                    {t('config-editor-actions.feature.save-anyway')}
                </Button>
            )}

            <Group gap={0} wrap="nowrap">
                <Menu
                    onClose={() => handlers.close()}
                    onOpen={() => handlers.open()}
                    radius="sm"
                    shadow="md"
                    trigger="click-hover"
                    withinPortal
                >
                    <Menu.Target>
                        <ActionIcon
                            className={classes.actionIconLeft}
                            size={36}
                            variant={opened ? 'outline' : 'default'}
                        >
                            <TbMenuDeep size={20} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <CopyButton timeout={2000} value={configProfile.uuid}>
                            {({ copied, copy }) => (
                                <Menu.Item
                                    color={copied ? 'teal' : undefined}
                                    leftSection={
                                        copied ? <PiCheck size={14} /> : <PiCopy size={14} />
                                    }
                                    onClick={copy}
                                >
                                    {t('common.action.copy-uuid')}
                                </Menu.Item>
                            )}
                        </CopyButton>

                        <Menu.Item
                            color={clipboard.copied ? 'teal' : undefined}
                            leftSection={<TbClipboardCopy size={14} />}
                            onClick={handleCopyConfig}
                        >
                            {t('config-editor-actions.feature.copy-all-content')}
                        </Menu.Item>

                        <Menu.Item
                            leftSection={<TbSelectAll size={14} />}
                            onClick={handleSelectAll}
                        >
                            {t('common.action.select-all')}
                        </Menu.Item>

                        <Menu.Item leftSection={<TbCut size={14} />} onClick={handleCut}>
                            {t('config-editor-actions.feature.cut-selection')}
                        </Menu.Item>

                        <Menu.Item
                            leftSection={<TbClipboardText size={14} />}
                            onClick={handlePaste}
                        >
                            {t('config-editor-actions.feature.paste-from-clipboard')}
                        </Menu.Item>

                        <Menu.Divider />

                        <Menu.Item
                            leftSection={<TbTools size={14} />}
                            onClick={() => {
                                modals.open({
                                    title: (
                                        <BaseOverlayHeader
                                            iconColor="teal"
                                            IconComponent={TbTools}
                                            iconVariant="soft"
                                            title={t('config-editor-actions.feature.tools')}
                                        />
                                    ),
                                    centered: true,
                                    children: <KeypairGeneratorWidget />
                                })
                            }}
                        >
                            {t('config-editor-actions.feature.generate-keypair')}
                        </Menu.Item>

                        <Menu.Item
                            leftSection={<TbDownload size={14} />}
                            onClick={openDownloadModal}
                        >
                            {t('common.action.load-from-github')}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>

                <Button
                    className={classes.centeredButton}
                    leftSection={<PiCheckSquareOffset size={16} />}
                    onClick={formatDocument}
                    variant="default"
                >
                    {t('config-editor-actions.feature.format')}
                </Button>
            </Group>
        </Group>
    )
}
