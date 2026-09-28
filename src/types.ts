export type AwardLayout = 'hero' | 'split' | 'editorial' | 'image' | 'minimal' | 'gallery' | 'chaos' | 'time' | 'reveal' | 'warm' | 'special'

export interface Game {
  name: string
  steamId?: string
  cover?: string
  screenshots: string[]
}

export interface Guest {
  name: string
  displayName: string
  image?: string
  theme: string
  introduction: string
  comments: Record<string, string>
}

export interface Award {
  id: string
  number: string
  title: string
  english: string
  description: string
  layout: AwardLayout
  winner: Game | null
  guestComment?: string
  guestImage?: string
}

export interface YearTheme {
  background: string
  foreground: string
  accent: string
  accentSecondary?: string
  secondary: string
  typography: string
  grid: string
  effects: string
}

export interface YearData {
  year: number
  edition: string
  guest: Guest
  theme: YearTheme
  awards: Award[]
  specialAward: Award | null
}
