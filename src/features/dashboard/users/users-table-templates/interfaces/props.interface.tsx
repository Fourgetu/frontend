/* eslint-disable camelcase */
import { MRT_TableInstance } from '@kastov/mantine-react-table-open'

import { CustomUser } from '@shared/api/types/user-traffic-reset.schema'

export interface IProps {
    table: MRT_TableInstance<CustomUser>
}
