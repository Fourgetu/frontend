import type { ConfigProfileCoreType } from '../../config-validation/core-validation.ts'
import type { editor } from 'monaco-editor'

import { RefObject } from 'react'

import type { ConfigProfileWithCoreType } from '@shared/api/types'

export interface Props {
    configProfile: ConfigProfileWithCoreType
    coreType: ConfigProfileCoreType
    editorRef: RefObject<editor.IStandaloneCodeEditor | null>
    hasUnsavedChanges: boolean
    isConfigValid: boolean
    originalValue: string
    setHasUnsavedChanges: (value: boolean) => void
    setIsConfigValid: (value: boolean) => void
    setOriginalValue: (value: string) => void
    setResult: (value: string) => void
    saveOnly?: boolean
    saveDisabled?: boolean
    getSaveValue?: () => string
    validateBeforeSave?: (value: string) => Promise<boolean>
    onSaved?: (value: string) => void
    onSavingChange?: (saving: boolean) => void
}
