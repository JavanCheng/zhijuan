# 智卷字体许可 / Font notices

智卷使用 MiSans 字体（小米科技有限责任公司）及 Google Sans Flex（Google）。字体文件是本应用的嵌入式资源，不作为独立字体包发布。

- **MiSans**：使用 [小米官方网页字体样式](https://cdn-font.hyperos.mi.com/font/css?family=MiSans_VF:VF:Chinese_Simplify,Latin&display=swap) 列出的简体中文和拉丁 WOFF2 可变字体切片，字体文件按原样保存。见 [MiSans 字体知识产权许可协议](./MiSans-License.pdf)；[官方 FAQ](https://hyperos.mi.com/font/faq) 说明允许在软件内嵌入使用，且须注明使用 MiSans 字体。不提供修改版或单独再分发字体包。
- **Google Sans Flex**：使用 [Google Fonts](https://fonts.google.com/specimen/Google+Sans+Flex) 发布的 [Latin WOFF2 子集（v27，正常字形、可变字重）](https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@1..1000&display=swap)，文件按原样保存。见随附的 [SIL Open Font License 1.1](./Google-Sans-Flex-OFL.txt) 和 [上游许可原文](https://github.com/google/fonts/blob/d4c1d3820c9bb17ec1a7a526967b1cdafb0885ad/ofl/googlesansflex/OFL.txt)。

运行时只请求应用自身托管的文件：浏览器依字形需求和 `unicode-range` 挑选切片，不会预加载整个字库。系统提供的 PingFang 和其他回退字体不随应用分发。
