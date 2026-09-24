/** True only in the public web demo (GitHub Pages): the same UI running on the in-browser backend, plus demo notices.
 *  Set by the Pages workflow through `VITE_WEB_DEMO=1`; desktop builds and tests never see it. */
export const WEB_DEMO = import.meta.env.VITE_WEB_DEMO === '1'

export const RELEASES_URL = 'https://github.com/foy4ik/kairo/releases/latest'

/** Demo media (screenshots, video) is copied next to the built site by the Pages workflow. */
export const demoAsset = (path: string): string => `${import.meta.env.BASE_URL}demo/${path}`
