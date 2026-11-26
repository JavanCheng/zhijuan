# 智卷 UI 规范

界面采用中性的浅灰基底、细边框和分层文字。教师端用蓝、学生端用绿、管理员端用紫。三端共用中性基底与状态色，角色色仅用于品牌、主要操作、选中导航及少量高亮。此规范不改变考试、阅卷、账号、数据结构或路由。

## 维护入口

| 文件 | 职责 |
| --- | --- |
| `src/tokens.css` | 背景、表面、文字、边框、动作、反馈、状态、字体、圆角和动效；Tailwind `ui-*` 由语义变量派生。 |
| `src/theme.ts` / `src/appearance.tsx` | Ant Design 映射与统一主题容器；浅色、深色、跟随系统。首次渲染前使用同一偏好选定主题，存储不可用时仍可在当前会话切换。 |
| `src/styles.css` / `src/components.css` | 主题入口、共享排版、通用组件样式和控件适配。工作台和业务页面布局放在所属模块。 |
| `src/ui.tsx` | 页面壳、状态标签、面板、空状态、`IconButton`、`UiTooltip`、`CompactButton` 和 `ContentSkeleton`。继续使用 Ant Design 的 Button、Input、Modal、Drawer、Dropdown、Menu 与 Skeleton，不另建平行库。 |
| `src/fonts.css` / `public/fonts/NOTICE.md` | 官方本地字体、分片及许可证；根节点 `lang` 决定字体栈，不新增语言切换功能。 |

## 三端颜色

在 `src/tokens.css` 的 `data-ui-role` 区块中维护各端的主要操作色、悬停色、按下色与强调文字色，浅色和深色分别定义。淡色表面、选中底色和强调边框从强调文字色派生。页面根据当前路由启用对应色板；统一入口保留中性基底，三张角色卡各用自己的色板。成功、警告、危险和信息色不随角色变化。

## 使用约定

- 使用 `bg-ui-page`、`bg-ui-surface`、`text-ui-primary`、`text-ui-secondary`、`border-ui-line` 等语义工具类，不在业务页面维护十六进制色值。状态文本、底色和图形强调色分开取值，不能只靠颜色传达状态。
- 页面级操作结果与请求错误统一用 `App.useApp().message`。Message 沿用原登录错误提示的视觉：语义状态浅底、细边框、状态图标、正文色和适度圆角，无阴影；深色使用对应的深色状态底。表单字段校验、确认弹窗里的操作信息和导入报告保留在相关控件内，避免重复提示。
- 普通按钮默认 36px，`small` 为 32px、`large` 为 40px，`CompactButton` 为 24px。图标按钮提供准确的 `label`；`tooltip` 可自定义或设为 `false`，不要叠加浏览器 `title`。若组件库自带密码切换、清除或关闭操作，保留其原有语义。
- 标题和说明使用原有排版。卡片、弹层、圆形和胶囊按形态选用圆角。内容优先换行，表格或代码只在所属滚动容器内横向滚动。
- 只给骨架实际替换后的内容加 `content-reveal`，不要给外层页面或路由切换再加一次。资源卡片仅过渡边框；工作台侧栏只过渡宽度（桌面）或位移（窄屏）。不人为延迟数据加载。新增封面卡片时可用 `--ui-motion-cover` 实现 `scale(1.015)`，在裁切容器内处理并停用减少动态模式下的缩放。
- 键盘焦点使用细内描边，强制色模式用系统色；折叠后的窄屏侧栏设置 `inert`，关闭后回焦。弹窗沿用组件库的焦点管理、Escape 和回焦。按实际场景检查内容宽度、缩放及多状态反馈。

## 复验

在项目目录执行 `pnpm typecheck`、`pnpm build` 和 `node scripts/ui-design-check.mjs`。脚本启动临时 Vite 站点并使用本机 Microsoft Edge；测试 API 使用隔离样本，不修改项目数据库。
