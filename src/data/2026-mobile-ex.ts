export interface MobileExAward {
  id: string
  number: string
  title: string
  english: string
  game: string
  note: string
  /** Optional private asset path, for example /images/2026/ex-mobile/01-companion.jpg. */
  image?: string
  /** Use when a page needs more than one source image, such as the scrapbook spread. */
  images?: string[]
  visualLabel: string
}

export const mobileExGuest = {
  name: '平泽唯',
  english: 'Hirasawa Yui',
  quote: '诶，今年还留了这么多游戏啊。',
  // The entrance portrait is deliberately first; the remaining gallery order is shuffled in the scene.
  images: [
    '/images/2026/ex-mobile/yui/d0411a877362475ac8ec426fbad6651c684d593f13668-PCKL1i_fw1200webp.webp',
    '/images/2026/ex-mobile/yui/fdc4659cbbbcd57fd92bd337fcadcbe7.jpg',
    '/images/2026/ex-mobile/yui/images%20(1).jpg',
    '/images/2026/ex-mobile/yui/images%20(2).jpg',
    '/images/2026/ex-mobile/yui/images%20(3).jpg',
    '/images/2026/ex-mobile/yui/images%20(4).jpg',
    '/images/2026/ex-mobile/yui/images.jpg',
  ],
}

export const mobileExAwards: MobileExAward[] = [
  {
    id: 'companion', number: '01', title: '最佳陪伴', english: 'STILL HERE', game: '《异环》',
    visualLabel: 'PHONE NOTE / WALLPAPER',
    images: [
      '/images/2026/ex-mobile/1/nte-neverness-to-everness-screenshot-01-ps5-en-04feb26.webp',
    ],
    note: `诶，这个我觉得就是异环。\n\n有时候也不是非要玩得特别认真，就是打开以后看看大家在干嘛，就觉得……嗯，还不错。\n\n而且我好像还会记得一些角色。\n\n所以这种游戏留在手机里以后，就会变成‘啊，原来它还在这里’的感觉。\n\n陪伴……大概就是这样吧？`,
  },
  {
    id: 'portrait', number: '02', title: '最佳立绘', english: 'ONE MORE LOOK', game: '《StarSavior》',
    visualLabel: 'CHARACTER CARD / POSTCARD',
    images: [
      '/images/2026/ex-mobile/2/image-01a0f149-2491-7747-91ec-40a50c25dbab.png',
    ],
    note: `这个我很喜欢！\n\n就是……角色站在那里，我就会忍不住多看一会儿。\n\n还有那种星星、天空一样的感觉，画面会让人觉得这个角色好像真的在那个地方生活着。\n\n我本来只是想看看角色的，结果又看了好久。\n\n……嗯，所以就给它吧。`,
  },
  {
    id: 'idle', number: '03', title: '最佳摸鱼', english: 'JUST ONE MORE RUN', game: '《Ancient Gods》',
    visualLabel: 'LANDSCAPE WINDOW / CARD DECK',
    images: [
      '/images/2026/ex-mobile/3/ss_c5d3249513a1bfa0a6b6394d5dec150afb48ecef.1920x1080.jpg',
    ],
    note: `这个很适合偷偷玩一下。\n\n‘我只玩一小会儿’——然后打几张牌，再想一下这次要怎么组……\n\n诶？\n\n好像又可以再来一局。\n\n它这种卡组越搭越奇怪、但是又真的能打出来的感觉，我还挺喜欢的。\n\n而且不用一直联网的话，就更适合……那个，摸鱼。`,
  },
  {
    id: 'gifts', number: '04', title: '最会送东西', english: 'FREE, AGAIN?', game: '《异域战记》',
    visualLabel: 'GIFT PACK / PULL NOTES',
    images: [
      '/images/2026/ex-mobile/4/281559118cji.jpg',
    ],
    note: `这个真的很多诶！\n\n刚开始玩的时候就一直在送，连免费扭蛋都可以拿很多次。\n\n我看到的时候就想：\n\n‘这么多？真的都可以拿吗？’\n\n然后就一直抽、一直抽……\n\n结果不知不觉就认识好多角色了。\n\n这种感觉很容易让人开心起来，所以这个奖就给它！`,
  },
  {
    id: 'story-art', number: '05', title: '最佳剧情 / 美术', english: 'A BOOK THAT TURNS', game: '《Reverse:1999》',
    visualLabel: 'OPEN BOOK / TIME CLIPPINGS',
    images: [
      '/images/2026/ex-mobile/5/download%20(1).jpg',
    ],
    note: `这个……很厉害。\n\n一开始我觉得它的画面就已经很好看了，结果看着看着，又会开始注意故事。\n\n然后发现它是在不同的时代里走来走去的。\n\n诶——所以它到底还要去多少地方呀？\n\n不过我很喜欢这种感觉。\n\n有时候是很漂亮的画面，有时候又突然讲一个有点难过的故事……\n\n嗯，我觉得它很像一本会自己翻页的书。`,
  },
  {
    id: 'rooted', number: '06', title: '最有信仰 / 根深蒂固', english: 'STILL INSTALLED', game: '《东方LostWord》',
    visualLabel: 'HOME SCREEN / ALWAYS THERE',
    images: [
      '/images/2026/ex-mobile/6/unnamed%20(2).webp',
    ],
    note: `这个应该是……根本不用问的吧？\n\n已经在手机里待那么久了，感觉都不能叫‘游戏’了。\n\n应该叫……\n\n‘手机里那个东方。’\n\n嗯。\n\n而且里面有好多角色，我有时候只是进去看看，都会觉得：\n\n啊，大家都还在。\n\n所以这个奖给它，我觉得很自然。`,
  },
  {
    id: 'mobile-goty', number: '07', title: 'MOBILE GAME OF THE YEAR', english: 'ONE MORE OPEN', game: '《终末地》',
    visualLabel: 'GAME SCREEN / EX SELECTION',
    images: [
      '/images/2026/ex-mobile/7/1539.jpg',
      '/images/2026/ex-mobile/7/3b63aa3c5b5d9.png',
      '/images/2026/ex-mobile/7/b2028a2863cf3d03a9a7410a44bf93ed.jpg',
    ],
    note: `这个嘛……\n\n其实玩起来，有一点累。\n\n战斗的时候要注意很多东西，还有各种各样的系统，要慢慢弄。\n\n可是……就是会觉得它做得挺厉害的。\n\n尤其战斗的时候，角色一起行动起来，会有一种‘啊！真的在打诶！’的感觉。\n\n所以虽然会累，还是会想再打开一下。\n\n嗯……\n\n那就给终末地吧。\n\n今年手机上的话，我觉得它就是那个了。`,
  },
]
