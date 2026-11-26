import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as AntApp, ConfigProvider, Dropdown } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useLocation } from 'react-router-dom';
import { BulbOutlined, DesktopOutlined, MoonOutlined } from '@ant-design/icons';
import { createTheme } from './theme';
import { IconButton } from './ui';

type Preference = 'system' | 'light' | 'dark';
const KEY = 'zhijuan-ui-theme';
const ThemeContext = createContext({ preference: 'system' as Preference, setPreference: (_value: Preference) => {}, dark: false, reduced: false });
export const useUiTheme = () => useContext(ThemeContext);

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const role = /^\/(teacher|student|admin)(?:\/|$)/i.exec(pathname)?.[1].toLowerCase();
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [preference, setSavedPreference] = useState<Preference>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* blocked storage */ }
    return 'system';
  });
  const dark = preference === 'system' ? systemDark : preference === 'dark';
  const [config, setConfig] = useState(() => createTheme(dark, reduced));
  useLayoutEffect(() => {
    const { dataset } = document.documentElement;
    dataset.theme = dark ? 'dark' : 'light';
    if (role) dataset.uiRole = role;
    else delete dataset.uiRole;
    setConfig(createTheme(dark, reduced));
  }, [dark, reduced, role]);
  const context = useMemo(() => ({
    preference, dark, reduced,
    setPreference(value: Preference) {
      setSavedPreference(value);
      try {
        if (value === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, value);
      } catch { /* theme still changes for this session */ }
    },
  }), [preference, dark, reduced]);
  return (
    <ThemeContext.Provider value={context}>
      <ConfigProvider locale={zhCN} theme={config} modal={{ centered: true }}>
        <AntApp message={{ maxCount: 3 }}>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

const appearance = [
  { key: 'system', label: '跟随系统', icon: <DesktopOutlined /> },
  { key: 'light', label: '浅色', icon: <BulbOutlined /> },
  { key: 'dark', label: '深色', icon: <MoonOutlined /> },
];

export function ThemeControl({ className }: { className?: string }) {
  const { preference, setPreference, dark } = useUiTheme();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  function closeAndFocus() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={['click']} autoFocus placement="bottomRight" menu={{
      items: appearance, selectable: true, selectedKeys: [preference],
      onKeyDown: (event) => { if (event.key === 'Escape') closeAndFocus(); },
      onClick: ({ key }) => { setPreference(key as Preference); closeAndFocus(); },
    }}>
      <IconButton ref={trigger} className={className} label="切换外观" tooltip={open ? false : undefined} aria-haspopup="menu" aria-expanded={open} icon={dark ? <MoonOutlined /> : <BulbOutlined />} />
    </Dropdown>
  );
}
