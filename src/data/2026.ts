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

const guestCommentsByAward: Record<string, string> = {
  '01': `这个游戏很容易越玩越大。

刚开始想买一艘船。
后来发现要赚钱，得先弄资源。
有了资源，又该做工厂。
工厂建起来了，还得想办法把东西卖出去。

等你终于觉得差不多了，
又会想把那支舰队再扩一点。

一开始只是想开船的。
最后连贸易帝国都有了。（有点过头了吧！）

今年最容易让我一直玩下去的，就是这个。`,
  '02': `刚开始看到的是 2B。

后来是 9S，
再后来又轮到 A2。

同一件事情，换一个人来看，
知道的东西和在意的东西都会变。

等真正把故事走完，
才发现前面那些事情还会回来。

这种故事不太容易结束。

游戏结束了，事情还在脑子里。`,
  '03': `我喜欢这个酒吧。

旧电脑一样的画面，
霓虹灯，吧台，还有每天晚上进来的人。

Jill一杯酒递过去，
有时候话就多了一点；
酒不一样，聊出来的事情也不一样。

外面是很吵的城市，
这里却总像另外一个地方。

坐在这里看看人说话，
也挺好。`,
  '04': `红魔馆那一带，我还算熟。

这些曲子以前也听过很多次。
现在又重新编了一遍，
第一耳朵还是认得出来。

旋律没变成别的东西，
只是以前认识的朋友，换了身衣服再见了一次。

这个感觉不错。

红魔馆那边的人(尤其是咲夜)，
听到应该也不会觉得陌生吧。`,
  '05': `这个游戏给我的感觉很好。

主角不怎么说话，
倒是一路拿着球到处解决问题。

机关很多，
战斗也不少，
还有一堆地方等着你去绕。

最后你会发现，
它其实什么都准备好了。

不大，但很完整。`,
  '06': `好的演出不一定是很大的场面。

一个表情，
一句话说完以后多停了一下，
战斗的时候突然喊出来的一声。

这些小东西叠在一起，
角色就不只是站在那里了。

会觉得他们真的在那里生活。

这个我很喜欢。`,
  '07': `八个人。

每个人有自己的故事，
还有昼和夜两套行动。

白天能打听消息，
晚上又是另一套办法。
有时候是调查，
有时候是把人打昏，
有时候只是把东西拿走。

战斗里还有弱点、破防、BP，
Latent Power 又是一套。

我本来想自己慢慢研究。

后来发现，
攻略确实能省很多时间。(笑)`,
  '08': `耐力赛就是这样。

轮胎、油量、天气、进站，
每一件事情都能影响后面的比赛。

尤其是轮胎，
也不能想换就换。

所以你会告诉自己：
跑完这一段就停。

这一段跑完，
又觉得车况不错。

那就再跑一圈。

然后下一圈也是这么想的。`,
  '09': `这个游戏最开始没有给我很大的感觉。

一个画画的人，
来到巴伐利亚的一个小地方，
结果卷进了一件又一件事情。

一开始只是查一件命案，
后来认识的人越来越多，
连这个地方本身也开始让人舍不得走。

等结束的时候才发现，
原来已经在这里待了这么久。

这种意外还不错。`,
  '10': `这个奖很好选。

我喜欢它待在宇宙里的感觉。

本来只是要去做一件事情，
落地以后接到一个任务，
做完又顺路去了别的地方。

有时候跟着 Constellation 找东西，
有时候跑一趟很远的星球，
有时候什么正事也不做，就在那边走走。

事情很多，
但就是不会觉得讨厌。

所以就是它。

我就是喜欢。`,
  '11': `这个奖没有什么复杂的故事。

买的时候，141 元。

后来一看，60 元。

差得有点多。

当然，游戏已经玩过了，
所以也不能真的说什么。

就是每次想起来，
还是觉得这笔账挺值得记一下的。`,
  '12': `这个世界很大。

走一段路，
会遇到一个完全没见过的地方。

打一场，
又不知道后面还藏着什么。

走了这么久，
到现在还是会有人进去找东西。

这位老人确实挺有精神。`,
  '13': `原来是从琪露诺开始认识东方的啊。

那倒挺不错。

红魔乡的时候，
她还在雾之湖边说自己最强。

现在已经成冰之勇者，
一路打 BOSS，
还真的把幻想乡又折腾了一遍。

看样子还是那个笨蛋妖精，
只是这次跑得比以前远多了。

从这里进门也很好。

只是进来以后，
门可就不止这一扇了。

慢慢看吧。`,
  '14': `第一次玩的时候，
总觉得二十二分钟怎么够。

后来才发现，
能带走的东西不是装备。

是自己记住的东西。

飞船上的日志会帮你留下线索，
可真正要做的，
还是把那些东西一点点连起来。

再飞一次，
再去一个地方，
再知道一点以前不知道的事情。

于是二十二分钟还是二十二分钟。

只是你已经和第一次不一样了。

这种游戏，
放下以后还会继续玩下去。`,
  '15': `今年走过的地方不少。

有时候在城里，
有时候在路上，
也有时候只是想找个地方喝一杯，
结果又被新的事情拉走。

亨利这一趟走得很远。

麻烦不少，
打架不少，
认识的人也不少。

有时候一件小事，
都能把原本要走的路带到另外一个地方。

但真正走到最后，
回头看这一年的时候，
我最先想起来的还是它。

所以，今年的 BAKA 年度游戏——

《天国：拯救 2》。`,
  '16': `这一年认识了很多人。

有人一起走了很久，
有人只同行了一小段。

第一部是在 The Eye 上找一个能待下去的地方。
第二部则带着一艘破旧的船，
一点点把船和船上的人变成自己的生活。

地方会换，
身边的人也会换。

最后还是会各自走开。

不过这没什么不好。

本来就是这样。

能碰到一起，
一起做点事情，
一起坐下来聊一会儿，
已经很难得了。

所以这个奖，我想给《Citizen Sleeper 1 & 2》。

来，最后喝一杯。

下次再聚。`,
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
    guestComment: guestCommentsByAward[number],
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
  finaleNote: '今年就到这里。\n该记下来的都记下来了。\n宴会总会散。\n下次见。',
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
