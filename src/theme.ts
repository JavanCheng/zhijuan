import { theme, type ThemeConfig } from 'antd';

/** Resolve CSS colors before Ant Design derives its palette (it parses colors in JS). */
export function readUiColors(names: readonly string[]): Record<string, string> {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const sample = document.createElement('span');
  sample.hidden = true;
  root.append(sample);
  const colors: Record<string, string> = {};
  for (const name of names) {
    const raw = style.getPropertyValue(`--ui-${name}`).trim();
    if (!raw) continue;
    sample.style.color = raw;
    colors[name] = getComputedStyle(sample).color;
  }
  sample.remove();
  return colors;
}

export function createTheme(dark: boolean, reduced: boolean): ThemeConfig {
  const colors = readUiColors([
    'background-page', 'background-base', 'background-muted', 'surface-default', 'surface-subtle',
    'content-primary', 'content-secondary', 'content-tertiary', 'content-disabled', 'content-on-action',
    'border-default', 'border-strong', 'action-primary', 'action-primary-hover', 'action-primary-pressed',
    'action-secondary', 'action-secondary-hover', 'action-secondary-pressed',
    'state-hover', 'state-selected', 'state-pressed', 'state-scrim', 'accent-text', 'accent-selected',
    ...(['success', 'warning', 'danger', 'info'] as const).flatMap((state) =>
      ['accent', 'bg', 'text'].map((part) => `status-${state}-${part}`)),
  ]);
  const c = (name: string) => colors[name];
  const scoped = (antdName: string, state: string) => ({
    [`color${antdName}`]: c(`status-${state}-accent`),
    [`color${antdName}Bg`]: c(`status-${state}-bg`),
    [`color${antdName}BgHover`]: c(`status-${state}-bg`),
    [`color${antdName}Text`]: c(`status-${state}-text`),
    [`color${antdName}TextHover`]: c(`status-${state}-text`),
    [`color${antdName}TextActive`]: c(`status-${state}-text`),
  });
  const border = c('border-default');
  const surface = c('surface-default');
  const primary = c('action-primary');
  const foreground = c('content-primary');
  const hover = c('state-hover');
  const selected = c('accent-selected');
  const accentText = c('accent-text');
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      ...scoped('Success', 'success'), ...scoped('Warning', 'warning'),
      ...scoped('Error', 'danger'), ...scoped('Info', 'info'),
      colorTextBase: foreground,
      colorText: foreground,
      colorTextSecondary: c('content-secondary'),
      colorTextTertiary: c('content-tertiary'),
      colorTextQuaternary: c('content-disabled'),
      colorTextLightSolid: c('content-on-action'),
      colorTextPlaceholder: c('content-tertiary'),
      colorBgBase: c('background-base'),
      colorBgLayout: c('background-page'),
      colorBgContainer: surface,
      colorBgElevated: surface,
      colorBgMask: c('state-scrim'),
      colorBorder: c('border-strong'), colorBorderSecondary: border, colorSplit: border,
      colorFill: c('action-secondary-pressed'), colorFillSecondary: c('action-secondary-hover'),
      colorFillTertiary: c('surface-subtle'), colorFillQuaternary: c('surface-subtle'),
      colorBgTextHover: hover, colorBgTextActive: c('state-pressed'),
      controlItemBgHover: hover, controlItemBgActive: selected,
      controlItemBgActiveHover: c('action-secondary-hover'),
      colorPrimary: primary, colorPrimaryHover: c('action-primary-hover'),
      colorPrimaryActive: c('action-primary-pressed'),
      colorPrimaryBg: selected, colorPrimaryBgHover: c('action-secondary-hover'),
      colorLink: accentText, colorLinkHover: c('action-primary'), colorLinkActive: accentText,
      borderRadius: 8, borderRadiusSM: 6, borderRadiusXS: 4, borderRadiusLG: 12,
      fontSize: 14,
      // Preserve input and form layout; button-specific sizes come from CSS tokens.
      controlHeight: 38, controlHeightLG: 44,
      lineWidth: 1, motion: !reduced,
      boxShadow: 'none', boxShadowSecondary: 'none', boxShadowTertiary: 'none',
      fontFamily: 'var(--ui-font-body)', fontFamilyCode: 'var(--ui-font-code)',
    },
    components: {
      Layout: { siderBg: surface, headerBg: surface, bodyBg: c('background-page'), headerHeight: 62, headerPadding: '0 26px' },
      Menu: { itemBorderRadius: 6, itemHoverBg: hover, itemSelectedBg: selected, itemSelectedColor: accentText },
      Card: { bodyPadding: 22, headerHeight: 56, headerFontSize: 15, colorBorderSecondary: border },
      Statistic: { titleFontSize: 13, contentFontSize: 27 },
      Table: { headerBg: c('background-muted'), headerColor: c('content-secondary'), headerSplitColor: 'transparent', rowHoverBg: hover, cellPaddingBlock: 13, borderColor: border },
      Modal: { borderRadiusLG: 16, titleFontSize: 17 },
      Drawer: { borderRadiusLG: 16 },
      Tabs: { horizontalItemPadding: '10px 2px', horizontalItemGutter: 26, titleFontSize: 14, inkBarColor: primary },
      Segmented: { itemSelectedBg: surface, trackBg: c('background-muted'), itemSelectedColor: foreground },
      Input: { activeShadow: 'none', errorActiveShadow: 'none', warningActiveShadow: 'none' },
      Select: { optionSelectedBg: selected, optionActiveBg: hover },
      Button: {
        fontWeight: 500, defaultShadow: 'none', primaryShadow: 'none', dangerShadow: 'none',
        primaryColor: c('content-on-action'), defaultBg: c('action-secondary'), defaultBorderColor: border,
        defaultHoverBg: c('action-secondary-hover'), defaultHoverBorderColor: border, defaultHoverColor: foreground,
        defaultActiveBg: c('action-secondary-pressed'), defaultActiveBorderColor: border, defaultActiveColor: foreground,
        textHoverBg: hover, borderRadius: 6, borderRadiusSM: 6, borderRadiusLG: 6,
      },
      Progress: { defaultColor: primary },
      Tooltip: { colorBgSpotlight: primary, colorTextLightSolid: c('content-on-action') },
    },
  };
}
