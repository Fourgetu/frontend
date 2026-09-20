import { Select } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import {
    SS2022_METHODS,
    DEFAULT_SS2022_METHOD,
    type Ss2022Method
} from './model/dual-core-capabilities'

export function Ss2022MethodSelect({
    value = DEFAULT_SS2022_METHOD,
    onChange,
    disabled
}: {
    value?: string
    onChange: (value: Ss2022Method) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    return (
        <Select
            label={t('dual-core.ss-method')}
            description={t('dual-core.chacha-managed-unavailable')}
            value={value}
            disabled={disabled}
            allowDeselect={false}
            data={SS2022_METHODS.map((item) => ({
                value: item.method,
                label: item.method,
                disabled: !item.managedUsers
            }))}
            onChange={(value) => {
                const item = SS2022_METHODS.find(
                    (item) => item.method === value && item.managedUsers
                )
                if (item) onChange(item.method)
            }}
        />
    )
}
