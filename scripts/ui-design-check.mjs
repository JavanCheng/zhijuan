// Run from the project: node scripts/ui-design-check.mjs (requires Microsoft Edge).
// Only Vite runs; the browser intercepts all API traffic, with no real API or database.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const teacher = { id: 7, role: 'teacher', username: 'fixture', name: '教师'.repeat(96) };
const title = '超长试卷标题：' + 'LongUnbrokenExamTitle'.repeat(16);
const exam = {
  id: 17, title, description: 'DescriptionWithoutSpaces'.repeat(16), status: 'draft',
  durationMin: 60, startAt: null, endAt: null, resultsPublished: false, totalScore: 0,
  questionCount: 0, createdAt: '2026-11-26T00:00:00Z', submissionCount: 0,
  gradedCount: 0, pendingCount: 0, reviewCount: 0,
};
const responses = new Map([
  ['/api/teacher/exams', [exam]],
  ['/api/auth/runtime', { python: 'fixture', pythonSource: 'fixture', node: 'fixture' }],
  ['/api/teacher/analytics/meta', { classes: [], students: [], exams: [] }],
  ['/api/teacher/classes/overview', {
    classes: [], students: [], totalStudents: 0, activeStudents: 0, inactiveStudents: 0, unassignedStudents: 0,
  }],
]);

const server = await createServer({
  root, configFile: false, plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 0, hmr: false },
  logLevel: 'error',
});
let browser;
const failures = [];

