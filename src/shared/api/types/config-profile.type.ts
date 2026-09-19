import type {
    GetConfigProfileByUuidCommand,
    GetConfigProfilesCommand
} from '@remnawave/backend-contract'

export type ConfigProfileCoreType = 'xray' | 'singbox'

/**
 * The custom backend branch exposes coreType, while the published contract
 * package used by this checkout predates that field. Query hooks validate the
 * runtime response with the extended schema; this type carries that fact to
 * feature boundaries without changing the backend contract or database.
 */
export type ConfigProfileWithCoreType = GetConfigProfileByUuidCommand.Response['response'] & {
    coreType?: ConfigProfileCoreType
}

export type ConfigProfileListItemWithCoreType =
    GetConfigProfilesCommand.Response['response']['configProfiles'][number] & {
        coreType: ConfigProfileCoreType
    }
