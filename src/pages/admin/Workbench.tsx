import './workbench.css';
import { useEffect, useState } from 'react';
import { ArrowRightOutlined, CheckCircleOutlined, HistoryOutlined, IdcardOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Skeleton } from 'antd';
import { Link } from 'react-router-dom';
import type { AdminRecentAction, AdminWorkbench } from '../../../shared/types';
import { api } from '../../api';
import { formatDate } from '../../format';
import { EmptyState, Page, PageHeader } from '../../ui';

const ACTION_LABELS: Record<AdminRecentAction['action'], string> = {
  create_teacher: '创建教师账号',
  update_teacher: '更新教师信息',
  enable_teacher: '启用教师账号',
  disable_teacher: '停用教师账号',
  reset_teacher_password: '重置教师密码',
  delete_teacher: '删除教师账号',
  batch_enable_teacher: '批量启用教师',
  batch_disable_teacher: '批量停用教师',
  batch_delete_teacher: '批量删除教师',
};

export function AdminWorkbenchPage() {
  const [result, setResult] = useState<AdminWorkbench | null>(null);
  const [failed, setFailed] = useState(false);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    let ignore = false;
    void api<AdminWorkbench>('/api/admin/workbench').then(
      (data) => { if (!ignore) setResult(data); },
      () => { if (!ignore) setFailed(true); },
    );
    return () => { ignore = true; };
  }, [request]);

  return (
    <Page className="admin-workbench">
      <PageHeader
        title="管理员工作台"
        subtitle="查看需要处理的教师账号，以及最近的管理员操作。"
        extra={<Link to="/admin/teachers" className="admin-workbench-primary"><TeamOutlined aria-hidden /> 教师账号管理 <ArrowRightOutlined aria-hidden /></Link>}
      />
      {failed ? (
        <Alert
          type="error"
          showIcon
          title="工作台暂不可用"
          description="你仍可前往教师账号页。"
          action={<Button size="small" onClick={() => { setFailed(false); setRequest((n) => n + 1); }}>重新加载</Button>}
        />
      ) : (
        <div className="admin-workbench-grid" aria-busy={!result}>
          <Card title="待处理事项">
            {!result ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : result.missingPhoneCount > 0 ? (
              <Link className="admin-workbench-task" to="/admin/teachers?missingPhone=1">
                <span className="admin-workbench-task-icon" aria-hidden><IdcardOutlined /></span>
                <span className="admin-workbench-task-text">
                  <strong>{result.missingPhoneCount} 位教师待补全手机号</strong>
                  <span>补全后，管理员才能为这些账号重置密码。</span>
                </span>
                <span className="admin-workbench-task-arrow" aria-hidden><ArrowRightOutlined /></span>
              </Link>
            ) : (
              <EmptyState icon={<CheckCircleOutlined />} title="暂无待处理事项" description="没有待补全手机号的教师账号。" />
            )}
          </Card>
          <Card title="最近管理员操作">
            {!result ? <Skeleton active title={false} paragraph={{ rows: 4 }} /> : result.recentActions.length ? (
              <ul className="admin-workbench-actions">
                {result.recentActions.map((entry) => (
                  <li key={entry.id} className="admin-workbench-action">
                    <div>
                      <strong>{ACTION_LABELS[entry.action]}</strong>
                      <span>{entry.actorName || '管理员'}{entry.teacherName ? ` · ${entry.teacherName}` : entry.affectedCount != null ? ` · ${entry.affectedCount} 位教师` : ''}</span>
                    </div>
                    <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<HistoryOutlined />} title="暂无操作记录" description="创建、修改或停用教师账号后，操作记录将显示在这里。" />
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
