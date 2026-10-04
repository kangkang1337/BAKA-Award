import type { Award, YearData } from '../types'
import { theme2026 } from '../themes/2026'

const screenshotFilesByAward: Record<string, string[]> = {
  '01': ['01.webp', '02.webp', '03.webp'],
  '02': ['01.webp', '02.webp', '03.webp'],
  '03': ['01.webp', '2.webp'],
  '04': ['01.webp', '02.webp'],
  '05': ['01.webp', '02.webp'],
  '06': ['01.webp', '02.webp', '03.webp'],
  '07': ['01.webp', '02.webp', '03.webp'],
  '08': ['01.webp', '02.webp'],
  '09': ['01.webp', '02.webp', '03.webp'],
  '10': ['01.webp', '02.webp', '03.webp'],
  '11': ['01.webp', '02.webp', '03.webp'],
  '12': ['01.webp', '02.webp', '03.webp'],
  '13': ['01.webp', '02.webp', '03.webp'],
  '14': ['01.webp', '02.webp', '03.webp'],
  '15': ['01.webp', '02.webp', '03.webp'],
  '16': ['01.webp', '02.webp', '03.webp', '04.webp'],
}

const plannedAward = (
  id: string,
  number: string,
  title: string,
  english: string,
  gameName: string,
  description: string,
  layout: Award['layout'],
): Award => {
  const imageRoot = '/images/2026'
  return {
    id,
    number,
    title,
    english,
    description,
    layout,
    guestImage: `${imageRoot}/guest/${number}.webp`,
    winner: {
      name: gameName,
      screenshots: (screenshotFilesByAward[number] ?? []).map(file => `${imageRoot}/games/${number}/${file}`),
    },
  }
}

export const year2026: YearData = {
  year: 2026,
  edition: 'THE SECOND CEREMONY',
  theme: theme2026,
  guest: {
    name: '伊吹萃香',
    displayName: '伊吹萃香 / Ibuki Suika',
    image: '/images/2026/guest/00.webp',
    theme: '星空宴席 · 旅途余晖 · 相遇与同行',
    introduction: '在无边的世界里相遇，然后一起走一程。这一夜，先坐下来歇一会儿。',
    comments: {},
  },
  awards: [
    plannedAward('gameplay', '01', '最佳游戏性', 'BEST GAMEPLAY', '《X4：基石》', '这一年最让人想继续操作下去的手感。', 'split'),
    plannedAward('narrative', '02', '最佳叙事', 'BEST NARRATIVE', '《尼尔：机械纪元》', '故事走远以后，仍留在心里的部分。', 'editorial'),
    plannedAward('art', '03', '最佳艺术设计', 'BEST ART DIRECTION', '《VA-11 Hall-A：赛博朋克酒保行动》', '那些让旅途中的人和地方变得鲜明的画面。', 'image'),
    plannedAward('music', '04', '最佳音乐', 'BEST SOUNDTRACK', '《东方红魔乡：新典》', '离开游戏之后，还会在脑海里响起的旋律。', 'minimal'),
    plannedAward('indie', '05', '最佳独立游戏', 'BEST INDIE GAME', '《CrossCode》', '一段有自己节奏、值得慢慢走完的旅程。', 'gallery'),
    plannedAward('performance', '06', '最佳演出', 'BEST PERFORMANCE', '《优米雅的炼金工房》', '让角色与世界一起鲜活起来的瞬间。', 'reveal'),
    plannedAward('guide', '07', '我们需要攻略奖', 'WE NEED A GUIDE AWARD', '《歧路旅人 II》', '查过的资料，也成了旅程的一部分。', 'chaos'),
    plannedAward('one-more-turn', '08', '再玩五分钟奖', 'ONE MORE TURN AWARD', '《勒芒终极版》', '说好最后一圈，下一圈又开始了。', 'time'),
    plannedAward('surprise', '09', '意外之喜奖', 'UNEXPECTED GEM AWARD', '《Pentiment》', '原本没有预料到，却一直记得的相遇。', 'warm'),
    plannedAward('just-like-it', '10', '我就是喜欢奖', 'I JUST LIKE IT AWARD', '《Starfield》', '有些喜欢，不需要很多解释。', 'split'),
    plannedAward('most-loss', '11', '亏钱最多奖', 'MOST EXPENSIVE DETOUR', '《歧路旅人》', '旅途的回头路，也留在这一年的账页里。', 'minimal'),
    plannedAward('elder', '12', '惊人的老人奖', 'REMARKABLE ELDER AWARD', '《艾尔登法环》', '走过很远以后，世界依旧有新的角落。', 'editorial'),
    plannedAward('touhou-intro', '13', '东方启蒙奖', 'TOUHOU AWAKENING AWARD', '《东方冰之勇者记》', '一扇门打开，才发现后面还有更大的世界。', 'gallery'),
    plannedAward('more-than-game', '14', '不只是一款游戏奖', 'MORE THAN A GAME AWARD', '《Outer Wilds》', '有些旅程，结束以后还会继续留在身边。', 'image'),
    plannedAward('goty', '15', 'BAKA年度游戏', 'BAKA GAME OF THE YEAR', '《天国：拯救 2》', '把这一年的路收束在这里，再回头看看走过的地方。', 'hero'),
  ],
  specialAward: plannedAward(
    'suika-pick',
    '16',
    '嘉宾特别奖：聚散有时',
    "GUEST'S LAST TOAST",
    '《Citizen Sleeper 1 & 2》',
    '聚散有时。能一起走过一段，已经值得记下。',
    'special',
  ),
}
