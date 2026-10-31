import type { RouteBatchUser } from '../model/user-route-batch'

import { Loader, MultiSelect } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useGetUsers } from '@shared/api/hooks'

export function RouteUserSelect({
    value,
    onChange,
    disabled
}: {
    value: RouteBatchUser[]
    onChange: (users: RouteBatchUser[]) => void
    disabled: boolean
}) {
    const { t } = useTranslation()
    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search.trim(), 250)
    const { data, isFetching, isError } = useGetUsers({
        query: {
            size: 100,
            start: 0,
            filters: debouncedSearch ? [{ id: 'username', value: debouncedSearch }] : [],
            filterModes: { username: 'contains' }
        },
        rQueryParams: { enabled: !disabled, refetchInterval: false, placeholderData: undefined }
    })
    const options = new Map(value.map((user) => [user.value, user]))
    for (const user of data?.users ?? []) {
        options.set(String(user.id), {
            value: String(user.id),
            label: `${user.username} (#${user.id})`
        })
    }

    return (
        <MultiSelect
            clearable
            data={[...options.values()]}
            description={t('speed-limits.batch.users-description')}
            disabled={disabled}
            error={isError ? t('speed-limits.batch.users-error') : undefined}
            label={t('speed-limits.batch.users')}
            nothingFoundMessage={t('speed-limits.batch.no-users')}
            onChange={(ids) => onChange(ids.map((id) => options.get(id)!))}
            onSearchChange={setSearch}
            required
            rightSection={isFetching ? <Loader size="xs" /> : undefined}
            searchable
            searchValue={search}
            value={value.map((user) => user.value)}
        />
    )
}
