import { sql } from "./client";
import { migrate } from "./migrate";

/**
 * Idempotent demo seed: ~10 users each with 1-2 types (tags + levels) and a
 * post, so the feed / search / matching pages have real data to render.
 * Re-running wipes previous demo rows (emails under @ong.demo) first.
 */

interface SeedType {
  title: string;
  level: number;
  daysLeft: number;
  tags: string[];
  desc: string;
}
interface SeedUser {
  email: string;
  name: string;
  bio: string;
  age: number;
  location: string;
  types: SeedType[];
  post: string;
}

const USERS: SeedUser[] = [
  {
    email: "aof@ong.demo", name: "อ๊อฟ", bio: "มือกีตาร์บลูส์ ตามหาวงซ้อม", age: 27, location: "กรุงเทพมหานคร",
    types: [{ title: "เล่นกีตาร์ไฟฟ้า", level: 62, daysLeft: 21, tags: ["กีตาร์", "ดนตรี", "บลูส์"], desc: "เล่น blues/rock มา 8 ปี สาย fingerstyle + bending" }],
    post: "เพิ่งอัดคัฟเวอร์ SRV เสร็จ ใครสายบลูส์มาแจมกันบ้าง 🎸",
  },
  {
    email: "mint@ong.demo", name: "มิ้นต์", bio: "คอกาแฟ specialty ชงเองทุกเช้า", age: 25, location: "เชียงใหม่",
    types: [{ title: "กาแฟ specialty", level: 48, daysLeft: 18, tags: ["กาแฟ", "เครื่องดื่ม", "ชง"], desc: "ดริปเอง คั่วเอง ตามหาเมล็ดใหม่ๆทุกเดือน" }],
    post: "วันนี้ลองเมล็ด Ethiopia washed หอมดอกไม้มาก ☕",
  },
  {
    email: "beam@ong.demo", name: "บีม", bio: "สายเกมยิงปืน ปั้นแรงค์อยู่", age: 22, location: "นนทบุรี",
    types: [{ title: "เกม FPS ยิงปืน", level: 84, daysLeft: 12, tags: ["เกม", "esports", "fps"], desc: "Valorant Immortal, aim train ทุกวัน" }],
    post: "แรงค์ขึ้น Immortal 2 แล้ว! หาทีม 5 คนลงแข่ง 🎮",
  },
  {
    email: "praew@ong.demo", name: "แพรว", bio: "นักวิ่งเทรล ชอบขึ้นดอย", age: 30, location: "เชียงใหม่",
    types: [{ title: "วิ่งเทรล", level: 55, daysLeft: 26, tags: ["วิ่ง", "กีฬา", "เทรล", "ออกกำลังกาย"], desc: "ลงเทรล 25k มาหลายสนาม เทรนตาม HR zone" }],
    post: "อาทิตย์นี้ไปซ้อมดอยสุเทพ ใครไปด้วยทักมา 🏃‍♀️",
  },
  {
    email: "guy@ong.demo", name: "กาย", bio: "มือกลอง สายร็อค", age: 28, location: "กรุงเทพมหานคร",
    types: [{ title: "ตีกลองชุด", level: 40, daysLeft: 20, tags: ["กลอง", "ดนตรี", "ร็อค"], desc: "ตีกลองมา 5 ปี ชอบแนว rock/metal" }],
    post: "หาวงร็อคซ้อมแถวลาดพร้าว มีมือกีตาร์มั้ย 🥁",
  },
  {
    email: "fah@ong.demo", name: "ฟ้า", bio: "สายปลูกกระบองเพชร", age: 26, location: "กรุงเทพมหานคร",
    types: [{ title: "กระบองเพชร & ไม้อวบน้ำ", level: 33, daysLeft: 15, tags: ["ต้นไม้", "กระบองเพชร", "ปลูกต้นไม้"], desc: "สะสม succulent พันธุ์หายาก ดูแลเอง" }],
    post: "Echeveria ออกดอกแล้ว ดีใจมากกก 🌵",
  },
  {
    email: "ton@ong.demo", name: "ต้น", bio: "ถ่ายภาพฟิล์ม", age: 31, location: "กรุงเทพมหานคร",
    types: [{ title: "ถ่ายภาพฟิล์ม", level: 70, daysLeft: 24, tags: ["ถ่ายภาพ", "ฟิล์ม", "ศิลปะ"], desc: "ถ่าย 35mm ล้างเอง สแกนเอง สาย street" }],
    post: "โรลนี้ถ่าย Portra 400 แสงเย็นๆสวยมาก 📷",
  },
  {
    email: "nam@ong.demo", name: "น้ำ", bio: "อนิเมะทุกซีซั่น", age: 23, location: "ปทุมธานี",
    types: [{ title: "อนิเมะ & มังงะ", level: 58, daysLeft: 9, tags: ["อนิเมะ", "การ์ตูน", "มังงะ"], desc: "ดูมาเป็นร้อยเรื่อง สาย seinen" }],
    post: "ซีซั่นนี้เรื่องไหนห้ามพลาดบ้าง แนะนำหน่อย 🍥",
  },
  {
    email: "ice@ong.demo", name: "ไอซ์", bio: "เล่นกีตาร์โปร่ง แต่งเพลง", age: 24, location: "ขอนแก่น",
    types: [{ title: "กีตาร์โปร่ง & แต่งเพลง", level: 45, daysLeft: 28, tags: ["กีตาร์", "ดนตรี", "แต่งเพลง"], desc: "fingerstyle + แต่งเพลงเอง ลง cover ประจำ" }],
    post: "แต่งเพลงใหม่เสร็จแล้ว เนื้อเกี่ยวกับเชียงใหม่ 🎶",
  },
  {
    email: "poon@ong.demo", name: "ปุณ", bio: "คนรักหมา อาสาบ้านพักพิง", age: 29, location: "กรุงเทพมหานคร",
    types: [{ title: "รักหมา & อาสาช่วยสัตว์", level: 66, daysLeft: 17, tags: ["หมา", "สัตว์เลี้ยง", "อาสา"], desc: "เลี้ยง 3 ตัว ช่วยบ้านพักพิงทุกเสาร์" }],
    post: "วันนี้พาน้องหมาจากศูนย์ไปหาบ้านใหม่ได้ 2 ตัว 🐶",
  },
];

