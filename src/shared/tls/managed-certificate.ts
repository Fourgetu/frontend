export const PANEL_CERTIFICATE_URI = 'remnawave://certificate/panel/fullchain.pem'
export const PANEL_PRIVATE_KEY_URI = 'remnawave://certificate/panel/privkey.pem'

export type CertificateSource = 'manual' | 'panel'

export const isPanelCertificatePair = (certificateFile: string, keyFile: string): boolean =>
    certificateFile === PANEL_CERTIFICATE_URI && keyFile === PANEL_PRIVATE_KEY_URI
