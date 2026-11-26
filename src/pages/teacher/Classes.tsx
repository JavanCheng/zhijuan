import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Segmented,
  Select,
  Skeleton,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { TableProps, UploadProps } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UploadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { api, del, patch, post } from '../../api';
import type {
  ManagedClass,
  ManagedStudent,
  RosterImportResult,
  RosterOverview,
} from '../../../shared/types';
import { EmptyState, IconButton, Page, PageHeader, Pill, StatCard } from '../../ui';
import { formatDate } from '../../format';

const { Text } = Typography;

interface StudentForm {
  name: string;
  studentNo: string;
  classId: number;
}

interface ClassForm {
  name: string;
}

export function TeacherClasses() {
  const { message, modal } = AntApp.useApp();
  const [overview, setOverview] = useState<RosterOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [classFilter, setClassFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [studentForm] = Form.useForm<StudentForm>();
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<ManagedStudent | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);

  const [classForm] = Form.useForm<ClassForm>();
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ManagedClass | null>(null);
  const [savingClass, setSavingClass] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<RosterImportResult | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    try {
      const data = await api<RosterOverview>('/api/teacher/classes/overview');
      if (!isCurrent()) return;
      setOverview(data);
      setLoadFailed(false);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadFailed(true);
      void message.error({ key: 'teacher-roster-load', content: err instanceof Error ? err.message : '加载失败' });
    }
  }, [message]);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  const classScopedStudents = useMemo(
    () =>
      (overview?.students ?? []).filter(
        (student) => classFilter === 'all' || student.classId === classFilter,
      ),
    [overview, classFilter],
  );

  const filteredStudents = useMemo(() => {
    const text = keyword.trim();
    return classScopedStudents.filter((student) => {
      if (statusFilter === 'active' && !student.isActive) return false;
      if (statusFilter === 'inactive' && student.isActive) return false;
      if (text && !student.name.includes(text) && !student.studentNo.includes(text)) return false;
      return true;
    });
  }, [classScopedStudents, statusFilter, keyword]);

  function openAddStudent() {
    setEditingStudent(null);
    studentForm.resetFields();
    const defaultClass = classFilter !== 'all' ? classFilter : overview?.classes[0]?.id;
    studentForm.setFieldsValue({ classId: defaultClass });
    setStudentModalOpen(true);
  }

  function openEditStudent(student: ManagedStudent) {
    setEditingStudent(student);
    studentForm.setFieldsValue({
      name: student.name,
      studentNo: student.studentNo,
      classId: student.classId ?? overview?.classes[0]?.id,
    });
    setStudentModalOpen(true);
  }

  async function saveStudent() {
    const values = await studentForm.validateFields();
    setSavingStudent(true);
    try {
      if (editingStudent) {
        await patch(`/api/teacher/students/${editingStudent.id}`, {
          name: values.name.trim(),
          studentNo: values.studentNo.trim(),
          classId: values.classId,
        });
        message.success('学生信息已更新');
      } else {
        await post('/api/teacher/students', {
          name: values.name.trim(),
          studentNo: values.studentNo.trim(),
          classId: values.classId,
        });
        message.success('学生已添加');
      }
      setStudentModalOpen(false);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingStudent(false);
    }
  }

  async function toggleStudentActive(student: ManagedStudent) {
    try {
      await patch(`/api/teacher/students/${student.id}`, { isActive: !student.isActive });
      message.success(student.isActive ? '已停用该学生登录' : '已恢复该学生登录');
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  }

  function removeStudent(student: ManagedStudent) {
    modal.confirm({
      title: student.submissionCount > 0 ? '停用学生账号' : '删除学生',
      content:
        student.submissionCount > 0
          ? `${student.name} 已有 ${student.submissionCount} 份作答记录，将停用登录并保留历史成绩；确定继续吗？`
          : `确定删除 ${student.name}（${student.studentNo}）吗？删除后可以重新导入。`,
      okText: student.submissionCount > 0 ? '停用' : '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await del<{ deactivated?: boolean; deleted?: boolean }>(
            `/api/teacher/students/${student.id}`,
          );
          if (result.deactivated) message.info('该学生已有作答记录，已停用登录');
          else message.success('学生已删除');
          await load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '操作失败');
        }
      },
    });
  }

  function openCreateClass() {
    setEditingClass(null);
    classForm.resetFields();
    setClassModalOpen(true);
  }

  function openRenameClass(item: ManagedClass) {
    setEditingClass(item);
    classForm.setFieldsValue({ name: item.name });
    setClassModalOpen(true);
  }

  async function saveClass() {
    const values = await classForm.validateFields();
    setSavingClass(true);
    try {
      if (editingClass) {
        await patch(`/api/teacher/classes/${editingClass.id}`, { name: values.name.trim() });
        message.success('班级名称已更新');
      } else {
        await post('/api/teacher/classes', { name: values.name.trim() });
        message.success('班级已创建');
      }
      setClassModalOpen(false);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingClass(false);
    }
  }

  function removeClass(item: ManagedClass) {
    if (item.totalCount > 0) {
      void message.warning(`暂时不能删除班级：${item.name} 还有 ${item.totalCount} 名学生，请先把学生移到其他班级或停用后再删除。`);
      return;
    }
    modal.confirm({
      title: '删除班级',
      content: `确定删除空班级 ${item.name} 吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await del(`/api/teacher/classes/${item.id}`);
          message.success('班级已删除');
          if (classFilter === item.id) setClassFilter('all');
          await load();
        } catch (err) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  }

  function openImport() {
    setImportResult(null);
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    setImportResult(null);
  }

  const uploadProps: UploadProps = {    accept: '.xlsx,.xls,.csv',
    showUploadList: false,
    maxCount: 1,
    disabled: importing,
    customRequest: async ({ file, onSuccess, onError }) => {
      const form = new FormData();
      form.append('file', file as File);
      setImporting(true);
      setImportResult(null);
      try {
        const result = await api<RosterImportResult>('/api/teacher/students/import', {
          method: 'POST',
          body: form,
        });
        setImportResult(result);
        if (result.ok) {
          message.success(
            `导入完成：新建 ${result.summary.studentsCreated} 人，更新 ${result.summary.studentsUpdated} 人`,
          );
          setClassFilter('all');
          setStatusFilter('all');
          setKeyword('');
          await load();
        }
        onSuccess?.({});
      } catch (err) {
        const text = err instanceof Error ? err.message : '导入失败';
        message.error(text);
        onError?.(err as Error);
      } finally {
        setImporting(false);
      }
    },
  };

  const classColumns: TableProps<ManagedStudent>['columns'] = [
    {
      title: '学号',
      dataIndex: 'studentNo',
      width: 130,
      render: (value: string) => <span className="font-mono [overflow-wrap:anywhere] text-[12.5px] text-ui-secondary">{value || '—'}</span>,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 150,
      render: (_, row) => (
        <div className="flex items-center gap-2.5">
          <Avatar
            size={28}
            style={{
              background: row.isActive ? 'var(--ui-background-muted)' : 'var(--ui-background-muted)',
              color: row.isActive ? 'var(--ui-action-primary)' : 'var(--ui-content-tertiary)',
              fontSize: 12,
            }}
          >
            {row.name.slice(0, 1)}
          </Avatar>
          <span className={row.isActive ? 'min-w-0 [overflow-wrap:anywhere] text-[13px] font-medium text-ui-primary' : 'min-w-0 [overflow-wrap:anywhere] text-[13px] font-medium text-ui-tertiary'}>
            {row.name}
          </span>
        </div>
      ),
    },
    {
      title: '班级',
      dataIndex: 'className',
      width: 140,
      render: (value: string | null) => (value ? <Pill tone="teal">{value}</Pill> : <Pill tone="amber">未分班</Pill>),
    },
    {
      title: '登录状态',
      width: 110,
      render: (_, row) =>
        row.isActive ? <Pill tone="green">已启用</Pill> : <Pill tone="red">已停用</Pill>,
    },
    {
      title: '作答记录',
      width: 100,
      render: (_, row) => (
        <span className="tabular-nums text-ui-secondary">{row.submissionCount > 0 ? `${row.submissionCount} 份` : '—'}</span>
      ),
    },
    {
      title: '录入时间',
      width: 140,
      render: (_, row) => (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          {formatDate(row.createdAt)}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 118,
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditStudent(row)}>
            编辑
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'toggle',
                  label: row.isActive ? '停用登录' : '恢复登录',
                  icon: row.isActive ? <StopOutlined /> : <CheckCircleOutlined />,
                },
                { type: 'divider' },
                { key: 'delete', label: '删除学生', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'toggle') void toggleStudentActive(row);
                if (key === 'delete') removeStudent(row);
              },
            }}
          >
            <IconButton
              size="small"
              type="text"
              icon={<MoreOutlined />}
              label={`${row.name} 更多操作`}
              onClick={(event) => event.stopPropagation()}
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  const classCard = (item: ManagedClass) => (
    <div
      key={item.id}
      role="button"
      tabIndex={0}
      className={`roster-class-card ${classFilter === item.id ? 'is-active' : ''}`}
      onClick={() => setClassFilter(classFilter === item.id ? 'all' : item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setClassFilter(item.id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[14px] font-semibold text-ui-primary [overflow-wrap:anywhere]">{item.name}</div>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'rename', label: '重命名', icon: <EditOutlined /> },
              { key: 'delete', label: '删除班级', icon: <DeleteOutlined />, danger: true },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === 'rename') openRenameClass(item);
              if (key === 'delete') removeClass(item);
            },
          }}
        >
          <IconButton
            type="text"
            size="small"
            icon={<MoreOutlined />}
            label={`${item.name} 操作`}
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-1">
        <div>
          <span className="text-[22px] font-semibold leading-none text-ui-primary">{item.activeCount}</span>
          <span className="ml-1 text-[11.5px] text-ui-tertiary">名学生</span>
        </div>
        {item.inactiveCount > 0 ? <Pill tone="red">停用 {item.inactiveCount}</Pill> : null}
      </div>
      <div className="mt-2 text-[11px] text-ui-tertiary">
        {item.totalCount === 0 ? '暂无学生' : `共 ${item.totalCount} 人 · 点击筛选`}
      </div>
    </div>
  );

  if (!overview) {
    return (
      <Page>
        <PageHeader
          eyebrow="Roster"
          title="班级管理"
          subtitle="导入班级与学生名册，管理学生登录权限；只有名册中的学生可以登录。"
        />

        {loadFailed ? <EmptyState title="班级名单暂不可用" action={<Button onClick={() => void load()}>重试</Button>} /> : <Skeleton paragraph={{ rows: 10 }} />}
      </Page>
    );
  }

  const hasClasses = overview.classes.length > 0;
  const hasStudents = overview.students.length > 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Roster"
        title="班级管理"
        subtitle="支持 Excel / CSV 导入班级与学生；姓名 + 学号是学生登录的唯一凭证，未录入学生无法登录。"
        extra={
          <>
            <Button icon={<DownloadOutlined />} href="/api/teacher/students/template.xlsx" download>
              下载模板
            </Button>
            <Button icon={<UploadOutlined />} onClick={openImport}>
              导入名单
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={openAddStudent} disabled={!hasClasses}>
              添加学生
            </Button>
          </>
        }
      />


      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="班级数" value={overview.classes.length} suffix="个" icon={<TeamOutlined />} tone="blue" hint="按班级组织学生名册" />
        <StatCard label="学生总数" value={overview.totalStudents} suffix="人" icon={<UserAddOutlined />} tone="purple" hint={`未分班 ${overview.unassignedStudents} 人`} />
        <StatCard label="可登录学生" value={overview.activeStudents} suffix="人" icon={<CheckCircleOutlined />} tone="green" hint="姓名 + 学号可登录" />
        <StatCard label="已停用" value={overview.inactiveStudents} suffix="人" icon={<StopOutlined />} tone={overview.inactiveStudents ? 'amber' : 'gray'} hint="停用后无法登录" />
      </div>

      <Card
        className="mb-4"
        title="班级"
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={openCreateClass}>
            新建班级
          </Button>
        }
        styles={{ body: { padding: 16 } }}
      >
        {hasClasses ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <button
              type="button"
              className={`roster-class-card roster-class-all ${classFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setClassFilter('all')}
            >
              <div className="text-[14px] font-semibold text-ui-primary">全部学生</div>
              <div className="mt-3 flex items-end">
                <span className="text-[22px] font-semibold leading-none text-ui-primary">{overview.activeStudents}</span>
                <span className="ml-1 text-[11.5px] text-ui-tertiary">名可登录</span>
              </div>
              <div className="mt-2 text-[11px] text-ui-tertiary">共 {overview.totalStudents} 人</div>
            </button>
            {overview.classes.map(classCard)}
            <button type="button" className="roster-class-card roster-class-add" onClick={openCreateClass}>
              <PlusOutlined className="text-[18px] text-[var(--ui-action-primary)]" />
              <div className="mt-2 text-[12.5px] font-medium text-[var(--ui-action-primary)]">新建班级</div>
              <div className="mt-1 text-[11px] text-ui-tertiary">创建后即可导入学生</div>
            </button>
          </div>
        ) : (
          <EmptyState
            icon={<TeamOutlined />}
            title="还没有班级"
            description="先新建班级，或直接导入带「班级」列的 Excel 名单，系统会自动创建班级。"
            action={
              <>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateClass}>
                  新建班级
                </Button>
                <Button icon={<UploadOutlined />} onClick={openImport}>
                  导入名单
                </Button>
              </>
            }
          />
        )}
      </Card>

      <Card
        title="学生名册"
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              共 {filteredStudents.length} 人
            </Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
          </div>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-ui-line px-4 py-3">
          <Segmented className="max-w-full overflow-x-auto"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}
            options={[
              { label: `全部（${classScopedStudents.length}）`, value: 'all' },
              {
                label: `已启用（${classScopedStudents.filter((student) => student.isActive).length}）`,
                value: 'active',
              },
              {
                label: `已停用（${classScopedStudents.filter((student) => !student.isActive).length}）`,
                value: 'inactive',
              },
            ]}
          />
          <Select
            value={classFilter}
            onChange={setClassFilter}
            style={{ width: 160, maxWidth: '100%' }}
            options={[
              { value: 'all', label: '全部班级' },
              ...overview.classes.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined className="text-ui-tertiary" />}
            placeholder="搜索姓名或学号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 220, maxWidth: '100%' }}
          />
          {(keyword || classFilter !== 'all' || statusFilter !== 'all') ? (
            <Button
              size="small"
              type="text"
              onClick={() => {
                setKeyword('');
                setClassFilter('all');
                setStatusFilter('all');
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </div>

        {hasStudents ? (
          <Table
            rowKey="id"
            size="small"
            columns={classColumns}
            dataSource={filteredStudents}
            pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 名学生` }}
            scroll={{ x: 980 }}
            locale={{ emptyText: <Empty description="当前筛选下没有学生" /> }}
            onRow={(record) => ({
              onClick: () => openEditStudent(record),
              style: { cursor: 'pointer' },
            })}
          />
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<FileExcelOutlined />}
              title="名册还是空的"
              description="下载 Excel 模板，按「班级 / 姓名 / 学号」填写后导入；也可以先新建班级再逐个添加学生。"
              action={
                <>
                  <Button icon={<DownloadOutlined />} href="/api/teacher/students/template.xlsx" download>
                    下载模板
                  </Button>
                  <Button type="primary" icon={<UploadOutlined />} onClick={openImport}>
                    导入名单
                  </Button>
                </>
              }
            />
          </div>
        )}
      </Card>

      <Modal
        open={studentModalOpen}
        title={editingStudent ? '编辑学生' : '添加学生'}
        okText={editingStudent ? '保存' : '添加'}
        cancelText="取消"
        confirmLoading={savingStudent}
        onOk={saveStudent}
        onCancel={() => setStudentModalOpen(false)}
        destroyOnHidden
      >
        <div className="mb-4 text-[12.5px] leading-6 text-ui-secondary">
          姓名和学号是学生登录的凭证，学号在全校范围内唯一。
        </div>
        <Form form={studentForm} layout="vertical" requiredMark={false}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }, { max: 40 }]}>
            <Input placeholder="例如：李子涵" autoFocus />
          </Form.Item>
          <Form.Item
            label="学号"
            name="studentNo"
            rules={[{ required: true, message: '请输入学号' }, { max: 40 }]}
          >
            <Input placeholder="例如：20250301" className="font-mono" />
          </Form.Item>
          <Form.Item label="班级" name="classId" rules={[{ required: true, message: '请选择班级' }]}>
            <Select
              placeholder="选择班级"
              options={overview.classes.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={classModalOpen}
        title={editingClass ? '重命名班级' : '新建班级'}
        okText={editingClass ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={savingClass}
        onOk={saveClass}
        onCancel={() => setClassModalOpen(false)}
        destroyOnHidden
      >
        <Form form={classForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="班级名称"
            name="name"
            rules={[{ required: true, message: '请输入班级名称' }, { max: 40 }]}
          >
            <Input placeholder="例如：高一(4)班" autoFocus onPressEnter={() => void saveClass()} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        title="导入班级与学生"
        width="min(720px, 94vw)"
        onCancel={closeImport}
        footer={[
          <Button
            key="template"
            icon={<DownloadOutlined />}
            href="/api/teacher/students/template.xlsx"
            download
          >
            下载模板
          </Button>,
          <Button key="close" type="primary" onClick={closeImport}>
            完成
          </Button>,
        ]}
        destroyOnHidden
      >
        <div className="mb-4 rounded-xl bg-ui-subtle px-4 py-3 text-[12px] leading-6 text-ui-secondary">
          支持 <strong>.xlsx / .xls / .csv</strong>。表头需包含
          <strong> 班级、姓名、学号 </strong>；也支持每个工作表就是一个班级，表头写姓名和学号即可。
          学号重复会自动更新姓名与班级，同一文件内学号不能重复。
        </div>

        <Upload.Dragger {...uploadProps} style={{ background: 'var(--ui-surface-subtle)' }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{importing ? '正在导入…' : '把名单文件拖到这里，或点击选择'}</p>
          <p className="ant-upload-hint">导入成功后可直接使用姓名 + 学号登录；已停用的学生会被重新启用。</p>
        </Upload.Dragger>

        {importResult ? (
          <div className="mt-4">
            <Alert
              type={importResult.ok ? 'success' : 'error'}
              showIcon
              message={
                importResult.ok
                  ? `导入完成：读取 ${importResult.summary.rowsRead} 行，新建 ${importResult.summary.studentsCreated} 人，更新 ${importResult.summary.studentsUpdated} 人`
                  : `导入未执行：发现 ${importResult.errors.length} 处错误`
              }
              description={
                importResult.ok
                  ? `新建班级 ${importResult.summary.classesCreated} 个；重新启用 ${importResult.summary.studentsReactivated} 人。`
                  : '请修正文件后重新导入，本次没有写入任何数据。'
              }
            />

            {importResult.errors.length ? (
              <div className="mt-3 max-h-[220px] overflow-auto rounded-xl border border-[var(--ui-status-danger-accent)] bg-[var(--ui-status-danger-bg)] p-3 [overflow-wrap:anywhere]">
                {importResult.errors.map((item, index) => (
                  <div key={index} className="text-[12px] leading-6 text-[var(--ui-status-danger-text)]">
                    {item.sheet ? `${item.sheet} ` : ''}
                    {item.row > 0 ? `第 ${item.row} 行：` : ''}
                    {item.message}
                  </div>
                ))}
              </div>
            ) : null}

            {importResult.warnings.length ? (
              <div className="mt-3 max-h-[160px] overflow-auto rounded-xl border border-[var(--ui-status-warning-accent)] bg-[var(--ui-status-warning-bg)] p-3 [overflow-wrap:anywhere]">
                {importResult.warnings.map((item, index) => (
                  <div key={index} className="text-[12px] leading-6 text-[var(--ui-status-warning-text)]">
                    {item.sheet ? `${item.sheet} ` : ''}
                    {item.row > 0 ? `第 ${item.row} 行：` : ''}
                    {item.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Page>
  );
}
