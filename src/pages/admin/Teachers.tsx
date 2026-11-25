import { useCallback, useEffect, useMemo, useState, type Key } from 'react';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Segmented,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import type { TableProps } from 'antd';
import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { api, del, patch, post } from '../../api';
import type {
  BatchTeacherResult,
  DeleteTeacherResult,
  ManagedTeacher,
  TeacherOverview,
} from '../../../shared/types';
import { EmptyState, Page, PageHeader, Pill } from '../../ui';
import { formatDate } from '../../format';

const { Text } = Typography;

/** 编辑历史教师时允许暂时留空，新增教师由 required 规则兜底。 */
const PHONE_RULE = /^(?:1[3-9]\d{9})?$/;

interface TeacherForm {
  name: string;
  phone: string;
}

export function AdminTeachers() {
  const { message, modal } = AntApp.useApp();
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const [form] = Form.useForm<TeacherForm>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedTeacher | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<TeacherOverview>('/api/admin/overview');
      setOverview(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedRowKeys((keys) =>
      overview ? keys.filter((key) => overview.teachers.some((teacher) => teacher.id === key)) : [],
    );
  }, [overview]);

  const teachers = overview?.teachers ?? [];

  const filtered = useMemo(() => {
    const text = keyword.trim();
    return teachers.filter((teacher) => {
      if (statusFilter === 'active' && !teacher.isActive) return false;
      if (statusFilter === 'inactive' && teacher.isActive) return false;
      if (!text) return true;
      const phone = teacher.phone ?? '';
      return (
        teacher.name.includes(text) ||
        phone.includes(text) ||
        teacher.username.includes(text)
      );
    });
  }, [teachers, statusFilter, keyword]);

  const selectedTeachers = useMemo(
    () => teachers.filter((teacher) => selectedRowKeys.includes(teacher.id)),
    [teachers, selectedRowKeys],
  );

  function openAdd() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(teacher: ManagedTeacher) {
    setEditing(teacher);
    form.setFieldsValue({ name: teacher.name, phone: teacher.phone ?? '' });
    setModalOpen(true);
  }

  async function saveTeacher() {
    let values: TeacherForm;
    try {
      values = await form.validateFields();
    } catch {
      // 校验失败时由表单自身展示错误，这里只需中止提交
      return;
    }
    const name = values.name.trim();
    const phone = (values.phone ?? '').trim();
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { name };
        if (phone) payload.phone = phone;
        await patch<ManagedTeacher>(`/api/admin/teachers/${editing.id}`, payload);
        message.success('教师信息已更新');
        if (phone && phone !== editing.phone) {
          message.info('登录账号已更新为新手机号，密码同时重置为新手机号');
        }
      } else {
        const created = await post<ManagedTeacher>('/api/admin/teachers', { name, phone });
        modal.success({
          title: '教师账号已创建',
          content: (
            <div className="text-[12.5px] leading-7 text-[#5b6479]">
              <div>
                教师：<strong>{created.name}</strong>
              </div>
              <div>
                登录账号：<strong className="font-mono">{created.phone}</strong>
              </div>
              <div>
                初始密码：<strong className="font-mono">{created.phone}</strong>
              </div>
              <div className="mt-1 text-[11.5px] text-[#98a1b3]">请提醒教师首次登录后妥善保管账号信息。</div>
            </div>
          ),
          okText: '知道了',
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(teacher: ManagedTeacher) {
    try {
      await patch(`/api/admin/teachers/${teacher.id}`, { isActive: !teacher.isActive });
      message.success(
        teacher.isActive ? '已停用该教师账号，考试与成绩保留' : '已恢复该教师账号',
      );
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  }

  function resetPassword(teacher: ManagedTeacher) {
    if (!teacher.phone) {
      message.warning('该教师还没有手机号，请先编辑补全手机号');
      return;
    }
    modal.confirm({
      title: '重置教师密码',
      content: `将 ${teacher.name} 的登录密码重置为手机号 ${teacher.phone}。确定继续吗？`,
      okText: '重置密码',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await post<{ ok: boolean; phone: string }>(
            `/api/admin/teachers/${teacher.id}/reset-password`,
          );
          message.success(`密码已重置为 ${result.phone}`);
        } catch (err) {
          message.error(err instanceof Error ? err.message : '重置失败');
        }
      },
    });
  }

  async function deleteOneTeacher(teacher: ManagedTeacher) {
    try {
      const result = await del<DeleteTeacherResult>(
        `/api/admin/teachers/${teacher.id}${teacher.examCount > 0 ? '?purge=1' : ''}`,
      );
      message.success(
        result.purgedExams > 0
          ? `已删除教师账号，并清除 ${result.purgedExams} 场考试及成绩`
          : '教师账号已删除',
      );
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  }

  function removeTeacher(teacher: ManagedTeacher) {
    if (teacher.examCount === 0) {
      modal.confirm({
        title: '删除教师账号',
        content: `确定删除教师 ${teacher.name}（${teacher.phone ?? teacher.username}）吗？删除后该账号无法登录，可重新创建。`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => deleteOneTeacher(teacher),
      });
      return;
    }

    modal.confirm({
      title: '删除教师账号',
      content: `${teacher.name} 名下有 ${teacher.examCount} 场考试。删除账号会同时清除这些考试、学生答卷和成绩。`,
      okText: '继续',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        modal.confirm({
          title: '再次确认删除',
          content: `确定彻底删除 ${teacher.name} 吗？该教师名下 ${teacher.examCount} 场考试及全部成绩将永久删除，无法恢复。`,
          okText: '彻底删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => deleteOneTeacher(teacher),
        });
      },
    });
  }

  async function runBatchDelete(purge: boolean) {
    try {
      const result = await post<BatchTeacherResult>('/api/admin/teachers/batch', {
        action: 'delete',
        ids: selectedTeachers.map((teacher) => teacher.id),
        purge,
      });
      message.success(
        result.purgedExams > 0
          ? `已删除 ${result.deleted} 位教师，同时清除 ${result.purgedExams} 场考试及成绩`
          : `已删除 ${result.deleted} 位教师`,
      );
      setSelectedRowKeys([]);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量删除失败');
    }
  }

  function batch(action: 'enable' | 'disable' | 'delete') {
    if (!selectedTeachers.length) return;
    const count = selectedTeachers.length;

    if (action === 'delete') {
      const withExams = selectedTeachers.filter((teacher) => teacher.examCount > 0).length;
      const totalExams = selectedTeachers.reduce((sum, teacher) => sum + teacher.examCount, 0);
      const confirmDelete = () => {
        if (totalExams === 0) {
          void runBatchDelete(false);
          return;
        }
        modal.confirm({
          title: '再次确认批量删除',
          content: `将删除 ${count} 位教师，并永久清除 ${totalExams} 场考试及全部成绩。此操作不可恢复。`,
          okText: '彻底删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => runBatchDelete(true),
        });
      };

      modal.confirm({
        title: '批量删除教师',
        content:
          totalExams > 0
            ? `选中的 ${count} 位教师中，${withExams} 位名下有 ${totalExams} 场考试。删除会一并清除考试、学生答卷与成绩。`
            : `确定删除选中的 ${count} 位教师吗？删除后账号无法登录，可重新创建。`,
        okText: totalExams > 0 ? '继续' : '批量删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: confirmDelete,
      });
      return;
    }

    const content =
      action === 'enable'
        ? `将恢复 ${count} 位教师的登录权限。`
        : `停用后这 ${count} 位教师将无法登录，历史考试与成绩会保留。`;
    modal.confirm({
      title: action === 'enable' ? '批量启用教师' : '批量停用教师',
      content,
      okText: action === 'enable' ? '批量启用' : '批量停用',
      okButtonProps: { danger: action === 'disable' },
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await post<BatchTeacherResult>('/api/admin/teachers/batch', {
            action,
            ids: selectedTeachers.map((teacher) => teacher.id),
          });
          message.success(
            action === 'enable' ? `已启用 ${result.affected} 位教师` : `已停用 ${result.affected} 位教师`,
          );
          setSelectedRowKeys([]);
          await load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '批量操作失败');
        }
      },
    });
  }

  const columns: TableProps<ManagedTeacher>['columns'] = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 190,
      render: (_, row) => (
        <div className="flex items-center gap-2.5">
          <Avatar
            size={30}
            style={{
              background: row.isActive ? '#f1ecff' : '#f1f3f8',
              color: row.isActive ? '#5b3bc0' : '#98a1b3',
              fontSize: 12,
            }}
          >
            {row.name.slice(0, 1)}
          </Avatar>
          <div className="min-w-0">
            <div
              className={
                row.isActive
                  ? 'truncate text-[13px] font-medium text-[#26304a]'
                  : 'truncate text-[13px] font-medium text-[#98a1b3]'
              }
            >
              {row.name}
            </div>
            {row.username !== row.phone ? (
              <div className="truncate text-[10.5px] text-[#a2aabc]">账号 {row.username}</div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      width: 150,
      render: (value: string | null) =>
        value ? (
          <span className="font-mono text-[12.5px] text-[#4b5670]">{value}</span>
        ) : (
          <Pill tone="amber">待补全</Pill>
        ),
    },
    {
      title: '登录状态',
      width: 112,
      render: (_, row) =>
        row.isActive ? <Pill tone="green">已启用</Pill> : <Pill tone="red">已停用</Pill>,
    },
    {
      title: '考试',
      width: 90,
      render: (_, row) => (
        <span className="tabular-nums text-[#5b6684]">{row.examCount > 0 ? `${row.examCount} 场` : '—'}</span>
      ),
    },
    {
      title: '学生答卷',
      width: 100,
      render: (_, row) => (
        <span className="tabular-nums text-[#5b6684]">
          {row.submissionCount > 0 ? `${row.submissionCount} 份` : '—'}
        </span>
      ),
    },
    {
      title: '创建时间',
      width: 140,
      render: (_, row) => (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {formatDate(row.createdAt)}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 132,
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'reset', label: '重置密码', icon: <KeyOutlined /> },
                {
                  key: 'toggle',
                  label: row.isActive ? '停用账号' : '启用账号',
                  icon: row.isActive ? <StopOutlined /> : <CheckCircleOutlined />,
                },
                { type: 'divider' },
                { key: 'delete', label: '删除教师', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'reset') resetPassword(row);
                if (key === 'toggle') void toggleActive(row);
                if (key === 'delete') removeTeacher(row);
              },
            }}
          >
            <Button
              size="small"
              type="text"
              icon={<MoreOutlined />}
              aria-label={`${row.name} 更多操作`}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  if (!overview) {
    return (
      <Page>
        <PageHeader title="教师账号" />
        {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}
        <Skeleton active paragraph={{ rows: 10 }} />
      </Page>
    );
  }

  const hasTeachers = teachers.length > 0;
  const enableRate = overview.total ? Math.round((overview.active / overview.total) * 100) : 0;
  const activeWidth = overview.total ? (overview.active / overview.total) * 100 : 0;
  const inactiveWidth = overview.total ? (overview.inactive / overview.total) * 100 : 0;

  return (
    <Page>
      <PageHeader
        title="教师账号"
        extra={
          <Button type="primary" icon={<UserAddOutlined />} onClick={openAdd}>
            新增教师
          </Button>
        }
      />

      {error ? <Alert type="error" showIcon message={error} className="mb-4" /> : null}

      <section className="admin-overview mb-5">
        <div className="admin-overview-main">
          <div className="admin-overview-head">
            <span className="admin-overview-badge">
              <UserSwitchOutlined />
            </span>
            <span className="admin-overview-label">教师账号</span>
          </div>
          <div className="admin-overview-total">
            <span className="admin-overview-total-value">{overview.total}</span>
            <span className="admin-overview-total-unit">位</span>
          </div>
        </div>

        <div className="admin-overview-ring">
          <Progress
            type="dashboard"
            percent={enableRate}
            size={150}
            strokeWidth={7}
            gapDegree={72}
            strokeColor="#6d4ad8"
            trailColor="#eef1f8"
            format={(percent) => (
              <div className="admin-overview-ring-center">
                <div className="admin-overview-ring-value">
                  {percent}
                  <span>%</span>
                </div>
                <div className="admin-overview-ring-label">启用率</div>
              </div>
            )}
          />
        </div>

        <div className="admin-overview-side">
          <div className="admin-overview-stat is-active">
            <div className="admin-overview-stat-head">
              <span>已启用</span>
              <CheckCircleOutlined />
            </div>
            <div className="admin-overview-stat-value">
              {overview.active}
              <span>位</span>
            </div>
            <div className="admin-overview-bar">
              <span style={{ width: `${activeWidth}%` }} />
            </div>
          </div>
          <div className="admin-overview-stat is-inactive">
            <div className="admin-overview-stat-head">
              <span>已停用</span>
              <StopOutlined />
            </div>
            <div className="admin-overview-stat-value">
              {overview.inactive}
              <span>位</span>
            </div>
            <div className="admin-overview-bar">
              <span style={{ width: `${inactiveWidth}%` }} />
            </div>
          </div>
        </div>
      </section>

      <Card
        title="教师列表"
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              共 {filtered.length} 位
            </Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
          </div>
        }
        styles={{ body: { padding: 16 } }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#f8f9fd] px-3 py-2.5">
          <Segmented
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}
            options={[
              { label: `全部（${teachers.length}）`, value: 'all' },
              { label: `已启用（${overview.active}）`, value: 'active' },
              { label: `已停用（${overview.inactive}）`, value: 'inactive' },
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined className="text-[#98a1b3]" />}
            placeholder="搜索姓名或手机号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 230 }}
          />
          {keyword || statusFilter !== 'all' ? (
            <Button
              size="small"
              type="text"
              onClick={() => {
                setKeyword('');
                setStatusFilter('all');
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </div>

        {hasTeachers ? (
          <div className="teacher-table overflow-hidden rounded-xl border border-[#eceff6]">
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={filtered}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              pagination={{
                pageSize: 12,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 位教师`,
                style: { margin: '12px 16px' },
              }}
              scroll={{ x: 1000 }}
              locale={{ emptyText: <Empty description="当前筛选下没有教师" /> }}
              onRow={(record) => ({
                onDoubleClick: () => openEdit(record),
                style: { cursor: 'default', opacity: record.isActive ? 1 : 0.72 },
              })}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#dfe5f0] bg-[#fbfcff]">
            <EmptyState
              icon={<UserSwitchOutlined />}
              title="还没有教师账号"
              description="教师无法自行注册。请新增教师，系统会用手机号生成登录账号，初始密码就是手机号。"
              action={
                <Button type="primary" icon={<UserAddOutlined />} onClick={openAdd}>
                  新增教师
                </Button>
              }
            />
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? '编辑教师' : '新增教师'}
        okText={editing ? '保存' : '创建账号'}
        cancelText="取消"
        confirmLoading={saving}
        onOk={saveTeacher}
        onCancel={() => setModalOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label="教师姓名"
            name="name"
            rules={[{ required: true, message: '请输入教师姓名' }, { max: 40 }]}
          >
            <Input placeholder="例如：张老师" autoFocus />
          </Form.Item>
          <Form.Item
            label="手机号"
            name="phone"
            rules={[
              ...(editing ? [] : [{ required: true, message: '请输入手机号' }]),
              { pattern: PHONE_RULE, message: '请输入 11 位手机号' },
            ]}
          >
            <Input placeholder="例如：13800000001" className="font-mono" maxLength={11} />
          </Form.Item>
        </Form>
      </Modal>

      {selectedRowKeys.length ? (
        <div className="batch-dock" role="region" aria-label="教师批量操作">
          <div className="flex items-center gap-2.5">
            <span className="batch-dock-count">{selectedRowKeys.length}</span>
            <span className="text-[12.5px] font-medium text-[#4b5670]">已选择教师</span>
          </div>
          <div className="batch-dock-actions">
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => batch('enable')}>
              批量启用
            </Button>
            <Button size="small" icon={<StopOutlined />} onClick={() => batch('disable')}>
              批量停用
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => batch('delete')}>
              批量删除
            </Button>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label="取消选择"
            onClick={() => setSelectedRowKeys([])}
          />
        </div>
      ) : null}
    </Page>
  );
}
