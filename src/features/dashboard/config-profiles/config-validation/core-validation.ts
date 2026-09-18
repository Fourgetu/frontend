export type ConfigProfileCoreType = 'singbox' | 'xray'

export const CORE_TYPE_MISSING_MESSAGE =
    'Unable to determine the current configuration core type. Refresh the page and try again.'

export const isConfigProfileCoreType = (value: unknown): value is ConfigProfileCoreType =>
    value === 'xray' || value === 'singbox'

export const preserveKnownCoreType = <Profile extends object>(
    currentCoreType: ConfigProfileCoreType,
    profile: Profile & { coreType?: unknown }
): Profile & { coreType: ConfigProfileCoreType } => ({
    ...profile,
    coreType: isConfigProfileCoreType(profile.coreType) ? profile.coreType : currentCoreType
})

export const getConfigProfileModelUri = (
    coreType: ConfigProfileCoreType,
    profileUuid: string
): string => {
    switch (coreType) {
        case 'xray':
            return `xray-config://${profileUuid}.json`
        case 'singbox':
            return `singbox-config://${profileUuid}.json`
    }
}

export interface CoreValidationResult {
    isValid: boolean
    message: string
    validator: 'missing' | 'singbox-schema' | 'xray-wasm'
}

interface CoreValidators {
    singboxSchema: (config: string) => Promise<string | undefined> | string | undefined
    xrayWasm: (config: string) => Promise<string | undefined> | string | undefined
}

export const validateConfigForCore = async (
    coreType: ConfigProfileCoreType | undefined,
    config: string,
    validators: CoreValidators
): Promise<CoreValidationResult> => {
    if (!isConfigProfileCoreType(coreType)) {
        return {
            isValid: false,
            message: CORE_TYPE_MISSING_MESSAGE,
            validator: 'missing'
        }
    }

    if (coreType === 'singbox') {
        const message = await validators.singboxSchema(config)
        return {
            isValid: !message,
            message: message || 'sing-box config matches the configured JSON schema.',
            validator: 'singbox-schema'
        }
    }

    const message = await validators.xrayWasm(config)
    return {
        isValid: !message,
        message: message || 'Xray config is valid.',
        validator: 'xray-wasm'
    }
}