/** Shared password for every demo account (login: <email> / DEMO_PASSWORD). */
export const DEMO_PASSWORD = "ongmatch123";

async function seed() {
  await migrate();
  // Wipe previous demo data (cascade cleans types/tags/quizzes/posts/follows).
  await sql`delete from users where email like ${"%@ong.demo"}`;

  const passwordHash = await Bun.password.hash(DEMO_PASSWORD);
  const ids: string[] = [];
  for (const u of USERS) {
    const [row] = await sql<{ id: string }[]>`
      insert into users (email, password_hash, display_name, bio, age, location, activity_level)
      values (${u.email}, ${passwordHash}, ${u.name}, ${u.bio}, ${u.age}, ${u.location}, 'HIGH')
      returning id`;
    ids.push(row.id);
    let firstTypeId: string | null = null;
    for (const t of u.types) {
      const [tr] = await sql<{ id: string }[]>`
        insert into types (user_id, title, description, level, expires_at)
        values (${row.id}, ${t.title}, ${t.desc}, ${t.level}, now() + ${`${t.daysLeft} days`}::interval)
        returning id`;
      firstTypeId = firstTypeId ?? tr.id;
      if (t.tags.length) {
        await sql`insert into type_tags ${sql(t.tags.map((tag) => ({ type_id: tr.id, tag })))} on conflict do nothing`;
      }
    }
    await sql`insert into posts (user_id, content, type_id) values (${row.id}, ${u.post}, ${firstTypeId})`;
  }

  // A few follow edges among demo users so the graph isn't empty.
  await sql`insert into follows (follower_id, followee_id) values (${ids[0]}, ${ids[8]}), (${ids[8]}, ${ids[0]}), (${ids[2]}, ${ids[3]}) on conflict do nothing`;

  console.log(`seeded ${USERS.length} demo users (login: ${USERS[0].email} / ${DEMO_PASSWORD})`);
}

if (import.meta.main) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
