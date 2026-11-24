import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Avatar, Button, Drawer, Input, Modal, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { patch, post } from '../../api';
import type { AnalyticsMeta, StudentInfo } from '../../../shared/types';
import { Pill } from '../../ui';

const { Text } = Typography;

export function ClassSettingsDrawer({
  open,
  meta,
  onClose,
  onChanged,
}: {
  open: boolean;
  meta: AnalyticsMeta | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<StudentInfo[]>([]);
  const [keyword, setKeyword] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && meta) setRows(meta.students);
  }, [open, meta]);

  useEffect(() => {
    if (open) setKeyword('');
  }, [open]);

  const filtered = useMemo(() => {
    const text = keyword.trim();
    if (!text) return rows;
    return rows.filter(
      (student) => student.name.includes(text) || student.studentNo.includes(text) || (student.className ?? '').includes(text),
    );
  }, [rows, keyword]);

  const counts = useMemo(() => {
    const map = new Map<number | null, number>();
    for (const row of rows) map.set(row.classId ?? null, (map.get(row.classId ?? null) ?? 0) + 1);
    return map;
  }, [rows]);

  async function changeClass(student: StudentInfo, classId: number) {
    setSavingId(student.id);
    try {
      await patch(`/api/teacher/students/${student.id}`, { classId });
      const className = meta?.classes.find((item) => item.id === classId)?.name ?? null;
      setRows((prev) => prev.map((row) => (row.id === student.id ? { ...row, classId, className } : row)));
      message.success(`${student.name} 已调整到 ${className ?? '新班级'}`);
      onChanged();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '调整失败');
    } finally {
      setSavingId(null);
    }
  }

  async function createClass() {
    const name = newName.trim();
    if (!name) {
      message.warning('请填写班级名称');
      return;
    }
    setCreating(true);
    try {
      await post('/api/teacher/classes', { name });
      message.success(`已创建 ${name}`);
      setCreateOpen(false);
      setNewName('');
      onChanged();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }

  const columns: TableProps<StudentInfo>['columns'] = [
    {
      title: '学生',
      dataIndex: 'name',
      render: (_, row) => (
        <div className="flex items-center gap-2.5">
          <Avatar size={28} style={{ background: '#eef2ff', color: '#3358e8', fontSize: 12 }}>
            {row.name.slice(0, 1)}
          </Avatar>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-[#26304a]">{row.name}</div>
            <div className="text-[10.5px] text-[#98a1b3]">学号 {row.studentNo || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      title: '当前班级',
      width: 180,
      render: (_, row) => (
        <Select
          size="small"
          value={row.classId ?? undefined}
          placeholder="未分班"
          loading={savingId === row.id}
          disabled={savingId === row.id}
          style={{ width: '100%' }}
          onChange={(value) => void changeClass(row, value)}
          options={(meta?.classes ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
      ),
    },
    {
      title: '状态',
      width: 90,
      render: (_, row) =>
        row.classId ? <Pill tone="teal">已分班</Pill> : <Pill tone="amber">待分班</Pill>,
    },
  ];

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width="min(640px, 100vw)"
        title={
          <span className="flex items-center gap-2">
            <TeamOutlined className="text-[#3358e8]" />
            班级设置
          </span>
        }
        destroyOnHidden
        styles={{ body: { padding: 20, background: '#f7f9fd' } }}
      >
        <div className="mb-4 rounded-2xl border border-[#e9ecf4] bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 text-[12.5px] leading-6 text-[#7b86a0]">
              班级是统计与对比的基础维度。调整后立即生效，学生下次刷新页面即可看到新班级。
            </div>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建班级
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(meta?.classes ?? []).map((item) => (
              <Pill key={item.id} tone="blue">
                {item.name} · {counts.get(item.id) ?? 0} 人
              </Pill>
            ))}
          </div>
        </div>

        <Input
          allowClear
          prefix={<SearchOutlined className="text-[#98a1b3]" />}
          placeholder="搜索姓名、学号或班级"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="mb-3"
        />

        <div className="overflow-hidden rounded-2xl border border-[#e9ecf4] bg-white">
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={filtered}
            pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }}
            scroll={{ x: 440 }}
            locale={{ emptyText: <Text type="secondary">没有匹配的学生</Text> }}
          />
        </div>
      </Drawer>

      <Modal
        open={createOpen}
        title="新建班级"
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        onOk={createClass}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <div className="mb-4 text-[12.5px] leading-6 text-[#7b86a0]">
          创建后可在下方逐个学生选择该班级；班级会立即出现在学情看板的筛选与对比中。
        </div>
        <Input
          autoFocus
          maxLength={40}
          placeholder="例如：高一(4)班"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onPressEnter={() => void createClass()}
        />
      </Modal>
    </>
  );
}
