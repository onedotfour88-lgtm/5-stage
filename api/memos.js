import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://igumgbitelfytidliydi.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .eq('owner_id', user.id);

    if (error) {
      return res.status(500).json({ message: error.message });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { title, body } = req.body || {};
    const { data, error } = await supabase
      .from('memos')
      .insert([{ title, body, owner_id: user.id }])
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }
    return res.status(201).json(data[0]);
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}