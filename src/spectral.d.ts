declare module 'spectral.js' {
  export class Color {
    constructor(value: string | number[])
    R: number[]
    sRGB: number[]
    readonly OKLab: [number, number, number]
    readonly KS: number[]
    readonly luminance: number
    toString(options?: { format?: 'hex' | 'rgb'; method?: 'clip' | 'map' }): string
  }
  const spectral: { Color: typeof Color }
  export default spectral
}
