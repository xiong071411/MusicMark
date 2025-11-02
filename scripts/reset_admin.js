import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, findUserByUsername, createUser, updateUserPassword } from '../src/services/db.js';

function parseArg(key, def) {
  const hit = process.argv.find(a => a.startsWith(`--${key}=`));
  if (!hit) return def;
  return hit.slice(key.length + 3);
}

async function main() {
  const username = parseArg('username', process.env.ADMIN_USERNAME || 'admin');
  const password = parseArg('password', process.env.ADMIN_PASSWORD || 'admin123');
  if (!password || password.length < 3) {
    // eslint-disable-next-line no-console
    console.error('密码必须至少 3 个字符。使用 --password=xxx 指定新密码');
    process.exit(2);
  }

  await initDatabase();
  let user = await findUserByUsername(username);
  if (!user) {
    // eslint-disable-next-line no-console
    console.log(`未找到用户 ${username}，即将创建管理员用户...`);
    await createUser(username, password, 'admin');
    // eslint-disable-next-line no-console
    console.log(`已创建管理员 ${username}，密码已设置。请尽快登录并修改密码。`);
    process.exit(0);
  }

  await updateUserPassword(user.id, password);
  // eslint-disable-next-line no-console
  console.log(`已重置管理员 ${username} 的密码。`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


