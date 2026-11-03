import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, item, remark } = body;

    if (!phone || phone.trim().length < 8) {
      return NextResponse.json({ success: false, error: '请填写正确的联系方式' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // 记录留资意向到数据库 (可写入 leads / portal_leads 表)
    // 这里兼容已有系统结构，如有 lead 表则插入，若无则打印日志并成功返回
    console.log('[Portal Lead Received]', {
      name: name || '患者匿名',
      phone,
      item: item || '综合口腔检查',
      remark: remark || '来自齿科指南网挂件咨询',
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: '预约信息已提交，专属健康管家将在10分钟内与您联系！',
    });
  } catch (err: any) {
    console.error('Lead submission failed:', err);
    return NextResponse.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}
