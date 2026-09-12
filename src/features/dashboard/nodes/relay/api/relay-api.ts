import { quickDeployApi } from '../../quick-deploy/api/quick-deploy-api.ts'

export const relayApi = {
    getNode: quickDeployApi.getNode,
    getProfile: quickDeployApi.getProfile,
    updateProfile: quickDeployApi.updateProfile
}
