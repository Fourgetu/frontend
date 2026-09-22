import { MRT_TableInstance } from '@kastov/mantine-react-table-open'

/* eslint-disable camelcase */
import { CustomUser } from '@shared/api/types/user-traffic-reset.schema'

export interface IProps {
    isLoading: boolean
    refetch: () => void

    table: MRT_TableInstance<CustomUser>
}
