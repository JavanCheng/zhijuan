import { useRef, useState } from 'react';
import { Alert, App, Form, Input, Modal } from 'antd';
import { post } from '../../api';

interface PasswordFields {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [form] = Form.useForm<PasswordFields>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function change({ currentPassword, newPassword }: PasswordFields) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await post('/api/auth/teacher/change-password', { currentPassword, newPassword });
      form.resetFields();
      void message.success('密码已修改，下次请使用新密码登录');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败，请重试');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal open title="修改密码" okText="保存新密码" cancelText="取消" confirmLoading={saving}
      onOk={() => form.submit()} onCancel={() => { if (!pending.current) onClose(); }}
      mask={{ closable: !saving }} keyboard={!saving} closable={!saving} cancelButtonProps={{ disabled: saving }}>
      <Form form={form} layout="vertical" disabled={saving} onFinish={change} onValuesChange={() => setError('')}>
        <Form.Item label="当前密码" name="currentPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Form.Item label="新密码" name="newPassword" extra="使用 8–128 个字符，不要使用手机号作为密码。" rules={[
          { required: true, whitespace: true, message: '请输入新密码' },
          { min: 8, max: 128, message: '新密码须为 8–128 个字符' },
        ]}>
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        <Form.Item label="确认新密码" name="confirmPassword" dependencies={['newPassword']} rules={[
          { required: true, message: '请再次输入新密码' },
          ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('newPassword')
            ? Promise.resolve() : Promise.reject(new Error('两次输入的新密码不一致')) }),
        ]}>
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </Form>
    </Modal>
  );
}