async function check(label, action, { signedIn = false, ...options } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 }, colorScheme: 'light', serviceWorkers: 'block', ...options,
  });
  const unexpected = [];
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== base) {
      unexpected.push(`外部请求：${req.url()}`);
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (req.method() === 'GET' && url.pathname === '/api/auth/me') {
      return signedIn ? route.fulfill({ json: { user: teacher } }) : route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    }
    if (req.method() === 'GET' && responses.has(url.pathname)) return route.fulfill({ json: responses.get(url.pathname) });
    unexpected.push(`未模拟的请求：${req.method()} ${url.pathname}`);
    return route.fulfill({ status: 501, json: { error: 'Fixture not implemented' } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  page.on('pageerror', (error) => unexpected.push(`页面异常：${error.message}`));
  try {
    const evidence = await action(page, base);
    assert.deepEqual(unexpected, []);
    console.log(`通过 · ${label}${evidence ? `：${evidence}` : ''}`);
  } catch (error) {
    failures.push(label);
    console.error(`失败 · ${label}\n${error.stack}`);
    for (const problem of unexpected) console.error(`  ${problem}`);
  } finally {
    await context.close();
  }
}

const getCss = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
const waitCss = (page, selector, property, value) => page.waitForFunction(([sel, name, expected]) => {
  const element = document.querySelector(sel);
  return element && getComputedStyle(element).getPropertyValue(name) === expected;
}, [selector, property, value]);
const waitFocus = (page, selector) => page.waitForFunction((sel) => document.activeElement?.matches(sel), selector);
const appearance = (page) => page.getByRole('button', { name: '切换外观' });
async function chooseAppearance(page, name) {
  await appearance(page).click();
  await page.getByRole('menuitem', { name }).click();
}
async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  assert.ok(dimensions[1] <= dimensions[0] + 1, `页面横向溢出：${dimensions[1]}px > ${dimensions[0]}px`);
  return `${dimensions[0]} / ${dimensions[1]}px`;
}

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge' });
  console.log(`Microsoft Edge ${browser.version()} · Vite + 隔离 API 样本`);

  async function checkMessageStyle(page, type, background) {
    const notice = page.locator(`.ant-message-notice-${type}`);
    await notice.waitFor();
    assert.equal(await getCss(notice, 'background-color'), background);
    assert.equal(await getCss(notice, 'border-top-width'), '1px');
    assert.equal(await getCss(notice, 'border-top-style'), 'solid');
    assert.equal(await getCss(notice, 'border-radius'), '8px');
    assert.equal(await getCss(notice, 'box-shadow'), 'none');
    assert.notEqual(await getCss(notice.locator('.ant-message-notice-icon'), 'color'), await getCss(notice.locator('.ant-message-notice-title'), 'color'));
    return notice;
  }

  await check('登录失败走全局 Message，界面不再展示字体声明', async (page, base) => {
    await page.route('**/api/auth/teacher/login', (route) => route.fulfill({
      status: 401, json: { error: '测试账号或密码不正确' },
    }));
    await page.goto(`${base}/teacher/login`);
    await page.getByPlaceholder('请输入账号').fill('fixture');
    await page.getByPlaceholder('请输入密码').fill('invalid');
    await page.getByRole('button', { name: '进入教师工作台' }).click();
    await page.locator('.ant-message-error').getByText('测试账号或密码不正确').waitFor();
    await checkMessageStyle(page, 'error', 'rgb(255, 241, 240)');
    assert.equal(await page.locator('.login-form .ant-alert, a[href="/fonts/NOTICE.md"]').count(), 0);
    assert.equal(await page.getByPlaceholder('请输入账号').inputValue(), 'fixture');
  });

  await check('深色 Message 状态底色和窄屏长文案', async (page, base) => {
    const error = '请求未完成：' + 'LongUnbrokenError'.repeat(18);
    await page.route('**/api/auth/teacher/login', (route) => route.fulfill({ status: 400, json: { error } }));
    await page.goto(`${base}/teacher/login`);
    await page.getByPlaceholder('请输入账号').fill('fixture');
    await page.getByPlaceholder('请输入密码').fill('invalid');
    await page.getByRole('button', { name: '进入教师工作台' }).click();
    const notice = await checkMessageStyle(page, 'error', 'rgb(80, 43, 42)');
    const rect = await notice.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 320 && rect.height > 44);
    await noHorizontalOverflow(page);
  }, { colorScheme: 'dark', viewport: { width: 320, height: 800 } });

  await check('运行时警告使用同款 Message 样式', async (page, base) => {
    await page.route('**/api/auth/runtime', (route) => route.fulfill({ json: { python: null } }));
    await page.goto(`${base}/teacher`);
    await checkMessageStyle(page, 'warning', 'rgb(255, 248, 235)');
  }, { signedIn: true });

  await check('浅/深色实际页面与控件；外观保存、刷新及跟随系统', async (page, base) => {
    await page.goto(`${base}/login`);
    await page.getByRole('heading', { name: '选择登录入口' }).waitFor();
    await waitCss(page, 'body', 'background-color', 'rgb(250, 250, 250)');
    await chooseAppearance(page, '深色');
    await waitCss(page, 'body', 'background-color', 'rgb(52, 52, 52)');
    await page.reload();
    await page.getByRole('heading', { name: '选择登录入口' }).waitFor();
    assert.equal(await getCss(page.locator('body'), 'background-color'), 'rgb(52, 52, 52)');
    await page.getByRole('link', { name: '教师登录' }).click();
    const submit = page.getByRole('button', { name: '进入教师工作台' });
    await submit.waitFor();
    const inputFrame = page.getByPlaceholder('请输入账号').locator('..');
    assert.equal(await getCss(inputFrame, 'background-color'), 'rgb(52, 52, 52)');
    await page.mouse.move(4, 4);
    await waitCss(page, '.login-submit', 'background-color', 'rgb(148, 171, 255)');
    const darkPrimary = await getCss(submit, 'background-color');
    assert.equal(darkPrimary, 'rgb(148, 171, 255)');
    await chooseAppearance(page, '浅色');
    await waitCss(page, '.login-submit', 'background-color', 'rgb(51, 88, 232)');
    assert.equal(await getCss(inputFrame, 'background-color'), 'rgb(255, 255, 255)');
    const buttonSize = await submit.evaluate((button) => {
      const s = getComputedStyle(button);
      return [s.height, s.borderRadius, s.fontWeight];
    });
    assert.deepEqual(buttonSize, ['40px', '6px', '600']); // Login retains its existing emphasis.
    await submit.hover();
    await waitCss(page, '.login-submit', 'background-color', 'rgb(43, 75, 208)');
    await page.mouse.down();
    await waitCss(page, '.login-submit', 'background-color', 'rgb(36, 63, 174)');
    // Release outside the control; do not submit even fixture credentials.
    await page.mouse.move(4, 4);
    await page.mouse.up();
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await getCss(page.locator('html'), 'color-scheme'), 'light');
    await chooseAppearance(page, '跟随系统');
    await waitCss(page, 'body', 'background-color', 'rgb(52, 52, 52)');
    await page.emulateMedia({ colorScheme: 'light' });
    await waitCss(page, 'body', 'background-color', 'rgb(250, 250, 250)');
    return `背景 #fafafa/#343434；输入框 #fff/#343434；按钮 ${buttonSize.join(' / ')}；Hover 与 Pressed 分离`;
  });

  await check('统一入口与各端登录配色互不串色；浅深色、刷新和返回一致', async (page, base) => {
    const roles = {
      teacher: { name: '教师登录', light: 'rgb(51, 88, 232)', dark: 'rgb(148, 171, 255)' },
      student: { name: '学生登录', light: 'rgb(11, 127, 95)', dark: 'rgb(106, 215, 182)' },
      admin: { name: '管理员登录', light: 'rgb(109, 74, 216)', dark: 'rgb(190, 166, 255)' },
    };
    await page.goto(`${base}/login`);
    for (const [mode, name] of [['light', '浅色'], ['dark', '深色']]) {
      await chooseAppearance(page, name);
      const badges = await page.locator('.role-card-icon').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
      assert.equal(new Set(badges).size, 3);
      for (const [role, colors] of Object.entries(roles)) {
        await page.getByRole('link', { name: colors.name }).click();
        await page.mouse.move(5, 5);
        try {
          await waitCss(page, '.login-submit', 'background-color', colors[mode]);
        } catch (error) {
          const button = page.locator('.login-submit');
          const actual = await button.count() ? await getCss(button, 'background-color') : '(无按钮)';
          throw new Error(`/ at ${page.url()}: expected ${colors[mode]}, got ${actual}`, { cause: error });
        }
        assert.equal(await page.locator('html').getAttribute('data-ui-role'), role);
        // Tooltip is portaled; it must still inherit the route palette.
        await appearance(page).hover();
        const tip = page.getByRole('tooltip', { name: '切换外观' });
        await tip.waitFor();
        assert.equal(await getCss(tip.locator('xpath=ancestor-or-self::*[contains(@class,"ant-tooltip-container") or contains(@class,"ant-tooltip-unique-container")][1]'), 'background-color'), colors[mode]);
        await page.mouse.move(5, 5);
        await page.reload();
        try {
          await waitCss(page, '.login-submit', 'background-color', colors[mode]);
        } catch (error) {
          const button = page.locator('.login-submit');
          const actual = await button.count() ? await getCss(button, 'background-color') : '(无按钮)';
          throw new Error(`/ at ${page.url()}: expected ${colors[mode]}, got ${actual}`, { cause: error });
        }
        await page.goBack();
        await page.getByRole('heading', { name: '选择登录入口' }).waitFor();
        assert.equal(await page.locator('html').getAttribute('data-ui-role'), null);
      }
    }
    return '教师蓝、学生绿、管理员紫；入口、路由、刷新与门户内组件一致';
  });

  await check('深色系统首屏、键盘焦点与 Tooltip', async (page, base) => {
    await page.goto(`${base}/login`);
    await page.getByRole('heading', { name: '选择登录入口' }).waitFor();
    assert.equal(await getCss(page.locator('body'), 'background-color'), 'rgb(52, 52, 52)');
    const control = appearance(page);
    const tooltip = page.getByRole('tooltip', { name: '切换外观' });
    await control.hover();
    await page.waitForTimeout(120);
    assert.equal(await tooltip.isVisible(), false, 'Hover Tooltip 过早显示');
    await tooltip.waitFor();
    const rect = await tooltip.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 1360 && rect.y >= 0);
    await page.mouse.move(5, 5);
    await tooltip.waitFor({ state: 'hidden' });
    await page.keyboard.press('Tab');
    await waitFocus(page, '[aria-label="切换外观"]');
    await tooltip.waitFor();
    const focus = await control.evaluate((node) => {
      const style = getComputedStyle(node);
      return [node.matches(':focus-visible'), style.outlineStyle, style.outlineWidth, style.outlineOffset];
    });
    assert.equal(focus[0], true);
    assert.notEqual(focus[1], 'none');
    assert.ok(parseFloat(focus[2]) > 0 && parseFloat(focus[3]) < 0, `焦点应为细内描边：${focus}`);
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: '跟随系统' }).waitFor();
    await tooltip.waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.getByRole('menuitem', { name: '跟随系统' }).waitFor({ state: 'hidden' });
    await waitFocus(page, '[aria-label="切换外观"]');
    await page.emulateMedia({ forcedColors: 'active' });
    const visibleInForcedColors = await control.evaluate((node) => {
      const style = getComputedStyle(node);
      return matchMedia('(forced-colors: active)').matches && node.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    });
    assert.equal(visibleInForcedColors, true);
    return `Tooltip 悬停延迟/键盘弹出/视口内；Escape 回焦；内描边 ${focus[2]} / ${focus[3]}；强制色模式保留焦点`;
  }, { colorScheme: 'dark' });

  await check('桌面侧栏连续折叠、节点与图标坐标稳定；弹窗键盘焦点', async (page, base) => {
    await page.goto(`${base}/teacher`);
    const toggle = page.getByRole('button', { name: '收起导航' });
    await toggle.waitFor();
    const side = page.locator('.app-sider');
    const sideIcon = '.sider-nav-item.is-active .sider-nav-icon';
    assert.equal(await getCss(side, 'width'), '248px');
    assert.equal(await getCss(side, 'transition-duration'), '0.4s');
    assert.equal(await getCss(side, 'transition-property'), 'width');
    assert.equal(await getCss(side, 'transition-timing-function'), 'cubic-bezier(0.4, 0, 0.1, 1)');
    const original = await page.locator(sideIcon).elementHandle();
    const initial = await original.boundingBox();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await waitCss(page, '.app-sider', 'width', '64px');
    await waitFocus(page, '.menu-toggle');
    const final = await original.boundingBox();
    assert.ok(initial && final && Math.abs(initial.x - final.x) < 1 && Math.abs(initial.y - final.y) < 1, `图标坐标变化：${JSON.stringify([initial, final])}`);
    assert.equal(await original.evaluate((node, selector) => node.isConnected && document.querySelector(selector) === node, sideIcon), true);
    await page.getByRole('button', { name: '展开导航' }).click();
    await waitCss(page, '.app-sider', 'width', '248px');

    const create = page.getByRole('button', { name: '新建考试' });
    await create.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
      const tabFocus = await dialog.evaluate((element) => ({ contained: element.contains(document.activeElement), details: document.activeElement?.outerHTML.slice(0, 260) }));
      assert.equal(tabFocus.contained, true, `${key} 使焦点离开弹窗：${tabFocus.details}`);
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await create.evaluate((element) => document.activeElement === element), true, '弹窗关闭未回焦');
    return `248 → 64 → 248px / 400ms；图标同一节点且坐标不变；弹窗循环焦点及回焦`;
  }, { signedIn: true });

  await check('320px 窄屏、长文本和放大；侧栏 inert/Escape 及减少动态效果', async (page, base) => {
    await page.goto(`${base}/teacher`);
    await page.getByText(title, { exact: true }).waitFor();
    const side = page.locator('.app-sider');
    const active = page.locator('.sider-nav-item.is-active');
    assert.equal(await side.evaluate((element) => element.inert), true);
    await active.evaluate((element) => element.focus());
    assert.equal(await active.evaluate((element) => element === document.activeElement), false);
    assert.equal(await getCss(side, 'transition-duration'), '0s');
    assert.equal(await getCss(page.locator('.ant-card').filter({ hasText: title }), 'transition-duration'), '0s');
    assert.equal(await getCss(page.locator('.ant-card').filter({ hasText: title }), 'animation-name'), 'none');
    const toggle = page.getByRole('button', { name: '展开导航' });
    await page.keyboard.press('Tab');
    await waitFocus(page, '.menu-toggle');
    await page.keyboard.press('Enter');
    await waitFocus(page, '.sider-brand');
    assert.equal(await side.evaluate((element) => element.inert), false);
    assert.equal(await page.locator('.app-main').evaluate((element) => element.inert), true);
    await page.keyboard.press('Escape');
    await waitFocus(page, '.menu-toggle');
    assert.equal(await side.evaluate((element) => element.inert), true);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    const narrow = await noHorizontalOverflow(page);
    // Use CSS zoom for deterministic layout zoom, including CSS px typography.
    await page.locator('.page-shell').evaluate((element) => { element.style.zoom = '1.25'; });
    const enlarged = await noHorizontalOverflow(page);
    return `视口/布局宽 ${narrow}，内容区 125% 缩放后 ${enlarged}；禁用非必要过渡；移动导航键盘开闭和回焦`;
  }, { signedIn: true, viewport: { width: 320, height: 800 }, reducedMotion: 'reduce' });

  await check('班级创建成功走全局 Message，创建确认保留弹窗', async (page, base) => {
    await page.route('**/api/teacher/classes', (route) => {
      assert.equal(route.request().method(), 'POST');
      assert.equal(route.request().postDataJSON().name, '测试班级');
      return route.fulfill({ status: 201, json: { id: 11, name: '测试班级' } });
    });
    await page.goto(`${base}/teacher/classes`);
    await page.getByRole('button', { name: '新建班级' }).first().click();
    const dialog = page.getByRole('dialog', { name: '新建班级' });
    await dialog.getByRole('textbox').fill('测试班级');
    await dialog.getByRole('button', { name: /^创\s*建$/ }).click();
    await page.locator('.ant-message-success').getByText('班级已创建').waitFor();
    await checkMessageStyle(page, 'success', 'rgb(232, 255, 245)');
    await dialog.waitFor({ state: 'hidden' });
  }, { signedIn: true });

  await check('真实禁用按钮不可聚焦，且浅/深色与可用状态分离', async (page, base) => {
    await page.goto(`${base}/teacher/classes`);
    const disabled = page.getByRole('button', { name: '添加学生' });
    await disabled.waitFor();
    const enabled = page.getByRole('button', { name: '导入名单' }).first();
    assert.equal(await disabled.isDisabled(), true);
    await disabled.evaluate((element) => element.focus());
    assert.equal(await disabled.evaluate((element) => element === document.activeElement), false);
    const light = await getCss(disabled, 'color');
    assert.equal(light, 'rgba(0, 0, 0, 0.2)');
    assert.notEqual(light, await getCss(enabled, 'color'));
    await chooseAppearance(page, '深色');
    await waitCss(page, '.ant-btn:disabled', 'color', 'rgba(255, 255, 255, 0.4)');
    const dark = await getCss(disabled, 'color');
    assert.equal(dark, 'rgba(255, 255, 255, 0.4)');
    assert.notEqual(dark, await getCss(enabled, 'color'));
    return `${light} / ${dark}`;
  }, { signedIn: true });

  await check('根节点 lang 切换、字体栈与本地字形资源', async (page, base) => {
    const fontResponses = new Set();
    page.on('response', (response) => {
      if (response.request().resourceType() === 'font' && response.ok()) fontResponses.add(new URL(response.url()).pathname);
    });
    await page.goto(`${base}/teacher/login`);
    const control = page.getByRole('button', { name: '进入教师工作台' });
    await control.waitFor();
    const body = page.locator('body');
    const zh = await getCss(body, 'font-family');
    assert.match(zh, /^system-ui, "PingFang SC", PingFangSC, MiSans, "Microsoft YaHei", sans-serif$/);
    const originalLang = await page.locator('html').getAttribute('lang');
    assert.match(originalLang, /^zh(?:-|$)/i);
    await page.locator('html').evaluate((node) => { node.lang = 'en-GB'; });
    assert.match(await getCss(body, 'font-family'), /^"Google Sans Flex", system-ui/);
    assert.match(await getCss(control, 'font-family'), /^"Google Sans Flex", system-ui/);
    const fonts = await page.evaluate(async () => {
      const sample = document.createElement('code');
      sample.textContent = 'console.log("中文");';
      document.body.append(sample);
      const codeStack = getComputedStyle(sample).fontFamily;
      sample.remove();
      const loaded = await Promise.all([
        document.fonts.load('14px "Google Sans Flex"', 'Zhijuan'),
        document.fonts.load('14px MiSans', '智卷教师登录'),
      ]);
      return { codeStack, loaded: loaded.map((faces) => faces.filter((f) => f.status === 'loaded').map((f) => f.family)) };
    });
    assert.match(fonts.codeStack, /^ui-monospace, SFMono-Regular, Menlo, Consolas, .*MiSans/);
    assert.ok(fonts.loaded.every((faces) => faces.length > 0), `未加载本地字体：${JSON.stringify(fonts.loaded)}`);
    assert.ok(fontResponses.size >= 2 && [...fontResponses].every((path) => path.startsWith('/fonts/')), `字体请求：${[...fontResponses].join(', ')}`);
    await page.locator('html').evaluate((node, lang) => { node.lang = lang; }, originalLang);
    assert.equal(await getCss(body, 'font-family'), zh);
    await page.reload();
    await control.waitFor();
    assert.equal(await getCss(body, 'font-family'), zh);
    return `中/英/等宽 computed style；首次/切换/刷新；本地字形请求 ${fontResponses.size} 个，无外部字体请求`;
  });
} finally {
  await browser?.close();
  await server.close();
}

if (failures.length) {
  console.error(`未通过 ${failures.length} 组：${failures.join('；')}`);
  process.exitCode = 1;
}
