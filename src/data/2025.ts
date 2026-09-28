import type { Award, YearData } from '../types'
import { theme2025 } from '../themes/2025'

const award = (
  id: string,
  number: string,
  title: string,
  english: string,
  description: string,
  layout: Award['layout'],
  gameName: string,
  guestComment: string,
  assets: { cover?: string; screenshots?: string[]; guestImage?: string } = {},
): Award => ({
  id,
  number,
  title,
  english,
  description,
  layout,
  winner: { name: gameName, cover: assets.cover, screenshots: assets.screenshots ?? [] },
  guestComment,
  guestImage: assets.guestImage,
})

export const year2025: YearData = {
  year: 2025,
  edition: 'THE FIRST CEREMONY',
  theme: theme2025,
  guest: {
    name: '泉此方',
    displayName: '泉此方 / Konata Izumi',
    image: '/images/2025/guest/465aa92c08ad3d7b9444b1d24672fd60.jpeg',
    theme: '宅系 · 日常 · 偶尔吐槽',
    introduction: '一个宅宅决定，今年也要认真办场典礼。泉此方在旁边偶尔说两句。',
    comments: {},
  },
  awards: [
    award(
      'gameplay', '01', '最佳游戏性', 'BEST GAMEPLAY',
      '跑上屋顶，一路跑过去；光是跑来跑去都能玩半天。', 'split', '《刺客信条：大革命》',
      `这个跑酷还挺好玩的诶。

就是有时候明明想去这边，结果角色“嗖”一下就跑到另一边去了……

不过习惯以后还蛮爽的。到处爬房顶，然后从屋顶一路跑过去什么的，感觉自己突然就很专业。

嗯，光是跑来跑去都能玩半天了。`,
      {
        cover: '/images/2025/games/01/3aea34e9b0ce0b684a1919f5e77b2c4c.jpeg',
        screenshots: [
          '/images/2025/games/01/7e89a2a0e77a7b8deda40cdfc0c466d7.jpeg',
          '/images/2025/games/01/fedc82198eec7397848a0e1c23cf202f.jpeg',
        ],
        guestImage: '/images/2025/guest/f293a0e7c14564a8d88e8f6e04a97284.jpeg',
      },
    ),
    award(
      'narrative', '02', '最佳叙事', 'BEST NARRATIVE',
      '不同的人生故事慢慢拼在一起；知道太多，反而少了点意思。', 'editorial', '《艾迪芬奇的记忆》',
      `这个游戏……怎么说呢。

一开始感觉“哦，就是讲故事嘛”，结果玩着玩着就有点……

啊。

而且每个人的故事还不太一样，玩的时候总觉得下一段会不会更奇怪。

结果最后还真有点东西。

这种游戏就是不能提前知道太多，不然就没意思了。

所以这次就不剧透了。`,
  {
        cover: '/images/2025/games/02/1a674c3c6c5acdd7949488bb406fb56d.jpeg',
        screenshots: [
          '/images/2025/games/02/369bed03375ac4c78c2185144cb9a6da.png',
          '/images/2025/games/02/ca8feb086c187e69ea8341615f965379.jpeg',
        ],
        guestImage: '/images/2025/guest/2db149a00d6a03fbed57560f777d5c8b.jpeg',
      },
    ),
    award(
      'art', '03', '最佳艺术设计', 'BEST ART DIRECTION',
      '走两步就想停下来看看，再走两步，又想截一张图。', 'image', '《光与影：33号远征队》',
      `这个真的好看啊。

我有时候都懒得走了，就想站在那里看看。

“诶，这里截个图应该不错。”

然后又走两步。

“这里也不错。”

然后截图就越来越多……

不过它那个世界的感觉确实挺特别的，不是那种看完就忘的漂亮。

嗯，属于一眼就能认出来的那种。`,
      {
        cover: '/images/2025/games/03/7736970d395ace2caa7685c6a1ab985e.jpeg',
        screenshots: [
          '/images/2025/games/03/53504de003fea7c6318d99ad42c9fd4d.jpeg',
          '/images/2025/games/03/f21678a946bf660fdf1a572093499291.jpg',
          '/images/2025/games/03/f0aa7295a1ab5998f0eafedf62ded9a4.jpg',
        ],
        guestImage: '/images/2025/guest/4b950148835328271b2678006a4e4a83.jpeg',
      },
    ),
    award(
      'music', '04', '最佳音乐', 'BEST SOUNDTRACK',
      '玩完几天以后，旋律还会自己从脑子里冒出来。', 'minimal', '《空洞骑士》',
      `这个我觉得不用多说了吧。

玩的时候可能没特别注意，结果过几天脑子里自己开始放。

然后就会想起：

“哦，我是不是还有个地方没去？”

于是又打开游戏。

……

等等，我是不是被音乐骗回来了？

算了，反正好听就行。`,
      {
        cover: '/images/2025/games/04/22038aa83ef32991589490123decf5f1.jpeg',
        screenshots: [
          '/images/2025/games/04/c8ca97f913f1a2c7ec47d0d7160da14a.jpeg',
          '/images/2025/games/04/8a990138a8371270be1db510feeb825a.jpeg',
          '/images/2025/games/04/572b8b82b31a27b380094a76a86399af.jpeg',
        ],
        guestImage: '/images/2025/guest/9b2834d92fe384fb3344adba16848dcc.webp',
      },
    ),
    award(
      'indie', '05', '最佳独立游戏', 'BEST INDIE GAME',
      '没有人催着做任务，开着那个东西一路往前就好。', 'gallery', '《孤帆远航》',
      `这个挺舒服的。

就开着那个……车？船？反正就是那个东西，一路往前开。

也没什么人在旁边催你。

挺好的。

有时候游戏就是不要一直告诉我：

“你还有三个任务没做。”

“你还有东西没收集。”

“你快去这里。”

这种就挺好。

开着走就行了。`,
      {
        cover: '/images/2025/games/05/0bf0d3e0ef62121f253e0c02850b4099.jpeg',
        screenshots: [
          '/images/2025/games/05/b34b782c7f18f93dcb5cfab117543bed.jpeg',
          '/images/2025/games/05/8e130fe5b37b891f219177abeebade78.png',
          '/images/2025/games/05/0ccede3aaf434f0ed00932da16001c6f.png',
        ],
        guestImage: '/images/2025/guest/14c1ae0539a9152aed6ce4a13f9a8089.jpeg',
      },
    ),
    award(
      'guide', '06', '我们需要攻略奖', 'WE NEED A GUIDE AWARD',
      '本来以为在种田，回过神来已经查了半天资料。', 'chaos', '《星露谷物语》',
      `星露谷啊……

我本来以为不就是种地嘛。

然后开始玩。

“这个东西有什么用？”

查一下。

“这个人喜欢什么？”

查一下。

“这个鱼什么时候有？”

查一下。

“这个东西怎么拿？”

再查一下。

……

等等。

我到底是在种地，还是在查资料？

而且最离谱的是，查完以后发现还有更多东西。

这游戏真的很会装无辜。`,
      {
        cover: '/images/2025/games/06/Snipaste_2026-09-27_21-52-09.jpg',
        screenshots: [
          '/images/2025/games/06/8fde746c777a50c94156e0e792965b0a.jpeg',
          '/images/2025/games/06/f71e90ac9ba974b4b802637ca7217f87.jpeg',
        ],
        guestImage: '/images/2025/guest/94a76fa00659c0d3a3d1223fe56d96e8.jpeg',
      },
    ),
    award(
      'one-more-turn', '07', '再玩五分钟奖', 'ONE MORE TURN AWARD',
      '生产线补一下，电力修一下……诶，已经这么晚了？', 'time', '《戴森球计划》',
      `这个奖给戴森球应该没人有意见吧。

“再弄一下这个。”

“这个生产线不太对。”

“那边缺电。”

“把这个补上。”

“既然都到这里了顺便……”

……

啊？

已经这么晚了？

我就玩了五分钟啊。

嗯。

大概是宇宙里的五分钟吧。`,
      {
        cover: '/images/2025/games/07/bab58dce1092dd2e900a1ed03202427b.png',
        screenshots: [
          '/images/2025/games/07/a40bd0c5413165c26d9d00015ba00f7d.png',
          '/images/2025/games/07/729fd0aba21e16df0bf6c1e09c35056f.jpeg',
          '/images/2025/games/07/c6489dce580a65c70ec235101d1a24f9.jpeg'
        ],
        guestImage: '/images/2025/guest/f1684ad90a338af29a5158b832dbbd1e.jpeg',
      },
    ),
    award(
      'surprise', '08', '意外之喜奖', 'UNEXPECTED GEM AWARD',
      '原本只是随手打开看看，玩完以后倒是记住了它。', 'reveal', '《Sheepy: A Short Adventure》',
      `这个我一开始真的没抱多大希望。

“嗯，一个小短篇嘛，玩玩看。”

然后玩完：

“诶？”

还挺不错的嘛。

虽然不长，但反而不会让人觉得拖。

而且这种本来没怎么期待的游戏，最后觉得“居然还不错”，感觉还挺开心的。

就像买了个扭蛋，结果里面真的是自己想要的。

嗯……虽然我好像也没怎么抽过扭蛋就是了。`,
      {
        cover: '/images/2025/games/08/Snipaste_2026-09-27_21-57-29.jpg',
        screenshots: [
          '/images/2025/games/08/8d73c9fea422b754de57bbb7b4c76f9d.jpeg',
          '/images/2025/games/08/7c9a19484e413c18ebf390cd38ed4ad7.jpeg',
        ],
        guestImage: '/images/2025/guest/96e170963332a49ed8eb63367baebc66.jpeg',
      },
    ),
    award(
      'just-like-it', '09', '我就是喜欢奖', 'I JUST LIKE IT AWARD',
      '偶尔进去待一会儿，调两瓶药；理由嘛，就是喜欢。', 'warm', '《药剂工艺：炼金模拟器》',
      `这个……

我也不知道为什么。

就是喜欢。

有时候也没什么特别的事，就想进去调两瓶药。

然后调着调着：

“这个能不能再混一下？”

“诶，好像可以。”

“那这个呢？”

然后就一直调。

这种游戏也没什么非得通关的感觉。

就是偶尔进去待一会儿。

挺好的。

反正这个奖也没规定必须讲出什么大道理吧？`,
      {
        cover: '/images/2025/games/09/2854beb1630abaa6b508b176b582d5a8.png',
        screenshots: [
          '/images/2025/games/09/0190165de33ad1dec010e71d2085da37.png',
          '/images/2025/games/09/cc1ce91c0539b53e006024bfb5004f82.jpeg',
          '/images/2025/games/09/ab54ed9cb4ee0d1d76ebf395ad14a0b1.jpeg'
        ],
        guestImage: '/images/2025/guest/cbb23faf4b414051223639a35f7dc9ca.jpeg',
      },
    ),
    award(
      'goty', '10', 'BAKA年度游戏', 'BAKA GAME OF THE YEAR',
      '想了一圈，还是觉得今年最适合放在最后的就是它。', 'hero', '《黑神话：悟空》',
      `这个就……

选它吧。

今年玩了这么多游戏，最后想一圈下来，还是觉得这个最适合放在这里。

而且玩的时候那种感觉还挺特别的。

有些地方会想：

“哦——原来还能这样。”

然后打过一个东西以后又会觉得：

“行，这下舒服了。”

嗯。

如果要我从今年玩过的游戏里挑一个放在最后……

就是它了。`,
      {
        cover: '/images/2025/games/10/3389e01cac0a60d9525d92fe885ac280.jpeg',
        screenshots: [
          '/images/2025/games/10/84d49c39e0680b58bb9ef797bc7c71e8.png',
          '/images/2025/games/10/27959058a4b4726980245e0cc62e7b50.jpeg',
          '/images/2025/games/10/6837daf221c832ea7b0eca98aea49a6c.png'
        ],
        guestImage: '/images/2025/guest/d0b12aa8490b80bf65503cccf52c7326.jpeg',
      },
    ),
  ],
  specialAward: award(
    'konata-certified', '11', '此方认证特别奖', 'SPECIAL AWARD · KONATA CERTIFIED',
    '正式颁奖结束后临时加开的 After Show 彩蛋。', 'special', '《Helltaker》',
    `这个……

怎么说呢。

就是很有意思。

游戏也不长，玩起来也不算复杂。

然后角色……

嗯。

挺有那个味道的。

而且这种游戏你玩完以后，过一阵子还是会突然想起来。

“啊，对了，还有这个。”

然后又看一遍。

……

所以今年的特别奖就给它吧。

没有什么特别的理由。

我喜欢。`,
    {
        cover: '/images/2025/games/11/a8c79609cfa1b2171cbfa4f2bc025f6f.jpg',
        screenshots: [
          '/images/2025/games/11/thumb.jpg',
          '/images/2025/games/11/e6e4de16ce45e9c0075a96c3bfcd6a81.jpeg',
        ],
        guestImage: '/images/2025/guest/thumb copy.jpeg',
      },
  ),
}
