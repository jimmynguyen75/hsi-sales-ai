/**
 * Smoke test: send an email via the preview transport (no SMTP env needed)
 * and confirm a RFC822 message comes back.
 */
import { sendEmail, getEmailMode } from "../src/services/email-send.js";

console.log(`Mode: ${getEmailMode()}`);

const res = await sendEmail({
  to: "sales@bidv.com.vn",
  subject: "[HSI] Đề xuất giải pháp bảo mật core banking",
  body: `Kính gửi anh/chị,

HSI (HPT Vietnam) xin gửi đề xuất giải pháp bảo mật core banking theo buổi làm việc tuần trước.

Các nội dung chính:
- Firewall Palo Alto PA-5450 cho perimeter
- CrowdStrike Falcon cho endpoint protection
- Lộ trình triển khai 3 tháng

Chi tiết xem file đính kèm. Mong anh/chị phản hồi.

Trân trọng,
HSI Sales Team`,
});

console.log(`✓ messageId: ${res.messageId}`);
console.log(`  mode: ${res.mode}`);
console.log(`  accepted: ${JSON.stringify(res.accepted)}`);
if (res.previewMessage) {
  console.log(`\n--- PREVIEW (first 800 chars) ---`);
  console.log(res.previewMessage.slice(0, 800));
}
