import './teachers.css';
import { useCallback, useEffect, useMemo, useRef, useState, type Key } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App as AntApp, Button, Card, Dropdown, Form, Input, Modal, Segmented, Table } from 'antd';
import type { MenuProps, TableProps } from 'antd';
import {
  CheckCircleOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined, KeyOutlined, MoreOutlined,
  ReloadOutlined, SearchOutlined, StopOutlined, UserAddOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import { ApiError, api, del, patch, post } from '../../api';
import type { BatchTeacherResult, ManagedTeacher, TeacherOverview } from '../../../shared/types';
import { ContentSkeleton, EmptyState, IconButton, Page, PageHeader, Pill } from '../../ui';
import { formatDate } from '../../format';

const PAGE_SIZE = 12;
const MAX_BATCH = 500;
const PHONE_RULE = /^1[3-9]\d{9}$/;
const TEACHERS_API = '/api/admin/teachers';

type StatusFilter = 'all' | 'active' | 'inactive';
type TeacherEditor = { kind: 'add' } | { kind: 'edit'; teacher: ManagedTeacher };
type AccountAction =
  | { kind: 'enable' | 'disable' | 'reset' | 'delete'; teacher: ManagedTeacher }
  | { kind: 'batch-enable' | 'batch-disable'; ids: number[] };
interface TeacherForm { name: string; phone: string }

function PasswordCell({ teacher }: { teacher: ManagedTeacher }) {
  const [revealed, setRevealed] = useState(false);
  const canReveal = teacher.passwordState === 'default' && Boolean(teacher.phone);
  return (
    <div className="teacher-password">
      <span className="teacher-password-mask">{canReveal && revealed ? teacher.phone : '••••••••'}</span>
      {canReveal ? <IconButton size="small" icon={revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        label={`${revealed ? '隐藏' : '显示'}${teacher.name}的默认密码`} aria-pressed={revealed} onClick={() => setRevealed(!revealed)} /> : null}
      <span className="teacher-password-status">{canReveal ? '默认密码' : teacher.passwordState === 'custom' ? '已修改 · 不可查看' : '不可查看'}</span>
    </div>
  );
}

function normalizeTeacher(teacher: ManagedTeacher): ManagedTeacher {
  return { ...teacher, phone: teacher.phone?.trim() || null };
}

function matches(teacher: ManagedTeacher, status: StatusFilter, missingPhone: boolean, keyword: string) {
  if ((status === 'active' && !teacher.isActive) || (status === 'inactive' && teacher.isActive)) return false;
  if (missingPhone && teacher.phone) return false;
  const text = keyword.trim().toLowerCase();
  return !text || [teacher.name, teacher.phone, teacher.username].some((value) => value?.toLowerCase().includes(text));
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function summarize(overview: TeacherOverview, teachers: ManagedTeacher[]): TeacherOverview {
  const active = teachers.filter((teacher) => teacher.isActive).length;
  return { ...overview, teachers, total: teachers.length, active, inactive: teachers.length - active };
}

function actionDetails(action: AccountAction) {
  switch (action.kind) {
    case 'enable':
      return { title: '启用账号', text: `启用后，${action.teacher.name} 可以重新登录。`, danger: false };
    case 'disable':
      return { title: '停用账号', text: `停用后，${action.teacher.name} 将无法登录，名下考试、答卷和成绩会保留。`, danger: true };
    case 'reset':
      return { title: '重置密码', text: `将 ${action.teacher.name} 的密码重置为当前手机号。原密码将无法使用，登录账号不变。`, danger: false };
    case 'delete':
      return { title: '删除账号', text: `确定删除 ${action.teacher.name}（${action.teacher.username}）的账号吗？只有名下没有考试的账号才能删除。若只是停止登录，建议改用停用。删除不可撤销。`, danger: true };
    case 'batch-enable':
      return { title: '批量启用', text: `将启用所选账号中当前已停用的 ${action.ids.length} 位教师。`, danger: false };
    case 'batch-disable':
      return { title: '批量停用', text: `将停用所选账号中当前已启用的 ${action.ids.length} 位教师。他们将无法登录，名下考试、答卷和成绩会保留。`, danger: true };
  }
}

export function AdminTeachers() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useSearchParams();
  const missingPhone = query.get('missingPhone') === '1';
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Key[]>([]);
  const [hiddenAccount, setHiddenAccount] = useState<ManagedTeacher | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const [form] = Form.useForm<TeacherForm>();
  const [editor, setEditor] = useState<TeacherEditor | null>(null);
  const [action, setAction] = useState<AccountAction | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [deleteConflict, setDeleteConflict] = useState(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (announce = false) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await api<TeacherOverview>('/api/admin/overview');
      if (version !== loadVersion.current) return;
      const teachers = data.teachers.map(normalizeTeacher);
      setOverview({ ...data, teachers });
      const ids = new Set(teachers.map((teacher) => teacher.id));
      setSelected((keys) => keys.filter((key) => typeof key === 'number' && ids.has(key)));
      setHiddenAccount((account) => account ? teachers.find((teacher) => teacher.id === account.id) ?? null : null);
      setFocusedId((id) => id !== null && ids.has(id) ? id : null);
      if (announce) void message.success('教师列表已刷新');
    } catch (error) {
      if (version === loadVersion.current) setLoadError(errorText(error, '请稍后重试'));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  // A dashboard link and browser history can change this constraint outside this page's controls.
  useEffect(() => {
    setSelected([]);
    setPage(1);
    setFocusedId(null);
    setHiddenAccount(null);
  }, [missingPhone]);

  const teachers = overview?.teachers;
  const filtered = useMemo(() => (teachers ?? []).filter(
    (teacher) => matches(teacher, status, missingPhone, keyword),
  ), [teachers, status, missingPhone, keyword]);
  const missingCount = (teachers ?? []).filter((teacher) => !teacher.phone).length;
  const focused = teachers?.find((teacher) => teacher.id === focusedId);
  const selectedKeys = new Set(selected);
  const selectedTeachers = focused ? [] : filtered.filter((teacher) => selectedKeys.has(teacher.id));
  const enableIds = selectedTeachers.filter((teacher) => !teacher.isActive).map((teacher) => teacher.id);
  const disableIds = selectedTeachers.filter((teacher) => teacher.isActive).map((teacher) => teacher.id);

  function resetListPosition() {
    setSelected([]);
    setPage(1);
    setFocusedId(null);
    setHiddenAccount(null);
  }

  function toggleMissingPhone(on: boolean) {
    resetListPosition();
    const next = new URLSearchParams(query);
    if (on) next.set('missingPhone', '1');
    else next.delete('missingPhone');
    setQuery(next);
  }

  function clearFilters() {
    setKeyword('');
    setStatus('all');
    if (missingPhone) toggleMissingPhone(false);
    else resetListPosition();
  }

  function openEditor(next: TeacherEditor) {
    form.resetFields();
    form.setFieldsValue(next.kind === 'edit' ? { name: next.teacher.name, phone: next.teacher.phone ?? '' } : { name: '', phone: '' });
    setDialogError('');
    setEditor(next);
  }

  function openAction(next: AccountAction) {
    setDialogError('');
    setDeleteConflict(false);
    setAction(next);
  }

  function rememberTeacher(teacher: ManagedTeacher) {
    // Reflect the confirmed write even if the follow-up refresh fails.
    const normalized = normalizeTeacher(teacher);
    setOverview((current) => {
      if (!current) return current;
      const exists = current.teachers.some((row) => row.id === teacher.id);
      const next = exists ? current.teachers.map((row) => row.id === teacher.id ? normalized : row) : [normalized, ...current.teachers];
      return summarize(current, next);
    });
  }

  async function saveTeacher(values: TeacherForm) {
    if (!editor || savingRef.current) return;
    const name = values.name?.trim();
    const phone = values.phone?.trim();
    const phoneChanged = editor.kind === 'edit' && Boolean(phone) && phone !== editor.teacher.phone;
    savingRef.current = true;
    setSaving(true);
    setDialogError('');
    try {
      const teacher = editor.kind === 'add'
        ? await post<ManagedTeacher>(TEACHERS_API, { name, phone })
        : await patch<ManagedTeacher>(`${TEACHERS_API}/${editor.teacher.id}`, phoneChanged ? { name, phone } : { name });
      rememberTeacher(teacher);
      if (editor.kind === 'add') {
        setSelected([]);
        setFocusedId(null);
        if (matches(teacher, status, missingPhone, keyword)) {
          setPage(1);
          setHiddenAccount(null);
        } else {
          setHiddenAccount(teacher);
        }
        void message.success('教师账号已创建');
      } else if (phoneChanged) {
        setSelected((keys) => keys.filter((key) => key !== teacher.id));
        void message.success(teacher.passwordState === 'default' ? '教师信息已更新，默认密码已同步为新手机号' : '教师信息已更新，原密码不变');
      } else {
        void message.success('教师信息已更新');
      }
      setEditor(null);
      void load();
    } catch (error) {
      const detail = errorText(error, '保存失败，请重试');
      const field = error instanceof ApiError
        ? (editor.kind === 'add' || phoneChanged) && (error.status === 409 || (error.status === 400 && /手机号/.test(detail) && !/姓名/.test(detail)))
          ? 'phone'
          : error.status === 400 && /姓名/.test(detail) && !/手机号/.test(detail) ? 'name' : null
        : null;
      if (field) form.setFields([{ name: field, errors: [detail] }]);
      else setDialogError(detail);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function runAction() {
    if (!action || savingRef.current || (action.kind === 'delete' && deleteConflict)) return;
    savingRef.current = true;
    setSaving(true);
    setDialogError('');
    try {
      if ('ids' in action) {
        const enable = action.kind === 'batch-enable';
        const result = await post<BatchTeacherResult>(`${TEACHERS_API}/batch`, { action: enable ? 'enable' : 'disable', ids: action.ids });
        if (result.affected === action.ids.length) {
          const ids = new Set(action.ids);
          setOverview((current) => current && summarize(current, current.teachers.map((teacher) =>
            ids.has(teacher.id) ? { ...teacher, isActive: enable } : teacher)));
        }
        void message.success(`${enable ? '已启用' : '已停用'} ${result.affected} 位教师`);
        setSelected([]);
      } else {
        const teacherPath = `${TEACHERS_API}/${action.teacher.id}`;
        if (action.kind === 'delete') {
          // Never request cascade deletion through this page.
          await del(teacherPath);
          setOverview((current) => current && summarize(current, current.teachers.filter((teacher) => teacher.id !== action.teacher.id)));
          setSelected((keys) => keys.filter((key) => key !== action.teacher.id));
          void message.success('教师账号已删除');
        } else if (action.kind === 'reset') {
          await post(`${teacherPath}/reset-password`);
          void message.success('密码已重置为该教师的手机号');
        } else {
          const teacher = await patch<ManagedTeacher>(teacherPath, { isActive: action.kind === 'enable' });
          rememberTeacher(teacher);
          setSelected((keys) => keys.filter((key) => key !== teacher.id));
          void message.success(action.kind === 'enable' ? '教师账号已启用' : '教师账号已停用，考试、答卷和成绩已保留');
        }
      }
      setAction(null);
      void load();
    } catch (error) {
      if (action.kind === 'delete' && error instanceof ApiError && error.status === 409) {
        setDeleteConflict(true);
        setDialogError('该账号已有考试，不能删除。请关闭弹窗后改用停用。');
        void load();
      } else {
        setDialogError(errorText(error, '操作失败，请重试'));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const columns: TableProps<ManagedTeacher>['columns'] = [
    {
      title: '教师 / 登录账号', className: 'teacher-identity-cell',
      render: (_, teacher) => (
        <div className="teacher-identity">
          <strong>{teacher.name}</strong>
          <span className="teacher-login">{teacher.username}</span>
          {!teacher.phone ? <Pill tone="amber">待补全手机号</Pill> : teacher.phone !== teacher.username ? <span>手机号 {teacher.phone}</span> : null}
          <span className="teacher-activity-compact">{teacher.examCount} 场考试 · {teacher.submissionCount} 份答卷</span>
        </div>
      ),
    },
    {
      title: '密码', className: 'teacher-password-cell',
      render: (_, teacher) => <PasswordCell key={[teacher.id, teacher.passwordState, teacher.phone].join(':')} teacher={teacher} />,
    },
    {
      title: '账号状态', className: 'teacher-state-cell',
      render: (_, teacher) => teacher.isActive ? <Pill tone="green">已启用</Pill> : <Pill tone="gray">已停用</Pill>,
    },
    {
      title: '考试 / 答卷', className: 'teacher-activity-cell',
      render: (_, teacher) => <span className="teacher-cell-detail" title="答卷数含作答中的记录">{teacher.examCount} 场 · {teacher.submissionCount} 份</span>,
    },
    {
      title: '创建时间', className: 'teacher-created-cell',
      render: (_, teacher) => <span className="teacher-cell-detail">{formatDate(teacher.createdAt)}</span>,
    },
    {
      title: '操作', className: 'teacher-actions-cell',
      render: (_, teacher) => {
        const items: MenuProps['items'] = [
          { key: 'reset', icon: <KeyOutlined />, label: teacher.phone ? '重置密码' : '重置密码（需先补全手机号）' },
          { key: 'status', icon: teacher.isActive ? <StopOutlined /> : <CheckCircleOutlined />, label: teacher.isActive ? '停用账号' : '启用账号' },
        ];
        if (teacher.examCount === 0) {
          items.push({ type: 'divider' }, { key: 'delete', label: '删除账号', icon: <DeleteOutlined />, danger: true });
        }
        return (
          <div className="teacher-row-actions">
            <Button size="small" type="link" onClick={() => openEditor({ kind: 'edit', teacher })}>编辑</Button>
            <Dropdown trigger={['click']} menu={{ items, onClick: ({ key }) => {
              if (key === 'reset' && !teacher.phone) openEditor({ kind: 'edit', teacher });
              else if (key === 'reset') openAction({ kind: 'reset', teacher });
              else if (key === 'status') openAction({ kind: teacher.isActive ? 'disable' : 'enable', teacher });
              else if (key === 'delete') openAction({ kind: 'delete', teacher });
            } }}>
              <IconButton size="small" icon={<MoreOutlined />} label={`${teacher.name} 更多操作`} />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  const dialog = action ? actionDetails(action) : null;
  const editedTeacher = editor?.kind === 'edit' ? editor.teacher : null;
  const editedPhone = Form.useWatch('phone', form)?.trim();
  const changingPhone = Boolean(editedTeacher && editedPhone && editedPhone !== editedTeacher.phone);
  const updatesDefault = editedTeacher?.passwordState === 'default' || (editedTeacher?.passwordState === 'unknown' && !editedTeacher.phone);
  const filtersActive = status !== 'all' || missingPhone || Boolean(keyword.trim());
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const batchTooLarge = (ids: number[]) => ids.length > MAX_BATCH;

  return (
    <Page className="teacher-accounts-page">
      <PageHeader title="教师账号" extra={
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => openEditor({ kind: 'add' })}>新增教师</Button>
      } />
      {overview ? (
        <Card className="teacher-list-card" styles={{ body: { padding: 'var(--teacher-list-padding)' } }}>
          <div className="teacher-filters" role="group" aria-label="教师账号筛选">
            <Segmented<StatusFilter> aria-label="账号状态" value={status} onChange={(next) => { setStatus(next); resetListPosition(); }} options={[
              { label: `全部 ${overview.total}`, value: 'all' },
              { label: `已启用 ${overview.active}`, value: 'active' },
              { label: `已停用 ${overview.inactive}`, value: 'inactive' },
            ]} />
            <Button aria-pressed={missingPhone} className="teacher-missing-toggle" onClick={() => toggleMissingPhone(!missingPhone)}>
              待补全手机号 <strong>{missingCount}</strong>
            </Button>
          </div>
          <div className="teacher-toolbar" role="group" aria-label="教师列表工具栏">
            <Input className="teacher-search" aria-label="搜索教师" allowClear prefix={<SearchOutlined />} placeholder="搜索姓名、手机号或登录账号"
              value={keyword} onChange={(event) => { setKeyword(event.target.value); resetListPosition(); }} />
            {filtersActive ? <Button type="text" onClick={clearFilters}>清除筛选</Button> : null}
            <div className="teacher-toolbar-end">
              <span role="status" className="teacher-result-count">{focused ? '查看新账号' : `匹配 ${filtered.length} 位`}</span>
              <Button aria-label="刷新" icon={<ReloadOutlined />} loading={loading} onClick={() => void load(true)}>刷新</Button>
            </div>
          </div>
          {loadError ? <Alert className="teacher-inline-notice" type="warning" showIcon message="刷新失败，仍显示上次数据"
            description={loadError} action={<Button size="small" loading={loading} onClick={() => void load(true)}>重试</Button>} /> : null}
          {hiddenAccount && !focused ? (
            <Alert className="teacher-inline-notice" type="success" showIcon message={`已创建 ${hiddenAccount.name} 的账号，当前筛选下不可见`}
              action={<Button size="small" onClick={() => { setSelected([]); setFocusedId(hiddenAccount.id); }}>查看账号</Button>} />
          ) : null}
          {focused ? (
            <Alert className="teacher-inline-notice" type="info" showIcon message={`正在查看 ${focused.name} 的新账号，原筛选条件已保留`}
              action={<Button size="small" onClick={() => setFocusedId(null)}>返回筛选结果</Button>} />
          ) : null}
          {selectedTeachers.length > 0 ? (
            <div className="teacher-batch" role="region" aria-label="教师批量操作">
              <strong>已选 {selectedTeachers.length} 位</strong>
              <Button size="small" icon={<CheckCircleOutlined />} disabled={!enableIds.length || batchTooLarge(enableIds)} onClick={() => openAction({ kind: 'batch-enable', ids: enableIds })}>启用 {enableIds.length} 位</Button>
              <Button size="small" icon={<StopOutlined />} disabled={!disableIds.length || batchTooLarge(disableIds)} onClick={() => openAction({ kind: 'batch-disable', ids: disableIds })}>停用 {disableIds.length} 位</Button>
              <Button size="small" type="text" onClick={() => setSelected([])}>取消选择</Button>
              {batchTooLarge(enableIds) || batchTooLarge(disableIds) ? <span>单次最多处理 {MAX_BATCH} 位，请分批选择</span> : null}
            </div>
          ) : null}
          {!focused && filtered.length === 0 ? (
            <div className="teacher-empty">
              <EmptyState icon={<UserSwitchOutlined />}
                title={overview.total === 0 ? '还没有教师账号' : '没有匹配的教师账号'}
                description={overview.total === 0 ? '教师账号由管理员创建，教师无法自行注册。' : '试试其他关键词，或调整筛选条件。'}
                action={overview.total === 0
                  ? <Button type="primary" icon={<UserAddOutlined />} onClick={() => openEditor({ kind: 'add' })}>新增教师</Button>
                  : <Button onClick={clearFilters}>清除筛选</Button>} />
            </div>
          ) : (
            <div className="teacher-table">
              <Table<ManagedTeacher> rowKey="id" size="small" columns={columns} dataSource={focused ? [focused] : filtered}
                rowSelection={focused ? undefined : { columnWidth: 36, preserveSelectedRowKeys: true, selectedRowKeys: selected, onChange: setSelected }}
                pagination={focused ? false : { current: visiblePage, pageSize: PAGE_SIZE, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }} />
            </div>
          )}
        </Card>
      ) : loadError ? (
        <Alert type="error" showIcon message="教师列表暂不可用" description={loadError}
          action={<Button size="small" loading={loading} onClick={() => void load()}>重新加载</Button>} />
      ) : <ContentSkeleton rows={8} />}

      <Modal open={editor !== null} title={editor?.kind === 'add' ? '新增教师' : '编辑教师'} okText={editor?.kind === 'add' ? '创建账号' : '保存修改'}
        cancelText="取消" confirmLoading={saving} onOk={() => form.submit()} onCancel={() => { if (!savingRef.current) setEditor(null); }}
        mask={{ closable: !saving }} keyboard={!saving} closable={!saving} cancelButtonProps={{ disabled: saving }} forceRender>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={saveTeacher} disabled={saving}
          onValuesChange={() => setDialogError('')}>
          {editor ? (
            <Form.Item label="教师姓名" name="name" rules={[
              { required: true, whitespace: true, message: '请输入教师姓名' }, { max: 40, message: '姓名不能超过 40 个字符' },
            ]}>
              <Input placeholder="例如：张老师" maxLength={40} />
            </Form.Item>
          ) : null}
          {editor ? (
            <>
              <Form.Item label="手机号" name="phone" extra={editor.kind === 'add' ? '手机号同时作为登录账号和初始密码。' : '教师使用此手机号登录。'}
                rules={[
                  ...(editor.kind === 'add' || editedTeacher?.phone ? [{ required: true, whitespace: true, message: '请输入手机号' }] : []),
                  { pattern: PHONE_RULE, transform: (value: string) => value?.trim(), message: '请输入有效的 11 位手机号' },
                ]}>
                <Input inputMode="tel" placeholder="请输入 11 位手机号" maxLength={11} />
              </Form.Item>
              {changingPhone ? <Alert className="teacher-inline-notice" type="warning" showIcon title="登录手机号将更改"
                description={updatesDefault ? '保存后须用新手机号登录，默认密码也会设为新手机号。' : '保存后须用新手机号登录，原密码不变。'} /> : null}
            </>
          ) : null}
          {editor && dialogError ? <Alert type="error" showIcon message={dialogError} /> : null}
        </Form>
      </Modal>
      <Modal open={action !== null} title={dialog?.title} okText={dialog?.title} cancelText="取消" confirmLoading={saving}
        okButtonProps={{ danger: dialog?.danger, disabled: action?.kind === 'delete' && deleteConflict }}
        cancelButtonProps={{ disabled: saving }} onOk={() => void runAction()} onCancel={() => { if (!savingRef.current) setAction(null); }}
        mask={{ closable: !saving }} keyboard={!saving} closable={!saving}>
        <p>{dialog?.text}</p>
        {dialogError ? <Alert className="teacher-inline-notice" type="error" showIcon message={dialogError} /> : null}
      </Modal>
    </Page>
  );
}
